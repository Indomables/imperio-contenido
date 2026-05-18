/**
 * migrate.mts — Aplicador de migraciones SQL.
 *
 * El build de Netlify NO ejecuta migraciones automáticamente. Esta function
 * lee las carpetas de `netlify/database/migrations/`, lleva la cuenta en
 * una tabla `_migrations`, y aplica solo las pendientes.
 *
 * MODOS (todos vía query param):
 *
 *   ?modo=marcar-existentes
 *      Registra 0000_baseline y 0001_seed_data_supabase como YA APLICADAS
 *      sin ejecutar nada. Solo se usa una vez tras instalar el sistema.
 *
 *   ?modo=diag
 *      Devuelve info de diagnóstico: env keys, API disponible en db.sql,
 *      carpetas detectadas. Útil para depurar problemas de conexión o paths.
 *
 *   (sin modo)
 *      Aplica las migraciones pendientes que encuentre.
 *
 * Cómo añadir una migración futura:
 *   1. Crea `netlify/database/migrations/00NN_descripcion/migration.sql`
 *      con SQL idempotente (CREATE TABLE IF NOT EXISTS, etc.).
 *   2. Sube a GitHub. Netlify deploya.
 *   3. Abre /api/migrate en el navegador.
 *
 * Auth: protegida por el site password de Netlify.
 *
 * Implementación: usa `db.sql.unsafe(stmt)` del cliente neon HTTP que
 * @netlify/database expone. Es la API oficial para SQL crudo dinámico.
 * Cada migración se divide en statements (respetando comentarios y
 * bloques $$ ... $$) y se ejecuta uno a uno; si alguno falla, esa
 * migración se reporta como error y NO se marca como aplicada.
 */

import type { Context, Config } from "@netlify/functions";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../lib/db.js";

const MIGRATIONS_DIR = join(process.cwd(), "netlify/database/migrations");

// Migraciones que YA existían antes de instalar este sistema.
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


async function listarCarpetasMigraciones(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
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

    const sqlAny: any = db.sql;

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
          await sqlAny.unsafe(stmt);
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
