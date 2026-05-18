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
 *      Devuelve info de diagnóstico: env vars (solo nombres), tipos de la
 *      API de db.sql disponibles, listado de migraciones detectadas.
 *
 *   (sin modo)
 *      Aplica las migraciones pendientes que encuentre.
 *
 * Auth: protegida por el site password de Netlify.
 *
 * Implementación: usa `db.sql` (que es el cliente neon de @netlify/database)
 * con tagged template ARTIFICIAL para ejecutar SQL crudo dinámico. Esto
 * evita necesitar un Pool separado con connection string explícita.
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
 * Ejecuta una sentencia SQL cruda usando db.sql.
 *
 * `db.sql` es una tagged template function: en JS, al hacer
 *   sql`SELECT * FROM foo`
 * el motor JS llama internamente a:
 *   sql(["SELECT * FROM foo"], ...[])
 * donde el primer argumento es un array con propiedad `raw`.
 *
 * Reconstruimos ese array manualmente para pasar SQL dinámico.
 *
 * Si esa vía falla, intenta llamar a sql.query() y luego a sql() como
 * función directa, por compatibilidad con distintas versiones del cliente.
 */
async function execRawSQL(stmt: string): Promise<void> {
  const sql: any = db.sql;

  // Método 1: tagged template artificial. Es la vía que respeta exactamente
  // cómo se construye internamente una llamada `sql`tag`.
  try {
    const strings = Object.assign([stmt], { raw: [stmt] });
    await sql(strings);
    return;
  } catch (err1) {
    // Método 2: sql.query(stmt) por si el cliente lo expone.
    if (typeof sql.query === "function") {
      try {
        await sql.query(stmt);
        return;
      } catch {
        // continuar al siguiente
      }
    }
    // Método 3: llamada directa con string. Última opción.
    try {
      await sql(stmt);
      return;
    } catch {
      // ninguna vía funcionó; relanzamos el primer error que suele ser
      // el más informativo
      throw err1;
    }
  }
}


/**
 * Divide un script SQL en statements individuales.
 * Respeta comentarios de línea (--), de bloque (slash-asterisk),
 * y bloques dollar-quoted ($$ ... $$).
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
          await execRawSQL(stmt);
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
