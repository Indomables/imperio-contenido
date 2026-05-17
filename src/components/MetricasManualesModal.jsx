/**
 * MetricasManualesModal — Mini-modal para meter las dos métricas
 * que se actualizan a mano (no las pilla la API de Kit):
 *  · replies (respuestas al email)
 *  · revenue_eur (revenue atribuido en €)
 *
 * Se abre con el icono 📊 en cards de email/relampago publicadas.
 *
 * Importante: las métricas en BD son JSONB completo. Auto-publish.mts
 * rellena aperturas, clics, suscripciones, bajas, etc. Aquí hacemos
 * MERGE: leemos el objeto entero, modificamos solo los 2 campos y
 * volvemos a guardar el objeto completo para no pisar lo automático.
 */

import { useState, useEffect, useRef } from "react";
import { metricas as metricasApi } from "../lib/api";

export default function MetricasManualesModal({ pieza, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [datos, setDatos] = useState({});
  const [replies, setReplies] = useState("");
  const [revenue, setRevenue] = useState("");
  const inputRef = useRef(null);

  // Al abrir: cargar métricas actuales y poblar los inputs
  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        const m = await metricasApi.byPieza(pieza.id);
        if (abort) return;
        const d = m?.datos || {};
        setDatos(d);
        setReplies(d.replies !== undefined && d.replies !== null ? String(d.replies) : "");
        setRevenue(d.revenue_eur !== undefined && d.revenue_eur !== null ? String(d.revenue_eur) : "");
      } catch (e) {
        // Si no existe row de métricas todavía, arrancamos vacío
        if (e?.status !== 404 && !abort) console.warn("No hay métricas previas:", e?.message);
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => { abort = true; };
  }, [pieza.id]);

  // Focus al input cuando termina la carga
  useEffect(() => {
    if (!loading && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [loading]);

  // ESC cierra
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    const repliesN = replies.trim() === "" ? null : Math.max(0, parseInt(replies, 10) || 0);
    const revenueN = revenue.trim() === "" ? null : Math.max(0, parseFloat(revenue.replace(",", ".")) || 0);

    try {
      setSaving(true);
      // MERGE para no pisar métricas automáticas:
      const merged = {
        ...datos,
        replies: repliesN,
        revenue_eur: revenueN,
      };
      await metricasApi.upsert(pieza.id, merged);
      onClose();
    } catch (e) {
      alert(`Error al guardar: ${e.message || e}`);
      setSaving(false);
    }
  }

  return (
    <div className="cm-overlay" onClick={onClose}>
      <div className="cm-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <span className="screw tl"></span>
        <span className="screw tr"></span>
        <span className="screw bl"></span>
        <span className="screw br"></span>

        <header className="cm-head">
          <div className="cm-head-l">
            <span className="cm-kind">MÉTRICAS</span>
            <span className="cm-div">/</span>
            <span className="cm-title">MANUALES</span>
          </div>
          <div className="cm-head-r">
            <button type="button" className="cm-x" onClick={onClose} title="Cerrar (ESC)">×</button>
          </div>
        </header>

        <div className="cm-body">
          <p className="np-hint" style={{ marginTop: 0, marginBottom: 14 }}>
            <em>{pieza.titulo || "(sin título)"}</em>
          </p>

          {loading ? (
            <p className="np-hint">Cargando…</p>
          ) : (
            <>
              <label className="np-label">
                <span className="np-label-tx">Respuestas</span>
                <input
                  ref={inputRef}
                  type="number"
                  min="0"
                  step="1"
                  className="np-input"
                  value={replies}
                  onChange={(e) => setReplies(e.target.value)}
                  placeholder="ej. 12"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                />
              </label>

              <label className="np-label">
                <span className="np-label-tx">Revenue atribuido (€)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="np-input"
                  value={revenue}
                  onChange={(e) => setRevenue(e.target.value)}
                  placeholder="ej. 245.50"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                />
              </label>

              <p className="np-hint" style={{ marginTop: 4 }}>
                El resto de métricas (aperturas, clics, bajas) se sincronizan
                solas con Kit cada hora.
              </p>
            </>
          )}
        </div>

        <footer className="cm-foot">
          <button type="button" className="cm-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="cm-btn cm-btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
