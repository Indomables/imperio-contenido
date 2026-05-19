/**
 * zernio-rules.ts — Reglas duras del flujo automatizado de Zernio.
 *
 * Las reglas completas viven en el skill `zernio-imperio`. Aquí solo se
 * aplican las que la Function de webhook puede comprobar por sí sola al
 * recibir un DM (las otras se aplican en el Bloque C cuando Soma decide).
 *
 * Reglas aplicables aquí:
 *   - Regla 4: si confianza < 0.5 → no notificar a Soma, etiquetar el
 *     contacto como "requiere-revision" en Zernio (queda en logs, Soma
 *     puede revisar si quiere).
 *   - Regla 5: si el interés ya es "sin-interes" o "requiere-revision",
 *     no se crea notificación visible (el contacto sí se etiqueta).
 *
 * El resto de reglas (no enrolar a cliente del mismo producto, no enrolar
 * si está en otra sequence, etc.) se aplican en el momento en que Soma
 * decide enrolar desde la UI — esa lógica va en el Bloque C.
 */

import type { Classification } from "./zernio-classify.js";

export type RuleVerdict = {
  /** Si true, se crea la notificación visible para Soma. */
  createNotification: boolean;
  /** Tags que la Function debe aplicar al contacto en Zernio (origen + temp + interés + extras). */
  tagsToApply: string[];
  /** Razón legible del veredicto, queda en zernio_acciones para auditoría. */
  motivo: string;
};

const TEMP_TAG: Record<string, string> = {
  frio: "frio",
  tibio: "tibio",
  caliente: "caliente",
};

/**
 * Decide qué hacer con una clasificación recién emitida por Claude.
 * No toca BD ni Zernio aquí — solo devuelve el veredicto.
 */
export function applyRules(c: Classification): RuleVerdict {
  // Etiquetas base: origen + temperatura + interés
  const baseTags: string[] = ["ig-dm"];
  if (TEMP_TAG[c.temperatura]) baseTags.push(TEMP_TAG[c.temperatura]);
  if (c.interes_sugerido) baseTags.push(c.interes_sugerido);

  // Regla 4: confianza < 0.5 → no notificar, etiquetar como requiere-revision
  if (c.confianza < 0.5) {
    return {
      createNotification: false,
      tagsToApply: ["ig-dm", "requiere-revision"],
      motivo: `Confianza ${c.confianza.toFixed(2)} < 0.5 — etiqueta requiere-revision sin crear notificación`,
    };
  }

  // Regla 5 (parcial): interés explícito "requiere-revision" → no notificar
  if (c.interes_sugerido === "requiere-revision") {
    return {
      createNotification: false,
      tagsToApply: ["ig-dm", "requiere-revision"],
      motivo: "Interés clasificado como requiere-revision",
    };
  }

  // Caso normal: crear notificación, etiquetar con base
  return {
    createNotification: true,
    tagsToApply: baseTags,
    motivo: `Notificación creada · ${c.interes_sugerido} / ${c.temperatura} / conf ${c.confianza.toFixed(2)}`,
  };
}
