/**
 * KitIdModal — Mini-modal para vincular una pieza email/relámpago con
 * su broadcast en Kit.
 *
 * Header: ⚡ VINCULAR CON KIT · <título de la pieza>
 *
 * Cuerpo: un solo input para el ID del broadcast, con dos helpers:
 *   - antes del input: dónde encontrar el ID
 *   - después: qué pasa al guardar
 *
 * Footer: Cancelar | ↻ Guardar y sincronizar
 *
 * El ID que se mete puede ser el "legacy" (lo que ve Soma en la URL de Kit);
 * auto-publish.mts lo normalizará al ID real en su siguiente ejecución horaria.
 */

import { useState, useEffect, useRef } from "react";

export default function KitIdModal({ pieza, onClose, onSave }) {
  const [idValue, setIdValue] = useState(pieza?.kit_broadcast_id || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    try {
      setSaving(true);
      await onSave(idValue.trim());
      onClose();
    } catch (e) {
      alert(`Error al guardar: ${e.message || e}`);
      setSaving(false);
    }
  }

  if (!pieza) return null;

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel kit-panel" onClick={(e) => e.stopPropagation()}>

        <header className="cm-head kit-head">
          <div className="cm-head-l">
            <span className="kit-bolt">⚡</span>
            <span className="kit-head-tx">
              <span className="cm-kind">VINCULAR CON KIT</span>
              <span className="cm-div">·</span>
              <span className="kit-piece-title">{pieza.titulo || "(sin título)"}</span>
            </span>
          </div>
          <div className="cm-head-r">
            <button type="button" className="cm-x" onClick={onClose} title="Cerrar (ESC)">×</button>
          </div>
        </header>

        <div className="cm-body">
          <div className="np-label">
            <span className="np-label-tx">ID del broadcast en Kit</span>
            <p className="kit-helper">
              <em>Ve al broadcast en Kit — la URL contiene <code>/publications/XXXXXXX</code> — pega ese número.</em>
            </p>
            <input
              ref={inputRef}
              type="text"
              className="np-input"
              value={idValue}
              onChange={(e) => setIdValue(e.target.value.trim())}
              placeholder="24121294"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
            <p className="kit-helper kit-helper-after">
              <em>Una vez guardado, el sistema sincroniza las métricas automáticamente cada hora. No hace falta volver a este modal.</em>
            </p>
          </div>
        </div>

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-primary kit-save"
            onClick={handleSave}
            disabled={saving}
          >
            <SyncIcon />
            {saving ? "Guardando…" : "Guardar y sincronizar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// Icono de sync (dos flechas circulares) usado en el botón principal.
function SyncIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
         stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
         style={{ marginRight: 6, verticalAlign: "-2px" }}>
      <path d="M12.5 2.5v3h-3" />
      <path d="M12.5 5.5A5 5 0 1 0 11 11" />
    </svg>
  );
}
