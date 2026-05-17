# CHANGELOG

## Fase 3A · Tablero clavado a Claude Design · v0.45.0-α (2026-05-17)

**Hito**: Tablero alcanza paridad pixel-perfect con la maqueta de Claude Design tras cotejar HTML + CSS uploadeados por Soma.

### Hallazgo importante
Los CSS (`soma.css` y `contenido.css`) en el repo eran **byte-perfect idénticos**
a los del paquete de Claude Design. El "chasis" estaba completo. Lo que faltaba
era que el JSX **aprovechara** todas las variantes que el CSS ya soportaba.

### Añadido

**TopNav**:
- 4º botón `iconbtn.logout` (los anteriores ya estaban: sync, zap, settings).

**Tablero · Cards de Ideas (carril 01)**:
- `.excerpt` con primeras ~180 caracteres de `notas` (3 líneas via CSS clamp).
- Variante con piezas: `.kcard-foot` con `.pieza-count.has` (contador en amber) + botón `.cut-btn` (✂).
- Variante sin piezas: clase `.no-piezas` (opacidad 0.45) + botón `.kcta` "✂ Dar forma".
- Filtros `.kcol-filters`: **Todas / Sin piezas / Con piezas** con contadores en cada chip.

**Tablero · Cards de En desarrollo (carril 02)**:
- `.subnm` con subtítulo descriptivo: usa `plataformas[]` si está rellenado, si no
  un default sensato por formato ("YouTube · long-form", "Instagram · 60s", etc.).

**Tablero · Cards de Agendado (carril 04)**:
- Columna lleva clase `kcol.active` → header con textos blancos brillantes.
- `.kdate.future` con **icono SVG calendario** + formato `DOW, DD MMM · HH:MM`
  (ej. "MIÉ, 17 MAY · 18:00") en amber.

**Tablero · Cards de Publicado (carril 05)**:
- Columna lleva clase `kcol.publicado` → gradient verde completo en toda la
  columna, badges/cards en verde.
- `.kdate.past` sin icono, sin hora, en gris (ej. "LUN, 11 MAY").

**Tablero · Headers de columna**:
- Botón `.add-btn` (+) junto al count en cada header. Focusea el capture bar y
  pre-selecciona el tag según la columna (Ideas → `idea`, resto → `email`).

**Tablero · Capture bar**:
- Añadido `.cap-caret` (caret amarillo parpadeante) dentro del `.input-wrap`,
  como en la maqueta.

### Conservado
- CardModal sin cambios (sigue funcionando para idea/pieza).
- API y backend sin cambios.
- Sistema visual (CSS): sin tocar — ya estaba clavado.

### Pendiente
- Drag & drop entre carriles (Tablero).
- StatusBar contextual (cuando hagamos Dashboard).
- Dashboard funcional (Fase 3C).

---

## Fase 3B · Paridad visual con Claude Design · v0.44.2-α (2026-05-17)

**Hito**: Análisis llega a paridad pixel-a-pixel con la maqueta original de Claude Design tras comparar HTML.

### Añadido
- **Fila destacada (`highlighted`)** en la pieza más reciente — recuadro dorado con ring del idx en amber. Solo aplica cuando el orden es por fecha desc (orden por defecto); al reordenar por otra columna, el recuadro desaparece para no destacar arbitrariamente.
- **`barScale` por columna en BENCHMARKS** — cada métrica tiene su valor "techo natural":
  - `tasa_apertura`: barScale 50 (apertura típica 25-40% → barra llena a 50%)
  - `tasa_clics`: barScale 5 (clic típico 0-3% → barra llena a 5%)
  - `tasa_bajas`: barScale 1.5 (bajas típicas 0-1% → barra llena a 1.5%)
- **Clase `tiny`** en micro-bars de `% Bajas` (container 60px en vez de 80px).
- **Width mínimo 2%** en micro-bars cuando el valor es 0 o sin datos — aparece la barra "casi vacía" en lugar de invisible.

### Cambiado
- **Orden del `when`**: ahora fecha plana + hora en `<b>` (antes era al revés), igual que la Claude Design.
- **Label "Revenue atribuido (€)"** en vez de "Revenue (€)" — consistencia con KPI y con HTML original.
- **Escala de micro-bars** pasa de dinámica (max del periodo) a absoluta (barScale fijo por columna). Más estable visualmente: al añadir nuevos emails las barras no se "reescalan" entre sí, mantienen referencia fija.

---

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
