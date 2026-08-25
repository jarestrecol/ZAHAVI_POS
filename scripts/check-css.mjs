/**
 * Comprobacion de las hojas de estilo, sin dependencias.
 *
 * Detecta lo que un navegador se traga en silencio y deja el diseno a medias:
 * valores mal escritos, tokens usados pero no definidos, llaves sin cerrar y
 * clases que el JavaScript aplica pero que no existen en el CSS.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssDir = join(root, 'assets/css');

const files = readdirSync(cssDir).filter((name) => name.endsWith('.css'));
const sources = new Map(files.map((name) => [name, readFileSync(join(cssDir, name), 'utf8')]));
const all = [...sources.values()].join('\n');

let problems = 0;
const fail = (message) => {
  console.error('  ' + message);
  problems += 1;
};

console.log('Comprobando CSS…\n');

// 1. Declaraciones con valores imposibles: un hex partido, una palabra suelta
//    detras de un color, o un valor vacio.
console.log('Valores de declaracion:');
for (const [name, css] of sources) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = withoutComments.split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^\s*(--[\w-]+|[a-z-]+)\s*:\s*([^;]+);/);
    if (!match) return;
    const value = match[2].trim();
    if (value === '') {
      fail(`${name}:${index + 1} valor vacio en "${match[1]}"`);
      return;
    }
    // Un color hexadecimal seguido de texto que no es una funcion ni una unidad
    // es casi siempre un valor corrompido al escribir.
    const broken = value.match(/#[0-9a-fA-F]{3,8}\s+[a-zA-Z]{2,}/);
    if (broken && !/,|\bvar\(|\binset\b|\bsolid\b|\bdashed\b|\bdotted\b/.test(value)) {
      fail(`${name}:${index + 1} valor sospechoso en "${match[1]}": ${value}`);
    }
    // Un hex debe tener 3, 4, 6 u 8 digitos.
    for (const hex of value.matchAll(/#([0-9a-fA-F]+)\b/g)) {
      const digits = hex[1].length;
      if (![3, 4, 6, 8].includes(digits)) {
        fail(`${name}:${index + 1} color hexadecimal invalido "${hex[0]}" en "${match[1]}"`);
      }
    }
  });
}
if (problems === 0) console.log('  sin valores corrompidos');

// 2. Llaves equilibradas
console.log('\nEstructura:');
let structureOk = true;
for (const [name, css] of sources) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = (clean.match(/\{/g) || []).length;
  const close = (clean.match(/\}/g) || []).length;
  if (open !== close) {
    fail(`${name}: ${open} llaves abiertas y ${close} cerradas`);
    structureOk = false;
  }
}
if (structureOk) console.log('  llaves equilibradas');

// 3. Tokens usados pero no definidos
console.log('\nTokens:');
const defined = new Set([...all.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
const used = new Set([...all.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
const missing = [...used].filter((token) => !defined.has(token));
if (missing.length) missing.forEach((token) => fail(`token sin definir: ${token}`));
else console.log(`  ${defined.size} definidos, ${used.size} usados, ninguno sin definir`);

// 4. Clases aplicadas desde JavaScript que no existen en el CSS
console.log('\nClases:');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}
const js = walk(join(root, 'src'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const classes = new Set();
for (const match of js.matchAll(/class:\s*'([^']+)'/g)) {
  for (const name of match[1].split(/\s+/)) {
    if (name && !name.includes('$') && !name.includes('{')) classes.add(name);
  }
}
const orphans = [...classes].filter((name) => !all.includes('.' + name));
if (orphans.length) orphans.forEach((name) => fail(`clase sin estilo: .${name}`));
else console.log(`  ${classes.size} clases aplicadas, todas con estilo`);

// 5. Manifiesto del service worker. Es una lista mantenida a mano, y cuando se
//    queda corta el fallo solo aparece SIN CONEXION, que es justo donde nadie
//    mira hasta que lo necesita. Ya paso una vez con `src/core/remote.js`.
//
//    Antes se comprobaban DOS listas, esta y la del empaquetador de un solo
//    archivo. Ese empaquetador se retiro: duplicaba el modo sin conexion que ya
//    da el service worker, y obligaba a acordarse de anadir cada modulo nuevo
//    en dos sitios.
console.log('\nManifiesto del service worker:');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

// La carcasa se compara en los DOS sentidos, y cada uno atrapa un fallo
// distinto. Que falte un archivo rompe la aplicacion sin conexion. Que sobre
// una ruta borrada hace fallar el `addAll` ENTERO durante la instalacion, con
// lo que el equipo se queda sin ninguna carcasa guardada: un archivo retirado
// deja de arrancar sin red aunque el resto siga intacto.
const enShell = new Set(
  [...(sw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] ?? '').matchAll(/'\.\/([^']*)'/g)]
    .map((m) => m[1])
    .filter(Boolean),
);

// Todo lo que el navegador necesita para arrancar: modulos, hojas y tipografias.
const carcasa = [
  ...walk(join(root, 'src')).map((file) => file.slice(root.length + 1).replace(/\\/g, '/')),
  ...files.map((name) => `assets/css/${name}`),
  ...readdirSync(join(root, 'assets/fonts'))
    .filter((name) => name.endsWith('.woff2'))
    .map((name) => `assets/fonts/${name}`),
].sort();

const faltan = carcasa.filter((file) => !enShell.has(file));
faltan.forEach((file) => fail(`sw.js no lo cachea: ${file}`));

// Una ruta cacheada que ya no existe: `addAll` rechaza en bloque.
const fantasma = [...enShell].filter((file) => !existsSync(join(root, file)));
fantasma.forEach((file) => fail(`sw.js cachea algo que no existe: ${file}`));

if (!faltan.length && !fantasma.length) {
  console.log(`  ${carcasa.length} archivos de carcasa, todos cacheados y todos existen`);
}

// 6. El recetario compartido NO puede pasar por la cache del service worker.
//
//    `/api/recipes` no es documento, ni CSS, ni JS, asi que sin una salida
//    propia cae en `cacheFirst`, que es el destino por defecto. El fallo no se
//    ve hasta que la publicacion esta configurada y contestando, y entonces
//    sirve un recetario viejo y, peor, un `sha` viejo: publicar con el se
//    rechaza con un 409 "otro equipo publico antes" sin que nadie haya
//    publicado. Es un fallo caro de diagnosticar y barato de comprobar aqui.
console.log('\nRecetario compartido fuera de la cache:');
if (/url\.pathname\.startsWith\('\/api\/'\)\s*\)\s*return;/.test(sw)) {
  console.log('  sw.js deja pasar /api/ sin interceptar');
} else {
  fail('sw.js no excluye /api/: el recetario compartido acabaria servido desde la cache');
}

console.log(problems === 0 ? '\nCSS correcto.\n' : `\n${problems} problema(s) en el CSS.\n`);
process.exit(problems === 0 ? 0 : 1);
