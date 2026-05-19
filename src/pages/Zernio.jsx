/**
 * Zernio — Pestaña de DMs de Instagram clasificados por IA.
 *
 * v0.59.0-α · Iteración 2 (datos mock + interacciones)
 *
 * Layout (`.zernio-body`):
 *   ┌───────────┬──────────────────────────┬───────────────────┐
 *   │  SIDEBAR  │  LIST (Inbox/Histórico)  │   DETAIL          │
 *   │  260px    │  1fr                     │   460px           │
 *   └───────────┴──────────────────────────┴───────────────────┘
 *
 * Iteración 2 incorpora:
 *   - Mock data realista (12 pending + 25 histórico) desde lib/zernio-mock.js
 *   - Selección de notif con detail panel poblado
 *   - Filtros operativos (intent + temperature + confidence) que aplican sobre la lista
 *   - Sort operativo (recent / hottest / confidence en Inbox; all/enrolled/discarded/other/7d en Histórico)
 *   - Conmutar Inbox/Histórico
 *   - Búsqueda por handle o texto del DM (debounce 200ms)
 *   - Estados especiales accesibles vía panel oculto (DEMO botón abajo-izq): normal/zero/loading/error/warn/down
 *   - Edge banner cuando state='warn' o 'down'
 *
 * Iteración 3 (v0.60.0-α) añadirá:
 *   - Acciones de decisión funcionales (enrol/discard/tag/promote) con UI optimista
 *
 * Hilo 2 (backend real, posterior) sustituirá el mock por API real
 * sin tocar UI.
 */

import { useEffect, useMemo, useState } from "react";
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

const ALL_INTENTS = ["hermandad", "elite", "general", "sininter"];
const ALL_TEMPERATURES = ["hot", "warm", "cold"];

export default function Zernio() {
  // ─── State global de la pestaña ─────────────────────────────
  const [view, setView] = useState("inbox");
  const [selectedId, setSelectedId] = useState("n01"); // por defecto la primera pending del handoff
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [filters, setFilters] = useState({
    intents: new Set(ALL_INTENTS),
    temperatures: new Set(ALL_TEMPERATURES),
    confidenceRange: "all", // 'all' | 'high' | 'mid' | 'low'
  });

  const [sortInbox, setSortInbox] = useState("recent");
  const [sortHistorico, setSortHistorico] = useState("all");

  const [selectedSeq, setSelectedSeq] = useState(null); // sequence slug override en el detail
  const [forcedState, setForcedState] = useState("normal");

  // ─── Side effects ───────────────────────────────────────────
  // Clase zernio-app en body mientras estamos en la pestaña
  useEffect(() => {
    document.body.classList.add("zernio-app");
    return () => document.body.classList.remove("zernio-app");
  }, []);

  // Debounce de la search (200ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset selectedSeq al cambiar de notif (vuelve a la sugerida)
  useEffect(() => {
    setSelectedSeq(null);
  }, [selectedId]);

  // ─── Edge health derivada de forcedState ────────────────────
  const edgeHealth = useMemo(() => {
    if (forcedState === "warn") return EDGE_HEALTH_DEGRADED;
    if (forcedState === "down") return EDGE_HEALTH_DOWN;
    return EDGE_HEALTH_OPERATIONAL;
  }, [forcedState]);

  // ─── Lista filtrada + sorted ────────────────────────────────
  const sourceList = view === "inbox" ? NOTIFS_PENDING : NOTIFS_DECIDED;

  const filteredNotifs = useMemo(() => {
    let list = sourceList;

    // Filtro de búsqueda (afecta a ambas vistas)
    if (debouncedQuery) {
      list = list.filter(
        (n) =>
          n.contact.handle.toLowerCase().includes(debouncedQuery) ||
          n.dm.text.toLowerCase().includes(debouncedQuery)
      );
    }

    if (view === "inbox") {
      // Filtros de intención / temperatura / confianza (solo en Inbox)
      list = list.filter((n) => {
        if (!filters.intents.has(n.classification.intent)) return false;
        if (!filters.temperatures.has(n.classification.temperature)) return false;
        const c = n.classification.confidence;
        if (filters.confidenceRange === "high" && c < 85) return false;
        if (filters.confidenceRange === "mid" && (c < 50 || c >= 85)) return false;
        if (filters.confidenceRange === "low" && c >= 50) return false;
        return true;
      });

      // Sort Inbox
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
      // Sort Histórico
      list = [...list].sort((a, b) => b.receivedAt - a.receivedAt);

      if (sortHistorico === "enrolled") list = list.filter((n) => n.state === "enrolled");
      else if (sortHistorico === "discarded") list = list.filter((n) => n.state === "discarded");
      else if (sortHistorico === "other") list = list.filter((n) => n.state === "tagged" || n.state === "promoted");
      else if (sortHistorico === "7d") {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        list = list.filter((n) => n.receivedAt.getTime() >= sevenDaysAgo);
      }
      // 'all' no filtra más
    }

    return list;
  }, [view, sourceList, debouncedQuery, filters, sortInbox, sortHistorico]);

  // ─── Counters derivados para el sidebar ─────────────────────
  const counters = useMemo(() => {
    const pendingByIntent = {};
    const pendingByTemp = {};
    let pendingCount = 0;
    for (const n of NOTIFS_PENDING) {
      pendingByIntent[n.classification.intent] = (pendingByIntent[n.classification.intent] || 0) + 1;
      pendingByTemp[n.classification.temperature] = (pendingByTemp[n.classification.temperature] || 0) + 1;
      pendingCount++;
    }
    return {
      pendingCount,
      pendingByIntent,
      pendingByTemp,
      decidedToday: NOTIFS_DECIDED.filter((n) =>
        sameDay(n.decision?.decidedAt, new Date())
      ).length,
      decidedWeek: NOTIFS_DECIDED.filter((n) => {
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return n.decision?.decidedAt?.getTime() >= sevenDaysAgo;
      }).length,
      enrolmentRate: Math.round(
        (NOTIFS_DECIDED.filter((n) => n.state === "enrolled").length /
          NOTIFS_DECIDED.length) *
          100
      ),
    };
  }, []);

  // ─── Notif seleccionada (objeto completo) ───────────────────
  const selectedNotif = useMemo(() => {
    const all = [...NOTIFS_PENDING, ...NOTIFS_DECIDED];
    return all.find((n) => n.id === selectedId) || null;
  }, [selectedId]);

  // ─── Estado de la lista (normal | loading | error | zero) ───
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

  // ─── Handlers de acciones (Iteración 2: solo toast, sin mutación real) ─
  function showStub(action, target) {
    console.info(`[Zernio · v0.59.0-α stub] ${action} → ${target}`);
    // En Iteración 3 esto disparará la mutación optimista sobre el mock.
  }

  return (
    <>
      <ZernioEdgeBanner
        health={edgeHealth}
        onViewLogs={() => showStub("logs", "edge-fn")}
        onRetry={() => showStub("retry", "edge-fn")}
      />

      <ZernioToolbar
        view={view}
        pendingCount={counters.pendingCount}
        historicoCount={HISTORICO_TOTAL_COUNT}
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
          onEnroll={(id) => showStub("enroll", id)}
          onDiscard={(id) => showStub("discard", id)}
          onTag={(id, t) => showStub(`tag(${t})`, id)}
          onSortChange={view === "inbox" ? setSortInbox : setSortHistorico}
          onRetry={() => setForcedState("normal")}
          state={listState}
          totalCount={view === "inbox" ? counters.pendingCount : HISTORICO_TOTAL_COUNT}
        />

        <ZernioDetail
          notif={selectedNotif}
          sequences={SEQUENCES}
          selectedSeq={selectedSeq}
          onSeqChange={setSelectedSeq}
          onEnroll={() => showStub("enroll-from-detail", selectedId)}
          onDiscard={() => showStub("discard-from-detail", selectedId)}
          onTag={() => showStub("tag-from-detail", selectedId)}
          onPromote={() => showStub("promote-to-reactor", selectedId)}
        />
      </div>

      <ZernioStateOverride value={forcedState} onChange={setForcedState} />
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
