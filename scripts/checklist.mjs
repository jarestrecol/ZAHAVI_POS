/**
 * =============================================================================
 *  QUE PUEDO TOMAR AHORA
 * =============================================================================
 *
 *  Lee `coordinacion/CHECKLIST.md` y responde la unica pregunta que importa al
 *  empezar: que esta libre, que esta en manos del otro y que todavia no se puede
 *  tocar porque falta algo antes.
 *
 *  Asi ninguno de los dos se queda esperando ni pisa lo que el otro esta
 *  haciendo. Solo lee: no cambia el archivo.
 *
 *    node scripts/checklist.mjs            lo que se puede tomar ya
 *    node scripts/checklist.mjs --todo     tambien lo bloqueado y lo hecho
 *    node scripts/checklist.mjs --revisar  comprueba que la lista este sana
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO = join(raiz, 'coordinacion', 'CHECKLIST.md');

/** `- [~] F3-1 · titulo · Dueño ← F0-3, F0-5` */
const LINEA = /^- \[( |~|x)\] ([A-Z0-9-]+) · ([^·←]+?)(?:\s*·\s*([^←]+?))?(?:\s*←\s*(.+))?$/;

export function leerChecklist(texto) {
  const items = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = LINEA.exec(linea.trim());
    if (!m) {
      if (/^\s*-\s*\[/.test(linea)) throw new Error('Entrada de checklist mal formada: ' + linea.trim());
      continue;
    }
    const [, marca, id, titulo, dueno, depende] = m;
    items.push({
      id,
      titulo: titulo.trim(),
      dueno: (dueno || '').trim() || null,
      estado: marca === 'x' ? 'hecha' : marca === '~' ? 'en curso' : 'libre',
      depende: (depende || '').split(',').map((d) => d.trim()).filter(Boolean),
    });
  }
  return items;
}

/** Problemas que harian inutil la lista: ids repetidos, dependencias inventadas… */
export function revisar(items) {
  const problemas = [];
  if (!items.length) problemas.push('lista vacia');
  const porId = new Map();
  for (const item of items) {
    if (porId.has(item.id)) problemas.push(`id repetido: ${item.id}`);
    porId.set(item.id, item);
  }
  for (const item of items) {
    for (const id of item.depende) {
      if (!porId.has(id)) problemas.push(`${item.id} depende de ${id}, que no existe`);
    }
    if (item.estado === 'en curso' && !item.dueno) problemas.push(`${item.id} esta en curso sin dueño`);
    if (item.estado !== 'libre' && item.depende.some((d) => porId.get(d)?.estado !== 'hecha')) {
      problemas.push(`${item.id} figura ${item.estado} con dependencias pendientes`);
    }
  }
  const visitados = new Set(), activos = new Set();
  function visitar(id) {
    if (activos.has(id)) { problemas.push(`dependencia circular: ${id}`); return; }
    if (visitados.has(id)) return;
    activos.add(id);
    for (const siguiente of porId.get(id)?.depende || []) if (porId.has(siguiente)) visitar(siguiente);
    activos.delete(id); visitados.add(id);
  }
  for (const id of porId.keys()) visitar(id);
  return problemas;
}

const listo = (item, porId) => item.depende.every((d) => porId.get(d)?.estado === 'hecha');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const items = leerChecklist(readFileSync(ARCHIVO, 'utf8'));
  const porId = new Map(items.map((i) => [i.id, i]));
  const opcion = process.argv[2];
  if (opcion && !['--todo', '--revisar'].includes(opcion)) {
    console.error('Opcion desconocida'); process.exit(1);
  }
  const errores = revisar(items);
  if (errores.length) { console.error(errores.join('\n')); process.exit(1); }

  if (opcion === '--revisar') {
    const problemas = revisar(items);
    console.log(problemas.length ? problemas.join('\n') : `Lista sana: ${items.length} entradas.`);
    process.exit(problemas.length ? 1 : 0);
  }

  const libres = items.filter((i) => i.estado === 'libre' && listo(i, porId));
  const enCurso = items.filter((i) => i.estado === 'en curso');
  const esperando = items.filter((i) => i.estado === 'libre' && !listo(i, porId));

  const pinta = (lista, vacio) => (lista.length
    ? lista.map((i) => `  ${i.id} · ${i.titulo}${i.dueno ? ` · ${i.dueno}` : ''}`
      + (i.depende.length ? ` ← ${i.depende.join(', ')}` : '')).join('\n')
    : `  ${vacio}`);

  console.log('\nSe puede tomar ya:');
  console.log(pinta(libres, 'nada libre: todo lo pendiente espera a algo'));
  console.log('\nEn curso:');
  console.log(pinta(enCurso, 'nadie tiene nada tomado'));

  if (opcion === '--todo') {
    console.log('\nEsperando a que termine algo antes:');
    console.log(pinta(esperando, 'nada bloqueado'));
    const hechas = items.filter((i) => i.estado === 'hecha');
    console.log(`\nHechas: ${hechas.length ? hechas.map((i) => i.id).join(', ') : 'ninguna'}`);
  } else {
    console.log(`\n(${esperando.length} esperando, ${items.filter((i) => i.estado === 'hecha').length} hechas: --todo)\n`);
  }
}
