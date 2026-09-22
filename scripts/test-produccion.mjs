import assert from 'node:assert/strict';
import { leerOperacion, transaccionOperacion, CLAVE_OPERACION, hoyLocal, periodoDe, semanaDe, sumarDias } from '../src/core/bitacora.js';
import { guardarPlanEn, aprobarPlanEn, pendientesDelPlan, proyectarPlanes, tandasParaUnidades, eliminarPlanEn } from '../src/core/produccion.js';
import { FACTOR_MIN, FACTOR_MAX, rendimientoBase } from '../src/core/scale.js';
import { seguimientoProductos } from '../src/core/seguimiento.js';
import { consolidar } from '../src/core/plan.js';
import { costearPlan } from '../src/core/costeo.js';
import { normalizarLote, validarLote } from '../src/core/almacen.js';

const memoria = new Map();
let cuota = false, cola = Promise.resolve();
globalThis.window = { localStorage: {
  getItem: (k) => memoria.get(k) ?? null,
  setItem: (k, v) => { if (cuota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } memoria.set(k, v); },
  removeItem: (k) => memoria.delete(k),
} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
  request: (_nombre, fn) => { const turno = cola.then(fn); cola = turno.catch(() => {}); return turno; },
} } });
const fecha = hoyLocal();
const receta = { id: 'QA-R', nombre: 'QA PAN X 2 UND', categoria: 'PANADERIA', metodo: 'Mezclar',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad: '100', unidad: 'GR' }] }] };
const lote = normalizarLote({ id: 'L001', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 1000, costoCompra: 10000,
  existencia: 1000, proveedor: 'Proveedor A', fechaCompra: fecha, vencimiento: sumarDias(fecha, 60) });
const base = () => ({ version: 1, operacionVersion: 1, secuencia: 0, lotes: [structuredClone(lote)], planes: [], ejecuciones: [], eventos: [] });
const solicitud = (factor = 1, extras = {}) => ({ fecha, revision: 0, responsable: 'QA', motivo: 'Pedido', entradas: [{ id: receta.id, factor }], ...extras });
const previa = (datos, extras = {}) => ({ fecha, revision: datos.planes[0].revision, responsable: 'QA', motivo: 'Producción confirmada',
  costeo: costearPlan(consolidar(pendientesDelPlan(datos, datos.planes[0])).lineas, datos.lotes, fecha), ...extras });
let cantidadPruebas = 0;
async function prueba(nombre, fn) { await fn(); cantidadPruebas++; console.log(`OK ${nombre}`); }

await prueba('periodos de calendario y zona de Colombia', () => {
  assert.equal(hoyLocal(new Date('2026-01-01T02:00:00Z')), '2025-12-31');
  assert.deepEqual(periodoDe('2026-09-13', 'trimestre'), { desde: '2026-07-01', hasta: '2026-09-30' });
  assert.deepEqual(periodoDe('2024-02-14', 'mes'), { desde: '2024-02-01', hasta: '2024-02-29' });
  assert.deepEqual(periodoDe('2026-09-13', 'semestre'), { desde: '2026-07-01', hasta: '2026-12-31' });
  assert.equal(periodoDe('2026-01-01', 'año').hasta, '2026-12-31');
  assert.equal(semanaDe('2026-01-01')[0], '2025-12-29');
});
await prueba('planificar no descuenta; conserva la fórmula', () => {
  const datos = base();
  assert.equal(guardarPlanEn(datos, solicitud(), [receta]).ok, true);
  assert.equal(datos.lotes[0].existencia, 1000);
  assert.notEqual(datos.planes[0].entradas[0].recipe, receta);
  assert.equal(datos.eventos[0].tipo, 'plan_guardado');
});
await prueba('aprobación, costo congelado e idempotencia tras serializar', () => {
  let datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  const pedido = previa(datos);
  assert.equal(aprobarPlanEn(datos, pedido).ok, true);
  assert.equal(datos.lotes[0].existencia, 900);
  assert.equal(datos.ejecuciones[0].costeo.costoTotal, 1000);
  datos = JSON.parse(JSON.stringify(datos));
  assert.equal(aprobarPlanEn(datos, pedido).code, 'ya_producido');
  datos.lotes[0].costoCompra = 20000;
  assert.equal(datos.ejecuciones[0].costeo.costoTotal, 1000);
});
await prueba('las tandas adicionales descuentan solo la diferencia', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]); aprobarPlanEn(datos, previa(datos));
  assert.equal(guardarPlanEn(datos, solicitud(2, { revision: 1 }), [receta]).ok, true);
  assert.equal(aprobarPlanEn(datos, previa(datos)).ok, true);
  assert.equal(datos.lotes[0].existencia, 800);
  assert.equal(datos.ejecuciones[1].entradas[0].factor, 1);
  assert.equal(guardarPlanEn(datos, solicitud(1, { revision: 2 }), [receta]).code, 'ya_producido');
});
await prueba('fórmulas anteriores no cambian al editar el recetario', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  const editada = structuredClone(receta); editada.componentes[0].items[0].cantidad = '900';
  guardarPlanEn(datos, solicitud(2, { revision: 1 }), [editada]);
  assert.equal(datos.planes[0].entradas[0].recipe.componentes[0].items[0].cantidad, '100');
});
await prueba('rechaza revisiones obsoletas y números inválidos', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  assert.equal(guardarPlanEn(datos, solicitud(2), [receta]).code, 'conflicto');
  for (const factor of [0, -1, NaN, Infinity, 101]) assert.equal(guardarPlanEn(base(), solicitud(factor), [receta]).ok, false);
  assert.equal(guardarPlanEn(base(), solicitud(1, { fecha: '2026-02-30' }), [receta]).ok, false);
  assert.equal(guardarPlanEn(base(), solicitud(1, { responsable: '' }), [receta]).ok, false);
});
await prueba('no aprueba futuro ni cantidades adicionales que el escalado recortaría', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]); aprobarPlanEn(datos, previa(datos));
  assert.equal(guardarPlanEn(datos, solicitud(1.01, { revision: 1 }), [receta]).code, 'incremento');
  assert.equal(aprobarPlanEn(datos, { ...previa(datos), fecha: sumarDias(fecha, 1) }).code, 'futuro');
});
await prueba('faltantes y lotes vencidos impiden aprobar sin tocar stock', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(20), [receta]);
  assert.equal(aprobarPlanEn(datos, previa(datos)).code, 'faltantes');
  assert.equal(datos.lotes[0].existencia, 1000);
  datos.lotes[0].vencimiento = sumarDias(fecha, -1);
  assert.equal(aprobarPlanEn(datos, previa(datos)).code, 'faltantes');
  assert.equal(datos.ejecuciones.length, 0);
});
await prueba('un cambio de precio o stock invalida una aprobación calculada antes', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  const pedido = previa(datos); datos.lotes[0].costoCompra = 20000;
  assert.equal(aprobarPlanEn(datos, pedido).code, 'costeo_cambio');
  assert.equal(datos.ejecuciones.length, 0);
});
await prueba('la semana no promete dos veces las mismas existencias', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(8), [receta]);
  guardarPlanEn(datos, solicitud(8, { fecha: sumarDias(fecha, 1) }), [receta]);
  const proyeccion = proyectarPlanes(datos, fecha, sumarDias(fecha, 6));
  assert.equal(proyeccion[1].costeo.lineas[0].faltante, 600);
  assert.equal(datos.lotes[0].existencia, 1000);
});
await prueba('costos cero son válidos y no impiden producir', () => {
  const datos = base(); datos.lotes[0].costoCompra = 0;
  guardarPlanEn(datos, solicitud(), [receta]);
  assert.equal(aprobarPlanEn(datos, previa(datos)).ok, true);
  assert.equal(datos.ejecuciones[0].costeo.costoTotal, 0);
});
await prueba('migración mantiene existencias y no inventa compras pasadas', () => {
  memoria.set(CLAVE_OPERACION, JSON.stringify({ version: 1, lotes: [lote] }));
  const r = leerOperacion(); assert.equal(r.ok, true);
  assert.equal(r.value.eventos[0].tipo, 'apertura');
  assert.equal(r.value.lotes[0].existencia, 1000);
});
await prueba('copia corrupta y versión futura no se sobrescriben', async () => {
  for (const original of ['{roto', JSON.stringify({ version: 99, lotes: [] })]) {
    memoria.set(CLAVE_OPERACION, original);
    assert.equal((await transaccionOperacion((d) => guardarPlanEn(d, solicitud(), [receta]))).ok, false);
    assert.equal(memoria.get(CLAVE_OPERACION), original);
  }
});
await prueba('fallo de cuota no aplica ni descuento ni aprobación', async () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  memoria.set(CLAVE_OPERACION, JSON.stringify(datos));
  const original = memoria.get(CLAVE_OPERACION); cuota = true;
  const r = await transaccionOperacion((d) => aprobarPlanEn(d, previa(d))); cuota = false;
  assert.equal(r.ok, false); assert.equal(memoria.get(CLAVE_OPERACION), original);
});
await prueba('dos aprobaciones concurrentes solo descuentan una vez', async () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  memoria.set(CLAVE_OPERACION, JSON.stringify(datos));
  const pedido = previa(datos);
  const rs = await Promise.all([1, 2].map(() => transaccionOperacion((d) => aprobarPlanEn(d, pedido))));
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal(leerOperacion().value.lotes[0].existencia, 900);
});
await prueba('historial separa unidades, frecuencia de uso y saldo por periodo', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]); aprobarPlanEn(datos, previa(datos));
  datos.lotes.push({ ...lote, id: 'L002', unidad: 'UND', existencia: 30 });
  const seguimiento = seguimientoProductos(datos, { desde: fecha, hasta: fecha });
  assert.equal(seguimiento.length, 2);
  const harina = seguimiento.find((p) => p.unidad === 'GR');
  assert.equal(harina.consumido, 100); assert.equal(harina.diasConsumo, 1);
  assert.equal(harina.saldoCierre, 900); assert.equal(harina.cobertura, 9);
});
await prueba('captura no repara silenciosamente importes, existencias ni fechas inválidas', () => {
  for (const cambio of [{ costoCompra: 'abc' }, { existencia: 1001 }, { existencia: -1 }, { costoCompra: '' }, { vencimiento: '2026-02-30' }]) {
    assert.equal(validarLote({ ...lote, ...cambio }).ok, false);
  }
});
await prueba('tramos, líneas y total cuadran al redondear importes pequeños', () => {
  const pequenos = Array.from({ length: 10 }, (_, i) => ({ ...lote, id: `L${i}`, pesoCompra: 100, existencia: 1, costoCompra: 51 }));
  const c = costearPlan([{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 10 }], pequenos, fecha);
  assert.equal(c.costoTotal, 5);
  assert.equal(c.lineas[0].origen.reduce((s, o) => s + o.costo, 0), 5);
  assert.equal(c.lineas[0].origen.every((o) => o.costo >= 0), true);
});
await prueba('cobertura no mezcla unidades y la compra futura no cubre días anteriores', () => {
  const c = costearPlan([{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 100 }, { ingrediente: 'HUEVO', unidad: 'UND', cantidad: 1 }], [lote], fecha);
  assert.equal(c.cubiertoTotal, 0.5);
  assert.equal(costearPlan([{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 100 }], [{ ...lote, fechaCompra: sumarDias(fecha, 1) }], fecha).lineasConFaltante, 1);
});
await prueba('registros estructuralmente incompletos no se sobrescriben', async () => {
  const datos = base(); datos.planes = [null];
  const original = JSON.stringify(datos); memoria.set(CLAVE_OPERACION, original);
  assert.equal(leerOperacion().ok, false);
  assert.equal((await transaccionOperacion((d) => guardarPlanEn(d, solicitud(), [receta]))).ok, false);
  assert.equal(memoria.get(CLAVE_OPERACION), original);
});
await prueba('unidades extra: nunca menos de lo pedido y sin pasarse una tanda', () => {
  for (const rinde of [1, 2, 3, 7, 10, 12, 32, 150]) {
    const r = { ...receta, nombre: `QA PAN X ${rinde} UND` };
    for (let pedidas = 1; pedidas <= 60; pedidas++) {
      const u = tandasParaUnidades(r, pedidas);
      assert.equal(u.ok, true, `${rinde}/${pedidas}`);
      const { tandas, salen, alMinimo } = u.value;
      assert.ok(salen >= pedidas || Math.abs(salen - pedidas) < 1e-9, `${pedidas} de ${rinde}: salen ${salen}`);
      // La misma tolerancia con la que `guardarPlanEn` acepta tres decimales.
      assert.ok(Math.abs(tandas - Math.round(tandas * 1000) / 1000) <= 0.00000001, `${tandas}: más de tres decimales`);
      assert.equal(guardarPlanEn(base(), solicitud(tandas), [r]).ok, true, `${tandas} tandas no se pueden guardar`);
      // Una milésima menos ya no alcanzaría, salvo cuando manda el mínimo.
      if (!alMinimo) assert.ok((tandas - 0.001) * rinde < pedidas, `${pedidas} de ${rinde}: ${tandas} sobra`);
      else assert.equal(tandas, FACTOR_MIN);
    }
  }
});
await prueba('unidades extra: mínimo, errores y rendimiento de la receta', () => {
  const grande = { ...receta, nombre: 'QA PAN X 150 UND' };
  const una = tandasParaUnidades(grande, 1).value;
  assert.equal(una.alMinimo, true);
  assert.equal(una.salen, FACTOR_MIN * rendimientoBase(grande.nombre));
  assert.equal(tandasParaUnidades(receta, '2,5').value.pedidas, 2.5);
  // 161 / 5 × 1000 da 32200,000000000004 en coma flotante: sin margen subiría
  // a 32,201 tandas, una milésima de más en cada pedido de ese tamaño.
  const cinco = { ...receta, nombre: 'QA PAN X 5 UND' };
  assert.equal(tandasParaUnidades(cinco, 161).value.tandas * 5, 161);
  assert.equal(tandasParaUnidades(receta, 1).value.unidad, 'und');
  for (const malo of [0, -1, 'abc', '', null, Infinity]) assert.equal(tandasParaUnidades(receta, malo).code, 'unidades');
  assert.equal(tandasParaUnidades({ ...receta, nombre: 'QA MASA MADRE' }, 3).code, 'sin_rendimiento');
  assert.equal(tandasParaUnidades(receta, (FACTOR_MAX + 1) * rendimientoBase(receta.nombre)).code, 'exceso');
});
await prueba('unidades extra sobre un día ya producido descuentan solo lo añadido', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]); aprobarPlanEn(datos, previa(datos));
  const antes = datos.lotes[0].existencia;
  const extra = tandasParaUnidades(receta, 1).value;
  assert.equal(guardarPlanEn(datos, solicitud(1 + extra.tandas, { revision: 1 }), [receta]).ok, true);
  assert.equal(aprobarPlanEn(datos, previa(datos)).ok, true);
  const porTanda = Number(receta.componentes[0].items[0].cantidad);
  assert.equal(datos.ejecuciones[1].entradas[0].factor, extra.tandas);
  assert.equal(datos.lotes[0].existencia, antes - porTanda * extra.tandas);
});
await prueba('eliminar un plan sin producción deja constancia y libera el día', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  const lotesAntes = JSON.stringify(datos.lotes);
  const r = eliminarPlanEn(datos, { fecha, revision: 1, responsable: 'QA', motivo: 'Pedido cancelado' });
  assert.equal(r.ok, true);
  assert.equal(datos.planes.length, 0);
  assert.equal(JSON.stringify(datos.lotes), lotesAntes);
  const evento = datos.eventos.at(-1);
  assert.equal(evento.tipo, 'plan_eliminado');
  assert.equal(evento.antes.revision, 1);
  assert.equal(evento.motivo, 'Pedido cancelado');
  // El historial con la eliminación se sigue pudiendo leer y escribir.
  memoria.set(CLAVE_OPERACION, JSON.stringify(datos));
  assert.equal(leerOperacion().ok, true);
  assert.equal(guardarPlanEn(datos, solicitud(), [receta]).ok, true);
});
await prueba('no elimina con producción confirmada, revisión vieja ni sin traza', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  const pedido = { fecha, revision: 1, responsable: 'QA', motivo: 'Cancelado' };
  assert.equal(eliminarPlanEn(datos, { ...pedido, revision: 0 }).code, 'conflicto');
  assert.equal(eliminarPlanEn(datos, { ...pedido, responsable: ' ' }).code, 'traza');
  assert.equal(eliminarPlanEn(datos, { ...pedido, fecha: sumarDias(fecha, 1) }).code, 'sin_plan');
  aprobarPlanEn(datos, previa(datos));
  assert.equal(eliminarPlanEn(datos, pedido).code, 'ya_producido');
  assert.equal(datos.planes.length, 1);
  assert.equal(datos.eventos.some((e) => e.tipo === 'plan_eliminado'), false);
});
await prueba('un evento de eliminación mal formado bloquea el historial', () => {
  const datos = base(); guardarPlanEn(datos, solicitud(), [receta]);
  eliminarPlanEn(datos, { fecha, revision: 1, responsable: 'QA', motivo: 'Cancelado' });
  datos.eventos.at(-1).antes = null;
  memoria.set(CLAVE_OPERACION, JSON.stringify(datos));
  assert.equal(leerOperacion().ok, false);
});
console.log(`${cantidadPruebas} comprobaciones de producción correctas.`);
await import('./test-resultados.mjs');
