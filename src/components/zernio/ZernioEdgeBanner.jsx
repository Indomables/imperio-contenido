/**
 * ZernioEdgeBanner — Banner fijo bajo la nav que avisa de Edge fn degradada o caída.
 *
 * Solo se renderiza si `state` es 'degraded' o 'down'. En 'operational' devuelve null
 * (el banner no aparece).
 *
 * Markup del handoff (`.edge-banner`):
 *   warn  → ámbar     · "Zernio en modo degradado · Latencia elevada (1.8s)"
 *   down  → rojo      · "ZERNIO NO ESTÁ PROCESANDO DMs. Edge function caída desde HH:MM · NN min"
 */

export default function ZernioEdgeBanner({ health, onViewLogs, onRetry }) {
  if (!health || health.state === "operational") return null;

  const isDown = health.state === "down";
  const className = `edge-banner${isDown ? " down" : " warn"}`;

  let msg;
  if (isDown) {
    const downSinceMin = health.downSinceMs
      ? Math.round((Date.now() - health.downSinceMs) / 60000)
      : null;
    const downSinceHHMM = health.downSinceMs ? formatHHMM(new Date(health.downSinceMs)) : "—";
    msg = (
      <>
        <b>ZERNIO NO ESTÁ PROCESANDO DMs.</b>
        <span className="secondary">
          Edge function "classify-dm" caída desde {downSinceHHMM}
          {downSinceMin !== null && ` · ${downSinceMin} min`}
        </span>
      </>
    );
  } else {
    const latencyS = (health.latencyMeanMs / 1000).toFixed(1);
    msg = (
      <>
        <b>ZERNIO EN MODO DEGRADADO.</b>
        <span className="secondary">
          Latencia elevada ({latencyS}s) · {health.retries} reintentos en cola
        </span>
      </>
    );
  }

  return (
    <div className={className}>
      <span className="led"></span>
      <span className="msg">{msg}</span>
      <div className="actions">
        <button type="button" onClick={onViewLogs}>
          Ver logs
        </button>
        <button type="button" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    </div>
  );
}

function formatHHMM(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
