/**
 * migrate.mts — Aplicador de migraciones SQL.
 *
 * El build de Netlify NO ejecuta migraciones automáticamente. Esta function
 * lee las carpetas de `netlify/database/migrations/`, lleva la cuenta en
 * una tabla `_migrations`, y aplica solo las pendientes.
 *
 * USO:
 *
 *   1ª vez (one-shot tras desplegar este archivo):
 *      Llama a https://imperio-contenido.netlify.app/api/migrate?modo=marcar-existentes
 *      Esto registra 0000_baseline y 0001_seed_data_supabase como YA APLICADAS
 *      sin ejecutar nada (porque sus tablas ya existen en la BD desde antes
 *      de tener este sistema).
 *
 *   Normal (para cualquier migración futura):
 *      Llama a https://imperio-contenido.netlify.app/api/migrate
 *      La function aplica las pendientes que encuentre en el repo.
 *      Devuelve JSON con: ya_aplicadas, recien_aplicadas, saltadas, errores.
 *
 * Auth: protegida por el site password de Netlify (configurado a nivel
 * proyecto). No requiere token adicional.
 *
 * Cómo añadir una migración futura:
 *   1. Crea `netlify/database/migrations/00NN_descripcion/migration.sql`
 *      con el SQL nuevo (usa CREATE TABLE IF NOT EXISTS y similares para
 *      que sea idempotente).
 *   2. Sube a GitHub. Netlify deploya.
 *   3. Abre /api/migrate en el navegador. Listo.
 */

import type { Context, Config } from "@netlify/functions";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../lib/db.js";

const MIGRATIONS_DIR = join(process.cwd(), "netlify/database/migrations");

// Migraciones que YA existían antes de instalar este sistema.
// La primera llamada con ?modo=marcar-existentes las registra como aplicadas
// sin ejecutar SQL (porque sus tablas ya están creadas en la BD real).
const PRE_EXISTENTES = ["0000_baseline", "0001_seed_data_supabase"];


function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * Divide un script SQL en statements individuales.
 *
 * Respeta:
 *   - Comentarios de línea  (-- ...)
 *   - Comentarios de bloque (slash-asterisk ... asterisk-slash)
 *   - Bloques dollar-quoted ($$ ... $$) usados en funciones plpgsql
 *
 * El `;` solo cuenta como separador cuando NO estamos dentro de un
 * comentario ni de un bloque $$.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollar = false;
  let inLineComment = false;
  let inBlockComment = false;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];

    if (inLineComment) {
      current += c;
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      current += c;
      if (c === "*" && n === "/") {
        current += "/";
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (c === "-" && n === "-") {
      inLineComment = true;
      current += "--";
      i += 2;
      continue;
    }

    if (c === "/" && n === "*") {
      inBlockComment = true;
      current += "/*";
      i += 2;
      continue;
    }

    if (c === "$" && n === "$") {
      current += "$$";
      inDollar = !inDollar;
      i += 2;
      continue;
    }

    if (c === ";" && !inDollar) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    current += c;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}


export default async (req: Request, _ctx: Context) => {
  try {
    // 1. Asegurar la tabla de control. Idempotente.
    await db.sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        nombre      text PRIMARY KEY,
        aplicada_at timestamptz DEFAULT now()
      )
    `;

    // 2. Listar carpetas de migración en orden alfabético (= cronológico).
    let folders: string[] = [];
    try {
      const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
      folders = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch (err) {
      return json(
        {
          error: "no_se_puede_leer_directorio",
          path: MIGRATIONS_DIR,
          mensaje: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }

    // 3. ¿Modo "marcar-existentes"? Registra las pre-existentes sin ejecutar.
    const url = new URL(req.url);
    const modo = url.searchParams.get("modo");

    if (modo === "marcar-existentes") {
      const marcadas: string[] = [];
      const ignoradas: string[] = [];

      for (const nombre of PRE_EXISTENTES) {
        if (folders.includes(nombre)) {
          await db.sql`
            INSERT INTO _migrations (nombre)
            VALUES (${nombre})
            ON CONFLICT (nombre) DO NOTHING
          `;
          marcadas.push(nombre);
        } else {
          ignoradas.push(nombre);
        }
      }

      return json({
        modo: "marcar-existentes",
        marcadas_como_aplicadas: marcadas,
        ignoradas_porque_no_existen_en_repo: ignoradas,
        siguiente_paso:
          "Llama a /api/migrate sin parámetros para aplicar las pendientes.",
      });
    }

    // 4. Modo normal: ejecutar pendientes.
    const aplicadasRows = await db.sql<{ nombre: string }>`
      SELECT nombre FROM _migrations
    `;
    const aplicadas = new Set(aplicadasRows.map((r) => r.nombre));

    const resultado: {
      ya_aplicadas: string[];
      recien_aplicadas: string[];
      saltadas: { nombre: string; razon: string }[];
      errores: { nombre: string; statement_preview: string; error: string }[];
    } = {
      ya_aplicadas: [],
      recien_aplicadas: [],
      saltadas: [],
      errores: [],
    };

    for (const folder of folders) {
      if (aplicadas.has(folder)) {
        resultado.ya_aplicadas.push(folder);
        continue;
      }

      const sqlPath = join(MIGRATIONS_DIR, folder, "migration.sql");

      let sqlText: string;
      try {
        sqlText = await readFile(sqlPath, "utf8");
      } catch (err) {
        resultado.saltadas.push({
          nombre: folder,
          razon:
            "No se pudo leer migration.sql: " +
            (err instanceof Error ? err.message : String(err)),
        });
        continue;
      }

      const statements = splitSqlStatements(sqlText);
      let fallo = false;

      for (const stmt of statements) {
        try {
          await db.sql.query(stmt);
        } catch (err) {
          resultado.errores.push({
            nombre: folder,
            statement_preview: stmt.slice(0, 240),
            error: err instanceof Error ? err.message : String(err),
          });
          fallo = true;
          break;
        }
      }

      if (!fallo) {
        await db.sql`
          INSERT INTO _migrations (nombre)
          VALUES (${folder})
          ON CONFLICT (nombre) DO NOTHING
        `;
        resultado.recien_aplicadas.push(folder);
      }
    }

    const status = resultado.errores.length > 0 ? 500 : 200;
    return json(resultado, status);
  } catch (err) {
    return json(
      {
        error: "fatal",
        mensaje: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
};

export const config: Config = {
  path: ["/api/migrate"],
};
