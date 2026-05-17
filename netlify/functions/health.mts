import type { Context, Config } from "@netlify/functions";

/**
 * Health check — útil para verificar que las Functions están desplegadas.
 * En Fase 2 añadiremos el CRUD real (ideas, piezas, metricas, etc.).
 */
export default async (req: Request, context: Context) => {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "imperio-contenido",
      version: "0.42.0-alpha",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

export const config: Config = {
  path: "/api/health",
};
