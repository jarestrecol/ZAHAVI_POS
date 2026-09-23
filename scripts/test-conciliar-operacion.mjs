import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { conciliarOperacion } from './lib/conciliar-operacion.mjs';
const a = { version: 1, proyecto: 'prueba', capturada: '2026-09-22T00:00:00Z', completa: true,
  movimientos: [{ id: '1', cantidad: '-0.0004', detalle: { lote: 'l1', tipo: 'salida' } }],
  planes: [{ id: 'p1', detalle: { revision: 2 }, partidas: [{ tandas: '0.5' }, { tandas: '1' }] }],
  preparaciones: [], notas: [], eventos: [], metas: [],
  lotes: [{ id: 'lote-privado', existencia: '0.000400', peso_compra: '999999999999.123456', costo_compra: '15000.00', unidad: 'LT', equivalencias: [{ medida: 'ML', gramos: '1.03' }] }],
  ejecuciones: [{ id: 'e1', costo_total: '2.00', costeo: { origen: 'inmutable', costo: 2 }, formula: [{ id: 'R001', cantidad: '10' }] }],
  resultados: [{ id: 'e1/R001', vendible: '2.0', rechazado: '0', detalle: { esperado: '3', merma: null } }] };
const b = structuredClone(a); b.capturada = '2026-09-23T00:00:00Z';
b.lotes[0].existencia = '0.0004'; b.lotes[0].costo_compra = '015000';
assert.equal(conciliarOperacion(a, b).coincide, true);
b.lotes[0].peso_compra = '999999999999.123457';
assert.equal(conciliarOperacion(a, b).diferencias[0].campo, 'peso_compra');
assert.ok(!JSON.stringify(conciliarOperacion(a, b)).includes('lote-privado'));
b.lotes[0].existencia = '0'; assert.ok(conciliarOperacion(a, b).diferencias.some(d => d.campo === 'existencia'));
const c = structuredClone(a); c.ejecuciones[0].costeo.costo = 3;
assert.ok(conciliarOperacion(a, c).diferencias.some(d => d.campo === 'costeo'));
c.resultados = []; assert.ok(conciliarOperacion(a, c).diferencias.some(d => d.tipo === 'faltante'));
c.resultados = [{ ...a.resultados[0], id: 'nuevo' }]; assert.ok(conciliarOperacion(a, c).diferencias.some(d => d.tipo === 'nuevo'));
assert.throws(() => conciliarOperacion(a, { ...a, completa: false }), /incompleta/);
assert.throws(() => conciliarOperacion(a, { ...a, lotes: [a.lotes[0], a.lotes[0]] }), /duplicada/);
const numero = structuredClone(a); numero.lotes[0].existencia = 0.0004;
assert.throws(() => conciliarOperacion(a, numero), /texto_exacto/);
assert.throws(() => conciliarOperacion(a, { ...a, proyecto: 'otro' }), /mapeo/);
assert.equal(conciliarOperacion(a, a).autorizaCorte, false);
const partida = structuredClone(a); partida.planes[0].partidas[0].tandas = '1.5';
assert.ok(conciliarOperacion(a, partida).diferencias.some(d => d.campo === 'partidas'));
const libro = structuredClone(a); libro.movimientos[0].cantidad = '-0.0003';
assert.ok(conciliarOperacion(a, libro).diferencias.some(d => d.grupo === 'movimientos'));
const sinNotas = structuredClone(a); delete sinNotas.notas;
assert.throws(() => conciliarOperacion(a, sinNotas), /coleccion_ausente/);
const temporal = mkdtempSync(join(tmpdir(), 'zahavi-conciliacion-'));
try {
  const origen = join(temporal, 'antes.json'), destino = join(temporal, 'despues.json');
  const crudo = JSON.stringify(a);
  writeFileSync(origen, crudo); writeFileSync(destino, crudo);
  const ejecutar = () => spawnSync(process.execPath, [fileURLToPath(new URL('./conciliar-operacion.mjs', import.meta.url)), origen, destino], { encoding: 'utf8' });
  assert.equal(ejecutar().status, 0);
  writeFileSync(destino, JSON.stringify(libro));
  const diferencia = ejecutar();
  assert.equal(diferencia.status, 2);
  assert.ok(!diferencia.stdout.includes('lote-privado'));
  writeFileSync(destino, 'contenido privado invalido');
  const invalido = ejecutar();
  assert.equal(invalido.status, 1);
  assert.ok(!invalido.stderr.includes('contenido privado'));
  assert.equal(readFileSync(origen, 'utf8'), crudo);
} finally {
  if (dirname(temporal) !== resolve(tmpdir()) || !basename(temporal).startsWith('zahavi-conciliacion-')) throw new Error('ruta_invalida');
  rmSync(temporal, { recursive: true });
}
console.log('Conciliacion: saldos, libro, partidas, costos y resultados exactos; ausencia de colecciones rechazada.');
