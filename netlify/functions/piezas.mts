import type { Context, Config } from "@netlify/functions";
import { eq, desc, and, type SQL } from "drizzle-orm";
import { db } from "../lib/db.js";
import { piezas, FORMATOS, COLUMNAS, type Formato, type Columna } from "../lib/schema.js";
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
 * CRUD de piezas:
 *   GET    /api/piezas                  → listar (con filtros ?columna=, ?formato=)
 *   GET    /api/piezas/:id              → obtener una
 *   POST   /api/piezas                  → crear
 *   PATCH  /api/piezas/:id              → editar
 *   POST   /api/piezas/:id/move         → cambiar de carril { columna: "..." }
 *   DELETE /api/piezas/:id              → borrar
 */
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const segments = getPathSegments(req.url);
  // segments = ["piezas"] | ["piezas", "<id>"] | ["piezas", "<id>", "move"]
  const id = segments[1];
  const action = segments[2];

  try {
    // ── POST /api/piezas/:id/move ───────────────────────
    if (req.method === "POST" && action === "move") {
      if (!id) return badRequest("id requerido");
      const body = await req.json();
      const columna = body.columna as Columna | undefined;
      if (!columna || !COLUMNAS.includes(columna)) {
        return badRequest(
          `columna debe ser una de: ${COLUMNAS.join(", ")}`
        );
      }
      const rows = await db
        .update(piezas)
        .set({ columna })
        .where(eq(piezas.id, id))
        .returning();
      return rows.length ? json(rows[0]) : notFound();
    }

    // ── GET ─────────────────────────────────────────────
    if (req.method === "GET") {
      if (id) {
        const rows = await db.select().from(piezas).where(eq(piezas.id, id));
        return rows.length ? json(rows[0]) : notFound();
      }

      const filters: SQL[] = [];
      const columna = url.searchParams.get("columna");
      const formato = url.searchParams.get("formato");
      if (columna) {
        if (!COLUMNAS.includes(columna as Columna)) {
          return badRequest(`columna inválida: ${columna}`);
        }
        filters.push(eq(piezas.columna, columna));
      }
      if (formato) {
        if (!FORMATOS.includes(formato as Formato)) {
          return badRequest(`formato inválido: ${formato}`);
        }
        filters.push(eq(piezas.formato, formato));
      }

      const rows = filters.length
        ? await db
            .select()
            .from(piezas)
            .where(and(...filters))
            .orderBy(desc(piezas.updatedAt))
        : await db.select().from(piezas).orderBy(desc(piezas.updatedAt));

      return json(rows);
    }

    // ── POST /api/piezas (crear) ────────────────────────
    if (req.method === "POST") {
      const body = await req.json();
      if (!body.titulo || typeof body.titulo !== "string") {
        return badRequest("titulo es requerido");
      }
      if (!body.formato || !FORMATOS.includes(body.formato)) {
        return badRequest(`formato debe ser uno de: ${FORMATOS.join(", ")}`);
      }
      const columna: Columna = body.columna ?? "desarrollo";
      if (!COLUMNAS.includes(columna)) {
        return badRequest(`columna debe ser una de: ${COLUMNAS.join(", ")}`);
      }

      const rows = await db
        .insert(piezas)
        .values({
          ideaId: body.idea_id ?? body.ideaId ?? null,
          titulo: body.titulo,
          formato: body.formato,
          columna,
          contenido: body.contenido ?? {},
          fechaPublicacion: body.fecha_publicacion
            ? new Date(body.fecha_publicacion)
            : null,
          plataformas: body.plataformas ?? [],
          urlPublicacion: body.url_publicacion ?? "",
          notas: body.notas ?? "",
          tematica: body.tematica ?? "",
        })
        .returning();
      return json(rows[0], 201);
    }

    // ── PATCH ───────────────────────────────────────────
    if (req.method === "PATCH") {
      if (!id) return badRequest("id requerido");
      const body = await req.json();
      const update: Record<string, unknown> = {};

      if (body.titulo !== undefined) update.titulo = body.titulo;
      if (body.formato !== undefined) {
        if (!FORMATOS.includes(body.formato)) return badRequest("formato inválido");
        update.formato = body.formato;
      }
      if (body.columna !== undefined) {
        if (!COLUMNAS.includes(body.columna)) return badRequest("columna inválida");
        update.columna = body.columna;
      }
      if (body.contenido !== undefined) update.contenido = body.contenido;
      if (body.fecha_publicacion !== undefined) {
        update.fechaPublicacion = body.fecha_publicacion
          ? new Date(body.fecha_publicacion)
          : null;
      }
      if (body.plataformas !== undefined) update.plataformas = body.plataformas;
      if (body.url_publicacion !== undefined) update.urlPublicacion = body.url_publicacion;
      if (body.notas !== undefined) update.notas = body.notas;
      if (body.tematica !== undefined) update.tematica = body.tematica;
      if (body.idea_id !== undefined) update.ideaId = body.idea_id;

      if (Object.keys(update).length === 0) {
        return badRequest("Sin campos para actualizar");
      }

      const rows = await db
        .update(piezas)
        .set(update)
        .where(eq(piezas.id, id))
        .returning();
      return rows.length ? json(rows[0]) : notFound();
    }

    // ── DELETE ──────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!id) return badRequest("id requerido");
      const rows = await db.delete(piezas).where(eq(piezas.id, id)).returning();
      return rows.length ? noContent() : notFound();
    }

    return methodNotAllowed(req.method);
  } catch (err) {
    return serverError(err);
  }
};

export const config: Config = {
  path: ["/api/piezas", "/api/piezas/*"],
};
