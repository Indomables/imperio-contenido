/**
 * kit-api.ts — Wrappers compartidos sobre la API REST v4 de Kit.
 *
 * Centraliza llamadas a Kit para que tanto `auto-publish.mts` (cron) como
 * `chat.mts` (chat IA) las usen sin duplicar código.
 *
 * Auth: API key v4 vía header `X-Kit-Api-Key`.
 *
 * NOTA: el MCP de Kit (https://app.kit.com/mcp) es OAuth y se usa desde
 * AI clients (claude.ai web, ChatGPT, Cursor) por el creador. Las
 * Functions backend siguen usando la API REST porque no hay AI client
 * en el loop — server-to-server con API key.
 */

const KIT_BASE = "https://api.kit.com/v4";

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "X-Kit-Api-Key": apiKey,
    Accept: "application/json",
  };
}

async function kitFetch(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${KIT_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...authHeaders(apiKey),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

/** Ping ligero usado por /api/health. */
export async function kitPing(apiKey: string): Promise<{ ok: boolean; status: number }> {
  const r = await kitFetch(apiKey, "/account");
  return { ok: r.ok, status: r.status };
}

// ─── Broadcasts ────────────────────────────────────────────────

export interface KitBroadcast {
  id: number;
  publication_id?: number | string | null;
  subject?: string;
  preview_text?: string | null;
  description?: string | null;
  created_at?: string;
  send_at?: string | null;
  published_at?: string | null;
  public?: boolean;
  thumbnail_url?: string | null;
}

export interface KitBroadcastStats {
  recipients?: number | null;
  emails_opened?: number | null;
  open_rate?: number | null;
  total_clicks?: number | null;
  click_rate?: number | null;
  unsubscribes?: number | null;
  unsubscribe_rate?: number | null;
  status?: string;
  progress?: number;
  open_tracking_disabled?: boolean;
  click_tracking_disabled?: boolean;
}

export interface KitLinkClick {
  url: string;
  unique_clicks: number;
  click_to_delivery_rate?: number;
  click_to_open_rate?: number;
}

export async function listBroadcasts(
  apiKey: string,
  opts: { perPage?: number; after?: string } = {},
): Promise<{ broadcasts: KitBroadcast[]; nextCursor: string | null }> {
  const perPage = opts.perPage ?? 50;
  const qs = new URLSearchParams({ per_page: String(perPage) });
  if (opts.after) qs.set("after", opts.after);
  const r = await kitFetch(apiKey, `/broadcasts?${qs.toString()}`);
  if (!r.ok) throw new Error(`listBroadcasts ${r.status}`);
  const j = (await r.json()) as {
    broadcasts: KitBroadcast[];
    pagination?: { end_cursor?: string | null; has_next_page?: boolean };
  };
  return {
    broadcasts: j.broadcasts || [],
    nextCursor: j.pagination?.has_next_page ? j.pagination.end_cursor ?? null : null,
  };
}

export async function getBroadcast(
  apiKey: string,
  id: number | string,
): Promise<KitBroadcast | null> {
  const r = await kitFetch(apiKey, `/broadcasts/${id}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`getBroadcast ${id} ${r.status}`);
  const j = (await r.json()) as { broadcast?: KitBroadcast };
  return j.broadcast ?? null;
}

export async function getBroadcastStats(
  apiKey: string,
  id: number | string,
): Promise<KitBroadcastStats | null> {
  const r = await kitFetch(apiKey, `/broadcasts/${id}/stats`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`getBroadcastStats ${id} ${r.status}`);
  const j = (await r.json()) as { broadcast?: { stats?: KitBroadcastStats } };
  return j.broadcast?.stats ?? null;
}

export async function getBroadcastLinkClicks(
  apiKey: string,
  id: number | string,
): Promise<KitLinkClick[]> {
  const r = await kitFetch(apiKey, `/broadcasts/${id}/link_clicks`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`getBroadcastLinkClicks ${id} ${r.status}`);
  const j = (await r.json()) as { broadcast?: { clicks?: KitLinkClick[] } };
  return j.broadcast?.clicks ?? [];
}

// Stats cross-broadcast (para leaderboards y vistas agregadas)
export async function getBroadcastsStats(
  apiKey: string,
  opts: { perPage?: number; sentAfter?: string; sentBefore?: string } = {},
): Promise<Array<KitBroadcast & { stats: KitBroadcastStats }>> {
  const qs = new URLSearchParams({ per_page: String(opts.perPage ?? 50) });
  if (opts.sentAfter) qs.set("sent_after", opts.sentAfter);
  if (opts.sentBefore) qs.set("sent_before", opts.sentBefore);
  const r = await kitFetch(apiKey, `/broadcasts/stats?${qs.toString()}`);
  if (!r.ok) throw new Error(`getBroadcastsStats ${r.status}`);
  const j = (await r.json()) as { broadcasts?: Array<KitBroadcast & { stats: KitBroadcastStats }> };
  return j.broadcasts ?? [];
}

// ─── Account-level stats ───────────────────────────────────────

export async function getEmailStats(apiKey: string): Promise<Record<string, unknown> | null> {
  const r = await kitFetch(apiKey, `/account/email_stats`);
  if (!r.ok) throw new Error(`getEmailStats ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

export async function getGrowthStats(apiKey: string): Promise<Record<string, unknown> | null> {
  const r = await kitFetch(apiKey, `/account/growth_stats`);
  if (!r.ok) throw new Error(`getGrowthStats ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

// ─── Tags ──────────────────────────────────────────────────────

export interface KitTag {
  id: number;
  name: string;
  created_at?: string;
}

export async function listTags(apiKey: string): Promise<KitTag[]> {
  const r = await kitFetch(apiKey, `/tags?per_page=100`);
  if (!r.ok) throw new Error(`listTags ${r.status}`);
  const j = (await r.json()) as { tags?: KitTag[] };
  return j.tags ?? [];
}

// ─── Subscribers ───────────────────────────────────────────────

export interface KitSubscriber {
  id: number;
  email_address?: string;
  first_name?: string;
  created_at?: string;
  state?: string;
}

export async function listSubscribers(
  apiKey: string,
  opts: { perPage?: number; after?: string } = {},
): Promise<{ subscribers: KitSubscriber[]; nextCursor: string | null }> {
  const qs = new URLSearchParams({ per_page: String(opts.perPage ?? 50) });
  if (opts.after) qs.set("after", opts.after);
  const r = await kitFetch(apiKey, `/subscribers?${qs.toString()}`);
  if (!r.ok) throw new Error(`listSubscribers ${r.status}`);
  const j = (await r.json()) as {
    subscribers?: KitSubscriber[];
    pagination?: { end_cursor?: string | null; has_next_page?: boolean };
  };
  return {
    subscribers: j.subscribers ?? [],
    nextCursor: j.pagination?.has_next_page ? j.pagination.end_cursor ?? null : null,
  };
}

/**
 * Filtra suscriptores por engagement (opens, clicks, sent, delivered)
 * o por fecha de signup. Es el endpoint más potente para análisis.
 *
 * Cada item de `all` es una condición (AND entre items).
 * Cada condición tiene `type` y opcionalmente `count_greater_than`,
 * `count_less_than`, `after`, `before`, `any` (scoping).
 */
export async function filterSubscribers(
  apiKey: string,
  body: {
    all?: Array<Record<string, unknown>>;
    per_page?: number;
    after?: string;
    sort_field?: string;
    sort_order?: "asc" | "desc";
    include_total_count?: boolean;
  },
): Promise<{
  subscribers: KitSubscriber[];
  nextCursor: string | null;
  totalCount?: number;
}> {
  const r = await kitFetch(apiKey, `/subscribers/filter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`filterSubscribers ${r.status} ${txt.slice(0, 200)}`);
  }
  const j = (await r.json()) as {
    subscribers?: KitSubscriber[];
    pagination?: { end_cursor?: string | null; has_next_page?: boolean; total_count?: number };
  };
  return {
    subscribers: j.subscribers ?? [],
    nextCursor: j.pagination?.has_next_page ? j.pagination.end_cursor ?? null : null,
    totalCount: j.pagination?.total_count,
  };
}
