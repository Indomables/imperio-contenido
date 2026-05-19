/**
 * Zernio — Pestaña de DMs de Instagram clasificados por IA.
 *
 * v0.60.0-α · Iteración 3 (acciones de decisión funcionales)
 *
 * Cierra el ciclo del frontend. Las acciones (enrolar / descartar / etiquetar /
 * promover) mutan el mock en vivo con UI optimista: la notif sale del Inbox y
 * entra en el Histórico con su estado correcto. Counters y filtros se actualizan
 * al instante.
 *
 * Sin persistencia entre recargas (cada F5 resetea el mock al estado original).
 * El backend real (Hilo 2) hará la mutación persistente vía POST a la Netlify
 * Function correspondiente — la UI no cambia.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  NOTIFS_PENDING,
  NOTIFS_DECIDED,
  HISTORICO_TOTAL_COUNT,
  SEQUENCES,
  EDGE_HEALTH_OPERATIONAL,
  EDGE_HEALTH_DEGRADED,
  EDGE_HEALTH_DOWN,
} from "../lib/zernio-mock.js";
import ZernioToolbar from "../components/zernio/ZernioToolbar.jsx";
import ZernioSidebar from "../components/zernio/ZernioSidebar.jsx";
import ZernioList from "../components/zernio/ZernioList.jsx";
import ZernioDetail from "../components/zernio/ZernioDetail.jsx";
import ZernioEdgeBanner from "../components/zernio/ZernioEdgeBanner.jsx";
import ZernioStateOverride from "../components/zernio/ZernioStateOverride.jsx";
import ZernioToast from "../components/zernio/ZernioToast.jsx";
import ZernioTagMenu from "../components/zernio/ZernioTagMenu.jsx";

const ALL_INTENTS = ["hermandad", "elite", "general", "sininter"];
const ALL_TEMPERATURES = ["hot", "warm", "cold"];

export default function Zernio() {
  // ─── Mock en state mutable (Iteración 3) ────────────────────
  const [notifsPending, setNotifsPending]   = useState(() => [...NOTIFS_PENDING]);
  const [notifsDecided, setNotifsDecided]   = useState(() => [...NOTIFS_DECIDED]);
  const [extraDecidedCount, setExtraDecidedCount] = useState(0); // cuántas decisiones se han añadido al histórico desde el mock inicial

  // ─── State de UI ────────────────────────────────────────────
  const [view, setView] = useState("inbox");
  const [selectedId, setSelectedId] = useState("n01");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [filters, setFilters] = useState({
    intents: new Set(ALL_INTENTS),
    temperatures: new Set(ALL_TEMPERATURES),
    confidenceRange: "all",
  });

  const [sortInbox, setSortInbox] = useState("recent");
  const [sortHistorico, setSortHistorico] = useState("all");

  const [selectedSeq, setSelectedSeq] = useState(null);
  const [forcedState, setForcedState] = useState("normal");

  // ─── Toast ──────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  // ─── Tag menu ───────────────────────────────────────────────
  const [tagMenu, setTagMenu] = useState({ open: false, notifId: null, anchorRect: null });

  // ─── Side effects ───────────────────────────────────────────
  useEffect(() => {
    document.body.classList.add("zernio-app");
    return () => document.body.classList.remove("zernio-app");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedSeq(null);
  }, [selectedId]);

  // ─── Edge health derivada ───────────────────────────────────
  const edgeHealth = useMemo(() => {
    if (forcedState === "warn") return EDGE_HEALTH_DEGRADED;
    if (forcedState === "down") return EDGE_HEALTH_DOWN;
    return EDGE_HEALTH_OPERATIONAL;
  }, [forcedState]);

  // ─── Lista filtrada + sorted ────────────────────────────────
  const sourceList = view === "inbox" ? notifsPending : notifsDecided;

  const filteredNotifs = useMemo(() => {
    let list = sourceList;

    if (debouncedQuery) {
      list = list.filter(
        (n) =>
          n.contact.handle.toLowerCase().includes(debouncedQuery) ||
          n.dm.text.toLowerCase().includes(debouncedQuery)
      );
    }

    if (view === "inbox") {
      list = list.filter((n) => {
        if (!filters.intents.has(n.classification.intent)) return false;
        if (!filters.temperatures.has(n.classification.temperature)) return false;
        const c = n.classification.confidence;
        if (filters.confidenceRange === "high" && c < 85) return false;
        if (filters.confidenceRange === "mid" && (c < 50 || c >= 85)) return false;
        if (filters.confidenceRange === "low" && c >= 50) return false;
        return true;
      });

      list = [...list].sort((a, b) => {
        if (sortInbox === "recent") return b.receivedAt - a.receivedAt;
        if (sortInbox === "hottest") {
          const order = { hot: 0, warm: 1, cold: 2 };
          return order[a.classification.temperature] - order[b.classification.temperature];
        }
        if (sortInbox === "confidence") {
          return b.classification.confidence - a.classification.confidence;
        }
        return 0;
      });
    } else {
      list = [...list].sort((a, b) => {
        const ta = a.decision?.decidedAt?.getTime?.() || a.receivedAt.getTime();
        const tb = b.decision?.decidedAt?.getTime?.() || b.receivedAt.getTime();
        return tb - ta;
      });

      if (sortHistorico === "enrolled") list = list.filter((n) => n.state === "enrolled");
      else if (sortHistorico === "discarded") list = list.filter((n) => n.state === "discarded");
      else if (sortHistorico === "other") list = list.filter((n) => n.state === "tagged" || n.state === "promoted");
      else if (sortHistorico === "7d") {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        list = list.filter((n) => n.receivedAt.getTime() >= sevenDaysAgo);
      }
    }

    return list;
  }, [view, sourceList, debouncedQuery, filters, sortInbox, sortHistorico]);

  // ─── Counters derivados (recalculan al mutar el mock) ───────
  const counters = useMemo(() => {
    const pendingByIntent = {};
    const pendingByTemp = {};
    let pendingCount = 0;
    for (const n of notifsPending) {
      pendingByIntent[n.classification.intent] = (pendingByIntent[n.classification.intent] || 0) + 1;
      pendingByTemp[n.classification.temperature] = (pendingByTemp[n.classification.temperature] || 0) + 1;
      pendingCount++;
    }
    const decidedToday = notifsDecided.filter((n) =>
      sameDay(n.decision?.decidedAt, new Date())
    ).length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const decidedWeek = notifsDecided.filter(
      (n) => n.decision?.decidedAt?.getTime?.() >= sevenDaysAgo
    ).length;
    const enrolmentRate = notifsDecided.length
      ? Math.round(
          (notifsDecided.filter((n) => n.state === "enrolled").length /
            notifsDecided.length) *
            100
        )
      : 0;
    return { pendingCount, pendingByIntent, pendingByTemp, decidedToday, decidedWeek, enrolmentRate };
  }, [notifsPending, notifsDecided]);

  // ─── Notif seleccionada (objeto completo) ───────────────────
  const selectedNotif = useMemo(() => {
    return (
      notifsPending.find((n) => n.id === selectedId) ||
      notifsDecided.find((n) => n.id === selectedId) ||
      null
    );
  }, [selectedId, notifsPending, notifsDecided]);

  // ─── Estado de la lista (cuando notifsPending queda vacía,
  //     Inbox Zero aparece solo en la vista Inbox sin necesidad
  //     de forzar nada — gracias a ZernioList) ──────────────────
  const listState =
    forcedState === "loading" ? "loading" :
    forcedState === "error"   ? "error" :
    forcedState === "zero"    ? "zero" :
    "normal";

  // ─── Handlers de filtros ────────────────────────────────────
  function toggleIntent(intent) {
    setFilters((f) => {
      const next = new Set(f.intents);
      if (next.has(intent)) next.delete(intent);
      else next.add(intent);
      return { ...f, intents: next };
    });
  }
  function toggleTemperature(temp) {
    setFilters((f) => {
      const next = new Set(f.temperatures);
      if (next.has(temp)) next.delete(temp);
      else next.add(temp);
      return { ...f, temperatures: next };
    });
  }
  function setConfidenceRange(range) {
    setFilters((f) => ({ ...f, confidenceRange: range }));
  }
  function resetFilters() {
    setFilters({
      intents: new Set(ALL_INTENTS),
      temperatures: new Set(ALL_TEMPERATURES),
      confidenceRange: "all",
    });
  }

  // ─── Mutación: decidir una notif ────────────────────────────
  /**
   * decide(notifId, type, payload) — mueve la notif de pending a decided.
   *
   *   type      = 'enroll' | 'discard' | 'tag' | 'promote'
   *   payload   = { sequenceSlug? , discardReason?, tagApplied? }
   */
  function decide(notifId, type, payload = {}) {
    const notif = notifsPending.find((n) => n.id === notifId);
    if (!notif) return;

    const newState =
      type === "enroll"  ? "enrolled" :
      type === "discard" ? "discarded" :
      type === "tag"     ? "tagged" :
      type === "promote" ? "promoted" :
      "tagged";

    const decision = {
      type,
      decidedAt: new Date(),
      decidedBy: "soma",
      timeToDecideSec: 4 + Math.floor(Math.random() * 17), // mock realista 4-20s
      ...payload,
    };

    const decidedNotif = { ...notif, state: newState, decision };

    // Optimistic: pull del pending, push al decided
    setNotifsPending((prev) => prev.filter((n) => n.id !== notifId));
    setNotifsDecided((prev) => [decidedNotif, ...prev]);
    setExtraDecidedCount((c) => c + 1);

    // Seleccionar la siguiente notif pending (si hay), para que el detail no quede vacío
    const remaining = notifsPending.filter((n) => n.id !== notifId);
    if (selectedId === notifId) {
      setSelectedId(remaining[0]?.id || null);
    }

    // Toast
    const msg = buildToastMessage(notif, type, payload);
    setToast({ id: Date.now(), kind: type === "promote" ? "todo" : "success", message: msg });
  }

  function buildToastMessage(notif, type, payload) {
    const handle = notif.contact.handle;
    if (type === "enroll") {
      const seqSlug = payload.sequenceSlug || notif.classification.suggestedSequence;
      const seqName = SEQUENCES[seqSlug]?.name || seqSlug;
      return `Enrolada · <b>${handle}</b> → ${seqName}`;
    }
    if (type === "discard") {
      const reason = payload.discardReason ? ` · ${payload.discardReason}` : "";
      return `Descartada · <b>${handle}</b>${reason}`;
    }
    if (type === "tag") {
      return `Etiquetada · <b>${handle}</b> → ${payload.tagApplied || "—"}`;
    }
    if (type === "promote") {
      return `<b>${handle}</b> promovida al Reactor · <em>TODO · integración Doña Prudencia</em>`;
    }
    return `Acción aplicada sobre <b>${handle}</b>`;
  }

  // ─── Handlers de acciones desde row o detail ────────────────
  function handleEnrollFromRow(notifId) {
    const notif = notifsPending.find((n) => n.id === notifId);
    if (!notif) return;
    decide(notifId, "enroll", { sequenceSlug: notif.classification.suggestedSequence });
  }
  function handleDiscardFromRow(notifId) {
    decide(notifId, "discard");
  }
  function handleTagFromRow(notifId, tagApplied) {
    decide(notifId, "tag", { tagApplied });
  }
  function handleEnrollFromDetail() {
    if (!selectedNotif) return;
    const sequenceSlug = selectedSeq || selectedNotif.classification.suggestedSequence;
    decide(selectedNotif.id, "enroll", { sequenceSlug });
  }
  function handleDiscardFromDetail() {
    if (!selectedNotif) return;
    decide(selectedNotif.id, "discard");
  }
  function handlePromoteFromDetail() {
    if (!selectedNotif) return;
    decide(selectedNotif.id, "promote");
  }

  // ─── Tag menu (desde el detail) ─────────────────────────────
  const openTagMenuFromDetail = (anchorEl) => {
    if (!selectedNotif) return;
    const rect = anchorEl?.getBoundingClientRect?.();
    setTagMenu({ open: true, notifId: selectedNotif.id, anchorRect: rect || null });
  };
  const closeTagMenu = () => setTagMenu({ open: false, notifId: null, anchorRect: null });
  const pickTag = (tag) => {
    if (tagMenu.notifId) decide(tagMenu.notifId, "tag", { tagApplied: tag.label.toUpperCase() });
  };

  return (
    <>
      <ZernioEdgeBanner
        health={edgeHealth}
        onViewLogs={() => setToast({ id: Date.now(), kind: "todo", message: "<b>Ver logs</b> · TODO en backend real" })}
        onRetry={() => {
          setForcedState("normal");
          setToast({ id: Date.now(), kind: "info", message: "Edge function · estado restaurado" });
        }}
      />

      <ZernioToolbar
        view={view}
        pendingCount={counters.pendingCount}
        historicoCount={HISTORICO_TOTAL_COUNT + extraDecidedCount}
        onViewChange={setView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="zernio-body">
        <ZernioSidebar
          edgeHealth={edgeHealth}
          counters={counters}
          filters={filters}
          onToggleIntent={toggleIntent}
          onToggleTemperature={toggleTemperature}
          onSetConfidenceRange={setConfidenceRange}
          onResetFilters={resetFilters}
        />

        <ZernioList
          view={view}
          notifs={filteredNotifs}
          selectedId={selectedId}
          sort={view === "inbox" ? sortInbox : sortHistorico}
          onSelect={setSelectedId}
          onEnroll={handleEnrollFromRow}
          onDiscard={handleDiscardFromRow}
          onTag={handleTagFromRow}
          onSortChange={view === "inbox" ? setSortInbox : setSortHistorico}
          onRetry={() => setForcedState("normal")}
          state={listState}
          totalCount={view === "inbox" ? counters.pendingCount : HISTORICO_TOTAL_COUNT + extraDecidedCount}
        />

        <ZernioDetail
          notif={selectedNotif}
          sequences={SEQUENCES}
          selectedSeq={selectedSeq}
          onSeqChange={setSelectedSeq}
          onEnroll={handleEnrollFromDetail}
          onDiscard={handleDiscardFromDetail}
          onTag={openTagMenuFromDetail}
          onPromote={handlePromoteFromDetail}
        />
      </div>

      <ZernioStateOverride value={forcedState} onChange={setForcedState} />
      <ZernioToast toast={toast} onDismiss={() => setToast(null)} />
      <ZernioTagMenu
        open={tagMenu.open}
        anchorRect={tagMenu.anchorRect}
        onPick={pickTag}
        onClose={closeTagMenu}
      />
    </>
  );
}

function sameDay(a, b) {
  if (!a || !b) return false;
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}
