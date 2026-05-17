/**
 * Helpers compartidos de respuestas HTTP.
 * Todas las Functions usan estos para consistencia.
 */

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const noContent = () => new Response(null, { status: 204 });

export const notFound = (msg = "Not found") => json({ error: msg }, 404);

export const badRequest = (msg: string) => json({ error: msg }, 400);

export const methodNotAllowed = (method: string) =>
  json({ error: `Método ${method} no permitido en este endpoint` }, 405);

export const serverError = (err: unknown) => {
  console.error("[function error]", err);
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: message }, 500);
};

/**
 * Extrae los segmentos del path después de /api/
 * Ej: /api/piezas/abc/move → ["piezas", "abc", "move"]
 */
export function getPathSegments(reqUrl: string): string[] {
  const u = new URL(reqUrl);
  const parts = u.pathname.split("/").filter(Boolean);
  // Saltamos el segmento "api"
  const apiIdx = parts.indexOf("api");
  return apiIdx >= 0 ? parts.slice(apiIdx + 1) : parts;
}
