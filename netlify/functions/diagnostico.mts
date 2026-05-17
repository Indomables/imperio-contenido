import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
import { json, serverError } from "../lib/responses.js";

/**
 * diagnostico — Endpoint TEMPORAL para auditar el tracking de Kit
 * en piezas email publicadas y agendadas.
 *
 * BORRAR EN EL PRÓXIMO DEPLOY tras leer el resultado.
 *
 * GET /api/diagnostico
 */
export default async (_req: Request, _context: Context) => {
  try {
    const [counts] = await db.sql<{
      email_pub_total: number;
      email_pub_track: number;
      email_pub_huerfanos: number;
      email_age_total: number;
      email_age_track: number;
      email_age_huerfanos: number;
    }>`
      SELECT
        COUNT(*) FILTER (WHERE columna = 'publicado')                                                                        AS email_pub_total,
        COUNT(*) FILTER (WHERE columna = 'publicado' AND kit_broadcast_id IS NOT NULL AND kit_broadcast_id <> '')            AS email_pub_track,
        COUNT(*) FILTER (WHERE columna = 'publicado' AND (kit_broadcast_id IS NULL OR kit_broadcast_id = ''))                AS email_pub_huerfanos,
        COUNT(*) FILTER (WHERE columna = 'agendado')                                                                         AS email_age_total,
        COUNT(*) FILTER (WHERE columna = 'agendado' AND kit_broadcast_id IS NOT NULL AND kit_broadcast_id <> '')             AS email_age_track,
        COUNT(*) FILTER (WHERE columna = 'agendado' AND (kit_broadcast_id IS NULL OR kit_broadcast_id = ''))                 AS email_age_huerfanos
      FROM piezas
      WHERE formato = 'email'
    `;

    const huerfanos_publicados = await db.sql<{
      id: string;
      titulo: string;
      fecha_publicacion: string | null;
    }>`
      SELECT id, titulo, fecha_publicacion
      FROM piezas
      WHERE formato = 'email'
        AND columna = 'publicado'
        AND (kit_broadcast_id IS NULL OR kit_broadcast_id = '')
      ORDER BY fecha_publicacion DESC NULLS LAST
    `;

    const huerfanos_agendados = await db.sql<{
      id: string;
      titulo: string;
      fecha_publicacion: string | null;
    }>`
      SELECT id, titulo, fecha_publicacion
      FROM piezas
      WHERE formato = 'email'
        AND columna = 'agendado'
        AND (kit_broadcast_id IS NULL OR kit_broadcast_id = '')
      ORDER BY fecha_publicacion ASC NULLS LAST
    `;

    const [sync] = await db.sql<{ last_synced: string | null }>`
      SELECT MAX(last_synced_at) AS last_synced
      FROM piezas
      WHERE formato = 'email' AND columna = 'publicado'
    `;

    return json({
      generado_en: new Date().toISOString(),
      resumen: {
        publicados: {
          total: Number(counts.email_pub_total),
          trackeados: Number(counts.email_pub_track),
          huerfanos: Number(counts.email_pub_huerfanos),
        },
        agendados: {
          total: Number(counts.email_age_total),
          trackeados: Number(counts.email_age_track),
          huerfanos: Number(counts.email_age_huerfanos),
        },
        last_synced_at_mas_reciente: sync.last_synced,
      },
      huerfanos_publicados,
      huerfanos_agendados,
    });
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: "/api/diagnostico",
};
