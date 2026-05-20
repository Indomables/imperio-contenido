/**
 * /api/chat — Chat IA embebido en la pestaña Análisis.
 *
 * Proxy a la API de Anthropic con tools que internamente llaman a Kit v4
 * (API REST con KIT_API_KEY_V4). No usa el MCP de Kit por ahora — esto
 * está alineado con la "Opción C" decidida: empezar con tool_use clásico
 * por simplicidad y migrar a MCP a futuro si conviene.
 *
 * Modelo: claude-sonnet-4-6 (sin extended thinking, baja latencia para
 * chat interactivo).
 *
 * REQUEST:
 *   POST /api/chat
 *   { messages: [{role: "user"|"assistant", content: "..."}, ...] }
 *
 * RESPONSE (JSON):
 *   {
 *     events: [
 *       { type: "tool_use", tool: "...", input: {...} },
 *       { type: "tool_result", tool: "...", ok: true, summary: "...", data: {...} },
 *       { type: "text", content: "..." }
 *     ],
 *     usage: { input_tokens, output_tokens, total_tokens },
 *     stop_reason: "end_turn"|"tool_use"|"max_tokens"
 *   }
 *
 * El frontend muestra los `events` en orden — los tool_use/result aparecen
 * como bloques expandibles y el texto final como mensaje del assistant.
 */

import type { Context, Config } from "@netlify/functions";
import {
  listBroadcasts,
  getBroadcast,
  getBroadcastStats,
  getBroadcastLinkClicks,
  getBroadcastsStats,
  listTags,
  filterSubscribers,
  getEmailStats,
  getGrowthStats,
} from "../lib/kit-api.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
// Modelo Claude Sonnet 4.6 — buen equilibrio latencia/calidad para chat
// interactivo con tools. Si en algún momento queremos más profundidad
// (análisis complejos), se puede escalar a opus-4-6/4-7 o activar
// extended thinking — pero añade latencia y coste.
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `Eres Claude actuando como copiloto operativo de Imperio Indomable, el negocio de Soma Alcázar. Estás embebido en la pestaña Análisis de su app interna y tienes acceso a herramientas que consultan la cuenta de Kit (su proveedor de email).

CONTEXTO:
- Newsletter de Soma: ~1.180 suscriptores activos
- Envía 2 emails semanales: Backstage (lunes) y Autoridad (miércoles)
- Open rates típicos 28-40%; click rates suelen ser 0% porque la mayoría de emails son texto puro sin CTAs
- Cuando hay CTA real (lanzamiento, cierre de oferta), los click rates suben a 7-15%

ESTILO DE RESPUESTA:
- Responde en español, conciso y directo (Soma no quiere párrafos largos)
- Cuando muestres datos, formatea números con separador de miles (1.234) y porcentajes con un decimal (32.5%)
- Si un dato no existe o no lo tienes, di que no lo tienes — no inventes nunca
- Insight > volcado de datos. Si listas broadcasts, añade una línea de observación al final
- Una respuesta no necesita usar todas las tools — usa solo las que aporten

TOOLS DISPONIBLES:
- list_broadcasts: lista los broadcasts (drafts, programados, enviados)
- get_broadcast: detalle de un broadcast por ID
- get_broadcast_stats: métricas (opens, clicks, unsubs) de un broadcast
- get_broadcast_link_clicks: desglose de clicks por link de un broadcast
- get_broadcasts_stats: stats cross-broadcast (útil para leaderboards y comparativas)
- list_tags: tags definidos en la cuenta
- filter_subscribers: filtrar suscriptores por engagement (opens, clicks, fechas)
- get_email_stats: stats agregadas de envío de la cuenta
- get_growth_stats: crecimiento de la lista en el tiempo

Si Soma te pide algo que requiere modificar datos (etiquetar, crear broadcasts, etc.), hazle saber que esta primera versión es read-only por seguridad y se ampliará pronto.`;

// ─── Definición de tools (formato Anthropic API) ────────────────

const TOOLS = [
  {
    name: "list_broadcasts",
    description:
      "Lista los broadcasts (emails) de la cuenta de Kit, ordenados por fecha de creación descendente. Útil para ver los últimos enviados o pendientes. Por defecto devuelve 25.",
    input_schema: {
      type: "object",
      properties: {
        per_page: {
          type: "integer",
          description: "Número de broadcasts a devolver (1-100, default 25).",
          minimum: 1,
          maximum: 100,
        },
      },
    },
  },
  {
    name: "get_broadcast",
    description:
      "Devuelve el detalle de un broadcast específico (asunto, preview, fechas, descripción). NO incluye stats — para eso usa get_broadcast_stats.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID del broadcast en Kit." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_broadcast_stats",
    description:
      "Métricas agregadas de un broadcast: destinatarios, aperturas, tasa de apertura, total de clicks, tasa de clicks, bajas, tasa de bajas.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID del broadcast en Kit." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_broadcast_link_clicks",
    description:
      "Desglose por link de los clicks de un broadcast. Para cada URL devuelve unique_clicks, click_to_delivery_rate y click_to_open_rate. Si la lista está vacía, el broadcast no tenía links clickables o nadie clicó.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "ID del broadcast en Kit." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_broadcasts_stats",
    description:
      "Stats cross-broadcast: lista paginada con cada broadcast y sus stats en una sola llamada. Útil para leaderboards, comparativas y análisis temporal. Acepta filtro de fechas opcional (sent_after, sent_before en formato ISO YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        per_page: { type: "integer", minimum: 1, maximum: 100 },
        sent_after: { type: "string", description: "ISO date YYYY-MM-DD." },
        sent_before: { type: "string", description: "ISO date YYYY-MM-DD." },
      },
    },
  },
  {
    name: "list_tags",
    description: "Lista todos los tags definidos en la cuenta de Kit.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "filter_subscribers",
    description:
      "Filtra suscriptores por engagement (opens, clicks, sent, delivered) o por fecha de signup (type='subscribed'). Cada item de `all` es una condición AND. Para top engagement, usa type='opens' con count_greater_than y rango de fechas. Devuelve los primeros 25 suscriptores que cumplen.",
    input_schema: {
      type: "object",
      properties: {
        all: {
          type: "array",
          description:
            "Array de filtros AND. Cada item: {type: 'opens'|'clicks'|'sent'|'delivered'|'subscribed', count_greater_than?: int, count_less_than?: int, after?: 'YYYY-MM-DD', before?: 'YYYY-MM-DD'}.",
          items: { type: "object" },
        },
        per_page: { type: "integer", minimum: 1, maximum: 100 },
        include_total_count: { type: "boolean" },
      },
      required: ["all"],
    },
  },
  {
    name: "get_email_stats",
    description:
      "Estadísticas agregadas de envío de la cuenta (totales y medias). Útil para una visión general del rendimiento.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_growth_stats",
    description:
      "Estadísticas de crecimiento de suscriptores en el tiempo. Útil para ver de dónde vienen los nuevos suscriptores y cómo evoluciona la lista.",
    input_schema: { type: "object", properties: {} },
  },
];

// ─── Ejecutor de tools ──────────────────────────────────────────

interface ToolResult {
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  kitKey: string,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "list_broadcasts": {
        const perPage = (input.per_page as number) ?? 25;
        const { broadcasts } = await listBroadcasts(kitKey, { perPage });
        return {
          ok: true,
          summary: `${broadcasts.length} broadcast${broadcasts.length === 1 ? "" : "s"}`,
          data: broadcasts.map((b) => ({
            id: b.id,
            subject: b.subject,
            send_at: b.send_at,
            published_at: b.published_at,
            description: b.description,
          })),
        };
      }
      case "get_broadcast": {
        const id = input.id as number;
        const b = await getBroadcast(kitKey, id);
        if (!b) return { ok: false, summary: `broadcast ${id} no encontrado`, error: "not_found" };
        return { ok: true, summary: b.subject ?? `broadcast ${id}`, data: b };
      }
      case "get_broadcast_stats": {
        const id = input.id as number;
        const s = await getBroadcastStats(kitKey, id);
        if (!s) return { ok: false, summary: `stats no disponibles para ${id}`, error: "no_stats" };
        return {
          ok: true,
          summary: `${s.recipients ?? 0} dest · ${s.open_rate ?? 0}% open · ${s.total_clicks ?? 0} clicks`,
          data: s,
        };
      }
      case "get_broadcast_link_clicks": {
        const id = input.id as number;
        const clicks = await getBroadcastLinkClicks(kitKey, id);
        return {
          ok: true,
          summary: clicks.length === 0
            ? "sin clicks (no había links o nadie clicó)"
            : `${clicks.length} link${clicks.length === 1 ? "" : "s"} clicado${clicks.length === 1 ? "" : "s"}`,
          data: clicks,
        };
      }
      case "get_broadcasts_stats": {
        const opts = {
          perPage: (input.per_page as number) ?? 25,
          sentAfter: input.sent_after as string | undefined,
          sentBefore: input.sent_before as string | undefined,
        };
        const data = await getBroadcastsStats(kitKey, opts);
        return {
          ok: true,
          summary: `${data.length} broadcast${data.length === 1 ? "" : "s"} con stats`,
          data: data.map((b) => ({
            id: b.id,
            subject: b.subject,
            send_at: b.send_at,
            stats: b.stats,
          })),
        };
      }
      case "list_tags": {
        const tags = await listTags(kitKey);
        return {
          ok: true,
          summary: `${tags.length} tag${tags.length === 1 ? "" : "s"}`,
          data: tags,
        };
      }
      case "filter_subscribers": {
        const body = {
          all: (input.all as Array<Record<string, unknown>>) ?? [],
          per_page: (input.per_page as number) ?? 25,
          include_total_count: (input.include_total_count as boolean) ?? false,
        };
        const { subscribers, totalCount } = await filterSubscribers(kitKey, body);
        return {
          ok: true,
          summary: totalCount !== undefined
            ? `${subscribers.length} de ${totalCount} suscriptores`
            : `${subscribers.length} suscriptores`,
          data: { subscribers, totalCount },
        };
      }
      case "get_email_stats": {
        const data = await getEmailStats(kitKey);
        return { ok: true, summary: "stats globales obtenidas", data };
      }
      case "get_growth_stats": {
        const data = await getGrowthStats(kitKey);
        return { ok: true, summary: "growth stats obtenidos", data };
      }
      default:
        return { ok: false, summary: `tool desconocida: ${name}`, error: "unknown_tool" };
    }
  } catch (e) {
    const msg = (e as Error).message;
    return { ok: false, summary: `error: ${msg.slice(0, 120)}`, error: msg };
  }
}

// ─── Anthropic API helpers ──────────────────────────────────────

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callAnthropic(
  apiKey: string,
  messages: AnthropicMessage[],
): Promise<AnthropicResponse> {
  const r = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Anthropic API ${r.status}: ${txt.slice(0, 500)}`);
  }
  return (await r.json()) as AnthropicResponse;
}

// ─── Handler ────────────────────────────────────────────────────

interface ChatEvent {
  type: "text" | "tool_use" | "tool_result";
  tool?: string;
  input?: Record<string, unknown>;
  ok?: boolean;
  summary?: string;
  data?: unknown;
  content?: string;
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anthropicKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY no configurada" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const kitKey = Netlify.env.get("KIT_API_KEY_V4");
  if (!kitKey) {
    return new Response(
      JSON.stringify({ error: "KIT_API_KEY_V4 no configurada" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages?: AnthropicMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incomingMessages = body.messages ?? [];
  if (incomingMessages.length === 0) {
    return new Response(JSON.stringify({ error: "messages vacío" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Limpiamos los messages: si vienen con strings, los dejamos tal cual.
  // Si vienen con arrays de blocks (mensajes asistente previos), los
  // pasamos también. Pero el frontend solo nos manda strings normalmente.
  const messages: AnthropicMessage[] = incomingMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const events: ChatEvent[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let stopReason = "end_turn";

  // ── Tool loop ─────────────────────────────────────────────────
  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const resp = await callAnthropic(anthropicKey, messages);
    totalInputTokens += resp.usage.input_tokens;
    totalOutputTokens += resp.usage.output_tokens;
    stopReason = resp.stop_reason;

    // Procesar los content blocks de la respuesta
    const toolUses: AnthropicContentBlock[] = [];
    for (const block of resp.content) {
      if (block.type === "text" && block.text) {
        events.push({ type: "text", content: block.text });
      } else if (block.type === "tool_use") {
        toolUses.push(block);
        events.push({
          type: "tool_use",
          tool: block.name,
          input: block.input,
        });
      }
    }

    // Añadir respuesta del assistant al historial
    messages.push({ role: "assistant", content: resp.content });

    // Si no hay tool_use, terminamos
    if (toolUses.length === 0 || resp.stop_reason === "end_turn") break;

    // Ejecutar tools y construir tool_results
    const toolResultBlocks: AnthropicContentBlock[] = [];
    for (const tu of toolUses) {
      const result = await executeTool(
        tu.name as string,
        (tu.input as Record<string, unknown>) ?? {},
        kitKey,
      );
      events.push({
        type: "tool_result",
        tool: tu.name,
        ok: result.ok,
        summary: result.summary,
        data: result.data,
      });
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result.ok
          ? JSON.stringify(result.data ?? { summary: result.summary })
          : `Error: ${result.error ?? result.summary}`,
        is_error: !result.ok,
      });
    }

    // Añadir tool_results al historial como mensaje del usuario
    messages.push({ role: "user", content: toolResultBlocks });
  }

  return new Response(
    JSON.stringify({
      events,
      usage: {
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens,
      },
      stop_reason: stopReason,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const config: Config = {
  path: "/api/chat",
};
