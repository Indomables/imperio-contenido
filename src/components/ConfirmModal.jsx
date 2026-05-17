/**
 * ConfirmModal — Mini-modal de confirmación (sustituye window.confirm).
 *
 * Usa los mismos primitivos Soma OS HUD que el resto. Es la respuesta a
 * que Chromium permite al usuario marcar "Impedir que esta página muestre
 * más diálogos" y luego window.confirm() devuelve false en silencio.
 *
 * Props:
 *   open      — boolean
 *   title     — string corto en mayúsculas, ej "ELIMINAR PIEZA"
 *   message   — string explicativo (puede ser JSX si interesa)
 *   confirmLabel — texto del botón de confirmación (default "Eliminar")
 *   variant   — "danger" (rojo) | "primary" (verde). Default "danger".
 *   onConfirm — async () => void, lo que se ejecuta al confirmar
 *   onCancel  — () => void
 */

import { useEffect, useRef, useState } from "react";

export default function ConfirmModal({
  open,
  title = "CONFIRMAR",
  message = "¿Estás seguro?",
  confirmLabel = "Eliminar",
  variant = "danger",
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Foco inicial en Cancelar (más seguro por defecto en destructivos)
    if (cancelRef.current) cancelRef.current.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") handleConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    try {
      setBusy(true);
      await onConfirm?.();
    } catch (e) {
      alert(`Error: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-host" onClick={onCancel} style={{ zIndex: 2000 }}>
      <div className="modal-scrim" />
      <div
        className="somal somal-confirm"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="confirmTitle"
      >
        <span className="s-br tl"></span><span className="s-br tr"></span>
        <span className="s-br bl"></span><span className="s-br br"></span>
        <span className="s-screw tl"></span><span className="s-screw tr"></span>
        <span className="s-screw bl"></span><span className="s-screw br"></span>

        <header className="somal-h">
          <div className="l">
            <span className={`led ${variant === "danger" ? "led-danger" : ""}`}></span>
            <span className="ix">!!</span><span className="div">/</span>
            <span className="ttl" id="confirmTitle">{title}</span>
          </div>
          <div className="r">
            <button type="button" className="somal-x" onClick={onCancel} aria-label="Cancelar (ESC)">×</button>
          </div>
        </header>

        <div className="somal-body somal-confirm-body">
          {typeof message === "string" ? (
            <p className="somal-confirm-msg">{message}</p>
          ) : message}
        </div>

        <footer className="somal-foot">
          <div className="l"></div>
          <div className="r">
            <button
              ref={cancelRef}
              type="button"
              className="somal-btn ghost"
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`somal-btn ${variant === "danger" ? "danger" : "primary"}`}
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? "…" : confirmLabel}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
