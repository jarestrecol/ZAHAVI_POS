# ZAHAVI_POS

Aplicación de Zahavi para recetario, bodega, planificación de producción y costos.
JavaScript modular, sin framework; Vite construye el artefacto estático.

## Desarrollo

Requiere Node.js 24 y npm. En PowerShell usar `npm.cmd` si el ejecutable sin extensión está bloqueado.

```sh
git clone git@github.com:jarestrecol/ZAHAVI_POS.git
cd ZAHAVI_POS
npm ci
npm run dev
```

Copiar `.env.example` a `.env.local` y completar la configuración necesaria.
La clave publicable de Supabase es configuración del cliente; las claves secretas
solo corresponden al servidor y nunca deben tener prefijo `VITE_` ni versionarse.
La configuración y permisos reales de servicios no se crean al clonar este repositorio.

## Verificación

```sh
npm run verificar
npm run build
npx playwright install chromium
npm run qa
```

`npm run verificar-sql` comprueba el esquema estáticamente.
`npm run probar-sql` requiere Docker y prueba PostgreSQL desechable.

## Estado de la operación

Producción calcula materiales y costos en gramos usando equivalencias de Bodega;
conserva las unidades de compra y los datos originales del recetario. Incluye
partidas, resultados reales e historial. El acceso y equipo usan Supabase, pero
bodega y producción todavía guardan su operación en el navegador.

La centralización y las siguientes mejoras están en el
[plan de trabajo](PLAN-PRODUCCION-SUPABASE.md). GitHub versiona código, pruebas y
migraciones; no sincroniza existencias ni respalda automáticamente los navegadores.
No se incluyen credenciales, compras reales, respaldos privados, dependencias,
compilaciones ni resultados de pruebas. El catálogo de precios incluido es DEMO:
ver [alcance y limitaciones](PRECIOS-DEMO.md).

## Trabajo compartido

Codex y Claude usan [COORDINACION.md](COORDINACION.md) y el
[tablero actual](coordinacion/ACTUAL.md). Consultar una tarea o fase sin leer todo:

```sh
node scripts/contexto.mjs
node scripts/contexto.mjs --fase 0
```

La API de publicación de recetas usa las variables de servidor `GITHUB_REPO`,
`GITHUB_BRANCH` y `GITHUB_TOKEN`. Para el nuevo repositorio el destino es
`jarestrecol/ZAHAVI_POS`, rama `main`; su configuración en el alojamiento se revisa
al desplegar. Cambiar el remoto local no cambia por sí solo el sitio desplegado.

Subir el repositorio no libera espacio del disco. `node_modules`, `dist` y los
reportes son regenerables; conservar los datos operativos y respaldos antes de
cualquier limpieza. Para instalar nuevamente las dependencias se usa `npm ci`.
