/**
 * ZernioStateOverride — Toggle oculto para forzar estados especiales.
 *
 * Aparece como un pequeño botón en la esquina inferior izquierda del panel
 * central. Al hacer clic, abre un mini-panel con 6 opciones:
 *   - Normal
 *   - Inbox Zero
 *   - Loading
 *   - Error
 *   - Edge degradada
 *   - Edge caída
 *
 * Útil para que Soma pueda VER cada estado en vivo sin tener que esperar
 * a que ocurra de verdad. Se borrará cuando Iteración 3 esté validada y
 * el backend real entregue cada estado por sí solo.
 *
 * Props:
 *   value      — estado actual ('normal', 'zero', 'loading', 'error', 'warn', 'down')
 *   onChange   — (newState) => void
 */

import { useState } from "react";

const STATES = [
  { id: "normal",  label: "Normal" },
  { id: "zero",    label: "Inbox Zero" },
  { id: "loading", label: "Cargando" },
  { id: "error",   label: "Error" },
  { id: "warn",    label: "Edge degradada" },
  { id: "down",    label: "Edge caída" },
];

export default function ZernioStateOverride({ value = "normal", onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="zstate-override">
      <button
        type="button"
        className="zstate-override-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Forzar estado (demo)"
        aria-label="Forzar estado"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="6" />
          <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        </svg>
        <span className="lbl">DEMO</span>
      </button>

      {open && (
        <div className="zstate-override-menu">
          <div className="zstate-override-hd">FORZAR ESTADO</div>
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`zstate-override-opt${value === s.id ? " on" : ""}`}
              onClick={() => {
                onChange?.(s.id);
                setOpen(false);
              }}
            >
              <span className="dot"></span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
