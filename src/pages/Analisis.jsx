/**
 * Análisis — Performance por formato y período.
 *
 * v0.44.1: benchmarks visuales y micro-bars de colores.
 *  · KPIs con sublínea que compara contra benchmark del sector:
 *      ↑ por encima · ≈ benchmark sector · ↓ por debajo · — sin datos
 *  · Columnas porcentuales renderizan micro-bar de colores
 *    (verde = above, amarillo = sector, rojo = below, gris = mute).
 *  · Eliminada la columna "Fecha" del final (la fecha ya está bajo el título).
 *
 * Estructura:
 *  · Configuración declarativa por formato en FORMATO_CONFIG.
 *  · Benchmarks ajustables por KPI / columna ({ good, bad, inverse? }).
 *  · Solo cuenta piezas con `fecha_publicacion` ≤ hoy.
 *  · Filtros: periodo (30d/90d/6m/Todo) + tipo (Email/Reel/Relámpago/YT/Grieta).
 *  · Sortable por header (1 click desc → 2 asc → 3 reset).
 *  · Click en fila abre CardModal (igual que Tablero).
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  piezas as piezasApi,
  metricas as metricasApi,
  ideas as ideasApi,
} from "../lib/api";
import CardModal from "../components/CardModal";

// ─── Benchmarks del sector (creator economy / email marketing) ────
// Ajustables sin tocar el resto del código.
const BENCHMARKS = {
  // Apertura email: sector ~25-33% es estándar
  tasa_apertura: { good: 33, bad: 25 },
  // Clic email: sector ~1-3% es estándar
  tasa_clics: { good: 3, bad: 1 },
  // Bajas email: bajo es bueno (inverso). <0.1% excelente, >1% mala señal.
  tasa_bajas: { good: 0.1, bad: 1, inverse: true },
};

// ─── Configuración por formato ────────────────────────────────────
const FORMATO_CONFIG = {
  email: {
    label: "Email",
    kpis: [
      { key: "count", kind: "count", label: "Emails publicados" },
      { key: "ap",    kind: "avg",   label: "Apertura media",     source: "tasa_apertura", unit: "pct", benchmark: BENCHMARKS.tasa_apertura },
      { key: "cl",    kind: "avg",   label: "Clic medio",         source: "tasa_clics",    unit: "pct", benchmark: BENCHMARKS.tasa_clics    },
      { key: "rev",   kind: "sum",   label: "Revenue atribuido",  source: "revenue_eur",   unit: "eur" },
    ],
    columns: [
      { key: "enviados",      label: "Enviados",    source: "enviados",      type: "int" },
      { key: "aperturas",     label: "Aperturas",   source: "aperturas",     type: "int" },
      { key: "tasa_apertura", label: "% Apertura",  source: "tasa_apertura", type: "pct", benchmark: BENCHMARKS.tasa_apertura },
      { key: "clics",         label: "Clics",       source: "clics",         type: "int" },
      { key: "tasa_clics",    label: "% Clics",     source: "tasa_clics",    type: "pct", benchmark: BENCHMARKS.tasa_clics },
      { key: "replies",       label: "Replies",     source: "replies",       type: "int" },
      { key: "bajas",         label: "Bajas",       source: "bajas",         type: "int" },
      { key: "tasa_bajas",    label: "% Bajas",     source: "tasa_bajas",    type: "pct", benchmark: BENCHMARKS.tasa_bajas },
      { key: "revenue_eur",   label: "Revenue (€)", source: "revenue_eur",   type: "eur" },
    ],
  },
  reel: {
    label: "Reel",
    kpis: [
      { key: "count", kind: "count", label: "Reels publicados" },
      { key: "lk",    kind: "avg",   label: "Likes medios",       source: "likes" },
      { key: "cm",    kind: "avg",   label: "Comentarios medios", source: "comentarios" },
      { key: "sk",    kind: "sum",   label: "Miembros Skool",     source: "miembros_skool" },
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
      { key: "lk",    kind: "avg",   label: "Likes medios",       source: "likes" },
      { key: "cm",    kind: "avg",   label: "Comentarios medios", source: "comentarios" },
      { key: "sk",    kind: "sum",   label: "Miembros Skool",     source: "miembros_skool" },
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
  { key: "30d", label: "Últimos 30 días", days: 30,  short: "30 DÍAS"  },
  { key: "90d", label: "Últimos 90 días", days: 90,  short: "90 DÍAS"  },
  { key: "6m",  label: "Últimos 6 meses", days: 180, short: "6 MESES"  },
  { key: "all", label: "Todo",            days: null, short: "TODO"    },
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

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" })
    .replace(/\./g, "").toUpperCase();
}

function formatTimeHM(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Para los KPI: medias y sumas omitiendo nulos
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

// Devuelve la clase visual (above / below / "" / mute) según benchmark.
// 0 se trata como "mute" porque suele indicar ausencia de actividad,
// no rendimiento medible.
function barClass(value, benchmark) {
  if (value === null || value === undefined || value === "") return "mute";
  const n = Number(value);
  if (Number.isNaN(n)) return "mute";
  if (n === 0) return "mute";

  if (!benchmark) return "";
  const { good, bad, inverse } = benchmark;

  if (inverse) {
    if (n <= good) return "above";    // valor bajo = bueno
    if (n >= bad)  return "below";    // valor alto = malo
    return "";
  }
  if (n >= good) return "above";
  if (n <  bad)  return "below";
  return "";
}

// Sublínea contextual del KPI (con color y texto)
function kpiSubInfo(kind, value, benchmark, periodoLabel) {
  if (kind === "count") return { text: periodoLabel, cls: "" };
  if (kind === "sum")   return { text: "suma del periodo", cls: "" };
  // avg
  if (value === null) return { text: "sin datos en el periodo", cls: "" };
  if (!benchmark) return { text: "media del periodo", cls: "" };

  const cls = barClass(value, benchmark);
  if (cls === "above") return { text: "↑ por encima del sector", cls: "pos"  };
  if (cls === "below") return { text: "↓ por debajo del sector", cls: "neg"  };
  if (cls === "mute")  return { text: "media del periodo",       cls: ""     };
  return { text: "≈ benchmark sector", cls: "warn" };
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

  const metricasMap = useMemo(() => {
    const m = new Map();
    for (const row of metricasArr) m.set(row.pieza_id, row.datos || {});
    return m;
  }, [metricasArr]);

  const periodoConf = PERIODOS.find((p) => p.key === periodo);
  const periodoLabel = periodo === "all" ? "historial completo" : periodoConf.label.toLowerCase();

  // Contadores por formato (con periodo aplicado)
  const counts = useMemo(() => {
    const c = { email: 0, reel: 0, relampago: 0, youtube: 0, grieta: 0 };
    for (const p of piezas) {
      if (!isPublishedInPast(p.fecha_publicacion)) continue;
      if (!isInPeriod(p.fecha_publicacion, periodoConf?.days ?? null)) continue;
      if (c[p.formato] !== undefined) c[p.formato] += 1;
    }
    return c;
  }, [piezas, periodoConf]);

  // Filas crudas
  const rows = useMemo(() => {
    const conf = FORMATO_CONFIG[formato];
    if (!conf) return [];
    return piezas
      .filter((p) => p.formato === formato)
      .filter((p) => isPublishedInPast(p.fecha_publicacion))
      .filter((p) => isInPeriod(p.fecha_publicacion, periodoConf?.days ?? null))
      .map((p) => ({ pieza: p, datos: metricasMap.get(p.id) || {} }));
  }, [piezas, metricasMap, formato, periodoConf]);

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

  // Max por columna pct (para escalar las micro-bars)
  const conf = FORMATO_CONFIG[formato];
  const pctMaxes = useMemo(() => {
    const m = {};
    for (const col of conf.columns) {
      if (col.type !== "pct") continue;
      let max = 0;
      for (const r of sortedRows) {
        const v = Number(r.datos?.[col.source]);
        if (!Number.isNaN(v) && v > max) max = v;
      }
      m[col.key] = max;
    }
    return m;
  }, [sortedRows, conf.columns]);

  // KPIs del formato activo
  const kpis = conf.kpis.map((k) => {
    const value = aggregate(k.kind, rows, k.source);
    const sub = kpiSubInfo(k.kind, value, k.benchmark, periodoLabel);
    return { ...k, value, sub };
  });

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

  const ideasById = useMemo(() => {
    const m = new Map();
    for (const i of ideas) m.set(i.id, i);
    return m;
  }, [ideas]);

  // ─── Render de celdas ──────────────────────────────────────────
  function renderCell(col, datos) {
    const raw = datos?.[col.source];

    if (col.type === "pct") {
      // Sin valor → dash + bar gris
      const has = raw !== null && raw !== undefined && raw !== "" && !Number.isNaN(Number(raw));
      if (!has) {
        return (
          <div className="bar-cell">
            <span className="pct" style={{ color: "var(--ink-4)" }}>—</span>
            <div className="micro-bar mute"><i style={{ width: 0 }} /></div>
          </div>
        );
      }
      const n = Number(raw);
      const cls = barClass(raw, col.benchmark);
      const max = pctMaxes[col.key] || 0;
      // Escala dinámica al max de la columna en este periodo,
      // así las bajas (valores pequeños <1%) también se aprecian.
      // Si max=0 → todo a 0; cls será "mute".
      const w = max > 0 && n > 0 ? Math.max(2, (n / max) * 100) : 0;
      return (
        <div className="bar-cell">
          <span className="pct">{n.toFixed(1)}%</span>
          <div className={`micro-bar ${cls}`}>
            <i style={{ width: `${w}%` }} />
          </div>
        </div>
      );
    }

    // int / eur / fallback
    let formatted = null;
    if (col.type === "int") formatted = formatInt(raw);
    else if (col.type === "eur") formatted = formatEur(raw);
    else formatted = raw ?? null;

    return (
      <span className={`val ${formatted === null ? "dash" : ""}`}>
        {formatted === null ? "—" : formatted}
      </span>
    );
  }

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
            <div className={`sub ${k.sub.cls}`}>{k.sub.text}</div>
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={conf.columns.length + 2}>
                <div className="an-empty">
                  <div className="ring">—</div>
                  Cargando…
                </div>
              </td></tr>
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={conf.columns.length + 2}>
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
                          {"  ·  "}{formatTimeHM(p.fecha_publicacion)}
                        </div>
                      )}
                    </td>
                    {conf.columns.map((c) => (
                      <td key={c.key}>{renderCell(c, row.datos)}</td>
                    ))}
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
