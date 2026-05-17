/**
 * Utilidades para fechas y horas en los modales.
 *
 * Por qué existe `snapTo5Min`:
 *   El input <input type="datetime-local"> acepta el atributo `step="300"`
 *   (segundos), que en Chrome/Edge fuerza al time picker a saltar de 5 en
 *   5 minutos. Pero Safari ignora `step` para datetime-local — el user
 *   puede escoger 18:28 y queda 18:28.
 *
 *   Solución: redondeamos en JS el valor que viene del onChange al
 *   múltiplo de 5 más cercano. Coste: si el user pone 18:28, le aparece
 *   18:30 automáticamente. A cambio, los tres formatos visuales que
 *   produce el browser (Chrome, Firefox, Safari) acaban produciendo el
 *   mismo valor predecible.
 */

/**
 * Redondea una fecha al múltiplo de 5 minutos más cercano.
 * Recibe Date, string ISO o string "YYYY-MM-DDTHH:MM" (lo que da el input).
 * Devuelve un Date con segundos y ms a 0.
 *
 * Si la entrada es inválida o vacía, devuelve null.
 */
export function snapTo5Min(value) {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (isNaN(d.getTime())) return null;
  const min = d.getMinutes();
  const rounded = Math.round(min / 5) * 5;
  d.setMinutes(rounded, 0, 0);
  return d;
}

/**
 * Formatea un Date al formato que espera `<input type="datetime-local">`:
 * "YYYY-MM-DDTHH:MM" en hora LOCAL del usuario (sin zona horaria).
 *
 * Si el input es inválido, devuelve "".
 */
export function toDatetimeLocal(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
