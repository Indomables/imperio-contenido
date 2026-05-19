/**
 * ZernioList — Panel central que pinta la lista de notifs según view y filtros.
 *
 * Maneja:
 *   · Header con count + sort chips (operativos)
 *   · Cuerpo de la lista con ZernioNotifRow por cada notif filtrada
 *   · Estados especiales: Inbox Zero, Loading, Error
 *
 * Props:
 *   view, notifs, selectedId, sort, onSelect, onEnroll, onDiscard, onTag, onSortChange, state
 */

import ZernioNotifRow from "./ZernioNotifRow.jsx";
import ZernioInboxZero from "./ZernioInboxZero.jsx";
import ZernioLoading from "./ZernioLoading.jsx";
import ZernioError from "./ZernioError.jsx";

const SORT_INBOX = [
  { id: "recent",     label: "Más recientes" },
  { id: "hottest",    label: "Más calientes" },
  { id: "confidence", label: "Mayor confianza" },
];

const SORT_HISTORICO = [
  { id: "all",        label: "Todas" },
  { id: "enrolled",   label: "Enroladas" },
  { id: "discarded",  label: "Descartadas" },
  { id: "other",      label: "Otras" },
  { id: "7d",         label: "7D" },
];

export default function ZernioList({
  view,
  notifs = [],
  selectedId,
  sort,
  onSelect,
  onEnroll,
  onDiscard,
  onTag,
  onSortChange,
  onRetry,
  state = "normal", // 'normal' | 'loading' | 'error' | 'zero'
  totalCount,
}) {
  const isInbox = view === "inbox";
  const sortOptions = isInbox ? SORT_INBOX : SORT_HISTORICO;

  return (
    <main className="zpanel zlist">
      <span className="br-tr"></span>
      <span className="br-bl"></span>

      <header className="zlist-head">
        <div className="ttl">
          <span className="ix">04</span>
          <span>{isInbox ? "Inbox" : "Histórico"}</span>
        </div>
        <span className={`big${isInbox ? " acc" : ""}`}>
          {totalCount ?? notifs.length}
          <small>{isInbox ? "pendientes" : "decididas"}</small>
        </span>
        <div className="sort">
          {sortOptions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip${sort === s.id ? " on" : ""}`}
              onClick={() => onSortChange?.(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {state === "loading" && <ZernioLoading />}

      {state === "error" && <ZernioError onRetry={onRetry} />}

      {state === "zero" && (
        <ZernioInboxZero
          desc={
            isInbox
              ? undefined // default
              : "Sin decisiones registradas todavía. Las notificaciones que proceses aparecerán aquí con su estado final."
          }
        />
      )}

      {state === "normal" && notifs.length === 0 && (
        <ZernioInboxZero
          desc={
            isInbox
              ? "No hay notificaciones que coincidan con los filtros aplicados. Resetea filtros para ver toda la bandeja."
              : "Sin decisiones que coincidan con el filtro. Cambia el filtro arriba a la derecha."
          }
        />
      )}

      {state === "normal" && notifs.length > 0 && (
        <div className="zlist-body">
          {notifs.map((n) => (
            <ZernioNotifRow
              key={n.id}
              notif={n}
              selected={n.id === selectedId}
              onSelect={onSelect}
              onEnroll={onEnroll}
              onDiscard={onDiscard}
              onTag={onTag}
            />
          ))}
        </div>
      )}
    </main>
  );
}
