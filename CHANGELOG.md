# CHANGELOG

## Fase 3B · Pulido visual · v0.44.1-α (2026-05-17)

**Hito**: Análisis llega al nivel visual de Claude Design — benchmarks contextuales en KPIs y micro-bars de colores en columnas porcentuales.

### Añadido
- **Benchmarks del sector** ajustables en `Analisis.jsx` (constante `BENCHMARKS`):
  - `tasa_apertura`: good ≥ 33% · bad < 25% (estándar email marketing).
  - `tasa_clics`: good ≥ 3% · bad < 1%.
  - `tasa_bajas`: good ≤ 0.1% · bad ≥ 1% · `inverse: true` (bajo = bueno).
- **Sublíneas de KPI con color y semántica**:
  - "↑ por encima del sector" (verde) si media supera el threshold `good`.
  - "≈ benchmark sector" (amarillo) si está en zona normal.
  - "↓ por debajo del sector" (rojo) si está bajo `bad`.
  - "últimos N días" / "suma del periodo" / "media del periodo" según el tipo de KPI.
- **Micro-bars coloreadas** en celdas `% Apertura`, `% Clics`, `% Bajas`:
  - Verde (`.above`) · Amarillo (default) · Rojo (`.below`) · Gris (`.mute`).
  - Ancho escalado al **max de la columna en el periodo** (las bajas <1% siguen siendo visibles).
  - 0% se trata como `mute` (no es rendimiento medible).
- Hora de publicación (HH:mm) junto a la fecha en `.title-col .when`.

### Cambiado
- Eliminada la columna **Fecha** del final de la tabla (redundante con la fecha bajo el título).

### Pendiente para próxima iteración
- **StatusBar contextual**: la Claude Design muestra info de la pestaña activa abajo
  ("FILTRO EMAIL · 90D · FILAS 9 · BENCHMARK ≈ SECTOR · ATRIBUCIÓN OK"). La nuestra
  muestra info global. Requiere refactor con contexto React — pendiente.

---

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
