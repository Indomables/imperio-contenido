# CHANGELOG

## Fase 6 · Zernio DM (parte 1) · Schema BD + sistema de migraciones · v0.57.0-α (2026-05-18)

**Hito**: arranca la pieza Zernio en Imperio Contenido. Quedan en producción
4 tablas listas para recibir DMs clasificados, y un sistema de migraciones
SQL que evita tener que tocar Neon a mano nunca más.

### Añadido

**`/api/migrate` · Aplicador de migraciones SQL** (`netlify/functions/migrate.mts`):
- Lee `netlify/database/migrations/`, lleva control en tabla `_migrations`,
  aplica solo las pendientes.
- Modo `?modo=marcar-existentes` para registrar el baseline + seed (que ya
  estaban aplicados manualmente en Neon antes de tener este sistema) sin
  re-ejecutarlos.
- Modo `?modo=diag` con env keys, API disponible en `db.sql`, paths y
  carpetas detectadas. Útil para depurar.
- Ejecución vía `db.sql.unsafe(stmt)`. Doble estrategia: primero intenta
  todo el SQL de una vez; fallback a split + ejecución uno a uno con un
  parser que respeta comentarios, bloques `$$ $$`, y strings entre comillas
  simples con escape `''`.
- Protegida por el site password de Netlify. Idempotente.

**Migración 0002_zernio_dm** (`netlify/database/migrations/0002_zernio_dm/migration.sql`):
- `zernio_eventos` — webhooks crudos con `event_id UNIQUE` para idempotencia.
- `zernio_clasificaciones` — output de la IA al clasificar un DM (interés
  sugerido, temperatura, confianza, razonamiento, tags sugeridos, modelo
  usado).
- `zernio_notificaciones` — pestaña de revisión humana, 1:1 con
  clasificación. Estados `pendiente | decidida_enrolar | decidida_descartar
  | decidida_otro`. Constraint de coherencia entre estado y `decision_at`.
- `zernio_acciones` — log de auditoría de toda acción intentada (incluida
  acciones bloqueadas por reglas duras, con `resultado=skip` + motivo).
- CHECK constraints alineados con el sistema de tags decidido:
  `int-hermandad`, `int-elite`, `int-general`, `sin-interes`,
  `requiere-revision` para interés; `frio | tibio | caliente` para
  temperatura; los 7 tipos de acción decididos.
- Trigger `updated_at` solo en notificaciones (eventos y clasificaciones
  son inmutables).
- Contactos Zernio NO se mezclan con tabla `contactos` del Reactor — solo
  se guardan `zernio_contact_id + handle`. La promoción cross-project se
  registra como `zernio_acciones.tipo = 'promover_a_reactor'`.

**`netlify.toml`**:
- `included_files = ["netlify/database/migrations/**/*.sql"]` para que la
  function de migrate pueda leer los `.sql` en runtime.

### Cambiado
- **Bump 0.55.0 → 0.57.0** (saltando 0.56.0). El bump a 0.56.0 quedaba
  pendiente desde otro chat (fix de `CardModal.jsx` pasando `setPickerOpen`
  a `PiezaSections`); va incluido en este release.

### Pendiente · Fase 6 (parte 2)
- Edge function `/api/zernio-webhook` que recibe el webhook de Zernio:
  verificar firma HMAC con `ZERNIO_WEBHOOK_SECRET`, insertar en
  `zernio_eventos`, devolver 200 < 5s, procesar asíncrono (Claude API
  para clasificación, aplicar reglas duras, crear notificación o aplicar
  tag `requiere-revision` si confianza < 0.5).
- UI nueva pestaña Zernio en el frontend (brief estructural ya pasado
  a Claude Design).
- Configurar webhook en Zernio apuntando a la edge function + añadir env
  vars en Netlify: `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`. La
  `ANTHROPIC_API_KEY` ya está configurada.
- Modo dry-run inicial: durante 1-2 semanas, la edge function crea
  notificaciones pero NO toca Zernio (no aplica tags, no enrola). Soma
  valida la calidad de la clasificación antes de activar acciones
  automáticas.
- Activar 2FA en Netlify, GitHub, Kit, Anthropic vía Proton Pass.

---

## Fase 5 · Port de auto-publish a Netlify Scheduled · v0.48.0-α (2026-05-17)

**Hito**: La edge function crítica de Supabase (`auto-publish`) está portada
como Netlify Scheduled Function. Es lo único que necesitaba un cron — las
otras 5 edge functions son RPC manuales que el frontend nuevo no usa.

### Inventario de edge functions y decisiones

| Edge function (Supabase) | Tipo | Decisión |
|---|---|---|
| `auto-publish` v23 | Cron horario | **PORT a Netlify Scheduled** (esta release) |
| `kit-sync` v7 | RPC manual | **Descartar** — redundante con auto-publish |
| `instagram-sync` v2 | RPC manual | Deuda técnica — frontend nuevo no la llama |
| `zernio-sync` v7 | RPC manual | Deuda técnica — frontend nuevo no la llama |
| `instagram-auth` v3 | OAuth start | Deuda técnica — solo si Soma quiere reconectar IG |
| `instagram-auth-callback` v1 | OAuth end | Deuda técnica — pareja de la anterior |

### Añadido

**`netlify/functions/auto-publish.mts`** (Scheduled Function):
- Schedule: `@hourly` (coincide con el "CRON CADA HORA" del UI).
- Port fiel del código v23 de Supabase, manteniendo:
  - Resolución de `publication_id` legacy → `broadcast.id` real (normalización
    persistida en BD).
  - Mover agendadas → publicadas cuando Kit las publica.
  - Refresh de métricas de publicadas en últimas 72h (limita carga de API).
  - Merge de campos en métricas (`replies`, `revenue_eur` se preservan; solo
    los campos de Kit se sobreescriben).
- Cambios vs. original:
  - Lee `KIT_API_KEY_V4` de **env var** de Netlify (idiomático), no de la
    tabla `settings`.
  - Soporta `CRON_SECRET` opcional + header `x-netlify-event: schedule` para
    el scheduler interno.
  - SQL directo con `db.sql` en lugar de cliente supabase-js.
  - TypeScript tipado (estructuras `KitBroadcast`, `KitStats`, `Metricas`).

### Cambios operativos para Soma (post-deploy)

1. En Netlify dashboard → Project → Site configuration → Environment variables:
   - `KIT_API_KEY_V4` = (copiar desde Supabase Dashboard → Edge Functions →
     Secrets → `KIT_API_KEY_V4`, o desde donde la tengas)
   - `CRON_SECRET` (opcional) = string aleatorio largo
2. Tras deploy, verificar en Netlify → Functions → auto-publish:
   - Que aparezca con "Scheduled · @hourly" en su panel.
   - Que la primera ejecución (al cabo de máximo 1 hora) loguee `moved`, `updated`.
3. Una vez verificado que va, **desactivar la edge function en Supabase**:
   - Supabase Dashboard → Edge Functions → `auto-publish` → Pause/Delete.
   - Crítico porque si no, AMBOS cron corren a la vez actualizando la misma BD.

### Pendiente

- Cuando lleguen métricas reales de clics tras el primer cron run de Kit v4
  (que sí devuelve `total_clicks`), **quitar el flag `noTrackingYet`** de la
  columna `clics` en `Analisis.jsx`. Eso restaurará el `0` en blanco normal
  cuando sea 0 real.
- Las 4 funciones RPC manuales que quedan (instagram-sync, zernio-sync,
  instagram-auth, instagram-auth-callback) se quedan como deuda técnica
  hasta que Soma necesite esa capacidad concretamente.
- Cutover completo de Supabase (Fase 6): apagar el proyecto Supabase entero
  cuando lleve unos días sin tráfico.

---

## Fase 4 · Drag & drop en el Tablero · v0.47.0-α (2026-05-17)

**Hito**: El Tablero pasa de visual a operativo — ahora puedes mover piezas
entre carriles arrastrando.

### Añadido

**Tablero · Drag & drop entre carriles** (HTML5 nativo, cero dependencias):
- Cards de piezas (carriles 02-05) son arrastrables (`draggable`).
- Las 4 columnas de piezas son drop zones.
- Carril 01 "Ideas" sigue fijo (las ideas no son piezas — su flujo de
  conversión pasa por el botón ✂ "Dar forma").
- **Update optimista**: al soltar, el UI se actualiza al instante y la BD
  se sincroniza en background. Si la API falla, se revierte el cambio.
- **Feedback visual**: la columna destino se ilumina con borde acento y
  un suave gradient cuando arrastras algo encima. La regla se aplica
  inline en JSX (no toca `contenido.css`, que sigue byte-perfect con
  Claude Design).
- Drop sobre la misma columna de origen → no-op (no llama API
  innecesariamente).
- Mensaje de error visible en el banner superior si la API falla.

**Tablero · StatusBar contextual**:
- Reporta contadores reales al right del statusbar:
  `IDEAS X · PIEZAS X · AGENDADAS X · PUBLICADAS X` (antes salían como `—`).
- Coincide con el patrón ya aplicado en Dashboard.
- Las 3 pestañas reportan ya su contexto:
  - Dashboard → contadores reales.
  - Tablero → contadores reales.
  - Análisis → `FILTRO {TIPO} · {PERIODO}` · `FILAS N` · `BENCHMARK ≈ SECTOR` · `ATRIBUCIÓN OK`.

### Conservado
- Click en card sigue abriendo CardModal (los handlers de drag no rompen el click).
- Toda la lógica de filtros de Ideas, capture bar y modal sigue igual.
- Sistema visual (CSS): sin tocar — los 4 CSS siguen byte-perfect.

### Notas técnicas
- Drag & drop es HTML5 nativo (`onDragStart` / `onDragOver` / `onDragLeave` /
  `onDrop`). Funciona en desktop. En mobile no hay drag & drop nativo; si en
  el futuro Soma usa el Tablero en iPad/móvil, habría que añadir una librería
  como `@dnd-kit/core` que soporta touch.
- La API ya soportaba `piezas.update(id, { columna: ... })` desde Fase 2 —
  solo había que llamarla desde el handler.

### Pendiente
- Tablero: ordenar piezas dentro de un mismo carril por drag (ahora solo
  cambia columna). No prioritario.
- Port de 6 edge functions de Supabase → Netlify Scheduled Functions.
- Cuando se active tracking de Clics: quitar `noTrackingYet` en Análisis.

---

## Fase 3C · Dashboard clavado a Claude Design · v0.46.0-α (2026-05-17)

**Hito**: Dashboard funcional con 8 paneles, paridad pixel-perfect con la
maqueta de Claude Design. Cierra la trilogía de pestañas (Tablero, Análisis,
Dashboard).

### Hallazgo previo
Los 4 CSS (`soma`, `contenido`, `analisis`, `dashboard`) son byte-perfect
idénticos al paquete de Claude Design. Como con las otras dos pestañas, el
chasis ya estaba completo. Lo que faltaba era construir el JSX del Dashboard
(antes era un placeholder "EN CONSTRUCCIÓN").

### Añadido

**Dashboard.jsx (8 paneles, 3 columnas)**:

LEFT:
- **01 · Operator**: avatar + ID · IMP-0001 · Soma Alcázar · Founder · Creator
  · ONLINE. Filas: Foco · Frecuencia · Próxima (dinámica desde agendadas) · Modo.
- **02 · En desarrollo**: lista real de piezas con `columna=desarrollo`. Status
  derivado: `casi listo` (≤1 día desde último edit), `cocinando` (más), `listo`
  si la columna es `listo`. Micro: `EDIT · {N}D` con días desde updated_at.

CENTER:
- **03 · Sesión · Hoy**: greeting según hora (`BUENOS DÍAS` / `BUENAS TARDES` /
  `BUENAS NOCHES`), reloj live con segundos, fecha tipo `SÁB · 16 MAY · W20`
  con semana ISO. Capture bar embebida con 6 quick-tags coloreados (Idea/Email/
  Reel/Relámpago/YouTube/Grieta). Pie: MODO · PRÓXIMA SALIDA dinámica · EN COLA ·
  ⌘K. Mini-KPIs (4): Apertura media (sector positivo/neutro/negativo según
  benchmark), Clic medio (sin tracking), Revenue 90D, Suscriptores (max enviados).
- **04 · Pipeline · Funnel**: 5 stages con contadores reales (Ideas · Desarrollo ·
  Listo · Agendado · Publicado). Última stage en verde olivo (`.publi`).
- **05 · Top piezas · 90D**: top 3 emails publicados en últimos 90 días por
  % apertura. Cada fila con `▲ +X.X vs media` / `▼ -X.X vs media` / `≈ media`
  según delta vs media del set. Sparkline SVG decorativa (estática por ahora).

RIGHT:
- **06 · Agendado · Próximas salidas**: lista real de piezas `columna=agendado`
  ordenadas por fecha asc. Cada fila: título, `FORMATO · N destinos`, `DOW DD ·
  HH:MM`, micro `EN ND` / `HOY`. **Cal-strip de 7 días alrededor de hoy** (3
  pasados, hoy, 3 futuros). Cada día marca un evento (`<i>`) si hay agendado.
- **Mantra**: panel sin header con cita _"Publicar es la única prueba."_ y
  credit `IMPERIO INDOMABLE · CÓDIGO PROPIO`.
- **07 · Atajos**: 4 filas. Las 2 primeras son `NavLink` a Tablero y Análisis
  (con contadores reales). 3ª focusea capture bar. 4ª link a Tablero.

**StatusBar contextual del Dashboard**:
- Reporta los contadores reales al right del statusbar: `IDEAS X · PIEZAS X ·
  AGENDADAS X · PUBLICADAS X` (antes salían como `—`).
- `PIEZAS` = todas las no publicadas (desarrollo + listo + agendadas).
- Left queda con los defaults (`DASHBOARD · COCKPIT · OPERADOR · UPTIME`).

**Helpers nuevos (en Dashboard.jsx)**:
- `greetingFor(date)`: greeting según hora.
- `dateBadge(date)`: `DOW · DD MMM · W##` con semana ISO calculada.
- `whenShort(iso)`: `DOW DD · HH:MM`.
- `relativeDays(iso)`: `HOY` / `EN ND` / `HACE ND`.
- `daysAgo(iso)`: días desde una fecha pasada.
- `topSubtitle(pieza, datos)`: subtítulo para top piezas con fecha + enviados.

### Conservado
- Modal de edición sigue funcionando (no cambia).
- API y schema sin cambios.
- Sistema visual (CSS): sin tocar — los 4 CSS ya estaban clavados.
- Tablero y Análisis (paquetes anteriores) sin cambios.

### Pendiente
- Drag & drop entre carriles del Tablero.
- Port de 6 edge functions Supabase → Netlify Scheduled Functions (cuando
  el tracking de Clics esté activo, quitar `noTrackingYet` en Análisis).
- Tablero también debería reportar `usePageStatus` con contadores reales
  (ahora muestra defaults `—`). Cambio pequeño que añadiré cuando lo veas
  necesario.

---

## Fase 3B-final · Análisis clavado a Claude Design · v0.45.1-α (2026-05-17)

**Hito**: Análisis alcanza paridad total con la maqueta de Claude Design tras
cotejar HTML + los 4 CSS (`soma`, `contenido`, `analisis`, `colors_and_type`).

### Hallazgo
Los 4 CSS del paquete de Claude Design son **byte-perfect idénticos** a los
del repo (diff = 0 líneas en cada uno). Como ocurrió con el Tablero, el chasis
visual ya estaba completo. Lo que faltaba era enriquecer JSX + añadir
contexto reactivo a la StatusBar.

### Añadido

**Infraestructura nueva — `src/lib/pageStatus.jsx`**:
- Context React + hook `usePageStatus(status)` para que cada pestaña reporte
  info contextual a la StatusBar inferior.
- Hook `usePageStatusValue()` para que StatusBar consuma el context.
- Cleanup automático al desmontar la página (al cambiar pestaña).

**StatusBar refactorizada**:
- Consume `PageStatusContext`. Si la pestaña activa reporta status, lo muestra.
  Sino, defaults globales (SCREEN_LABEL · OPERADOR · UPTIME · contadores).
- Versión `IMPERIO·CONTENIDO v0.45.1` siempre fija al inicio (izquierda).
- `⌘K · CAPTURA` siempre fijo al final (derecha).

**App.jsx**:
- Wrap del árbol con `<PageStatusProvider>` para que toda la app comparta el
  context.

**Analisis.jsx**:
- `usePageStatus` reportando: `ANÁLISIS · RENDIMIENTO` · `FILTRO {tipo} · {periodo}`
  · `FILAS {n}` · `BENCHMARK ≈ SECTOR` (en color warn) · `ATRIBUCIÓN OK`. Coincide
  exactamente con la maqueta.
- Reactivo: el filtro y el contador de filas se actualizan en vivo al cambiar
  formato/periodo o cuando los datos cambian.
- **`noTrackingYet: true`** añadido a la columna `Clics`: el `0` se muestra en
  gris (`val dash`) en lugar de blanco — semántica visual "no es 0 real, es que
  no tenemos tracking todavía". Distingue de `Bajas` (que sí tiene datos
  reales y los 0 salen en blanco normal).

### Conservado
- KPIs, sublíneas con benchmarks, micro-bars por columna porcentual.
- Sort 1-click desc → 2-click asc → 3-click reset.
- Highlighted row dorada en idx===0 solo cuando sort=fecha desc.
- Click en fila abre CardModal.
- Sistema visual (CSS): sin tocar — ya estaba clavado.

### Pendiente
- Fase 3C: Dashboard funcional (reemplazar el placeholder).
- Drag & drop entre carriles del Tablero.
- Port de 6 edge functions de Supabase → Netlify Scheduled Functions
  (cuando se haga, se activa el tracking de Clics y se elimina el
  `noTrackingYet` de esa columna).

---

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

# CHANGELOG

## Fase 5 · Port de auto-publish a Netlify Scheduled · v0.48.0-α (2026-05-17)

**Hito**: La edge function crítica de Supabase (`auto-publish`) está portada
como Netlify Scheduled Function. Es lo único que necesitaba un cron — las
otras 5 edge functions son RPC manuales que el frontend nuevo no usa.

### Inventario de edge functions y decisiones

| Edge function (Supabase) | Tipo | Decisión |
|---|---|---|
| `auto-publish` v23 | Cron horario | **PORT a Netlify Scheduled** (esta release) |
| `kit-sync` v7 | RPC manual | **Descartar** — redundante con auto-publish |
| `instagram-sync` v2 | RPC manual | Deuda técnica — frontend nuevo no la llama |
| `zernio-sync` v7 | RPC manual | Deuda técnica — frontend nuevo no la llama |
| `instagram-auth` v3 | OAuth start | Deuda técnica — solo si Soma quiere reconectar IG |
| `instagram-auth-callback` v1 | OAuth end | Deuda técnica — pareja de la anterior |

### Añadido

**`netlify/functions/auto-publish.mts`** (Scheduled Function):
- Schedule: `@hourly` (coincide con el "CRON CADA HORA" del UI).
- Port fiel del código v23 de Supabase, manteniendo:
  - Resolución de `publication_id` legacy → `broadcast.id` real (normalización
    persistida en BD).
  - Mover agendadas → publicadas cuando Kit las publica.
  - Refresh de métricas de publicadas en últimas 72h (limita carga de API).
  - Merge de campos en métricas (`replies`, `revenue_eur` se preservan; solo
    los campos de Kit se sobreescriben).
- Cambios vs. original:
  - Lee `KIT_API_KEY_V4` de **env var** de Netlify (idiomático), no de la
    tabla `settings`.
  - Soporta `CRON_SECRET` opcional + header `x-netlify-event: schedule` para
    el scheduler interno.
  - SQL directo con `db.sql` en lugar de cliente supabase-js.
  - TypeScript tipado (estructuras `KitBroadcast`, `KitStats`, `Metricas`).

### Cambios operativos para Soma (post-deploy)

1. En Netlify dashboard → Project → Site configuration → Environment variables:
   - `KIT_API_KEY_V4` = (copiar desde Supabase Dashboard → Edge Functions →
     Secrets → `KIT_API_KEY_V4`, o desde donde la tengas)
   - `CRON_SECRET` (opcional) = string aleatorio largo
2. Tras deploy, verificar en Netlify → Functions → auto-publish:
   - Que aparezca con "Scheduled · @hourly" en su panel.
   - Que la primera ejecución (al cabo de máximo 1 hora) loguee `moved`, `updated`.
3. Una vez verificado que va, **desactivar la edge function en Supabase**:
   - Supabase Dashboard → Edge Functions → `auto-publish` → Pause/Delete.
   - Crítico porque si no, AMBOS cron corren a la vez actualizando la misma BD.

### Pendiente

- Cuando lleguen métricas reales de clics tras el primer cron run de Kit v4
  (que sí devuelve `total_clicks`), **quitar el flag `noTrackingYet`** de la
  columna `clics` en `Analisis.jsx`. Eso restaurará el `0` en blanco normal
  cuando sea 0 real.
- Las 4 funciones RPC manuales que quedan (instagram-sync, zernio-sync,
  instagram-auth, instagram-auth-callback) se quedan como deuda técnica
  hasta que Soma necesite esa capacidad concretamente.
- Cutover completo de Supabase (Fase 6): apagar el proyecto Supabase entero
  cuando lleve unos días sin tráfico.

---

## Fase 4 · Drag & drop en el Tablero · v0.47.0-α (2026-05-17)

**Hito**: El Tablero pasa de visual a operativo — ahora puedes mover piezas
entre carriles arrastrando.

### Añadido

**Tablero · Drag & drop entre carriles** (HTML5 nativo, cero dependencias):
- Cards de piezas (carriles 02-05) son arrastrables (`draggable`).
- Las 4 columnas de piezas son drop zones.
- Carril 01 "Ideas" sigue fijo (las ideas no son piezas — su flujo de
  conversión pasa por el botón ✂ "Dar forma").
- **Update optimista**: al soltar, el UI se actualiza al instante y la BD
  se sincroniza en background. Si la API falla, se revierte el cambio.
- **Feedback visual**: la columna destino se ilumina con borde acento y
  un suave gradient cuando arrastras algo encima. La regla se aplica
  inline en JSX (no toca `contenido.css`, que sigue byte-perfect con
  Claude Design).
- Drop sobre la misma columna de origen → no-op (no llama API
  innecesariamente).
- Mensaje de error visible en el banner superior si la API falla.

**Tablero · StatusBar contextual**:
- Reporta contadores reales al right del statusbar:
  `IDEAS X · PIEZAS X · AGENDADAS X · PUBLICADAS X` (antes salían como `—`).
- Coincide con el patrón ya aplicado en Dashboard.
- Las 3 pestañas reportan ya su contexto:
  - Dashboard → contadores reales.
  - Tablero → contadores reales.
  - Análisis → `FILTRO {TIPO} · {PERIODO}` · `FILAS N` · `BENCHMARK ≈ SECTOR` · `ATRIBUCIÓN OK`.

### Conservado
- Click en card sigue abriendo CardModal (los handlers de drag no rompen el click).
- Toda la lógica de filtros de Ideas, capture bar y modal sigue igual.
- Sistema visual (CSS): sin tocar — los 4 CSS siguen byte-perfect.

### Notas técnicas
- Drag & drop es HTML5 nativo (`onDragStart` / `onDragOver` / `onDragLeave` /
  `onDrop`). Funciona en desktop. En mobile no hay drag & drop nativo; si en
  el futuro Soma usa el Tablero en iPad/móvil, habría que añadir una librería
  como `@dnd-kit/core` que soporta touch.
- La API ya soportaba `piezas.update(id, { columna: ... })` desde Fase 2 —
  solo había que llamarla desde el handler.

### Pendiente
- Tablero: ordenar piezas dentro de un mismo carril por drag (ahora solo
  cambia columna). No prioritario.
- Port de 6 edge functions de Supabase → Netlify Scheduled Functions.
- Cuando se active tracking de Clics: quitar `noTrackingYet` en Análisis.

---

## Fase 3C · Dashboard clavado a Claude Design · v0.46.0-α (2026-05-17)

**Hito**: Dashboard funcional con 8 paneles, paridad pixel-perfect con la
maqueta de Claude Design. Cierra la trilogía de pestañas (Tablero, Análisis,
Dashboard).

### Hallazgo previo
Los 4 CSS (`soma`, `contenido`, `analisis`, `dashboard`) son byte-perfect
idénticos al paquete de Claude Design. Como con las otras dos pestañas, el
chasis ya estaba completo. Lo que faltaba era construir el JSX del Dashboard
(antes era un placeholder "EN CONSTRUCCIÓN").

### Añadido

**Dashboard.jsx (8 paneles, 3 columnas)**:

LEFT:
- **01 · Operator**: avatar + ID · IMP-0001 · Soma Alcázar · Founder · Creator
  · ONLINE. Filas: Foco · Frecuencia · Próxima (dinámica desde agendadas) · Modo.
- **02 · En desarrollo**: lista real de piezas con `columna=desarrollo`. Status
  derivado: `casi listo` (≤1 día desde último edit), `cocinando` (más), `listo`
  si la columna es `listo`. Micro: `EDIT · {N}D` con días desde updated_at.

CENTER:
- **03 · Sesión · Hoy**: greeting según hora (`BUENOS DÍAS` / `BUENAS TARDES` /
  `BUENAS NOCHES`), reloj live con segundos, fecha tipo `SÁB · 16 MAY · W20`
  con semana ISO. Capture bar embebida con 6 quick-tags coloreados (Idea/Email/
  Reel/Relámpago/YouTube/Grieta). Pie: MODO · PRÓXIMA SALIDA dinámica · EN COLA ·
  ⌘K. Mini-KPIs (4): Apertura media (sector positivo/neutro/negativo según
  benchmark), Clic medio (sin tracking), Revenue 90D, Suscriptores (max enviados).
- **04 · Pipeline · Funnel**: 5 stages con contadores reales (Ideas · Desarrollo ·
  Listo · Agendado · Publicado). Última stage en verde olivo (`.publi`).
- **05 · Top piezas · 90D**: top 3 emails publicados en últimos 90 días por
  % apertura. Cada fila con `▲ +X.X vs media` / `▼ -X.X vs media` / `≈ media`
  según delta vs media del set. Sparkline SVG decorativa (estática por ahora).

RIGHT:
- **06 · Agendado · Próximas salidas**: lista real de piezas `columna=agendado`
  ordenadas por fecha asc. Cada fila: título, `FORMATO · N destinos`, `DOW DD ·
  HH:MM`, micro `EN ND` / `HOY`. **Cal-strip de 7 días alrededor de hoy** (3
  pasados, hoy, 3 futuros). Cada día marca un evento (`<i>`) si hay agendado.
- **Mantra**: panel sin header con cita _"Publicar es la única prueba."_ y
  credit `IMPERIO INDOMABLE · CÓDIGO PROPIO`.
- **07 · Atajos**: 4 filas. Las 2 primeras son `NavLink` a Tablero y Análisis
  (con contadores reales). 3ª focusea capture bar. 4ª link a Tablero.

**StatusBar contextual del Dashboard**:
- Reporta los contadores reales al right del statusbar: `IDEAS X · PIEZAS X ·
  AGENDADAS X · PUBLICADAS X` (antes salían como `—`).
- `PIEZAS` = todas las no publicadas (desarrollo + listo + agendadas).
- Left queda con los defaults (`DASHBOARD · COCKPIT · OPERADOR · UPTIME`).

**Helpers nuevos (en Dashboard.jsx)**:
- `greetingFor(date)`: greeting según hora.
- `dateBadge(date)`: `DOW · DD MMM · W##` con semana ISO calculada.
- `whenShort(iso)`: `DOW DD · HH:MM`.
- `relativeDays(iso)`: `HOY` / `EN ND` / `HACE ND`.
- `daysAgo(iso)`: días desde una fecha pasada.
- `topSubtitle(pieza, datos)`: subtítulo para top piezas con fecha + enviados.

### Conservado
- Modal de edición sigue funcionando (no cambia).
- API y schema sin cambios.
- Sistema visual (CSS): sin tocar — los 4 CSS ya estaban clavados.
- Tablero y Análisis (paquetes anteriores) sin cambios.

### Pendiente
- Drag & drop entre carriles del Tablero.
- Port de 6 edge functions Supabase → Netlify Scheduled Functions (cuando
  el tracking de Clics esté activo, quitar `noTrackingYet` en Análisis).
- Tablero también debería reportar `usePageStatus` con contadores reales
  (ahora muestra defaults `—`). Cambio pequeño que añadiré cuando lo veas
  necesario.

---

## Fase 3B-final · Análisis clavado a Claude Design · v0.45.1-α (2026-05-17)

**Hito**: Análisis alcanza paridad total con la maqueta de Claude Design tras
cotejar HTML + los 4 CSS (`soma`, `contenido`, `analisis`, `colors_and_type`).

### Hallazgo
Los 4 CSS del paquete de Claude Design son **byte-perfect idénticos** a los
del repo (diff = 0 líneas en cada uno). Como ocurrió con el Tablero, el chasis
visual ya estaba completo. Lo que faltaba era enriquecer JSX + añadir
contexto reactivo a la StatusBar.

### Añadido

**Infraestructura nueva — `src/lib/pageStatus.jsx`**:
- Context React + hook `usePageStatus(status)` para que cada pestaña reporte
  info contextual a la StatusBar inferior.
- Hook `usePageStatusValue()` para que StatusBar consuma el context.
- Cleanup automático al desmontar la página (al cambiar pestaña).

**StatusBar refactorizada**:
- Consume `PageStatusContext`. Si la pestaña activa reporta status, lo muestra.
  Sino, defaults globales (SCREEN_LABEL · OPERADOR · UPTIME · contadores).
- Versión `IMPERIO·CONTENIDO v0.45.1` siempre fija al inicio (izquierda).
- `⌘K · CAPTURA` siempre fijo al final (derecha).

**App.jsx**:
- Wrap del árbol con `<PageStatusProvider>` para que toda la app comparta el
  context.

**Analisis.jsx**:
- `usePageStatus` reportando: `ANÁLISIS · RENDIMIENTO` · `FILTRO {tipo} · {periodo}`
  · `FILAS {n}` · `BENCHMARK ≈ SECTOR` (en color warn) · `ATRIBUCIÓN OK`. Coincide
  exactamente con la maqueta.
- Reactivo: el filtro y el contador de filas se actualizan en vivo al cambiar
  formato/periodo o cuando los datos cambian.
- **`noTrackingYet: true`** añadido a la columna `Clics`: el `0` se muestra en
  gris (`val dash`) en lugar de blanco — semántica visual "no es 0 real, es que
  no tenemos tracking todavía". Distingue de `Bajas` (que sí tiene datos
  reales y los 0 salen en blanco normal).

### Conservado
- KPIs, sublíneas con benchmarks, micro-bars por columna porcentual.
- Sort 1-click desc → 2-click asc → 3-click reset.
- Highlighted row dorada en idx===0 solo cuando sort=fecha desc.
- Click en fila abre CardModal.
- Sistema visual (CSS): sin tocar — ya estaba clavado.

### Pendiente
- Fase 3C: Dashboard funcional (reemplazar el placeholder).
- Drag & drop entre carriles del Tablero.
- Port de 6 edge functions de Supabase → Netlify Scheduled Functions
  (cuando se haga, se activa el tracking de Clics y se elimina el
  `noTrackingYet` de esa columna).

---

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
