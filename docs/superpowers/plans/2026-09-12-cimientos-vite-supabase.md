# Cimientos: Vite y conexión a la base de datos · Plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIO: usa
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que el proyecto pueda usar paquetes de npm en el navegador y hablar
con Supabase, sin reescribir ninguno de los 55 módulos que hoy están en
producción y sin perder el funcionamiento sin conexión.

**Arquitectura:** se añade Vite como paso de compilación sobre el código que ya
existe — mismo JavaScript plano, mismos módulos, sin framework. La lista de
precarga del service worker deja de escribirse a mano y se genera del manifiesto
del build, que es lo único que impide que el empaquetador rompa el modo sin
conexión en silencio. Encima de eso, un cliente propio de Supabase que devuelve
el contrato de errores del proyecto.

**Tecnologías:** Vite (desarrollo), `@supabase/supabase-js`, Playwright, Node 24.

**Spec:** [`docs/superpowers/specs/2026-09-12-pos-almacen-produccion-design.md`](../specs/2026-09-12-pos-almacen-produccion-design.md)

## Restricciones globales

Copiadas del spec. **Se aplican a todas las tareas sin repetirlas.**

- **NO SE COMMITEA NADA.** Instrucción permanente del propietario: todo el trabajo
  es local. Donde este plan dice «punto de control», se ejecuta la verificación y
  se deja el árbol sucio. Los commits se hacen solo cuando él los pida.
- **No se reescriben los módulos existentes.** Si una tarea parece exigirlo,
  párate y dilo.
- Cada dependencia nueva va con **versión exacta fijada**, sin `^` ni `~`.
- La `service_role` de Supabase **no entra jamás** en `src/`.
- Proyecto Supabase: `https://xjcdeczfyghanrccgsxu.supabase.co`.
  Clave publicable: `sb_publishable_EzH07dbzg9cIixtLU3VN0g_quI_XqU3`.
- Todo archivo se escribe en **UTF-8** (regla 23).
- **Ninguna cifra se escribe a mano** en una comprobación: se cuenta.
- Toda escritura contra PostgREST envía `Prefer: return=minimal`.
- Una comprobación nueva **no se da por buena hasta haberla visto fallar**
  adulterando a propósito lo que vigila.
- `npm run verificar` tiene que terminar en verde al final de cada tarea, y el
  `sha` de integridad de las recetas **no puede moverse**: es `1add20b3`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `vite.config.js` | *Crear.* Configuración del build. Nada más |
| `scripts/generar-shell.mjs` | *Crear.* Lee el manifiesto del build y escribe el `SHELL` de `dist/sw.js` |
| `scripts/test-cimientos.mjs` | *Crear.* Comprobaciones del build y del cliente, sin navegador |
| `src/core/supabase.js` | *Crear.* Transporte. No sabe qué es una receta ni un lote |
| `src/core/sesion.js` | *Crear.* Entrar, refrescar el token, salir |
| `sw.js` | *Modificar.* El `SHELL` pasa a llevar un marcador |
| `scripts/check-css.mjs` | *Modificar.* Compara el `SHELL` generado, no el de la fuente |
| `scripts/verificar.mjs` | *Modificar.* Bloques nuevos |
| `index.html` · `vercel.json` | *Modificar.* `connect-src` |
| `package.json` | *Modificar.* Dependencias y scripts |
| `tests/cimientos.spec.js` | *Crear.* Que la aplicación compilada arranca y sirve sin conexión |

---

## Tarea 1: Vite compila la aplicación tal como está

Es la tarea de riesgo del subproyecto y va sola, para poder rechazarla sin
arrastrar nada. **No se añade ninguna dependencia de aplicación todavía.**

**Archivos:**
- Crear: `vite.config.js`
- Modificar: `package.json`

**Interfaces:**
- Produce: `npm run build` deja en `dist/` una aplicación equivalente a la actual,
  y `dist/.vite/manifest.json` con el mapa de nombres originales a nombres con
  hash. Las tareas 2 y 3 dependen de ese manifiesto.

- [ ] **Paso 1: instalar Vite con versión fijada**

```bash
npm install --save-exact --save-dev vite@8.3.0
```

- [ ] **Paso 2: escribir la configuración**

`vite.config.js`:

```js
/**
 * Vite solo empaqueta. No transforma el codigo del proyecto.
 *
 * `manifest: true` es lo que hace posible generar la lista de precarga del
 * service worker en vez de escribirla a mano: sin el, los nombres con hash del
 * build no se pueden conocer desde fuera.
 *
 * `data/` NO se mueve. `api/recipes.js` lo referencia por ruta constante y
 * cuatro scripts lo leen de ahi; moverlo romperia la publicacion. Se copia al
 * resultado del build con `publicDir`.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    // Sin minificar de momento: se quiere poder comparar el resultado con la
    // fuente durante esta tarea, que es la que decide si el build es fiable.
    minify: false,
  },
});
```

- [ ] **Paso 3: apartar `dist/` de git ANTES del primer build**

`.gitignore` no lo contempla —hoy no hay build— y el primer `vite build` mete
cientos de archivos generados en `git status`. Añadir al final de `.gitignore`:

```gitignore
# Resultado del build. Se regenera con `npm run build`; lo que se versiona es la
# fuente. Vercel lo construye de nuevo en cada despliegue.
dist/
```

Y comprobarlo:

```bash
npx vite build && git status --short | grep -c "^?? dist" || echo "bien: dist/ no aparece"
```

- [ ] **Paso 4: añadir los scripts**

En `package.json`, dentro de `"scripts"`:

```json
"dev": "vite",
"build": "vite build && node scripts/copiar-estaticos.mjs && node scripts/generar-shell.mjs"
```

Los dos scripts que invoca se crean en las tareas 2 y 3. **En esta tarea el build
todavía no los tiene, así que se prueba con `npx vite build` a secas.**

- [ ] **Paso 5: ejecutar el build y comprobar que produce algo**

```bash
npx vite build
ls dist/ && cat dist/.vite/manifest.json | head -20
```

Esperado: `dist/index.html` existe y el manifiesto lista `src/main.js`.

- [ ] **Paso 6: comprobar que `salvavidas.js` sigue siendo un script clásico**

`index.html:153` lo carga **sin** `type="module"` a propósito: es la red de
seguridad que avisa si el programa no arranca, y un módulo que falla al evaluarse
no llegaría a ejecutarla.

```bash
grep -n "salvavidas" dist/index.html
```

Esperado: sigue sin `type="module"`.

- [ ] **Paso 7: punto de control**

```bash
npm run verificar
```

Esperado: 17 bloques en verde, `sha 1add20b3`. Si `Coherencia del CSS` falla, es
la tarea 3: anótalo y sigue.

---

## Tarea 2: los estáticos llegan al resultado del build

**Archivos:**
- Crear: `scripts/copiar-estaticos.mjs`

**Interfaces:**
- Consume: `dist/` de la tarea 1.
- Produce: `dist/assets/`, `dist/data/`, `dist/manifest.webmanifest`,
  `dist/404.html`, `dist/500.html`, `dist/sw.js`.

- [ ] **Paso 1: escribir la prueba, que aquí es una comprobación de verdad**

Crear `scripts/test-cimientos.mjs`:

```js
/**
 * Comprobaciones de los cimientos, sin navegador.
 *
 * NINGUNA CIFRA ESCRITA A MANO: las listas salen del repositorio.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fallos = [];

export function comprobarEstaticos() {
  if (!existsSync(join(root, 'dist'))) {
    throw new Error('No hay dist/. Ejecuta `npm run build` antes de verificar.');
  }

  // Las tipografias y las hojas se cuentan del repositorio, no se enumeran.
  const fuentes = readdirSync(join(root, 'assets/fonts'));
  const hojas = readdirSync(join(root, 'assets/css'));

  for (const f of fuentes) {
    if (!existsSync(join(root, 'dist/assets/fonts', f))) fallos.push(`falta dist/assets/fonts/${f}`);
  }
  for (const h of hojas) {
    if (!existsSync(join(root, 'dist/assets/css', h))) fallos.push(`falta dist/assets/css/${h}`);
  }
  for (const suelto of ['data/recipes.json', 'manifest.webmanifest', '404.html', '500.html', 'sw.js']) {
    if (!existsSync(join(root, 'dist', suelto))) fallos.push(`falta dist/${suelto}`);
  }

  if (fallos.length) throw new Error(fallos.slice(0, 8).join('\n'));
  return `${fuentes.length} tipografias, ${hojas.length} hojas y 5 sueltos en dist/`;
}
```

- [ ] **Paso 2: ejecutarla y verla fallar**

```bash
node -e "import('./scripts/test-cimientos.mjs').then(m=>{try{console.log(m.comprobarEstaticos())}catch(e){console.log('FALLA:',e.message)}})"
```

Esperado: `FALLA: falta dist/assets/fonts/...` — todavía no se copia nada.

- [ ] **Paso 3: escribir el copiador**

`scripts/copiar-estaticos.mjs`:

```js
/**
 * Copia al resultado del build lo que Vite no toca.
 *
 * `publicDir` esta en `false` a proposito: los estaticos de este proyecto viven
 * en sus sitios historicos -`assets/`, `data/`- y moverlos romperia
 * `api/recipes.js`, cuatro scripts y las 144 pruebas. Se copian desde aqui.
 */
import { cpSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const CARPETAS = ['assets', 'data'];
const SUELTOS = ['manifest.webmanifest', '404.html', '500.html', 'sw.js'];

for (const carpeta of CARPETAS) {
  cpSync(join(root, carpeta), join(dist, carpeta), { recursive: true });
}
for (const archivo of SUELTOS) {
  if (existsSync(join(root, archivo))) cpSync(join(root, archivo), join(dist, archivo));
}

console.log(`Estaticos copiados: ${CARPETAS.join(', ')} y ${SUELTOS.length} archivos sueltos.`);
```

- [ ] **Paso 4: ejecutar y ver la comprobación en verde**

```bash
npx vite build && node scripts/copiar-estaticos.mjs
node -e "import('./scripts/test-cimientos.mjs').then(m=>console.log(m.comprobarEstaticos()))"
```

Esperado: imprime el recuento, sin fallos.

- [ ] **Paso 5: punto de control**

```bash
npm run verificar
```

---

## Tarea 3: la lista de precarga se genera, no se escribe

Ésta es la que evita que el empaquetador rompa el modo sin conexión en silencio.

**Archivos:**
- Crear: `scripts/generar-shell.mjs`
- Modificar: `sw.js`, `scripts/check-css.mjs`

**Interfaces:**
- Consume: `dist/.vite/manifest.json` (tarea 1), `dist/assets/` (tarea 2).
- Produce: `dist/sw.js` con el `SHELL` resuelto a los nombres reales del build.

- [ ] **Paso 1: escribir la prueba primero**

Añadir a `scripts/test-cimientos.mjs`:

```js
import { readFileSync } from 'node:fs';

/** Las rutas que declara un `sw.js`, con la misma expresion que usa check-css. */
export function shellDe(texto) {
  const bloque = texto.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] ?? '';
  return [...bloque.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]);
}

export function comprobarShellGenerado() {
  const generado = readFileSync(join(root, 'dist/sw.js'), 'utf8');
  const rutas = shellDe(generado);

  if (!rutas.length) throw new Error('dist/sw.js no declara ninguna ruta: el marcador no se sustituyo');

  const problemas = [];
  for (const ruta of rutas) {
    if (ruta === '') continue; // './' es la portada
    if (!existsSync(join(root, 'dist', ruta))) problemas.push(`el sw precarga ${ruta} y no existe en dist/`);
  }

  // El otro sentido: el JavaScript del build tiene que estar precargado, o la
  // aplicacion no existe sin conexion.
  const manifiesto = JSON.parse(readFileSync(join(root, 'dist/.vite/manifest.json'), 'utf8'));
  for (const entrada of Object.values(manifiesto)) {
    if (entrada.isEntry && !rutas.includes(entrada.file)) {
      problemas.push(`${entrada.file} es una entrada del build y el sw no la precarga`);
    }
  }

  if (problemas.length) throw new Error(problemas.slice(0, 8).join('\n'));
  return `${rutas.length} rutas, todas reales y en los dos sentidos`;
}
```

- [ ] **Paso 2: ejecutarla y verla fallar**

```bash
node -e "import('./scripts/test-cimientos.mjs').then(m=>{try{console.log(m.comprobarShellGenerado())}catch(e){console.log('FALLA:',e.message)}})"
```

Esperado: `FALLA` — `dist/sw.js` todavía lleva el `SHELL` escrito a mano con
rutas `./src/*.js` que ya no existen en `dist/`.

- [ ] **Paso 3: poner el marcador en `sw.js`**

Sustituir en `sw.js` el bloque `const SHELL = [ ... ];` entero por:

```js
/*
 * LA LISTA SE GENERA, NO SE ESCRIBE.
 *
 * Estaba escrita a mano y funcionaba mientras el navegador servia exactamente
 * los archivos del repositorio. Con un empaquetador por medio los nombres
 * llevan un hash, asi que una lista escrita precargaria rutas que ya no
 * existen: el `addAll` entero falla y el obrador se queda sin funcionamiento
 * sin conexion, que es un fallo que nadie ve hasta que se cae la red.
 *
 * `scripts/generar-shell.mjs` sustituye el marcador de abajo al construir,
 * leyendo el manifiesto del build. En la fuente se deja vacia a proposito: asi
 * un `sw.js` sin generar no engana, falla.
 */
const SHELL = [
  /* SHELL_GENERADO */
];
```

- [ ] **Paso 4: escribir el generador**

`scripts/generar-shell.mjs`:

```js
/**
 * Escribe el SHELL de `dist/sw.js` a partir del manifiesto del build.
 *
 * Es el mismo patron que este proyecto ya usa en otro sitio y por la misma
 * razon: `probar-sql.mjs` llevaba las migraciones enumeradas a mano y se quedo
 * corto en cuanto aparecio una nueva, dando verde sobre un esquema que no era
 * el del repositorio. Una lista escrita a mano envejece sin avisar.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/** Todos los archivos de una carpeta de `dist/`, como rutas relativas. */
function bajo(carpeta) {
  const salida = [];
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const completo = join(dir, nombre);
      if (statSync(completo).isDirectory()) recorrer(completo);
      else salida.push(relative(dist, completo).replace(/\\/g, '/'));
    }
  };
  recorrer(join(dist, carpeta));
  return salida;
}

const manifiesto = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));

// El JavaScript del build: entradas y todo lo que importan.
const delBuild = new Set();
for (const entrada of Object.values(manifiesto)) {
  delBuild.add(entrada.file);
  for (const trozo of entrada.imports ?? []) delBuild.add(manifiesto[trozo].file);
  for (const hoja of entrada.css ?? []) delBuild.add(hoja);
}

const rutas = [
  './',
  './index.html',
  './manifest.webmanifest',
  ...[...delBuild].sort().map((r) => `./${r}`),
  ...bajo('assets').sort().map((r) => `./${r}`),
  './data/recipes.json',
];

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const lista = rutas.map((r) => `  '${r}',`).join('\n');
const generado = sw.replace('  /* SHELL_GENERADO */', lista);

if (generado === sw) throw new Error('No se encontro el marcador SHELL_GENERADO en sw.js');

writeFileSync(join(dist, 'sw.js'), generado, 'utf8');
console.log(`SHELL generado: ${rutas.length} rutas.`);
```

- [ ] **Paso 5: ejecutar y ver la comprobación en verde**

```bash
npm run build
node -e "import('./scripts/test-cimientos.mjs').then(m=>console.log(m.comprobarShellGenerado()))"
```

Esperado: `N rutas, todas reales y en los dos sentidos`.

- [ ] **Paso 6: adaptar `check-css.mjs` para que mire el build**

En `scripts/check-css.mjs:121`, la comprobación del `SHELL` lee `sw.js` de la
fuente, que ahora está vacío a propósito. Cambiarla para que lea `dist/sw.js`
cuando exista, y **avise en vez de fallar** si no hay build:

```js
// El SHELL de la fuente esta vacio a proposito desde que lo genera el build.
// Comprobar el generado es lo unico que dice la verdad; sin build, esta
// comprobacion no puede opinar y lo dice en vez de dar un verde falso.
const swGenerado = join(root, 'dist/sw.js');
if (!existsSync(swGenerado)) {
  return 'sin dist/: ejecuta `npm run build` para comprobar la carcasa';
}
const sw = readFileSync(swGenerado, 'utf8');
```

- [ ] **Paso 7: romperlo a propósito, que es el estándar del proyecto**

```bash
# Quitar una hoja de estilo del resultado del build y ver que se caza
rm dist/assets/css/almacen.css
node -e "import('./scripts/test-cimientos.mjs').then(m=>{try{m.comprobarShellGenerado()}catch(e){console.log('ROJO (bien):',e.message.split('\n')[0])}})"
npm run build   # restaurar
```

Esperado: `ROJO (bien): el sw precarga assets/css/almacen.css y no existe en dist/`.

- [ ] **Paso 8: punto de control**

```bash
npm run build && npm run verificar
```

---

## Tarea 4: la aplicación compilada se comporta igual

Sin esto, las tres tareas anteriores son fe.

**Archivos:**
- Crear: `tests/cimientos.spec.js`
- Modificar: `playwright.config.js`

**Interfaces:**
- Consume: `dist/` completo (tareas 1-3).

- [ ] **Paso 1: escribir la prueba**

`tests/cimientos.spec.js`:

```js
import { test, expect } from '@playwright/test';

/**
 * La aplicacion compilada tiene que comportarse como la de siempre.
 *
 * Las 144 pruebas existentes corren contra la fuente servida tal cual. Estas
 * corren contra `dist/`, que es lo que de verdad se publica desde que hay build.
 */

test('la aplicacion compilada arranca y llega al menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.inicio, .app')).toBeVisible();
});

test('el service worker registra y precarga sin romperse', async ({ page }) => {
  await page.goto('/');
  const registrado = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(registrado).toBe(true);
});

test('no hay ni un error de consola al arrancar', async ({ page }) => {
  const errores = [];
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', (e) => errores.push(String(e)));
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(errores).toEqual([]);
});
```

- [ ] **Paso 2: ejecutarla contra el build y ver qué pasa**

```bash
npm run build
npx playwright test tests/cimientos.spec.js --reporter=line
```

Si falla, **ése es el hallazgo de esta tarea**: apúntalo con el error exacto
antes de arreglar nada.

- [ ] **Paso 3: arreglar lo que salga y volver a ejecutar**

- [ ] **Paso 4: ejecutar la suite completa contra el build**

```bash
npx playwright test --reporter=line
```

Esperado: 147 pruebas en verde (144 existentes más las 3 nuevas).

> **Si aquí falla algo, para y dilo.** Significa que el build cambia el
> comportamiento, y eso hay que entenderlo antes de seguir, no rodearlo.

- [ ] **Paso 5: punto de control**

```bash
npm run verificar
```

---

## Tarea 5: el cliente de Supabase

**Archivos:**
- Crear: `src/core/supabase.js`
- Modificar: `package.json`, `index.html`, `vercel.json`

**Interfaces:**
- Produce:
  - `leer(tabla, consulta)` → `Promise<{ok:true, value:Array} | {ok:false, code, message}>`
  - `escribir(tabla, filas)` → `Promise<{ok:true, value:null} | {ok:false, code, message}>`
  - `llamar(funcion, argumentos)` → igual que `leer`, para las funciones de la base
  - `URL_SUPABASE` y `CLAVE_PUBLICABLE`, constantes exportadas

- [ ] **Paso 1: instalar la dependencia con versión exacta**

```bash
npm install --save-exact @supabase/supabase-js@2.116.0
```

- [ ] **Paso 2: abrir `connect-src` en los DOS sitios**

En `vercel.json:27`, dentro del valor de `Content-Security-Policy`:

```
connect-src 'self' https://xjcdeczfyghanrccgsxu.supabase.co;
```

Y en `index.html:69`, el `<meta http-equiv="Content-Security-Policy">`, el mismo
cambio.

> Olvidar uno engaña: el navegador bloquea la petición **antes de que salga**, así
> que en pantalla parece que el servidor no responde.

- [ ] **Paso 3: escribir la prueba de que están los dos**

Añadir a `scripts/test-cimientos.mjs`:

```js
export function comprobarCSP() {
  const dominio = 'https://xjcdeczfyghanrccgsxu.supabase.co';
  const problemas = [];

  for (const archivo of ['vercel.json', 'index.html']) {
    const texto = readFileSync(join(root, archivo), 'utf8');
    const linea = texto.split('\n').find((l) => l.includes('connect-src'));
    if (!linea) problemas.push(`${archivo} ya no declara connect-src`);
    else if (!linea.includes(dominio)) problemas.push(`${archivo} no abre connect-src a Supabase`);
  }

  // Y la que de verdad importa: que no se haya colado la clave que se salta
  // toda la seguridad por filas.
  for (const archivo of walkJs(join(root, 'src'))) {
    if (readFileSync(archivo, 'utf8').includes('service_role')) {
      problemas.push(`${relative(root, archivo)} menciona service_role: esa clave no entra en el cliente`);
    }
  }

  if (problemas.length) throw new Error(problemas.join('\n'));
  return 'connect-src abierto en los dos sitios, sin service_role en src/';
}
```

(`walkJs` es la misma función `walk` que ya usa `verificar.mjs`; impórtala o
duplica las seis líneas.)

- [ ] **Paso 4: ejecutarla y verla en verde**

```bash
node -e "import('./scripts/test-cimientos.mjs').then(m=>console.log(m.comprobarCSP()))"
```

- [ ] **Paso 5: escribir el cliente**

`src/core/supabase.js`:

```js
/**
 * Transporte contra Supabase. No sabe que es una receta ni un lote.
 *
 * Devuelve el contrato de siempre -`{ok, value}` / `{ok, code, message}`- y
 * traduce los codigos de PostgREST al entrar, igual que `core/remote.js` hace
 * con la API de recetas. Quien llama solo mira `ok`.
 *
 * LA CLAVE PUBLICABLE ES PUBLICA POR DISENO y va en el navegador. La
 * `service_role` NO ENTRA NUNCA: es el rol que se salta la seguridad por filas
 * entera, que es lo unico que protege los precios de proveedor.
 */
import { createClient } from '@supabase/supabase-js';

export const URL_SUPABASE = 'https://xjcdeczfyghanrccgsxu.supabase.co';
export const CLAVE_PUBLICABLE = 'sb_publishable_EzH07dbzg9cIixtLU3VN0g_quI_XqU3';

const cliente = createClient(URL_SUPABASE, CLAVE_PUBLICABLE, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/**
 * Traduce un error de PostgREST al contrato del proyecto.
 *
 * @param {{code?: string, message?: string}} error
 * @returns {{ok: false, code: string, message: string}}
 */
function traducir(error) {
  const codigo = String(error?.code ?? '');

  if (codigo === '42501' || codigo === 'PGRST301') {
    return { ok: false, code: 'sin_permiso', message: 'Tu usuario no puede ver o cambiar eso.' };
  }
  if (codigo === 'PGRST116') {
    return { ok: false, code: 'no_encontrado', message: 'No se encontro lo que se pedia.' };
  }
  if (codigo.startsWith('23')) {
    return { ok: false, code: 'dato_invalido', message: 'Ese dato no cumple una regla de la base.' };
  }
  return {
    ok: false,
    code: 'error_base',
    message: 'No se pudo hablar con la base de datos. Intentalo de nuevo.',
  };
}

/**
 * @param {string} tabla
 * @param {(consulta: any) => any} [afinar]
 */
export async function leer(tabla, afinar = (c) => c) {
  try {
    const { data, error } = await afinar(cliente.from(tabla).select());
    if (error) return traducir(error);
    return { ok: true, value: data ?? [] };
  } catch {
    return { ok: false, code: 'sin_red', message: 'No hay conexion con la base de datos.' };
  }
}

/**
 * `Prefer: return=minimal` NO ES OPCIONAL.
 *
 * Las columnas con dinero no conceden lectura, asi que si PostgREST intenta
 * devolver la fila escrita falla con lo que PARECE un error de permisos aunque
 * la escritura haya ido bien. Esta anotado en la migracion 0005.
 *
 * @param {string} tabla
 * @param {object|object[]} filas
 */
export async function escribir(tabla, filas) {
  try {
    const { error } = await cliente.from(tabla).insert(filas, { returning: 'minimal' });
    if (error) return traducir(error);
    return { ok: true, value: null };
  } catch {
    return { ok: false, code: 'sin_red', message: 'No hay conexion con la base de datos.' };
  }
}

/**
 * Llama a una funcion de la base. Es como se hacen las escrituras que tocan
 * varias tablas: PostgREST no da transacciones al cliente.
 *
 * @param {string} funcion
 * @param {object} argumentos
 */
export async function llamar(funcion, argumentos = {}) {
  try {
    const { data, error } = await cliente.rpc(funcion, argumentos);
    if (error) return traducir(error);
    return { ok: true, value: data };
  } catch {
    return { ok: false, code: 'sin_red', message: 'No hay conexion con la base de datos.' };
  }
}
```

- [ ] **Paso 6: comprobar que el módulo resuelve y no rompe las fronteras**

```bash
npm run verificar
```

Esperado: `Resolucion de importaciones` y `Fronteras de arquitectura` en verde.
`core/` no importa de `app/` ni de `views/`, y este módulo no lo hace.

- [ ] **Paso 7: probarlo contra la base de verdad, en modo solo lectura**

```bash
node --input-type=module -e "
const r = await fetch('https://xjcdeczfyghanrccgsxu.supabase.co/rest/v1/recetas?select=id&limit=1', {
  headers: { apikey: 'sb_publishable_EzH07dbzg9cIixtLU3VN0g_quI_XqU3' }
});
console.log(r.status, await r.text());
"
```

Esperado: `401` o `[]`. **Las dos son correctas**: significan que la seguridad por
filas está haciendo su trabajo con un usuario sin sesión. Un `200` con filas
dentro sería un fallo grave de seguridad — si eso pasa, para y dilo.

- [ ] **Paso 8: punto de control**

```bash
npm run build && npm run verificar
```

---

## Tarea 6: la sesión

**Archivos:**
- Crear: `src/core/sesion.js`

**Interfaces:**
- Consume: el cliente de la tarea 5.
- Produce:
  - `entrar(correo, clave)` → `{ok:true, value:{id, correo}} | {ok:false, code, message}`
  - `salir()` → `{ok:true, value:null}`
  - `sesionActual()` → `Promise<{ok:true, value:{id, correo} | null}>`
  - `miPerfil()` → `Promise<{ok:true, value:{rol, sede_id, activo}} | {ok:false,...}>`

- [ ] **Paso 1: escribir el módulo**

`src/core/sesion.js`:

```js
/**
 * La sesion: entrar, salir y saber quien eres.
 *
 * Convive con la clave de acceso de hoy durante la transicion. Esa es una
 * cortina compartida por todo el equipo; esto es identidad por persona, que es
 * lo que el almacen necesita para saber quien descuenta y quien ve dinero.
 *
 * El ROL NO SE GUARDA AQUI. Vive en `perfiles`, en la base, y lo aplican las
 * politicas. Un rol guardado en el navegador es una sugerencia, no un permiso.
 */
import { leer } from './supabase.js';

// ... (implementacion sobre el mismo cliente; se exporta `cliente` desde
//      supabase.js o se anaden ahi las tres funciones de auth)
```

> **Decisión pendiente para quien implemente, y hay que tomarla explícitamente:**
> o `supabase.js` exporta el cliente y `sesion.js` lo usa, o `supabase.js` crece
> con las tres funciones de sesión. Recomendado lo primero: mantiene un archivo
> con una responsabilidad. Exporta `export const cliente` desde `supabase.js`.

- [ ] **Paso 2: escribir `miPerfil` con su comprobación de `activo`**

```js
/**
 * El perfil de quien esta dentro.
 *
 * `activo` importa: a un usuario no se le borra -ha firmado movimientos y filas
 * de auditoria-, se le desactiva. Un perfil inactivo se trata como no tener
 * sesion.
 */
export async function miPerfil() {
  const r = await leer('perfiles', (c) => c.select('rol, sede_id, activo').maybeSingle());
  if (!r.ok) return r;
  if (!r.value || r.value.activo === false) {
    return { ok: false, code: 'sin_sesion', message: 'Tu usuario no esta activo. Habla con gerencia.' };
  }
  return { ok: true, value: r.value };
}
```

- [ ] **Paso 3: verificar**

```bash
npm run verificar
```

- [ ] **Paso 4: punto de control**

---

## Tarea 7: las comprobaciones que protegen las decisiones nuevas

**Archivos:**
- Modificar: `scripts/verificar.mjs`

- [ ] **Paso 1: enganchar `test-cimientos.mjs` a `verificar.mjs`**

Antes del bloque `Documentacion`, añadir:

```js
paso('Cimientos del build', async () => {
  const m = await import('./test-cimientos.mjs');
  return [m.comprobarCSP(), m.comprobarEstaticos(), m.comprobarShellGenerado()].join(' · ');
});
```

- [ ] **Paso 2: añadir el presupuesto de dependencias**

```js
paso('Dependencias', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const todas = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const problemas = [];

  // LA REGLA CAMBIO DE FORMA, NO DESAPARECIO.
  // El proyecto tenia cero dependencias en tiempo de ejecucion, y esa regla se
  // anulo a proposito al pasar de recetario a sistema. Lo que la sustituye es
  // esto: pocas, aburridas y CON VERSION EXACTA. Un rango abierto hace que dos
  // maquinas instalen cosas distintas del mismo commit.
  for (const [nombre, version] of Object.entries(todas)) {
    if (/^[\^~]/.test(version)) problemas.push(`${nombre} va con rango abierto (${version}): fijala`);
  }

  if (problemas.length) throw new Error(problemas.join('\n'));
  return `${Object.keys(pkg.dependencies ?? {}).length} en ejecucion, ${Object.keys(pkg.devDependencies ?? {}).length} de desarrollo, todas fijadas`;
});
```

- [ ] **Paso 3: actualizar la fila de la sección 2 de `CLAUDE.md`**

Los bloques pasan de 17 a 19. La fila `Bloques de verificar / pruebas de qa` es
**dura**: si no se corrige, la verificación falla.

```
| Bloques de `verificar` / pruebas de `qa` | 19 / 147 |
```

- [ ] **Paso 4: romper las dos comprobaciones nuevas a propósito**

```bash
# Rango abierto
node -e "const f='package.json',fs=require('fs');const p=JSON.parse(fs.readFileSync(f));p.devDependencies.vite='^8.3.0';fs.writeFileSync(f,JSON.stringify(p,null,2))"
npm run verificar 2>&1 | grep -A1 "^Dependencias"
# Esperado: FALLA ... vite va con rango abierto

# service_role colado en el cliente
echo "// service_role" >> src/core/supabase.js
npm run verificar 2>&1 | grep -A1 "^Cimientos"
# Esperado: FALLA ... menciona service_role

# Restaurar las dos y confirmar verde
```

- [ ] **Paso 5: punto de control final**

```bash
npm run build && npm run verificar && npx playwright test --reporter=line
```

Esperado: 19 bloques en verde, 147 pruebas en verde, `sha 1add20b3`.

---

## Tarea 8: corregir la documentación en el mismo cambio

El bloque `Documentacion` lo va a exigir, y estas frases ya son falsas.

**Archivos:**
- Modificar: `CLAUDE.md`, `docs/operacion.md`, `README.md`

- [ ] **Paso 1: `CLAUDE.md` §1**

«sin framework, sin compilación y sin una sola dependencia en tiempo de
ejecución» pasa a decir la verdad nueva: **sin framework**, con compilación
(Vite) y con dependencias pocas, aburridas y fijadas, defendido por el bloque
`Dependencias`. Y el párrafo de «no propongas una biblioteca» se sustituye por el
criterio que ahora aplica: **se añade una dependencia cuando resuelve un problema
que costaría más mantener a mano, y se fija su versión.**

- [ ] **Paso 2: `CLAUDE.md` §3, decisiones cerradas**

Quitar «Un empaquetador o una versión de un solo archivo: existió y se retiró»:
la primera mitad ya no es cierta. Dejar solo lo del archivo único.

- [ ] **Paso 3: `CLAUDE.md` §7, el comando de build**

`npm run build` entra en la lista de comandos.

- [ ] **Paso 4: `docs/operacion.md`**

«Build / Output / Install Command *(los tres, vacíos)*» pasa a: preset **Vite**,
build `npm run build`, output `dist`. Y «No hay nada que compilar ni que
instalar» deja de ser cierto.

- [ ] **Paso 5: comprobar que el núcleo sigue cabiendo**

```bash
npm run verificar 2>&1 | grep "^Documentacion"
```

Esperado: `ok`, con el núcleo por debajo de 420 líneas. **Si se pasa, quita algo
del núcleo — no subas el tope.**

---

## Repaso del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| §4.1 Vite, `npm run dev` / `npm run build` a `dist/` | 1 |
| §4.1 `data/` no se mueve | 2 |
| §4.1 El `SHELL` se genera del manifiesto | 3 |
| §4.1 La comprobación de los dos sentidos sobrevive | 3 |
| §4.2 Dependencias fijadas, pocas | 1, 5, 7 |
| §4.3 `connect-src` en los dos sitios | 5 |
| §4.3 `Prefer: return=minimal` | 5 |
| §4.3 `service_role` nunca en el cliente | 5, 7 |
| §4.4 `src/core/supabase.js`, `src/core/sesion.js` | 5, 6 |
| §5.3 A un usuario se le desactiva, no se le borra | 6 |
| §9 Comprobaciones nuevas, vistas fallar | 3, 7 |
| §10 Consecuencias documentales | 8 |

**Sin cobertura en este plan, y es correcto**: `chart.js` (no hace falta hasta el
subproyecto 4), la migración `0007_invitaciones.sql` (subproyecto 1), y el
dominio propio en Vercel, que es configuración del panel y no código.
