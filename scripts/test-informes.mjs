/**
 * =============================================================================
 *  PRUEBA DEL GASTO DE PRODUCCION EN EL TIEMPO
 * =============================================================================
 *
 *  Lo que se fija aqui es lo que haria mentir a la grafica sin que se note:
 *
 *      1. Que un periodo sin produccion desaparezca en vez de valer cero.
 *      2. Que una produccion caiga en la semana o el mes equivocado.
 *      3. Que las areas no sumen el total del periodo.
 *      4. Que cambiar hoy un precio cambie lo que costo el mes pasado.
 *
 *  Las producciones se crean con las mismas reglas que la aplicacion
 *  (`guardarPlanEn` y `aprobarPlanEn`) y cada total esperado se calcula aqui por
 *  otro camino: filtrando las producciones por fecha. Solo las fechas de
 *  calendario (años bisiestos, cambio de año) van escritas, porque son el
 *  propio caso que se comprueba.
 *
 *  Se ejecuta con:  node scripts/test-informes.mjs
 */

import assert from 'node:assert/strict';
import { hoyLocal, sumarDias } from '../src/core/bitacora.js';
import { guardarPlanEn, aprobarPlanEn, pendientesDelPlan } from '../src/core/produccion.js';
import { serieDeGasto, variacionReciente, inicioDePeriodo, PERIODOS_GASTO } from '../src/core/informes.js';
import { consolidar } from '../src/core/plan.js';
import { costearPlan } from '../src/core/costeo.js';
import { normalizarLote } from '../src/core/almacen.js';
import { CATEGORIES } from '../src/core/schema.js';

const hoy = hoyLocal();
const PERIODOS = Object.keys(PERIODOS_GASTO);

const receta = (id, categoria, gramos) => ({ id, nombre: `QA ${id} X 2 UND`, categoria, metodo: '',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad: String(gramos), unidad: 'GR' }] }] });
const pan = receta('QA-PAN', CATEGORIES[1], 100);
const torta = receta('QA-TORTA', CATEGORIES[0], 250);
const recetas = [pan, torta];

/** Una bodega que alcanza para todo el escenario, comprada antes del primer dia. */
function datosVacios() {
  const lote = normalizarLote({ id: 'L001', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 1000000, costoCompra: 7000000,
    existencia: 1000000, proveedor: 'QA', fechaCompra: sumarDias(hoy, -900), vencimiento: sumarDias(hoy, 900) });
  return { version: 1, operacionVersion: 1, secuencia: 0, lotes: [lote], planes: [], ejecuciones: [], eventos: [] };
}

/** Programa y confirma un dia con las reglas reales; `area` confirma solo esa. */
function producir(datos, fecha, tandas, area) {
  const plan = datos.planes.find((p) => p.fecha === fecha);
  const guardado = guardarPlanEn(datos, { fecha, revision: plan?.revision || 0, responsable: 'QA', motivo: 'Prueba',
    entradas: Object.entries(tandas).map(([id, factor]) => ({ id, factor })) }, recetas);
  assert.equal(guardado.ok, true, guardado.message);
  const actual = datos.planes.find((p) => p.fecha === fecha);
  const pendientes = pendientesDelPlan(datos, actual, area);
  const aprobado = aprobarPlanEn(datos, { fecha, revision: actual.revision, responsable: 'QA', motivo: 'Prueba', area,
    costeo: costearPlan(consolidar(pendientes).lineas, datos.lotes, fecha) });
  assert.equal(aprobado.ok, true, aprobado.message);
}

/** El escenario: producciones repartidas a lo largo de más de un año. */
function escenario() {
  const datos = datosVacios();
  for (const [atras, tandas] of [[0, { 'QA-PAN': 1 }], [1, { 'QA-PAN': 2, 'QA-TORTA': 1 }], [6, { 'QA-TORTA': 3 }],
    [13, { 'QA-PAN': 1.5 }], [40, { 'QA-PAN': 4, 'QA-TORTA': 2 }], [95, { 'QA-TORTA': 1 }], [420, { 'QA-PAN': 5 }]]) {
    producir(datos, sumarDias(hoy, -atras), tandas);
  }
  // Un dia confirmado por partes: primero una area y luego la otra.
  const partido = sumarDias(hoy, -3);
  producir(datos, partido, { 'QA-PAN': 1, 'QA-TORTA': 2 }, CATEGORIES[1]);
  producir(datos, partido, { 'QA-PAN': 1, 'QA-TORTA': 2 }, CATEGORIES[0]);
  return datos;
}

/** El total esperado de un tramo, sumando las producciones de otra manera. */
const gastoEntre = (datos, desde, hasta) => datos.ejecuciones
  .filter((e) => e.fecha >= desde && e.fecha <= hasta)
  .reduce((suma, e) => suma + e.costeo.costoTotal, 0);

let cantidadPruebas = 0;
function prueba(nombre, fn) { fn(); cantidadPruebas++; console.log(`OK ${nombre}`); }

prueba('sin producción salen todos los periodos, en cero y seguidos', () => {
  for (const periodo of PERIODOS) {
    const { value } = serieDeGasto(datosVacios(), periodo, { hasta: hoy });
    assert.equal(value.puntos.length, PERIODOS_GASTO[periodo].cantidad, periodo);
    assert.equal(value.total, 0);
    assert.equal(value.maximo, 0);
    assert.ok(value.puntos.every((p) => p.total === 0 && p.producciones === 0));
    const ultimo = value.puntos.at(-1);
    assert.ok(ultimo.desde <= hoy && hoy <= ultimo.hasta, `${periodo}: hoy fuera del último periodo`);
    for (let i = 1; i < value.puntos.length; i++) {
      assert.equal(sumarDias(value.puntos[i - 1].hasta, 1), value.puntos[i].desde, `${periodo}: hueco o solape en ${i}`);
    }
    // Todas las áreas del catálogo, aunque valgan cero.
    assert.deepEqual(Object.keys(ultimo.porArea).sort(), [...CATEGORIES].sort());
  }
});

prueba('las semanas empiezan en lunes y los meses y años en su día 1', () => {
  const lunes = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay() === 1;
  assert.ok(serieDeGasto(datosVacios(), 'semana', { hasta: hoy }).value.puntos.every((p) => lunes(p.desde)));
  assert.ok(serieDeGasto(datosVacios(), 'mes', { hasta: hoy }).value.puntos.every((p) => p.desde.endsWith('-01')));
  assert.ok(serieDeGasto(datosVacios(), 'año', { hasta: hoy }).value.puntos.every((p) => p.desde.endsWith('-01-01')));
});

prueba('calendario: bisiesto, cambio de año y semana partida entre dos años', () => {
  const meses = serieDeGasto(datosVacios(), 'mes', { hasta: '2024-03-31', cantidad: 3 }).value.puntos;
  assert.deepEqual(meses.map((p) => [p.desde, p.hasta]),
    [['2024-01-01', '2024-01-31'], ['2024-02-01', '2024-02-29'], ['2024-03-01', '2024-03-31']]);
  const semana = serieDeGasto(datosVacios(), 'semana', { hasta: '2026-01-01', cantidad: 1 }).value.puntos[0];
  assert.deepEqual([semana.desde, semana.hasta], ['2025-12-29', '2026-01-04']);
  const anios = serieDeGasto(datosVacios(), 'año', { hasta: '2026-02-10', cantidad: 2 }).value.puntos;
  assert.deepEqual(anios.map((p) => p.hasta), ['2025-12-31', '2026-12-31']);
  assert.equal(inicioDePeriodo('2026-09-16', 'dia'), '2026-09-16');
});

prueba('cada periodo suma exactamente las producciones que caen en él', () => {
  const datos = escenario();
  for (const periodo of PERIODOS) {
    const { value } = serieDeGasto(datos, periodo, { hasta: hoy });
    for (const punto of value.puntos) {
      assert.equal(punto.total, gastoEntre(datos, punto.desde, punto.hasta), `${periodo} ${punto.desde}`);
      assert.equal(punto.producciones, datos.ejecuciones.filter((e) => e.fecha >= punto.desde && e.fecha <= punto.hasta).length);
    }
    assert.equal(value.total, gastoEntre(datos, value.puntos[0].desde, hoy), periodo);
    assert.equal(value.maximo, Math.max(...value.puntos.map((p) => p.total)));
  }
  // El escenario tiene producción dentro y fuera de cada ventana: si no, la
  // comprobación anterior pasaría con una serie vacía.
  assert.ok(serieDeGasto(datos, 'dia', { hasta: hoy }).value.total > 0);
  assert.ok(serieDeGasto(datos, 'dia', { hasta: hoy }).value.total < gastoEntre(datos, '0000-01-01', hoy));
});

prueba('las áreas suman el total de cada periodo, también en días confirmados por partes', () => {
  const datos = escenario();
  for (const periodo of PERIODOS) {
    for (const punto of serieDeGasto(datos, periodo, { hasta: hoy }).value.puntos) {
      const suma = Object.values(punto.porArea).reduce((s, v) => s + v, 0);
      assert.equal(suma, punto.total, `${periodo} ${punto.desde}`);
    }
  }
  const partido = serieDeGasto(datos, 'dia', { hasta: sumarDias(hoy, -3), cantidad: 1 }).value.puntos[0];
  assert.ok(partido.porArea[CATEGORIES[0]] > 0 && partido.porArea[CATEGORIES[1]] > 0);
  assert.equal(partido.porArea[CATEGORIES[2]], 0);
  assert.equal(partido.producciones, 2);
});

prueba('lo posterior al final del informe no se cuenta', () => {
  const datos = escenario();
  const ayer = sumarDias(hoy, -1);
  const { value } = serieDeGasto(datos, 'semana', { hasta: ayer });
  assert.equal(value.puntos.at(-1).total, gastoEntre(datos, value.puntos.at(-1).desde, ayer));
  assert.equal(value.total, gastoEntre(datos, value.puntos[0].desde, ayer));
});

prueba('un precio nuevo no cambia lo que costó la producción pasada', () => {
  const datos = escenario();
  const antes = JSON.stringify(serieDeGasto(datos, 'mes', { hasta: hoy }).value);
  datos.lotes[0].costoCompra *= 3;
  assert.equal(JSON.stringify(serieDeGasto(datos, 'mes', { hasta: hoy }).value), antes);
});

prueba('un área fuera del catálogo aparece como área propia', () => {
  const datos = datosVacios();
  const especial = receta('QA-ESP', 'ESPECIALES', 50);
  recetas.push(especial);
  try {
    producir(datos, hoy, { 'QA-ESP': 1 });
    const { value } = serieDeGasto(datos, 'dia', { hasta: hoy, cantidad: 1 });
    assert.ok(value.areas.includes('ESPECIALES'));
    assert.equal(value.puntos[0].porArea.ESPECIALES, value.total);
  } finally {
    recetas.pop();
  }
});

prueba('entradas inválidas se rechazan con su código', () => {
  const datos = datosVacios();
  assert.equal(serieDeGasto(datos, 'hora').code, 'periodo');
  assert.equal(serieDeGasto(datos, 'toString').code, 'periodo');
  assert.equal(serieDeGasto(datos, 'mes', { hasta: '2026-02-30' }).code, 'fecha');
  for (const cantidad of [0, -1, 1.5, 367]) assert.equal(serieDeGasto(datos, 'mes', { cantidad }).code, 'cantidad');
  assert.equal(serieDeGasto({}, 'mes').code, 'datos');
});

prueba('la variación compara los dos últimos periodos y no inventa porcentajes', () => {
  assert.equal(variacionReciente([]), null);
  assert.equal(variacionReciente([{ total: 0 }, { total: 500 }]), null);
  assert.equal(variacionReciente([{ total: 400 }, { total: 500 }]), 0.25);
  assert.equal(variacionReciente([{ total: 400 }, { total: 0 }]), -1);
});

console.log(`${cantidadPruebas} comprobaciones del gasto de producción correctas.`);
