/**
 * NuevaPiezaModal — Modal para crear una pieza nueva.
 *
 * Rediseñado según handoff de Claude Design (Soma OS HUD).
 * Chasis HUD completo: corchetes + tornillos + scanline + LED pulsante
 * en header + reloj SYNC vivo + sub-paneles numerados + footer statusbar
 * con DRAFT / contador palabras / requeridos / autoguardado countdown.
 *
 * Se abre desde:
 *  · el "+" de las columnas Ideas/Desarrollo (sin idea de origen)
 *  · el "✂ Dar forma" de una card de Idea (con idea_id pre-vinculado)
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { piezas as piezasApi } from "../lib/api";
import { snapTo5Min, toDatetimeLocal } from "../lib/datetime";

const FORMATOS = [
  { val: "email",     label: "Email"     },
  { val: "reel",      label: "Reel"      },
  { val: "relampago", label: "Relámpago" },
  { val: "youtube",   label: "YouTube"   },
  { val: "grieta",    label: "Grieta"    },
];

export default function NuevaPiezaModal({ onClose, onCreate, ideaId = null, ideaTitle = null, defaultColumna = "desarrollo" }) {
  const [titulo, setTitulo] = useState("");
  const [formato, setFormato] = useState("email");
  const [plataforma, setPlataforma] = useState("kit"); // solo para email
  const [contenido, setContenido] = useState({});
  const [fechaPublicacion, setFechaPublicacion] = useState("");
  const [urlPublicacion, setUrlPublicacion] = useState("");
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [clockNow, setClockNow] = useState(formatClock(new Date()));
  const [autosaveSec, setAutosaveSec] = useState(24);
  const tituloRef = useRef(null);
  const editorRef = useRef(null);

  // Foco inicial + ESC para cerrar
  useEffect(() => {
    if (tituloRef.current) tituloRef.current.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reloj SYNC vivo (tick 1s)
  useEffect(() => {
    const id = setInterval(() => setClockNow(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  // Autoguardado cosmético (loop 24→0)
  useEffect(() => {
    const id = setInterval(() => {
      setAutosaveSec((s) => (s <= 0 ? 24 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Setear chip de plataforma según formato (solo email tiene chips)
  function handleFormatoChange(f) {
    setFormato(f);
    setContenido({}); // reset contenido al cambiar formato
  }

  // Texto del editor activo (para contador palabras)
  const editorText = getEditorText(formato, contenido);
  const wordCount = countWords(editorText);
  const readingMin = Math.max(0, Math.round((wordCount / 220) * 10) / 10);
  const requeridosLeft = titulo.trim() ? 0 : 1;
  const draftState = anyFilled(titulo, contenido, urlPublicacion, notas) ? "UNSAVED" : "EMPTY";
  const ventanaState = fechaPublicacion ? "AGENDADA" : "LIBRE";

  async function handleSave() {
    if (!titulo.trim()) {
      tituloRef.current?.focus();
      return;
    }
    try {
      setSaving(true);
      // Plataformas = ["kit"] o ["acumba"] solo si formato es email; si no, []
      const plataformas = formato === "email" ? [plataforma] : [];
      // fecha_publicacion: el input la guarda como string local "YYYY-MM-DDTHH:MM".
      // Convertimos a ISO con zona para consistencia con CardModal y para que
      // Postgres TIMESTAMP la interprete sin ambigüedad de zona horaria.
      const fechaISO = fechaPublicacion ? new Date(fechaPublicacion).toISOString() : null;
      const payload = {
        titulo: titulo.trim(),
        formato,
        columna: defaultColumna,
        plataformas,
        contenido,
        fecha_publicacion: fechaISO,
        url_publicacion: urlPublicacion.trim(),
        notas: notas.trim(),
        idea_id: ideaId || null,
      };
      const created = await piezasApi.create(payload);
      onCreate?.(created);
      onClose();
    } catch (e) {
      alert(`Error al crear la pieza: ${e.message || e}`);
      setSaving(false);
    }
  }

  const breadcrumb = ideaId
    ? `DESDE «${(ideaTitle || "IDEA").toUpperCase()}»`
    : `NUEVA · DESDE CERO`;

  return (
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
            <span className="ix">00</span><span className="div">/</span>
            <span className="ttl" id="somalTitle">Nueva Pieza</span>
            <span className="sep">·</span>
            <span className="src">{breadcrumb}</span>
          </div>
          <div className="r">
            <span className="meta">SYNC <b>{clockNow}</b></span>
            <button type="button" className="somal-x" onClick={onClose} aria-label="Cerrar (ESC)">×</button>
          </div>
        </header>

        {/* ─── BODY ─── */}
        <div className="somal-body">

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
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Cómo distingues internamente esta pieza"
                    maxLength={200}
                  />
                </div>
              </div>

              <div className="mrow">
                <div className="mfield">
                  <label>Formato</label>
                  <div className="mchips">
                    {FORMATOS.map((f) => (
                      <button
                        key={f.val}
                        type="button"
                        className={`mchip t-${f.val} ${formato === f.val ? "on" : ""}`}
                        onClick={() => handleFormatoChange(f.val)}
                      >
                        <span className="led-mini"></span>{f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formato === "email" && (
                  <div className="mfield" style={{ maxWidth: 280 }}>
                    <label>Lista de envío</label>
                    <div className="mchips">
                      <button
                        type="button"
                        className={`mchip ${plataforma === "kit" ? "on" : ""}`}
                        onClick={() => setPlataforma("kit")}
                      >
                        <span className="led-mini"></span>Kit
                      </button>
                      <button
                        type="button"
                        className={`mchip ${plataforma === "acumba" ? "on" : ""}`}
                        onClick={() => setPlataforma("acumba")}
                      >
                        <span className="led-mini"></span>Acumbamail
                      </button>
                    </div>
                  </div>
                )}
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
                formato={formato}
                contenido={contenido}
                setContenido={setContenido}
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
                  <div className="minput">
                    <input
                      type="datetime-local"
                      step="300"
                      value={fechaPublicacion}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setFechaPublicacion("");
                          return;
                        }
                        const snapped = snapTo5Min(e.target.value);
                        setFechaPublicacion(snapped ? toDatetimeLocal(snapped) : "");
                      }}
                    />
                  </div>
                </div>
                <div className="mfield">
                  <label>URL de publicación <span className="hint">· cuando esté viva</span></label>
                  <div className="minput">
                    <input
                      type="url"
                      value={urlPublicacion}
                      onChange={(e) => setUrlPublicacion(e.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                </div>
              </div>

              <div className="mfield">
                <label>Notas internas <span className="hint">· producción, referencias, lo que sea</span></label>
                <div className="minput notes">
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Notas, referencias, decisiones tomadas…"
                  />
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* ─── FOOTER ─── */}
        <footer className="somal-foot">
          <div className="l">
            <span><span className="led"></span>DRAFT · <b>{draftState}</b></span>
            <span>· <b>{wordCount}</b> / 500 W</span>
            <span>· REQUERIDOS <b className={requeridosLeft > 0 ? "warn" : "pos"}>{requeridosLeft}</b></span>
            <span>· AUTOGUARDA EN <b>00:{String(autosaveSec).padStart(2, "0")}</b></span>
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
              {saving ? "Guardando…" : "Guardar pieza →"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function formatClock(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function countWords(html) {
  if (!html) return 0;
  // Quitar tags HTML, normalizar espacios
  const txt = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return txt ? txt.split(/\s+/).length : 0;
}

function getEditorText(formato, contenido) {
  if (formato === "email") return contenido.cuerpo || "";
  if (formato === "youtube") return contenido.guion || "";
  return contenido.texto || "";
}

function anyFilled(titulo, contenido, urlPublicacion, notas) {
  if (titulo.trim()) return true;
  if (urlPublicacion.trim()) return true;
  if (notas.trim()) return true;
  if (Object.values(contenido).some((v) => v && String(v).trim())) return true;
  return false;
}

// ─── Campos de contenido por formato ────────────────────────────

function ContenidoFields({ formato, contenido, setContenido, editorRef }) {
  function setField(key, value) {
    setContenido({ ...contenido, [key]: value });
  }

  if (formato === "email") {
    return (
      <>
        <div className="mfield">
          <label>Asunto <span className="hint">· la línea que abre o no la abre</span></label>
          <div className="minput">
            <input
              type="text"
              value={contenido.asunto || ""}
              onChange={(e) => setField("asunto", e.target.value)}
            />
          </div>
        </div>
        <div className="mfield">
          <label>Preheader <span className="hint">· lo que se ve en la bandeja</span></label>
          <div className="minput">
            <input
              type="text"
              value={contenido.preheader || ""}
              onChange={(e) => setField("preheader", e.target.value)}
            />
          </div>
        </div>
        <div className="mfield">
          <label>Cuerpo <span className="hint">· objetivo ~500 palabras</span></label>
          <MeditorEditor
            html={contenido.cuerpo || ""}
            onChange={(html) => setField("cuerpo", html)}
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
              onChange={(e) => setField("titulo_video", e.target.value)}
            />
          </div>
        </div>
        <div className="mfield">
          <label>Descripción</label>
          <div className="minput notes">
            <textarea
              value={contenido.descripcion || ""}
              onChange={(e) => setField("descripcion", e.target.value)}
              placeholder="Descripción del vídeo…"
            />
          </div>
        </div>
        <div className="mfield">
          <label>Guion <span className="hint">· ~7 min</span></label>
          <MeditorEditor
            html={contenido.guion || ""}
            onChange={(html) => setField("guion", html)}
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
        onChange={(html) => setField("texto", html)}
        placeholder="Escribe aquí…"
        ref={editorRef}
      />
    </div>
  );
}

// ─── Editor inline contentEditable con toolbar HUD ───────────────

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
