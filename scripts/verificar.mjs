/**
 * Verificacion completa del proyecto, en un solo comando.
 *
 *   node scripts/verificar.mjs
 *
 * Ejecuta, en orden: sintaxis de todos los modulos, resolucion de importaciones,
 * coherencia del CSS, pruebas de la capa de datos, pruebas de la validacion del
 * servidor, alta y baja masiva de recetas y usuarios, integridad de las recetas
 * de la capa de datos.
 *
 * Devuelve codigo distinto de cero si algo falla, para poder usarlo como puerta
 * antes de publicar.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function paso(titulo, fn) {
  process.stdout.write(`${titulo}… `);
  try {
    const detalle = fn();
    console.log('ok' + (detalle ? ` (${detalle})` : ''));
  } catch (error) {
    failed += 1;
    console.log('FALLA');
    console.error('  ' + String(error.message).split('\n').slice(0, 6).join('\n  '));
  }
}

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(name)) out.push(full);
  }
  return out;
}

function run(script) {
  return execFileSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

console.log('\nVerificando el recetario\n');

paso('Sintaxis de los modulos', () => {
  // node --check trata .js como CommonJS: se copian a .mjs para validarlos como
  // modulos ES, que es como los ejecuta el navegador.
  const dir = mkdtempSync(join(tmpdir(), 'zahavi-'));
  try {
    const files = [
      ...walk(join(root, 'src'), (n) => n.endsWith('.js')),
      ...walk(join(root, 'api'), (n) => n.endsWith('.js')),
      join(root, 'sw.js'),
    ];
    for (const file of files) {
      const target = join(dir, relative(root, file).replace(/[\\/]/g, '_') + '.mjs');
      copyFileSync(file, target);
      execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
    }
    return `${files.length} archivos`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

paso('Resolucion de importaciones', () => {
  const files = walk(join(root, 'src'), (n) => n.endsWith('.js'));
  const exported = new Map();

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    exported.set(resolve(file), names);
  }

  const problems = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]+)\})\s+from\s+'([^']+)'/g)) {
      if (!m[2].startsWith('.') || !m[1]) continue;
      const target = resolve(dirname(file), m[2]);
      const available = exported.get(target);
      if (!available) {
        problems.push(`${relative(root, file)} -> falta ${m[2]}`);
        continue;
      }
      for (const raw of m[1].split(',')) {
        // "algo as alias": lo que debe existir en el destino es el nombre
        // original; el alias es solo como se llama aqui.
        const [name] = raw.trim().split(/\s+as\s+/);
        const original = name.trim();
        if (original && !available.has(original)) {
          problems.push(`${relative(root, file)}: "${original}" no existe en ${m[2]}`);
        }
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return `${files.length} modulos`;
});

paso('Coherencia del CSS', () => {
  const out = run('check-css.mjs');
  const match = out.match(/(\d+) clases aplicadas/);
  return match ? `${match[1]} clases` : '';
});

paso('Capa de datos', () => {
  run('test-datos.mjs');
  return '9 bloques';
});

paso('Publicacion y conflictos', () => {
  const out = run('test-publicacion.mjs');
  const total = (out.match(/^\s+OK\s/gm) || []).length;
  return `${total} comprobaciones`;
});

paso('Validacion del servidor', () => {
  run('test-api.mjs');
  return '28 comprobaciones';
});

paso('Alta y baja masiva', () => {
  const out = run('test-qa.mjs');
  const total = (out.match(/^\s+OK\s/gm) || []).length;
  return `${total} comprobaciones`;
});

paso('Integridad de las recetas', () => {
  const data = JSON.parse(readFileSync(join(root, 'data/recipes.json'), 'utf8'));
  if (!Array.isArray(data.recipes)) throw new Error('el archivo no contiene recetas');

  const componentes = data.recipes.reduce((n, r) => n + r.componentes.length, 0);
  const items = data.recipes.reduce(
    (n, r) => n + r.componentes.reduce((m, c) => m + c.items.length, 0),
    0,
  );
  const hash = createHash('sha256').update(JSON.stringify(data.recipes)).digest('hex');

  const sinNombre = data.recipes.filter((r) => !r.nombre || !r.nombre.trim()).length;
  if (sinNombre) throw new Error(`${sinNombre} recetas sin nombre`);

  const ids = new Set(data.recipes.map((r) => r.id));
  if (ids.size !== data.recipes.length) throw new Error('hay codigos de receta repetidos');

  return `${data.recipes.length} recetas, ${componentes} componentes, ${items} items, sha ${hash.slice(0, 8)}`;
});

console.log(
  failed === 0 ? '\nTodo correcto. El proyecto se puede publicar.\n' : `\n${failed} comprobacion(es) fallan.\n`,
);
process.exit(failed === 0 ? 0 : 1);
