/**
 * Tablero — Kanban de 5 carriles.
 *
 * v0.45.0-α · Paridad pixel-perfect con la maqueta de Claude Design.
 *  · Carril 01 "Ideas" → tabla ideas, con filtros (Todas/Sin piezas/Con piezas).
 *    - Cards con .excerpt (3 líneas clamp del contenido) + footer pieza-count + cut-btn.
 *    - Variante .no-piezas con opacidad 0.45 + botón .kcta "✂ Dar forma".
 *    - Botón "+" del header → abre NuevaIdeaModal.
 *  · Carril 02 "En desarrollo" → cards con .subnm (formato · plataforma).
 *    - Botón "+" del header → abre NuevaPiezaModal (sin idea vinculada).
 *  · Carril 03 "Listo" → empty state si vacío. Sin botón "+".
 *  · Carril 04 "Agendado" → kcol.active + .kdate.future con icono.
 *                          Orden: fecha_publicacion ASC (próximo arriba). Sin "+".
 *  · Carril 05 "Publicado" → kcol.publicado (gradient verde) + .kdate.past sin icono.
 *                            Orden: fecha_publicacion DESC (reciente arriba). Sin "+".
 *  · Click en card abre CardModal con detalle + edición.
 *  · Click en "✂ Dar forma" de una idea abre NuevaPiezaModal con idea_id pre-vinculado.
 *  · Drag & drop entre carriles 02-05.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ideas as ideasApi,
  piezas as piezasApi,
  capture as captureApi,
} from "../lib/api";
import CardModal from "../components/CardModal";
import NuevaIdeaModal from "../components/NuevaIdeaModal";
import NuevaPiezaModal from "../components/NuevaPiezaModal";
import KitIdModal from "../components/KitIdModal";
import MetricasManualesModal from "../components/MetricasManualesModal";
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

// Label corto de columna para el popover de piezas asociadas.
const COLUMNA_LABEL = {
  desarrollo: "En desarrollo",
  listo:      "Listo",
  agendado:   "Agendado",
  publicado:  "Publicado",
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

// Icono "estadísticas" (3 barras verticales) — usado en cards de
// email/relampago publicado para abrir las métricas manuales.
function StatsIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" width="12" height="12">
      <rect x="1"  y="8" width="2.6" height="5" />
      <rect x="5.7" y="4" width="2.6" height="9" />
      <rect x="10.4" y="1" width="2.6" height="12" />
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

  // Modales de creación:
  //   newIdeaOpen      → "+" del carril 01 Ideas
  //   newPiezaContext  → { ideaId, ideaTitle } si viene de "Dar forma" de una idea
  //                    → {} si viene de "+" del carril 02 Desarrollo
  //                    → null si el modal está cerrado
  const [newIdeaOpen, setNewIdeaOpen] = useState(false);
  const [newPiezaContext, setNewPiezaContext] = useState(null);
  // Mini-modal específico para meter/cambiar el ID de Kit broadcast.
  // Se abre con el icono ⚡ en cards de email/relampago en columna agendado.
  const [kitIdModalPieza, setKitIdModalPieza] = useState(null);
  // Mini-modal para meter métricas manuales (replies + revenue_eur).
  // Se abre con el icono ▥ (StatsIcon) en cards de email/relampago publicadas.
  const [metricasModalPieza, setMetricasModalPieza] = useState(null);
  // Popover que enumera las piezas asociadas a una idea. Se abre al
  // hacer click sobre el contador "N piezas" en las cards de Ideas.
  // Guarda el id de la idea cuya lista de piezas está visible.
  const [piezasPopoverIdeaId, setPiezasPopoverIdeaId] = useState(null);

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

  // Cierra el popover de piezas asociadas con ESC o al hacer click fuera.
  useEffect(() => {
    if (!piezasPopoverIdeaId) return;
    const onKey = (e) => { if (e.key === "Escape") setPiezasPopoverIdeaId(null); };
    const onClick = () => setPiezasPopoverIdeaId(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [piezasPopoverIdeaId]);

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

  // Filtra piezas por columna y aplica orden cronológico cuando corresponde:
  //  · agendado  → fecha_publicacion ASC (más próximo a publicar arriba)
  //  · publicado → fecha_publicacion DESC (más reciente publicado arriba)
  //  · resto     → orden por defecto (created_at DESC del backend)
  const piezasPorColumna = (col) => {
    const lista = piezas.filter((p) => p.columna === col);
    if (col === "agendado") {
      return [...lista].sort((a, b) => {
        const ta = a.fecha_publicacion ? new Date(a.fecha_publicacion).getTime() : Infinity;
        const tb = b.fecha_publicacion ? new Date(b.fecha_publicacion).getTime() : Infinity;
        return ta - tb;
      });
    }
    if (col === "publicado") {
      return [...lista].sort((a, b) => {
        const ta = a.fecha_publicacion ? new Date(a.fecha_publicacion).getTime() : 0;
        const tb = b.fecha_publicacion ? new Date(b.fecha_publicacion).getTime() : 0;
        return tb - ta;
      });
    }
    return lista;
  };

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

  // Click en + de columna → abre el modal correspondiente.
  //   "ideas"      → NuevaIdeaModal
  //   "desarrollo" → NuevaPiezaModal (sin idea_id, pieza huérfana)
  //   otras col.   → no debería llamarse (no se renderiza el botón)
  function handleAddClick(colKey) {
    if (colKey === "ideas") {
      setNewIdeaOpen(true);
    } else if (colKey === "desarrollo") {
      setNewPiezaContext({});
    }
  }

  // Click en "Dar forma" sobre una card de idea → NuevaPiezaModal con la idea pre-vinculada.
  function handleDarFormaClick(idea, e) {
    if (e) e.stopPropagation();
    setNewPiezaContext({ ideaId: idea.id, ideaTitle: idea.titulo });
  }

  // Callbacks de creación que los modales invocan en onCreate.
  // Tras crear, hacemos un reload para evitar inconsistencias.
  async function handleCreateIdea(payload) {
    const nueva = await ideasApi.create(payload);
    setIdeas((arr) => [nueva, ...arr]);
  }

  async function handleCreatePieza(payload) {
    const nueva = await piezasApi.create(payload);
    setPiezas((arr) => [nueva, ...arr]);
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
                    {/* Acciones en hover (esquina superior derecha):
                        ✎ editar → abre CardModal directamente en modo edición
                        ✕ eliminar → confirm y delete */}
                    <div className="kcard-actions">
                      <button
                        className="kcard-act"
                        title="Editar idea"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ kind: "idea", data: idea, startEditing: true });
                        }}
                      >✎</button>
                      <button
                        className="kcard-act kcard-act-del"
                        title="Eliminar idea"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`¿Eliminar la idea "${idea.titulo || "(sin título)"}"?`)) {
                            handleDelete("idea", idea.id);
                          }
                        }}
                      >✕</button>
                    </div>
                    <div className="nm">{idea.titulo || "(sin título)"}</div>
                    {excerpt && (
                      <div className="excerpt">{excerpt}</div>
                    )}
                    {hasPiezas ? (
                      <div className="kcard-foot">
                        <button
                          type="button"
                          className="pieza-count has"
                          title="Ver piezas asociadas"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPiezasPopoverIdeaId(
                              piezasPopoverIdeaId === idea.id ? null : idea.id
                            );
                          }}
                        >
                          <span className="d"></span>
                          {piezasDeIdea.length} pieza{piezasDeIdea.length === 1 ? "" : "s"}
                        </button>
                        <button
                          className="cut-btn"
                          title="Dar forma — crear nueva pieza a partir de esta idea"
                          onClick={(e) => handleDarFormaClick(idea, e)}
                        >✂</button>

                        {piezasPopoverIdeaId === idea.id && (
                          <div
                            className="pieza-pop"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <header className="pieza-pop-h">
                              <span className="dot"></span>
                              <span className="ttl">Piezas asociadas</span>
                              <span className="count">{piezasDeIdea.length}</span>
                            </header>
                            <ul className="pieza-pop-list">
                              {piezasDeIdea.map((p) => (
                                <li
                                  key={p.id}
                                  className="pieza-pop-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPiezasPopoverIdeaId(null);
                                    setSelected({ kind: "pieza", data: p });
                                  }}
                                >
                                  <span className={`pieza-pop-fmt t-${p.formato}`}>
                                    {FORMATO_LABEL[p.formato] || p.formato}
                                  </span>
                                  <span className="pieza-pop-tt">
                                    {p.titulo || "(sin título)"}
                                  </span>
                                  <span className="pieza-pop-col">
                                    {COLUMNA_LABEL[p.columna] || p.columna}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        className="kcta"
                        onClick={(e) => handleDarFormaClick(idea, e)}
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
                    {c.columna === "desarrollo" && (
                      <button
                        className="add-btn"
                        type="button"
                        onClick={() => handleAddClick(c.columna)}
                        title={`Añadir a ${c.nm.toLowerCase()}`}
                      >+</button>
                    )}
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
                        {/* Acciones en hover.
                            📊 solo en email/relampago publicado — métricas manuales.
                            ⚡ solo en email/relampago agendado — ID de Kit. */}
                        <div className="kcard-actions">
                          {c.columna === "publicado" && (p.formato === "email" || p.formato === "relampago") && (
                            <button
                              className="kcard-act"
                              title="Métricas manuales (respuestas + revenue)"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMetricasModalPieza(p);
                              }}
                            ><StatsIcon /></button>
                          )}
                          {c.columna === "agendado" && (p.formato === "email" || p.formato === "relampago") && (
                            <button
                              className={`kcard-act kcard-act-kit ${p.kit_broadcast_id ? "linked" : ""}`}
                              title={p.kit_broadcast_id
                                ? `Kit broadcast ${p.kit_broadcast_id} — click para cambiar`
                                : "Añadir ID del broadcast de Kit"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setKitIdModalPieza(p);
                              }}
                            >⚡</button>
                          )}
                          <button
                            className="kcard-act"
                            title="Editar"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected({ kind: "pieza", data: p, startEditing: true });
                            }}
                          >✎</button>
                          <button
                            className="kcard-act kcard-act-del"
                            title="Eliminar"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`¿Eliminar la pieza "${p.titulo || "(sin título)"}"?`)) {
                                handleDelete("pieza", p.id);
                              }
                            }}
                          >✕</button>
                        </div>
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
        />
      )}

      {newIdeaOpen && (
        <NuevaIdeaModal
          onClose={() => setNewIdeaOpen(false)}
          onCreate={handleCreateIdea}
        />
      )}

      {newPiezaContext !== null && (
        <NuevaPiezaModal
          ideaId={newPiezaContext.ideaId || null}
          ideaTitle={newPiezaContext.ideaTitle || null}
          onClose={() => setNewPiezaContext(null)}
          onCreate={handleCreatePieza}
        />
      )}

      {kitIdModalPieza && (
        <KitIdModal
          pieza={kitIdModalPieza}
          onClose={() => setKitIdModalPieza(null)}
          onSave={async (newId) => {
            await handleUpdate("pieza", kitIdModalPieza.id, { kit_broadcast_id: newId });
          }}
        />
      )}

      {metricasModalPieza && (
        <MetricasManualesModal
          pieza={metricasModalPieza}
          onClose={() => setMetricasModalPieza(null)}
        />
      )}
    </>
  );
}
