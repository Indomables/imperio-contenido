/**
 * Dashboard — Cockpit operativo de Imperio Contenido.
 *
 * v0.62: añadido handler de evento global "app:refresh" para que el
 * botón Recargar del TopNav también refresque esta pestaña.
 *
 * v0.46.0-α · Paridad pixel-perfect con la maqueta de Claude Design.
 *
 * 3 columnas, 8 paneles:
 *  · LEFT:   01 Operator · 02 En desarrollo
 *  · CENTER: 03 Sesión Hoy · 04 Pipeline Funnel · 05 Top piezas 90D
 *  · RIGHT:  06 Agendado · Mantra · 07 Atajos
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { NavLink } from "react-router-dom";
import {
  ideas as ideasApi,
  piezas as piezasApi,
  metricas as metricasApi,
  capture as captureApi,
} from "../lib/api";
import { usePageStatus } from "../lib/pageStatus.jsx";
import useClock from "../hooks/useClock.js";

// ─── Constantes / helpers ──────────────────────────────────────

const FORMATO_LABEL = {
  email:     "Email",
  youtube:   "YouTube",
  reel:      "Reel",
  relampago: "Relámpago",
  grieta:    "Grieta",
};

const SUBNM_DEFAULT = {
  email:     "Email · newsletter",
  youtube:   "YouTube · long-form",
  reel:      "Instagram · 60s",
  relampago: "Email · relámpago",
  grieta:    "Instagram · grieta",
};

function greetingFor(date) {
  const h = date.getHours();
  if (h < 6) return "BUENAS NOCHES";
  if (h < 13) return "BUENOS DÍAS";
  if (h < 21) return "BUENAS TARDES";
  return "BUENAS NOCHES";
}

function dateBadge(date) {
  const dow = date.toLocaleDateString("es-ES", { weekday: "short" })
                  .replace(/\.$/, "").toUpperCase();
  const day = date.getDate();
  const mon = date.toLocaleDateString("es-ES", { month: "short" })
                  .replace(/\.$/, "").toUpperCase();
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `${dow} · ${day} ${mon} · W${week}`;
}

function whenShort(iso) {
  const d = new Date(iso);
  const dow = d.toLocaleDateString("es-ES", { weekday: "short" })
                .replace(/\.$/, "").toUpperCase();
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dow} ${day} · ${hh}:${mm}`;
}

function relativeDays(iso) {
  if (!iso) return "—";
  const now = new Date();
  const target = new Date(iso);
  const diffMs = target - now;
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays === 0) return "HOY";
  if (diffDays < 0) return `HACE ${Math.abs(diffDays)}D`;
  return `EN ${diffDays}D`;
}

function daysAgo(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

function topSubtitle(pieza, datos) {
  const d = pieza.fecha_publicacion ? new Date(pieza.fecha_publicacion) : null;
  if (!d) return "—";
  const day = d.getDate();
  const mon = d.toLocaleDateString("es-ES", { month: "short" })
                .replace(/\.$/, "").toUpperCase();
  const yr  = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const env = datos?.enviados ? `${datos.enviados} enviados` : "—";
  return `${day} ${mon} ${yr} · ${hh}:${mm} · ${env}`;
}

function pad2(n) { return String(n).padStart(2, "0"); }
function fmtPct(n) { return n == null ? "—" : `${Number(n).toFixed(1)}%`; }

// ─── Componentes reusables ─────────────────────────────────────

function DPanel({ idx, title, meta, ledMeta, className = "", padBody, children }) {
  return (
    <section className={`dpanel ${className}`.trim()}>
      <span className="br-tr"></span>
      <span className="br-bl"></span>
      <span className="screw tl"></span>
      <span className="screw tr"></span>
      <span className="screw bl"></span>
      <span className="screw br"></span>
      {(idx || title) && (
        <header className="dpanel-h">
          <div className="t">
            <span className="idx">{idx}</span>
            <span className="div">/</span>
            <span className="ttl">{title}</span>
          </div>
          {meta && (
            <div className="meta">
              {ledMeta && <span className="led"></span>}
              {meta}
            </div>
          )}
        </header>
      )}
      <div className="dpanel-b" style={padBody === false ? { padding: 0 } : undefined}>
        {children}
      </div>
    </section>
  );
}

// ─── Componente principal ──────────────────────────────────────

export default function Dashboard() {
  const { hms } = useClock();
  const [ideas, setIdeas] = useState([]);
  const [piezas, setPiezas] = useState([]);
  const [metricas, setMetricas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [captureText, setCaptureText] = useState("");
  const [captureTag, setCaptureTag] = useState("idea");
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [iList, pList, mList] = await Promise.all([
        ideasApi.list(),
        piezasApi.list(),
        metricasApi.all(),
      ]);
      setIdeas(iList || []);
      setPiezas(pList || []);
      setMetricas(mList || []);
    } catch (e) {
      console.error("Dashboard reload error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Escuchar evento global "app:refresh" del botón Recargar del TopNav.
  useEffect(() => {
    const handler = () => reload();
    window.addEventListener("app:refresh", handler);
    return () => window.removeEventListener("app:refresh", handler);
  }, [reload]);

  // ─── Derivados ───────────────────────────────────────────────
  const metricasMap = useMemo(() => {
    const m = new Map();
    for (const x of metricas) m.set(x.pieza_id, x.datos || {});
    return m;
  }, [metricas]);

  const desarrollo = useMemo(
    () => piezas.filter((p) => p.columna === "desarrollo"),
    [piezas],
  );
  const listo = useMemo(
    () => piezas.filter((p) => p.columna === "listo"),
    [piezas],
  );
  const agendadas = useMemo(
    () => piezas
      .filter((p) => p.columna === "agendado")
      .sort((a, b) =>
        new Date(a.fecha_publicacion || 0) - new Date(b.fecha_publicacion || 0),
      ),
    [piezas],
  );
  const publicadas = useMemo(
    () => piezas.filter((p) => p.columna === "publicado"),
    [piezas],
  );
  const noPublicadas = useMemo(
    () => piezas.filter((p) => p.columna !== "publicado"),
    [piezas],
  );

  const proxima = useMemo(() => {
    const future = agendadas.filter((p) => {
      const d = p.fecha_publicacion ? new Date(p.fecha_publicacion) : null;
      return d && d > now;
    });
    return future[0] || null;
  }, [agendadas, now]);

  const NINETY_DAYS_MS = 90 * 86400000;
  const topPiezas = useMemo(() => {
    const cutoff = now.getTime() - NINETY_DAYS_MS;
    return publicadas
      .filter((p) =>
        p.formato === "email" &&
        p.fecha_publicacion &&
        new Date(p.fecha_publicacion).getTime() >= cutoff,
      )
      .map((p) => ({ pieza: p, datos: metricasMap.get(p.id) || {} }))
      .filter((r) => r.datos.tasa_apertura != null)
      .sort((a, b) => Number(b.datos.tasa_apertura) - Number(a.datos.tasa_apertura))
      .slice(0, 3);
  }, [publicadas, metricasMap, now]);

  const aperturaMedia = useMemo(() => {
    const cutoff = now.getTime() - NINETY_DAYS_MS;
    const vals = publicadas
      .filter((p) =>
        p.formato === "email" &&
        p.fecha_publicacion &&
        new Date(p.fecha_publicacion).getTime() >= cutoff,
      )
      .map((p) => metricasMap.get(p.id)?.tasa_apertura)
      .filter((x) => x != null)
      .map(Number);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [publicadas, metricasMap, now]);

  const clicMedio = useMemo(() => {
    const cutoff = now.getTime() - NINETY_DAYS_MS;
    const vals = publicadas
      .filter((p) =>
        p.formato === "email" &&
        p.fecha_publicacion &&
        new Date(p.fecha_publicacion).getTime() >= cutoff,
      )
      .map((p) => metricasMap.get(p.id)?.tasa_clics)
      .filter((x) => x != null)
      .map(Number);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [publicadas, metricasMap, now]);

  const revenue90 = useMemo(() => {
    const cutoff = now.getTime() - NINETY_DAYS_MS;
    const vals = publicadas
      .filter((p) =>
        p.fecha_publicacion &&
        new Date(p.fecha_publicacion).getTime() >= cutoff,
      )
      .map((p) => metricasMap.get(p.id)?.revenue_eur)
      .filter((x) => x != null)
      .map(Number);
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0);
  }, [publicadas, metricasMap, now]);

  const suscriptores = useMemo(() => {
    const vals = publicadas
      .filter((p) => p.formato === "email")
      .map((p) => metricasMap.get(p.id)?.enviados)
      .filter((x) => x != null)
      .map(Number);
    if (vals.length === 0) return null;
    return Math.max(...vals);
  }, [publicadas, metricasMap]);

  const calStrip = useMemo(() => {
    const out = [];
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const dn = d.toLocaleDateString("es-ES", { weekday: "short" })
                  .replace(/\.$/, "").toUpperCase().slice(0, 3);
      const hasEvent = agendadas.some((p) => {
        if (!p.fecha_publicacion) return false;
        const pd = new Date(p.fecha_publicacion);
        return pd.getFullYear() === d.getFullYear()
            && pd.getMonth() === d.getMonth()
            && pd.getDate() === d.getDate();
      });
      out.push({
        dn,
        day: d.getDate(),
        state: i < 0 ? "past" : i === 0 ? "on" : "",
        hasEvent,
      });
    }
    return out;
  }, [now, agendadas]);

  // ─── StatusBar contextual ────────────────────────────────────
  const pageStatus = useMemo(() => ({
    right: [
      { text: "IDEAS ",      strong: String(ideas.length) },
      { text: "PIEZAS ",     strong: String(noPublicadas.length) },
      { text: "AGENDADAS ",  strong: String(agendadas.length) },
      { text: "PUBLICADAS ", strong: String(publicadas.length) },
    ],
  }), [ideas.length, noPublicadas.length, agendadas.length, publicadas.length]);
  usePageStatus(pageStatus);

  // ─── Captura ─────────────────────────────────────────────────
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

  function statusOf(p) {
    if (p.columna === "listo") return { cls: "ready", label: "Listo", micro: `REVISADO · 0D` };
    const age = daysAgo(p.updated_at || p.created_at);
    if (age <= 1) return { cls: "almost", label: "Casi listo", micro: `EDIT · ${age}D` };
    return { cls: "cooking", label: "Cocinando", micro: `EDIT · ${age}D` };
  }

  return (
    <div className="dash-main">

      {/* ═══════════════════ LEFT ═══════════════════ */}
      <div className="dash-col">

        {/* 01 / OPERATOR */}
        <DPanel idx="01" title="Operator" meta={<b>NODE-MAD</b>} ledMeta>
          <div className="dop-head">
            <div className="dop-avatar">
              <span className="dop-status"><i></i></span>
            </div>
            <div>
              <div className="dop-id">ID · IMP-0001</div>
              <h1 className="dop-name">Soma Alcázar</h1>
              <div className="dop-role">
                <span>Founder</span><span className="dot"></span>
                <span>Creator</span><span className="dot"></span>
                <span className="live">● ONLINE</span>
              </div>
            </div>
          </div>
          <div className="dop-rows">
            <div className="dop-row">
              <span className="k">Foco</span>
              <span className="v">
                <span className="arr">→</span>Publicar 3 piezas semanales
              </span>
            </div>
            <div className="dop-row">
              <span className="k">Frecuencia</span>
              <span className="v dim">L · M · V · 13:30</span>
            </div>
            <div className="dop-row">
              <span className="k">Próxima</span>
              <span className="v">
                <span className="arr">·</span>
                {proxima
                  ? whenShort(proxima.fecha_publicacion)
                  : "Sin agendar"}
              </span>
            </div>
            <div className="dop-row">
              <span className="k">Modo</span>
              <span className="v acc">CREATIVE / FLOW</span>
            </div>
          </div>
        </DPanel>

        {/* 02 / EN DESARROLLO */}
        <DPanel
          idx="02"
          title="En desarrollo"
          meta={<><b>{pad2(desarrollo.length)}</b> EN DESARROLLO</>}
          padBody={false}
        >
          {desarrollo.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center",
              fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.22em",
              textTransform: "uppercase", color: "var(--ink-4)" }}>
              Sin piezas en desarrollo
            </div>
          ) : (
            desarrollo.map((p, i) => {
              const s = statusOf(p);
              return (
                <div key={p.id} className={`drow t-${p.formato}`}>
                  <span className="ix">{pad2(i + 1)}</span>
                  <div className="bd">
                    <div className="nm">{p.titulo || "(sin título)"}</div>
                    <div className="sub">{SUBNM_DEFAULT[p.formato] || FORMATO_LABEL[p.formato]}</div>
                  </div>
                  <div className="right">
                    <span className={`dstatus ${s.cls}`}>
                      <span className="d"></span>{s.label}
                    </span>
                    <span className="micro">{s.micro}</span>
                  </div>
                </div>
              );
            })
          )}
        </DPanel>

      </div>

      {/* ═══════════════════ CENTER ═══════════════════ */}
      <div className="dash-col">

        {/* 03 / SESIÓN · HOY */}
        <section className="dpanel dsession">
          <span className="br-tr"></span><span className="br-bl"></span>
          <span className="screw tl"></span><span className="screw tr"></span>
          <span className="screw bl"></span><span className="screw br"></span>
          <header className="dpanel-h">
            <div className="t">
              <span className="idx">03</span>
              <span className="div">/</span>
              <span className="ttl">Sesión · Hoy</span>
            </div>
            <div className="meta">
              <span className="led"></span>UPTIME <b>{hms}</b>
            </div>
          </header>

          <div className="dsess-top">
            <div>
              <div className="dgreet">
                <span>{greetingFor(now)}</span>
                <span className="live"><span className="d"></span>OPERANDO</span>
              </div>
              <h2 className="dsess-ttl">
                Bienvenido,<br />
                <span className="mute">operador.</span>
              </h2>
              <p className="dsess-sub">
                Esta semana publicas <b>{agendadas.length} pieza{agendadas.length === 1 ? "" : "s"}</b>.
                {" "}
                {proxima ? (
                  <>Próxima salida en <b>{relativeDays(proxima.fecha_publicacion).replace("EN ", "")}</b>.</>
                ) : (
                  <>Sin agendar todavía.</>
                )}
              </p>
            </div>
            <div className="dsess-clock">
              <span>{dateBadge(now)}</span>
              <div className="time">
                {pad2(now.getHours())}:{pad2(now.getMinutes())}
                <span className="ss">:{pad2(now.getSeconds())}</span>
              </div>
              <div className="date2">ANDORRA · LOCAL</div>
            </div>
          </div>

          <form className="dcapture" onSubmit={handleCapture}>
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
            <span className="kbd"><span>⌘</span><span>K</span></span>
            <button className="send" type="submit" disabled={capturing || !captureText.trim()}>
              {capturing ? "..." : "Capturar →"}
            </button>
            <div className="quick-tags">
              {[
                { key: "idea",      label: "Idea",      cls: "" },
                { key: "email",     label: "Email",     cls: "t-email" },
                { key: "reel",      label: "Reel",      cls: "t-reel" },
                { key: "relampago", label: "Relámpago", cls: "t-relampago" },
                { key: "youtube",   label: "YouTube",   cls: "t-youtube" },
                { key: "grieta",    label: "Grieta",    cls: "t-grieta" },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`tag ${t.cls} ${captureTag === t.key ? "on" : ""}`.trim()}
                  onClick={() => setCaptureTag(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </form>

          <div className="dsess-foot">
            <span className="it"><span className="led"></span>MODO <b>CREATIVE / FLOW</b></span>
            <span className="it">PRÓXIMA SALIDA <b>{proxima ? whenShort(proxima.fecha_publicacion).replace(/ · /, " · ").split(" · ").slice(0, 2).join(" ") : "—"}</b></span>
            <span className="it">EN COLA <b>{pad2(agendadas.length)}</b></span>
            <span className="it" style={{ marginLeft: "auto" }}>⌘K · CAPTURA GLOBAL</span>
          </div>

          <div className="dkpi-strip">
            <div className="dkpi">
              <span className="k">Apertura media</span>
              <span className="v">{fmtPct(aperturaMedia)}</span>
              <span className={`sub ${aperturaMedia == null ? "" : aperturaMedia >= 33 ? "pos" : aperturaMedia >= 25 ? "warn" : "neg"}`}>
                {aperturaMedia == null ? "sin datos" :
                 aperturaMedia >= 33 ? "↑ sector" :
                 aperturaMedia >= 25 ? "≈ sector" : "↓ sector"}
              </span>
            </div>
            <div className="dkpi">
              <span className="k">Clic medio</span>
              <span className="v">{fmtPct(clicMedio)}</span>
              <span className="sub">sin tracking</span>
            </div>
            <div className="dkpi">
              <span className="k">Revenue 90D</span>
              <span className="v">{revenue90 == null ? "—" : `€${Math.round(revenue90)}`}</span>
              <span className="sub">{revenue90 == null ? "sin atribución" : "atribuido"}</span>
            </div>
            <div className="dkpi">
              <span className="k">Suscriptores</span>
              <span className="v acc">{suscriptores == null ? "—" : suscriptores.toLocaleString("es-ES")}</span>
              <span className="sub">desde lista</span>
            </div>
          </div>
        </section>

        {/* 04 / PIPELINE · FUNNEL */}
        <DPanel
          idx="04"
          title="Pipeline · Funnel"
          meta={<>FLUJO <b>SEMANAL</b> · CIERRE <b>{pad2(publicadas.length)} / SEM</b></>}
        >
          <div className="funnel">
            <div className="stage">
              <span className="k">Ideas</span>
              <span className="v">{ideas.length}</span>
              <span className="delta">CAPTADAS</span>
              <span className="arrow">→</span>
            </div>
            <div className="stage">
              <span className="k">Desarrollo</span>
              <span className="v">{desarrollo.length}</span>
              <span className="delta">TOMANDO FORMA</span>
              <span className="arrow">→</span>
            </div>
            <div className="stage">
              <span className="k">Listo</span>
              <span className="v">{listo.length}</span>
              <span className="delta">PREPARADO</span>
              <span className="arrow">→</span>
            </div>
            <div className="stage">
              <span className="k">Agendado</span>
              <span className="v">{agendadas.length}</span>
              <span className="delta pos">FECHA FIJADA</span>
              <span className="arrow">→</span>
            </div>
            <div className="stage publi">
              <span className="k">Publicado</span>
              <span className="v">{publicadas.length}</span>
              <span className="delta">EN EL MUNDO</span>
            </div>
          </div>
        </DPanel>

        {/* 05 / TOP PIEZAS · 90D */}
        <DPanel
          idx="05"
          title="Top piezas · 90D"
          meta={<>ORDEN <b>% APERTURA</b></>}
          padBody={false}
        >
          {topPiezas.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center",
              fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.22em",
              textTransform: "uppercase", color: "var(--ink-4)" }}>
              Sin emails publicados en 90D
            </div>
          ) : (
            topPiezas.map((r, i) => {
              const pct = Number(r.datos.tasa_apertura);
              const delta = aperturaMedia != null ? (pct - aperturaMedia) : null;
              const microColor = delta == null
                ? "var(--ink-4)"
                : delta >= 1   ? "var(--pos)"
                : delta <= -1  ? "oklch(0.72 0.205 30)"
                : "var(--ink-4)";
              const microText = delta == null ? "—"
                : delta >= 1   ? `▲ +${delta.toFixed(1)} vs media`
                : delta <= -1  ? `▼ ${delta.toFixed(1)} vs media`
                : "≈ media";
              return (
                <div key={r.pieza.id} className={`drow t-${r.pieza.formato}`}>
                  <span className="ix">{pad2(i + 1)}</span>
                  <div className="bd">
                    <div className="nm">{r.pieza.titulo || "(sin título)"}</div>
                    <div className="sub">{topSubtitle(r.pieza, r.datos)}</div>
                  </div>
                  <div className="right">
                    <span className="pct">{fmtPct(pct)}</span>
                    <span className="micro" style={{ color: microColor }}>{microText}</span>
                  </div>
                </div>
              );
            })
          )}
          <div className="spark">
            <svg viewBox="0 0 600 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="var(--acc)" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
                </linearGradient>
                <pattern id="sparkGrid" width="60" height="20" patternUnits="userSpaceOnUse">
                  <path d="M60 0H0V20" fill="none" stroke="var(--line)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="600" height="80" fill="url(#sparkGrid)" />
              <path
                d="M0 65 L40 60 L80 62 L120 50 L160 55 L200 42 L240 48 L280 35 L320 38 L360 26 L400 30 L440 22 L480 28 L520 18 L560 22 L600 12 L600 80 L0 80 Z"
                fill="url(#sparkFill)"
              />
              <path
                d="M0 65 L40 60 L80 62 L120 50 L160 55 L200 42 L240 48 L280 35 L320 38 L360 26 L400 30 L440 22 L480 28 L520 18 L560 22 L600 12"
                fill="none" stroke="var(--acc)" strokeWidth="1.4"
              />
            </svg>
            <span className="now-dot"></span>
          </div>
        </DPanel>

      </div>

      {/* ═══════════════════ RIGHT ═══════════════════ */}
      <div className="dash-col">

        {/* 06 / AGENDADO · Próximas salidas */}
        <DPanel
          idx="06"
          title="Agendado · Próximas salidas"
          meta={<><b>{pad2(agendadas.length)}</b> EN COLA</>}
          padBody={false}
        >
          {agendadas.length === 0 ? (
            <div style={{ padding: "30px", textAlign: "center",
              fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.22em",
              textTransform: "uppercase", color: "var(--ink-4)" }}>
              Sin piezas agendadas
            </div>
          ) : (
            agendadas.map((p) => {
              const datos = metricasMap.get(p.id) || {};
              const destinos = datos.enviados ? `${datos.enviados} destinos` : "—";
              const subParts = [
                FORMATO_LABEL[p.formato]?.toUpperCase() || p.formato.toUpperCase(),
                destinos,
              ];
              return (
                <div key={p.id} className={`drow t-${p.formato}`}>
                  <span className="ix">·</span>
                  <div className="bd">
                    <div className="nm">{p.titulo || "(sin título)"}</div>
                    <div className="sub">{subParts.join(" · ")}</div>
                  </div>
                  <div className="right">
                    <span className="when">{whenShort(p.fecha_publicacion)}</span>
                    <span className="micro">{relativeDays(p.fecha_publicacion)}</span>
                  </div>
                </div>
              );
            })
          )}
          <div className="cal-strip">
            {calStrip.map((d, i) => (
              <div key={i} className={`day ${d.state}`.trim()}>
                <div className="dn">{d.dn}</div>
                <div className="nm">{d.day}</div>
                <div className="ev">{d.hasEvent && <i></i>}</div>
              </div>
            ))}
          </div>
        </DPanel>

        {/* MANTRA (sin header) */}
        <section className="dpanel mantra">
          <span className="br-tr"></span><span className="br-bl"></span>
          <span className="screw tl"></span><span className="screw tr"></span>
          <span className="screw bl"></span><span className="screw br"></span>
          <div className="q">Publicar es la única prueba.</div>
          <div className="credit">IMPERIO INDOMABLE · <b>CÓDIGO PROPIO</b></div>
        </section>

        {/* 07 / ATAJOS */}
        <DPanel
          idx="07"
          title="Atajos"
          meta="⌘K · CAPTURA"
          padBody={false}
        >
          <NavLink to="/tablero" className="drow" style={{ textDecoration: "none" }}>
            <span className="ix">·</span>
            <div className="bd">
              <div className="nm" style={{ color: "var(--ink)" }}>Ir al Tablero</div>
              <div className="sub">Kanban · 5 columnas · {piezas.length} piezas</div>
            </div>
            <div className="right">
              <span className="dstatus"><span className="d"></span>→</span>
            </div>
          </NavLink>
          <NavLink to="/analisis" className="drow" style={{ textDecoration: "none" }}>
            <span className="ix">·</span>
            <div className="bd">
              <div className="nm" style={{ color: "var(--ink)" }}>Ir a Análisis</div>
              <div className="sub">Performance · {publicadas.filter(p => p.formato === "email").length} emails · 90D</div>
            </div>
            <div className="right">
              <span className="dstatus"><span className="d"></span>→</span>
            </div>
          </NavLink>
          <div
            className="drow"
            onClick={() => captureRef.current?.focus()}
            style={{ cursor: "pointer" }}
          >
            <span className="ix">·</span>
            <div className="bd">
              <div className="nm">Nueva idea</div>
              <div className="sub">Captura rápida · ⌘K</div>
            </div>
            <div className="right">
              <span className="dstatus"><span className="d"></span>+</span>
            </div>
          </div>
          <NavLink to="/tablero" className="drow" style={{ textDecoration: "none" }}>
            <span className="ix">·</span>
            <div className="bd">
              <div className="nm" style={{ color: "var(--ink)" }}>Programar pieza lista</div>
              <div className="sub">Mover de Listo → Agendado</div>
            </div>
            <div className="right">
              <span className="dstatus"><span className="d"></span>→</span>
            </div>
          </NavLink>
        </DPanel>

      </div>

    </div>
  );
}
