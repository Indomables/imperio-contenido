/**
 * Cliente Drizzle conectado a Netlify Database.
 *
 * Las credenciales (NETLIFY_DATABASE_URL) las inyecta Netlify
 * automáticamente en runtime. No hay que configurar nada.
 */

import { drizzle } from "drizzle-orm/netlify-db";
import * as schema from "./schema.js";

export const db = drizzle({ schema });
