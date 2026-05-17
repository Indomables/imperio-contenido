import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
import {
  json,
  notFound,
  badRequest,
  methodNotAllowed,
  serverError,
  getPathSegments,
} from "../lib/responses.js";

/**
 * Métricas externas por pieza (Kit, Zernio, Instagram).
 *
 *   GET /api/metricas              → listar todas (para Análisis)
 *   GET /api/metricas/:piezaId     → obtener una
 *   PUT /api/metricas/:piezaId     → upsert { datos: {...} } o {...}
 *
 * El campo `datos` es JSONB libre; su shape depende del integrador.
 */
export default async (req: Request, _context: Context) => {
  const segments = getPathSegments(req.url);
  const piezaId = segments[1];

  try {
    // ── GET /api/metricas (todas) ───────────────────────
    if (req.method === "GET" && !piezaId) {
      const rows = await db.sql`
        SELECT pieza_id, datos, updated_at
        FROM metricas
        ORDER BY updated_at DESC
      `;
      return json(rows);
    }

    // A partir de aquí, todas las rutas necesitan piezaId
    if (!piezaId) return badRequest("piezaId requerido en la URL");

    if (req.method === "GET") {
      const rows = await db.sql`
        SELECT * FROM metricas WHERE pieza_id = ${piezaId}
      `;
      return rows.length ? json(rows[0]) : notFound();
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const datos = body.datos ?? body;

      // Upsert vía ON CONFLICT (pieza_id es UNIQUE)
      const [row] = await db.sql`
        INSERT INTO metricas (pieza_id, datos)
        VALUES (${piezaId}, ${JSON.stringify(datos)}::jsonb)
        ON CONFLICT (pieza_id) DO UPDATE
          SET datos = EXCLUDED.datos,
              updated_at = NOW()
        RETURNING *
      `;
      return json(row);
    }

    return methodNotAllowed(req.method);
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: ["/api/metricas", "/api/metricas/*"],
};
