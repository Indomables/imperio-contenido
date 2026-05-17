import { useEffect, useState } from "react";

const SESSION_START = Date.now();

function pad(n) {
  return n.toString().padStart(2, "0");
}

function formatHMS(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Tick global cada 1s. Devuelve:
 *   - now: Date
 *   - hms: "HH:MM:SS" hora actual
 *   - uptime: "HH:MM:SS" desde que cargó la sesión
 */
export default function useClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return {
    now,
    hms: formatHMS(now),
    uptime: formatUptime(Date.now() - SESSION_START),
  };
}
