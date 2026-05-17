/**
 * CardModal — Modal para editar una idea o una pieza ya existente.
 *
 * Reemplaza al CardModal anterior que tenía modo lectura + edición.
 * Ahora arranca SIEMPRE en edición (esa es la única razón para abrirlo
 * desde el ✎ de la card).
 *
 * Para ver una idea/pieza, el contenido ya está visible en la card del
 * Tablero (título, excerpt, fecha, etc.) — abrir el modal es para tocar.
 *
 * Layout idéntico al NuevaPiezaModal:
 *   · header con badge del formato
 *   · campos pre-poblados con los datos actuales
 *   · misma estructura por formato:
 *       email     → asunto, preheader, cuerpo (RichTextEditor)
 *       youtube   → título del video, descripción, guion (~7 min, RTE)
 *       reel|relampago|grieta → texto (RTE)
 *   · fecha publicación + URL publicación + notas internas
 *
 * El Kit broadcast ID NO está aquí — se edita con el ⚡ de la card.
 * Eliminar tampoco — se hace con el ✕ de la card.
 */

import { useState, useEffect, useRef } from "react";
import RichTextEditor from "./RichTextEditor";

const FORMATO_LABEL = {
  email:     "EMAIL",
  reel:      "REEL",
  relampago: "RELÁMPAGO",
  youtube:   "YOUTUBE",
  grieta:    "GRIETA",
};

export default function CardModal({ kind, data, onClose, onUpdate }) {
  // Reset del state cada vez que cambia la pieza/idea seleccionada
  const [draft, setDraft] = useState(() => initialDraft(kind, data));
  const [saving, setSaving] = useState(false);
  const tituloRef = useRef(null);

  useEffect(() => {
    setDraft(initialDraft(kind, data));
  }, [kind, data]);

  useEffect(() => {
    if (tituloRef.current) tituloRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setContenidoField(key, value) {
    setDraft((d) => ({ ...d, contenido: { ...d.contenido, [key]: value } }));
  }

  async function handleSave() {
    if (!draft.titulo?.trim()) {
      tituloRef.current?.focus();
      return;
    }
    try {
      setSaving(true);
      // Para idea: solo enviamos los campos editables (titulo, notas, notas_internas)
      // Para pieza: el draft tiene todos los campos. Conservamos lo que ya
      // tenía la pieza (kit_broadcast_id, columna, plataformas, idea_id, etc.)
      // que no se modifican aquí.
      await onUpdate(draft);
      onClose();
    } catch (e) {
      alert(`Error al guardar: ${e.message || e}`);
      setSaving(false);
    }
  }

  const isPieza = kind === "pieza";
  const formatoBadge = isPieza ? FORMATO_LABEL[draft.formato] || draft.formato : null;

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel np-panel" onClick={(e) => e.stopPropagation()}>

        <header className="cm-head">
          <div className="cm-head-l">
            <span className="cm-kind">{isPieza ? "EDITAR PIEZA" : "EDITAR IDEA"}</span>
            {isPieza && (
              <span className={`cm-badge t-${draft.formato}`}>{formatoBadge}</span>
            )}
          </div>
          <div className="cm-head-r">
            <button type="button" className="cm-x" onClick={onClose} title="Cerrar (ESC)">×</button>
          </div>
        </header>

        <div className="cm-body">
          {isPieza
            ? <PiezaFields draft={draft} setField={setField} setContenidoField={setContenidoField} tituloRef={tituloRef} />
            : <IdeaFields draft={draft} setField={setField} tituloRef={tituloRef} />
          }
        </div>

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-primary"
            onClick={handleSave}
            disabled={saving || !draft.titulo?.trim()}
          >
            {saving ? "Guardando…" : isPieza ? "Guardar pieza" : "Guardar idea"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function initialDraft(kind, data) {
  if (kind === "idea") {
    return {
      titulo:         data.titulo || "",
      notas:          data.notas || "",
      notas_internas: data.notas_internas || "",
    };
  }
  // Pieza — preservamos los campos NO editables aquí (kit_broadcast_id,
  // columna, plataformas, idea_id) para que el PATCH no los pise a null.
  return {
    titulo:            data.titulo || "",
    formato:           data.formato,
    columna:           data.columna,
    plataformas:       data.plataformas || [],
    contenido:         data.contenido || {},
    fecha_publicacion: data.fecha_publicacion || null,
    url_publicacion:   data.url_publicacion || "",
    notas:             data.notas || "",
    tematica:          data.tematica || "",
    kit_broadcast_id:  data.kit_broadcast_id || "",
    idea_id:           data.idea_id || null,
  };
}

// ─── IDEA ───────────────────────────────────────────────────────

function IdeaFields({ draft, setField, tituloRef }) {
  return (
    <>
      <label className="np-label">
        <span className="np-label-tx">Título <span style={{ color: "var(--acc)" }}>*</span></span>
        <input
          ref={tituloRef}
          type="text"
          className="np-input"
          value={draft.titulo}
          onChange={(e) => setField("titulo", e.target.value)}
          placeholder="El núcleo de la idea, en una línea"
          maxLength={200}
        />
      </label>

      <label className="np-label">
        <span className="np-label-tx">Copy</span>
        <textarea
          className="np-textarea"
          value={draft.notas}
          onChange={(e) => setField("notas", e.target.value)}
          placeholder="El desarrollo de la idea…"
          rows={6}
        />
      </label>

      <label className="np-label">
        <span className="np-label-tx">Notas internas</span>
        <textarea
          className="np-textarea"
          value={draft.notas_internas}
          onChange={(e) => setField("notas_internas", e.target.value)}
          placeholder="Apuntes solo para ti — origen, referencias, contexto…"
          rows={3}
        />
      </label>
    </>
  );
}

// ─── PIEZA ──────────────────────────────────────────────────────

function PiezaFields({ draft, setField, setContenidoField, tituloRef }) {
  const c = draft.contenido || {};
  const f = draft.formato;
  // Etiqueta del guion: incluye duración orientativa para YouTube
  const guionLabel = f === "youtube" ? "Guion (~7 min)" : "Guion";

  return (
    <>
      <label className="np-label">
        <span className="np-label-tx">Título interno <span style={{ color: "var(--acc)" }}>*</span></span>
        <input
          ref={tituloRef}
          type="text"
          className="np-input"
          value={draft.titulo}
          onChange={(e) => setField("titulo", e.target.value)}
          placeholder="Cómo distingues internamente esta pieza"
          maxLength={200}
        />
      </label>

      <div className="np-divider"><span>Contenido</span></div>

      {f === "email" && (
        <>
          <label className="np-label">
            <span className="np-label-tx">Asunto</span>
            <input
              type="text"
              className="np-input"
              value={c.asunto || ""}
              onChange={(e) => setContenidoField("asunto", e.target.value)}
              placeholder="La línea que abre o no la abre…"
            />
          </label>
          <label className="np-label">
            <span className="np-label-tx">Preheader</span>
            <input
              type="text"
              className="np-input"
              value={c.preheader || ""}
              onChange={(e) => setContenidoField("preheader", e.target.value)}
              placeholder="El texto que aparece en la bandeja de entrada…"
            />
          </label>
          <div className="np-label">
            <span className="np-label-tx">Cuerpo (~500 palabras)</span>
            <RichTextEditor
              initialHtml={c.cuerpo || ""}
              onChange={(html) => setContenidoField("cuerpo", html)}
              placeholder="Escribe aquí…"
            />
          </div>
        </>
      )}

      {f === "youtube" && (
        <>
          <label className="np-label">
            <span className="np-label-tx">Título del vídeo</span>
            <input
              type="text"
              className="np-input"
              value={c.titulo_video || ""}
              onChange={(e) => setContenidoField("titulo_video", e.target.value)}
              placeholder="Cómo se llama el video en YouTube"
            />
          </label>
          <label className="np-label">
            <span className="np-label-tx">Descripción</span>
            <textarea
              className="np-textarea"
              value={c.descripcion || ""}
              onChange={(e) => setContenidoField("descripcion", e.target.value)}
              placeholder="Descripción del vídeo…"
              rows={4}
            />
          </label>
          <div className="np-label">
            <span className="np-label-tx">{guionLabel}</span>
            <RichTextEditor
              initialHtml={c.guion || ""}
              onChange={(html) => setContenidoField("guion", html)}
              placeholder="Escribe el guion aquí…"
            />
          </div>
        </>
      )}

      {(f === "reel" || f === "relampago" || f === "grieta") && (
        <div className="np-label">
          <span className="np-label-tx">Texto</span>
          <RichTextEditor
            initialHtml={c.texto || ""}
            onChange={(html) => setContenidoField("texto", html)}
            placeholder="Escribe aquí…"
          />
        </div>
      )}

      <div className="np-divider"><span>Publicación</span></div>

      <div className="np-row-2">
        <label className="np-label">
          <span className="np-label-tx">Fecha de publicación</span>
          <input
            type="datetime-local"
            className="np-input"
            step="300"
            value={draft.fecha_publicacion ? new Date(draft.fecha_publicacion).toISOString().slice(0, 16) : ""}
            onChange={(e) => setField("fecha_publicacion", e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
        </label>
        <label className="np-label">
          <span className="np-label-tx">URL publicación</span>
          <input
            type="url"
            className="np-input"
            value={draft.url_publicacion}
            onChange={(e) => setField("url_publicacion", e.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>

      <label className="np-label">
        <span className="np-label-tx">Notas internas</span>
        <textarea
          className="np-textarea"
          value={draft.notas}
          onChange={(e) => setField("notas", e.target.value)}
          placeholder="Notas de producción, referencias, lo que sea…"
          rows={4}
        />
      </label>
    </>
  );
}
