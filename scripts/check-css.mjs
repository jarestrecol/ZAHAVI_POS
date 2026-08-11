/**
 * Comprobacion de las hojas de estilo, sin dependencias.
 *
 * Detecta lo que un navegador se traga en silencio y deja el diseno a medias:
 * valores mal escritos, tokens usados pero no definidos, llaves sin cerrar y
 * clases que el JavaScript aplica pero que no existen en el CSS.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
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

console.log(problems === 0 ? '\nCSS correcto.\n' : `\n${problems} problema(s) en el CSS.\n`);
process.exit(problems === 0 ? 0 : 1);
