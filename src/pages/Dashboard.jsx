/**
 * Dashboard — Cockpit principal.
 *
 * Fase 1 (esta versión): solo placeholder con el chasis visual cargando.
 * Fase 3: implementar paneles reales (Operator, En Desarrollo, Sesión Hoy,
 *         Pipeline, Top Piezas, Agendado, Mantra, Atajos).
 */

export default function Dashboard() {
  return (
    <div className="dash-main">
      <div className="dash-col">
        <section className="dpanel">
          <span className="br-tr"></span>
          <span className="br-bl"></span>
          <span className="screw tl"></span>
          <span className="screw tr"></span>
          <span className="screw bl"></span>
          <span className="screw br"></span>
          <header className="dpanel-h">
            <div className="t">
              <span className="idx">··</span>
              <span className="div">/</span>
              <span className="ttl">Dashboard</span>
            </div>
            <div className="meta">
              <span className="led"></span>
              <b>EN CONSTRUCCIÓN</b>
            </div>
          </header>
          <div className="dpanel-b">
            <p style={{ color: "var(--ink-3)", lineHeight: 1.6 }}>
              Cockpit principal del sistema.
              <br />
              <br />
              <span style={{ color: "var(--acc)" }}>SOMA OS · v0.42</span> cargado.
              <br />
              Esperando la siguiente fase de implementación.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
