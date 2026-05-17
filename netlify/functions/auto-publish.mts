/**
 * auto-publish — Scheduled Function (cron horario).
 *
 * Port directo de la edge function `auto-publish` de Supabase (versión 23).
 * Ejecuta dos tareas en cada disparo:
 *
 *  1. AGENDADAS → PUBLICADAS:
 *     Para cada pieza email con `columna='agendado'` y `kit_broadcast_id`
 *     no vacío, consulta Kit v4. Si el broadcast tiene `published_at`,
 *     mueve la pieza a `publicado`, actualiza `fecha_publicacion` y
 *     refresca métricas.
 *
 *  2. PUBLICADAS RECIENTES → REFRESH MÉTRICAS:
 *     Para cada pieza email con `columna='publicado'` publicada en las
 *     últimas 72h, refresca sus métricas desde Kit v4 stats.
 *
 * Normalización de ID: en el legacy de Supabase, algunas piezas tenían
 * almacenado `publication_id` en lugar del `broadcast.id` real. Esta
 * función resuelve el ID correcto en el primer disparo donde lo encuentra
 * y persiste el valor real para que no haya que re-resolver nunca más.
 *
 * Schedule: `@hourly` (cada hora en punto).
 *
 * Configuración (env vars en Netlify):
 *   - KIT_API_KEY_V4   (requerida) — API key de Kit v4. Antes vivía en
 *                                    `settings.kit_api_key_v4` de Supabase.
 *   - CRON_SECRET      (opcional)  — si está definida, requiere
 *                                    `Authorization: Bearer <secret>` para
 *                                    invocaciones HTTP externas (manuales).
 *                                    El scheduler interno de Netlify no
 *                                    pasa este header — usa el path interno.
 *
 * Para disparar manualmente desde curl (testing):
 *   curl -X POST https://impero-contenido.netlify.app/.netlify/functions/auto-publish \
 *        -H "Authorization: Bearer $CRON_SECRET"
 */

import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";

const KIT_BASE = "https://api.kit.com/v4";

interface KitBroadcast {
  id: number | string;
  publication_id?: number | string | null;
  published_at?: string | null;
}

interface KitStats {
  recipients?: number | null;
  emails_opened?: number | null;
  open_rate?: number | null;
  total_clicks?: number | null;
  click_rate?: number | null;
  unsubscribes?: number | null;
  unsubscribe_rate?: number | null;
}

interface Metricas {
  enviados:       number | null;
  aperturas:      number | null;
  tasa_apertura:  number | null;
  clics:          number | null;
  tasa_clics:     number | null;
  bajas:          number | null;
  tasa_bajas:     number | null;
}

interface RunResult {
  moved: number;
  updated: number;
  normalized: number;
  errors: string[];
  debug: string[];
}

export default async (req: Request, _context: Context) => {
  // 1. Auth (solo aplica si CRON_SECRET está definida y la llamada es HTTP externa)
  const cronSecret = Netlify.env.get("CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization") || "";
    // Las Scheduled invocadas por el scheduler interno de Netlify usan el
    // header `x-netlify-event: schedule`. Si está, dejamos pasar.
    const isInternalSchedule = req.headers.get("x-netlify-event") === "schedule";
    const isAuthorized = auth === `Bearer ${cronSecret}`;
    if (!isInternalSchedule && !isAuthorized) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // 2. API key
  const v4Key = Netlify.env.get("KIT_API_KEY_V4");
  if (!v4Key) {
    return new Response(
      JSON.stringify({ error: "KIT_API_KEY_V4 no configurada en env vars" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const headers = { "X-Kit-Api-Key": v4Key, "Accept": "application/json" };

  const result: RunResult = { moved: 0, updated: 0, normalized: 0, errors: [], debug: [] };

  // 3. Cargar lista de broadcasts para resolver IDs
  let broadcastsList: KitBroadcast[] = [];
  try {
    const r = await fetch(`${KIT_BASE}/broadcasts?per_page=100`, { headers });
    const j = await r.json();
    broadcastsList = (j as { broadcasts?: KitBroadcast[] }).broadcasts || [];
    result.debug.push(`list loaded: ${broadcastsList.length} broadcasts`);
  } catch (e) {
    result.debug.push(`list err: ${(e as Error).message}`);
  }

  // Resuelve un ID almacenado al broadcast.id real (manejo de publication_id legacy)
  const resolveId = (stored: string): { realId: string; wasResolved: boolean } => {
    if (broadcastsList.find((b) => String(b.id) === stored)) {
      return { realId: stored, wasResolved: false };
    }
    const byPub = broadcastsList.find((b) => String(b.publication_id) === stored);
    if (byPub) {
      result.debug.push(`resolved publication_id ${stored} → broadcast id ${byPub.id}`);
      return { realId: String(byPub.id), wasResolved: true };
    }
    return { realId: stored, wasResolved: false };
  };

  // 4. Procesar agendadas → publicadas
  const agendadas = await db.sql<{
    id: string;
    titulo: string | null;
    kit_broadcast_id: string;
  }>`
    SELECT id, titulo, kit_broadcast_id
    FROM piezas
    WHERE columna = 'agendado'
      AND formato = 'email'
      AND kit_broadcast_id IS NOT NULL
      AND kit_broadcast_id <> ''
  `;
  result.debug.push(`agendadas a comprobar: ${agendadas.length}`);

  for (const pieza of agendadas) {
    try {
      const { realId, wasResolved } = resolveId(pieza.kit_broadcast_id);

      if (wasResolved) {
        await db.sql`
          UPDATE piezas SET kit_broadcast_id = ${realId} WHERE id = ${pieza.id}
        `;
        result.normalized++;
      }

      const r = await fetch(`${KIT_BASE}/broadcasts/${realId}`, { headers });
      if (!r.ok) {
        result.errors.push(`${pieza.titulo}: broadcast ${realId} not found`);
        continue;
      }
      const data = (await r.json()) as { broadcast?: { published_at?: string | null } };
      const publishedAt = data.broadcast?.published_at;
      if (!publishedAt) continue;

      await db.sql`
        UPDATE piezas
        SET columna = 'publicado',
            fecha_publicacion = ${publishedAt},
            last_synced_at = NOW()
        WHERE id = ${pieza.id}
      `;
      result.moved++;
      result.debug.push(`moved: ${pieza.titulo}`);
      await refreshStats(pieza.id, realId, headers, result);
    } catch (e) {
      result.errors.push(`Move ${pieza.titulo}: ${(e as Error).message}`);
    }
  }

  // 5. Refrescar métricas de publicadas recientes (72h)
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const publicadas = await db.sql<{
    id: string;
    titulo: string | null;
    kit_broadcast_id: string;
    fecha_publicacion: string | null;
  }>`
    SELECT id, titulo, kit_broadcast_id, fecha_publicacion
    FROM piezas
    WHERE columna = 'publicado'
      AND formato = 'email'
      AND kit_broadcast_id IS NOT NULL
      AND kit_broadcast_id <> ''
      AND fecha_publicacion >= ${cutoff}
  `;
  result.debug.push(`publicadas a refrescar: ${publicadas.length}`);

  for (const pieza of publicadas) {
    try {
      const { realId, wasResolved } = resolveId(pieza.kit_broadcast_id);
      if (wasResolved) {
        await db.sql`
          UPDATE piezas SET kit_broadcast_id = ${realId} WHERE id = ${pieza.id}
        `;
        result.normalized++;
      }
      const ok = await refreshStats(pieza.id, realId, headers, result);
      if (ok) {
        result.updated++;
        await db.sql`
          UPDATE piezas SET last_synced_at = NOW() WHERE id = ${pieza.id}
        `;
      }
    } catch (e) {
      result.errors.push(`Refresh ${pieza.titulo}: ${(e as Error).message}`);
    }
  }

  // Logueamos el resumen para que aparezca en los logs de Netlify
  // (Netlify no loguea el body de la Response automáticamente, solo
  // lo que pase por console.log).
  console.log(JSON.stringify({
    moved: result.moved,
    updated: result.updated,
    normalized: result.normalized,
    errors_count: result.errors.length,
    errors: result.errors,
    debug: result.debug,
  }));

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Refresca las métricas de una pieza desde Kit v4 stats endpoint.
 * Mantiene el resto de campos de `datos` (merge) por si hay tracking
 * manual añadido (replies, revenue_eur, etc.).
 */
async function refreshStats(
  piezaId: string,
  broadcastId: string,
  headers: Record<string, string>,
  result: RunResult,
): Promise<boolean> {
  const r = await fetch(`${KIT_BASE}/broadcasts/${broadcastId}/stats`, { headers });
  const text = await r.text();
  if (!r.ok) {
    result.errors.push(`stats ${broadcastId}: ${r.status} ${text.slice(0, 100)}`);
    return false;
  }

  let data: { broadcast?: { stats?: KitStats } };
  try {
    data = JSON.parse(text);
  } catch {
    result.errors.push(`stats ${broadcastId}: JSON parse failed`);
    return false;
  }
  const s = data.broadcast?.stats;
  if (!s) {
    result.errors.push(`stats ${broadcastId}: no stats in response`);
    return false;
  }

  const metricas: Metricas = {
    enviados:      s.recipients ?? null,
    aperturas:     s.emails_opened ?? null,
    tasa_apertura: s.open_rate != null      ? +Number(s.open_rate).toFixed(1)        : null,
    clics:         s.total_clicks ?? null,
    tasa_clics:    s.click_rate != null     ? +Number(s.click_rate).toFixed(1)       : null,
    bajas:         s.unsubscribes ?? null,
    tasa_bajas:    s.unsubscribe_rate != null ? +Number(s.unsubscribe_rate).toFixed(2) : null,
  };
  result.debug.push(`stats ${broadcastId}: env=${metricas.enviados} ap=${metricas.aperturas} (${metricas.tasa_apertura}%)`);

  // Upsert con merge de los campos existentes (replies, revenue_eur, etc.)
  const existing = await db.sql<{ id: string; datos: Record<string, unknown> }>`
    SELECT id, datos FROM metricas WHERE pieza_id = ${piezaId}
  `;

  if (existing.length > 0) {
    const merged = { ...existing[0].datos, ...metricas };
    await db.sql`
      UPDATE metricas SET datos = ${JSON.stringify(merged)}::jsonb
      WHERE id = ${existing[0].id}
    `;
  } else {
    await db.sql`
      INSERT INTO metricas (pieza_id, datos)
      VALUES (${piezaId}, ${JSON.stringify(metricas)}::jsonb)
    `;
  }
  return true;
}

export const config: Config = {
  // Cada hora en punto. Coincide con la indicación "CRON CADA HORA" del UI.
  schedule: "@hourly",
};
