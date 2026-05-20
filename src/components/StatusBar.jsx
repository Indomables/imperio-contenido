/**
 * StatusBar — barra inferior contextual.
 *
 * v0.45.1: lee de PageStatusContext. Si la página activa reporta un status
 * (vía usePageStatus), lo muestra en lugar de los defaults globales.
 *
 * Estructura visual (estable):
 *   [versión IMPERIO·CONTENIDO]  [items left]   [items right]  [⌘K · CAPTURA]
 *
 * Cuando la página NO reporta status (Dashboard, Tablero), muestra defaults:
 *   left:  SCREEN_LABEL · OPERADOR SOMA ALCÁZAR · UPTIME hh:mm:ss
 *   right: IDEAS — · PIEZAS — · AGENDADAS — · PUBLICADAS —
 */

import { useLocation } from "react-router-dom";
import useClock from "../hooks/useClock.js";
import { usePageStatusValue } from "../lib/pageStatus.jsx";

const SCREEN_LABELS = {
  "/dashboard": "DASHBOARD · COCKPIT",
  "/tablero":   "TABLERO · KANBAN",
  "/analisis":  "ANÁLISIS · PERFORMANCE",
};

function StatusItem({ item }) {
  // item = { text?, strong?, strongStyle? }
  return (
    <span>
      {item.text}
      {item.strong != null && <b style={item.strongStyle}>{item.strong}</b>}
    </span>
  );
}

export default function StatusBar() {
  const { uptime } = useClock();
  const location = useLocation();
  const pageStatus = usePageStatusValue();

  // Defaults cuando la página no reporta nada
  const defaultLeft = [
    { strong: SCREEN_LABELS[location.pathname] || "—" },
    { text: "OPERADOR ", strong: "SOMA ALCÁZAR" },
    { text: "UPTIME ",   strong: uptime },
  ];

  const defaultRight = [
    { text: "IDEAS ",      strong: "—" },
    { text: "PIEZAS ",     strong: "—" },
    { text: "AGENDADAS ",  strong: "—" },
    { text: "PUBLICADAS ", strong: "—" },
  ];

  const leftItems  = pageStatus?.left  ?? defaultLeft;
  const rightItems = pageStatus?.right ?? defaultRight;

  return (
    <div className="contenido-statusbar">
      <div className="l">
        <span>
          <span className="led"></span> IMPERIO·CONTENIDO <b>v0.61.0</b>
        </span>
        {leftItems.map((item, idx) => (
          <StatusItem key={`l-${idx}`} item={item} />
        ))}
      </div>
      <div className="r">
        {rightItems.map((item, idx) => (
          <StatusItem key={`r-${idx}`} item={item} />
        ))}
        <span>⌘K · CAPTURA</span>
      </div>
    </div>
  );
}
