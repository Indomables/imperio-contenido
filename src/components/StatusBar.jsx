import { useLocation } from "react-router-dom";
import useClock from "../hooks/useClock.js";

const SCREEN_LABELS = {
  "/dashboard": "DASHBOARD · COCKPIT",
  "/tablero": "TABLERO · KANBAN",
  "/analisis": "ANÁLISIS · PERFORMANCE",
};

export default function StatusBar() {
  const { uptime } = useClock();
  const location = useLocation();
  const screenLabel = SCREEN_LABELS[location.pathname] || "—";

  return (
    <div className="contenido-statusbar">
      <div className="l">
        <span>
          <span className="led"></span> IMPERIO·CONTENIDO <b>v0.45.0</b>
        </span>
        <span>{screenLabel}</span>
        <span>
          OPERADOR <b>SOMA ALCÁZAR</b>
        </span>
        <span>
          UPTIME <b>{uptime}</b>
        </span>
      </div>
      <div className="r">
        <span>
          IDEAS <b>—</b>
        </span>
        <span>
          PIEZAS <b>—</b>
        </span>
        <span>
          AGENDADAS <b>—</b>
        </span>
        <span>
          PUBLICADAS <b>—</b>
        </span>
        <span>⌘K · CAPTURA</span>
      </div>
    </div>
  );
}
