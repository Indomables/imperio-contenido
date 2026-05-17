# Imperio Contenido

Sistema operativo de contenido de Imperio Indomable. Cockpit personal de Soma Alcázar para gestionar ideas, piezas, agenda y análisis de performance.

**v0.42 · Cinematic HUD**

## Stack

- **Frontend**: React + Vite
- **Backend**: Netlify Functions (Node.js)
- **DB**: Netlify Database (Postgres)
- **Hosting**: Netlify
- **Auth**: Password protection a nivel de site (Netlify)

## Pantallas

1. **Dashboard** — Cockpit principal. Operador, sesión, pipeline funnel, top piezas, próximas salidas.
2. **Tablero** — Kanban de 5 carriles: Ideas, En Desarrollo, Listo, Agendado, Publicado.
3. **Análisis** — Performance por tipo y período. KPIs y tabla detallada.

## Esquema de DB

- `ideas` — capturas y leads de contenido
- `piezas` — piezas concretas con formato (email/reel/relampago/youtube/grieta) y columna del kanban
- `metricas` — métricas externas (Kit, Zernio, Instagram) en JSONB
- `settings` — configuración global
- `pieza_alias` — aliases conversacionales (para Doña Prudencia)

## Desarrollo local

```bash
npm install
netlify link            # vincular al proyecto
netlify dev             # arrancar en local con DB y Functions
```

## Deploy

Push a `main` → deploy automático en Netlify.

---

*Publicar es la única prueba. — Imperio Indomable*
