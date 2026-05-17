-- ─────────────────────────────────────────────────────────────
-- IMPERIO CONTENIDO · BASELINE MIGRATION
-- v0.42 · 2026-05-17
--
-- Refleja el schema actual de Supabase + añade 'grieta' como
-- 5º formato válido en piezas.formato.
-- ─────────────────────────────────────────────────────────────

-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ═══ IDEAS ═══════════════════════════════════════════════════
-- Captadas (leads, frases, links, semillas de contenido)
CREATE TABLE IF NOT EXISTS ideas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          text NOT NULL DEFAULT '',
  notas           text DEFAULT '',
  notas_internas  text DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ideas_created_at_idx ON ideas (created_at DESC);


-- ═══ PIEZAS ══════════════════════════════════════════════════
-- Pieza concreta de contenido con formato y carril del kanban
CREATE TABLE IF NOT EXISTS piezas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id               uuid REFERENCES ideas(id) ON DELETE SET NULL,
  titulo                text NOT NULL DEFAULT '',
  formato               text NOT NULL,
  columna               text NOT NULL DEFAULT 'desarrollo',
  contenido             jsonb DEFAULT '{}'::jsonb,
  fecha_publicacion     timestamptz,
  plataformas           text[] DEFAULT '{}'::text[],
  url_publicacion       text DEFAULT '',
  notas                 text DEFAULT '',
  kit_broadcast_id      text DEFAULT '',
  instagram_media_id    text DEFAULT '',
  tematica              text DEFAULT '',
  last_synced_at        timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  -- Enums (check constraints)
  CONSTRAINT piezas_formato_check CHECK (
    formato = ANY (ARRAY[
      'email'::text,
      'reel'::text,
      'relampago'::text,
      'youtube'::text,
      'grieta'::text
    ])
  ),
  CONSTRAINT piezas_columna_check CHECK (
    columna = ANY (ARRAY[
      'desarrollo'::text,
      'listo'::text,
      'agendado'::text,
      'publicado'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS piezas_columna_idx ON piezas (columna);
CREATE INDEX IF NOT EXISTS piezas_formato_idx ON piezas (formato);
CREATE INDEX IF NOT EXISTS piezas_idea_idx    ON piezas (idea_id);
CREATE INDEX IF NOT EXISTS piezas_fecha_idx   ON piezas (fecha_publicacion DESC);


-- ═══ MÉTRICAS ════════════════════════════════════════════════
-- Métricas externas (Kit, Zernio, Instagram) sincronizadas por
-- las edge/scheduled functions. JSONB libre por pieza.
CREATE TABLE IF NOT EXISTS metricas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pieza_id    uuid UNIQUE REFERENCES piezas(id) ON DELETE CASCADE,
  datos       jsonb DEFAULT '{}'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS metricas_pieza_idx ON metricas (pieza_id);


-- ═══ SETTINGS ════════════════════════════════════════════════
-- Configuración global key/value
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text NOT NULL DEFAULT '',
  updated_at  timestamptz DEFAULT now()
);


-- ═══ PIEZA_ALIAS ═════════════════════════════════════════════
-- Aliases conversacionales para que Doña Prudencia identifique
-- piezas por su nombre coloquial (ej. "el email del Perdón").
CREATE TABLE IF NOT EXISTS pieza_alias (
  alias       text PRIMARY KEY,
  pieza_id    uuid NOT NULL REFERENCES piezas(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pieza_alias_pieza_idx ON pieza_alias (pieza_id);

COMMENT ON TABLE pieza_alias IS
  'Aliases libres para referirse a piezas. Baby/Doña los aprende en cada conversación: cuando Soma describe una pieza con frases tipo "el email del Perdón" y se identifica una sola pieza candidata (o Soma elige entre varias), se guarda el alias normalizado (lower+trim) apuntando a esa pieza_id. Próximas veces que Soma use la misma frase, lookup directo sin búsqueda por título.';


-- ═══ TRIGGER · updated_at automático ═════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ideas_set_updated_at    ON ideas;
DROP TRIGGER IF EXISTS piezas_set_updated_at   ON piezas;
DROP TRIGGER IF EXISTS metricas_set_updated_at ON metricas;
DROP TRIGGER IF EXISTS settings_set_updated_at ON settings;

CREATE TRIGGER ideas_set_updated_at    BEFORE UPDATE ON ideas    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER piezas_set_updated_at   BEFORE UPDATE ON piezas   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER metricas_set_updated_at BEFORE UPDATE ON metricas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
