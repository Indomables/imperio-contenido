/**
 * Tablero — Kanban de 5 carriles.
 *
 * Fase 3A: cards reales conectadas al backend.
 *  · Carril 01 "Ideas" → tabla ideas
 *  · Carriles 02-05 → piezas agrupadas por columna
 *  · Click en card abre CardModal con detalle + edición
 *  · Capture bar funcional: crea idea (sin tag) o pieza (con tag)
 *
 * Pendiente (siguiente paso): drag & drop entre carriles, filtros por formato.
 */

import { useEffect, useState, useCallback } from "react";
import { ideas as ideasApi, piezas as piezasApi, capture as captureApi } from "../lib/api";
import CardModal from "../components/CardModal";

const CARRIL_PIEZAS = [
  { ix: "02", nm: "En desarrollo", sub: "Tomando forma", dotsOn: 2, columna: "desarrollo" },
  { ix: "03", nm: "Listo",          sub: "Preparado",     dotsOn: 3, columna: "listo" },
  { ix: "04", nm: "Agendado",       sub: "Fecha fijada",  dotsOn: 4, columna: "agendado" },
  { ix: "05", nm: "Publicado",      sub: "En el mundo",   dotsOn: 4, columna: "publicado" },
];

const FORMATO_LABEL = {
  email:     "Email",
  youtube:   "YouTube",
  reel:      "Reel",
  relampago: "Relámpago",
  grieta:    "Grieta",
};

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
          .replace(/\./g, "")
          .toUpperCase();
}

function isFuture(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

export default function Tablero() {
  const [ideas, setIdeas] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [selected, setSelected] = useState(null);
  const [captureText, setCaptureText] = useState("");
  const [captureTag, setCaptureTag] = useState("idea");
  const [capturing, setCapturing] = useState(false);

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

  const piezasPorColumna = (col) => piezas.filter((p) => p.columna === col);

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

  return (
    <>
      <form className="cmdbar" onSubmit={handleCapture}>
        <span className="promp">›</span>
        <div className="input-wrap">
          <input
            type="text"
            placeholder="Captura una idea, link, frase, video, lead de contenido…"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            disabled={capturing}
          />
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
              </div>
            </div>
            <div className="sub">
              <span className="dots">
                {[0, 1, 2, 3].map((i) => <i key={i}></i>)}
              </span>
              <span>Captadas</span>
            </div>
          </header>
          <div className="kcol-body">
            {loading ? (
              <div className="kcol-empty">
                <span className="ring">—</span>
                <span>Cargando…</span>
              </div>
            ) : ideas.length === 0 ? (
              <div className="kcol-empty">
                <span className="ring">—</span>
                <span>Sin ideas captadas</span>
              </div>
            ) : (
              ideas.map((idea) => {
                const piezasDeIdea = piezas.filter((p) => p.idea_id === idea.id);
                const hasPiezas = piezasDeIdea.length > 0;
                return (
                  <article
                    key={idea.id}
                    className={`kcard ${hasPiezas ? "" : "no-piezas"}`}
                    onClick={() => setSelected({ kind: "idea", data: idea })}
                  >
                    <div className="nm">{idea.titulo || "(sin título)"}</div>
                    {idea.notas && (
                      <div className="excerpt">{stripHtml(idea.notas).slice(0, 220)}</div>
                    )}
                    <div className="kcard-foot">
                      <span className={`pieza-count ${hasPiezas ? "has" : ""}`}>
                        <span className="d"></span>
                        {piezasDeIdea.length} pieza{piezasDeIdea.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {CARRIL_PIEZAS.map((c) => {
          const pcol = piezasPorColumna(c.columna);
          return (
            <section key={c.ix} className="kcol">
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
                  </div>
                </div>
                <div className="sub">
                  <span className="dots">
                    {[0, 1, 2, 3].map((i) => (
                      <i key={i} className={i < c.dotsOn ? "on" : ""}></i>
                    ))}
                  </span>
                  <span>{c.sub}</span>
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
                    <span>Vacío</span>
                  </div>
                ) : (
                  pcol.map((p) => (
                    <article
                      key={p.id}
                      className={`kcard t-${p.formato}`}
                      onClick={() => setSelected({ kind: "pieza", data: p })}
                    >
                      <span className={`kbadge t-${p.formato} ${p.formato === "relampago" ? "special relampago" : ""}`}>
                        {FORMATO_LABEL[p.formato] || p.formato}
                      </span>
                      <div className="nm">{p.titulo || "(sin título)"}</div>
                      {p.fecha_publicacion && (
                        <div className={`kdate ${isFuture(p.fecha_publicacion) ? "future" : "past"}`}>
                          <span>📅</span>
                          {formatDate(p.fecha_publicacion)}
                        </div>
                      )}
                    </article>
                  ))
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
