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
 */

import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";

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
    if (String(row.decision_motivo).toLowerCase().includes("promote") ||
        String(row.decision_motivo).toLowerCase().includes("reactor")) {
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
        row.estado === "decidida_enrolar" ? row.sequence_sugerida_id : undefined,
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

  // Query única con join: notificaciones + clasificaciones + eventos
  // Filtramos por estado según view.
  let estadoFilter = "";
  if (view === "inbox") estadoFilter = "WHERE n.estado = 'pendiente'";
  else if (view === "historico") estadoFilter = "WHERE n.estado <> 'pendiente'";

  // Drizzle ORM-style template no permite interpolar nombres de columnas/cláusulas
  // arbitrariamente. Usamos branches con queries separadas para limpieza.
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

  // Verificar que la notif existe y está pendiente
  const existing = await db.sql<{
    id: string;
    estado: string;
    clasificacion_id: string;
    created_at: Date;
    zernio_contact_id: string;
  }>`
    SELECT n.id, n.estado, n.clasificacion_id, n.created_at, c.zernio_contact_id
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

  // Construir motivo legible para la decisión
  let motivo = "";
  if (type === "enroll") motivo = `enrolar:${body.sequenceSlug ?? ""}`;
  else if (type === "discard")
    motivo = body.discardReason ? `descartar:${body.discardReason}` : "descartar";
  else if (type === "tag")
    motivo = `tag:${body.tagApplied ?? ""}`;
  else if (type === "promote") motivo = "promote:reactor";

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
      ${existing[0].zernio_contact_id},
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
