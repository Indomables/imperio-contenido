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
 *
 * Implementación: usa `Pool` de @neondatabase/serverless (dep transitiva
 * de @netlify/database) para ejecutar el SQL completo de cada migración
 * dentro de una transacción real con rollback automático en fallo.
 */

import type { Context, Config } from "@netlify/functions";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { db } from "../lib/db.js";

const MIGRATIONS_DIR = join(process.cwd(), "netlify/database/migrations");

// Migraciones que YA existían antes de instalar este sistema.
const PRE_EXISTENTES = ["0000_baseline", "0001_seed_data_supabase"];

// Netlify Database inyecta automáticamente la connection string en runtime.
// Probamos los nombres de env var conocidos por orden de preferencia.
function getConnectionString(): string | null {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    null
  );
}


function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}


export default async (req: Request, _ctx: Context) => {
  const connectionString = getConnectionString();
  if (!connectionString) {
    return json(
      {
        error: "sin_connection_string",
        mensaje:
          "No se encontró ninguna de estas env vars: NETLIFY_DATABASE_URL, DATABASE_URL, NEON_DATABASE_URL",
        env_vars_relacionadas: Object.keys(process.env).filter((k) =>
          /DATABASE|NEON|POSTGRES|PG/.test(k),
        ),
      },
      500,
    );
  }

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
      errores: { nombre: string; error: string }[];
    } = {
      ya_aplicadas: [],
      recien_aplicadas: [],
      saltadas: [],
      errores: [],
    };

    // Pool nuevo por invocación. Las functions serverless son short-lived,
    // así que crear y cerrar el pool por request es lo correcto.
    const pool = new Pool({ connectionString });

    try {
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

        // Ejecutar la migración entera en una transacción.
        // Pool.query() del cliente WebSocket de neon soporta multi-statement
        // SQL nativamente, incluidos bloques $$ ... $$ y funciones plpgsql.
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(sqlText);
          await client.query(
            "INSERT INTO _migrations (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING",
            [folder],
          );
          await client.query("COMMIT");
          resultado.recien_aplicadas.push(folder);
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Si el ROLLBACK falla, seguimos. El error principal es el de
            // la migración, no el del rollback.
          }
          resultado.errores.push({
            nombre: folder,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          client.release();
        }
      }
    } finally {
      await pool.end();
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
