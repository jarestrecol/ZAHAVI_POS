/** Comprueba contexto breve, entradas iguales y enlaces vigentes; no imprime el archivo histórico. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const limites = {
  'AGENTS.md': 500,
  'CLAUDE.md': 500,
  'COORDINACION.md': 4000,
  'coordinacion/ACTUAL.md': 5000,
  'coordinacion/MAPA.md': 3000,
};

export function comprobarCoordinacion(root = raiz) {
  const fallos = [], textos = new Map();
  for (const [archivo, limite] of Object.entries(limites)) {
    const ruta = resolve(root, archivo);
    if (!existsSync(ruta)) { fallos.push(`Falta ${archivo}`); continue; }
    const texto = readFileSync(ruta, 'utf8');
    textos.set(archivo, texto);
    if (Buffer.byteLength(texto) > limite) fallos.push(`${archivo} supera ${limite} bytes: mover detalle a una ficha`);
    if (texto.includes('\uFFFD')) fallos.push(`${archivo}: codificación inválida`);
    if (/^\s*@\S+/m.test(texto)) fallos.push(`${archivo}: quitar importación automática de contexto`);
  }
  const limpio = (s) => s?.replace(/\r\n/g, '\n').trim();
  if (limpio(textos.get('AGENTS.md')) !== limpio(textos.get('CLAUDE.md'))) {
    fallos.push('AGENTS.md y CLAUDE.md deben contener la misma entrada breve');
  }
  for (const archivo of ['AGENTS.md', 'CLAUDE.md']) {
    if (!textos.get(archivo)?.includes('](COORDINACION.md)')) fallos.push(`${archivo}: falta la entrada común`);
  }
  if (!textos.get('COORDINACION.md')?.includes('](coordinacion/ACTUAL.md)')) fallos.push('Falta enlace al tablero actual');
  for (const archivo of ['PLAN-PRODUCCION-SUPABASE.md', 'PRECIOS-DEMO.md']) {
    if (!existsSync(resolve(root, archivo))) fallos.push(`Falta ${archivo}`);
    else textos.set(archivo, readFileSync(resolve(root, archivo), 'utf8'));
  }
  for (const [archivo, texto] of textos) {
    for (const enlace of texto.matchAll(/\]\(([^)]+)\)/g)) {
      const destino = enlace[1].replace(/^<|>$/g, '').split('#')[0];
      if (!destino || /^https?:\/\//i.test(destino)) continue;
      const ruta = resolve(root, dirname(archivo), destino);
      const interna = relative(root, ruta);
      if (interna.startsWith('..') || isAbsolute(interna) || !existsSync(ruta)) {
        fallos.push(`${archivo}: enlace local inválido ${destino}`);
      }
    }
  }
  const archivo = resolve(root, 'coordinacion/archivo/2026-09-22-coordinacion.md');
  const huella = `${archivo.slice(0, -3)}.sha256`;
  if (!existsSync(archivo) || !existsSync(huella)) fallos.push('Falta el archivo histórico o su huella');
  else if (createHash('sha256').update(readFileSync(archivo)).digest('hex') !== readFileSync(huella, 'utf8').trim()) {
    fallos.push('El archivo histórico cambió: debe conservarse íntegro');
  }
  if (fallos.length) throw new Error(fallos.join('\n'));
  const inicio = ['AGENTS.md', 'CLAUDE.md', 'COORDINACION.md'].reduce((n, f) => n + Buffer.byteLength(textos.get(f)), 0);
  return `inicio ${inicio} bytes; tablero ${Buffer.byteLength(textos.get('coordinacion/ACTUAL.md'))} bytes; enlaces e historial correctos`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(comprobarCoordinacion()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
