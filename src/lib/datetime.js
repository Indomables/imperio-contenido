/**
 * Utilidades para mostrar fechas en los modales.
 *
 * Antes vivía aquí `snapTo5Min`, que redondeaba el valor del
 * `<input type="datetime-local">` nativo al múltiplo de 5 más cercano
 * para compensar que Safari ignoraba `step="300"`. Ya no es necesario:
 * los modales usan `DateTimePicker` custom (handoff Claude Design)
 * que solo permite minutos en pasos de 5 desde el origen.
 */

/**
 * Formatea un Date a "DD / MM / YYYY · HH:MM" en hora LOCAL.
 * Usado para mostrar fechas en los triggers del DateTimePicker.
 *
 * Acepta Date, ISO string o falsy. Si la entrada es inválida o vacía,
 * devuelve "".
 */
export function formatDateTimeLocal(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} / ${pad(d.getMonth() + 1)} / ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
