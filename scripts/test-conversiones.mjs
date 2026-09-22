import assert from 'node:assert/strict';
import { factorGramos } from '../src/core/conversiones.js';
import { costearPlan, bajasDelCosteo } from '../src/core/costeo.js';
import { validarLote, normalizarLote } from '../src/core/almacen.js';
import { guardarPlanEn, aprobarPlanEn, costeoPendiente, fijarRecetaEn } from '../src/core/produccion.js';
import { materialesEnGramos, agruparGramos } from '../src/core/materiales-produccion.js';
import { hoyLocal, leerOperacion, CLAVE_OPERACION } from '../src/core/bitacora.js';
import { ordenesPorArea } from '../src/core/ordenes.js';
import { medidasDeIngrediente, gramosDeFormula } from '../src/core/medidas-ingrediente.js';

let pruebas = 0;
function prueba(nombre, fn) { fn(); pruebas++; console.log('OK conversión: ' + nombre); }
const cerca = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const fecha = hoyLocal();
const lote = (unidad, equivalencias = {}, extra = {}) => normalizarLote({ id: 'L001', ingrediente: 'ACEITE',
  unidad, equivalencias, pesoCompra: 10, existencia: 10, costoCompra: 92000, fechaCompra: fecha, ...extra });
const calcular = (cantidad, unidad, lotes) => costearPlan([{ ingrediente: 'ACEITE', cantidad, unidad }], lotes, fecha);
const receta = (id, cantidad, unidad) => ({ id, nombre: id, categoria: 'PANADERÍA',
  componentes: [{ nombre: 'BASE', items: [{ ingrediente: 'ACEITE', cantidad: String(cantidad), unidad }] }] });
const datosBase = (lotes) => ({ version: 1, operacionVersion: 1, secuencia: 0, lotes,
  planes: [], ejecuciones: [], eventos: [], notas: [], preparaciones: [] });
const guardar = (datos, recetas, factor = 1, revision = 0) => guardarPlanEn(datos,
  { fecha, revision, responsable: 'QA', motivo: 'Prueba', entradas: recetas.map((r) => ({ id: r.id, factor })) }, recetas);
const solicitud = (datos) => ({ fecha, revision: datos.planes[0].revision, responsable: 'QA', motivo: 'Producción', costeo: costeoPendiente(datos, fecha) });

prueba('materiales suman 8 unidades de claras más 1 gramo, sin tocar las recetas', () => {
  const crear = (id, cantidad, unidad, categoria = 'PANADERÍA') => ({ ...receta(id, cantidad, unidad), categoria,
    componentes: [{ nombre: 'BASE', items: [{ ingrediente: 'CLARAS DE HUEVO', cantidad, unidad }] }] });
  const entradas = [{ recipe: crear('A', 8, 'UND'), factor: 1 }, { recipe: crear('B', 1, 'GR', 'GALLETAS'), factor: 1 }];
  const lotes = [lote('UND', { UND: 30 }, { ingrediente: 'CLARAS DE HUEVO', costoCompra: 3000 })];
  const antes = JSON.stringify({ entradas, lotes });
  const plan = materialesEnGramos(entradas, lotes, fecha);
  assert.equal(plan.lineas.length, 1);
  assert.equal(plan.lineas[0].cantidad, 241);
  assert.equal(plan.lineas[0].costo, 2410);
  assert.equal(plan.lineas[0].unidad, 'GR');
  assert.equal(JSON.stringify({ entradas, lotes }), antes);
  const sin = materialesEnGramos(entradas, [], fecha);
  assert.equal(sin.lineas[0].cantidad, null);
  assert.equal(sin.conflictos, 1);
});
prueba('el papel consumible se multiplica por tandas y se convierte sin editar su dimensión original', () => {
  const recipe = { ...receta('PAPEL', 60, 'CM'), componentes: [{ nombre: 'BASE', items: [{ ingrediente: 'PAPEL PARAFINADO', cantidad: 60, unidad: 'CM' }] }] };
  const plan = materialesEnGramos([{ recipe, factor: 2 }], [lote('CM', { CM: 0.1 }, { ingrediente: 'PAPEL PARAFINADO', pesoCompra: 1000, existencia: 1000, costoCompra: 10000 })], fecha);
  cerca(plan.lineas[0].cantidad, 12);
  cerca(plan.lineas[0].costo, 1200);
  assert.equal(recipe.componentes[0].items[0].cantidad, 60);
});
prueba('agua de proceso se pesa sin comprar ni descontar; una mezcla no se exime', () => {
  const agua = costearPlan([{ ingrediente: 'AGUA', cantidad: 0.5, unidad: 'LT' },
    { ingrediente: 'AGUA', cantidad: 200, unidad: 'GR' }, { ingrediente: 'AGUA ( CALIENTE )', cantidad: 100, unidad: 'ML' }], [], fecha);
  assert.equal(agua.costoTotal, 0);
  assert.equal(agua.lineasConFaltante, 0);
  assert.equal(agua.lineasSinPrecio, 0);
  assert.equal(agruparGramos(agua.lineas)[0].cantidad, 700);
  assert.equal(bajasDelCosteo(agua).size, 0);
  assert.equal(costearPlan([{ ingrediente: 'AGUA / LECHE', cantidad: 1, unidad: 'LT' }], [], fecha).lineasSinConversion, 1);
});
prueba('partidas independientes: media y dos tandas, edición, confirmación y adicionales', () => {
  const recetas = [receta('A', 100, 'GR'), receta('B', 200, 'GR')];
  const datos = datosBase([lote('KG')]);
  const fijar = (id, factor, partidas) => fijarRecetaEn(datos, { fecha, revision: datos.planes[0]?.revision || 0,
    recetaId: id, factor, partidas, responsable: 'QA', motivo: 'Editar partida' }, recetas);
  assert.equal(fijar('A', 2.5, [0.5, 2]).ok, true);
  assert.equal(fijar('B', 1, [1]).ok, true);
  assert.equal(fijar('A', 1.5, [0.5, 1]).ok, true);
  assert.deepEqual(datos.planes[0].entradas.map((e) => e.partidas), [[0.5, 1], [1]]);
  assert.equal(fijar('A', 1.5, [1]).code, 'partidas');
  const aprobado = aprobarPlanEn(datos, { ...solicitud(datos), recetaId: 'A', costeo: costeoPendiente(datos, fecha, { recetaId: 'A' }) });
  assert.equal(aprobado.ok, true);
  assert.deepEqual(datos.planes[0].entradas[0].partidas, []);
  assert.equal(fijar('A', 2, [0.5]).ok, true);
  const adicional = costeoPendiente(datos, fecha, { recetaId: 'A' });
  assert.equal(adicional.lineas[0].cantidad, 50);
  assert.equal(aprobarPlanEn(datos, { ...solicitud(datos), recetaId: 'A', costeo: adicional }).ok, true);
  cerca(datos.lotes[0].existencia, 9.8);
  assert.deepEqual(datos.planes[0].entradas[1].partidas, [1]);
});

prueba('masa exacta y aliases; no supone densidades', () => {
  assert.equal(factorGramos('kg'), 1000);
  assert.equal(factorGramos('MG'), 0.001);
  assert.equal(factorGramos('gramos'), 1);
  assert.equal(factorGramos('litros'), null);
  assert.equal(factorGramos('litros', { ML: 0.92 }), 920);
  assert.equal(factorGramos('unidades', { UND: 50 }), 50);
});
prueba('compra en litros, receta en gramos, costo y baja en litros', () => {
  const r = calcular(460, 'GR', [lote('LT', { ML: 0.92 })]);
  assert.equal(r.costoTotal, 4600);
  assert.equal(r.lineas[0].precioMedio, 10);
  assert.equal(r.lineas[0].origen[0].cantidadGramos, 460);
  assert.equal(bajasDelCosteo(r).get('L001'), 0.5);
});
prueba('compra en unidades y tandas, fórmulas en gramos', () => {
  for (const [u, eq, peso, baja] of [['UND', { UND: 50 }, 125, 2.5], ['TANDA', { TANDA: 2500 }, 1250, 0.5]]) {
    const r = calcular(peso, 'GR', [lote(u, eq)]);
    assert.equal(r.lineas[0].unidad, 'GR');
    assert.equal(bajasDelCosteo(r).get('L001'), baja);
    assert.equal(r.costoTotal, 9200 * baja);
  }
});
prueba('fórmulas en ml, unidades, tandas y mg también se valoran en gramos', () => {
  for (const [u, cantidad, gramos] of [['ML', 500, 460], ['UND', 2, 100], ['TANDA', 0.5, 1250], ['MG', 500, 0.5]]) {
    const r = calcular(cantidad, u, [lote('KG', { ML: 0.92, UND: 50, TANDA: 2500 }, { costoCompra: 100000 })]);
    cerca(r.lineas[0].cantidad, gramos);
    assert.equal(r.costoTotal, Math.round(gramos * 10));
  }
});
prueba('FEFO mezcla unidades de compra y densidades por lote sin duplicar stock', () => {
  const lotes = [lote('LT', { ML: 0.92 }, { existencia: 1, vencimiento: '2098-01-01' }),
    lote('ML', { ML: 1 }, { id: 'L002', existencia: 1000, pesoCompra: 1000, costoCompra: 20000, vencimiento: '2099-01-01' })];
  const r = calcular(1420, 'GR', lotes);
  assert.equal(r.costoTotal, 19200);
  assert.deepEqual([...bajasDelCosteo(r)], [['L001', 1], ['L002', 500]]);
  const mixto = costearPlan([{ ingrediente: 'ACEITE', unidad: 'GR', cantidad: 920 },
    { ingrediente: 'ACEITE', unidad: 'KG', cantidad: 1.5 }], lotes, fecha);
  assert.equal(mixto.lineas[1].faltante, 500);
  assert.equal(bajasDelCosteo(mixto).get('L002'), 1000);
  assert.equal(lotes[0].existencia, 1);
});
prueba('faltan equivalencias y equivalencias contradictorias bloquean el costeo', () => {
  assert.equal(calcular(100, 'GR', [lote('LT')]).lineasSinConversion, 1);
  assert.equal(calcular(1, 'UND', [lote('GR')]).lineas[0].cantidad, null);
  const r = calcular(1, 'UND', [lote('GR', { UND: 50 }), lote('GR', { UND: 60 }, { id: 'L002' })]);
  assert.equal(r.lineasSinConversion, 1);
  assert.match(r.lineas[0].motivo, /diferentes/);
  assert.equal(bajasDelCosteo(r).size, 0);
  const repuesto = calcular(1, 'UND', [lote('GR', { UND: 50 }, { existencia: 0 }),
    lote('GR', { UND: 60 }, { id: 'L002', pesoCompra: 100, existencia: 100 })]);
  assert.equal(repuesto.lineasSinConversion, 0);
  assert.equal(repuesto.lineas[0].cantidad, 60);
});
prueba('vencidos y compras futuras no aportan gramos ni equivalencias', () => {
  const lotes = [lote('LT', { ML: 0.92 }, { vencimiento: '2000-01-01' }),
    lote('LT', { ML: 1 }, { id: 'L002', fechaCompra: '2099-01-01' })];
  const r = calcular(460, 'GR', lotes);
  assert.equal(r.lineas[0].consumo, 0);
  assert.equal(r.lotesVencidosIgnorados, 1);
  assert.equal(calcular(1, 'ML', lotes).lineasSinConversion, 1);
});
prueba('validación admite coma decimal y rechaza factores inválidos', () => {
  assert.equal(validarLote({ ...lote('LT'), equivalencias: { ML: '0,92' } }).value.equivalencias.ML, 0.92);
  for (const v of [0, -1, Infinity, 'NaN', '1abc', ' ']) {
    assert.equal(validarLote({ ...lote('LT'), equivalencias: { ML: v } }).ok, false);
  }
  assert.equal(validarLote(lote('UND')).code, 'sin_conversion');
});
prueba('aprobación conserva fracciones pequeñas, traza y costo histórico', () => {
  const datos = datosBase([lote('LT', { ML: 0.92 })]);
  const r = receta('QA-TEST-MICRO', 0.1, 'GR');
  assert.equal(guardar(datos, [r]).ok, true);
  assert.equal(aprobarPlanEn(datos, solicitud(datos)).ok, true);
  cerca(datos.lotes[0].existencia, 10 - 0.1 / 920);
  const congelado = JSON.stringify(datos.ejecuciones[0]);
  assert.equal(aprobarPlanEn(datos, solicitud(datos)).code, 'ya_producido');
  datos.lotes[0].equivalencias.ML = 1;
  assert.equal(JSON.stringify(datos.ejecuciones[0]), congelado);
  assert.equal(guardar(datos, [r], 2, 1).ok, true);
  assert.equal(aprobarPlanEn(datos, solicitud(datos)).ok, true);
  cerca(datos.lotes[0].existencia, 10 - 0.1 / 920 - 0.1 / 1000);
  const memoria = new Map([[CLAVE_OPERACION, JSON.stringify(datos)]]);
  const previo = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => memoria.get(k) ?? null } };
  assert.equal(leerOperacion().ok, true);
  globalThis.window = previo;
});
prueba('cambiar equivalencia entre calcular y confirmar exige recalcular', () => {
  const datos = datosBase([lote('LT', { ML: 0.92 })]);
  guardar(datos, [receta('QA-TEST', 460, 'GR')]);
  const previsto = solicitud(datos);
  datos.lotes[0].equivalencias.ML = 1;
  assert.equal(aprobarPlanEn(datos, previsto).code, 'costeo_cambio');
  assert.equal(datos.lotes[0].existencia, 10);
  datos.lotes[0].equivalencias = {};
  assert.equal(aprobarPlanEn(datos, solicitud(datos)).code, 'sin_conversion');
  assert.equal(datos.ejecuciones.length, 0);
});
prueba('reparto por receta y área respeta unidades originales e históricos', () => {
  const entradas = [receta('QA-ML', 500, 'ML'), receta('QA-GR', 460, 'GR')].map((recipe) => ({ recipe, factor: 1 }));
  const lotes = [lote('LT', { ML: 0.92 })];
  const g = ordenesPorArea(entradas, lotes, fecha)[0];
  assert.equal(g.costo, 9200);
  assert.deepEqual(g.entradas.map((e) => e.costo), [4600, 4600]);
  assert.equal(g.incompleto, false);
  const antiguo = { lineas: [{ ingrediente: 'ACEITE', unidad: 'ML', costo: 123, faltante: 0, estado: 'ok' }] };
  assert.equal(ordenesPorArea([entradas[0]], [], fecha, antiguo)[0].costo, 123);
});
prueba('ficha del ingrediente expresa el mismo stock en gramos, ml, litros, unidades y tandas', () => {
  const lotes = [lote('LT', { ML: 0.92, UND: 50, TANDA: 2500 })];
  const antes = JSON.stringify(lotes);
  const r = medidasDeIngrediente('ACEITE', lotes, fecha);
  const cantidad = (u) => r.cantidades.find((m) => m.unidad === u).cantidad;
  assert.equal(cantidad('GR'), 9200);
  assert.equal(cantidad('ML'), 10000);
  assert.equal(cantidad('LT'), 10);
  assert.equal(cantidad('UND'), 184);
  assert.equal(cantidad('TANDA'), 3.68);
  assert.equal(gramosDeFormula(500, 'ML', r), 460);
  assert.equal(JSON.stringify(lotes), antes);
});
prueba('la ficha marca conversiones parciales y separa stock vencido del disponible', () => {
  const lotes = [lote('LT', { ML: 0.92 }), lote('UND', {}, { id: 'L002', existencia: 2 }),
    lote('GR', {}, { id: 'L003', existencia: 1, vencimiento: '2000-01-01' })];
  const r = medidasDeIngrediente('ACEITE', lotes, fecha);
  assert.equal(r.detalle.length, 3);
  assert.equal(r.disponibles, 2);
  assert.deepEqual(r.cantidades.find((m) => m.unidad === 'GR'),
    { unidad: 'GR', cantidad: 9200, sinConversion: 1, factor: 1, factores: [1] });
  assert.equal(r.cantidades.find((m) => m.unidad === 'UND').cantidad, 2);
  assert.equal(gramosDeFormula(2, 'UND', r), null);
  const originales = { total: 2, unidad: 'UND' };
  const antes = JSON.stringify(originales);
  gramosDeFormula(originales.total, originales.unidad, r);
  assert.equal(JSON.stringify(originales), antes);
});
console.log(`${pruebas} comprobaciones de conversiones correctas.`);
