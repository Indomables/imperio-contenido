/**
 * CardModal — Detalle y edición de una idea o pieza.
 *
 * Modo lectura (default): muestra contenido HTML rendered.
 * Modo edición: textareas raw editables → guardar persiste vía API.
 *
 * Para piezas, el contenido depende del formato:
 *  · email      → { asunto, preheader, cuerpo }
 *  · youtube    → { titulo_video, guion, descripcion }
 *  · reel       → { texto }
 *  · relampago  → { texto }
 *  · grieta     → { texto }
 */

import { useState, useEffect } from "react";

const FORMATO_LABEL = {
  email: "Email", youtube: "YouTube", reel: "Reel",
  relampago: "Relámpago", grieta: "Grieta",
};

const COLUMNAS = ["desarrollo", "listo", "agendado", "publicado"];

export default function CardModal({ kind, data, onClose, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // ESC cierra
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset draft cuando cambia la data subyacente
  useEffect(() => {
    if (kind === "idea") {
      setDraft({
        titulo: data.titulo || "",
        notas: data.notas || "",
        notas_internas: data.notas_internas || "",
      });
    } else {
      setDraft({
        titulo: data.titulo || "",
        formato: data.formato,
        columna: data.columna,
        contenido: data.contenido || {},
        notas: data.notas || "",
        tematica: data.tematica || "",
        fecha_publicacion: data.fecha_publicacion || "",
        url_publicacion: data.url_publicacion || "",
      });
    }
  }, [data, kind]);

  if (!draft) return null;

  async function handleSave() {
    try {
      setSaving(true);
      await onUpdate(draft);
      setEditing(false);
    } catch (e) {
      alert(`Error al guardar: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setContenidoField(key, value) {
    setDraft((d) => ({ ...d, contenido: { ...d.contenido, [key]: value } }));
  }

  const title = kind === "idea"
    ? data.titulo || "(idea sin título)"
    : `${FORMATO_LABEL[data.formato] || data.formato} · ${data.titulo || "(sin título)"}`;

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel" onClick={(e) => e.stopPropagation()}>
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <span className="screw tl"></span>
        <span className="screw tr"></span>
        <span className="screw bl"></span>
        <span className="screw br"></span>

        <header className="cm-head">
          <div className="cm-head-l">
            <span className="cm-kind">{kind === "idea" ? "IDEA" : "PIEZA"}</span>
            <span className="cm-div">/</span>
            <span className="cm-title">{title}</span>
          </div>
          <div className="cm-head-r">
            {!editing ? (
              <button className="cm-btn" onClick={() => setEditing(true)}>Editar</button>
            ) : (
              <>
                <button className="cm-btn" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
                <button className="cm-btn primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </>
            )}
            <button className="cm-btn danger" onClick={onDelete}>Eliminar</button>
            <button className="cm-close" onClick={onClose} title="Cerrar (ESC)">✕</button>
          </div>
        </header>

        <div className="cm-body">
          {kind === "idea" ? (
            <IdeaForm draft={draft} editing={editing} setField={setField} />
          ) : (
            <PiezaForm
              draft={draft} editing={editing}
              setField={setField} setContenidoField={setContenidoField}
            />
          )}
        </div>

        <footer className="cm-foot">
          <span className="cm-meta">ID · {data.id}</span>
          <span className="cm-meta">
            ACT · {data.updated_at ? new Date(data.updated_at).toLocaleString("es-ES") : "—"}
          </span>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="cm-field">
      <div className="cm-label">{label}</div>
      <div className="cm-value">{children}</div>
    </div>
  );
}

function ReadHtml({ html }) {
  if (!html) return <span className="cm-empty">—</span>;
  return <div className="cm-html" dangerouslySetInnerHTML={{ __html: html }} />;
}

function IdeaForm({ draft, editing, setField }) {
  return (
    <>
      <Field label="Título">
        {editing ? (
          <input className="cm-input" value={draft.titulo} onChange={(e) => setField("titulo", e.target.value)} />
        ) : (
          <div className="cm-text">{draft.titulo || <span className="cm-empty">(sin título)</span>}</div>
        )}
      </Field>
      <Field label="Notas">
        {editing ? (
          <textarea className="cm-textarea" rows={14} value={draft.notas} onChange={(e) => setField("notas", e.target.value)} />
        ) : (
          <ReadHtml html={draft.notas} />
        )}
      </Field>
      <Field label="Notas internas">
        {editing ? (
          <textarea className="cm-textarea" rows={6} value={draft.notas_internas} onChange={(e) => setField("notas_internas", e.target.value)} />
        ) : (
          draft.notas_internas
            ? <div className="cm-text" style={{ whiteSpace: "pre-wrap" }}>{draft.notas_internas}</div>
            : <span className="cm-empty">—</span>
        )}
      </Field>
    </>
  );
}

function PiezaForm({ draft, editing, setField, setContenidoField }) {
  const c = draft.contenido || {};
  return (
    <>
      <div className="cm-row">
        <Field label="Título">
          {editing ? (
            <input className="cm-input" value={draft.titulo} onChange={(e) => setField("titulo", e.target.value)} />
          ) : (
            <div className="cm-text">{draft.titulo || <span className="cm-empty">(sin título)</span>}</div>
          )}
        </Field>
        <Field label="Columna">
          {editing ? (
            <select className="cm-input" value={draft.columna} onChange={(e) => setField("columna", e.target.value)}>
              {COLUMNAS.map((col) => <option key={col} value={col}>{col}</option>)}
            </select>
          ) : (
            <div className="cm-text">{draft.columna}</div>
          )}
        </Field>
      </div>

      {draft.formato === "email" && (
        <>
          <Field label="Asunto">
            {editing ? (
              <input className="cm-input" value={c.asunto || ""} onChange={(e) => setContenidoField("asunto", e.target.value)} />
            ) : (
              <div className="cm-text">{c.asunto || <span className="cm-empty">—</span>}</div>
            )}
          </Field>
          <Field label="Preheader">
            {editing ? (
              <input className="cm-input" value={c.preheader || ""} onChange={(e) => setContenidoField("preheader", e.target.value)} />
            ) : (
              <div className="cm-text">{c.preheader || <span className="cm-empty">—</span>}</div>
            )}
          </Field>
          <Field label="Cuerpo">
            {editing ? (
              <textarea className="cm-textarea" rows={18} value={c.cuerpo || ""} onChange={(e) => setContenidoField("cuerpo", e.target.value)} />
            ) : (
              <ReadHtml html={c.cuerpo} />
            )}
          </Field>
        </>
      )}

      {draft.formato === "youtube" && (
        <>
          <Field label="Título del video">
            {editing ? (
              <input className="cm-input" value={c.titulo_video || ""} onChange={(e) => setContenidoField("titulo_video", e.target.value)} />
            ) : (
              <div className="cm-text">{c.titulo_video || <span className="cm-empty">—</span>}</div>
            )}
          </Field>
          <Field label="Guion">
            {editing ? (
              <textarea className="cm-textarea" rows={20} value={c.guion || ""} onChange={(e) => setContenidoField("guion", e.target.value)} />
            ) : (
              <ReadHtml html={c.guion} />
            )}
          </Field>
          <Field label="Descripción">
            {editing ? (
              <textarea className="cm-textarea" rows={4} value={c.descripcion || ""} onChange={(e) => setContenidoField("descripcion", e.target.value)} />
            ) : (
              c.descripcion ? <div className="cm-text" style={{ whiteSpace: "pre-wrap" }}>{c.descripcion}</div> : <span className="cm-empty">—</span>
            )}
          </Field>
        </>
      )}

      {(draft.formato === "reel" || draft.formato === "relampago" || draft.formato === "grieta") && (
        <Field label="Texto">
          {editing ? (
            <textarea className="cm-textarea" rows={16} value={c.texto || ""} onChange={(e) => setContenidoField("texto", e.target.value)} />
          ) : (
            <ReadHtml html={c.texto} />
          )}
        </Field>
      )}

      <div className="cm-row">
        <Field label="Fecha publicación">
          {editing ? (
            <input className="cm-input" type="datetime-local"
              value={draft.fecha_publicacion ? new Date(draft.fecha_publicacion).toISOString().slice(0, 16) : ""}
              onChange={(e) => setField("fecha_publicacion", e.target.value ? new Date(e.target.value).toISOString() : null)} />
          ) : (
            <div className="cm-text">
              {draft.fecha_publicacion
                ? new Date(draft.fecha_publicacion).toLocaleString("es-ES")
                : <span className="cm-empty">—</span>}
            </div>
          )}
        </Field>
        <Field label="URL publicación">
          {editing ? (
            <input className="cm-input" value={draft.url_publicacion} onChange={(e) => setField("url_publicacion", e.target.value)} />
          ) : (
            draft.url_publicacion
              ? <a className="cm-text" style={{ color: "var(--acc)" }} href={draft.url_publicacion} target="_blank" rel="noreferrer">{draft.url_publicacion}</a>
              : <span className="cm-empty">—</span>
          )}
        </Field>
      </div>

      <Field label="Temática">
        {editing ? (
          <input className="cm-input" value={draft.tematica} onChange={(e) => setField("tematica", e.target.value)} />
        ) : (
          <div className="cm-text">{draft.tematica || <span className="cm-empty">—</span>}</div>
        )}
      </Field>

      <Field label="Notas internas">
        {editing ? (
          <textarea className="cm-textarea" rows={4} value={draft.notas} onChange={(e) => setField("notas", e.target.value)} />
        ) : (
          draft.notas
            ? <div className="cm-text" style={{ whiteSpace: "pre-wrap" }}>{draft.notas}</div>
            : <span className="cm-empty">—</span>
        )}
      </Field>
    </>
  );
}
