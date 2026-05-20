/**
 * /api/dashboard-overview — Datos reales de Kit para el Dashboard.
 *
 * v0.66 · Primer cut.
 *
 * Una sola llamada desde el frontend (al cargar el Dashboard y cada vez
 * que se dispare app:refresh). El backend hace todas las llamadas a Kit
 * en paralelo y devuelve un payload compacto:
 *
 * RESPONSE:
 *   {
 *     subscribers: {
 *       current: number | null,
 *       series: Array<{ date: 'YYYY-MM-DD', subscribers: number | null }>,
 *     },
 *     topBroadcasts: {
 *       items: Array<{ id, subject, send_at, recipients, open_rate }>,
 *       average_open_rate: number | null,
 *     },
 *   }
 *
 * El campo `subscribers.series` tiene 30 puntos, uno por día, con el
 * total acumulado al final de ese día. Para construirlo hacemos 30
 * llamadas paralelas a /account/growth_stats con el mismo `starting`
 * (muy antiguo) y `ending` variando — Kit no soporta buckets diarios
 * nativamente, así que ésta es la mejor opción sin un sistema de caché.
 *
 * Tolerante a errores: si una llamada de la serie falla, ese punto
 * queda null y el resto sigue. Si todo Kit cae, devolvemos un 502
 * y el frontend conserva los valores previos / hace fallback local.
 */

import type { Context, Config } from "@netlify/functions";
import {
  getGrowthStats,
  getBroadcastsStats,
} from "../lib/kit-api.js";

// ─── Constantes ────────────────────────────────────────────────
const SERIES_DAYS = 30;
const TOP_DAYS = 90;
const TOP_COUNT = 3;
// `starting` fijo muy antiguo para que cada llamada devuelva el total
// acumulado real al final del día. No importa que sea anterior al
// nacimiento de la lista — Kit simplemente cuenta desde antes.
const ANCHOR_START = "2015-01-01";

// ─── Helpers ───────────────────────────────────────────────────
function isoDay(d: Date): string {
  // YYYY-MM-DD en UTC
  return d.toISOString().slice(0, 10);
}

function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgoUTC(days: number): Date {
  const d = startOfTodayUTC();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

// ─── Handler ───────────────────────────────────────────────────

interface SeriesPoint {
  date: string;
  subscribers: number | null;
}

interface TopBroadcastItem {
  id: number;
  subject: string | null;
  send_at: string | null;
  recipients: number | null;
  open_rate: number | null;
}

export default async (_req: Request, _ctx: Context) => {
  const kitKey = Netlify.env.get("KIT_API_KEY_V4");
  if (!kitKey) {
    return new Response(
      JSON.stringify({ error: "KIT_API_KEY_V4 no configurada" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // 1) Serie de suscriptores: 30 llamadas paralelas, una por día.
  //    Cada llamada: starting fijo + ending = ese día.
  //    Catch individual para que un día roto no tumbe la serie entera.
  const today = startOfTodayUTC();
  const seriesPromises: Promise<SeriesPoint>[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const ending = isoDay(d);
    seriesPromises.push(
      getGrowthStats(kitKey, { starting: ANCHOR_START, ending })
        .then((stats) => ({
          date: ending,
          subscribers: stats?.subscribers ?? null,
        }))
        .catch(() => ({ date: ending, subscribers: null as number | null })),
    );
  }

  // 2) Top broadcasts: 1 llamada para los últimos 90 días.
  const sentAfter = isoDay(daysAgoUTC(TOP_DAYS));
  const topPromise = getBroadcastsStats(kitKey, {
    perPage: 100,
    sentAfter,
  }).catch((e) => {
    // tolerante — si falla, devolvemos lista vacía pero la serie sigue
    console.error("getBroadcastsStats fallo:", e);
    return [] as Awaited<ReturnType<typeof getBroadcastsStats>>;
  });

  // Esperamos todo en paralelo
  const [series, broadcasts] = await Promise.all([
    Promise.all(seriesPromises),
    topPromise,
  ]);

  // Suscriptores actuales = último punto válido de la serie
  let current: number | null = null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].subscribers != null) {
      current = series[i].subscribers;
      break;
    }
  }

  // Procesar top broadcasts: solo los que tienen open_rate (descarta drafts)
  const withOpens = broadcasts.filter(
    (b) => b.stats?.open_rate != null && b.stats?.open_rate !== undefined,
  );
  const sorted = [...withOpens].sort(
    (a, b) =>
      Number(b.stats?.open_rate ?? 0) - Number(a.stats?.open_rate ?? 0),
  );
  const topItems: TopBroadcastItem[] = sorted.slice(0, TOP_COUNT).map((b) => ({
    id: b.id,
    subject: b.subject ?? null,
    send_at: b.published_at ?? b.send_at ?? null,
    recipients: b.stats?.recipients ?? null,
    open_rate: b.stats?.open_rate ?? null,
  }));

  // Media de open_rate sobre TODOS los broadcasts del periodo (no solo top 3),
  // para que el delta "vs media" sea representativo.
  let averageOpenRate: number | null = null;
  if (withOpens.length > 0) {
    const sum = withOpens.reduce(
      (acc, b) => acc + Number(b.stats?.open_rate ?? 0),
      0,
    );
    averageOpenRate = sum / withOpens.length;
  }

  return new Response(
    JSON.stringify({
      subscribers: { current, series },
      topBroadcasts: {
        items: topItems,
        average_open_rate: averageOpenRate,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

export const config: Config = {
  path: "/api/dashboard-overview",
};
