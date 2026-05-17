/**
 * Tablero — Kanban de 5 carriles.
 *
 * v0.45.0-α · Paridad pixel-perfect con la maqueta de Claude Design.
 *  · Carril 01 "Ideas" → tabla ideas, con filtros (Todas/Sin piezas/Con piezas).
 *    - Cards con .excerpt (3 líneas clamp del contenido) + footer pieza-count + cut-btn.
 *    - Variante .no-piezas con opacidad 0.45 + botón .kcta "✂ Dar forma".
 *  · Carril 02 "En desarrollo" → cards con .subnm (formato · plataforma).
 *  · Carril 03 "Listo" → empty state si vacío.
 *  · Carril 04 "Agendado" → kcol.active (textos blancos brillantes) + .kdate.future con icono.
 *  · Carril 05 "Publicado" → kcol.publicado (gradient verde) + .kdate.past sin icono.
 *  · Add button (+) en cada header focusea el capture bar con tag pre-seleccionado.
 *  · Click en card abre CardModal con detalle + edición.
 *
 * Pendiente (siguiente paso): drag & drop entre carriles.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ideas as ideasApi,
  piezas as piezasApi,
  capture as captureApi,
} from "../lib/api";
import CardModal from "../components/CardModal";
import { usePageStatus } from "../lib/pageStatus.jsx";

// Carriles de piezas — meta de cada columna del kanban.
// 04 lleva `state: "active"` → estilos blancos brillantes en el header.
// 05 lleva `state: "publicado"` → gradient verde completo en toda la columna.
const CARRIL_PIEZAS = [
  { ix: "02", nm: "En desarrollo", sub: "Tomando forma", dotsOn: 2, columna: "desarrollo", state: ""          },
  { ix: "03", nm: "Listo",          sub: "Preparado",     dotsOn: 3, columna: "listo",      state: ""          },
  { ix: "04", nm: "Agendado",       sub: "Fecha fijada",  dotsOn: 4, columna: "agendado",   state: "active"    },
  { ix: "05", nm: "Publicado",      sub: "En el mundo",   dotsOn: 4, columna: "publicado",  state: "publicado" },
];

const FORMATO_LABEL = {
  email:     "Email",
  youtube:   "YouTube",
  reel:      "Reel",
  relampago: "Relámpago",
  grieta:    "Grieta",
};

// Subtítulo descriptivo para cards en "En desarrollo" si no tienen
// plataformas[] definido. (.subnm en el HTML de Claude Design.)
const SUBNM_DEFAULT = {
  email:     "Email · newsletter",
  youtube:   "YouTube · long-form",
  reel:      "Instagram · 60s",
  relampago: "Email · relámpago",
  grieta:    "Instagram · grieta",
};

// ─── Helpers ──────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

// Formato "MIÉ, 17 MAY · 18:00" (futuro) o "LUN, 11 MAY" (pasado, sin hora).
function formatKdate(iso, withTime = true) {
  if (!iso) return "";
  const d = new Date(iso);
  const dow = d.toLocaleDateString("es-ES", { weekday: "short" })
                .replace(/\.$/, "").toUpperCase();
  const day = d.getDate();
  const mon = d.toLocaleDateString("es-ES", { month: "short" })
                .replace(/\.$/, "").toUpperCase();
  let out = `${dow}, ${day} ${mon}`;
  if (withTime) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    out += ` · ${hh}:${mm}`;
  }
  return out;
}

function isFuture(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

// Subnm para "En desarrollo": si la pieza tiene `plataformas[]` con valores,
// los unimos; si no, usamos el default por formato.
function subnmFor(p) {
  if (Array.isArray(p.plataformas) && p.plataformas.length > 0) {
    return p.plataformas.join(" · ");
  }
  return SUBNM_DEFAULT[p.formato] || FORMATO_LABEL[p.formato] || p.formato;
}

// SVG calendario reutilizable para .kdate.future
function CalIcon() {
  return (
    <svg className="icon" viewBox="0 0 14 14" fill="none"
         stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="3" width="11" height="9" />
      <path d="M1.5 6h11M5 1.5v3M9 1.5v3" />
    </svg>
  );
}

// ─── Componente ──────────────────────────────────────────────────

export default function Tablero() {
  const [ideas, setIdeas] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [captureText, setCaptureText] = useState("");
  const [captureTag, setCaptureTag] = useState("idea");
  const [capturing, setCapturing] = useState(false);
  // Filtro de la columna Ideas: "todas" | "sin" | "con"
  const [ideasFilter, setIdeasFilter] = useState("todas");
  const captureRef = useRef(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [iList, pList] = await Promise.all([ideasApi.list(), piezasApi.list()]);
      setIdeas(iList || []);
      setPiezas(pList || []);
      setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Índice de piezas por idea_id para lookup rápido y aplicar filtros de Ideas.
  const piezasByIdea = useMemo(() => {
    const m = new Map();
    for (const p of piezas) {
      if (!p.idea_id) continue;
      const arr = m.get(p.idea_id) || [];
      arr.push(p);
      m.set(p.idea_id, arr);
    }
    return m;
  }, [piezas]);

  const filteredIdeas = useMemo(() => {
    if (ideasFilter === "todas") return ideas;
    return ideas.filter((idea) => {
      const has = (piezasByIdea.get(idea.id) || []).length > 0;
      return ideasFilter === "con" ? has : !has;
    });
  }, [ideas, ideasFilter, piezasByIdea]);

  // Contadores por filtro para los chips (Todas/Sin/Con)
  const ideasCounts = useMemo(() => {
    let con = 0, sin = 0;
    for (const idea of ideas) {
      const has = (piezasByIdea.get(idea.id) || []).length > 0;
      if (has) con++; else sin++;
    }
    return { todas: ideas.length, con, sin };
  }, [ideas, piezasByIdea]);

  const piezasPorColumna = (col) => piezas.filter((p) => p.columna === col);

  // Contadores para la statusbar inferior (los reporta usePageStatus abajo).
  // PIEZAS = todas las no publicadas (igual que en Dashboard).
  const cuentaAgendadas  = piezas.filter((p) => p.columna === "agendado").length;
  const cuentaPublicadas = piezas.filter((p) => p.columna === "publicado").length;
  const cuentaNoPublicadas = piezas.length - cuentaPublicadas;

  // ─── StatusBar contextual ────────────────────────────────────
  // Reportamos contadores reales al right del statusbar (antes salían
  // como `—` porque no había context aplicado a esta pestaña).
  const pageStatus = useMemo(
    () => ({
      right: [
        { text: "IDEAS ",      strong: String(ideas.length) },
        { text: "PIEZAS ",     strong: String(cuentaNoPublicadas) },
        { text: "AGENDADAS ",  strong: String(cuentaAgendadas) },
        { text: "PUBLICADAS ", strong: String(cuentaPublicadas) },
      ],
    }),
    [ideas.length, cuentaNoPublicadas, cuentaAgendadas, cuentaPublicadas],
  );
  usePageStatus(pageStatus);

  // ─── Drag & Drop entre carriles ──────────────────────────────
  // - Solo se arrastran piezas (carriles 02-05). Las ideas (01) no son
  //   arrastrables: el flujo idea → pieza pasa por el botón ✂ "Dar forma".
  // - Drop zones: las 4 columnas de piezas (no la columna Ideas).
  // - Update optimista: cambio columna en estado local de inmediato y luego
  //   sincronizo con la BD; si falla, revierto.
  const [dragOver, setDragOver] = useState(null);

  function handleDragStart(e, pieza) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ id: pieza.id, from: pieza.columna }),
    );
  }

  function handleDragOver(e, columna) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== columna) setDragOver(columna);
  }

  function handleDragLeave(e, columna) {
    // Solo limpiar si el target relacionado ya no está dentro de la columna
    // (evita parpadeo al cruzar hijos)
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOver === columna) setDragOver(null);
  }

  async function handleDrop(e, toColumna) {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (!data?.id || !data?.from || data.from === toColumna) return;

    // Optimistic: actualizo UI ya
    const prev = piezas;
    setPiezas((arr) =>
      arr.map((p) => (p.id === data.id ? { ...p, columna: toColumna } : p)),
    );

    try {
      await piezasApi.update(data.id, { columna: toColumna });
    } catch (err) {
      // Revert si la API falla
      setPiezas(prev);
      setErr(`Mover falló: ${err.message || err}`);
    }
  }

  // ─── Acciones ────────────────────────────────────────────────
  async function handleCapture(e) {
    e.preventDefault();
    if (!captureText.trim() || capturing) return;
    try {
      setCapturing(true);
      await captureApi(captureText.trim(), captureTag);
      setCaptureText("");
      await reload();
    } catch (err) {
      alert(`Captura falló: ${err.message || err}`);
    } finally {
      setCapturing(false);
    }
  }

  async function handleUpdate(kind, id, patch) {
    if (kind === "idea") {
      const upd = await ideasApi.update(id, patch);
      setIdeas((arr) => arr.map((x) => (x.id === id ? upd : x)));
      setSelected({ kind, data: upd });
    } else {
      const upd = await piezasApi.update(id, patch);
      setPiezas((arr) => arr.map((x) => (x.id === id ? upd : x)));
      setSelected({ kind, data: upd });
    }
  }

  async function handleDelete(kind, id) {
    if (!confirm("¿Eliminar? Esta acción no se puede deshacer.")) return;
    if (kind === "idea") {
      await ideasApi.remove(id);
      setIdeas((arr) => arr.filter((x) => x.id !== id));
    } else {
      await piezasApi.remove(id);
      setPiezas((arr) => arr.filter((x) => x.id !== id));
    }
    setSelected(null);
  }

  // Click en + de columna → focus al capture bar con el tag pre-seleccionado
  function handleAddClick(colKey) {
    // Mapeo columna → tag por defecto del capture
    // 01 Ideas → idea | 02-05 → email (Soma puede cambiar el select luego)
    const tag = colKey === "ideas" ? "idea" : "email";
    setCaptureTag(tag);
    if (captureRef.current) {
      captureRef.current.focus();
      captureRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <>
      <form className="cmdbar" onSubmit={handleCapture}>
        <span className="promp">›</span>
        <div className="input-wrap">
          <input
            ref={captureRef}
            type="text"
            placeholder="Captura una idea, link, frase, video, lead de contenido…"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            disabled={capturing}
          />
          <span className="cap-caret"></span>
        </div>
        <select
          className="cmdbar-tag"
          value={captureTag}
          onChange={(e) => setCaptureTag(e.target.value)}
          disabled={capturing}
        >
          <option value="idea">→ Idea</option>
          <option value="email">→ Email</option>
          <option value="youtube">→ YouTube</option>
          <option value="reel">→ Reel</option>
          <option value="relampago">→ Relámpago</option>
          <option value="grieta">→ Grieta</option>
        </select>
        <button className="send" type="submit" disabled={capturing || !captureText.trim()}>
          {capturing ? "..." : "Capturar →"}
        </button>
      </form>

      {err && (
        <div style={{
          padding: "8px 16px", margin: "8px 16px",
          border: "1px solid oklch(0.72 0.20 30)",
          color: "oklch(0.72 0.20 30)", fontFamily: "var(--mono)", fontSize: 11,
          letterSpacing: "0.08em", textTransform: "uppercase"
        }}>
          ⚠ {err}
        </div>
      )}

      <div className="board">
        {/* ═══ COL 01 · IDEAS ═══ */}
        <section className="kcol">
          <span className="br-tr"></span>
          <span className="br-bl"></span>
          <header className="kcol-h">
            <div className="row1">
              <div className="ttl">
                <span className="dot"></span>
                <span className="ix">01</span>
                Ideas
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="count">{ideas.length}</div>
                <button
                  className="add-btn"
                  type="button"
                  onClick={() => handleAddClick("ideas")}
                  title="Añadir idea"
                >+</button>
              </div>
            </div>
            <div className="sub">
              <span className="dots">
                {[0, 1, 2, 3].map((i) => <i key={i}></i>)}
              </span>
              <span>Captadas</span>
            </div>
            <div className="kcol-filters">
              <span
                className={`chip ${ideasFilter === "todas" ? "on" : ""}`}
                onClick={() => setIdeasFilter("todas")}
              >Todas {ideasCounts.todas}</span>
              <span
                className={`chip ${ideasFilter === "sin" ? "on" : ""}`}
                onClick={() => setIdeasFilter("sin")}
              >Sin piezas {ideasCounts.sin}</span>
              <span
                className={`chip ${ideasFilter === "con" ? "on" : ""}`}
                onClick={() => setIdeasFilter("con")}
              >Con piezas {ideasCounts.con}</span>
            </div>
          </header>
          <div className="kcol-body">
            {loading ? (
              <div className="kcol-empty">
                <span className="ring">—</span>
                <span>Cargando…</span>
              </div>
            ) : filteredIdeas.length === 0 ? (
              <div className="kcol-empty">
                <span className="ring">—</span>
                <span>{ideasFilter === "todas" ? "Sin ideas captadas" : "Nada con este filtro"}</span>
              </div>
            ) : (
              filteredIdeas.map((idea) => {
                const piezasDeIdea = piezasByIdea.get(idea.id) || [];
                const hasPiezas = piezasDeIdea.length > 0;
                const excerpt = stripHtml(idea.notas).slice(0, 180);
                return (
                  <article
                    key={idea.id}
                    className={`kcard ${hasPiezas ? "" : "no-piezas"}`}
                    onClick={() => setSelected({ kind: "idea", data: idea })}
                  >
                    <div className="nm">{idea.titulo || "(sin título)"}</div>
                    {excerpt && (
                      <div className="excerpt">{excerpt}</div>
                    )}
                    {hasPiezas ? (
                      <div className="kcard-foot">
                        <span className="pieza-count has">
                          <span className="d"></span>
                          {piezasDeIdea.length} pieza{piezasDeIdea.length === 1 ? "" : "s"}
                        </span>
                        <button
                          className="cut-btn"
                          title="Dar forma"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Por ahora abre la idea — futuras versiones podrían
                            // abrir directamente un dialog de "crear nueva pieza"
                            setSelected({ kind: "idea", data: idea });
                          }}
                        >✂</button>
                      </div>
                    ) : (
                      <button
                        className="kcta"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ kind: "idea", data: idea });
                        }}
                      >✂ Dar forma</button>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* ═══ COLS 02-05 · PIEZAS ═══ */}
        {CARRIL_PIEZAS.map((c) => {
          const pcol = piezasPorColumna(c.columna);
          const isOverHere = dragOver === c.columna;
          const colClass = `kcol${c.state ? ` ${c.state}` : ""}${isOverHere ? " kcol-dragover" : ""}`;
          const showFuture = c.columna === "agendado";
          const showPast   = c.columna === "publicado";
          // Iluminamos la columna cuando se arrastra algo encima (inline
          // porque la regla no existe en el CSS y queremos mantener los
          // archivos de estilo byte-perfect con Claude Design).
          const dragOverStyle = isOverHere
            ? {
                outline: "2px solid var(--acc)",
                outlineOffset: "-2px",
                background:
                  "linear-gradient(180deg, var(--acc-bg2) 0%, oklch(0.125 0.014 235) 100%)",
              }
            : undefined;
          return (
            <section
              key={c.ix}
              className={colClass}
              style={dragOverStyle}
              onDragOver={(e) => handleDragOver(e, c.columna)}
              onDragLeave={(e) => handleDragLeave(e, c.columna)}
              onDrop={(e) => handleDrop(e, c.columna)}
            >
              <span className="br-tr"></span>
              <span className="br-bl"></span>
              <header className="kcol-h">
                <div className="row1">
                  <div className="ttl">
                    <span className="dot"></span>
                    <span className="ix">{c.ix}</span>
                    {c.nm}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div className="count">{pcol.length}</div>
                    <button
                      className="add-btn"
                      type="button"
                      onClick={() => handleAddClick(c.columna)}
                      title={`Añadir a ${c.nm.toLowerCase()}`}
                    >+</button>
                  </div>
                </div>
                <div className="sub">
                  <span className="dots">
                    {[0, 1, 2, 3].map((i) => (
                      <i key={i} className={i < c.dotsOn ? "on" : ""}></i>
                    ))}
                  </span>
                  <span style={c.state === "active" ? { color: "var(--acc)" } : undefined}>
                    {c.sub}
                  </span>
                </div>
              </header>
              <div className="kcol-body">
                {loading ? (
                  <div className="kcol-empty">
                    <span className="ring">—</span>
                    <span>Cargando…</span>
                  </div>
                ) : pcol.length === 0 ? (
                  <div className="kcol-empty">
                    <span className="ring">—</span>
                    <span>{c.columna === "listo" ? "Sin piezas listas" : "Vacío"}</span>
                    {c.columna === "listo" && (
                      <span style={{ color: "var(--ink-5)", letterSpacing: "0.10em" }}>
                        Mueve piezas desde "En desarrollo"
                      </span>
                    )}
                  </div>
                ) : (
                  pcol.map((p) => {
                    const isRelampago = p.formato === "relampago";
                    return (
                      <article
                        key={p.id}
                        className={`kcard t-${p.formato}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, p)}
                        onClick={() => setSelected({ kind: "pieza", data: p })}
                      >
                        <span className={`kbadge t-${p.formato} ${isRelampago ? "special relampago" : ""}`}>
                          {FORMATO_LABEL[p.formato] || p.formato}
                        </span>
                        <div className="nm">{p.titulo || "(sin título)"}</div>

                        {/* En desarrollo / Listo: subtítulo descriptivo (formato · plataforma) */}
                        {(c.columna === "desarrollo" || c.columna === "listo") && (
                          <div className="subnm">{subnmFor(p)}</div>
                        )}

                        {/* Agendado: fecha futura con icono SVG (acento amber) */}
                        {showFuture && p.fecha_publicacion && (
                          <div className={`kdate ${isFuture(p.fecha_publicacion) ? "future" : "past"}`}>
                            <CalIcon />
                            {formatKdate(p.fecha_publicacion, true)}
                          </div>
                        )}

                        {/* Publicado: fecha pasada sin icono (gris), sin hora */}
                        {showPast && p.fecha_publicacion && (
                          <div className="kdate past">
                            {formatKdate(p.fecha_publicacion, false)}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selected && (
        <CardModal
          kind={selected.kind}
          data={selected.data}
          onClose={() => setSelected(null)}
          onUpdate={(patch) => handleUpdate(selected.kind, selected.data.id, patch)}
          onDelete={() => handleDelete(selected.kind, selected.data.id)}
        />
      )}
    </>
  );
}
