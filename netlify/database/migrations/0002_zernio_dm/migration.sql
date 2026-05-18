-- ─────────────────────────────────────────────────────────────
-- IMPERIO CONTENIDO · ZERNIO DM (Fase 3)
-- 2026-05-18
--
-- Almacena el flujo de DMs entrantes de Instagram vía Zernio:
--   1. Eventos crudos del webhook (idempotencia por X-Zernio-Event-Id).
--   2. Clasificación de la IA (intención, temperatura, sugerencia).
--   3. Notificación que Soma revisa en la UI (1:1 con clasificación).
--   4. Log de auditoría de acciones derivadas (enrolar, tag, etc).
--
-- Contactos Zernio NO se mezclan con la tabla `contactos` del Reactor.
-- Solo se guardan zernio_contact_id + handle. La promoción a contacto
-- del Reactor (cross-project) se registra en zernio_acciones.
-- ─────────────────────────────────────────────────────────────


-- ═══ ZERNIO_EVENTOS ══════════════════════════════════════════
-- Cada webhook entrante de Zernio. event_id UNIQUE garantiza
-- idempotencia: si Zernio reintenta, el INSERT falla y la edge
-- function devuelve 200 sin reprocesar.
CREATE TABLE IF NOT EXISTS zernio_eventos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text NOT NULL UNIQUE,
  tipo            text NOT NULL,
  payload         jsonb NOT NULL,
  recibido_at     timestamptz DEFAULT now(),
  procesado_at    timestamptz,
  procesado_ok    boolean,
  error_msg       text DEFAULT '',

  CONSTRAINT zernio_eventos_tipo_check CHECK (
    tipo = ANY (ARRAY[
      'message.received'::text,
      'message.failed'::text,
      'message.read'::text,
      'comment.received'::text,
      'otro'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS zernio_eventos_recibido_idx   ON zernio_eventos (recibido_at DESC);
CREATE INDEX IF NOT EXISTS zernio_eventos_tipo_idx       ON zernio_eventos (tipo);
CREATE INDEX IF NOT EXISTS zernio_eventos_pendientes_idx ON zernio_eventos (recibido_at) WHERE procesado_at IS NULL;


-- ═══ ZERNIO_CLASIFICACIONES ══════════════════════════════════
-- Lo que dice la IA sobre el DM. Una clasificación por evento
-- clasificable. Si la confianza es < 0.5, se guarda igual (para
-- histórico) pero la edge function aplica tag `requiere-revision`
-- en Zernio y NO crea notificación.
CREATE TABLE IF NOT EXISTS zernio_clasificaciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id             uuid NOT NULL UNIQUE REFERENCES zernio_eventos(id) ON DELETE CASCADE,
  zernio_contact_id     text NOT NULL,
  handle                text NOT NULL DEFAULT '',
  dm_text               text NOT NULL DEFAULT '',
  interes_sugerido      text NOT NULL,
  temperatura           text NOT NULL DEFAULT 'tibio',
  sequence_sugerida_id  text DEFAULT '',
  tags_sugeridos        text[] DEFAULT '{}'::text[],
  confianza             numeric(4,3) NOT NULL,
  razonamiento          text DEFAULT '',
  modelo_usado          text DEFAULT '',
  metadata              jsonb DEFAULT '{}'::jsonb,
  created_at            timestamptz DEFAULT now(),

  CONSTRAINT zernio_clasificaciones_interes_check CHECK (
    interes_sugerido = ANY (ARRAY[
      'int-hermandad'::text,
      'int-elite'::text,
      'int-general'::text,
      'sin-interes'::text,
      'requiere-revision'::text
    ])
  ),
  CONSTRAINT zernio_clasificaciones_temp_check CHECK (
    temperatura = ANY (ARRAY[
      'frio'::text,
      'tibio'::text,
      'caliente'::text
    ])
  ),
  CONSTRAINT zernio_clasificaciones_confianza_check CHECK (
    confianza >= 0 AND confianza <= 1
  )
);

CREATE INDEX IF NOT EXISTS zernio_clasificaciones_contact_idx ON zernio_clasificaciones (zernio_contact_id);
CREATE INDEX IF NOT EXISTS zernio_clasificaciones_interes_idx ON zernio_clasificaciones (interes_sugerido);
CREATE INDEX IF NOT EXISTS zernio_clasificaciones_created_idx ON zernio_clasificaciones (created_at DESC);


-- ═══ ZERNIO_NOTIFICACIONES ═══════════════════════════════════
-- Lo que Soma revisa en la nueva pestaña de Imperio Contenido.
-- 1:1 con clasificación (UNIQUE en clasificacion_id). Estados:
--   - pendiente: Soma todavía no ha decidido
--   - decidida_enrolar: Soma confirmó, se ejecutó enrolamiento
--   - decidida_descartar: Soma descartó como no-lead
--   - decidida_otro: Soma eligió otra acción (tag familiar/amigo/
--     promover al Reactor, etc.) — el detalle vive en zernio_acciones
--
-- Las notificaciones NO se borran nunca. Retención infinita.
CREATE TABLE IF NOT EXISTS zernio_notificaciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clasificacion_id    uuid NOT NULL UNIQUE REFERENCES zernio_clasificaciones(id) ON DELETE CASCADE,
  estado              text NOT NULL DEFAULT 'pendiente',
  decision_at         timestamptz,
  decision_motivo     text DEFAULT '',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT zernio_notificaciones_estado_check CHECK (
    estado = ANY (ARRAY[
      'pendiente'::text,
      'decidida_enrolar'::text,
      'decidida_descartar'::text,
      'decidida_otro'::text
    ])
  ),
  CONSTRAINT zernio_notificaciones_decision_coherence_check CHECK (
    (estado = 'pendiente' AND decision_at IS NULL)
    OR (estado <> 'pendiente' AND decision_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS zernio_notificaciones_estado_idx      ON zernio_notificaciones (estado);
CREATE INDEX IF NOT EXISTS zernio_notificaciones_pendientes_idx  ON zernio_notificaciones (created_at DESC) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS zernio_notificaciones_decision_idx    ON zernio_notificaciones (decision_at DESC) WHERE decision_at IS NOT NULL;


-- ═══ ZERNIO_ACCIONES ═════════════════════════════════════════
-- Log de auditoría. Cada acción que la edge function intenta o
-- ejecuta queda aquí. Incluye acciones bloqueadas por reglas
-- duras (resultado = 'skip' + motivo).
--
-- notificacion_id puede ser NULL para acciones que no derivan
-- de una notificación visible (ej. tag automático de
-- 'requiere-revision' por baja confianza).
--
-- ON DELETE SET NULL para preservar el histórico aunque se
-- elimine una notificación.
CREATE TABLE IF NOT EXISTS zernio_acciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notificacion_id     uuid REFERENCES zernio_notificaciones(id) ON DELETE SET NULL,
  zernio_contact_id   text NOT NULL DEFAULT '',
  tipo                text NOT NULL,
  detalles            jsonb DEFAULT '{}'::jsonb,
  resultado           text NOT NULL DEFAULT 'pendiente',
  motivo              text DEFAULT '',
  error_msg           text DEFAULT '',
  ejecutado_at        timestamptz,
  created_at          timestamptz DEFAULT now(),

  CONSTRAINT zernio_acciones_tipo_check CHECK (
    tipo = ANY (ARRAY[
      'enrolar_sequence'::text,
      'desenrolar_sequence'::text,
      'aplicar_tag'::text,
      'quitar_tag'::text,
      'promover_a_reactor'::text,
      'descartar'::text,
      'otro'::text
    ])
  ),
  CONSTRAINT zernio_acciones_resultado_check CHECK (
    resultado = ANY (ARRAY[
      'pendiente'::text,
      'ok'::text,
      'error'::text,
      'skip'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS zernio_acciones_notif_idx    ON zernio_acciones (notificacion_id);
CREATE INDEX IF NOT EXISTS zernio_acciones_contact_idx  ON zernio_acciones (zernio_contact_id);
CREATE INDEX IF NOT EXISTS zernio_acciones_tipo_idx     ON zernio_acciones (tipo);
CREATE INDEX IF NOT EXISTS zernio_acciones_created_idx  ON zernio_acciones (created_at DESC);


-- ═══ TRIGGER · updated_at automático ═════════════════════════
-- Solo zernio_notificaciones tiene updated_at: cambia cuando
-- Soma decide. Los eventos y clasificaciones son inmutables
-- (su histórico vive en acciones).

DROP TRIGGER IF EXISTS zernio_notificaciones_set_updated_at ON zernio_notificaciones;

CREATE TRIGGER zernio_notificaciones_set_updated_at BEFORE UPDATE ON zernio_notificaciones FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══ COMENTARIOS ═════════════════════════════════════════════
COMMENT ON TABLE zernio_eventos IS
  'Webhooks crudos de Zernio. event_id UNIQUE = idempotencia. payload jsonb conserva el cuerpo entero del webhook para auditoría y reprocesado si hace falta.';

COMMENT ON TABLE zernio_clasificaciones IS
  'Salida de la IA al clasificar un DM. 1:1 con evento clasificable. Si confianza < 0.5, NO se crea notificación; la edge function aplica tag `requiere-revision` en Zernio y queda registrada en zernio_acciones.';

COMMENT ON TABLE zernio_notificaciones IS
  'Pestaña de revisión humana. 1:1 con clasificacion_id. Soma decide aquí. Las notificaciones nunca se borran (retención infinita) — cambian de estado a decidida_* con decision_at.';

COMMENT ON TABLE zernio_acciones IS
  'Auditoría de toda acción que la edge function intenta. Incluye acciones bloqueadas por reglas duras (resultado=skip + motivo). Si notificacion_id queda NULL es porque la acción es automática (ej. tag por baja confianza) o porque se eliminó la notificación origen.';
