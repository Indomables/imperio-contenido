/**
 * AnalisisChat — Chat IA embebido en la pestaña Análisis.
 *
 * v0.63 · Rediseño visual estilo Captura Global.
 *   · Eliminados los 5 ejemplos sugeridos y el texto introductorio.
 *   · Input rediseñado: input + botón ENVIAR rellenado en ámbar a la
 *     derecha (mismo lenguaje que el bloque de Captura del Dashboard).
 *   · Barra inferior con contadores acumulados de sesión: consultas
 *     totales, tokens in/out y coste estimado en €.
 *   · Header arriba se mantiene (CHAT IA · SONNET 4.6 · CONECTADO A KIT V4).
 *
 * v0.62 · Primer cut. Habla con `/api/chat` (Sonnet 4.6 + tools de Kit v4).
 *
 * Mantiene el historial en estado local (no se persiste — se pierde al
 * recargar la página). Cada turno:
 *   1. Usuario envía mensaje
 *   2. Frontend hace POST /api/chat con todo el historial
 *   3. Backend ejecuta tool loop y devuelve `events`
 *   4. Frontend pinta los events en orden (tool_use → tool_result → text)
 *
 * No es streaming: el spinner está activo desde el envío hasta la respuesta
 * completa. Para una primera versión, suficiente. Streaming SSE es un
 * upgrade fácil a futuro si la latencia molesta.
 *
 * Estilos: usa CSS vars de la app (--ink, --line, --acc, --mono) para
 * integrarse con el resto. Estilos específicos del chat van inline o
 * con clase `an-chat-*` (no chocan con nada existente).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import SomaAudio from "../lib/soma-audio";

const MAX_INPUT_LEN = 1500;

// ─── Precios Sonnet 4.6 (Anthropic API) ──────────────────────────
// USD por millón de tokens. Si Anthropic cambia precios, actualizar aquí.
// https://www.anthropic.com/pricing
const PRICE_INPUT_USD_PER_MTOK = 3.0;
const PRICE_OUTPUT_USD_PER_MTOK = 15.0;
// Tipo de cambio aproximado USD → EUR. Ajustable.
const USD_TO_EUR = 0.92;

function calcCostEur(inputTokens, outputTokens) {
  const usd =
    (inputTokens / 1_000_000) * PRICE_INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_USD_PER_MTOK;
  return usd * USD_TO_EUR;
}

function formatTokens(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatEur(n) {
  // < 1 céntimo: 4 decimales. < 1 €: 3 decimales. ≥ 1 €: 2 decimales.
  if (n < 0.01) return `${n.toFixed(4)} €`;
  if (n < 1)    return `${n.toFixed(3)} €`;
  return `${n.toFixed(2)} €`;
}

function ToolBlock({ event }) {
  // event.type === "tool_use" o "tool_result"
  const isUse = event.type === "tool_use";
  const ok = event.ok !== false;
  return (
    <div className="an-chat-tool" style={{
      margin: "4px 0",
      padding: "6px 10px",
      borderLeft: `2px solid ${isUse ? "var(--ink-4, #6b6b6b)" : ok ? "var(--acc, #c8a06b)" : "oklch(0.72 0.20 30)"}`,
      background: "rgba(255,255,255,0.025)",
      fontFamily: "var(--mono, ui-monospace)",
      fontSize: 10,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "var(--ink-3, #999)",
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ opacity: 0.7 }}>{isUse ? "TOOL ›" : ok ? "RESULT ›" : "ERR ›"}</span>
        <b style={{ color: "var(--ink-2, #ccc)", letterSpacing: "0.04em" }}>
          {event.tool}
        </b>
        {!isUse && event.summary && (
          <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: "0.02em" }}>
            {event.summary}
          </span>
        )}
      </div>
      {isUse && event.input && Object.keys(event.input).length > 0 && (
        <div style={{ marginTop: 4, fontSize: 9, opacity: 0.7, textTransform: "none", letterSpacing: 0 }}>
          {JSON.stringify(event.input)}
        </div>
      )}
    </div>
  );
}

function TextBlock({ content, role }) {
  return (
    <div style={{
      margin: "6px 0",
      padding: role === "user" ? "8px 12px" : "10px 0",
      background: role === "user" ? "rgba(255,255,255,0.04)" : "transparent",
      borderLeft: role === "user" ? "2px solid var(--acc, #c8a06b)" : "none",
      whiteSpace: "pre-wrap",
      lineHeight: 1.5,
      color: "var(--ink, #fff)",
      fontSize: 13,
    }}>
      {role === "user" && (
        <div style={{
          fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 4,
        }}>
          Soma
        </div>
      )}
      {content}
    </div>
  );
}

export default function AnalisisChat() {
  // turns = [{ role: "user" | "assistant", content: "..." } | { role: "assistant", events: [...] }]
  // Para usuario solo guardamos content (string). Para assistant guardamos events (array).
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Contador acumulado de toda la sesión (desde que se montó el componente).
  // No se persiste — al recargar la página se resetea.
  const [sessionStats, setSessionStats] = useState({
    queries: 0,
    inputTokens: 0,
    outputTokens: 0,
  });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll al final cuando hay un nuevo turno o se está pensando
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, busy]);

  // Convertir turns a formato Anthropic messages para mandar al backend.
  // Para assistant: si guardamos `events`, sólo nos quedamos con los textos
  // (los tool_use/result se gestionan en backend).
  const buildBackendMessages = useCallback((extraUserMessage) => {
    const out = [];
    for (const t of turns) {
      if (t.role === "user") {
        out.push({ role: "user", content: t.content });
      } else {
        const text = (t.events || [])
          .filter((e) => e.type === "text")
          .map((e) => e.content)
          .join("\n");
        if (text) out.push({ role: "assistant", content: text });
      }
    }
    if (extraUserMessage) out.push({ role: "user", content: extraUserMessage });
    return out;
  }, [turns]);

  async function send(textOverride) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    SomaAudio.send();

    // Añadir mensaje del usuario al historial inmediatamente
    const messagesForBackend = buildBackendMessages(text);
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setInput("");

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesForBackend }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`/api/chat ${r.status}: ${txt.slice(0, 200)}`);
      }
      const j = await r.json();
      setTurns((prev) => [...prev, {
        role: "assistant",
        events: j.events || [],
        usage: j.usage,
      }]);
      // Acumular stats de sesión
      if (j.usage) {
        setSessionStats((s) => ({
          queries: s.queries + 1,
          inputTokens:  s.inputTokens  + (j.usage.input_tokens  || 0),
          outputTokens: s.outputTokens + (j.usage.output_tokens || 0),
        }));
      }
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
      // Refocus para envío rápido del siguiente turno
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function reset() {
    if (busy) return;
    SomaAudio.tap();
    setTurns([]);
    setErr(null);
    setInput("");
    // No reseteamos sessionStats — el contador de sesión persiste
    // mientras la pestaña esté abierta, aunque se borre el historial.
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // ─── Derivados para la barra inferior ────────────────────────
  const totalTokens = sessionStats.inputTokens + sessionStats.outputTokens;
  const costEur = calcCostEur(sessionStats.inputTokens, sessionStats.outputTokens);

  return (
    <section className="an-chat" style={{
      margin: "18px 22px 8px",
      border: "1px solid var(--line, #2a2a2a)",
      background: "var(--bg-1, #0e0e0e)",
      borderRadius: 2,
      display: "flex",
      flexDirection: "column",
      minHeight: 320,
      maxHeight: 560,
      position: "relative",
    }}>
      {/* Corner brackets para que el panel encaje visualmente con el resto */}
      <span style={{ position: "absolute", top: -1, right: -1, width: 10, height: 10, borderTop: "1px solid var(--acc, #c8a06b)", borderRight: "1px solid var(--acc, #c8a06b)" }} />
      <span style={{ position: "absolute", bottom: -1, left: -1, width: 10, height: 10, borderBottom: "1px solid var(--acc, #c8a06b)", borderLeft: "1px solid var(--acc, #c8a06b)" }} />

      {/* Header */}
      <header style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--line, #2a2a2a)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: "var(--mono)",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3, #999)",
      }}>
        <span style={{
          display: "inline-block",
          width: 6, height: 6, borderRadius: "50%",
          background: busy ? "var(--warn, #d4a04d)" : "var(--acc, #c8a06b)",
          boxShadow: busy ? "0 0 6px var(--warn, #d4a04d)" : "0 0 4px var(--acc, #c8a06b)",
        }} />
        <span>Chat IA · <b style={{ color: "var(--ink, #fff)" }}>SONNET 4.6</b></span>
        <span style={{ color: "var(--ink-5, #555)" }}>·</span>
        <span>Conectado a Kit v4</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              style={{
                background: "transparent",
                border: "1px solid var(--line, #2a2a2a)",
                color: "var(--ink-3, #999)",
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "4px 8px",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              Reiniciar
            </button>
          )}
        </span>
      </header>

      {/* Body — historial */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px",
        fontFamily: "var(--sans, system-ui)",
      }}>
        {turns.map((t, idx) => {
          if (t.role === "user") {
            return <TextBlock key={idx} content={t.content} role="user" />;
          }
          // assistant: pinta events en orden
          return (
            <div key={idx} style={{ marginBottom: 14 }}>
              {(t.events || []).map((e, i) => {
                if (e.type === "text") {
                  return <TextBlock key={i} content={e.content} role="assistant" />;
                }
                return <ToolBlock key={i} event={e} />;
              })}
              {t.usage && (
                <div style={{
                  fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "var(--ink-5, #555)",
                  marginTop: 6, paddingLeft: 2,
                }}>
                  {t.usage.input_tokens} in · {t.usage.output_tokens} out
                </div>
              )}
            </div>
          );
        })}

        {busy && (
          <div style={{
            margin: "10px 0",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--ink-4, #6b6b6b)",
          }}>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: "var(--warn, #d4a04d)",
              animation: "an-chat-pulse 1s ease-in-out infinite",
            }} />
            Pensando…
          </div>
        )}

        {err && (
          <div style={{
            margin: "10px 0", padding: "8px 12px",
            border: "1px solid oklch(0.72 0.20 30)",
            color: "oklch(0.72 0.20 30)",
            fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            ⚠ {err}
          </div>
        )}
      </div>

      {/* Input — estilo Captura Global del Dashboard.
          Una sola línea horizontal con flecha › a la izquierda y botón
          ENVIAR ámbar relleno a la derecha. */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          borderTop: "1px solid var(--line, #2a2a2a)",
          background: "transparent",
        }}
      >
        <span style={{
          fontFamily: "var(--mono)",
          color: "var(--acc, #c8a06b)",
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
        }}>›</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_LEN))}
          onKeyDown={handleKey}
          placeholder="Pregúntame algo sobre tu cuenta de Kit…"
          disabled={busy}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--ink, #fff)",
            fontFamily: "var(--sans)",
            fontSize: 14,
            padding: "8px 4px",
            minWidth: 0,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            background: input.trim() && !busy ? "var(--acc, #c8a06b)" : "transparent",
            border: input.trim() && !busy ? "1px solid var(--acc, #c8a06b)" : "1px solid var(--line, #2a2a2a)",
            color: input.trim() && !busy ? "#000" : "var(--ink-4, #6b6b6b)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "10px 20px",
            cursor: busy || !input.trim() ? "not-allowed" : "pointer",
            fontWeight: 600,
            transition: "all 120ms",
            flexShrink: 0,
          }}
        >
          Enviar →
        </button>
      </form>

      {/* Barra de estado inferior — contadores acumulados de sesión.
          Mismo lenguaje visual que la barrita "MODO CREATIVE / FLOW" del
          bloque de Captura Global. */}
      <div style={{
        padding: "8px 18px",
        borderTop: "1px solid var(--line, #2a2a2a)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: "var(--mono)",
        fontSize: 9,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink-4, #6b6b6b)",
        background: "rgba(0,0,0,0.2)",
      }}>
        <span style={{
          display: "inline-block",
          width: 5, height: 5, borderRadius: "50%",
          background: sessionStats.queries > 0 ? "var(--acc, #c8a06b)" : "var(--ink-5, #555)",
        }} />
        <span>
          SESIÓN ·{" "}
          <b style={{ color: "var(--ink-2, #ccc)" }}>{sessionStats.queries}</b>
          {" "}consultas
        </span>
        <span style={{ color: "var(--ink-5, #555)" }}>·</span>
        <span>
          <b style={{ color: "var(--ink-2, #ccc)" }}>{formatTokens(sessionStats.inputTokens)}</b>
          {" "}in ·{" "}
          <b style={{ color: "var(--ink-2, #ccc)" }}>{formatTokens(sessionStats.outputTokens)}</b>
          {" "}out
        </span>
        <span style={{ color: "var(--ink-5, #555)" }}>·</span>
        <span>
          TOTAL <b style={{ color: "var(--ink-2, #ccc)" }}>{formatTokens(totalTokens)}</b>
        </span>
        <span style={{ marginLeft: "auto" }}>
          COSTE{" "}
          <b style={{ color: "var(--acc, #c8a06b)" }}>{formatEur(costEur)}</b>
        </span>
      </div>

      {/* Animación del pulso del "Pensando" */}
      <style>{`
        @keyframes an-chat-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.8); }
        }
      `}</style>
    </section>
  );
}
