/**
 * zernio-api.js — Adapter del frontend para la pestaña Zernio.
 *
 * Sustituye el mock de Iteración 2 (`zernio-mock.js`) por llamadas reales
 * al backend (`/api/zernio/notifications`). La shape devuelta es idéntica
 * a la del mock, así que ningún componente de UI necesita cambiar.
 *
 * El backend hace la traducción de nomenclatura SQL → frontend (intent,
 * temperature, confidence, state) en su lado. Aquí solo recibimos y pasamos.
 */

// ───────────────────────────────────────────────────────────────────
// SEQUENCES (constantes, no necesitan API — coinciden con backend)
// ───────────────────────────────────────────────────────────────────

export const SEQUENCES = {
  "herm-onboarding": {
    slug: "herm-onboarding",
    name: "HERMANDAD · ONBOARDING",
    zernioId: "6a0afe4e47068aa92bb9c94a",
    intent: "hermandad",
  },
  "elite-call": {
    slug: "elite-call",
    name: "ÉLITE · CALL",
    zernioId: "6a0afe52fcb4a493cb039914",
    intent: "elite",
  },
  "general-welcome": {
    slug: "general-welcome",
    name: "GENERAL · WELCOME",
    zernioId: "6a0afe41fcb4a493cb039586",
    intent: "general",
  },
};

// ───────────────────────────────────────────────────────────────────
// EDGE FN HEALTH (de momento estático "operational"; futuro: endpoint /health)
// ───────────────────────────────────────────────────────────────────

export const EDGE_HEALTH_OPERATIONAL = {
  state: "operational",
  lastProcessedAt: new Date(),
  latencyMeanMs: 240,
  latencyP95Ms: 412,
  processedLast24h: 0, // se actualizará cuando tengamos endpoint
  successRate: 0.986,
  retries: 0,
};

export const EDGE_HEALTH_DEGRADED = {
  state: "degraded",
  lastProcessedAt: new Date(Date.now() - 8 * 60 * 1000),
  latencyMeanMs: 1180,
  latencyP95Ms: 2640,
  processedLast24h: 0,
  successRate: 0.91,
  retries: 12,
};

export const EDGE_HEALTH_DOWN = {
  state: "down",
  lastProcessedAt: new Date(Date.now() - 22 * 60 * 1000),
  latencyMeanMs: 0,
  latencyP95Ms: 0,
  processedLast24h: 0,
  successRate: 0,
  retries: 7,
  downSinceMs: Date.now() - 22 * 60 * 1000,
};

// ───────────────────────────────────────────────────────────────────
// Helpers internos
// ───────────────────────────────────────────────────────────────────

/**
 * Normaliza las fechas que vienen como string ISO en la respuesta JSON
 * para que el resto del código pueda usar `.getTime()` etc.
 */
function hydrateDates(notif) {
  if (notif.receivedAt && typeof notif.receivedAt === "string") {
    notif.receivedAt = new Date(notif.receivedAt);
  }
  if (notif.decision?.decidedAt && typeof notif.decision.decidedAt === "string") {
    notif.decision.decidedAt = new Date(notif.decision.decidedAt);
  }
  return notif;
}

async function jsonFetch(url, init) {
  const resp = await fetch(url, init);
  if (!resp.ok) {
    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch {}
    throw new Error(
      `Request failed ${resp.status}: ${bodyText.slice(0, 200)}`,
    );
  }
  return resp.json();
}

// ───────────────────────────────────────────────────────────────────
// API pública
// ───────────────────────────────────────────────────────────────────

/**
 * Lista notificaciones según vista.
 *
 *   view: 'inbox' | 'historico' | 'all'
 *   limit: número (default 50)
 *
 * Devuelve { items, counts, totalCount }
 */
export async function listNotifications({ view = "inbox", limit = 50 } = {}) {
  const params = new URLSearchParams({ view, limit: String(limit) });
  const data = await jsonFetch(`/api/zernio/notifications?${params}`);
  return {
    items: (data.items ?? []).map(hydrateDates),
    counts: data.counts ?? {},
    totalCount: data.totalCount ?? 0,
  };
}

/**
 * Registra una decisión sobre una notificación.
 *
 *   id: uuid de la notificación
 *   type: 'enroll' | 'discard' | 'tag' | 'promote'
 *   payload: { sequenceSlug?, discardReason?, tagApplied? }
 *
 * Devuelve { ok, id, state, decidedAt, timeToDecideSec }
 */
export async function decideNotification(id, type, payload = {}) {
  const data = await jsonFetch(
    `/api/zernio/notifications/${encodeURIComponent(id)}/decide`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ...payload }),
    },
  );
  if (data.decidedAt && typeof data.decidedAt === "string") {
    data.decidedAt = new Date(data.decidedAt);
  }
  return data;
}
