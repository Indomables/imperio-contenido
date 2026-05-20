/**
 * zernio-notifications.mts — API CRUD para la pestaña Zernio del frontend.
 *
 * Vive en el site principal `imperio-contenido`. Lee y muta la BD compartida
 * (las 4 tablas zernio_*). Hace de traductor entre la nomenclatura del schema
 * SQL (snake_case + español + valores con prefijo "int-", confianza 0..1,
 * estados "pendiente"/"decidida_*") y la shape que espera el frontend
 * (camelCase + inglés + valores cortos, confidence 0..100, state
 * "pending"/"enrolled"/"discarded"/"tagged"/"promoted").
 *
 * Endpoints:
 *
 *   GET  /api/zernio/notifications
 *     Query params:
 *       ?view=inbox        → solo pendientes (default)
 *       ?view=historico    → solo decididas
 *       ?view=all          → todas
 *       ?limit=50          → límite (default 50, max 200)
 *     Response: { items: [...], totalCount: N }
 *
 *   POST /api/zernio/notifications/:id/decide
 *     Body: { type: 'enroll'|'discard'|'tag'|'promote', sequenceSlug?, discardReason?, tagApplied? }
 *     Response: { ok: true, id, state, decidedAt, timeToDecideSec }
 *
 * Auth: protegida por site password de Netlify (igual que el resto del site).
 *
 * NOVEDAD (20 may 2026): cuando type='enroll', el endpoint ahora llama
 * realmente a Zernio (POST /v1/sequences/{id}/enroll) usando el contact ID
 * interno cacheado en metadata. Si la llamada falla, devuelve error 502 y
 * registra la acción con resultado='error' SIN actualizar el estado de la
 * notificación (queda en pendiente para reintento).
 */

import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";

// ─── Constantes Zernio ─────────────────────────────────────────────

const ZERNIO_BASE = "https://zernio.com/api/v1";

// Mapeo robusto: acepta tanto slugs cortos (frontend), largos (BD),
// como con prefijo "int-" (interes_sugerido).
const SEQUENCE_SLUG_TO_ID: Record<string, string> = {
  // Slugs cortos del frontend
  hermandad: "6a0afe4e47068aa92bb9c94a",
  elite: "6a0afe52fcb4a493cb039914",
  general: "6a0afe41fcb4a493cb039586",
  // Slugs largos de la BD (sequence_sugerida_id)
  "herm-onboarding": "6a0afe4e47068aa92bb9c94a",
  "elite-call": "6a0afe52fcb4a493cb039914",
  "general-welcome": "6a0afe41fcb4a493cb039586",
  // Slugs con prefijo int- (interes_sugerido)
  "int-hermandad": "6a0afe4e47068aa92bb9c94a",
  "int-elite": "6a0afe52fcb4a493cb039914",
  "int-general": "6a0afe41fcb4a493cb039586",
};

function resolveSequenceId(
  slug: string | null | undefined,
  fallback?: string | null,
): string | null {
  if (slug && SEQUENCE_SLUG_TO_ID[slug]) return SEQUENCE_SLUG_TO_ID[slug];
  if (fallback && SEQUENCE_SLUG_TO_ID[fallback])
    return SEQUENCE_SLUG_TO_ID[fallback];
  return null;
}

async function enrollInZernio(
  sequenceId: string,
  contactIds: string[],
  apiKey: string,
): Promise<any> {
  const res = await fetch(`${ZERNIO_BASE}/sequences/${sequenceId}/enroll`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ contactIds }),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const detail =
      typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    throw new Error(`Zernio ${res.status}: ${detail}`);
  }
  return parsed;
}

// ─── Helpers de traducción SQL ↔ Frontend ──────────────────────────

const INTENT_SQL_TO_FRONT: Record<string, string> = {
  "int-hermandad": "hermandad",
  "int-elite": "elite",
  "int-general": "general",
  "sin-interes": "sininter",
  "requiere-revision": "sininter", // tratamos como sininter en UI; la pista está en tags
};

const TEMP_SQL_TO_FRONT: Record<string, string> = {
  frio: "cold",
  tibio: "warm",
  caliente: "hot",
};

const STATE_SQL_TO_FRONT: Record<string, string> = {
  pendiente: "pending",
  decidida_enrolar: "enrolled",
  decidida_descartar: "discarded",
  decidida_otro: "tagged", // sub-tipo (tagged vs promoted) lo distinguimos por decision_motivo
};

const DECISION_TYPE_FRONT_TO_SQL: Record<
  string,
  { estado: string; accionTipo: string }
> = {
  enroll: { estado: "decidida_enrolar", accionTipo: "enrolar_sequence" },
  discard: { estado: "decidida_descartar", accionTipo: "descartar" },
  tag: { estado: "decidida_otro", accionTipo: "aplicar_tag" },
  promote: { estado: "decidida_otro", accionTipo: "promover_a_reactor" },
};

function initialsFromHandle(handle: string | null | undefined): string {
  if (!handle) return "??";
  const clean = handle.replace(/^@/, "");
  const parts = clean.split(/[\._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

// Convierte una fila joined (notificacion + clasificacion) en la shape del frontend.
function rowToFrontend(row: any): any {
  const intent = INTENT_SQL_TO_FRONT[row.interes_sugerido] ?? "sininter";
  const temperature = TEMP_SQL_TO_FRONT[row.temperatura] ?? "warm";
  const confidence = Math.round(Number(row.confianza) * 100);

  let state = STATE_SQL_TO_FRONT[row.estado] ?? "pending";
  // Sub-distinguir promoted vs tagged dentro de decidida_otro
  if (row.estado === "decidida_otro" && row.decision_motivo) {
    if (
      String(row.decision_motivo).toLowerCase().includes("promote") ||
      String(row.decision_motivo).toLowerCase().includes("reactor")
    ) {
      state = "promoted";
    }
  }

  // Decision opcional
  let decision: any = null;
  if (row.estado !== "pendiente" && row.decision_at) {
    const decidedAt = new Date(row.decision_at);
    const receivedAt = new Date(row.recibido_at ?? row.created_at);
    const timeToDecideSec = Math.max(
      0,
      Math.round((decidedAt.getTime() - receivedAt.getTime()) / 1000),
    );
    decision = {
      decidedAt: decidedAt.toISOString(),
      decidedBy: "soma",
      timeToDecideSec,
      sequenceSlug:
        row.estado === "decidida_enrolar"
          ? row.sequence_sugerida_id
          : undefined,
      discardReason:
        row.estado === "decidida_descartar" ? row.decision_motivo : undefined,
      tagApplied: state === "tagged" ? row.decision_motivo : undefined,
    };
  }

  return {
    id: row.notif_id,
    source: "instagram_dm",
    externalId: row.event_id ?? row.notif_id,
    receivedAt: (row.recibido_at instanceof Date
      ? row.recibido_at
      : new Date(row.recibido_at ?? row.created_at)
    ).toISOString(),
    contact: {
      handle: row.handle ?? "",
      externalId: row.zernio_contact_id ?? "",
      displayName: null,
      followerCount: null,
      location: null,
      avatarInitials: initialsFromHandle(row.handle),
    },
    dm: { text: row.dm_text ?? "" },
    classification: {
      intent,
      temperature,
      confidence,
      suggestedSequence: row.sequence_sugerida_id || null,
      tags: Array.isArray(row.tags_sugeridos) ? row.tags_sugeridos : [],
      reasoning: row.razonamiento ?? "",
      model: row.modelo_usado ?? "",
      classifierVersion: "",
      latencyMs: row.metadata?.latency_ms ?? null,
    },
    state,
    decision,
    contactHistory: [],
  };
}

// ─── Handler principal ─────────────────────────────────────────────

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // Esperamos: ["api", "zernio", "notifications"] o ["api", "zernio", "notifications", ":id", "decide"]
  const isDecideRoute =
    segments.length >= 5 &&
    segments[2] === "notifications" &&
    segments[4] === "decide";

  try {
    if (req.method === "POST" && isDecideRoute) {
      return await handleDecide(req, segments[3]);
    }
    if (req.method === "GET" && segments[2] === "notifications") {
      return await handleList(url);
    }
    return json({ error: "not_found" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[zernio-notifications]", message);
    return json({ error: "server_error", message }, 500);
  }
};

// ─── GET /api/zernio/notifications ─────────────────────────────────

async function handleList(url: URL): Promise<Response> {
  const view = (url.searchParams.get("view") ?? "inbox").toLowerCase();
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 200);

  let rows: any[];
  if (view === "inbox") {
    rows = await db.sql`
      SELECT
        n.id AS notif_id,
        n.estado,
        n.decision_at,
        n.decision_motivo,
        n.created_at,
        c.handle,
        c.zernio_contact_id,
        c.dm_text,
        c.interes_sugerido,
        c.temperatura,
        c.confianza,
        c.sequence_sugerida_id,
        c.tags_sugeridos,
        c.razonamiento,
        c.modelo_usado,
        c.metadata,
        e.recibido_at,
        e.event_id
      FROM zernio_notificaciones n
      JOIN zernio_clasificaciones c ON c.id = n.clasificacion_id
      JOIN zernio_eventos e ON e.id = c.evento_id
      WHERE n.estado = 'pendiente'
      ORDER BY n.created_at DESC
      LIMIT ${limit}
    `;
  } else if (view === "historico") {
    rows = await db.sql`
      SELECT
        n.id AS notif_id,
        n.estado,
        n.decision_at,
        n.decision_motivo,
        n.created_at,
        c.handle,
        c.zernio_contact_id,
        c.dm_text,
        c.interes_sugerido,
        c.temperatura,
        c.confianza,
        c.sequence_sugerida_id,
        c.tags_sugeridos,
        c.razonamiento,
        c.modelo_usado,
        c.metadata,
        e.recibido_at,
        e.event_id
      FROM zernio_notificaciones n
      JOIN zernio_clasificaciones c ON c.id = n.clasificacion_id
      JOIN zernio_eventos e ON e.id = c.evento_id
      WHERE n.estado <> 'pendiente'
      ORDER BY n.decision_at DESC NULLS LAST, n.created_at DESC
      LIMIT ${limit}
    `;
  } else {
    rows = await db.sql`
      SELECT
        n.id AS notif_id,
        n.estado,
        n.decision_at,
        n.decision_motivo,
        n.created_at,
        c.handle,
        c.zernio_contact_id,
        c.dm_text,
        c.interes_sugerido,
        c.temperatura,
        c.confianza,
        c.sequence_sugerida_id,
        c.tags_sugeridos,
        c.razonamiento,
        c.modelo_usado,
        c.metadata,
        e.recibido_at,
        e.event_id
      FROM zernio_notificaciones n
      JOIN zernio_clasificaciones c ON c.id = n.clasificacion_id
      JOIN zernio_eventos e ON e.id = c.evento_id
      ORDER BY n.created_at DESC
      LIMIT ${limit}
    `;
  }

  // Counts agregados (independientes del límite)
  const counts = await db.sql<{ estado: string; n: number }>`
    SELECT estado, COUNT(*)::int AS n
    FROM zernio_notificaciones
    GROUP BY estado
  `;

  const countsByState: Record<string, number> = {};
  for (const c of counts) countsByState[c.estado] = c.n;

  const items = rows.map(rowToFrontend);

  return json({
    items,
    totalCount: items.length,
    counts: {
      pending: countsByState["pendiente"] ?? 0,
      decided:
        (countsByState["decidida_enrolar"] ?? 0) +
        (countsByState["decidida_descartar"] ?? 0) +
        (countsByState["decidida_otro"] ?? 0),
      enrolled: countsByState["decidida_enrolar"] ?? 0,
      discarded: countsByState["decidida_descartar"] ?? 0,
      other: countsByState["decidida_otro"] ?? 0,
    },
  });
}

// ─── POST /api/zernio/notifications/:id/decide ─────────────────────

async function handleDecide(req: Request, notifId: string): Promise<Response> {
  if (!notifId) return json({ error: "missing_id" }, 400);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const type = String(body?.type ?? "").toLowerCase();
  const mapping = DECISION_TYPE_FRONT_TO_SQL[type];
  if (!mapping) return json({ error: "invalid_decision_type" }, 400);

  // Verificar que la notif existe y está pendiente.
  // Traemos también metadata, interes_sugerido y sequence_sugerida_id para
  // poder llamar a Zernio en el caso enroll.
  const existing = await db.sql<{
    id: string;
    estado: string;
    clasificacion_id: string;
    created_at: Date;
    zernio_contact_id: string;
    metadata: any;
    interes_sugerido: string;
    sequence_sugerida_id: string;
  }>`
    SELECT
      n.id, n.estado, n.clasificacion_id, n.created_at,
      c.zernio_contact_id, c.metadata, c.interes_sugerido, c.sequence_sugerida_id
    FROM zernio_notificaciones n
    JOIN zernio_clasificaciones c ON c.id = n.clasificacion_id
    WHERE n.id = ${notifId}
  `;
  if (existing.length === 0) return json({ error: "not_found" }, 404);
  if (existing[0].estado !== "pendiente") {
    return json(
      { error: "already_decided", current_state: existing[0].estado },
      409,
    );
  }

  const clasif = existing[0];
  const metadata = clasif.metadata || {};
  const contactIdInternal: string | null =
    metadata.zernio_contact_id_internal ?? null;

  // Construir motivo legible para la decisión
  let motivo = "";
  if (type === "enroll") motivo = `enrolar:${body.sequenceSlug ?? ""}`;
  else if (type === "discard")
    motivo = body.discardReason
      ? `descartar:${body.discardReason}`
      : "descartar";
  else if (type === "tag") motivo = `tag:${body.tagApplied ?? ""}`;
  else if (type === "promote") motivo = "promote:reactor";

  // ─── ENROLL REAL EN ZERNIO ───────────────────────────────────
  // Si es type='enroll', llamamos a Zernio ANTES de actualizar la BD.
  // Si falla, abortamos: dejamos la notif en pendiente y devolvemos error.
  // De esa forma, un fallo de Zernio no marca la decisión como tomada y
  // Soma puede reintentar desde la UI.

  if (type === "enroll") {
    const sequenceId = resolveSequenceId(
      body.sequenceSlug,
      clasif.sequence_sugerida_id || clasif.interes_sugerido,
    );

    if (!sequenceId) {
      return json(
        {
          error: "no_sequence_match",
          detail: `No hay sequence ID para slug='${body.sequenceSlug}' fallback='${clasif.sequence_sugerida_id || clasif.interes_sugerido}'`,
        },
        400,
      );
    }

    if (!contactIdInternal) {
      // Registrar acción con error claro
      await db.sql`
        INSERT INTO zernio_acciones (
          notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo, error_msg, ejecutado_at
        )
        VALUES (
          ${notifId},
          ${existing[0].zernio_contact_id},
          ${mapping.accionTipo},
          ${JSON.stringify({ ...body, sequenceId })}::jsonb,
          'error',
          ${`enrolar:${body.sequenceSlug ?? ""} sequenceId=${sequenceId}`},
          ${"sin zernio_contact_id_internal en metadata (clasificación pre-resolver)"},
          now()
        )
      `;
      return json(
        {
          error: "no_contact_id_internal",
          detail:
            "La clasificación no tiene zernio_contact_id_internal cacheado (probablemente es anterior al resolver). No se puede enrolar automáticamente: enrólalo a mano desde la UI de Zernio.",
        },
        400,
      );
    }

    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      return json(
        {
          error: "no_zernio_api_key",
          detail: "ZERNIO_API_KEY no configurada en el site imperio-contenido",
        },
        500,
      );
    }

    try {
      const result = await enrollInZernio(
        sequenceId,
        [contactIdInternal],
        apiKey,
      );
      motivo += ` · sequenceId=${sequenceId} contactId=${contactIdInternal}`;
      // result lo descartamos por ahora; en futuras versiones podríamos
      // guardarlo en `detalles` para auditar.
      void result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Registrar acción con error sin tocar el estado de la notif
      await db.sql`
        INSERT INTO zernio_acciones (
          notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo, error_msg, ejecutado_at
        )
        VALUES (
          ${notifId},
          ${contactIdInternal},
          ${mapping.accionTipo},
          ${JSON.stringify({ ...body, sequenceId })}::jsonb,
          'error',
          ${`enrolar:${body.sequenceSlug ?? ""} sequenceId=${sequenceId}`},
          ${errMsg},
          now()
        )
      `;

      return json(
        {
          error: "zernio_enroll_failed",
          detail: errMsg,
          sequenceId,
          contactIdInternal,
        },
        502,
      );
    }
  }

  // ─── Si llegamos aquí: o no es enroll, o el enroll en Zernio fue OK ─

  // 1. Actualizar notificación
  await db.sql`
    UPDATE zernio_notificaciones
    SET estado = ${mapping.estado},
        decision_at = now(),
        decision_motivo = ${motivo}
    WHERE id = ${notifId}
  `;

  // 2. Insertar en log de acciones
  await db.sql`
    INSERT INTO zernio_acciones (
      notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo, ejecutado_at
    )
    VALUES (
      ${notifId},
      ${contactIdInternal ?? existing[0].zernio_contact_id},
      ${mapping.accionTipo},
      ${JSON.stringify(body)}::jsonb,
      'ok',
      ${motivo},
      now()
    )
  `;

  // Calcular timeToDecideSec
  const createdAt = new Date(existing[0].created_at);
  const timeToDecideSec = Math.max(
    0,
    Math.round((Date.now() - createdAt.getTime()) / 1000),
  );

  // Mapear estado SQL → frontend para devolver
  let frontState: string = STATE_SQL_TO_FRONT[mapping.estado] ?? "tagged";
  if (type === "promote") frontState = "promoted";

  return json({
    ok: true,
    id: notifId,
    state: frontState,
    decidedAt: new Date().toISOString(),
    timeToDecideSec,
  });
}

export const config: Config = {
  path: [
    "/api/zernio/notifications",
    "/api/zernio/notifications/:id/decide",
  ],
};
