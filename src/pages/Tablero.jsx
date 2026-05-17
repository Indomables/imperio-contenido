/**
 * Tablero — Kanban de 5 carriles.
 *
 * Fase 1 (esta versión): esqueleto vacío con los 5 carriles.
 * Fase 3: cards reales conectadas al backend, drag & drop, filtros.
 */

const CARRILES = [
  { ix: "01", nm: "Ideas", sub: "Captadas", dotsOn: 0 },
  { ix: "02", nm: "En desarrollo", sub: "Tomando forma", dotsOn: 2 },
  { ix: "03", nm: "Listo", sub: "Preparado", dotsOn: 3 },
  { ix: "04", nm: "Agendado", sub: "Fecha fijada", dotsOn: 4 },
  { ix: "05", nm: "Publicado", sub: "En el mundo", dotsOn: 4 },
];

export default function Tablero() {
  return (
    <>
      {/* Capture bar */}
      <div className="cmdbar">
        <span className="promp">›</span>
        <div className="input-wrap">
          <input
            type="text"
            placeholder="Captura una idea, link, frase, video, lead de contenido…"
          />
        </div>
        <button className="send">Capturar →</button>
      </div>

      {/* Board */}
      <div className="board">
        {CARRILES.map((c) => (
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
                  <div className="count">0</div>
                  <button className="add-btn" type="button">
                    +
                  </button>
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
              <div className="kcol-empty">
                <span className="ring">—</span>
                <span>Esperando datos</span>
                <span
                  style={{
                    color: "var(--ink-5)",
                    letterSpacing: "0.10em",
                  }}
                >
                  Backend en construcción
                </span>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
