/**
 * NuevaPiezaModal — Modal para crear una pieza nueva.
 *
 * Flujo en pasos:
 *  Paso 1: elegir formato (email, relampago, reel, youtube, grieta)
 *  Paso 2 (solo si formato === "email"): elegir plataforma (Kit / Acumbamail)
 *  Paso 3: título inicial → POST /api/piezas con { titulo, formato, plataformas, idea_id?, columna: "desarrollo" }
 *
 * Si se pasa `ideaId` como prop, la pieza se crea vinculada a esa idea
 * (caso "Dar forma" desde card de Ideas). Si no, queda huérfana (caso "+" en Desarrollo).
 *
 * Comparte estilos con CardModal (clases .cm-*).
 */

import { useState, useEffect, useRef } from "react";

// Opciones de formato — orden y label que ve el usuario
const FORMATOS = [
  { value: "email",     label: "Email",     icon: "✉",  desc: "Newsletter o broadcast" },
  { value: "relampago", label: "Relámpago", icon: "⚡", desc: "Email corto y directo" },
  { value: "reel",      label: "Reel",      icon: "▶",  desc: "Instagram vertical 60s" },
  { value: "youtube",   label: "YouTube",   icon: "■",  desc: "Long-form" },
  { value: "grieta",    label: "Grieta",    icon: "✦",  desc: "Instagram + YouTube Shorts" },
];

// Plataformas para email
const PLATAFORMAS_EMAIL = [
  { value: "Kit",        label: "Kit"        },
  { value: "Acumbamail", label: "Acumbamail" },
];

export default function NuevaPiezaModal({ ideaId = null, ideaTitle = null, onClose, onCreate }) {
  const [step, setStep] = useState("formato"); // "formato" | "plataforma" | "titulo"
  const [formato, setFormato] = useState(null);
  const [plataforma, setPlataforma] = useState(null);
  const [titulo, setTitulo] = useState(ideaTitle || "");
  const [saving, setSaving] = useState(false);
  const tituloRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cuando llegamos al paso de título, auto-focus en el input
  useEffect(() => {
    if (step === "titulo" && tituloRef.current) {
      tituloRef.current.focus();
      tituloRef.current.select();
    }
  }, [step]);

  function selectFormato(f) {
    setFormato(f);
    if (f === "email") {
      setStep("plataforma");
    } else {
      setStep("titulo");
    }
  }

  function selectPlataforma(p) {
    setPlataforma(p);
    setStep("titulo");
  }

  function goBack() {
    if (step === "titulo" && formato === "email") setStep("plataforma");
    else if (step === "titulo") { setStep("formato"); setFormato(null); }
    else if (step === "plataforma") { setStep("formato"); setFormato(null); }
  }

  async function handleSave() {
    if (!titulo.trim()) {
      tituloRef.current?.focus();
      return;
    }
    const plataformas = plataforma ? [plataforma] : [];
    try {
      setSaving(true);
      await onCreate({
        titulo: titulo.trim(),
        formato,
        columna: "desarrollo",
        plataformas,
        idea_id: ideaId,
      });
      onClose();
    } catch (e) {
      alert(`Error al crear: ${e.message || e}`);
      setSaving(false);
    }
  }

  // Título del header según el paso
  const headerSub = step === "formato"
    ? "¿QUÉ FORMATO?"
    : step === "plataforma"
    ? "¿DÓNDE ENVIARLO?"
    : "TÍTULO INICIAL";

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
            <span className="cm-kind">{ideaId ? "DAR FORMA" : "NUEVA"}</span>
            <span className="cm-div">/</span>
            <span className="cm-title">{headerSub}</span>
          </div>
          <div className="cm-head-r">
            <button type="button" className="cm-x" onClick={onClose} title="Cerrar (ESC)">×</button>
          </div>
        </header>

        <div className="cm-body">
          {/* PASO 1 — Elegir formato */}
          {step === "formato" && (
            <div className="np-grid">
              {FORMATOS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`np-option t-${f.value}`}
                  onClick={() => selectFormato(f.value)}
                >
                  <span className="np-option-icon">{f.icon}</span>
                  <span className="np-option-label">{f.label}</span>
                  <span className="np-option-desc">{f.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* PASO 2 — Solo si es email: elegir plataforma */}
          {step === "plataforma" && (
            <>
              <div className="np-breadcrumb">
                <button type="button" className="np-back" onClick={goBack}>← Email</button>
              </div>
              <div className="np-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {PLATAFORMAS_EMAIL.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className="np-option"
                    onClick={() => selectPlataforma(p.value)}
                  >
                    <span className="np-option-label">{p.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* PASO 3 — Título inicial */}
          {step === "titulo" && (
            <>
              <div className="np-breadcrumb">
                <button type="button" className="np-back" onClick={goBack}>
                  ← {plataforma ? `${plataforma}` : FORMATOS.find((x) => x.value === formato)?.label}
                </button>
              </div>
              <label className="np-label">
                <span className="np-label-tx">Título</span>
                <input
                  ref={tituloRef}
                  type="text"
                  className="np-input"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Un título de trabajo — luego lo afinas"
                  maxLength={200}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
              </label>
              {ideaTitle && (
                <p className="np-hint">
                  Vinculada a la idea: <em>{ideaTitle}</em>
                </p>
              )}
            </>
          )}
        </div>

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          {step === "titulo" && (
            <button
              type="button"
              className="cm-btn cm-btn-primary"
              onClick={handleSave}
              disabled={saving || !titulo.trim()}
            >
              {saving ? "Creando…" : "Crear pieza"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
