import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
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
 *   GET    /api/ideas         → listar (más recientes primero)
 *   GET    /api/ideas/:id     → obtener una
 *   POST   /api/ideas         → crear { titulo, notas?, notas_internas? }
 *   PATCH  /api/ideas/:id     → editar (parcial)
 *   DELETE /api/ideas/:id     → borrar
 */
export default async (req: Request, _context: Context) => {
  const segments = getPathSegments(req.url);
  const id = segments[1];

  try {
    switch (req.method) {
      case "GET": {
        if (id) {
          const rows = await db.sql`SELECT * FROM ideas WHERE id = ${id}`;
          return rows.length ? json(rows[0]) : notFound();
        }
        const rows = await db.sql`
          SELECT * FROM ideas ORDER BY created_at DESC
        `;
        return json(rows);
      }

      case "POST": {
        const body = await req.json();
        if (!body.titulo || typeof body.titulo !== "string") {
          return badRequest("titulo es requerido");
        }
        const titulo = body.titulo;
        const notas = body.notas ?? "";
        const notasInternas = body.notas_internas ?? body.notasInternas ?? "";

        const [row] = await db.sql`
          INSERT INTO ideas (titulo, notas, notas_internas)
          VALUES (${titulo}, ${notas}, ${notasInternas})
          RETURNING *
        `;
        return json(row, 201);
      }

      case "PATCH": {
        if (!id) return badRequest("id requerido en la URL");
        const body = await req.json();

        const [existing] = await db.sql`
          SELECT * FROM ideas WHERE id = ${id}
        `;
        if (!existing) return notFound();

        const titulo = body.titulo !== undefined ? body.titulo : existing.titulo;
        const notas = body.notas !== undefined ? body.notas : existing.notas;
        const notasInternas =
          body.notas_internas !== undefined
            ? body.notas_internas
            : body.notasInternas !== undefined
              ? body.notasInternas
              : existing.notas_internas;

        const [row] = await db.sql`
          UPDATE ideas
          SET titulo = ${titulo},
              notas = ${notas},
              notas_internas = ${notasInternas},
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
        return json(row);
      }

      case "DELETE": {
        if (!id) return badRequest("id requerido en la URL");
        const rows = await db.sql`
          DELETE FROM ideas WHERE id = ${id} RETURNING id
        `;
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
