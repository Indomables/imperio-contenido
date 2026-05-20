/**
 * auto-publish — Scheduled Function (cron horario).
 *
 * v0.62: ahora también guarda `links_clicks` (desglose por link) en cada
 * refresh. La métrica agregada `clics` y `tasa_clics` siguen viniendo
 * de /stats; el desglose por URL viene de /link_clicks.
 *
 * Tareas en cada disparo:
 *
 *  1. AGENDADAS → PUBLICADAS:
 *     Para cada pieza email con `columna='agendado'` y `kit_broadcast_id`
 *     no vacío, consulta Kit v4. Si el broadcast tiene `published_at`,
 *     mueve la pieza a `publicado`, actualiza `fecha_publicacion` y
 *     refresca métricas (incluido el desglose de clicks por link).
 *
 *  2. PUBLICADAS RECIENTES → REFRESH MÉTRICAS:
 *     Para cada pieza email con `columna='publicado'` publicada en las
 *     últimas 72h, refresca sus métricas desde Kit v4 stats + link_clicks.
 *
 * Schedule: `@hourly`.
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

interface KitLinkClick {
  url: string;
  unique_clicks: number;
  click_to_delivery_rate?: number;
  click_to_open_rate?: number;
}

interface LinkClickStored {
  url: string;
  unique_clicks: number;
  click_to_delivery_rate: number | null;
  click_to_open_rate: number | null;
}

interface Metricas {
  enviados:       number | null;
  aperturas:      number | null;
  tasa_apertura:  number | null;
  clics:          number | null;
  tasa_clics:     number | null;
  bajas:          number | null;
  tasa_bajas:     number | null;
  links_clicks?:  LinkClickStored[];
}

interface RunResult {
  moved: number;
  updated: number;
  normalized: number;
  errors: string[];
  debug: string[];
}

export default async (req: Request, _context: Context) => {
  const cronSecret = Netlify.env.get("CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization") || "";
    const isInternalSchedule = req.headers.get("x-netlify-event") === "schedule";
    const isAuthorized = auth === `Bearer ${cronSecret}`;
    if (!isInternalSchedule && !isAuthorized) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const v4Key = Netlify.env.get("KIT_API_KEY_V4");
  if (!v4Key) {
    return new Response(
      JSON.stringify({ error: "KIT_API_KEY_V4 no configurada en env vars" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const headers = { "X-Kit-Api-Key": v4Key, "Accept": "application/json" };

  const result: RunResult = { moved: 0, updated: 0, normalized: 0, errors: [], debug: [] };

  // Cargar lista de broadcasts para resolver IDs
  let broadcastsList: KitBroadcast[] = [];
  try {
    const r = await fetch(`${KIT_BASE}/broadcasts?per_page=100`, { headers });
    const j = await r.json();
    broadcastsList = (j as { broadcasts?: KitBroadcast[] }).broadcasts || [];
    result.debug.push(`list loaded: ${broadcastsList.length} broadcasts`);
  } catch (e) {
    result.debug.push(`list err: ${(e as Error).message}`);
  }

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

  // ── Procesar agendadas → publicadas ──────────────────────────
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

  // ── Refrescar métricas de publicadas recientes (72h) ─────────
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
 * Refresca las métricas de una pieza desde Kit v4:
 *   - /stats (recipients, opens, clicks agregados, unsubs)
 *   - /link_clicks (desglose por URL clickeada)
 *
 * Hace MERGE con los campos manuales existentes (replies, revenue_eur).
 */
async function refreshStats(
  piezaId: string,
  broadcastId: string,
  headers: Record<string, string>,
  result: RunResult,
): Promise<boolean> {
  // 1. Stats agregados
  const rStats = await fetch(`${KIT_BASE}/broadcasts/${broadcastId}/stats`, { headers });
  const statsText = await rStats.text();
  if (!rStats.ok) {
    result.errors.push(`stats ${broadcastId}: ${rStats.status} ${statsText.slice(0, 100)}`);
    return false;
  }

  let statsData: { broadcast?: { stats?: KitStats } };
  try {
    statsData = JSON.parse(statsText);
  } catch {
    result.errors.push(`stats ${broadcastId}: JSON parse failed`);
    return false;
  }
  const s = statsData.broadcast?.stats;
  if (!s) {
    result.errors.push(`stats ${broadcastId}: no stats in response`);
    return false;
  }

  // 2. Link clicks (desglose por URL). Tolerante a errores — si falla,
  //    seguimos con los stats agregados.
  let linksClicks: LinkClickStored[] | undefined;
  try {
    const rClicks = await fetch(
      `${KIT_BASE}/broadcasts/${broadcastId}/link_clicks`,
      { headers },
    );
    if (rClicks.ok) {
      const j = (await rClicks.json()) as {
        broadcast?: { clicks?: KitLinkClick[] };
      };
      const raw = j.broadcast?.clicks ?? [];
      linksClicks = raw.map((c) => ({
        url: c.url,
        unique_clicks: c.unique_clicks ?? 0,
        click_to_delivery_rate: c.click_to_delivery_rate ?? null,
        click_to_open_rate: c.click_to_open_rate ?? null,
      }));
      result.debug.push(
        `link_clicks ${broadcastId}: ${linksClicks.length} link${linksClicks.length === 1 ? "" : "s"}`,
      );
    } else {
      result.debug.push(`link_clicks ${broadcastId}: ${rClicks.status} (ignored)`);
    }
  } catch (e) {
    result.debug.push(`link_clicks ${broadcastId}: err ${(e as Error).message} (ignored)`);
  }

  const metricas: Metricas = {
    enviados:      s.recipients ?? null,
    aperturas:     s.emails_opened ?? null,
    tasa_apertura: s.open_rate != null        ? +Number(s.open_rate).toFixed(1)        : null,
    clics:         s.total_clicks ?? null,
    tasa_clics:    s.click_rate != null       ? +Number(s.click_rate).toFixed(1)       : null,
    bajas:         s.unsubscribes ?? null,
    tasa_bajas:    s.unsubscribe_rate != null ? +Number(s.unsubscribe_rate).toFixed(2) : null,
    ...(linksClicks !== undefined ? { links_clicks: linksClicks } : {}),
  };
  result.debug.push(
    `stats ${broadcastId}: env=${metricas.enviados} ap=${metricas.aperturas} (${metricas.tasa_apertura}%) cl=${metricas.clics}`,
  );

  // 3. Upsert con merge de los campos existentes (replies, revenue_eur, etc.)
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
  schedule: "@hourly",
};
