import assert from 'node:assert/strict';
import { guardarResultadoEn, resultadoDe, rendimientoPrevisto, indicadoresResultado, costoDeResultado } from '../src/core/resultados-produccion.js';
import { guardarPlanEn, costeoPendiente } from '../src/core/produccion.js';
import { confirmarRecetaEn } from '../src/core/preparacion.js';
import { leerOperacion, CLAVE_OPERACION, hoyLocal, transaccionOperacion } from '../src/core/bitacora.js';

const autor = { id: 'jefe', nombre: 'Jefe QA', codigo: 'QA', rol: 'obrador' };
const operario = { id: 'operario', nombre: 'Operario QA', codigo: 'OP', rol: 'operario' };
const fecha = hoyLocal();
const receta = { id: 'QA-R', nombre: 'PAN QA X 100 UND', categoria: 'PANADERÍA',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad: 1000, unidad: 'GR' }] }] };
function base(recipe = receta) {
  const d = { version: 1, operacionVersion: 1, secuencia: 0, lotes: [{ id: 'L01', ingrediente: 'HARINA',
    unidad: 'GR', pesoCompra: 10000, existencia: 10000, costoCompra: 1000000, fechaCompra: fecha }],
  planes: [], ejecuciones: [], eventos: [], notas: [], preparaciones: [] };
  assert.equal(guardarPlanEn(d, { fecha, revision: 0, entradas: [{ id: recipe.id, factor: 1 }], responsable: 'QA', motivo: 'Pedido' }, [recipe]).ok, true);
  assert.equal(confirmarRecetaEn(d, { fecha, revision: 1, recetaId: recipe.id, costeo: costeoPendiente(d, fecha) }, autor).ok, true);
  return d;
}
const solicitud = (d, extras = {}) => ({ produccionId: d.ejecuciones[0].id, recetaId: receta.id, revision: 0,
  vendible: 90, rechazado: 10, mermaPreparacionGr: 15, mermaCoccionGr: '', motivo: 'Piezas quemadas', ...extras });
let total = 0;
async function prueba(nombre, fn) { await fn(); console.log(`OK ${nombre}`); total++; }
const memoria = new Map();
globalThis.window = { localStorage: { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) } };
let cola = Promise.resolve();
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
  request: (_nombre, fn) => { const siguiente = cola.then(fn); cola = siguiente.catch(() => {}); return siguiente; },
} } });

await prueba('100 esperadas, 90 vendibles: el costo real sube sin alterar bodega ni receta', () => {
  const d = base(), antes = JSON.stringify({ lotes: d.lotes, planes: d.planes, ejecuciones: d.ejecuciones, receta });
  const r = guardarResultadoEn(d, solicitud(d), autor);
  assert.equal(r.ok, true);
  const i = indicadoresResultado(d.ejecuciones[0], r.value);
  assert.equal(i.costo, 100000); assert.equal(i.costoPrevisto, 1000);
  assert.equal(i.costoReal, 100000 / 90); assert.equal(i.cumplimiento, 90);
  assert.equal(i.rechazoPorcentaje, 10); assert.equal(i.diferencia, 0);
  assert.equal(r.value.mermaPreparacionGr, 15); assert.equal(r.value.mermaCoccionGr, null);
  assert.equal(JSON.stringify({ lotes: d.lotes, planes: d.planes, ejecuciones: d.ejecuciones, receta }), antes);
  d.lotes[0].costoCompra *= 3;
  assert.equal(indicadoresResultado(d.ejecuciones[0], r.value).costo, 100000);
});
await prueba('cero vendibles conserva el costo de pérdida y evita división por cero', () => {
  const d = base(); const r = guardarResultadoEn(d, solicitud(d, { vendible: 0, rechazado: 100 }), autor);
  assert.equal(r.ok, true);
  const i = indicadoresResultado(d.ejecuciones[0], r.value);
  assert.equal(i.costoReal, null); assert.equal(i.variacionCosto, null); assert.equal(i.costo, 100000);
});
await prueba('sin rendimiento y rendimientos alternativos requieren medida explícita', () => {
  for (const nombre of ['MASA BASE', 'BAGUEL X 32 UND O 8 PAQ.']) {
    const d = base({ ...receta, nombre });
    assert.deepEqual(rendimientoPrevisto(d.ejecuciones[0].entradas[0]), { cantidad: null, unidad: null });
    assert.equal(guardarResultadoEn(d, solicitud(d), autor).code, 'unidad');
    const r = guardarResultadoEn(d, solicitud(d, { unidad: 'KG', esperado: '2,5', vendible: '2,25', rechazado: '0,25' }), autor);
    assert.equal(r.ok, true); assert.equal(r.value.unidad, 'KG'); assert.equal(r.value.esperado, 2.5);
    assert.equal(indicadoresResultado(d.ejecuciones[0], r.value).costoReal, 100000 / 2.25);
  }
});
await prueba('sin meta no se inventa comparación y cero gramos medidos difiere de no medido', () => {
  const d = base({ ...receta, nombre: 'BASE' });
  const r = guardarResultadoEn(d, solicitud(d, { unidad: 'GR', esperado: '', mermaPreparacionGr: 0, mermaCoccionGr: '' }), autor);
  assert.equal(r.ok, true); assert.equal(r.value.esperado, null);
  assert.equal(r.value.mermaPreparacionGr, 0); assert.equal(r.value.mermaCoccionGr, null);
  assert.equal(indicadoresResultado(d.ejecuciones[0], r.value).costoPrevisto, null);
});
await prueba('corregir exige motivo y revisión; conserva evidencia y consumo', () => {
  const d = base(); guardarResultadoEn(d, solicitud(d), autor);
  const antes = JSON.stringify(d.lotes);
  assert.equal(guardarResultadoEn(d, solicitud(d), autor).code, 'conflicto');
  assert.equal(guardarResultadoEn(d, solicitud(d, { revision: 1, motivo: '' }), autor).code, 'motivo');
  assert.equal(guardarResultadoEn(d, solicitud(d, { revision: 1, vendible: 95, rechazado: 5, motivo: 'Reconteo' }), autor).ok, true);
  assert.equal(d.resultados.length, 1); assert.equal(d.resultados[0].revision, 2);
  const evento = d.eventos.at(-1);
  assert.equal(evento.antes.vendible, 90); assert.equal(evento.despues.vendible, 95);
  assert.equal(JSON.stringify(d.lotes), antes);
});
await prueba('permisos del núcleo: autor registra, jefe corrige; tercero no puede', () => {
  const d = base(); d.ejecuciones[0].autor = operario;
  assert.equal(guardarResultadoEn(d, solicitud(d), { ...operario, id: 'otro' }).code, 'permiso');
  assert.equal(guardarResultadoEn(d, solicitud(d), operario).ok, true);
  assert.equal(guardarResultadoEn(d, solicitud(d, { revision: 1 }), operario).code, 'permiso');
  assert.equal(guardarResultadoEn(d, solicitud(d, { revision: 1 }), autor).ok, true);
  assert.equal(guardarResultadoEn(d, solicitud(d), null).code, 'autor');
});
await prueba('producción adicional conserva dos mediciones y sus propios costos', () => {
  const d = base(); guardarResultadoEn(d, solicitud(d), autor);
  guardarPlanEn(d, { fecha, revision: 1, entradas: [{ id: receta.id, factor: 1.5 }], responsable: 'QA', motivo: 'Extra' }, [receta]);
  confirmarRecetaEn(d, { fecha, revision: 2, recetaId: receta.id, costeo: costeoPendiente(d, fecha) }, autor);
  const extra = d.ejecuciones[1];
  assert.equal(guardarResultadoEn(d, solicitud(d, { produccionId: extra.id, vendible: 50, rechazado: 0 }), autor).ok, true);
  assert.equal(d.resultados.length, 2); assert.equal(resultadoDe(d, extra.id, receta.id).esperado, 50);
  assert.equal(indicadoresResultado(extra, d.resultados[1]).costoReal, 1000);
  assert.equal(d.lotes[0].existencia, 8500);
});
await prueba('costos compartidos históricos se reparten una vez por receta', () => {
  const d = base(), e = d.ejecuciones[0];
  e.entradas.push({ recipe: { ...receta, id: 'OTRA' }, factor: 1 });
  e.costeo.lineas[0].consumo *= 2;
  assert.equal(costoDeResultado(e, receta.id), 50000);
  assert.equal(costoDeResultado(e, 'OTRA'), 50000);
});
await prueba('validación rechaza cantidades vacías, negativas, infinitas y motivo omitido', () => {
  for (const cambio of [{ vendible: '' }, { vendible: -1 }, { vendible: Infinity }, { rechazado: 'abc' },
    { mermaPreparacionGr: -1 }, { mermaCoccionGr: 'NaN' }, { vendible: 1e13 }, { vendible: 1e-320 },
    { motivo: '' }, { motivo: 'a'.repeat(501) }, { produccionId: 'NO' }]) {
    const d = base(), antes = JSON.stringify(d);
    assert.equal(guardarResultadoEn(d, solicitud(d, cambio), autor).ok, false, JSON.stringify(cambio));
    assert.equal(JSON.stringify(d), antes);
  }
});
await prueba('meta declarada se congela desde la fórmula y permite excederla con motivo', () => {
  const d = base();
  assert.equal(guardarResultadoEn(d, solicitud(d, { vendible: 110, rechazado: 0, motivo: '', mermaPreparacionGr: '' }), autor).code, 'motivo');
  const r = guardarResultadoEn(d, solicitud(d, { esperado: 300, unidad: 'KG', vendible: 110, rechazado: 0, motivo: 'Piezas de menor peso' }), autor);
  assert.equal(r.value.esperado, 100); assert.equal(r.value.unidad, 'UND');
  assert.equal(Math.round(indicadoresResultado(d.ejecuciones[0], r.value).cumplimiento), 110);
});
await prueba('compatibilidad antigua y persistencia validada; datos dañados se bloquean', () => {
  const d = base(); memoria.set(CLAVE_OPERACION, JSON.stringify(d));
  assert.equal(leerOperacion().ok, true); assert.deepEqual(leerOperacion().value.resultados, []);
  guardarResultadoEn(d, solicitud(d), autor); memoria.set(CLAVE_OPERACION, JSON.stringify(d));
  assert.equal(leerOperacion().ok, true);
  for (const alterar of [(x) => { x.resultados[0].vendible = -1; }, (x) => { x.resultados[0].produccionId = 'inexistente'; },
    (x) => { x.resultados.push(x.resultados[0]); }, (x) => { x.resultados = {}; },
    (x) => { x.eventos.at(-1).despues.rechazado = -10; }]) {
    const dañado = structuredClone(d); alterar(dañado);
    memoria.set(CLAVE_OPERACION, JSON.stringify(dañado)); assert.equal(leerOperacion().ok, false);
  }
});
await prueba('dos pestañas registrando a la vez: solo una gana y ninguna repite el consumo', async () => {
  const d = base(); memoria.set(CLAVE_OPERACION, JSON.stringify(d));
  const resultados = await Promise.all([1, 2].map(() => transaccionOperacion((doc) => guardarResultadoEn(doc, solicitud(d), autor))));
  assert.equal(resultados.filter((r) => r.ok).length, 1);
  assert.equal(resultados.find((r) => !r.ok).code, 'conflicto');
  const leido = leerOperacion(); assert.equal(leido.ok, true);
  assert.equal(leido.value.resultados.length, 1); assert.deepEqual(leido.value.lotes, d.lotes);
});
console.log(`${total} comprobaciones de resultados de producción correctas.`);
