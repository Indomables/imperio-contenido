# SETUP · Cómo poner esto en marcha

> **Lee esto entero antes de empezar.** Son 6 pasos. Te llevará unos 15 minutos si no te encuentras nada raro. Si algo no cuadra, para y dime exactamente en qué paso.

---

## 1 · Sube el código al repo de GitHub

Tienes el repo vacío en `github.com/Indomables/imperio-contenido`.

Tienes dos opciones para subir el código. Elige la que te resulte más cómoda:

### Opción A · Drag & drop por la web (la más simple)

1. Entra en `github.com/Indomables/imperio-contenido` (estará vacío).
2. Pulsa **"uploading an existing file"** (el enlace pequeño en el medio de la página).
3. Arrastra **TODA la carpeta** que te paso (descomprime el zip primero) al cuadro.
4. Abajo, en "Commit changes":
   - Mensaje del commit: `v0.42.0-alpha · cimientos`
   - Pulsa **Commit changes**.
5. Espera a que termine de subir todos los archivos (puede tardar un minuto).

### Opción B · Por terminal (si tienes git)

Desde la carpeta descomprimida del proyecto:

```bash
git init
git branch -M main
git add .
git commit -m "v0.42.0-alpha · cimientos"
git remote add origin https://github.com/Indomables/imperio-contenido.git
git push -u origin main
```

---

## 2 · Conecta Netlify al repo

Tu app actual en Netlify (`imperio-contenido`) se despliega manualmente. Vamos a conectarla al repo para que cada push haga deploy automático.

1. Entra en `https://app.netlify.com/projects/imperio-contenido/configuration/deploys`.
2. Busca la sección **"Continuous deployment"**.
3. Pulsa **"Link repository"** (o similar).
4. Autoriza la conexión con tu cuenta de GitHub.
5. Selecciona el repo `Indomables/imperio-contenido`.
6. Configuración del build:
   - **Branch to deploy**: `main`
   - **Build command**: `vite build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions` (debería autodetectarse)
7. Pulsa **Save**.

A los pocos segundos Netlify lanzará el primer deploy automático.

---

## 3 · Crea la base de datos en Netlify

1. Sigue en tu proyecto de Netlify.
2. En la barra lateral, busca **Database**.
3. Pulsa **Create a database manually** (no usar agent runners).
4. Cuando termine de provisionar, listo. La DB ya estará vinculada al proyecto.

> *Nota*: La primera vez que despliegues, Netlify aplicará la migración `0000_baseline` automáticamente y dejará la DB con las 5 tablas creadas. Vacías, pero creadas.

---

## 4 · Activa la protección con contraseña

Tu app va a estar en internet y queremos que solo entres tú. Vamos a ponerle una contraseña.

1. En el proyecto de Netlify, ve a **Project configuration → Visitor access**.
2. Activa **"Site password"** (no SSO).
3. Pon una contraseña fuerte. **Guárdala en tu gestor de contraseñas YA**, antes de cerrar la pestaña.
4. Aplica a: **"All projects"** (también deploy previews).
5. Guarda.

Desde ese momento, cualquiera que entre a `imperio-contenido.netlify.app` verá una pantalla de Netlify pidiéndole contraseña antes de cargar tu app.

---

## 5 · Avísame y compruebo el primer deploy

Cuando termines los 4 pasos anteriores, dímelo. Yo entro por el conector de Netlify, verifico que:

- El último deploy está `ready` (no fallido).
- La DB está provisionada y la migración se aplicó limpio.
- El password protection está activo.
- `https://imperio-contenido.netlify.app/api/health` responde 200 OK (después de meter la contraseña).

Si algo falla, lo arreglo desde aquí.

---

## 6 · Fase 2 · Backend (siguiente sesión)

Cuando el cimiento esté en producción, arrancamos Fase 2:
- Escribo las Netlify Functions del CRUD.
- Porto las 6 edge functions de Supabase como Scheduled Functions.
- Importamos los datos actuales de Supabase a Netlify DB.

Una vez Fase 2 esté funcionando en preview deploy, pasamos a Fase 3 (las pantallas reales). Y al final, Fase 4: cutover y apagamos Supabase.

---

**Si algo no entiendes o se atasca**, no toques nada más y avísame con el error exacto que ves en pantalla. Es importante no improvisar en estos pasos — la DB y el password son cosas que mejor configurar bien a la primera.

— *Publicar es la única prueba. Imperio Indomable · Código propio.*
