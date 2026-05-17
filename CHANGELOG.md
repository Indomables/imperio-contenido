# CHANGELOG

## Fase 3B · Análisis funcional · v0.44.0-α (2026-05-17)

**Hito**: la pestaña Análisis muestra datos reales. Filtros por periodo y tipo, KPIs y tabla dinámicos según el formato seleccionado, headers sortable.

### Añadido
- `GET /api/metricas` (listado masivo) — antes solo existía `GET /api/metricas/:piezaId`.
- `metricas.all()` en el cliente `lib/api.js`.
- `Analisis.jsx` reescrito:
  - Configuración declarativa por formato (`FORMATO_CONFIG`) con sus KPIs y columnas.
  - Email · KPIs: Emails publicados, Apertura media, Clic medio, Revenue atribuido. Columnas: Enviados / Aperturas / %Apertura / Clics / %Clics / Replies / Bajas / %Bajas / Revenue (€).
  - Reel y Grieta · KPIs: count, likes medios, comentarios medios, miembros Skool. Columnas: Likes / Comentarios / Miembros Skool.
  - YouTube · KPIs: count, views medias, likes medios, comentarios medios. Columnas: Views / Likes / Comentarios.
  - Relámpago · estructura preparada, datos vendrán con la edge function correspondiente.
  - Filtros por periodo: 30d / 90d / 6m / Todo. Aplican sobre `fecha_publicacion`.
  - Solo cuenta piezas publicadas (`fecha_publicacion` ≤ hoy).
  - Headers sortable: 1 click desc → 2 click asc → 3 click reset.
  - Contadores en los chips de tipo (reflejan el periodo activo).
  - Click en fila abre `CardModal` igual que en Tablero.

### Pendiente
- Replies y Revenue (€) para Email — son métricas manuales gestionadas desde chat. Las columnas existen, mostrarán `—` hasta que las metas.
- Datos de YouTube y Relámpago — vienen cuando se porten las edge functions.
- Drag & drop entre carriles del Tablero (Fase 3A pendiente).
- Dashboard real (Fase 3C).

---

## Fase 1 · Cimientos · v0.42.0-alpha (2026-05-17)

**Hito**: scaffold completo. La app despliega y muestra la estética SOMA OS aunque sin datos reales.

### Añadido
- Proyecto React + Vite con `@netlify/vite-plugin`.
- `netlify.toml` con redirect SPA → `index.html`.
- Sistema visual completo: `soma.css` + `contenido.css` + `dashboard.css` + `analisis.css`.
- Fuentes Geist + Geist Mono vía Google Fonts; JetBrains Mono local como fallback.
- Routing entre Dashboard, Tablero y Análisis.
- Boot screen animado con secuencia de carga.
- TopNav, StatusLine y StatusBar con reloj en vivo.
- TweaksPanel funcional (motion / density / type / accent / audio).
- Hook `useClock` para reloj y uptime.
- Utilidad `audio.beep()` para sonidos UI.
- Cliente `api.js` con stubs para todas las operaciones futuras.
- Health check function en `/api/health`.
- Baseline migration con las 5 tablas + 'grieta' añadido al enum de formato.

### Pendiente (siguientes fases)
- Fase 2 · Backend
  - CRUD de ideas, piezas, métricas, settings (Netlify Functions)
  - Portar las 6 edge functions de Supabase como Scheduled Functions
  - Importar datos actuales desde Supabase
  - Activar password protection del site
- Fase 3 · Pantallas reales
  - Tablero completo con cards, filtros y capture bar funcional
  - Dashboard completo con todos los paneles
  - Análisis con tabla sortable y KPIs en vivo
- Fase 4 · Cutover
  - Validación en preview deploy
  - Cutover de producción
  - Decomisionar Supabase
