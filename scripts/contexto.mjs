/** Contexto a demanda: estado breve, una tarea o una fase. Solo lectura. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (archivo) => readFileSync(resolve(raiz, archivo), 'utf8');

function seccion(texto, titulo) {
  const lineas = texto.split(/\r?\n/);
  const inicio = lineas.findIndex((linea) => linea.startsWith(titulo));
  if (inicio < 0) throw new Error(`Sección no encontrada: ${titulo}`);
  const fin = lineas.findIndex((linea, i) => i > inicio && /^## /.test(linea));
  return lineas.slice(inicio, fin < 0 ? undefined : fin).join('\n').trim();
}

try {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const tablero = leer('coordinacion/ACTUAL.md');
    console.log(tablero.split(/^## [^\n]+: [A-Z0-9-]+\s*$/m)[0].trim());
    console.log('\nSolo tu tarea: --tarea ID. Una fase: --fase N (0–10).');
  } else if (args.length === 2 && args[0] === '--fase' && /^(?:[0-9]|10)$/.test(args[1])) {
    console.log(seccion(leer('PLAN-PRODUCCION-SUPABASE.md'), `## Fase ${args[1]} —`));
  } else if (args.length === 2 && args[0] === '--tarea' && /^[A-Z0-9-]+$/.test(args[1])) {
    const tablero = leer('coordinacion/ACTUAL.md');
    const titulo = tablero.split(/\r?\n/).find((l) => /^## /.test(l) && l.endsWith(`: ${args[1]}`));
    if (!titulo) throw new Error(`Tarea no encontrada: ${args[1]}`);
    console.log(seccion(tablero, titulo));
  } else {
    throw new Error('Uso: node scripts/contexto.mjs [--fase 0..10 | --tarea ID]');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
