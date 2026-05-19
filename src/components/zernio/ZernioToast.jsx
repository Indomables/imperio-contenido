/**
 * ZernioToast — Toast discreto en la esquina inferior derecha.
 *
 * Aparece tras una acción (enrolar, descartar, etiquetar, promover) y desaparece
 * automáticamente a los 3s. Hover prolonga la vida.
 *
 * Props:
 *   toast — { id, kind: 'success' | 'info' | 'todo', message } | null
 *   onDismiss — () => void
 */

import { useEffect, useState } from "react";

const KIND_LED = {
  success: "var(--acc)",
  info:    "var(--ink-3)",
  todo:    "oklch(0.78 0.18 245)",
};

export default function ZernioToast({ toast, onDismiss }) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!toast || hovered) return;
    const t = setTimeout(() => onDismiss?.(), 3000);
    return () => clearTimeout(t);
  }, [toast, hovered, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`ztoast ztoast-${toast.kind || "info"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="status"
      aria-live="polite"
    >
      <span
        className="ztoast-led"
        style={{ background: KIND_LED[toast.kind] || KIND_LED.info }}
      ></span>
      <span className="ztoast-msg" dangerouslySetInnerHTML={{ __html: toast.message }}></span>
      <button
        type="button"
        className="ztoast-x"
        onClick={onDismiss}
        aria-label="Cerrar"
      >
        ×
      </button>
    </div>
  );
}
