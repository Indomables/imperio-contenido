import type { Context, Config } from "@netlify/functions";

export default async (_req: Request, _ctx: Context) => {
  // Listamos solo NOMBRES (no valores) de env vars relacionadas con BD
  const allKeys = Object.keys(process.env).sort();
  const dbRelated = allKeys.filter((k) => {
    const lower = k.toLowerCase();
    return (
      lower.includes("database") ||
      lower.includes("postgres") ||
      lower.includes("neon") ||
      lower.includes("netlify_db") ||
      lower === "db_url"
    );
  });

  const body = {
    total_env_vars: allKeys.length,
    db_related_keys: dbRelated,
    all_keys: allKeys,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

export const config: Config = {
  path: ["/api/dbstring"],
};
