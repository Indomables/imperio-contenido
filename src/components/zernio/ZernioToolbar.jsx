/**
 * ZernioToolbar — Barra superior de la pestaña Zernio.
 *
 * Estructura del handoff Claude Design (`.zernio-toolbar`):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ [Inbox · 0] [Histórico · 0]   [search]   CLASIF · UMBRAL ·  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Iteración 1: cosmética. Las pills muestran 0, la búsqueda no filtra
 * (no hay datos). Conmutar Inbox/Histórico cambia `view` en el padre,
 * que decide qué pintar abajo (en Iteración 1 ambas pintan Inbox Zero).
 *
 * Props:
 *   view              — 'inbox' | 'historico'
 *   pendingCount      — number (0 en v1)
 *   historicoCount    — number (0 en v1)
 *   onViewChange      — (view) => void
 *   searchQuery       — string
 *   onSearchChange    — (q) => void
 */

export default function ZernioToolbar({
  view = "inbox",
  pendingCount = 0,
  historicoCount = 0,
  onViewChange,
  searchQuery = "",
  onSearchChange,
}) {
  return (
    <div className="zernio-toolbar">
      <div className="zernio-views">
        <button
          type="button"
          className={`vtab${view === "inbox" ? " on" : ""}`}
          onClick={() => onViewChange?.("inbox")}
          data-view="inbox"
        >
          Inbox
          <span className="pill">{pendingCount}</span>
        </button>
        <button
          type="button"
          className={`vtab${view === "historico" ? " on" : ""}`}
          onClick={() => onViewChange?.("historico")}
          data-view="historico"
        >
          Histórico
          <span className="pill">{historicoCount}</span>
        </button>
      </div>

      <div className="zernio-search">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por @handle o texto del DM…"
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
        <span className="kbd">/</span>
      </div>

      <div className="zernio-toolbar-meta">
        <span>
          CLASIFICADOR <b>v3.2</b>
        </span>
        <span className="sep"></span>
        <span>
          UMBRAL CONF. <b>50%</b>
        </span>
        <span className="sep"></span>
        <span>
          AUTO-ENROL <b style={{ color: "var(--ink-4)" }}>OFF</b>
        </span>
      </div>
    </div>
  );
}
