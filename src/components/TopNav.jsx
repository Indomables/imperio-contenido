import { NavLink } from "react-router-dom";
import useClock from "../hooks/useClock.js";

export default function TopNav() {
  const { hms } = useClock();

  return (
    <nav className="contenido-nav">
      <div className="contenido-brand">
        <span className="mark" aria-hidden="true"></span>
        <div className="nm">
          <b>IMPERIO</b>
          <small>CONTENIDO</small>
        </div>
      </div>

      <div className="subtabs">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `subtab${isActive ? " on" : ""}`}
        >
          <svg
            className="ico"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <rect x="2" y="3" width="12" height="10" />
            <path d="M2 7h12" />
          </svg>
          Dashboard
        </NavLink>
        <NavLink
          to="/tablero"
          className={({ isActive }) => `subtab${isActive ? " on" : ""}`}
        >
          <svg
            className="ico"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <rect x="2" y="2" width="5" height="12" />
            <rect x="9" y="2" width="5" height="6" />
          </svg>
          Tablero
        </NavLink>
        <NavLink
          to="/analisis"
          className={({ isActive }) => `subtab${isActive ? " on" : ""}`}
        >
          <svg
            className="ico"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path d="M2 14V6M6 14V2M10 14V8M14 14V4" />
          </svg>
          Análisis
        </NavLink>
      </div>

      <div className="contenido-stats">
        <span className="led"></span>
        <span className="item">
          SISTEMA <b className="acc">ACTIVO</b>
        </span>
        <span className="sep"></span>
        <span className="item">
          CRON <b>CADA HORA</b>
        </span>
        <span className="sep"></span>
        <span className="item">
          KIT <b className="acc">OK</b>
        </span>
        <span className="sep"></span>
        <span className="item">
          ZERNIO <b className="acc">OK</b>
        </span>
        <span className="sep"></span>
        <span className="item">
          SYNC <b>{hms}</b>
        </span>
        <span className="sep"></span>
        <span className="item">
          <b>SOMA</b> · NODE-MAD
        </span>
      </div>

      <div className="contenido-actions">
        <button className="iconbtn sync" data-tip="Recargar">
          <svg className="ico" viewBox="0 0 16 16">
            <path d="M2 8a6 6 0 0 1 10-4.5M14 8a6 6 0 0 1-10 4.5M11 3.5h3v-3M5 12.5H2v3" />
          </svg>
        </button>
        <button className="iconbtn zap" data-tip="Sync APIs">
          <svg className="ico" viewBox="0 0 16 16">
            <path d="M9 1L3 9h4l-1 6 6-8H8l1-6Z" />
          </svg>
        </button>
        <button className="iconbtn settings" data-tip="Ajustes">
          <svg className="ico" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="2.4" />
            <path d="M8 1v2M8 13v2M15 8h-2M3 8H1M12.9 3.1l-1.4 1.4M4.5 11.5l-1.4 1.4M12.9 12.9l-1.4-1.4M4.5 4.5L3.1 3.1" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
