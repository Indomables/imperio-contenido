import type { Context, Config } from "@netlify/functions";

export default async (_req: Request, _ctx: Context) => {
  const url = process.env.NETLIFY_DB_URL ?? "(NETLIFY_DB_URL no está)";
  return new Response(url, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

export const config: Config = {
  path: ["/api/dbstring"],
};
