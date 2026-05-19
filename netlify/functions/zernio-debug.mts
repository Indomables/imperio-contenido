import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";

export default async (_req: Request, _ctx: Context) => {
  try {
    const eventos = await db.sql`
      SELECT id, event_id, tipo, recibido_at, procesado_ok,
             COALESCE(error_msg, '') AS error_msg
      FROM zernio_eventos
      ORDER BY recibido_at DESC
      LIMIT 10
    `;

    const clasificaciones = await db.sql`
      SELECT id, handle, dm_text,
             interes_sugerido, temperatura, confianza,
             sequence_sugerida_id, tags_sugeridos,
             razonamiento, modelo_usado,
             created_at
      FROM zernio_clasificaciones
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const acciones = await db.sql`
      SELECT id, zernio_contact_id, tipo, resultado, motivo,
             COALESCE(error_msg, '') AS error_msg, created_at
      FROM zernio_acciones
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return new Response(
      JSON.stringify(
        {
          eventos_recientes: eventos,
          clasificaciones_recientes: clasificaciones,
          acciones_recientes: acciones,
        },
        null,
        2,
      ),
      { headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify(
        { error: err instanceof Error ? err.message : String(err) },
        null,
        2,
      ),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
};

export const config: Config = {
  path: ["/api/zernio/debug"],
};
