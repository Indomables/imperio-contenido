/**
 * zernio-webhook.mts — Receptor del webhook de Zernio.
 *
 * Endpoint: POST /api/zernio/webhook
 *
 * Flujo:
 *   1. Verifica firma HMAC del header X-Zernio-Signature (si hay secret).
 *   2. Inserta el evento en zernio_eventos (idempotencia por X-Zernio-Event-Id).
 *      Si ya existía (UNIQUE conflict) → devuelve 200 sin reprocesar.
 *   3. Si tipo = "message.received":
 *        a. Llama a Claude Haiku 4.5 para clasificar (zernio-classify).
 *        b. Aplica reglas duras (zernio-rules).
 *        c. INSERT en zernio_clasificaciones.
 *        d. Si las reglas dicen crear notif → INSERT en zernio_notificaciones.
 *        e. Si NO está en DRY_RUN → etiqueta el contacto en Zernio.
 *        f. Loguea cada paso en zernio_acciones.
 *   4. Si tipo = "message.failed" / "message.read" / "comment.received" / otro:
 *        log mínimo y devuelve 200.
 *   5. Marca zernio_eventos.procesado_at + procesado_ok.
 *
 * Modo DRY_RUN:
 *   - Por defecto activo (env var ZERNIO_DRY_RUN no existe o no es "false").
 *   - En dry-run: clasifica, escribe en zernio_clasificaciones (auditoría),
 *     pero NO crea notificación visible NI etiqueta el contacto en Zernio.
 *   - Para flipar a producción real: añadir env var ZERNIO_DRY_RUN=false.
 *
 * Auth de la Function: protegida por site password de Netlify. Zernio
 * deberá poder bypass-ear esto (típicamente con un header o IP allowlist).
 * Si Zernio no puede saltarse el password, hay que mover esta function a
 * un site separado o usar Edge Function pública.
 */

import type { Context, Config } from "@netlify/functions";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../lib/db.js";
import { classifyDM } from "../lib/zernio-classify.js";
import { applyRules } from "../lib/zernio-rules.js";
import { addTagsToContact } from "../lib/zernio-api.js";

// ─── Helpers ───────────────────────────────────────────────────────

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isDryRun(): boolean {
  // Default seguro: dry-run activo. Solo se desactiva si la env var es exactamente "false".
  const raw = (process.env.ZERNIO_DRY_RUN ?? "true").trim().toLowerCase();
  return raw !== "false";
}

/**
 * Verifica firma HMAC del webhook contra el body raw.
 * Si no hay secret configurado en env, se acepta sin verificar (modo dev).
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[zernio-webhook] ZERNIO_WEBHOOK_SECRET no configurado — saltando verificación HMAC. Configurar antes de producción.",
    );
    return true;
  }
  if (!signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // Comparación timing-safe
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature.replace(/^sha256=/, ""), "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Extrae shape conocida del payload de webhook de Zernio. Defensivo: si
 * algún campo no está, devuelve undefined sin romper.
 */
function parseMessageReceived(payload: any): {
  zernioContactId?: string;
  handle?: string;
  displayName?: string;
  dmText?: string;
  receivedAt?: string;
} {
  const data = payload?.data ?? payload;
  const msg = data?.message ?? data;
  const contact = data?.contact ?? msg?.contact;

  return {
    zernioContactId:
      contact?.id ?? msg?.contactId ?? data?.contactId ?? undefined,
    handle:
      contact?.handle ??
      contact?.username ??
      contact?.platformIdentifier ??
      undefined,
    displayName: contact?.displayName ?? contact?.name ?? undefined,
    dmText: msg?.text ?? msg?.body ?? data?.text ?? undefined,
    receivedAt: msg?.createdAt ?? msg?.received_at ?? payload?.createdAt,
  };
}

// ─── Handler ───────────────────────────────────────────────────────

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // ── 1. Leer body raw para HMAC + headers ────────────────────────
  const rawBody = await req.text();
  const eventId =
    req.headers.get("x-zernio-event-id") ??
    req.headers.get("X-Zernio-Event-Id") ??
    null;
  const signature =
    req.headers.get("x-zernio-signature") ??
    req.headers.get("X-Zernio-Signature") ??
    null;

  if (!eventId) {
    return json({ error: "missing_event_id_header" }, 400);
  }

  // ── 2. Verificar firma ──────────────────────────────────────────
  if (!verifySignature(rawBody, signature)) {
    return json({ error: "invalid_signature" }, 401);
  }

  // ── 3. Parsear JSON ─────────────────────────────────────────────
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const tipoRaw = payload?.type ?? payload?.event ?? "otro";
  const tipo = ([
    "message.received",
    "message.failed",
    "message.read",
    "comment.received",
  ].includes(tipoRaw)
    ? tipoRaw
    : "otro") as
    | "message.received"
    | "message.failed"
    | "message.read"
    | "comment.received"
    | "otro";

  // ── 4. Idempotencia: INSERT en zernio_eventos ───────────────────
  let eventoId: string;
  try {
    const inserted = await db.sql<{ id: string }>`
      INSERT INTO zernio_eventos (event_id, tipo, payload)
      VALUES (${eventId}, ${tipo}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      // Evento ya existía: idempotencia exitosa
      return json({ ok: true, duplicate: true, event_id: eventId });
    }
    eventoId = inserted[0].id;
  } catch (err) {
    return json(
      {
        error: "db_insert_evento_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }

  // ── 5. Procesar según tipo ──────────────────────────────────────
  try {
    if (tipo === "message.received") {
      await procesarMensajeRecibido(eventoId, payload);
    } else {
      // Otros tipos: solo log + marcado de procesado
      await db.sql`
        INSERT INTO zernio_acciones (notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo)
        VALUES (NULL, '', 'otro', ${JSON.stringify({ webhook_tipo: tipo })}::jsonb, 'skip', ${"Evento de tipo " + tipo + " — no requiere clasificación"})
      `;
    }

    await db.sql`
      UPDATE zernio_eventos
      SET procesado_at = now(), procesado_ok = true
      WHERE id = ${eventoId}
    `;

    return json({ ok: true, event_id: eventId, tipo, dry_run: isDryRun() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[zernio-webhook] error procesando:", msg);

    await db.sql`
      UPDATE zernio_eventos
      SET procesado_at = now(), procesado_ok = false, error_msg = ${msg.slice(0, 1000)}
      WHERE id = ${eventoId}
    `;

    return json({ ok: false, event_id: eventId, error: msg.slice(0, 300) }, 500);
  }
};

// ─── Procesamiento de message.received ────────────────────────────

async function procesarMensajeRecibido(
  eventoId: string,
  payload: any,
): Promise<void> {
  const parsed = parseMessageReceived(payload);

  if (!parsed.zernioContactId || !parsed.dmText) {
    // No tenemos lo mínimo para clasificar. Lo dejamos como acción "skip".
    await db.sql`
      INSERT INTO zernio_acciones (notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo)
      VALUES (NULL, ${parsed.zernioContactId ?? ""}, 'otro', ${JSON.stringify({ payload_keys: Object.keys(payload ?? {}) })}::jsonb, 'skip', 'Payload incompleto: falta contactId o texto del DM')
    `;
    return;
  }

  // ── A. Clasificar con Claude Haiku 4.5 ──────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY no configurado");
  }

  const classification = await classifyDM({
    dmText: parsed.dmText,
    contactHandle: parsed.handle,
    contactDisplayName: parsed.displayName,
    apiKey: anthropicKey,
  });

  // ── B. INSERT en zernio_clasificaciones ─────────────────────────
  const clasifRows = await db.sql<{ id: string }>`
    INSERT INTO zernio_clasificaciones (
      evento_id, zernio_contact_id, handle, dm_text,
      interes_sugerido, temperatura, sequence_sugerida_id, tags_sugeridos,
      confianza, razonamiento, modelo_usado, metadata
    )
    VALUES (
      ${eventoId},
      ${parsed.zernioContactId},
      ${parsed.handle ?? ""},
      ${parsed.dmText},
      ${classification.interes_sugerido},
      ${classification.temperatura},
      ${classification.sequence_sugerida_id ?? ""},
      ${classification.tags_sugeridos as any},
      ${classification.confianza},
      ${classification.razonamiento},
      ${classification.modelo_usado},
      ${JSON.stringify({
        latency_ms: classification.latency_ms,
        display_name: parsed.displayName ?? null,
        dry_run: isDryRun(),
      })}::jsonb
    )
    RETURNING id
  `;
  const clasificacionId = clasifRows[0].id;

  // ── C. Aplicar reglas duras ─────────────────────────────────────
  const verdict = applyRules(classification);

  const dry = isDryRun();

  // ── D. Crear notificación si aplica ─────────────────────────────
  let notificacionId: string | null = null;
  if (verdict.createNotification && !dry) {
    const notifRows = await db.sql<{ id: string }>`
      INSERT INTO zernio_notificaciones (clasificacion_id, estado)
      VALUES (${clasificacionId}, 'pendiente')
      RETURNING id
    `;
    notificacionId = notifRows[0].id;
  }

  // ── E. Etiquetar contacto en Zernio (si no es dry-run) ──────────
  const zernioKey = process.env.ZERNIO_API_KEY;
  if (!dry && zernioKey && verdict.tagsToApply.length > 0) {
    try {
      const { before, after } = await addTagsToContact(
        parsed.zernioContactId,
        verdict.tagsToApply,
        zernioKey,
      );
      await db.sql`
        INSERT INTO zernio_acciones (
          notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo, ejecutado_at
        )
        VALUES (
          ${notificacionId},
          ${parsed.zernioContactId},
          'aplicar_tag',
          ${JSON.stringify({ tags_aplicados: verdict.tagsToApply, before, after })}::jsonb,
          'ok',
          ${verdict.motivo},
          now()
        )
      `;
    } catch (err) {
      await db.sql`
        INSERT INTO zernio_acciones (
          notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo, error_msg
        )
        VALUES (
          ${notificacionId},
          ${parsed.zernioContactId},
          'aplicar_tag',
          ${JSON.stringify({ tags_intentados: verdict.tagsToApply })}::jsonb,
          'error',
          ${verdict.motivo},
          ${err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)}
        )
      `;
      // No relanzamos: el error de etiquetado en Zernio no debería tirar el procesado
      console.error("[zernio-webhook] error etiquetando contacto:", err);
    }
  } else {
    // Dry-run o sin tagsToApply: log informativo
    await db.sql`
      INSERT INTO zernio_acciones (
        notificacion_id, zernio_contact_id, tipo, detalles, resultado, motivo
      )
      VALUES (
        ${notificacionId},
        ${parsed.zernioContactId},
        'aplicar_tag',
        ${JSON.stringify({ tags_propuestos: verdict.tagsToApply, dry_run: dry })}::jsonb,
        'skip',
        ${dry ? "DRY_RUN activo · no se etiqueta ni notifica" : verdict.motivo}
      )
    `;
  }
}

export const config: Config = {
  path: ["/api/zernio/webhook"],
};
