import { NavLink } from "react-router-dom";
import useClock from "../hooks/useClock.js";
import SomaAudio from "../lib/soma-audio";

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
        <NavLink
          to="/zernio"
          className={({ isActive }) => `subtab${isActive ? " on" : ""}`}
        >
          <svg
            className="ico"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path d="M2 4h12v8H2z" />
            <path d="M2 4l6 4 6-4" />
          </svg>
          Zernio
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
        <button
          className="iconbtn tweaks"
          data-tip="Tweaks"
          onClick={() => {
            SomaAudio.toggle();
            window.dispatchEvent(new CustomEvent("tweaks:toggle"));
          }}
        >
          <svg className="ico" viewBox="0 0 16 16">
            <path d="M2 4h12M2 8h12M2 12h12" />
            <circle cx="5" cy="4" r="1.5" fill="currentColor" />
            <circle cx="10" cy="8" r="1.5" fill="currentColor" />
            <circle cx="6" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <button className="iconbtn logout" data-tip="Cerrar sesión">
          <svg
            className="ico"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <path d="M6 2H2v12h4M10 5l3 3-3 3M6 8h7" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
