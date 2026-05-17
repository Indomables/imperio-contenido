# CHANGELOG

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
