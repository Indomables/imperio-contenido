import type { Context, Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { settings } from "../lib/schema.js";
import {
  json,
  notFound,
  badRequest,
  methodNotAllowed,
  serverError,
  getPathSegments,
} from "../lib/responses.js";

/**
 * Configuración global key/value.
 *
 *   GET /api/settings              → todas
 *   GET /api/settings/:key         → una
 *   PUT /api/settings/:key         → upsert { value: "..." }
 *   DELETE /api/settings/:key      → borrar
 */
export default async (req: Request, _context: Context) => {
  const segments = getPathSegments(req.url);
  const key = segments[1];

  try {
    if (req.method === "GET") {
      if (key) {
        const rows = await db
          .select()
          .from(settings)
          .where(eq(settings.key, key));
        return rows.length ? json(rows[0]) : notFound();
      }
      const rows = await db.select().from(settings);
      return json(rows);
    }

    if (req.method === "PUT") {
      if (!key) return badRequest("key requerida en la URL");
      const body = await req.json();
      const value = body.value ?? "";

      const existing = await db
        .select()
        .from(settings)
        .where(eq(settings.key, key));

      if (existing.length) {
        const rows = await db
          .update(settings)
          .set({ value })
          .where(eq(settings.key, key))
          .returning();
        return json(rows[0]);
      } else {
        const rows = await db
          .insert(settings)
          .values({ key, value })
          .returning();
        return json(rows[0], 201);
      }
    }

    if (req.method === "DELETE") {
      if (!key) return badRequest("key requerida en la URL");
      const rows = await db
        .delete(settings)
        .where(eq(settings.key, key))
        .returning();
      return rows.length
        ? new Response(null, { status: 204 })
        : notFound();
    }

    return methodNotAllowed(req.method);
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: ["/api/settings", "/api/settings/*"],
};
