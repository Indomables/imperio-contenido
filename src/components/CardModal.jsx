/**
 * CardModal — Modal para editar una idea o una pieza ya existente.
 *
 * Usa los mismos primitivos Soma OS HUD que NuevaPiezaModal (chasis,
 * LED pulsante, reloj SYNC, secciones numeradas, footer statusbar).
 * Diferencias respecto a la creación:
 *   · ix del header = "EDIT" en lugar de "00"
 *   · header lleva un badge del formato actual a la izquierda
 *   · no se ofrece cambio de formato ni de lista de envío
 *     (la pieza ya nació con esos parámetros — para alterarlos hay
 *     que eliminar y recrear; mantenerlos editables solo crearía
 *     inconsistencias entre `formato` y los campos de `contenido`)
 *   · footer dice CHANGED/UNCHANGED según haya tocado algo
 *   · sin autoguarda (al editar guardas al pulsar el botón)
 *
 * El campo `kit_broadcast_id` NO se toca aquí — se gestiona con el
 * icono ⚡ de la card. Eliminar tampoco — se hace con el ✕ de la card.
 *
 * Se abre con kind = "idea" o "pieza".
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { formatDateTimeLocal } from "../lib/datetime";
import DateTimePicker from "./DateTimePicker";

const FORMATO_LABEL = {
  email:     "EMAIL",
  reel:      "REEL",
  relampago: "RELÁMPAGO",
  youtube:   "YOUTUBE",
  grieta:    "GRIETA",
};

export default function CardModal({ kind, data, onClose, onUpdate }) {
  // El draft inicial depende del kind. Preservamos campos no editables
  // (kit_broadcast_id, columna, plataformas, idea_id, tematica) para que
  // el PATCH no los pise a null si el backend no los recibe.
  const [draft, setDraft] = useState(() => initialDraft(kind, data));
  const [saving, setSaving] = useState(false);
  const [clockNow, setClockNow] = useState(formatClock(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const tituloRef = useRef(null);
  const editorRef = useRef(null);

  // Reset si el dato seleccionado cambia (ej: drag de pieza + reabrir)
  useEffect(() => {
    setDraft(initialDraft(kind, data));
  }, [kind, data]);

  // Foco inicial + ESC para cerrar
  useEffect(() => {
    if (tituloRef.current) tituloRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reloj SYNC vivo
  useEffect(() => {
    const id = setInterval(() => setClockNow(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const isPieza = kind === "pieza";

  function setField(key, value) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setContenidoField(key, value) {
    setDraft((d) => ({ ...d, contenido: { ...d.contenido, [key]: value } }));
  }

  // Métricas para el footer
  const editorText = isPieza ? getEditorText(draft.formato, draft.contenido) : (draft.notas || "");
  const wordCount = countWords(editorText);
  const readingMin = Math.max(0, Math.round((wordCount / 220) * 10) / 10);
  const requeridosLeft = draft.titulo?.trim() ? 0 : 1;
  const changedState = hasChanges(kind, data, draft) ? "MODIFICADO" : "SIN CAMBIOS";

  async function handleSave() {
    if (!draft.titulo?.trim()) {
      tituloRef.current?.focus();
      return;
    }
    try {
      setSaving(true);
      await onUpdate(draft);
      onClose();
    } catch (e) {
      alert(`Error al guardar: ${e.message || e}`);
      setSaving(false);
    }
  }

  // Header — para pieza: "EDIT · [FORMATO] · «Título»"; para idea: "EDIT · IDEA · «Título»"
  const headerBadge = isPieza ? FORMATO_LABEL[draft.formato] || draft.formato : "IDEA";
  const headerBadgeClass = isPieza ? `t-${draft.formato}` : "t-idea";
  const headerCrumb = `«${(data.titulo || "SIN TÍTULO").toUpperCase()}»`;

  return (
    <>
    <div className="modal-host" onClick={onClose}>
      <div className="modal-scrim" />
      <div className="somal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="somalTitle">

        {/* Chassis HUD */}
        <span className="s-br tl"></span><span className="s-br tr"></span>
        <span className="s-br bl"></span><span className="s-br br"></span>
        <span className="s-screw tl"></span><span className="s-screw tr"></span>
        <span className="s-screw bl"></span><span className="s-screw br"></span>

        {/* ─── HEADER ─── */}
        <header className="somal-h">
          <div className="l">
            <span className="led"></span>
            <span className="ix">EDIT</span><span className="div">/</span>
            <span className="ttl" id="somalTitle">{isPieza ? "Editar Pieza" : "Editar Idea"}</span>
            <span className="sep">·</span>
            <span className={`somal-h-badge ${headerBadgeClass}`}>{headerBadge}</span>
            <span className="sep">·</span>
            <span className="src">{headerCrumb}</span>
          </div>
          <div className="r">
            <span className="meta">SYNC <b>{clockNow}</b></span>
            <button type="button" className="somal-x" onClick={onClose} aria-label="Cerrar (ESC)">×</button>
          </div>
        </header>

        {/* ─── BODY ─── */}
        <div className="somal-body">
          {isPieza
            ? <PiezaSections draft={draft} setField={setField} setContenidoField={setContenidoField} tituloRef={tituloRef} editorRef={editorRef} requeridosLeft={requeridosLeft} wordCount={wordCount} readingMin={readingMin} setPickerOpen={setPickerOpen} />
            : <IdeaSections draft={draft} setField={setField} tituloRef={tituloRef} requeridosLeft={requeridosLeft} wordCount={wordCount} />
          }
        </div>

        {/* ─── FOOTER ─── */}
        <footer className="somal-foot">
          <div className="l">
            <span><span className="led"></span>DRAFT · <b>{changedState}</b></span>
            <span>· <b>{wordCount}</b> {isPieza ? "/ 500 W" : "W"}</span>
            <span>· REQUERIDOS <b className={requeridosLeft > 0 ? "warn" : "pos"}>{requeridosLeft}</b></span>
          </div>
          <div className="r">
            <button type="button" className="somal-btn ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="button"
              className="somal-btn primary"
              onClick={handleSave}
              disabled={saving || requeridosLeft > 0}
            >
              {saving ? "Guardando…" : isPieza ? "Guardar pieza →" : "Guardar idea →"}
            </button>
          </div>
        </footer>
      </div>
    </div>
    {pickerOpen && (
      <DateTimePicker
        open={pickerOpen}
        value={draft.fecha_publicacion}
        onConfirm={(d) => {
          setField("fecha_publicacion", d ? d.toISOString() : null);
          setPickerOpen(false);
        }}
        onCancel={() => setPickerOpen(false)}
      />
    )}
    </>
  );
}

// ─── Subcomponentes por kind ────────────────────────────────────

function IdeaSections({ draft, setField, tituloRef, requeridosLeft, wordCount }) {
  return (
    <section className="msec">
      <span className="br-tr"></span><span className="br-bl"></span>
      <header className="msec-h">
        <div className="t">
          <span className="dot"></span>
          <span className="ix">01</span><span className="div">/</span>
          <span className="ttl">Identidad</span>
        </div>
        <div className="meta">REQUERIDOS <b className={requeridosLeft > 0 ? "acc" : ""}>{requeridosLeft}</b></div>
      </header>
      <div className="msec-body">

        <div className="mfield">
          <label>Título <span className="req">*</span><span className="hint">· el núcleo, en una línea</span></label>
          <div className="minput">
            <input
              ref={tituloRef}
              type="text"
              value={draft.titulo}
              onChange={(e) => setField("titulo", e.target.value)}
              placeholder="El núcleo de la idea, en una línea"
              maxLength={200}
            />
          </div>
        </div>

        <div className="mfield">
          <label>Copy <span className="hint">· el desarrollo</span></label>
          <div className="minput notes">
            <textarea
              value={draft.notas || ""}
              onChange={(e) => setField("notas", e.target.value)}
              placeholder="El desarrollo de la idea…"
              rows={6}
            />
          </div>
        </div>

        <div className="mfield">
          <label>Notas internas <span className="hint">· origen, referencias, contexto</span></label>
          <div className="minput notes">
            <textarea
              value={draft.notas_internas || ""}
              onChange={(e) => setField("notas_internas", e.target.value)}
              placeholder="Apuntes solo para ti…"
              rows={3}
            />
          </div>
        </div>

      </div>
    </section>
  );
}

function PiezaSections({ draft, setField, setContenidoField, tituloRef, editorRef, requeridosLeft, wordCount, readingMin, setPickerOpen }) {
  const ventanaState = draft.fecha_publicacion ? "AGENDADA" : "LIBRE";

  return (
    <>
      {/* ═══ 01 · IDENTIDAD ═══ */}
      <section className="msec">
        <span className="br-tr"></span><span className="br-bl"></span>
        <header className="msec-h">
          <div className="t">
            <span className="dot"></span>
            <span className="ix">01</span><span className="div">/</span>
            <span className="ttl">Identidad</span>
          </div>
          <div className="meta">REQUERIDOS <b className={requeridosLeft > 0 ? "acc" : ""}>{requeridosLeft}</b></div>
        </header>
        <div className="msec-body">
          <div className="mfield">
            <label>Título interno <span className="req">*</span><span className="hint">· cómo distingues esta pieza</span></label>
            <div className="minput">
              <input
                ref={tituloRef}
                type="text"
                value={draft.titulo}
                onChange={(e) => setField("titulo", e.target.value)}
                placeholder="Cómo distingues internamente esta pieza"
                maxLength={200}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 02 · CONTENIDO ═══ */}
      <section className="msec">
        <span className="br-tr"></span><span className="br-bl"></span>
        <header className="msec-h">
          <div className="t">
            <span className="dot"></span>
            <span className="ix">02</span><span className="div">/</span>
            <span className="ttl">Contenido</span>
          </div>
          <div className="meta"><b>{wordCount}</b> / 500 W · <b>~{readingMin}</b> MIN LECTURA</div>
        </header>
        <div className="msec-body">
          <ContenidoFields
            formato={draft.formato}
            contenido={draft.contenido || {}}
            setContenidoField={setContenidoField}
            editorRef={editorRef}
          />
        </div>
      </section>

      {/* ═══ 03 · PUBLICACIÓN ═══ */}
      <section className="msec">
        <span className="br-tr"></span><span className="br-bl"></span>
        <header className="msec-h">
          <div className="t">
            <span className="dot"></span>
            <span className="ix">03</span><span className="div">/</span>
            <span className="ttl">Publicación</span>
          </div>
          <div className="meta">VENTANA <b>{ventanaState}</b></div>
        </header>
        <div className="msec-body">

          <div className="mrow">
            <div className="mfield">
              <label>Fecha · hora de publicación</label>
              <button
                type="button"
                className="minput minput-trigger"
                onClick={() => setPickerOpen(true)}
              >
                <span className={`minput-trigger-label ${draft.fecha_publicacion ? "" : "is-placeholder"}`}>
                  {draft.fecha_publicacion
                    ? formatDateTimeLocal(draft.fecha_publicacion)
                    : "DD / MM / YYYY · HH:MM"}
                </span>
                <span className="ico-cal" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <rect x="2.5" y="3.5" width="11" height="10" />
                    <path d="M2.5 6.5h11" />
                    <path d="M5.5 2v3M10.5 2v3" />
                  </svg>
                </span>
              </button>
            </div>
            <div className="mfield">
              <label>URL de publicación <span className="hint">· cuando esté viva</span></label>
              <div className="minput">
                <input
                  type="url"
                  value={draft.url_publicacion || ""}
                  onChange={(e) => setField("url_publicacion", e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
          </div>

          <div className="mfield">
            <label>Notas internas <span className="hint">· producción, referencias, lo que sea</span></label>
            <div className="minput notes">
              <textarea
                value={draft.notas || ""}
                onChange={(e) => setField("notas", e.target.value)}
                placeholder="Notas, referencias, decisiones tomadas…"
              />
            </div>
          </div>

        </div>
      </section>
    </>
  );
}

function ContenidoFields({ formato, contenido, setContenidoField, editorRef }) {
  if (formato === "email") {
    return (
      <>
        <div className="mfield">
          <label>Asunto <span className="hint">· la línea que abre o no la abre</span></label>
          <div className="minput">
            <input
              type="text"
              value={contenido.asunto || ""}
              onChange={(e) => setContenidoField("asunto", e.target.value)}
            />
          </div>
        </div>
        <div className="mfield">
          <label>Preheader <span className="hint">· lo que se ve en la bandeja</span></label>
          <div className="minput">
            <input
              type="text"
              value={contenido.preheader || ""}
              onChange={(e) => setContenidoField("preheader", e.target.value)}
            />
          </div>
        </div>
        <div className="mfield">
          <label>Cuerpo <span className="hint">· objetivo ~500 palabras</span></label>
          <MeditorEditor
            html={contenido.cuerpo || ""}
            onChange={(html) => setContenidoField("cuerpo", html)}
            placeholder="Escribe aquí…"
            ref={editorRef}
          />
        </div>
      </>
    );
  }

  if (formato === "youtube") {
    return (
      <>
        <div className="mfield">
          <label>Título del vídeo</label>
          <div className="minput">
            <input
              type="text"
              value={contenido.titulo_video || ""}
              onChange={(e) => setContenidoField("titulo_video", e.target.value)}
            />
          </div>
        </div>
        <div className="mfield">
          <label>Descripción</label>
          <div className="minput notes">
            <textarea
              value={contenido.descripcion || ""}
              onChange={(e) => setContenidoField("descripcion", e.target.value)}
              placeholder="Descripción del vídeo…"
            />
          </div>
        </div>
        <div className="mfield">
          <label>Guion <span className="hint">· ~7 min</span></label>
          <MeditorEditor
            html={contenido.guion || ""}
            onChange={(html) => setContenidoField("guion", html)}
            placeholder="Escribe el guion aquí…"
            ref={editorRef}
          />
        </div>
      </>
    );
  }

  // reel / relampago / grieta
  return (
    <div className="mfield">
      <label>Texto</label>
      <MeditorEditor
        html={contenido.texto || ""}
        onChange={(html) => setContenidoField("texto", html)}
        placeholder="Escribe aquí…"
        ref={editorRef}
      />
    </div>
  );
}

// ─── Editor inline contentEditable (idéntico al de NuevaPiezaModal) ──

const MeditorEditor = forwardRef(function MeditorEditor({ html, onChange, placeholder }, ref) {
  const areaRef = useRef(null);
  const initializedRef = useRef(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!initializedRef.current && areaRef.current) {
      areaRef.current.innerHTML = html || "";
      initializedRef.current = true;
    }
  }, [html]);

  useImperativeHandle(ref, () => ({
    focus: () => areaRef.current?.focus(),
  }));

  function exec(cmd, arg) {
    document.execCommand(cmd, false, arg);
    if (areaRef.current) onChange(areaRef.current.innerHTML);
    areaRef.current?.focus();
  }
  function handleInput() {
    if (areaRef.current) onChange(areaRef.current.innerHTML);
  }
  function handlePaste(e) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  return (
    <div className={`meditor ${expanded ? "expanded" : ""}`}>
      <div className="meditor-toolbar">
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}><b>B</b></button>
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}><i>I</i></button>
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "<h1>"); }}>H1</button>
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "<h2>"); }}>H2</button>
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}>≡</button>
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("undo"); }}>↶</button>
        <button type="button" className="tb" onMouseDown={(e) => { e.preventDefault(); exec("insertHorizontalRule"); }}>—</button>
        <span className="tb-spc"></span>
        <span className="tb-info">MONO ↔ PROSA</span>
        <button type="button" className="tb" onClick={() => setExpanded((v) => !v)} title={expanded ? "Reducir" : "Expandir"}>⤢</button>
      </div>
      <div
        ref={areaRef}
        className="meditor-area"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        data-placeholder={placeholder}
      />
    </div>
  );
});

// ─── Helpers ────────────────────────────────────────────────────

function initialDraft(kind, data) {
  if (kind === "idea") {
    return {
      titulo:         data.titulo || "",
      notas:          data.notas || "",
      notas_internas: data.notas_internas || "",
    };
  }
  // Pieza — preservamos los campos no editables aquí para que el PATCH no los pise.
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

function formatClock(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function countWords(text) {
  if (!text) return 0;
  const txt = String(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return txt ? txt.split(/\s+/).length : 0;
}

function getEditorText(formato, contenido) {
  if (!contenido) return "";
  if (formato === "email") return contenido.cuerpo || "";
  if (formato === "youtube") return contenido.guion || "";
  return contenido.texto || "";
}

function hasChanges(kind, original, draft) {
  if (kind === "idea") {
    return (
      (original.titulo || "") !== (draft.titulo || "") ||
      (original.notas || "") !== (draft.notas || "") ||
      (original.notas_internas || "") !== (draft.notas_internas || "")
    );
  }
  return (
    (original.titulo || "") !== (draft.titulo || "") ||
    (original.url_publicacion || "") !== (draft.url_publicacion || "") ||
    (original.notas || "") !== (draft.notas || "") ||
    (original.fecha_publicacion || null) !== (draft.fecha_publicacion || null) ||
    JSON.stringify(original.contenido || {}) !== JSON.stringify(draft.contenido || {})
  );
}
