/**
 * Cliente de DB para todas las Functions.
 *
 * Usa @netlify/database, el módulo oficial. La connection string
 * la inyecta Netlify automáticamente en runtime — no hay nada
 * que configurar ni env vars que setear manualmente.
 *
 * Uso:
 *   import { db } from "../lib/db.js";
 *   const rows = await db.sql`SELECT * FROM ideas WHERE id = ${id}`;
 *
 * db.sql es tagged template literal: los valores se parametrizan
 * automáticamente, así que es seguro contra SQL injection.
 */

import { getDatabase } from "@netlify/database";

export const db = getDatabase();
