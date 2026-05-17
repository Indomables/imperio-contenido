import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
import { FORMATOS, isFormato } from "../lib/schema.js";
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
 *   body: { text: "...", tag: "idea" | <formato> }
 *
 * - tag === "idea"      → crea idea con `text` como título
 * - tag in <formatos>   → crea pieza con formato=tag en columna="desarrollo"
 *
 * Responde { kind: "idea" | "pieza", record: {...} }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return methodNotAllowed(req.method);

  try {
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const tag = body.tag ?? "idea";

    if (!text) return badRequest("text es requerido");

    if (tag === "idea") {
      const [row] = await db.sql`
        INSERT INTO ideas (titulo) VALUES (${text}) RETURNING *
      `;
      return json({ kind: "idea", record: row }, 201);
    }

    if (isFormato(tag)) {
      const [row] = await db.sql`
        INSERT INTO piezas (titulo, formato, columna)
        VALUES (${text}, ${tag}, 'desarrollo')
        RETURNING *
      `;
      return json({ kind: "pieza", record: row }, 201);
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
