/**
 * ZernioNotifRow — Una fila del Inbox o del Histórico.
 *
 * Estructura del handoff (`.znotif`):
 *   ┌──┬──────────────────────────────────────────┬─────────────┐
 *   │AV│ @handle                    HACE 12 MIN  │             │
 *   │  │                                          │  [Enrolar]  │
 *   │  │ "DM preview text…"                       │  [Descartar]│
 *   │  │                                          │             │
 *   │  │ [HERMANDAD][▮▮▮ Hot][████ 92%]           │             │
 *   └──┴──────────────────────────────────────────┴─────────────┘
 *    ^
 *    └─ accent strip 3px (color = intent color)
 *
 * Variantes:
 *   - pending  → footer con zintent + ztemp + zconf, botones Enrolar/Descartar/Abrir
 *   - decided  → footer con zstate + meta de la decisión, botón Ver
 */

import SomaAudio from "../../lib/soma-audio";

const INTENT_LABEL = {
  hermandad: "Hermandad",
  elite:     "Élite",
  general:   "General",
  sininter:  "Sin interés",
};

const TEMP_LABEL = {
  hot:  "Caliente",
  warm: "Tibio",
  cold: "Frío",
};

const STATE_LABEL = {
  enrolled:  { className: "enrol",  label: "Enrolada"   },
  discarded: { className: "disc",   label: "Descartada" },
  tagged:    { className: "other",  label: "Etiquetada" },
  promoted:  { className: "other",  label: "Promovida"  },
};

const CONF_CLASS = (c) => (c >= 85 ? "hi" : c >= 50 ? "mid" : "lo");

export default function ZernioNotifRow({
  notif,
  selected = false,
  onSelect,
  onEnroll,
  onDiscard,
  onTag,
}) {
  const isDecided = notif.state !== "pending";
  const isFamiliar =
    notif.classification.intent === "sininter" &&
    notif.classification.temperature === "warm";

  function handleClick(e) {
    // No queremos que el click en botones de acción dispare el select
    if (e.target.closest("button")) return;
    SomaAudio.tap();
    onSelect?.(notif.id);
  }

  return (
    <article
      className={`znotif${selected ? " on" : ""}${isDecided ? " decided" : ""}`}
      data-int={notif.classification.intent}
      data-id={notif.id}
      onClick={handleClick}
    >
      <div className="zavatar">{notif.contact.avatarInitials}</div>

      <div className="znotif-bd">
        <div className="znotif-top">
          <span className="handle">{notif.contact.handle}</span>
          <span className="when">{formatWhen(notif.receivedAt)}</span>
        </div>

        <div className="znotif-dm">{notif.dm.text}</div>

        <div className="znotif-foot">
          {isDecided ? (
            <DecidedFooter notif={notif} />
          ) : (
            <PendingFooter notif={notif} />
          )}
        </div>
      </div>

      <div className="znotif-rt">
        <div className="znotif-actions">
          {isDecided ? (
            <button
              type="button"
              onClick={() => {
                SomaAudio.tap();
                onSelect?.(notif.id);
              }}
            >
              Ver
            </button>
          ) : isFamiliar ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  SomaAudio.send();
                  onTag?.(notif.id, "FAMILIAR");
                }}
              >
                Familiar
              </button>
              <button
                type="button"
                onClick={() => {
                  SomaAudio.tap();
                  onSelect?.(notif.id);
                }}
              >
                Abrir
              </button>
            </>
          ) : notif.classification.intent === "sininter" ? (
            <>
              <button
                type="button"
                className="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  SomaAudio.send();
                  onDiscard?.(notif.id);
                }}
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={() => {
                  SomaAudio.tap();
                  onSelect?.(notif.id);
                }}
              >
                Abrir
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  SomaAudio.send();
                  onEnroll?.(notif.id);
                }}
              >
                Enrolar
              </button>
              <button
                type="button"
                onClick={() => {
                  SomaAudio.tap();
                  onSelect?.(notif.id);
                }}
              >
                Abrir
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function PendingFooter({ notif }) {
  const { intent, temperature, confidence } = notif.classification;
  return (
    <>
      <span className={`zintent int-${intent}`}>
        <span className="d"></span>
        {INTENT_LABEL[intent]}
      </span>
      <span className="ztemp" data-temp={temperature}>
        <span className="bars">
          <i></i>
          <i></i>
          <i></i>
        </span>
        <span className="lbl">{TEMP_LABEL[temperature]}</span>
      </span>
      <span className={`zconf ${CONF_CLASS(confidence)}`}>
        <span className="bar">
          <i style={{ width: `${confidence}%` }}></i>
        </span>
        <span className="v">{confidence}%</span>
      </span>
    </>
  );
}

function DecidedFooter({ notif }) {
  const { state, decision, classification } = notif;
  const stateMeta = STATE_LABEL[state] || { className: "other", label: "—" };

  return (
    <>
      <span className={`zstate ${stateMeta.className}`}>
        <span className="d"></span>
        {stateMeta.label}
      </span>

      {state === "enrolled" && decision?.sequenceSlug && (
        <span className={`zintent int-${classification.intent}`}>
          <span className="d"></span>
          {INTENT_LABEL[classification.intent]} · sec/{decision.sequenceSlug}
        </span>
      )}

      {state === "discarded" && decision?.discardReason && (
        <span style={{ color: "var(--ink-4)" }}>
          MOTIVO ·{" "}
          <b style={{ color: "var(--ink-2)" }}>{decision.discardReason}</b>
        </span>
      )}

      {state === "tagged" && decision?.tagApplied && (
        <span style={{ color: "var(--ink-4)" }}>
          ETIQUETA ·{" "}
          <b style={{ color: `var(--int-${classification.intent})` }}>
            {decision.tagApplied}
          </b>
        </span>
      )}

      {decision && (
        <span style={{ color: "var(--ink-4)" }}>
          DECIDIÓ <b style={{ color: "var(--ink-2)" }}>SOMA</b> ·{" "}
          {decision.timeToDecideSec}s
        </span>
      )}
    </>
  );
}

/** Formatea fecha como "HACE 12 MIN" / "HACE 2H 15 MIN" / "AYER · 21:14" / "HOY · 11:42" */
function formatWhen(date) {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);

  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  if (diffMin < 1) return "AHORA";
  if (diffMin < 60) return `HACE ${diffMin} MIN`;
  if (diffH < 12) {
    const m = diffMin - diffH * 60;
    return m > 0 ? `HACE ${diffH}H ${pad(m)} MIN` : `HACE ${diffH}H`;
  }

  const isToday = sameDay(d, now);
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const isYesterday = sameDay(d, yest);

  if (isToday) return `HOY · ${hhmm}`;
  if (isYesterday) return `AYER · ${hhmm}`;

  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${pad(d.getDate())} ${MES[d.getMonth()]} · ${hhmm}`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
