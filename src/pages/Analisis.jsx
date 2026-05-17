/**
 * Análisis — Performance por formato y período.
 *
 * Fase 3B: datos reales.
 *  · Carga todas las piezas + todas las métricas en paralelo.
 *  · Solo cuenta piezas con `fecha_publicacion` en el pasado (= publicadas al mundo).
 *  · Chips de periodo filtran por ventana sobre fecha_publicacion.
 *  · Chips de tipo cambian qué KPIs y qué columnas se muestran.
 *  · Headers de la tabla son sortable (click para ordenar asc/desc).
 *  · Click en una fila abre el CardModal de esa pieza (igual que en Tablero).
 *
 * Cada formato declara su config en FORMATO_CONFIG:
 *  · kpis: array de 4 tarjetas. Cada KPI = { key, label, kind: 'count'|'avg'|'sum', source?, unit? }
 *  · columns: array de columnas de la tabla. Cada col = { key, label, source?, type, sortable }
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  piezas as piezasApi,
  metricas as metricasApi,
  ideas as ideasApi,
} from "../lib/api";
import CardModal from "../components/CardModal";

// ─── Configuración por formato ───────────────────────────────────
//
// 'kpis' soporta:
//   { kind: 'count' }                          → nº piezas filtradas
//   { kind: 'avg',  source: 'tasa_apertura', unit: 'pct' }
//   { kind: 'avg',  source: 'likes' }
//   { kind: 'sum',  source: 'revenue_eur', unit: 'eur' }
//
// 'columns' soporta:
//   { key, label, source, type: 'int'|'pct'|'eur'|'title', sortable }

const FORMATO_CONFIG = {
  email: {
    label: "Email",
    kpis: [
      { key: "count",  kind: "count", label: "Emails publicados" },
      { key: "ap",     kind: "avg",   label: "Apertura media", source: "tasa_apertura", unit: "pct" },
      { key: "cl",     kind: "avg",   label: "Clic medio",     source: "tasa_clics",    unit: "pct" },
      { key: "rev",    kind: "sum",   label: "Revenue atribuido", source: "revenue_eur", unit: "eur" },
    ],
    columns: [
      { key: "enviados",      label: "Enviados",      source: "enviados",       type: "int" },
      { key: "aperturas",     label: "Aperturas",     source: "aperturas",      type: "int" },
      { key: "tasa_apertura", label: "% Apertura",    source: "tasa_apertura",  type: "pct" },
      { key: "clics",         label: "Clics",         source: "clics",          type: "int" },
      { key: "tasa_clics",    label: "% Clics",       source: "tasa_clics",     type: "pct" },
      { key: "replies",       label: "Replies",       source: "replies",        type: "int" },
      { key: "bajas",         label: "Bajas",         source: "bajas",          type: "int" },
      { key: "tasa_bajas",    label: "% Bajas",       source: "tasa_bajas",     type: "pct" },
      { key: "revenue_eur",   label: "Revenue (€)",   source: "revenue_eur",    type: "eur" },
    ],
  },
  reel: {
    label: "Reel",
    kpis: [
      { key: "count", kind: "count", label: "Reels publicados" },
      { key: "lk",    kind: "avg",   label: "Likes medios",        source: "likes" },
      { key: "cm",    kind: "avg",   label: "Comentarios medios",  source: "comentarios" },
      { key: "sk",    kind: "sum",   label: "Miembros Skool",      source: "miembros_skool" },
    ],
    columns: [
      { key: "likes",          label: "Likes",          source: "likes",          type: "int" },
      { key: "comentarios",    label: "Comentarios",    source: "comentarios",    type: "int" },
      { key: "miembros_skool", label: "Miembros Skool", source: "miembros_skool", type: "int" },
    ],
  },
  grieta: {
    label: "Grieta",
    kpis: [
      { key: "count", kind: "count", label: "Grietas publicadas" },
      { key: "lk",    kind: "avg",   label: "Likes medios",        source: "likes" },
      { key: "cm",    kind: "avg",   label: "Comentarios medios",  source: "comentarios" },
      { key: "sk",    kind: "sum",   label: "Miembros Skool",      source: "miembros_skool" },
    ],
    columns: [
      { key: "likes",          label: "Likes",          source: "likes",          type: "int" },
      { key: "comentarios",    label: "Comentarios",    source: "comentarios",    type: "int" },
      { key: "miembros_skool", label: "Miembros Skool", source: "miembros_skool", type: "int" },
    ],
  },
  youtube: {
    label: "YouTube",
    kpis: [
      { key: "count", kind: "count", label: "Videos publicados" },
      { key: "vw",    kind: "avg",   label: "Views medias",       source: "views" },
      { key: "lk",    kind: "avg",   label: "Likes medios",       source: "likes" },
      { key: "cm",    kind: "avg",   label: "Comentarios medios", source: "comentarios" },
    ],
    columns: [
      { key: "views",       label: "Views",       source: "views",       type: "int" },
      { key: "likes",       label: "Likes",       source: "likes",       type: "int" },
      { key: "comentarios", label: "Comentarios", source: "comentarios", type: "int" },
    ],
  },
  relampago: {
    label: "Relámpago",
    kpis: [
      { key: "count", kind: "count", label: "Publicados" },
      { key: "lk",    kind: "avg",   label: "Likes medios",       source: "likes" },
      { key: "cm",    kind: "avg",   label: "Comentarios medios", source: "comentarios" },
      { key: "vw",    kind: "avg",   label: "Views medias",       source: "views" },
    ],
    columns: [
      { key: "views",       label: "Views",       source: "views",       type: "int" },
      { key: "likes",       label: "Likes",       source: "likes",       type: "int" },
      { key: "comentarios", label: "Comentarios", source: "comentarios", type: "int" },
    ],
  },
};

const PERIODOS = [
  { key: "30d", label: "Últimos 30 días", days: 30 },
  { key: "90d", label: "Últimos 90 días", days: 90 },
  { key: "6m",  label: "Últimos 6 meses", days: 180 },
  { key: "all", label: "Todo",            days: null },
];

const FORMATOS_ORDEN = ["email", "reel", "relampago", "youtube", "grieta"];

// ─── Helpers ──────────────────────────────────────────────────────

function isPublishedInPast(iso) {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

function isInPeriod(iso, days) {
  if (!iso) return false;
  if (days === null) return true;
  const t = new Date(iso).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff && t <= Date.now();
}

function formatInt(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return Math.round(n).toLocaleString("es-ES");
}

function formatPct(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return `${n.toFixed(1)}%`;
}

function formatEur(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatCellValue(value, type) {
  switch (type) {
    case "int": return formatInt(value);
    case "pct": return formatPct(value);
    case "eur": return formatEur(value);
    default:    return value ?? null;
  }
}

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" })
    .replace(/\./g, "").toUpperCase();
}

// Para los KPI: medias y sumas omitiendo nulos/undefined
function aggregate(kind, rows, source) {
  if (kind === "count") return rows.length;
  const values = rows
    .map((r) => r.datos?.[source])
    .filter((v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v)))
    .map(Number);
  if (values.length === 0) return null;
  if (kind === "sum") return values.reduce((a, b) => a + b, 0);
  if (kind === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  return null;
}

function formatKpiValue(kind, value, unit) {
  if (kind === "count") return value === null ? "—" : String(value);
  if (value === null) return "—";
  if (unit === "pct") return `${value.toFixed(1)}%`;
  if (unit === "eur") return formatEur(value);
  return Math.round(value).toLocaleString("es-ES");
}

// ─── Componente ──────────────────────────────────────────────────

export default function Analisis() {
  const [piezas, setPiezas] = useState([]);
  const [metricasArr, setMetricasArr] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [formato, setFormato] = useState("email");
  const [periodo, setPeriodo] = useState("90d");
  const [sort, setSort] = useState({ key: "fecha", dir: "desc" });
  const [selected, setSelected] = useState(null);

  // Cargar todo en paralelo
  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [pList, mList, iList] = await Promise.all([
        piezasApi.list(),
        metricasApi.all(),
        ideasApi.list(),
      ]);
      setPiezas(pList || []);
      setMetricasArr(mList || []);
      setIdeas(iList || []);
      setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Indexar métricas por pieza_id para lookup O(1)
  const metricasMap = useMemo(() => {
    const m = new Map();
    for (const row of metricasArr) m.set(row.pieza_id, row.datos || {});
    return m;
  }, [metricasArr]);

  // Contadores por formato (para los chips de tipo) — siempre con periodo aplicado
  const counts = useMemo(() => {
    const periodoConf = PERIODOS.find((p) => p.key === periodo);
    const c = { email: 0, reel: 0, relampago: 0, youtube: 0, grieta: 0 };
    for (const p of piezas) {
      if (!isPublishedInPast(p.fecha_publicacion)) continue;
      if (!isInPeriod(p.fecha_publicacion, periodoConf?.days ?? null)) continue;
      if (c[p.formato] !== undefined) c[p.formato] += 1;
    }
    return c;
  }, [piezas, periodo]);

  // Filas crudas: piezas filtradas + métricas asociadas (rows = [{pieza, datos}])
  const rows = useMemo(() => {
    const conf = FORMATO_CONFIG[formato];
    if (!conf) return [];
    const periodoConf = PERIODOS.find((p) => p.key === periodo);
    return piezas
      .filter((p) => p.formato === formato)
      .filter((p) => isPublishedInPast(p.fecha_publicacion))
      .filter((p) => isInPeriod(p.fecha_publicacion, periodoConf?.days ?? null))
      .map((p) => ({
        pieza: p,
        datos: metricasMap.get(p.id) || {},
      }));
  }, [piezas, metricasMap, formato, periodo]);

  // Filas ordenadas
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const conf = FORMATO_CONFIG[formato];
    const isMetricKey = conf.columns.some((c) => c.key === sort.key);
    return [...rows].sort((a, b) => {
      let va, vb;
      if (sort.key === "fecha") {
        va = a.pieza.fecha_publicacion ? new Date(a.pieza.fecha_publicacion).getTime() : 0;
        vb = b.pieza.fecha_publicacion ? new Date(b.pieza.fecha_publicacion).getTime() : 0;
      } else if (sort.key === "titulo") {
        va = (a.pieza.titulo || "").toLowerCase();
        vb = (b.pieza.titulo || "").toLowerCase();
        return va < vb ? -1 * dir : va > vb ? 1 * dir : 0;
      } else if (isMetricKey) {
        const col = conf.columns.find((c) => c.key === sort.key);
        const ra = a.datos?.[col.source];
        const rb = b.datos?.[col.source];
        va = ra === null || ra === undefined || ra === "" ? -Infinity : Number(ra);
        vb = rb === null || rb === undefined || rb === "" ? -Infinity : Number(rb);
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return  1 * dir;
      return 0;
    });
  }, [rows, sort, formato]);

  // KPIs del formato activo
  const conf = FORMATO_CONFIG[formato];
  const kpis = conf.kpis.map((k) => ({
    ...k,
    value: aggregate(k.kind, rows, k.source),
  }));

  function toggleSort(key) {
    setSort((s) => {
      if (s.key !== key) return { key, dir: "desc" };
      if (s.dir === "desc") return { key, dir: "asc" };
      return { key: "fecha", dir: "desc" }; // 3er click: reset
    });
  }

  function arrow(key) {
    if (sort.key !== key) return null;
    return <span className="arr">{sort.dir === "asc" ? "↑" : "↓"}</span>;
  }

  // Para mostrar la idea de origen de una pieza (preview en la columna titulo)
  const ideasById = useMemo(() => {
    const m = new Map();
    for (const i of ideas) m.set(i.id, i);
    return m;
  }, [ideas]);

  return (
    <>
      <header className="an-head">
        <div className="title">
          <span className="dot"></span>
          Análisis · Rendimiento
        </div>
        <div className="period-chips">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              className={`chip ${periodo === p.key ? "on" : ""}`}
              onClick={() => setPeriodo(p.key)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="type-chips">
          {FORMATOS_ORDEN.map((f) => (
            <button
              key={f}
              className={`chip t-${f} ${formato === f ? "on" : ""}`}
              onClick={() => setFormato(f)}
              type="button"
            >
              {FORMATO_CONFIG[f].label} <span className="ct">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </header>

      {err && (
        <div style={{
          padding: "8px 16px", margin: "8px 22px",
          border: "1px solid oklch(0.72 0.20 30)",
          color: "oklch(0.72 0.20 30)", fontFamily: "var(--mono)", fontSize: 11,
          letterSpacing: "0.08em", textTransform: "uppercase"
        }}>
          ⚠ {err}
        </div>
      )}

      <div className="kpi-strip">
        {kpis.map((k) => (
          <div key={k.key} className="kpi-card">
            <span className="br-tr"></span>
            <span className="br-bl"></span>
            <div className="k">{k.label}</div>
            <div className={`v ${k.value === null ? "dash" : ""}`}>
              {loading ? "—" : formatKpiValue(k.kind, k.value, k.unit)}
            </div>
            <div className="sub">
              {k.kind === "count" ? "en el periodo" :
               k.kind === "avg"   ? "media del periodo" :
               k.kind === "sum"   ? "total del periodo" : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th className="idx">#</th>
              <th
                className={`title-col sortable ${sort.key === "titulo" ? "sorted" : ""}`}
                onClick={() => toggleSort("titulo")}
              >
                Pieza {arrow("titulo")}
              </th>
              {conf.columns.map((c) => (
                <th
                  key={c.key}
                  className={`sortable ${sort.key === c.key ? "sorted" : ""}`}
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label} {arrow(c.key)}
                </th>
              ))}
              <th
                className={`sortable ${sort.key === "fecha" ? "sorted" : ""}`}
                onClick={() => toggleSort("fecha")}
                style={{ minWidth: 100 }}
              >
                Fecha {arrow("fecha")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={conf.columns.length + 3}>
                <div className="an-empty">
                  <div className="ring">—</div>
                  Cargando…
                </div>
              </td></tr>
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={conf.columns.length + 3}>
                <div className="an-empty">
                  <div className="ring">—</div>
                  Sin {FORMATO_CONFIG[formato].label.toLowerCase()}s publicados en este periodo
                </div>
              </td></tr>
            ) : (
              sortedRows.map((row, idx) => {
                const p = row.pieza;
                const idea = p.idea_id ? ideasById.get(p.idea_id) : null;
                return (
                  <tr key={p.id} onClick={() => setSelected({ kind: "pieza", data: p })}>
                    <td className="idx">
                      <span className="ring">{idx + 1}</span>
                    </td>
                    <td className="title-col">
                      <div className="nm">{p.titulo || "(sin título)"}</div>
                      {idea?.titulo && (
                        <div className="preview">{idea.titulo}</div>
                      )}
                      {p.fecha_publicacion && (
                        <div className="when">
                          <b>{formatDateShort(p.fecha_publicacion)}</b>
                        </div>
                      )}
                    </td>
                    {conf.columns.map((c) => {
                      const raw = row.datos?.[c.source];
                      const formatted = formatCellValue(raw, c.type);
                      return (
                        <td key={c.key}>
                          <span className={`val ${formatted === null ? "dash" : ""}`}>
                            {formatted === null ? "—" : formatted}
                          </span>
                        </td>
                      );
                    })}
                    <td>
                      <span className="val">
                        {formatDateShort(p.fecha_publicacion)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <CardModal
          kind={selected.kind}
          data={selected.data}
          onClose={() => setSelected(null)}
          onUpdate={async (patch) => {
            const upd = await piezasApi.update(selected.data.id, patch);
            setPiezas((arr) => arr.map((x) => (x.id === upd.id ? upd : x)));
            setSelected({ kind: "pieza", data: upd });
          }}
          onDelete={async () => {
            if (!confirm("¿Eliminar? Esta acción no se puede deshacer.")) return;
            await piezasApi.remove(selected.data.id);
            setPiezas((arr) => arr.filter((x) => x.id !== selected.data.id));
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
