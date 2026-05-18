/**
 * migrate.mts — Aplicador de migraciones SQL.
 *
 * El build de Netlify NO ejecuta migraciones automáticamente. Esta function
 * lee las carpetas de `netlify/database/migrations/`, lleva la cuenta en
 * una tabla `_migrations`, y aplica solo las pendientes.
 *
 * MODOS (vía query param):
 *
 *   ?modo=marcar-existentes
 *      Registra 0000_baseline y 0001_seed_data_supabase como YA APLICADAS
 *      sin ejecutar nada. Solo se usa una vez tras instalar el sistema.
 *
 *   ?modo=diag
 *      Devuelve env keys (solo nombres), API disponible en db.sql, y
 *      las carpetas detectadas. Útil para depurar.
 *
 *   (sin modo)
 *      Aplica las migraciones pendientes.
 *
 * Auth: protegida por el site password de Netlify.
 *
 * Estrategia de ejecución (en este orden):
 *   1) Intenta `db.sql.unsafe(sqlEntero)` en una sola llamada. El cliente
 *      neon HTTP suele soportar multi-statement aquí.
 *   2) Si falla, divide el SQL en statements (respetando comentarios,
 *      bloques $$ ... $$ y strings entre comillas simples con escape '')
 *      y los ejecuta uno a uno con `db.sql.unsafe(stmt)`.
 *
 * La migración solo se marca como aplicada cuando todos los statements
 * pasan OK. Si algo falla, queda como pendiente y se reporta en el JSON.
 */

import type { Context, Config } from "@netlify/functions";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../lib/db.js";

const MIGRATIONS_DIR = join(process.cwd(), "netlify/database/migrations");

const PRE_EXISTENTES = ["0000_baseline", "0001_seed_data_supabase"];


function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}


/**
 * Divide un script SQL en statements individuales respetando:
 *   - Comentarios de línea  (-- ...)
 *   - Comentarios de bloque (slash-asterisk ... asterisk-slash)
 *   - Bloques dollar-quoted ($$ ... $$) usados en funciones plpgsql
 *   - Strings entre comillas simples ('...') con escape '' interno
 *
 * El `;` solo cuenta como separador en modo "normal" — nunca dentro
 * de un comentario, un string ni un bloque $$.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollar = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];

    // Dentro de comentario de línea
    if (inLineComment) {
      current += c;
      if (c === "\n") inLineComment = false;
      i++;
      continue;
    }

    // Dentro de comentario de bloque
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

    // Dentro de string con comillas simples
    if (inString) {
      current += c;
      if (c === "'") {
        // '' es escape, no fin de string
        if (n === "'") {
          current += "'";
          i += 2;
          continue;
        }
        inString = false;
      }
      i++;
      continue;
    }

    // Dentro de bloque $$ ... $$
    if (inDollar) {
      if (c === "$" && n === "$") {
        current += "$$";
        inDollar = false;
        i += 2;
        continue;
      }
      current += c;
      i++;
      continue;
    }

    // Modo normal: detectar inicios de modos especiales
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
      inDollar = true;
      i += 2;
      continue;
    }

    if (c === "'") {
      inString = true;
      current += "'";
      i++;
      continue;
    }

    if (c === ";") {
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


async function listarCarpetasMigraciones(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}


/**
 * Aplica el SQL de una migración. Devuelve null si OK, o un objeto
 * { error, statement_preview } si falla.
 *
 * Estrategia:
 *   1) Probar ejecutar todo el SQL de una sola llamada.
 *   2) Si falla, trocear y ejecutar uno a uno hasta encontrar el statement
 *      que rompe (más diagnóstico).
 */
async function aplicarMigracion(
  sqlText: string,
): Promise<null | { error: string; statement_preview: string }> {
  const sqlAny: any = db.sql;

  // Intento 1: todo de una vez
  try {
    await sqlAny.unsafe(sqlText);
    return null;
  } catch {
    // pasamos a estrategia 2
  }

  // Intento 2: parser + uno a uno
  const statements = splitSqlStatements(sqlText);
  for (const stmt of statements) {
    try {
      await sqlAny.unsafe(stmt);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        statement_preview: stmt.slice(0, 240),
      };
    }
  }
  return null;
}


export default async (req: Request, _ctx: Context) => {
  try {
    const url = new URL(req.url);
    const modo = url.searchParams.get("modo");

    // ── MODO DIAG ─────────────────────────────────────────
    if (modo === "diag") {
      const sqlAny: any = db.sql;
      let folders: string[] = [];
      let errorListando: string | null = null;
      try {
        folders = await listarCarpetasMigraciones();
      } catch (err) {
        errorListando = err instanceof Error ? err.message : String(err);
      }

      return json({
        modo: "diag",
        env_keys: Object.keys(process.env).sort(),
        db_sql: {
          tipo: typeof sqlAny,
          tiene_query: typeof sqlAny?.query === "function",
          tiene_unsafe: typeof sqlAny?.unsafe === "function",
          tiene_transaction: typeof sqlAny?.transaction === "function",
          es_callable: typeof sqlAny === "function",
        },
        migrations_dir: MIGRATIONS_DIR,
        cwd: process.cwd(),
        carpetas_detectadas: folders,
        error_listando: errorListando,
      });
    }

    // 1. Asegurar la tabla de control.
    await db.sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        nombre      text PRIMARY KEY,
        aplicada_at timestamptz DEFAULT now()
      )
    `;

    // 2. Listar carpetas.
    let folders: string[] = [];
    try {
      folders = await listarCarpetasMigraciones();
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

    // ── MODO MARCAR-EXISTENTES ────────────────────────────
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

    // ── MODO NORMAL ───────────────────────────────────────
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

      const errorAplicacion = await aplicarMigracion(sqlText);

      if (errorAplicacion) {
        resultado.errores.push({
          nombre: folder,
          ...errorAplicacion,
        });
      } else {
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
