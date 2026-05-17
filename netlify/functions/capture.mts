import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
import { ideas, piezas, FORMATOS, type Formato } from "../lib/schema.js";
import {
  json,
  badRequest,
  methodNotAllowed,
  serverError,
} from "../lib/responses.js";

/**
 * Capture rápido desde el capture bar:
 *
 *   POST /api/capture
 *   body: { text: "...", tag: "idea" | "email" | "reel" | ... }
 *
 * Comportamiento:
 *   - tag === "idea"  → crea una idea con el texto como título
 *   - tag in [formatos] → crea una pieza con formato=tag en columna="desarrollo"
 *
 * Responde con { kind: "idea" | "pieza", record: { ... } }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return methodNotAllowed(req.method);

  try {
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const tag = body.tag ?? "idea";

    if (!text) return badRequest("text es requerido");

    if (tag === "idea") {
      const rows = await db
        .insert(ideas)
        .values({ titulo: text })
        .returning();
      return json({ kind: "idea", record: rows[0] }, 201);
    }

    if (FORMATOS.includes(tag as Formato)) {
      const rows = await db
        .insert(piezas)
        .values({
          titulo: text,
          formato: tag,
          columna: "desarrollo",
        })
        .returning();
      return json({ kind: "pieza", record: rows[0] }, 201);
    }

    return badRequest(
      `tag inválido. Permitidos: idea, ${FORMATOS.join(", ")}`
    );
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: "/api/capture",
};
