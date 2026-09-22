import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRECIOS_DEMO, prepararLotesDemo, esLoteDemo } from '../src/core/precios-demo.js';
import { validarLote, normalizarLote } from '../src/core/almacen.js';
import { costearPlan } from '../src/core/costeo.js';
import { consolidar } from '../src/core/plan.js';
const recetas = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8')).recipes;
const catalogo = new Set(recetas.flatMap((r) => r.componentes.flatMap((c) => c.items.map((i) => i.ingrediente))));
assert.equal(catalogo.size, 159);
assert.deepEqual(new Set(PRECIOS_DEMO.map((r) => r.ingrediente)), catalogo);
assert.deepEqual(JSON.parse(readFileSync(new URL('../data/precios-demo-colombia.json', import.meta.url), 'utf8')).precios, PRECIOS_DEMO);
for (const r of PRECIOS_DEMO) {
  assert.ok(r.cantidad > 0 && Number.isFinite(r.precio));
  assert.ok(r.tipo === 'servicio' ? r.precio === 0 : r.precio > 0);
  assert.ok(r.tipo !== 'publicado' || r.fuente.startsWith('https://'));
}
const huella = JSON.stringify(recetas), fecha = '2026-09-22';
const lotes = prepararLotesDemo(recetas, [], fecha);
assert.equal(lotes.length, 159);
for (const l of lotes) { assert.ok(validarLote(l).ok, l.ingrediente); assert.ok(esLoteDemo(normalizarLote(l))); }
const costo = costearPlan(consolidar(recetas.map((recipe) => ({ recipe, factor: 5 }))).lineas, lotes, fecha);
assert.ok(costo.lineas.every((l) => l.estado === 'ok' && l.faltante === 0));
assert.ok(costo.lineas.filter((l) => !l.servicio).every((l) => l.costo > 0));
assert.equal(JSON.stringify(recetas), huella);
const reales = [{ ingrediente: 'HUEVOS', equivalencias: { UND: 63 } }, { ingrediente: 'LECHE', equivalencias: { ML: 1.04 } }];
const antes = JSON.stringify(reales), conReales = prepararLotesDemo(recetas, reales, fecha);
assert.equal(conReales.find((l) => l.ingrediente === 'HUEVOS').equivalencias.UND, 63);
assert.equal(conReales.find((l) => l.ingrediente === 'LECHE').equivalencias.ML, 1.04);
assert.equal(JSON.stringify(reales), antes);
assert.throws(() => prepararLotesDemo(recetas, [...reales, { ingrediente: 'HUEVOS', equivalencias: { UND: 60 } }], fecha), /equivalencias distintas/);
const extra = prepararLotesDemo(recetas, [{ ingrediente: 'INSUMO ADICIONAL' }], fecha).find((l) => l.ingrediente === 'INSUMO ADICIONAL');
assert.ok(extra.costoCompra > 0 && extra.demo.tipo === 'estimado');
console.log('OK demo: 159/159 ingredientes; precios documentados; cinco tandas sin faltantes; equivalencias reales preservadas; conflictos explícitos; recetas intactas.');
