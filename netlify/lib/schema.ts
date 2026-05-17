/**
 * Constantes de validación de dominio.
 *
 * Mantenidas en sync con los CHECK constraints de la migración SQL
 * (netlify/database/migrations/0000_baseline/migration.sql).
 */

export const FORMATOS = [
  "email",
  "reel",
  "relampago",
  "youtube",
  "grieta",
] as const;
export type Formato = (typeof FORMATOS)[number];

export const COLUMNAS = [
  "desarrollo",
  "listo",
  "agendado",
  "publicado",
] as const;
export type Columna = (typeof COLUMNAS)[number];

export const isFormato = (v: unknown): v is Formato =>
  typeof v === "string" && (FORMATOS as readonly string[]).includes(v);

export const isColumna = (v: unknown): v is Columna =>
  typeof v === "string" && (COLUMNAS as readonly string[]).includes(v);
