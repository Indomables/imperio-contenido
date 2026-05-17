import type { Context, Config } from "@netlify/functions";
import { eq, desc } from "drizzle-orm";
import { db } from "../lib/db.js";
import { ideas } from "../lib/schema.js";
import {
  json,
  noContent,
  notFound,
  badRequest,
  methodNotAllowed,
  serverError,
  getPathSegments,
} from "../lib/responses.js";

/**
 * CRUD de ideas:
 *   GET    /api/ideas         → listar todas (ordenadas por creación DESC)
 *   GET    /api/ideas/:id     → obtener una
 *   POST   /api/ideas         → crear (body: { titulo, notas?, notas_internas? })
 *   PATCH  /api/ideas/:id     → editar
 *   DELETE /api/ideas/:id     → borrar
 */
export default async (req: Request, _context: Context) => {
  const segments = getPathSegments(req.url);
  // segments = ["ideas"] o ["ideas", "<id>"]
  const id = segments[1];

  try {
    switch (req.method) {
      case "GET": {
        if (id) {
          const rows = await db.select().from(ideas).where(eq(ideas.id, id));
          return rows.length ? json(rows[0]) : notFound();
        }
        const rows = await db
          .select()
          .from(ideas)
          .orderBy(desc(ideas.createdAt));
        return json(rows);
      }

      case "POST": {
        const body = await req.json();
        if (!body.titulo || typeof body.titulo !== "string") {
          return badRequest("titulo es requerido");
        }
        const rows = await db
          .insert(ideas)
          .values({
            titulo: body.titulo,
            notas: body.notas ?? "",
            notasInternas: body.notas_internas ?? body.notasInternas ?? "",
          })
          .returning();
        return json(rows[0], 201);
      }

      case "PATCH": {
        if (!id) return badRequest("id requerido en la URL");
        const body = await req.json();
        const update: Record<string, unknown> = {};
        if (body.titulo !== undefined) update.titulo = body.titulo;
        if (body.notas !== undefined) update.notas = body.notas;
        if (body.notas_internas !== undefined) update.notasInternas = body.notas_internas;
        if (body.notasInternas !== undefined) update.notasInternas = body.notasInternas;

        if (Object.keys(update).length === 0) {
          return badRequest("Sin campos para actualizar");
        }

        const rows = await db
          .update(ideas)
          .set(update)
          .where(eq(ideas.id, id))
          .returning();
        return rows.length ? json(rows[0]) : notFound();
      }

      case "DELETE": {
        if (!id) return badRequest("id requerido en la URL");
        const rows = await db.delete(ideas).where(eq(ideas.id, id)).returning();
        return rows.length ? noContent() : notFound();
      }

      default:
        return methodNotAllowed(req.method);
    }
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: ["/api/ideas", "/api/ideas/*"],
};
