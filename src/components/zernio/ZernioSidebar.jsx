/**
 * ZernioSidebar — Columna izquierda (260px) con 3 paneles apilados.
 *
 * v0.59.0-α · Iteración 2: filtros operativos, contadores derivados del mock,
 * edge health dinámica (estado operational/degraded/down con LED y desc adaptados).
 */

import SomaAudio from "../../lib/soma-audio";

const INTENT_CHIPS = [
  { id: "hermandad", label: "Hermandad" },
  { id: "elite",     label: "Élite" },
  { id: "general",   label: "General" },
  { id: "sininter",  label: "Sin interés" },
];

const TEMP_CHIPS = [
  { id: "hot",  label: "Caliente" },
  { id: "warm", label: "Tibio" },
  { id: "cold", label: "Frío" },
];

const CONF_CHIPS = [
  { id: "all",  label: "Todas" },
  { id: "high", label: "> 85%" },
  { id: "mid",  label: "50-85%" },
  { id: "low",  label: "< 50%" },
];

const HEALTH_LABELS = {
  operational: { label: "OPERATIVO",  className: "" },
  degraded:    { label: "DEGRADADO",  className: "warn" },
  down:        { label: "CAÍDA",      className: "down" },
};

export default function ZernioSidebar({
  edgeHealth,
  counters,
  filters,
  onToggleIntent,
  onToggleTemperature,
  onSetConfidenceRange,
  onResetFilters,
}) {
  const health = HEALTH_LABELS[edgeHealth?.state || "operational"];

  return (
    <aside className="zside">

      {/* ─── HEALTH ─── */}
      <section className="zpanel">
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <header className="zpanel-h">
          <div className="t">
            <span className="led"></span>
            <span className="ix">01</span>
            <span>Edge fn</span>
          </div>
          <div className="meta">v3.2</div>
        </header>
        <div className={`zhealth${health.className ? " " + health.className : ""}`}>
          <div className="row1">
            <span className="led"></span>
            <span>
              ESTADO · <b className="acc">{health.label}</b>
            </span>
          </div>
          <div className="desc">{healthDesc(edgeHealth)}</div>
          <div className="stack">
            <div>
              <span className="k">Procesadas 24h</span>
              <span className="v acc">{edgeHealth?.processedLast24h ?? "—"}</span>
            </div>
            <div>
              <span className="k">Latencia p95</span>
              <span className="v">
                {edgeHealth?.latencyP95Ms ? `${edgeHealth.latencyP95Ms}ms` : "—"}
              </span>
            </div>
            <div>
              <span className="k">Tasa éxito</span>
              <span className="v acc">
                {edgeHealth?.successRate != null
                  ? `${(edgeHealth.successRate * 100).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
            <div>
              <span className="k">Reintentos</span>
              <span className="v">
                {edgeHealth?.retries != null
                  ? String(edgeHealth.retries).padStart(2, "0")
                  : "—"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PULSO ─── */}
      <section className="zpanel">
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <header className="zpanel-h">
          <div className="t">
            <span className="led"></span>
            <span className="ix">02</span>
            <span>Pulso</span>
          </div>
          <div className="meta">
            SEM <b>W{currentISOWeek()}</b>
          </div>
        </header>
        <div className="zpanel-b flush zcount">
          <div className="zcount-row big">
            <span className="k">Pendientes</span>
            <span className="v">{counters?.pendingCount ?? 0}</span>
          </div>
          <div className="zcount-row">
            <span className="k">Decididas hoy</span>
            <span className="v">{counters?.decidedToday ?? 0}</span>
          </div>
          <div className="zcount-row">
            <span className="k">Esta semana</span>
            <span className="v">
              {counters?.decidedWeek ?? 0}
              <small>/30</small>
            </span>
          </div>
          <div className="zcount-row">
            <span className="k">Tasa enrolamiento</span>
            <span className="v">
              {counters?.enrolmentRate ?? 0}
              <small>%</small>
            </span>
          </div>
        </div>
      </section>

      {/* ─── FILTROS ─── */}
      <section className="zpanel">
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <header className="zpanel-h">
          <div className="t">
            <span className="led"></span>
            <span className="ix">03</span>
            <span>Filtros</span>
          </div>
          <button
            type="button"
            className="meta"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ink-4)",
              fontFamily: "var(--mono)",
              fontSize: "9.5px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
            onClick={() => {
              SomaAudio.tap();
              onResetFilters?.();
            }}
          >
            RESET
          </button>
        </header>
        <div className="zpanel-b flush">

          <div className="zfilter-group">
            <div className="lbl">Intención</div>
            <div className="chips">
              {INTENT_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`zchip int-${c.id}${filters?.intents.has(c.id) ? " on" : ""}`}
                  onClick={() => {
                    SomaAudio.tap();
                    onToggleIntent?.(c.id);
                  }}
                >
                  <span className="d"></span>
                  {c.label}
                  <span className="ct">{counters?.pendingByIntent?.[c.id] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="zfilter-group">
            <div className="lbl">Temperatura</div>
            <div className="chips">
              {TEMP_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`zchip temp-${c.id}${filters?.temperatures.has(c.id) ? " on" : ""}`}
                  onClick={() => {
                    SomaAudio.tap();
                    onToggleTemperature?.(c.id);
                  }}
                >
                  <span className="d"></span>
                  {c.label}
                  <span className="ct">{counters?.pendingByTemp?.[c.id] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="zfilter-group">
            <div className="lbl">Confianza</div>
            <div className="chips">
              {CONF_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`zchip${filters?.confidenceRange === c.id ? " on" : ""}`}
                  onClick={() => {
                    SomaAudio.tap();
                    onSetConfidenceRange?.(c.id);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </section>

    </aside>
  );
}

function healthDesc(health) {
  if (!health) return "Esperando primer DM.";
  if (health.state === "operational") {
    const latency = health.latencyMeanMs ? `${health.latencyMeanMs}ms` : "—";
    const lastMin = health.lastProcessedAt
      ? Math.max(1, Math.round((Date.now() - health.lastProcessedAt) / 60000))
      : null;
    return (
      <>
        Procesando DMs en tiempo real. Latencia media <b>{latency}</b>.
        {lastMin != null && (
          <>
            {" "}
            Último clasificado hace <b>{lastMin} min</b>.
          </>
        )}
      </>
    );
  }
  if (health.state === "degraded") {
    return (
      <>
        Latencia elevada. <b>{health.retries}</b> reintentos en cola. La cola
        sigue procesándose pero con retraso.
      </>
    );
  }
  if (health.state === "down") {
    const downMin = health.downSinceMs
      ? Math.round((Date.now() - health.downSinceMs) / 60000)
      : null;
    return (
      <>
        Edge function no responde {downMin != null && (
          <>
            desde hace <b>{downMin} min</b>.
          </>
        )}{" "}
        Los DMs entrantes se acumulan en la cola de Zernio.
      </>
    );
  }
  return "—";
}

function currentISOWeek() {
  const d = new Date();
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
  return Math.ceil(((u - yearStart) / 86400000 + 1) / 7);
}
