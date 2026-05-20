/**
 * Zernio — Pestaña de DMs de Instagram clasificados por IA.
 *
 * v0.61.0-α · Bloque C (backend real conectado)
 *
 * Hilo 2 cerrado. Los datos ahora vienen del endpoint
 * `/api/zernio/notifications` (Netlify Function en el site principal), que
 * lee la BD compartida con `imperio-zernio-hooks`. El mock (`zernio-mock.js`)
 * queda fuera.
 *
 * Loading / error pintados por ZernioList vía el prop `state` (la
 * infraestructura ya existía de Iteración 3; antes se forzaba con DEMO,
 * ahora reflejan el estado real del fetch).
 *
 * Las decisiones son optimistas: la notif se mueve de pending a decided al
 * instante y se hace POST a /decide en segundo plano. Si la API falla,
 * rollback automático + toast de error.
 *
 * Pendiente futuro:
 *   · Endpoint /api/zernio/health → edgeHealth real (de momento placeholder).
 *   · Polling automático cada N seg (de momento refresh manual con el botón
 *     "Reintentar" de ZernioList y el del banner de edge).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listNotifications,
  decideNotification,
  SEQUENCES,
  EDGE_HEALTH_OPERATIONAL,
  EDGE_HEALTH_DEGRADED,
} from "../lib/zernio-api.js";
import ZernioToolbar from "../components/zernio/ZernioToolbar.jsx";
import ZernioSidebar from "../components/zernio/ZernioSidebar.jsx";
import ZernioList from "../components/zernio/ZernioList.jsx";
import ZernioDetail from "../components/zernio/ZernioDetail.jsx";
import ZernioEdgeBanner from "../components/zernio/ZernioEdgeBanner.jsx";
import ZernioToast from "../components/zernio/ZernioToast.jsx";
import ZernioTagMenu from "../components/zernio/ZernioTagMenu.jsx";

const ALL_INTENTS = ["hermandad", "elite", "general", "sininter"];
const ALL_TEMPERATURES = ["hot", "warm", "cold"];

export default function Zernio() {
  // ─── Datos del backend ──────────────────────────────────────
  const [notifsPending, setNotifsPending] = useState([]);
  const [notifsDecided, setNotifsDecided] = useState([]);
  const [historicoTotalCount, setHistoricoTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ─── State de UI ────────────────────────────────────────────
  const [view, setView] = useState("inbox");
  const [selectedId, setSelectedId] = useState(null);
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

  // ─── Toast ──────────────────────────────────────────────────
  const [toast, setToast] = useState(null);

  // ─── Tag menu ───────────────────────────────────────────────
  const [tagMenu, setTagMenu] = useState({
    open: false,
    notifId: null,
    anchorRect: null,
  });

  // ─── Side effects de chrome ─────────────────────────────────
  useEffect(() => {
    document.body.classList.add("zernio-app");
    return () => document.body.classList.remove("zernio-app");
  }, []);

  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedQuery(searchQuery.trim().toLowerCase()),
      200,
    );
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setSelectedSeq(null);
  }, [selectedId]);

  // ─── Fetch desde el backend ─────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listNotifications({ view: "all", limit: 200 });
      const items = data.items || [];
      const pending = items.filter((n) => n.state === "pending");
      const decided = items.filter((n) => n.state !== "pending");
      setNotifsPending(pending);
      setNotifsDecided(decided);
      setHistoricoTotalCount(data.counts?.decided ?? decided.length);
      // Si la selección actual ya no existe, elige la primera pending (o nada).
      setSelectedId((current) => {
        if (current && items.some((n) => n.id === current)) return current;
        return pending[0]?.id || null;
      });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ─── Edge health (placeholder hasta endpoint /health) ───────
  // Si el último fetch falló, degradamos visualmente como señal.
  const edgeHealth = error ? EDGE_HEALTH_DEGRADED : EDGE_HEALTH_OPERATIONAL;

  // ─── Lista filtrada + sorted ────────────────────────────────
  const sourceList = view === "inbox" ? notifsPending : notifsDecided;

  const filteredNotifs = useMemo(() => {
    let list = sourceList;

    if (debouncedQuery) {
      list = list.filter(
        (n) =>
          n.contact.handle.toLowerCase().includes(debouncedQuery) ||
          n.dm.text.toLowerCase().includes(debouncedQuery),
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
          return (
            order[a.classification.temperature] -
            order[b.classification.temperature]
          );
        }
        if (sortInbox === "confidence") {
          return b.classification.confidence - a.classification.confidence;
        }
        return 0;
      });
    } else {
      list = [...list].sort((a, b) => b.receivedAt - a.receivedAt);

      if (sortHistorico === "enrolled")
        list = list.filter((n) => n.state === "enrolled");
      else if (sortHistorico === "discarded")
        list = list.filter((n) => n.state === "discarded");
      else if (sortHistorico === "other")
        list = list.filter(
          (n) => n.state === "tagged" || n.state === "promoted",
        );
      else if (sortHistorico === "7d") {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        list = list.filter((n) => n.receivedAt.getTime() >= sevenDaysAgo);
      }
    }

    return list;
  }, [view, sourceList, debouncedQuery, filters, sortInbox, sortHistorico]);

  // ─── Counters derivados ─────────────────────────────────────
  const counters = useMemo(() => {
    const pendingByIntent = {};
    const pendingByTemp = {};
    let pendingCount = 0;
    for (const n of notifsPending) {
      pendingByIntent[n.classification.intent] =
        (pendingByIntent[n.classification.intent] || 0) + 1;
      pendingByTemp[n.classification.temperature] =
        (pendingByTemp[n.classification.temperature] || 0) + 1;
      pendingCount++;
    }
    return {
      pendingCount,
      pendingByIntent,
      pendingByTemp,
      decidedToday: notifsDecided.filter((n) =>
        sameDay(n.decision?.decidedAt, new Date()),
      ).length,
      decidedWeek: notifsDecided.filter((n) => {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const t = n.decision?.decidedAt?.getTime?.() ?? 0;
        return t >= sevenDaysAgo;
      }).length,
      enrolmentRate:
        notifsDecided.length > 0
          ? Math.round(
              (notifsDecided.filter((n) => n.state === "enrolled").length /
                notifsDecided.length) *
                100,
            )
          : 0,
    };
  }, [notifsPending, notifsDecided]);

  // ─── Notif seleccionada ─────────────────────────────────────
  const selectedNotif = useMemo(() => {
    if (!selectedId) return null;
    return (
      notifsPending.find((n) => n.id === selectedId) ||
      notifsDecided.find((n) => n.id === selectedId) ||
      null
    );
  }, [selectedId, notifsPending, notifsDecided]);

  // ─── Estado de la lista ─────────────────────────────────────
  const listState = loading
    ? "loading"
    : error
      ? "error"
      : sourceList.length === 0
        ? "zero"
        : "normal";

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

  // ─── decide() con UI optimista + rollback ──────────────────
  /**
   *   notifId   = id de la notif pending
   *   type      = 'enroll' | 'discard' | 'tag' | 'promote'
   *   payload   = { sequenceSlug?, discardReason?, tagApplied? }
   */
  async function decide(notifId, type, payload = {}) {
    const notif = notifsPending.find((n) => n.id === notifId);
    if (!notif) return;

    const newState =
      type === "enroll"
        ? "enrolled"
        : type === "discard"
          ? "discarded"
          : type === "tag"
            ? "tagged"
            : type === "promote"
              ? "promoted"
              : "tagged";

    const optimisticDecision = {
      type,
      decidedAt: new Date(),
      decidedBy: "soma",
      timeToDecideSec: 0, // se refina con la respuesta real
      ...payload,
    };
    const decidedNotif = {
      ...notif,
      state: newState,
      decision: optimisticDecision,
    };

    // Snapshot para rollback
    const prevPending = notifsPending;
    const prevDecided = notifsDecided;
    const prevTotalCount = historicoTotalCount;
    const prevSelectedId = selectedId;

    // Optimistic update
    setNotifsPending((prev) => prev.filter((n) => n.id !== notifId));
    setNotifsDecided((prev) => [decidedNotif, ...prev]);
    setHistoricoTotalCount((c) => c + 1);

    // Si la seleccionada era la afectada, mover a la siguiente pending
    if (selectedId === notifId) {
      const remaining = prevPending.filter((n) => n.id !== notifId);
      setSelectedId(remaining[0]?.id || null);
    }

    // Toast optimista
    setToast({
      id: Date.now(),
      kind: type === "promote" ? "todo" : "success",
      message: buildToastMessage(notif, type, payload),
    });

    // POST al backend
    try {
      const result = await decideNotification(notifId, type, payload);
      // Refinar timeToDecideSec con el valor real del backend
      if (result?.timeToDecideSec != null) {
        setNotifsDecided((prev) =>
          prev.map((n) =>
            n.id === notifId
              ? {
                  ...n,
                  decision: {
                    ...n.decision,
                    timeToDecideSec: result.timeToDecideSec,
                    decidedAt:
                      result.decidedAt instanceof Date
                        ? result.decidedAt
                        : new Date(result.decidedAt),
                  },
                }
              : n,
          ),
        );
      }
    } catch (e) {
      // Rollback completo
      setNotifsPending(prevPending);
      setNotifsDecided(prevDecided);
      setHistoricoTotalCount(prevTotalCount);
      setSelectedId(prevSelectedId);
      setToast({
        id: Date.now(),
        kind: "error",
        message: `Error · ${e?.message || "no se pudo registrar la decisión"}`,
      });
    }
  }

  function buildToastMessage(notif, type, payload) {
    const handle = notif.contact.handle;
    if (type === "enroll") {
      const seqSlug =
        payload.sequenceSlug || notif.classification.suggestedSequence;
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
    decide(notifId, "enroll", {
      sequenceSlug: notif.classification.suggestedSequence,
    });
  }
  function handleDiscardFromRow(notifId) {
    decide(notifId, "discard");
  }
  function handleTagFromRow(notifId, tagApplied) {
    decide(notifId, "tag", { tagApplied });
  }
  function handleEnrollFromDetail() {
    if (!selectedNotif) return;
    const sequenceSlug =
      selectedSeq || selectedNotif.classification.suggestedSequence;
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
    setTagMenu({
      open: true,
      notifId: selectedNotif.id,
      anchorRect: rect || null,
    });
  };
  const closeTagMenu = () =>
    setTagMenu({ open: false, notifId: null, anchorRect: null });
  const pickTag = (tag) => {
    if (tagMenu.notifId)
      decide(tagMenu.notifId, "tag", { tagApplied: tag.label.toUpperCase() });
  };

  return (
    <>
      <ZernioEdgeBanner
        health={edgeHealth}
        onViewLogs={() =>
          setToast({
            id: Date.now(),
            kind: "todo",
            message: "<b>Ver logs</b> · TODO en backend real",
          })
        }
        onRetry={refresh}
      />

      <ZernioToolbar
        view={view}
        pendingCount={counters.pendingCount}
        historicoCount={historicoTotalCount}
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
          onRetry={refresh}
          state={listState}
          totalCount={
            view === "inbox" ? counters.pendingCount : historicoTotalCount
          }
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
