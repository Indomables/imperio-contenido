import type { Context, Config } from "@netlify/functions";
import { db } from "../lib/db.js";
import {
  FORMATOS,
  COLUMNAS,
  isFormato,
  isColumna,
} from "../lib/schema.js";
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
 *   GET    /api/piezas                  → listar (filtros ?columna=, ?formato=)
 *   GET    /api/piezas/:id              → obtener una
 *   POST   /api/piezas                  → crear
 *   PATCH  /api/piezas/:id              → editar
 *   POST   /api/piezas/:id/move         → cambiar carril { columna }
 *   DELETE /api/piezas/:id              → borrar
 */
export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const segments = getPathSegments(req.url);
  const id = segments[1];
  const action = segments[2];

  try {
    // ── POST /api/piezas/:id/move ───────────────────────
    if (req.method === "POST" && action === "move") {
      if (!id) return badRequest("id requerido");
      const body = await req.json();
      if (!isColumna(body.columna)) {
        return badRequest(`columna debe ser una de: ${COLUMNAS.join(", ")}`);
      }
      const [row] = await db.sql`
        UPDATE piezas
        SET columna = ${body.columna}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ? json(row) : notFound();
    }

    // ── GET ─────────────────────────────────────────────
    if (req.method === "GET") {
      if (id) {
        const rows = await db.sql`SELECT * FROM piezas WHERE id = ${id}`;
        return rows.length ? json(rows[0]) : notFound();
      }

      const columna = url.searchParams.get("columna");
      const formato = url.searchParams.get("formato");

      if (columna && !isColumna(columna)) {
        return badRequest(`columna inválida: ${columna}`);
      }
      if (formato && !isFormato(formato)) {
        return badRequest(`formato inválido: ${formato}`);
      }

      // Filtros combinados — todos opcionales
      const rows = await db.sql`
        SELECT * FROM piezas
        WHERE
          (${columna ?? null}::text IS NULL OR columna = ${columna ?? null}::text)
          AND
          (${formato ?? null}::text IS NULL OR formato = ${formato ?? null}::text)
        ORDER BY updated_at DESC
      `;
      return json(rows);
    }

    // ── POST /api/piezas (crear) ────────────────────────
    if (req.method === "POST") {
      const body = await req.json();
      if (!body.titulo || typeof body.titulo !== "string") {
        return badRequest("titulo es requerido");
      }
      if (!isFormato(body.formato)) {
        return badRequest(`formato debe ser uno de: ${FORMATOS.join(", ")}`);
      }
      const columna = body.columna ?? "desarrollo";
      if (!isColumna(columna)) {
        return badRequest(`columna debe ser una de: ${COLUMNAS.join(", ")}`);
      }

      const ideaId = body.idea_id ?? body.ideaId ?? null;
      const contenido = body.contenido ?? {};
      // "" → null para fecha_publicacion (evita ERROR cast a TIMESTAMP)
      const rawFecha = body.fecha_publicacion ?? null;
      const fechaPublicacion = rawFecha === "" ? null : rawFecha;
      const plataformas = body.plataformas ?? [];
      const urlPublicacion = body.url_publicacion ?? "";
      const notas = body.notas ?? "";
      const tematica = body.tematica ?? "";

      const [row] = await db.sql`
        INSERT INTO piezas (
          idea_id, titulo, formato, columna, contenido,
          fecha_publicacion, plataformas, url_publicacion, notas, tematica
        ) VALUES (
          ${ideaId}, ${body.titulo}, ${body.formato}, ${columna},
          ${JSON.stringify(contenido)}::jsonb,
          ${fechaPublicacion}, ${plataformas}, ${urlPublicacion}, ${notas}, ${tematica}
        )
        RETURNING *
      `;
      return json(row, 201);
    }

    // ── PATCH ───────────────────────────────────────────
    if (req.method === "PATCH") {
      if (!id) return badRequest("id requerido");
      const body = await req.json();

      const [existing] = await db.sql`SELECT * FROM piezas WHERE id = ${id}`;
      if (!existing) return notFound();

      // Validaciones de campos que pueden venir
      if (body.formato !== undefined && !isFormato(body.formato)) {
        return badRequest("formato inválido");
      }
      if (body.columna !== undefined && !isColumna(body.columna)) {
        return badRequest("columna inválida");
      }

      // Merge: usa el valor nuevo si viene definido, si no el actual
      const titulo =
        body.titulo !== undefined ? body.titulo : existing.titulo;
      const formato =
        body.formato !== undefined ? body.formato : existing.formato;
      const columna =
        body.columna !== undefined ? body.columna : existing.columna;
      const contenido =
        body.contenido !== undefined ? body.contenido : existing.contenido;
      // fecha_publicacion: si viene como "" (string vacía) la tratamos como null
      // para que no falle el cast TIMESTAMP en PostgreSQL.
      const rawFecha =
        body.fecha_publicacion !== undefined
          ? body.fecha_publicacion
          : existing.fecha_publicacion;
      const fechaPublicacion = rawFecha === "" ? null : rawFecha;
      const plataformas =
        body.plataformas !== undefined
          ? body.plataformas
          : existing.plataformas;
      const urlPublicacion =
        body.url_publicacion !== undefined
          ? body.url_publicacion
          : existing.url_publicacion;
      const notas = body.notas !== undefined ? body.notas : existing.notas;
      const tematica =
        body.tematica !== undefined ? body.tematica : existing.tematica;
      const ideaId =
        body.idea_id !== undefined ? body.idea_id : existing.idea_id;
      // Kit broadcast ID — se setea desde la UI cuando la pieza email se
      // agenda en Kit. Puede ser el ID "legacy" que ve Soma en la URL de Kit;
      // auto-publish.mts lo normalizará al ID real del broadcast en su próximo run.
      // "" → null para mantener convención de "no vinculado".
      const rawKitId =
        body.kit_broadcast_id !== undefined
          ? body.kit_broadcast_id
          : existing.kit_broadcast_id;
      const kitBroadcastId = rawKitId === "" ? null : rawKitId;

      const [row] = await db.sql`
        UPDATE piezas SET
          idea_id = ${ideaId},
          titulo = ${titulo},
          formato = ${formato},
          columna = ${columna},
          contenido = ${JSON.stringify(contenido)}::jsonb,
          fecha_publicacion = ${fechaPublicacion},
          plataformas = ${plataformas},
          url_publicacion = ${urlPublicacion},
          notas = ${notas},
          tematica = ${tematica},
          kit_broadcast_id = ${kitBroadcastId},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return json(row);
    }

    // ── DELETE ──────────────────────────────────────────
    if (req.method === "DELETE") {
      if (!id) return badRequest("id requerido");
      const rows = await db.sql`
        DELETE FROM piezas WHERE id = ${id} RETURNING id
      `;
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
