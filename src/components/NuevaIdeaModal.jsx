/**
 * NuevaIdeaModal — Modal para crear una idea nueva.
 *
 * Campos:
 *  · titulo (requerido)
 *  · notas (copy de la idea, opcional)
 *  · notas_internas (opcional)
 *
 * Se invoca desde el "+" del carril 01 "Ideas" del Tablero.
 * Comparte estilos con CardModal (clases .cm-*).
 */

import { useState, useEffect, useRef } from "react";

export default function NuevaIdeaModal({ onClose, onCreate }) {
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [saving, setSaving] = useState(false);
  const tituloRef = useRef(null);

  useEffect(() => {
    // Auto-focus en el input de título al abrir
    if (tituloRef.current) tituloRef.current.focus();
    // ESC cierra
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (!titulo.trim()) {
      tituloRef.current?.focus();
      return;
    }
    try {
      setSaving(true);
      await onCreate({
        titulo: titulo.trim(),
        notas: notas.trim(),
        notas_internas: notasInternas.trim(),
      });
      onClose();
    } catch (e) {
      alert(`Error al crear: ${e.message || e}`);
      setSaving(false);
    }
  }

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <span className="screw tl"></span>
        <span className="screw tr"></span>
        <span className="screw bl"></span>
        <span className="screw br"></span>

        <header className="cm-head">
          <div className="cm-head-l">
            <span className="cm-kind">NUEVA</span>
            <span className="cm-div">/</span>
            <span className="cm-title">IDEA</span>
          </div>
          <div className="cm-head-r">
            <button type="button" className="cm-x" onClick={onClose} title="Cerrar (ESC)">×</button>
          </div>
        </header>

        <div className="cm-body">
          <label className="np-label">
            <span className="np-label-tx">Título</span>
            <input
              ref={tituloRef}
              type="text"
              className="np-input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="El núcleo de la idea, en una línea"
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              }}
            />
          </label>

          <label className="np-label">
            <span className="np-label-tx">Copy</span>
            <textarea
              className="np-textarea"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="El desarrollo de la idea, con sus matices, lo que viene a la cabeza…"
              rows={6}
            />
          </label>

          <label className="np-label">
            <span className="np-label-tx">Notas internas</span>
            <textarea
              className="np-textarea"
              value={notasInternas}
              onChange={(e) => setNotasInternas(e.target.value)}
              placeholder="Apuntes solo para ti — origen, referencias, contexto…"
              rows={3}
            />
          </label>
        </div>

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-primary"
            onClick={handleSave}
            disabled={saving || !titulo.trim()}
          >
            {saving ? "Guardando…" : "Guardar idea"}
          </button>
        </footer>
      </div>
    </div>
  );
}
