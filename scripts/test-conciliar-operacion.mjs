import assert from 'node:assert/strict';
import { conciliarOperacion } from './lib/conciliar-operacion.mjs';
const a = { version: 1, proyecto: 'prueba', capturada: '2026-09-22T00:00:00Z', completa: true,
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
console.log('Conciliaci?n: decimales exactos, costos/f?rmulas congelados, resultados, referencias y privacidad comprobados.');
