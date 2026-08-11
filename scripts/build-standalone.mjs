/**
 * Genera una version de un solo archivo del recetario.
 *
 * Los modulos ES no funcionan sobre file://, asi que abrir index.html con doble
 * clic no sirve. Este script empaqueta CSS, JavaScript y datos dentro de un unico
 * HTML que si funciona con doble clic y sin servidor: util para llevarlo en una
 * memoria USB o enviarlo por correo.
 *
 * Cada modulo se envuelve en su propia funcion en lugar de concatenarlos, para
 * que las variables privadas de uno no pisen las de otro: `listeners` existe
 * tanto en el enrutador como en el estado, y concatenar sin ambitos los rompia.
 *
 * Sin dependencias. Se ejecuta con:  node scripts/build-standalone.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'dist');
const outFile = join(outDir, 'Zahavi-Recetario-offline.html');

/** Hojas de estilo, en el mismo orden que declara index.html. */
const STYLES = ['tokens', 'base', 'layout', 'sheet', 'views', 'dialogs', 'print'];

/** Modulos en orden de dependencia: cada uno solo usa lo definido antes. */
const MODULES = [
  'lib/dom.js',
  'lib/format.js',
  'lib/a11y.js',
  'core/storage.js',
  'core/router.js',
  'core/remote.js',
  'core/schema.js',
  'core/search.js',
  'core/store.js',
  'core/repository.js',
  'core/auth.js',
  'views/window.js',
  'views/login.js',
  'views/header.js',
  'views/sidebar.js',
  'views/detail.js',
  'views/editor.js',
  'views/settings.js',
  'views/confirm.js',
  'views/print.js',
  'views/production.js',
  'main.js',
];

/** Nombre con el que se registra cada modulo dentro del paquete. */
function moduleKey(file) {
  return file.replace(/\.js$/, '');
}

/**
 * Resuelve una ruta relativa de import contra el modulo que la declara.
 *
 * @param {string} fromFile por ejemplo "views/detail.js"
 * @param {string} spec por ejemplo "../lib/format.js"
 * @returns {string} clave del modulo destino
 */
function resolveSpec(fromFile, spec) {
  const parts = dirname(fromFile).split('/').filter((p) => p && p !== '.');
  for (const segment of spec.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return moduleKey(parts.join('/'));
}

/**
 * Convierte un modulo ES en el cuerpo de una funcion que devuelve sus exports.
 *
 * @param {string} file
 * @param {string} source
 * @returns {string}
 */
function wrapModule(file, source) {
  const exported = new Set();
  let body = source;

  // import { a, b as c } from './x.js';  ->  const { a, b: c } = __mod('x');
  body = body.replace(
    /^import\s*\{([^}]+)\}\s*from\s*'([^']+)';?\s*$/gm,
    (_match, names, spec) => {
      const bindings = names
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [original, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
          return alias ? `${original}: ${alias}` : original;
        })
        .join(', ');
      return `const { ${bindings} } = __mod('${resolveSpec(file, spec)}');`;
    },
  );

  // import * as ns from './x.js';  ->  const ns = __mod('x');
  body = body.replace(
    /^import\s+\*\s+as\s+(\w+)\s+from\s*'([^']+)';?\s*$/gm,
    (_match, ns, spec) => `const ${ns} = __mod('${resolveSpec(file, spec)}');`,
  );

  // export function f / export const X ...  ->  quitar la palabra export
  body = body.replace(
    /^export\s+(?=(?:async\s+)?function\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+|class\s+\w+)/gm,
    (match, _g, offset) => {
      const rest = body.slice(offset + match.length);
      const name = rest.match(/(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/);
      if (name) exported.add(name[1]);
      return '';
    },
  );

  // export { a, b as c };  ->  registrar y eliminar
  body = body.replace(/^export\s*\{([^}]*)\}\s*;?\s*$/gm, (_match, names) => {
    for (const part of names.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) exported.add(name);
    }
    return '';
  });

  const returned = [...exported].map((name) => `${name}`).join(', ');
  return `__define('${moduleKey(file)}', function () {\n${body}\nreturn { ${returned} };\n});`;
}

const css = STYLES.map((name) => readFileSync(join(root, 'assets/css', `${name}.css`), 'utf8')).join('\n');
const seed = readFileSync(join(root, 'data/recipes.json'), 'utf8');

const wrapped = MODULES.map((file) => {
  const source = readFileSync(join(root, 'src', file), 'utf8');
  return `/* ===== ${file} ===== */\n${wrapModule(file, source)}`;
}).join('\n\n');

const runtime = `
// Registro de modulos: cada uno se evalua una sola vez, en orden de dependencia.
const __registry = Object.create(null);
const __cache = Object.create(null);
function __define(name, factory) { __registry[name] = factory; }
function __mod(name) {
  if (name in __cache) return __cache[name];
  const factory = __registry[name];
  if (!factory) throw new Error('modulo no empaquetado: ' + name);
  __cache[name] = factory();
  return __cache[name];
}

// Las recetas iniciales viajan dentro de este archivo: sobre file:// no hay
// servidor al que pedirlas.
window.__ZAHAVI_SEED__ = ${seed};
const __fetchOriginal = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
window.fetch = function (input, init) {
  const url = String(typeof input === 'string' ? input : (input && input.url) || '');
  if (url.includes('recipes.json')) {
    return Promise.resolve(new Response(JSON.stringify(window.__ZAHAVI_SEED__), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  if (!__fetchOriginal) return Promise.reject(new Error('fetch no disponible'));
  return __fetchOriginal(input, init);
};
`;

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zahavi · Recetario</title>
    <meta name="color-scheme" content="light" />
    <style>
${css}
    </style>
  </head>
  <body>
    <a class="skip-link" href="#contenido">Saltar al contenido</a>
    <div id="app"><p class="booting">Cargando recetario…</p></div>
    <div id="print-root" aria-hidden="true"></div>
    <noscript>
      <p style="padding:2rem;color:#f0e3cb;font-family:Georgia,serif">
        Este recetario necesita JavaScript activado para funcionar.
      </p>
    </noscript>
    <script>
(function () {
${runtime}

${wrapped}

// main.js arranca por si mismo al evaluarse.
__mod('main');
})();
    </script>
  </body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html, 'utf8');

console.log(`Generado ${outFile} (${(html.length / 1024).toFixed(1)} kB)`);
console.log('Se abre con doble clic. No comparte datos con el sitio web.');
