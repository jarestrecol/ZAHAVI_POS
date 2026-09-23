/** Regresiones del presupuesto de contexto y extracción: no modifican el repositorio. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, basename, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { comprobarCoordinacion } from './check-coordinacion.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'zahavi-coordinacion-'));
let total = 0;
const test = (nombre, fn) => { fn(); total++; console.log(`OK ${nombre}`); };

try {
  const archivos = ['AGENTS.md', 'CLAUDE.md', 'COORDINACION.md', 'PLAN-PRODUCCION-SUPABASE.md', 'PRECIOS-DEMO.md',
    'coordinacion', 'data/precios-demo-colombia.json'];
  for (const archivo of archivos) {
    const destino = join(temp, archivo);
    mkdirSync(dirname(destino), { recursive: true });
    cpSync(join(root, archivo), destino, { recursive: true });
  }
  const mutar = (archivo, cambio, esperado) => {
    const ruta = join(temp, archivo), original = readFileSync(ruta);
    try { writeFileSync(ruta, cambio(original.toString('utf8'))); assert.throws(() => comprobarCoordinacion(temp), esperado); }
    finally { writeFileSync(ruta, original); }
  };
  test('estructura actual válida', () => assert.match(comprobarCoordinacion(temp), /enlaces e historial correctos/));
  test('rechaza crecimiento del inicio', () => mutar('COORDINACION.md', (s) => s + 'x'.repeat(4001), /supera 4000/));
  test('rechaza crecimiento del tablero', () => mutar('coordinacion/ACTUAL.md', (s) => s + 'x'.repeat(5001), /supera 5000/));
  test('rechaza reglas diferentes por agente', () => mutar('CLAUDE.md', (s) => s + '\nRegla exclusiva', /misma entrada/));
  test('rechaza importación automática', () => mutar('CLAUDE.md', (s) => '@COORDINACION.md\n' + s, /importación automática/));
  test('detecta enlace roto', () => mutar('COORDINACION.md', (s) => s.replace('](coordinacion/MAPA.md)', '](no-existe.md)'), /enlace local inválido/));
  test('detecta modificación del archivo histórico', () => mutar('coordinacion/archivo/2026-09-22-coordinacion.md', (s) => s + '\n', /histórico cambió/));
  const ejecutar = (...args) => execFileSync(process.execPath, [join(root, 'scripts/contexto.mjs'), ...args], { encoding: 'utf8' });
  test('inicio breve sin historial', () => { const s = ejecutar(); assert.ok(s.length < 2200); assert.ok(!s.includes('MSG-001')); });
  test('extrae las once fases sin arrastrar las otras', () => {
    for (let n = 0; n <= 10; n++) {
      const s = ejecutar('--fase', String(n));
      assert.ok(s.startsWith(`## Fase ${n} —`));
      assert.equal((s.match(/^## /gm) || []).length, 1);
    }
  });
  // La tarea se toma del tablero vigente: al entregar, su seccion desaparece y
  // fijar un id aqui hacia fallar la prueba sin que nada estuviera roto.
  test('extrae solo la tarea propia', () => {
    const tablero = readFileSync(join(root, 'coordinacion/ACTUAL.md'), 'utf8');
    const titulos = [...tablero.matchAll(/^## ([^:\n]+): ([A-Z0-9-]+)[ \t]*$/gm)];
    assert.ok(titulos.length >= 2, 'el tablero debe tener una seccion por agente');
    const [, agente, id] = titulos[0];
    const otro = titulos.find((t) => t[1] !== agente);
    const salida = ejecutar('--tarea', id);
    assert.ok(salida.includes(`## ${agente}: ${id}`));
    assert.ok(!salida.includes(`## ${otro[1]}:`), 'no debe arrastrar la seccion del otro agente');
  });
  test('rechaza fase inexistente', () => assert.equal(spawnSync(process.execPath, [join(root, 'scripts/contexto.mjs'), '--fase', '11']).status, 1));
  console.log(`${total} comprobaciones correctas`);
} finally {
  // Solo el directorio que mkdtempSync creó en esta prueba, nunca una ruta recibida.
  if (dirname(resolve(temp)) !== resolve(tmpdir()) || !basename(temp).startsWith('zahavi-coordinacion-')) {
    throw new Error('Directorio temporal fuera del destino previsto');
  }
  rmSync(temp, { recursive: true, force: true });
}
