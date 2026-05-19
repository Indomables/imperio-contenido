/**
 * zernio-api.ts — Wrappers ligeros sobre la API REST de Zernio.
 *
 * Endpoints usados desde la Function de webhook:
 *   - GET  /contacts/{id}        : leer tags actuales del contacto
 *   - PATCH /contacts/{id}       : actualizar tags (regla: array sustituye, no acumula)
 *
 * NOTA: el MCP de Zernio tiene un bug conocido con `contacts.update_contact`
 * que devuelve 500 ("'Zernio' object has no attribute '_patch'"). La API
 * REST directa (la que usamos aquí) funciona correctamente.
 */

const ZERNIO_BASE = "https://zernio.com/api/v1";

export type ZernioContact = {
  id: string;
  tags: string[];
  // Otros campos los ignoramos por ahora; Zernio devuelve más pero no los
  // necesitamos para etiquetar.
};

/**
 * Lee el contacto de Zernio. Devuelve null si no existe (404) o si hay error
 * de red; el caller decide qué hacer (idealmente: log y abortar etiquetado
 * sin romper el procesamiento de la notif).
 */
export async function getContact(
  contactId: string,
  apiKey: string,
): Promise<ZernioContact | null> {
  const resp = await fetch(`${ZERNIO_BASE}/contacts/${contactId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (resp.status === 404) return null;
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(
      `Zernio GET contact ${contactId} failed: ${resp.status} ${txt.slice(0, 200)}`,
    );
  }

  const body = (await resp.json()) as any;
  return {
    id: body.id ?? contactId,
    tags: Array.isArray(body.tags) ? body.tags : [],
  };
}

/**
 * Añade tags a un contacto en Zernio. Internamente:
 *   1. GET del contacto para leer tags actuales.
 *   2. Merge (unión) de los tags actuales con los nuevos (sin duplicados).
 *   3. PATCH con el array completo.
 *
 * Importante: la API de Zernio espera el array COMPLETO en PATCH, no un
 * delta. Por eso hay que leer primero y mergear.
 */
export async function addTagsToContact(
  contactId: string,
  newTags: string[],
  apiKey: string,
): Promise<{ before: string[]; after: string[] }> {
  const existing = await getContact(contactId, apiKey);
  const before = existing?.tags ?? [];

  // Merge sin duplicados, preservando orden de los existentes + nuevos al final
  const set = new Set(before);
  for (const t of newTags) {
    if (t && typeof t === "string") set.add(t);
  }
  const after = Array.from(set);

  // Si no hay cambios, ahorramos un PATCH
  if (before.length === after.length && before.every((t, i) => t === after[i])) {
    return { before, after };
  }

  const resp = await fetch(`${ZERNIO_BASE}/contacts/${contactId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ tags: after }),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(
      `Zernio PATCH contact ${contactId} failed: ${resp.status} ${txt.slice(0, 200)}`,
    );
  }

  return { before, after };
}
