import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
import {
  json,
  noContent,
  notFound,
  badRequest,
  methodNotAllowed,
  serverError,
  getPathSegments,
} from "../lib/responses.js";

/**
 * Configuración global key/value.
 *
 *   GET    /api/settings              → todas
 *   GET    /api/settings/:key         → una
 *   PUT    /api/settings/:key         → upsert { value }
 *   DELETE /api/settings/:key         → borrar
 */
export default async (req: Request, _context: Context) => {
  const segments = getPathSegments(req.url);
  const key = segments[1];

  try {
    if (req.method === "GET") {
      if (key) {
        const rows = await db.sql`
          SELECT * FROM settings WHERE key = ${key}
        `;
        return rows.length ? json(rows[0]) : notFound();
      }
      const rows = await db.sql`SELECT * FROM settings ORDER BY key ASC`;
      return json(rows);
    }

    if (req.method === "PUT") {
      if (!key) return badRequest("key requerida en la URL");
      const body = await req.json();
      const value = body.value ?? "";

      const [row] = await db.sql`
        INSERT INTO settings (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = NOW()
        RETURNING *
      `;
      return json(row);
    }

    if (req.method === "DELETE") {
      if (!key) return badRequest("key requerida en la URL");
      const rows = await db.sql`
        DELETE FROM settings WHERE key = ${key} RETURNING key
      `;
      return rows.length ? noContent() : notFound();
    }

    return methodNotAllowed(req.method);
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: ["/api/settings", "/api/settings/*"],
};
