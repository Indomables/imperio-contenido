/**
 * NuevaPiezaModal — Modal completo para crear una pieza nueva.
 *
 * Reemplaza al flujo anterior de pasos. Muestra todos los campos
 * en una sola vista, con los campos de contenido que cambian según
 * el formato elegido.
 *
 * Si se pasa `ideaId`, la pieza queda vinculada a esa idea. El header
 * muestra "DESDE «<idea_title>»" en ese caso.
 *
 * Estructura del JSON que envía a la API:
 *   {
 *     titulo: string,                          // título INTERNO
 *     formato: "email"|"reel"|"relampago"|"youtube"|"grieta",
 *     columna: "desarrollo",                   // siempre arranca aquí
 *     plataformas: ["Kit"] | ["Acumbamail"] | [],
 *     contenido: { ...campos según formato },
 *     fecha_publicacion: ISO | null,
 *     url_publicacion: string,
 *     notas: string,                           // notas internas
 *     idea_id?: string
 *   }
 */

import { useState, useEffect, useRef } from "react";
import RichTextEditor from "./RichTextEditor";

const FORMATOS = [
  { value: "email",     label: "Email" },
  { value: "reel",      label: "Reel" },
  { value: "relampago", label: "Relámpago" },
  { value: "youtube",   label: "YouTube" },
  { value: "grieta",    label: "Grieta" },
];

const PLATAFORMAS_EMAIL = [
  { value: "Kit",        label: "Kit" },
  { value: "Acumbamail", label: "Acumbamail" },
];

export default function NuevaPiezaModal({ ideaId = null, ideaTitle = null, onClose, onCreate }) {
  const [titulo, setTitulo] = useState("");
  const [formato, setFormato] = useState("email");
  const [plataforma, setPlataforma] = useState("Kit");
  const [contenido, setContenido] = useState({}); // campos varían por formato
  const [fechaPublicacion, setFechaPublicacion] = useState("");
  const [urlPublicacion, setUrlPublicacion] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [saving, setSaving] = useState(false);
  const tituloRef = useRef(null);

  useEffect(() => {
    if (tituloRef.current) tituloRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setContenidoField(key, value) {
    setContenido((c) => ({ ...c, [key]: value }));
  }

  function handleFormatoChange(newFormato) {
    setFormato(newFormato);
    if (newFormato !== "email") setPlataforma(null);
    else if (!plataforma) setPlataforma("Kit");
  }

  async function handleSave() {
    if (!titulo.trim()) {
      tituloRef.current?.focus();
      return;
    }
    const plataformas = formato === "email" && plataforma ? [plataforma] : [];
    const payload = {
      titulo: titulo.trim(),
      formato,
      columna: "desarrollo",
      plataformas,
      contenido,
      fecha_publicacion: fechaPublicacion
        ? new Date(fechaPublicacion).toISOString()
        : null,
      url_publicacion: urlPublicacion.trim(),
      notas: notasInternas.trim(),
      idea_id: ideaId,
    };
    try {
      setSaving(true);
      await onCreate(payload);
      onClose();
    } catch (e) {
      alert(`Error al crear: ${e.message || e}`);
      setSaving(false);
    }
  }

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel np-panel" onClick={(e) => e.stopPropagation()}>
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <span className="screw tl"></span>
        <span className="screw tr"></span>
        <span className="screw bl"></span>
        <span className="screw br"></span>

        <header className="cm-head">
          <div className="cm-head-l">
            <span className="cm-kind">NUEVA PIEZA</span>
            {ideaTitle && (
              <>
                <span className="cm-div">·</span>
                <span className="cm-title">DESDE «{ideaTitle}»</span>
              </>
            )}
          </div>
          <div className="cm-head-r">
            <button type="button" className="cm-x" onClick={onClose} title="Cerrar (ESC)">×</button>
          </div>
        </header>

        <div className="cm-body">
          {/* ─── Título interno ─── */}
          <label className="np-label">
            <span className="np-label-tx">Título interno <span style={{ color: "var(--acc)" }}>*</span></span>
            <input
              ref={tituloRef}
              type="text"
              className="np-input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Cómo distingues internamente esta pieza"
              maxLength={200}
            />
          </label>

          {/* ─── Formato ─── */}
          <div className="np-label">
            <span className="np-label-tx">Formato</span>
            <div className="np-chip-row">
              {FORMATOS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`np-chip t-${f.value} ${formato === f.value ? "on" : ""}`}
                  onClick={() => handleFormatoChange(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Lista de envío (solo email) ─── */}
          {formato === "email" && (
            <div className="np-label">
              <span className="np-label-tx">Lista de envío</span>
              <div className="np-chip-row">
                {PLATAFORMAS_EMAIL.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`np-chip ${plataforma === p.value ? "on" : ""}`}
                    onClick={() => setPlataforma(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Sección CONTENIDO ─── */}
          <div className="np-divider"><span>Contenido</span></div>

          {formato === "email" && (
            <>
              <label className="np-label">
                <span className="np-label-tx">Asunto</span>
                <input
                  type="text"
                  className="np-input"
                  value={contenido.asunto || ""}
                  onChange={(e) => setContenidoField("asunto", e.target.value)}
                  placeholder="La línea que abre o no la abre…"
                />
              </label>
              <label className="np-label">
                <span className="np-label-tx">Preheader</span>
                <input
                  type="text"
                  className="np-input"
                  value={contenido.preheader || ""}
                  onChange={(e) => setContenidoField("preheader", e.target.value)}
                  placeholder="El texto que aparece en la bandeja de entrada…"
                />
              </label>
              <div className="np-label">
                <span className="np-label-tx">Cuerpo (~500 palabras)</span>
                <RichTextEditor
                  initialHtml=""
                  onChange={(html) => setContenidoField("cuerpo", html)}
                  placeholder="Escribe aquí…"
                />
              </div>
            </>
          )}

          {formato === "youtube" && (
            <>
              <label className="np-label">
                <span className="np-label-tx">Título del video</span>
                <input
                  type="text"
                  className="np-input"
                  value={contenido.titulo_video || ""}
                  onChange={(e) => setContenidoField("titulo_video", e.target.value)}
                  placeholder="Cómo se llama el video en YouTube"
                />
              </label>
              <div className="np-label">
                <span className="np-label-tx">Guion</span>
                <RichTextEditor
                  initialHtml=""
                  onChange={(html) => setContenidoField("guion", html)}
                  placeholder="Escribe el guion aquí…"
                />
              </div>
              <label className="np-label">
                <span className="np-label-tx">Descripción</span>
                <textarea
                  className="np-textarea"
                  value={contenido.descripcion || ""}
                  onChange={(e) => setContenidoField("descripcion", e.target.value)}
                  placeholder="Lo que va debajo del video en YouTube"
                  rows={4}
                />
              </label>
            </>
          )}

          {(formato === "reel" || formato === "relampago" || formato === "grieta") && (
            <div className="np-label">
              <span className="np-label-tx">Texto</span>
              <RichTextEditor
                initialHtml=""
                onChange={(html) => setContenidoField("texto", html)}
                placeholder="Escribe aquí…"
              />
            </div>
          )}

          {/* ─── Sección PUBLICACIÓN ─── */}
          <div className="np-divider"><span>Publicación</span></div>

          <div className="np-row-2">
            <label className="np-label">
              <span className="np-label-tx">Fecha de publicación</span>
              <input
                type="datetime-local"
                className="np-input"
                value={fechaPublicacion}
                onChange={(e) => setFechaPublicacion(e.target.value)}
              />
            </label>
            <label className="np-label">
              <span className="np-label-tx">URL publicación</span>
              <input
                type="url"
                className="np-input"
                value={urlPublicacion}
                onChange={(e) => setUrlPublicacion(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>

          <label className="np-label">
            <span className="np-label-tx">Notas internas</span>
            <textarea
              className="np-textarea"
              value={notasInternas}
              onChange={(e) => setNotasInternas(e.target.value)}
              placeholder="Notas de producción, referencias, lo que sea…"
              rows={4}
            />
          </label>
        </div>

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-primary"
            onClick={handleSave}
            disabled={saving || !titulo.trim()}
          >
            {saving ? "Guardando…" : "Guardar pieza"}
          </button>
        </footer>
      </div>
    </div>
  );
}
