/**
 * /api/health — chequea estado del servicio + dependencias externas.
 *
 * v0.62 · Antes devolvía `{status: "ok"}` estático. Ahora hace pings
 * reales a Kit (GET /v4/account) y a Zernio (GET /v1/contacts?per_page=1)
 * para que los badges del TopNav reflejen estado real, no cosmética.
 *
 * Timeout corto (5s) por dependencia para no bloquear el frontend.
 *
 * Respuesta:
 *   {
 *     status: "ok",
 *     service: "imperio-contenido",
 *     version: "0.62.0-alpha",
 *     timestamp: "...",
 *     kit: { status: "ok" | "error" | "missing-key", code?: number, ms?: number },
 *     zernio: { status: "ok" | "error" | "missing-key", code?: number, ms?: number }
 *   }
 */

import type { Context, Config } from "@netlify/functions";

type DepStatus =
  | { status: "ok"; code: number; ms: number }
  | { status: "error"; code?: number; ms?: number; message?: string }
  | { status: "missing-key" };

const TIMEOUT_MS = 5000;

async function pingWithTimeout(
  url: string,
  headers: Record<string, string>,
): Promise<DepStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers, signal: controller.signal });
    const ms = Date.now() - t0;
    if (r.ok) return { status: "ok", code: r.status, ms };
    return { status: "error", code: r.status, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = (e as Error).name === "AbortError" ? "timeout" : (e as Error).message;
    return { status: "error", ms, message: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function checkKit(): Promise<DepStatus> {
  const key = Netlify.env.get("KIT_API_KEY_V4");
  if (!key) return { status: "missing-key" };
  return pingWithTimeout("https://api.kit.com/v4/account", {
    "X-Kit-Api-Key": key,
    Accept: "application/json",
  });
}

async function checkZernio(): Promise<DepStatus> {
  const key = Netlify.env.get("ZERNIO_API_KEY");
  if (!key) return { status: "missing-key" };
  // Zernio no expone /account público; usamos /contacts con per_page=1
  // como ping ligero — devuelve 200 con un array si la key es válida.
  return pingWithTimeout("https://zernio.com/api/v1/contacts?per_page=1", {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  });
}

export default async (_req: Request, _context: Context) => {
  const [kit, zernio] = await Promise.all([checkKit(), checkZernio()]);

  // El status global es "ok" si AL MENOS el servicio responde — los pings
  // a dependencias se reportan aparte para que el TopNav los pinte de forma
  // diferenciada.
  const out = {
    status: "ok",
    service: "imperio-contenido",
    version: "0.62.0-alpha",
    timestamp: new Date().toISOString(),
    kit,
    zernio,
  };

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Cache pequeño para no machacar las APIs externas si varios clientes
      // refrescan al mismo tiempo. 15s es suficiente para health.
      "Cache-Control": "public, max-age=15",
    },
  });
};

export const config: Config = {
  path: "/api/health",
};
