/**
 * Zernio — Pestaña de DMs de Instagram clasificados por IA.
 *
 * v0.58.0-α · Iteración 1 (chrome / shell)
 *
 * Layout del handoff Claude Design (`.zernio-body`):
 *   ┌─────────────┬─────────────────────────┬───────────────────┐
 *   │   SIDEBAR   │     LIST (Inbox Zero)   │   DETAIL          │
 *   │   260px     │     1fr                 │   460px           │
 *   └─────────────┴─────────────────────────┴───────────────────┘
 *
 * Iteración 1: chrome visible y estructurado. Cero datos. Cero acciones.
 * Vistas Inbox/Histórico conmutables (ambas pintan Inbox Zero).
 *
 * Iteraciones siguientes:
 *   - v0.59 (Iteración 2): mock data realista, lista funcional, detail
 *     poblado, filtros y sort operativos, estados especiales (loading,
 *     error, edge degradada, edge caída) accesibles vía panel oculto.
 *   - v0.60 (Iteración 3): acciones de decisión (enrolar, descartar,
 *     etiquetar, promover) operativas sobre el mock con UI optimista.
 *
 * El backend real (Netlify Function de clasificación + 4 tablas en
 * Netlify Database) llega en Hilo 2, posterior a estas 3 iteraciones.
 */

import { useEffect, useState } from "react";
import ZernioToolbar from "../components/zernio/ZernioToolbar.jsx";
import ZernioSidebar from "../components/zernio/ZernioSidebar.jsx";
import ZernioInboxZero from "../components/zernio/ZernioInboxZero.jsx";

export default function Zernio() {
  const [view, setView] = useState("inbox");
  const [searchQuery, setSearchQuery] = useState("");

  // Añade la clase `zernio-app` al <body> mientras la pestaña está montada.
  // Algunas reglas del handoff CSS (zernio.css) están scoped a `.zernio-app`,
  // así que el styling completo solo aplica cuando estamos dentro de Zernio.
  useEffect(() => {
    document.body.classList.add("zernio-app");
    return () => document.body.classList.remove("zernio-app");
  }, []);

  return (
    <>
      <ZernioToolbar
        view={view}
        pendingCount={0}
        historicoCount={0}
        onViewChange={setView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="zernio-body">
        <ZernioSidebar />

        {/* ═══ LIST CENTRAL ═══ */}
        <main className="zpanel zlist">
          <span className="br-tr"></span>
          <span className="br-bl"></span>

          <header className="zlist-head">
            <div className="ttl">
              <span className="ix">04</span>
              <span>{view === "inbox" ? "Inbox" : "Histórico"}</span>
            </div>
            <span className={`big${view === "inbox" ? " acc" : ""}`}>
              0
              <small>{view === "inbox" ? "pendientes" : "decididas"}</small>
            </span>
            <div className="sort">
              {view === "inbox" ? (
                <>
                  <button type="button" className="chip on" disabled>
                    Más recientes
                  </button>
                  <button type="button" className="chip" disabled>
                    Más calientes
                  </button>
                  <button type="button" className="chip" disabled>
                    Mayor confianza
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="chip on" disabled>
                    Todas
                  </button>
                  <button type="button" className="chip" disabled>
                    Enroladas
                  </button>
                  <button type="button" className="chip" disabled>
                    Descartadas
                  </button>
                  <button type="button" className="chip" disabled>
                    Otras
                  </button>
                  <button type="button" className="chip" disabled>
                    7D
                  </button>
                </>
              )}
            </div>
          </header>

          <ZernioInboxZero
            desc={
              view === "inbox"
                ? undefined // usa default
                : "Sin decisiones registradas todavía. Las notificaciones que proceses aparecerán aquí con su estado final."
            }
          />
        </main>

        {/* ═══ DETAIL ═══ */}
        <aside className="zpanel zdetail">
          <span className="br-tr"></span>
          <span className="br-bl"></span>
          <div className="zdetail-empty">
            <div className="ix">05</div>
            <div className="ttl">Sin selección</div>
            <div className="desc">
              Selecciona una notificación de la lista para ver el contacto,
              el DM, el razonamiento de la IA y las acciones disponibles.
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
