/**
 * ZernioSidebar — Columna izquierda (260px) con 3 paneles apilados.
 *
 * Estructura del handoff Claude Design (`.zside`):
 *   ┌───────────────┐
 *   │ 01 · Edge fn  │  Health (LED + estado + métricas 2x2)
 *   ├───────────────┤
 *   │ 02 · Pulso    │  Contadores (Pendientes, Decididas hoy, etc)
 *   ├───────────────┤
 *   │ 03 · Filtros  │  Chips: Intención · Temperatura · Confianza
 *   └───────────────┘
 *
 * Iteración 1: chrome visible, datos a "—". Los chips son visualmente
 * activos para que se vea su estética, pero NO filtran nada. Los counters
 * de cada chip se ocultan en v1.
 */

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

export default function ZernioSidebar() {
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
        <div className="zhealth">
          <div className="row1">
            <span className="led"></span>
            <span>
              ESTADO · <b className="acc">OPERATIVO</b>
            </span>
          </div>
          <div className="desc">
            Esperando primer DM. Webhook conectado y a la escucha.
          </div>
          <div className="stack">
            <div>
              <span className="k">Procesadas 24h</span>
              <span className="v">—</span>
            </div>
            <div>
              <span className="k">Latencia p95</span>
              <span className="v">—</span>
            </div>
            <div>
              <span className="k">Tasa éxito</span>
              <span className="v">—</span>
            </div>
            <div>
              <span className="k">Reintentos</span>
              <span className="v">—</span>
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
            <span className="v">0</span>
          </div>
          <div className="zcount-row">
            <span className="k">Decididas hoy</span>
            <span className="v">—</span>
          </div>
          <div className="zcount-row">
            <span className="k">Esta semana</span>
            <span className="v">—</span>
          </div>
          <div className="zcount-row">
            <span className="k">Tasa enrolamiento</span>
            <span className="v">—</span>
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
            disabled
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
                  className={`zchip int-${c.id} on`}
                  disabled
                >
                  <span className="d"></span>
                  {c.label}
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
                  className={`zchip temp-${c.id} on`}
                  disabled
                >
                  <span className="d"></span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="zfilter-group">
            <div className="lbl">Confianza</div>
            <div className="chips">
              {CONF_CHIPS.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={`zchip${i === 0 ? " on" : ""}`}
                  disabled
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

/* Semana ISO actual (calculada en cliente, sin libs). */
function currentISOWeek() {
  const d = new Date();
  const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
  return Math.ceil(((u - yearStart) / 86400000 + 1) / 7);
}
