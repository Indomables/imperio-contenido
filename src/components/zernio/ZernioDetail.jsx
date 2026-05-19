/**
 * ZernioDetail — Panel derecho (460px). Contenido completo de la notif seleccionada.
 *
 * Estructura del handoff (`.zpanel.zdetail`):
 *   ┌────────────────────────────────────┐
 *   │ Header: 05 / Detalle · @handle     │
 *   ├────────────────────────────────────┤
 *   │ ZD-HEAD: avatar + handle + meta    │
 *   │ ZD-DM:   "DM ORIGINAL" + bubble    │
 *   │ ZD-AI:   intent · temp · conf ·    │
 *   │          sequence · tags + reason  │
 *   │ ZD-DEC:  botones de decisión       │
 *   │ ZD-HIST: timeline del contacto     │
 *   └────────────────────────────────────┘
 *
 * Props:
 *   notif         — la notificación seleccionada (objeto del mock)
 *   sequences     — diccionario de sequences disponibles
 *   selectedSeq   — slug de la sequence elegida (puede diferir de la sugerida)
 *   onSeqChange   — (slug) => void
 *   onEnroll      — () => void
 *   onDiscard     — () => void
 *   onTag         — () => void
 *   onPromote     — () => void
 */

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

const CONF_CLASS = (c) => (c >= 85 ? "hi" : c >= 50 ? "mid" : "lo");

const PRINCIPAL_INTENTS = [
  { id: "hermandad", label: "Hermandad" },
  { id: "elite",     label: "Élite" },
  { id: "general",   label: "General" },
];

export default function ZernioDetail({
  notif,
  sequences,
  selectedSeq,
  onSeqChange,
  onEnroll,
  onDiscard,
  onTag,
  onPromote,
}) {
  if (!notif) {
    return (
      <aside className="zpanel zdetail">
        <span className="br-tr"></span>
        <span className="br-bl"></span>
        <div className="zd-empty">
          <div className="frame">
            <span>›</span>
          </div>
          <div className="ttl">Selecciona una notificación</div>
          <div className="desc">
            Abre cualquier ítem del inbox para revisar el DM completo, lo que dice la IA y decidir.
          </div>
        </div>
      </aside>
    );
  }

  const { contact, dm, classification, contactHistory = [] } = notif;
  const currentSeqSlug = selectedSeq ?? classification.suggestedSequence;
  const currentSeq = currentSeqSlug ? sequences?.[currentSeqSlug] : null;

  return (
    <aside className="zpanel zdetail">
      <span className="br-tr"></span>
      <span className="br-bl"></span>

      <header className="zpanel-h">
        <div className="t">
          <span className="led"></span>
          <span className="ix">05</span>
          <span>Detalle</span>
        </div>
        <div className="meta">
          <b>{contact.handle}</b> · ID <b>{notif.id}</b>
        </div>
      </header>

      <div className="zdetail-body">

        {/* ─── CONTACT HEAD ─── */}
        <div className="zd-head">
          <div className="av">{contact.avatarInitials}</div>
          <div className="info">
            <div className="h">{contact.handle}</div>
            <div className="sub">
              <a href="#" onClick={(e) => e.preventDefault()}>
                VER PERFIL IG ↗
              </a>
              {contact.followerCount != null && (
                <>
                  {" · "}
                  <span style={{ color: "var(--ink-2)" }}>
                    {formatFollowerCount(contact.followerCount)} seguidores
                  </span>
                </>
              )}
              {contact.location && contact.location !== "—" && (
                <>
                  {" · "}
                  <span style={{ color: "var(--ink-3)" }}>{contact.location}</span>
                </>
              )}
            </div>
          </div>
          <div className="when">
            RECIBIDO
            <br />
            <b>{formatReceivedAt(notif.receivedAt)}</b>
            <br />
            <span style={{ color: "var(--ink-5)" }}>
              {formatRelative(notif.receivedAt)}
            </span>
          </div>
        </div>

        {/* ─── DM ORIGINAL ─── */}
        <div className="zd-dm">
          <div className="label">DM ORIGINAL</div>
          <div className="bubble">{dm.text}</div>
        </div>

        {/* ─── AI BLOCK ─── */}
        <div className="zd-ai">
          <div className="lbl-row">
            <span className="led"></span>
            <span>
              LO QUE DICE LA <b>IA</b>
            </span>
          </div>

          <div className="row">
            <span className="k">Intención</span>
            <span className="v">
              <span className={`zintent int-${classification.intent} big`}>
                <span className="d"></span>
                {INTENT_LABEL[classification.intent]}
              </span>
            </span>
          </div>

          <div className="row">
            <span className="k">Temperatura</span>
            <span className="v">
              <span className="ztemp" data-temp={classification.temperature}>
                <span className="bars">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span className="lbl">
                  {TEMP_LABEL[classification.temperature]}
                </span>
              </span>
            </span>
          </div>

          <div className="row">
            <span className="k">Confianza</span>
            <span className="v">
              <span className={`zconf ${CONF_CLASS(classification.confidence)}`}>
                <span className="bar">
                  <i style={{ width: `${classification.confidence}%` }}></i>
                </span>
                <span className="v">{classification.confidence}%</span>
              </span>
            </span>
          </div>

          {classification.suggestedSequence && (
            <div className="row">
              <span className="k">Sequence</span>
              <span className="v acc">
                {sequences?.[classification.suggestedSequence]?.name ||
                  classification.suggestedSequence}
              </span>
            </div>
          )}

          {classification.tags?.length > 0 && (
            <div className="row">
              <span className="k">Tags</span>
              <span className="v">
                <span className="ztags">
                  {classification.tags.map((tag) => (
                    <span key={tag} className="ztag">
                      {tag}
                    </span>
                  ))}
                </span>
              </span>
            </div>
          )}

          <div className="reason">{classification.reasoning}</div>
          <div className="model">
            {classification.model?.toUpperCase()} ·{" "}
            {classification.classifierVersion?.toUpperCase()} ·{" "}
            {classification.latencyMs}MS
          </div>
        </div>

        {/* ─── DECISION ─── */}
        {notif.state === "pending" && (
          <div className="zd-decision">
            <div className="lbl">Decisión</div>

            {currentSeq && (
              <button type="button" className="zd-primary" onClick={onEnroll}>
                <span>Enrolar en</span>
                <span className="seq-name">{currentSeq.name}</span>
                <span className="arr">→</span>
              </button>
            )}

            <div className="zd-sequencer">
              <span className="label">Cambiar</span>
              {PRINCIPAL_INTENTS.map((opt) => {
                const seqSlug =
                  opt.id === "hermandad" ? "herm-onboarding" :
                  opt.id === "elite"     ? "elite-call" :
                  "general-welcome";
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`seq${currentSeqSlug === seqSlug ? " on" : ""}`}
                    onClick={() => onSeqChange?.(seqSlug)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="zd-grid">
              <button type="button" className="zd-btn danger" onClick={onDiscard}>
                Descartar
              </button>
              <button type="button" className="zd-btn" onClick={onTag}>
                Etiquetar como…
              </button>
              <button type="button" className="zd-btn advanced" onClick={onPromote}>
                ↗ Promover al Reactor
              </button>
            </div>
          </div>
        )}

        {/* Si está decidida, mostrar info de la decisión en lugar de los botones */}
        {notif.state !== "pending" && notif.decision && (
          <div className="zd-decision">
            <div className="lbl">Decisión registrada</div>
            <div
              style={{
                padding: "14px 16px",
                background: "var(--bg-1)",
                border: "1px solid var(--line)",
                fontFamily: "var(--mono)",
                fontSize: "11px",
                color: "var(--ink-3)",
                letterSpacing: "0.04em",
                lineHeight: 1.7,
              }}
            >
              <div>
                ESTADO ·{" "}
                <b style={{ color: "var(--ink)" }}>
                  {notif.state.toUpperCase()}
                </b>
              </div>
              {notif.decision.sequenceSlug && (
                <div>
                  SEQUENCE ·{" "}
                  <b style={{ color: "var(--acc)" }}>
                    {sequences?.[notif.decision.sequenceSlug]?.name ||
                      notif.decision.sequenceSlug}
                  </b>
                </div>
              )}
              {notif.decision.discardReason && (
                <div>
                  MOTIVO ·{" "}
                  <b style={{ color: "var(--ink)" }}>
                    {notif.decision.discardReason}
                  </b>
                </div>
              )}
              {notif.decision.tagApplied && (
                <div>
                  ETIQUETA ·{" "}
                  <b style={{ color: `var(--int-${classification.intent})` }}>
                    {notif.decision.tagApplied}
                  </b>
                </div>
              )}
              <div>
                TIEMPO DE DECISIÓN · <b style={{ color: "var(--ink-2)" }}>{notif.decision.timeToDecideSec}s</b>
              </div>
            </div>
          </div>
        )}

        {/* ─── HISTORY ─── */}
        {contactHistory.length > 0 && (
          <div className="zd-history">
            <div className="lbl">
              <span>Historial del contacto</span>
              <b>
                {contactHistory.length} EVENTO{contactHistory.length === 1 ? "" : "S"}
              </b>
            </div>
            <div className="timeline">
              {contactHistory.map((ev, idx) => (
                <div key={idx} className={`ev${ev.current ? " now" : ""}`}>
                  <span className="d">{formatTimelineDate(ev.at)}</span>
                  <span
                    className="x"
                    dangerouslySetInnerHTML={{ __html: ev.summary }}
                  ></span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </aside>
  );
}

// ─── Helpers de formato ─────────────────────────────────────────

function formatFollowerCount(n) {
  if (n >= 1000) {
    return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "K";
  }
  return String(n);
}

function formatReceivedAt(date) {
  const d = date instanceof Date ? date : new Date(date);
  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${MES[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelative(date) {
  const d = date instanceof Date ? date : new Date(date);
  const diffMin = Math.floor((Date.now() - d) / 60000);
  if (diffMin < 1) return "AHORA";
  if (diffMin < 60) return `HACE ${diffMin} MIN`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `HACE ${diffH}H`;
  const diffD = Math.floor(diffH / 24);
  return `HACE ${diffD} D`;
}

function formatTimelineDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const MES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const pad = (n) => String(n).padStart(2, "0");

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) return `HOY · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getDate())} ${MES[d.getMonth()]}`;
}
