/**
 * Análisis — Performance por tipo y período.
 *
 * Fase 1 (esta versión): cabecera con chips, KPI strip vacío, tabla esqueleto.
 * Fase 3: datos reales, sortable, filtrable, exportable.
 */

export default function Analisis() {
  return (
    <>
      <header className="an-head">
        <div className="title">
          <span className="dot"></span>
          Análisis · Rendimiento
        </div>
        <div className="period-chips">
          <button className="chip">Últimos 30 días</button>
          <button className="chip on">Últimos 90 días</button>
          <button className="chip">Últimos 6 meses</button>
          <button className="chip">Todo</button>
        </div>
        <div className="type-chips">
          <button className="chip t-email on">
            Email <span className="ct">—</span>
          </button>
          <button className="chip t-reel">
            Reel <span className="ct">—</span>
          </button>
          <button className="chip t-relampago">
            Relámpago <span className="ct">—</span>
          </button>
          <button className="chip t-youtube">
            YouTube <span className="ct">—</span>
          </button>
          <button className="chip t-grieta">
            Grieta <span className="ct">—</span>
          </button>
        </div>
      </header>

      <div className="kpi-strip">
        {["Emails publicados", "Apertura media", "Clic medio", "Revenue atribuido"].map(
          (k) => (
            <div key={k} className="kpi-card">
              <span className="br-tr"></span>
              <span className="br-bl"></span>
              <div className="k">{k}</div>
              <div className="v dash">—</div>
              <div className="sub">backend en construcción</div>
            </div>
          )
        )}
      </div>

      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th className="idx">#</th>
              <th className="title-col">Pieza</th>
              <th>Enviados</th>
              <th>Aperturas</th>
              <th>% Apertura</th>
              <th>Clics</th>
              <th>% Clics</th>
              <th>Replies</th>
              <th>Bajas</th>
              <th>% Bajas</th>
              <th>Revenue atribuido (€)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan={11}
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: "var(--ink-4)",
                  letterSpacing: "0.10em",
                }}
              >
                — esperando datos del backend —
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
