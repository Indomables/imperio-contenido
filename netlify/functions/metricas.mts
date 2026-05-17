import type { Context, Config } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../lib/db.js";
import { metricas } from "../lib/schema.js";
import {
  json,
  notFound,
  badRequest,
  methodNotAllowed,
  serverError,
  getPathSegments,
} from "../lib/responses.js";

/**
 * Métricas externas (Kit, Zernio, Instagram) por pieza.
 *
 *   GET /api/metricas/:piezaId     → obtener métricas de una pieza
 *   PUT /api/metricas/:piezaId     → upsert { datos: { ... } }
 *
 * Las métricas son JSONB libre. Aquí solo se gestiona el envoltorio,
 * el shape interno depende del integrador que las escribió (Kit,
 * Zernio, Instagram).
 */
export default async (req: Request, _context: Context) => {
  const segments = getPathSegments(req.url);
  // segments = ["metricas", "<piezaId>"]
  const piezaId = segments[1];

  if (!piezaId) return badRequest("piezaId requerido en la URL");

  try {
    if (req.method === "GET") {
      const rows = await db
        .select()
        .from(metricas)
        .where(eq(metricas.piezaId, piezaId));
      return rows.length ? json(rows[0]) : notFound();
    }

    if (req.method === "PUT") {
      const body = await req.json();
      // Acepta { datos: {...} } o directamente el objeto de datos
      const datos = body.datos ?? body;

      // Upsert: si existe, actualiza; si no, inserta
      const existing = await db
        .select()
        .from(metricas)
        .where(eq(metricas.piezaId, piezaId));

      if (existing.length) {
        const rows = await db
          .update(metricas)
          .set({ datos })
          .where(eq(metricas.piezaId, piezaId))
          .returning();
        return json(rows[0]);
      } else {
        const rows = await db
          .insert(metricas)
          .values({ piezaId, datos })
          .returning();
        return json(rows[0], 201);
      }
    }

    return methodNotAllowed(req.method);
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: "/api/metricas/*",
};
