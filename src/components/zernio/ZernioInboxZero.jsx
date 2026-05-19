/**
 * ZernioInboxZero — Estado "Todo decidido" del panel central.
 *
 * Markup del handoff Claude Design (`.zlist-empty[data-state="zero"]`):
 *   ┌────────────────────────────────┐
 *   │           ┌─────┐              │
 *   │           │  0  │   <- hex con glow
 *   │           └─────┘              │
 *   │       · INBOX · ZERO ·         │
 *   │       Todo decidido.           │
 *   │       (desc operator-grade)    │
 *   │   ● WEBHOOK ACTIVO · ÚLTIMA…   │
 *   └────────────────────────────────┘
 *
 * Iteración 1: este es el estado por defecto. No hay datos todavía.
 * El timestamp "ÚLTIMA SINC" es la hora de carga (mock).
 *
 * Props:
 *   lastSyncHHMMSS — string opcional "HH:MM:SS", default = ahora
 *   desc           — copy del párrafo descriptivo (override opcional)
 */

const DEFAULT_DESC =
  "Aún no hay notificaciones en la bandeja. Zernio está conectado y a la escucha. La próxima notificación clasificada aparecerá aquí.";

export default function ZernioInboxZero({
  lastSyncHHMMSS,
  desc = DEFAULT_DESC,
}) {
  const sync = lastSyncHHMMSS || formatHHMMSS(new Date());

  return (
    <div className="zlist-empty" data-state="zero">
      <div className="hex">
        <span className="num">0</span>
      </div>
      <div className="stamp">INBOX · ZERO</div>
      <div className="ttl">Todo decidido.</div>
      <div className="desc">{desc}</div>
      <div className="last">
        <span className="d"></span>
        <span>
          WEBHOOK ACTIVO · ÚLTIMA SINC <b>{sync}</b>
        </span>
      </div>
    </div>
  );
}

function formatHHMMSS(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
