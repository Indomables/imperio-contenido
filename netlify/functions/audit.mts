/**
 * audit.mts — Endpoint TEMPORAL de diagnóstico.
 *
 * Soma puede invocarlo desde el navegador (con la password de Netlify activa)
 * para auditar el estado del tracking de Kit en piezas publicadas.
 *
 * Devuelve:
 *  · email_publicados_total
 *  · email_publicados_trackeados (con kit_broadcast_id)
 *  · email_publicados_huerfanos  (sin kit_broadcast_id → no se sincronizarán)
 *  · email_agendados_total
 *  · email_agendados_trackeados
 *  · email_agendados_huerfanos
 *  · huerfanos: lista detallada (titulo + fecha) de los que les falta el ID
 *  · last_synced: la fecha más reciente de last_synced_at en publicadas
 *
 * BORRAR EN EL PRÓXIMO DEPLOY tras leer el resultado.
 *
 * URL: https://imperio-contenido.netlify.app/api/audit
 */

import type { Config } from "@netlify/functions";
import { neon } from "@netlify/neon";

const db = { sql: neon() };

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default async (_req: Request) => {
  try {
    // Conteos globales
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

    // Listado de huérfanos (publicados sin kit_broadcast_id) — los que importan
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

    // Listado de huérfanos (agendados sin kit_broadcast_id)
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

    // Sync más reciente (cuándo se actualizaron métricas por última vez)
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
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
};

export const config: Config = {
  path: "/api/audit",
};
