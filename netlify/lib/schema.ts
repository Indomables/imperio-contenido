/**
 * Esquema Drizzle ORM.
 *
 * Refleja EXACTAMENTE la estructura creada por
 * netlify/database/migrations/0000_baseline/migration.sql
 *
 * Cualquier cambio de schema futuro debe hacerse en una nueva
 * migración SQL primero, y replicarse aquí después.
 */

import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const ideas = pgTable("ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  titulo: text("titulo").notNull().default(""),
  notas: text("notas").default(""),
  notasInternas: text("notas_internas").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const piezas = pgTable("piezas", {
  id: uuid("id").primaryKey().defaultRandom(),
  ideaId: uuid("idea_id").references(() => ideas.id, { onDelete: "set null" }),
  titulo: text("titulo").notNull().default(""),
  formato: text("formato").notNull(),
  columna: text("columna").notNull().default("desarrollo"),
  contenido: jsonb("contenido").default({}),
  fechaPublicacion: timestamp("fecha_publicacion", { withTimezone: true }),
  plataformas: text("plataformas").array().default([]),
  urlPublicacion: text("url_publicacion").default(""),
  notas: text("notas").default(""),
  kitBroadcastId: text("kit_broadcast_id").default(""),
  instagramMediaId: text("instagram_media_id").default(""),
  tematica: text("tematica").default(""),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const metricas = pgTable("metricas", {
  id: uuid("id").primaryKey().defaultRandom(),
  piezaId: uuid("pieza_id")
    .unique()
    .references(() => piezas.id, { onDelete: "cascade" }),
  datos: jsonb("datos").default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const piezaAlias = pgTable("pieza_alias", {
  alias: text("alias").primaryKey(),
  piezaId: uuid("pieza_id")
    .notNull()
    .references(() => piezas.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Constantes de validación
export const FORMATOS = ["email", "reel", "relampago", "youtube", "grieta"] as const;
export type Formato = (typeof FORMATOS)[number];

export const COLUMNAS = ["desarrollo", "listo", "agendado", "publicado"] as const;
export type Columna = (typeof COLUMNAS)[number];
