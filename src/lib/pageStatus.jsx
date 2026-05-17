/**
 * PageStatusContext — cada página puede reportar info contextual que la
 * StatusBar global mostrará en lugar de los defaults.
 *
 * Permite que la statusbar inferior cambie según la pestaña activa, igual
 * que en la maqueta de Claude Design:
 *   ANÁLISIS · RENDIMIENTO · FILTRO EMAIL · 90D · FILAS 9 · BENCHMARK ≈ SECTOR ...
 *
 * Estructura esperada del status:
 *
 *   {
 *     left:  [{ text: "ANÁLISIS · ", strong: "RENDIMIENTO" }, ...],
 *     right: [{ text: "BENCHMARK ", strong: "≈ SECTOR",
 *               strongStyle: { color: "var(--warn)" } }, ...]
 *   }
 *
 * StatusBar siempre prefija la versión IMPERIO·CONTENIDO y sufija "⌘K · CAPTURA".
 *
 * Cuando una página se desmonta, su status se limpia automáticamente — la
 * StatusBar vuelve a los defaults.
 */

import { createContext, useContext, useState, useEffect } from "react";

const PageStatusContext = createContext({
  status: null,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setStatus: () => {},
});

export function PageStatusProvider({ children }) {
  const [status, setStatus] = useState(null);
  return (
    <PageStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </PageStatusContext.Provider>
  );
}

/** Hook de lectura (lo usa StatusBar). */
export function usePageStatusValue() {
  return useContext(PageStatusContext).status;
}

/**
 * Hook de escritura (lo usan las páginas).
 *
 * Uso:
 *   const status = useMemo(() => ({ left: [...], right: [...] }), [deps]);
 *   usePageStatus(status);
 *
 * El status se limpia al desmontar la página para que la StatusBar vuelva
 * a los defaults.
 */
export function usePageStatus(status) {
  const { setStatus } = useContext(PageStatusContext);
  useEffect(() => {
    setStatus(status);
    return () => setStatus(null);
  }, [setStatus, status]);
}
