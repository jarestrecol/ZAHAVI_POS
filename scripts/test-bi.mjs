/**
 * =============================================================================
 *  PRUEBA DEL MOTOR DE INDICADORES DEL RESUMEN (core/bi)
 * =============================================================================
 *
 *  Lo que se fija aqui es lo que haria mentir al panel sin que se note:
 *
 *      1. Que un costo historico cambie porque hoy cambio el precio de un lote.
 *      2. Que el panel sin permiso de costos deje pasar alguna cifra de dinero.
 *      3. Que una division por cero salga como 0 % o infinito en vez de «sin datos».
 *      4. Que un periodo o una semana caigan en los dias equivocados.
 *      5. Que un operario pueda ver el panel o alguien sin gerencia cambie metas.
 *
 *  El escenario se construye con las funciones REALES del nucleo (planificar,
 *  empezar, asignar, confirmar, medir, eliminar un plan) sobre un documento en
 *  memoria, y luego se mueven los instantes al dia simulado. Cada cifra
 *  esperada esta calculada a mano en el comentario de su comprobacion.
 *
 *  Se ejecuta con:  node scripts/test-bi.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLAVE_OPERACION, copiar } from '../src/core/bitacora.js';
import { guardarPlanEn, aprobarPlanEn, costeoPendiente, eliminarPlanEn } from '../src/core/produccion.js';
import { iniciarPreparacionEn, cancelarPreparacionEn, asignarRecetaEn, confirmarRecetaEn } from '../src/core/preparacion.js';
import { guardarResultadoEn } from '../src/core/resultados-produccion.js';
import { normalizarLote } from '../src/core/almacen.js';
import { hechosDeOperacion } from '../src/core/bi/hechos.js';
import {
  PERIODOS_BI, PERIODO_POR_DEFECTO, rangoDe, cubetas, cubetaDe, variacionEntre, estadoContraMeta,
  nombreLegible, coberturaBajaResumen,
} from '../src/core/bi/periodos.js';
import {
  DEFINICION_METAS, METAS_BASE, normalizarMetas, validarMetas, leerMetas, escribirMetas, CLAVE_METAS,
} from '../src/core/bi/metas.js';
import { construirPanel, sinDinero } from '../src/core/bi/panel.js';
import { agregarResultados } from '../src/core/bi/rendimiento.js';
import { setState } from '../src/core/store.js';
import { cargarPanel, estadoMetas, guardarMetasResumen, prepararEjemplo } from '../src/app/resumen.js';

// --- Navegador simulado -------------------------------------------------------
const memoria = new Map();
let lecturaRota = false;
globalThis.window = { localStorage: {
  getItem: (k) => { if (lecturaRota) throw new Error('almacenamiento bloqueado'); return memoria.get(k) ?? null; },
  setItem: (k, v) => memoria.set(k, v),
  removeItem: (k) => memoria.delete(k),
} };

let cantidad = 0;
const fallos = [];
async function prueba(nombre, fn) {
  try {
    await fn();
    cantidad++;
    console.log(`OK ${nombre}`);
  } catch (error) {
    // Se sigue con las demas para ver todos los fallos de una pasada; al final sale con codigo 1.
    fallos.push(nombre);
    console.log(`FALLA ${nombre}\n   ${String(error.message).split('\n').join('\n   ')}`);
  }
}
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);
const ind = (lista, id) => {
  const i = lista.find((x) => x.id === id);
  assert.ok(i, `falta el indicador ${id}`);
  return i;
};

// --- Escenario -----------------------------------------------------------------
// Hoy simulado: martes 31 de marzo de 2026. Periodo por defecto (30 días):
// 2 al 31 de marzo; el anterior, 31 de enero al 1 de marzo.
const HOY = '2026-03-31';
const instante = (fecha, hora) => new Date(`${fecha}T${hora}:00-05:00`).toISOString();

const PAN = { id: 'QA-PAN', nombre: 'QA PAN X 10 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad: '100', unidad: 'GR' }] }] };
const TORTA = { id: 'QA-TORTA', nombre: 'QA TORTA X 2 PORC', categoria: 'PASTELERÍA', metodo: '',
  componentes: [{ nombre: 'Base', items: [
    { ingrediente: 'HARINA', cantidad: '200', unidad: 'GR' }, { ingrediente: 'HUEVO', cantidad: '2', unidad: 'UND' }] }] };
const GALLETA = { id: 'QA-GALLETA', nombre: 'QA GALLETA', categoria: 'GALLETAS', metodo: '',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'AZUCAR', cantidad: '50', unidad: 'GR' }] }] };
const GALLETA_2 = { ...GALLETA, id: 'QA-GALLETA-2', nombre: 'QA GALLETA DOS' };
const RECETAS = [PAN, TORTA, GALLETA, GALLETA_2];

const JEFE = { id: 'u-jefe', nombre: 'Jefe QA', codigo: 'JEFE', rol: 'obrador' };
const OPERARIA = { id: 'u-op', nombre: 'Operaria QA', codigo: 'OP', area: 'PASTELERÍA' };

const lote = (datos) => normalizarLote({ fechaCompra: '2026-03-01', registrado: instante('2026-03-01', '07:00'), ...datos });
// Precios por gramo: harina 2, huevo 500 / 50 g = 10, azucar 4, crema 5, harina nueva 2,5.
const LOTES = [
  lote({ id: 'L001', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 10000, costoCompra: 20000, existencia: 10000, proveedor: 'Molino', vencimiento: '2026-12-31' }),
  lote({ id: 'L002', ingrediente: 'HUEVO', unidad: 'UND', pesoCompra: 3, costoCompra: 1500, existencia: 3, equivalencias: { UND: 50 }, proveedor: 'Granja', vencimiento: '2026-04-05' }),
  lote({ id: 'L003', ingrediente: 'AZUCAR', unidad: 'KG', pesoCompra: 5, costoCompra: 20000, existencia: 5, proveedor: '' }),
  lote({ id: 'L004', ingrediente: 'LECHE', unidad: 'LT', pesoCompra: 1, costoCompra: 3000, existencia: 1, proveedor: 'Granja', vencimiento: '2026-12-31' }),
  lote({ id: 'L005', ingrediente: 'CREMA', unidad: 'GR', pesoCompra: 1000, costoCompra: 5000, existencia: 500, proveedor: 'Granja', vencimiento: '2026-03-20' }),
  lote({ id: 'L006', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 10000, costoCompra: 25000, existencia: 10000, proveedor: 'Molino', fechaCompra: '2026-03-28', vencimiento: '2027-01-31' }),
];

/** Corre una operacion del nucleo y mueve lo que creo al dia y hora simulados. */
function enDia(datos, fecha, hora, fn) {
  const eventos = datos.eventos.length;
  const ejecuciones = datos.ejecuciones.length;
  const r = fn();
  assert.ok(r.ok, `${fecha} ${hora}: ${r.message}`);
  const cuando = instante(fecha, hora);
  for (const e of datos.eventos.slice(eventos)) e.instante = cuando;
  for (const e of datos.ejecuciones.slice(ejecuciones)) e.instante = cuando;
  return r.value;
}
const revision = (datos, fecha) => datos.planes.find((p) => p.fecha === fecha)?.revision || 0;
const planear = (datos, fecha, hora, entradas) => enDia(datos, fecha, hora, () => guardarPlanEn(datos,
  { fecha, revision: revision(datos, fecha), responsable: 'Ana QA', motivo: 'Plan', entradas }, RECETAS));
const confirmar = (datos, fecha, hora, recetaId) => enDia(datos, fecha, hora, () => confirmarRecetaEn(datos,
  { fecha, revision: revision(datos, fecha), recetaId, costeo: costeoPendiente(datos, fecha, { recetaId }) }, JEFE));
const nota = (id, fecha, tipo, hecha = false) => ({ id, fecha, tipo, texto: `Nota ${id}`, area: null, persona: null, hecha, revision: 1,
  creada: instante(fecha, '06:00'), actualizada: instante(fecha, '06:00'), autor: { id: JEFE.id, nombre: JEFE.nombre, codigo: JEFE.codigo } });

function escenario() {
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: copiar(LOTES), planes: [], ejecuciones: [],
    eventos: [], notas: [], preparaciones: [], resultados: [] };
  // Compras registradas en bodega (el lote de harina nueva, el 28).
  for (const l of LOTES) {
    const fecha = l.fechaCompra;
    datos.eventos.push({ id: `compra-${l.id}`, tipo: 'compra', instante: instante(fecha, '07:00'), responsable: 'Ana QA',
      motivo: 'Compra', antes: null, despues: copiar(l) });
  }

  // Lunes 2: 2 tandas de pan confirmadas con el plan entero (sin firma de sesion).
  planear(datos, '2026-03-02', '06:00', [{ id: PAN.id, factor: 2 }]);
  enDia(datos, '2026-03-02', '10:00', () => aprobarPlanEn(datos, { fecha: '2026-03-02', revision: revision(datos, '2026-03-02'),
    responsable: 'Ana QA', motivo: 'Producción', costeo: costeoPendiente(datos, '2026-03-02') }));

  // Domingo 15: un plan que se elimina. No debe contar en nada.
  planear(datos, '2026-03-15', '06:00', [{ id: GALLETA.id, factor: 4 }]);
  enDia(datos, '2026-03-15', '07:00', () => eliminarPlanEn(datos, { fecha: '2026-03-15', revision: revision(datos, '2026-03-15'),
    responsable: 'Ana QA', motivo: 'Se canceló el pedido' }));

  // Lunes 30: pan (empezado 8:00, listo 9:30 = 90 min), torta (empezada y
  // cancelada, confirmada sin volver a empezar: sin tiempo) y galleta sin hacer.
  planear(datos, '2026-03-30', '06:00', [{ id: PAN.id, factor: 1 }, { id: TORTA.id, factor: 1 }, { id: GALLETA.id, factor: 1 }]);
  enDia(datos, '2026-03-30', '08:00', () => iniciarPreparacionEn(datos, { fecha: '2026-03-30', recetaId: PAN.id }, JEFE));
  confirmar(datos, '2026-03-30', '09:30', PAN.id);
  enDia(datos, '2026-03-30', '07:00', () => iniciarPreparacionEn(datos, { fecha: '2026-03-30', recetaId: TORTA.id }, JEFE));
  enDia(datos, '2026-03-30', '07:10', () => cancelarPreparacionEn(datos, { fecha: '2026-03-30', recetaId: TORTA.id }, JEFE));
  confirmar(datos, '2026-03-30', '11:00', TORTA.id);

  // Martes 31 (hoy): 1 tanda de pan confirmada y luego 2 adicionales el mismo
  // dia; torta asignada y empezada, sin confirmar.
  planear(datos, HOY, '05:00', [{ id: PAN.id, factor: 1 }]);
  confirmar(datos, HOY, '07:00', PAN.id);
  planear(datos, HOY, '08:00', [{ id: PAN.id, factor: 3 }, { id: TORTA.id, factor: 1 }]);
  enDia(datos, HOY, '08:05', () => asignarRecetaEn(datos, { fecha: HOY, recetaId: TORTA.id, trabajador: OPERARIA }, JEFE));
  enDia(datos, HOY, '08:10', () => iniciarPreparacionEn(datos, { fecha: HOY, recetaId: TORTA.id }, JEFE));

  // Resultados: pan del 2 (20 esperadas, 18 buenas, 2 malas, 100 g de merma)
  // y torta del 30 (2 porciones de 2). El pan del 30 queda sin medir.
  const ejecucion = (fecha, recetaId) => datos.ejecuciones.find((e) => e.fecha === fecha && e.entradas.some((x) => x.recipe.id === recetaId));
  enDia(datos, '2026-03-02', '15:00', () => guardarResultadoEn(datos, { produccionId: ejecucion('2026-03-02', PAN.id).id, recetaId: PAN.id,
    revision: 0, vendible: 18, rechazado: 2, mermaPreparacionGr: 100, motivo: 'Dos quemados' }, JEFE));
  enDia(datos, '2026-03-30', '15:00', () => guardarResultadoEn(datos, { produccionId: ejecucion('2026-03-30', TORTA.id).id, recetaId: TORTA.id,
    revision: 0, vendible: 2, rechazado: 0 }, JEFE));

  datos.notas.push(nota('N1', '2026-03-29', 'tarea'), nota('N2', '2026-03-30', 'felicitacion'),
    nota('N3', '2026-03-10', 'pendiente', true), nota('N4', '2026-04-02', 'tarea'));
  return datos;
}

const DATOS = escenario();
const hechosDe = (datos, hoy = HOY) => {
  const r = hechosDeOperacion(datos, RECETAS, { hoy });
  assert.ok(r.ok, r.message);
  return r.value;
};
const panelDe = (hechos, opciones = {}) => {
  const r = construirPanel(hechos, { periodo: '30d', metas: METAS_BASE, verCostos: true, ...opciones });
  assert.ok(r.ok, r.message);
  return r.value;
};

// --- Periodos ---------------------------------------------------------------------
await prueba('periodos: rangos, anteriores y cambio de mes y de año', () => {
  assert.deepEqual(Object.keys(PERIODOS_BI), ['7d', '30d', 'mes', '12s', '12m']);
  assert.equal(PERIODO_POR_DEFECTO, '30d');
  const siete = rangoDe('7d', HOY).value;
  assert.deepEqual([siete.desde, siete.hasta, siete.dias, siete.anterior.desde, siete.anterior.hasta],
    ['2026-03-25', HOY, 7, '2026-03-18', '2026-03-24']);
  const treinta = rangoDe('30d', HOY).value;
  assert.deepEqual([treinta.desde, treinta.anterior.desde, treinta.anterior.hasta], ['2026-03-02', '2026-01-31', '2026-03-01']);
  // Este mes al 31 de marzo contra febrero entero (acotado a su fin).
  const mes = rangoDe('mes', HOY).value;
  assert.deepEqual([mes.desde, mes.dias, mes.anterior.desde, mes.anterior.hasta], ['2026-03-01', 31, '2026-02-01', '2026-02-28']);
  assert.deepEqual(rangoDe('mes', '2024-03-30').value.anterior, { desde: '2024-02-01', hasta: '2024-02-29' });
  assert.deepEqual(rangoDe('mes', '2026-01-10').value.anterior, { desde: '2025-12-01', hasta: '2025-12-10' });
  // 12 semanas desde el lunes de hace 11 semanas (hoy martes 31: lunes 30 - 77 dias).
  const doce = rangoDe('12s', HOY).value;
  assert.deepEqual([doce.desde, doce.anterior.desde, doce.anterior.hasta], ['2026-01-12', '2025-10-20', '2026-01-11']);
  const anio = rangoDe('12m', '2026-01-10').value;
  assert.deepEqual([anio.desde, anio.anterior.desde, anio.anterior.hasta], ['2025-02-01', '2024-02-01', '2025-01-31']);
  assert.equal(rangoDe('90d', HOY).ok, false);
  assert.equal(rangoDe('7d', '2026-02-30').ok, false);
});

await prueba('periodos: cubetas parciales, semanas desde el lunes y variacion sin division por cero', () => {
  const semanas = cubetas('2026-01-12', HOY, 'semana');
  assert.equal(semanas.length, 12);
  assert.deepEqual(semanas.at(-1), { desde: '2026-03-30', hasta: HOY });
  assert.deepEqual(cubetas('2026-03-04', '2026-03-10', 'semana'), [{ desde: '2026-03-04', hasta: '2026-03-08' }, { desde: '2026-03-09', hasta: '2026-03-10' }]);
  assert.deepEqual(cubetas('2026-03-15', '2026-05-10', 'mes'), [{ desde: '2026-03-15', hasta: '2026-03-31' },
    { desde: '2026-04-01', hasta: '2026-04-30' }, { desde: '2026-05-01', hasta: '2026-05-10' }]);
  assert.deepEqual(cubetas('2025-12-30', '2026-01-02', 'dia').map((c) => c.desde), ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  assert.equal(cubetaDe('2026-01-01', 'semana'), '2025-12-29');
  assert.equal(cubetaDe('2026-03-01', 'semana'), '2026-02-23');
  assert.equal(cubetaDe('2026-03-31', 'mes'), '2026-03-01');
  assert.equal(variacionEntre(120, 100), 0.2);
  assert.equal(variacionEntre(5, 0), null);
  assert.equal(variacionEntre(null, 3), null);
  assert.equal(estadoContraMeta(90, 90, 'subir', 5), 'bien');
  assert.equal(estadoContraMeta(86, 90, 'subir', 5), 'atencion');
  assert.equal(estadoContraMeta(84.9, 90, 'subir', 5), 'mal');
  assert.equal(estadoContraMeta(7, 5, 'bajar', 2.5), 'atencion');
  assert.equal(estadoContraMeta(7.6, 5, 'bajar', 2.5), 'mal');
  assert.equal(estadoContraMeta(null, 5, 'bajar', 1), 'sin_datos');
  assert.equal(estadoContraMeta(3, null, 'bajar', 1), 'sin_meta');
});

// --- Hechos -------------------------------------------------------------------------
await prueba('hechos: una fila por receta confirmada, con costo congelado y sin mutar el documento', () => {
  const antes = JSON.stringify(DATOS);
  const h = hechosDe(DATOS);
  assert.equal(JSON.stringify(DATOS), antes, 'hechosDeOperacion no puede tocar el documento');
  assert.deepEqual(h.producciones.map((p) => `${p.fecha} ${p.recetaId} ${p.tandas} ${p.costo}`), [
    '2026-03-02 QA-PAN 2 400', '2026-03-30 QA-PAN 1 200', '2026-03-30 QA-TORTA 1 1400', '2026-03-31 QA-PAN 1 200']);
  assert.deepEqual(h.producciones.map((p) => p.persona.nombre), ['Ana QA', 'Jefe QA', 'Jefe QA', 'Jefe QA']);
  assert.equal(h.producciones[0].persona.id, null);
  assert.deepEqual(h.producciones.map((p) => p.porReceta), [false, true, true, true]);
  assert.deepEqual(h.producciones.map((p) => p.unidadesEsperadas), [20, 10, 2, 10]);
  assert.equal(h.producciones[2].unidadSalida, 'PORC');
  // El plan eliminado del 15 no aparece.
  assert.ok(!h.planeado.some((p) => p.fecha === '2026-03-15'));
  assert.deepEqual(h.pendientes.map((p) => `${p.fecha} ${p.recetaId} ${p.tandas}`), [
    '2026-03-30 QA-GALLETA 1', '2026-03-31 QA-PAN 2', '2026-03-31 QA-TORTA 1']);
  // Tiempos: solo el pan del 30 (90 min); la torta se cancelo y se confirmo sin empezar.
  assert.deepEqual(h.tiempos.map((t) => [t.recetaId, t.minutos]), [['QA-PAN', 90]]);
  assert.equal(h.lotes.find((l) => l.id === 'L004').gramosPorUnidad, null);
  assert.equal(h.lotes.find((l) => l.id === 'L002').gramosPorUnidad, 50);
  assert.deepEqual(h.lotes.find((l) => l.id === 'L002').equivalencias, { UND: 50 });
  const compra = h.movimientos.find((m) => m.id === 'compra-L006');
  assert.deepEqual([compra.fecha, compra.costoCompra, compra.precioPorGramo, compra.cantidad], ['2026-03-28', 25000, 2.5, 10000]);
  const consumos = h.movimientos.filter((m) => m.tipo === 'consumo');
  assert.equal(consumos.length, 5, 'pan, pan, torta (harina y huevo), pan');
  assert.ok(consumos.every((m) => m.cantidad < 0 && m.valor < 0));
  assert.deepEqual(h.consumoGramos.map((c) => [c.fecha, c.ingrediente, c.gramos, c.costo]), [
    ['2026-03-02', 'HARINA', 200, 400], ['2026-03-30', 'HARINA', 100, 200], ['2026-03-30', 'HARINA', 200, 400],
    ['2026-03-30', 'HUEVO', 100, 1000], ['2026-03-31', 'HARINA', 100, 200]]);
});

await prueba('hechos: una persona con sesion y la misma en confirmaciones antiguas solo con texto es una sola', () => {
  const datos = copiar(DATOS);
  const [vieja, conSesion] = [datos.ejecuciones[0], datos.ejecuciones[1]];
  conSesion.autor = { id: 'u-ana', nombre: 'Ana QA', codigo: 'ANA' };
  vieja.responsable = 'Ana QA (ANA)';
  delete vieja.autor;
  const extra = copiar(vieja);
  extra.id = 'vieja-2';
  extra.responsable = '  ana   qa ';
  extra.instante = instante('2026-03-02', '11:00');
  datos.ejecuciones.push(extra);
  const otra = copiar(vieja);
  otra.id = 'vieja-3';
  otra.responsable = 'Pedro QA (PED)';
  otra.instante = instante('2026-03-02', '12:00');
  datos.ejecuciones.push(otra);
  const h = hechosDe(datos);
  const porId = (id) => h.producciones.find((p) => p.ejecucionId === id).persona;
  assert.deepEqual(porId(vieja.id), { id: 'u-ana', nombre: 'Ana QA' });
  assert.deepEqual(porId('vieja-2'), { id: 'u-ana', nombre: 'Ana QA' });
  assert.deepEqual(porId('vieja-3'), { id: null, nombre: 'Pedro QA' }, 'sin sesion conocida: nombre sin codigo');
  const personas = panelDe(h).equipo.personas;
  assert.equal(personas.filter((p) => p.nombre === 'Ana QA').length, 1);
  assert.equal(personas.find((p) => p.nombre === 'Ana QA').recetas, 3);
});

await prueba('costos congelados: cambiar el precio de un lote despues no cambia lo que costo lo producido', () => {
  const datos = copiar(DATOS);
  const antes = panelDe(hechosDe(datos));
  const l = datos.lotes.find((x) => x.id === 'L001');
  const previo = copiar(l);
  l.costoCompra = 40000;
  datos.eventos.push({ id: 'ajuste-precio', tipo: 'ajuste', instante: instante(HOY, '12:00'), responsable: 'Ana QA',
    motivo: 'Precio corregido', antes: previo, despues: copiar(l) });
  const despues = panelDe(hechosDe(datos));
  assert.equal(ind(despues.produccion.indicadores, 'gasto').valor, ind(antes.produccion.indicadores, 'gasto').valor);
  assert.equal(ind(despues.produccion.indicadores, 'gasto').valor, 2200);
  assert.deepEqual(despues.produccion.recetas.map((r) => r.costo), antes.produccion.recetas.map((r) => r.costo));
  // La bodega si cambia: 9.400 g de L001 pasan de 2 a 4 pesos por gramo (+18.800).
  cerca(ind(despues.bodega.indicadores, 'valor_bodega').valor - ind(antes.bodega.indicadores, 'valor_bodega').valor, 18800, 'revaluacion');
  // Y el ajuste que solo cambia precio no es una perdida.
  assert.equal(ind(despues.bodega.indicadores, 'perdidas').valor, 0);
  assert.equal(ind(despues.bodega.indicadores, 'perdidas').base, '0 bajas o ajustes');
});

// --- Panel con costos -------------------------------------------------------------
const PANEL = panelDe(hechosDe(DATOS));

await prueba('panel: forma completa del contrato', () => {
  const claves = ['origen', 'hoy', 'rango', 'verCostos', 'hoyResumen', 'atencion', 'produccion', 'rendimiento', 'bodega', 'equipo', 'calidad'];
  assert.deepEqual(Object.keys(PANEL), claves);
  assert.deepEqual(Object.keys(PANEL.hoyResumen), ['indicadores', 'areas']);
  for (const k of ['indicadores', 'gasto', 'tandas', 'calor', 'semana', 'recetas', 'pareto', 'planVsReal']) assert.ok(k in PANEL.produccion, k);
  for (const k of ['indicadores', 'tendencia', 'porReceta', 'porArea']) assert.ok(k in PANEL.rendimiento, k);
  for (const k of ['indicadores', 'valor', 'comprasVsConsumo', 'proveedores', 'canasta', 'cobertura', 'vencimientos']) assert.ok(k in PANEL.bodega, k);
  for (const k of ['indicadores', 'personas', 'tiempos', 'notas']) assert.ok(k in PANEL.equipo, k);
  assert.deepEqual(Object.keys(PANEL.calidad), ['produccionesMedidas', 'produccionesTotales', 'recetasSinRendimiento',
    'lotesSinVencimiento', 'lotesSinEquivalencia', 'comprasSinProveedor']);
  const todos = [PANEL.hoyResumen, PANEL.produccion, PANEL.rendimiento, PANEL.bodega, PANEL.equipo].flatMap((s) => s.indicadores);
  for (const i of todos) {
    assert.deepEqual(Object.keys(i), ['id', 'nombre', 'valor', 'formato', 'anterior', 'variacion', 'sentido', 'meta', 'estado',
      'dinero', 'base', 'definicion', 'chispa', 'comparadoCon'], i.id);
    assert.ok(['pesos', 'numero', 'porcentaje', 'dias', 'kg', 'minutos', 'tandas', 'unidades'].includes(i.formato), i.id);
    assert.ok(['bien', 'atencion', 'mal', 'sin_meta', 'sin_datos'].includes(i.estado), i.id);
    assert.ok(typeof i.definicion === 'string' && i.definicion.length > 20, i.id);
  }
  assert.deepEqual(PANEL.hoyResumen.indicadores.map((i) => i.id), ['avance_hoy', 'en_preparacion', 'costo_hoy', 'presupuesto_mes',
    'rendimiento_7d', 'rechazo_7d', 'valor_bodega', 'cobertura_baja']);
  for (const s of [PANEL.produccion.gasto, PANEL.produccion.tandas, PANEL.rendimiento.tendencia, PANEL.bodega.valor, PANEL.bodega.comprasVsConsumo]) {
    assert.deepEqual(Object.keys(s), ['id', 'nombre', 'formato', 'dinero', 'grano', 'series', 'puntos', 'meta']);
    assert.equal(s.puntos.length, 30);
  }
  for (const a of PANEL.atencion) {
    assert.deepEqual(Object.keys(a).sort(), ['accion', 'cantidad', 'destino', 'detalle', 'dinero', 'id', 'prioridad', 'tipo', 'titulo', 'tono'].sort(), a.tipo);
  }
});

await prueba('produccion: gasto, tandas, unidades, cumplimiento del plan y ranking', () => {
  const p = PANEL.produccion;
  // 400 + 200 + 1.400 + 200. El periodo anterior (31 ene - 1 mar) no tiene produccion.
  assert.equal(ind(p.indicadores, 'gasto').valor, 2200);
  assert.equal(ind(p.indicadores, 'gasto').variacion, null);
  assert.equal(ind(p.indicadores, 'tandas').valor, 5);
  // Solo el pan rinde en UND: 20 + 10 + 10. La torta rinde en porciones.
  assert.equal(ind(p.indicadores, 'unidades').valor, 40);
  assert.equal(ind(p.indicadores, 'recetas_distintas').valor, 2);
  assert.equal(ind(p.indicadores, 'dias_con_produccion').valor, 3);
  // Plan: 2 + (1+1+1) + (3+1) = 9 tandas; confirmadas 2 + (1+1+0) + (1+0) = 5.
  cerca(ind(p.indicadores, 'cumplimiento_plan').valor, 500 / 9, 'cumplimiento');
  assert.equal(ind(p.indicadores, 'cumplimiento_plan').estado, 'mal');
  cerca(ind(p.indicadores, 'costo_por_dia').valor, 2200 / 3, 'gasto por dia');
  assert.deepEqual(p.planVsReal.map((a) => [a.area, a.planeadas, a.confirmadas]), [
    ['PASTELERÍA', 2, 1], ['PANADERÍA', 6, 4], ['GALLETAS', 1, 0]]);
  // Ranking por costo: torta 1.400 (63,6 %), pan 800.
  assert.deepEqual(p.recetas.map((r) => [r.recetaId, r.costo, r.tandas]), [['QA-TORTA', 1400, 1], ['QA-PAN', 800, 4]]);
  cerca(p.recetas[0].participacion, 1400 / 2200 * 100, 'participacion');
  cerca(p.recetas[1].acumulado, 100, 'acumulado');
  assert.equal(p.recetas[1].unidades, 40);
  assert.equal(p.recetas[1].costoUnidad, 20);
  assert.equal(p.recetas[0].unidades, null, 'la torta no rinde en UND');
  assert.deepEqual(p.pareto, { recetas: 2, top20: 1, porcentajeTop20: 1400 / 2200 * 100 });
  // Gasto por dia: el 30 = 200 + 1.400, total y areas cuadran.
  const dia30 = p.gasto.puntos.find((pt) => pt.desde === '2026-03-30');
  assert.deepEqual(dia30.valores, { total: 1600, pasteleria: 1400, panaderia: 200, galletas: 0 });
  assert.ok(p.gasto.puntos.every((pt) => pt.valores.total === pt.valores.pasteleria + pt.valores.panaderia + pt.valores.galletas));
  assert.equal(p.calor.length, 84);
  assert.deepEqual(p.calor.at(-1), { fecha: HOY, tandas: 1, costo: 200 });
  // Lunes: 2 dias (2 y 30) con 2 tandas cada uno; martes: 1 dia con 1 tanda.
  assert.deepEqual(p.semana.slice(0, 2).map((d) => [d.nombre, d.dias, d.tandas, d.costo]), [['Lun', 2, 2, 1000], ['Mar', 1, 1, 200]]);
  assert.equal(p.semana[6].tandas, null, 'domingo sin produccion es sin datos, no cero');
});

await prueba('rendimiento: cumplimiento, rechazo, merma, costo por unidad y medidas', () => {
  const r = PANEL.rendimiento;
  // El pan (UND) y la torta (PORC) no se suman: se promedia cada porcentaje
  // pesado por su costo. Pan: 18/20 = 90 %, costo 400; torta: 2/2 = 100 %, costo 1.400.
  cerca(ind(r.indicadores, 'cumplimiento_rendimiento').valor, (400 * 90 + 1400 * 100) / 1800, 'rendimiento');
  assert.equal(ind(r.indicadores, 'cumplimiento_rendimiento').estado, 'bien');
  // Rechazo: pan 2/20 = 10 %, torta 0 % → 400 × 10 / 1.800.
  cerca(ind(r.indicadores, 'rechazo').valor, 400 * 10 / 1800, 'rechazo');
  assert.equal(ind(r.indicadores, 'rechazo').estado, 'bien');
  assert.equal(ind(r.indicadores, 'rechazo').base, '2 resultados medidos');
  assert.equal(ind(r.indicadores, 'merma_kg').valor, 0.1);
  // Costo por unidad solo en UND (el pan): 400 ÷ 18 vendibles; previsto 400 ÷ 20.
  const costo = ind(r.indicadores, 'costo_unidad_real');
  cerca(costo.valor, 400 / 18, 'real');
  cerca(costo.anterior, 20, 'previsto');
  cerca(costo.variacion, (400 / 18) / 20 - 1, 'variacion contra previsto');
  assert.ok(costo.base.startsWith('Por UND, en 1 resultado'), costo.base);
  // Pan del 2: 2 × 400 / 20 = 40.
  assert.equal(ind(r.indicadores, 'costo_rechazo').valor, 40);
  assert.equal(ind(r.indicadores, 'medidas').valor, 50);
  assert.equal(ind(r.indicadores, 'medidas').base, '2 de 4 confirmaciones medidas');
  assert.deepEqual(r.porReceta.map((x) => [x.recetaId, x.unidad, x.obtenido, x.rechazoPct]), [['QA-PAN', 'UND', 20, 10], ['QA-TORTA', 'PORC', 2, 0]]);
  assert.deepEqual(r.porArea.map((a) => [a.area, a.medidas, a.producciones]), [['PASTELERÍA', 1, 1], ['PANADERÍA', 1, 3], ['GALLETAS', 0, 0]]);
  assert.equal(r.porArea[2].rechazoPct, null, 'sin resultados, sin porcentaje');
  const dia2 = r.tendencia.puntos.find((pt) => pt.desde === '2026-03-02');
  assert.deepEqual(dia2.valores, { cumplimiento: 90, rechazo: 10 });
  assert.deepEqual(r.tendencia.puntos.find((pt) => pt.desde === '2026-03-03').valores, { cumplimiento: null, rechazo: null });
});

await prueba('rendimiento: mezclar GR con UND no suma medidas distintas', () => {
  // Hechos armados a mano (la forma de `Hechos` es el contrato): una masa medida en
  // gramos (10.000 buenos de 10.000, sin esperado) y un pan en unidades (8 de 10, 2 malos).
  const vacio = hechosDe({ version: 1, operacionVersion: 1, secuencia: 0, lotes: [], planes: [], ejecuciones: [], eventos: [] });
  const persona = { id: null, nombre: 'QA' };
  const prod = (id, receta, costo, unidad, esperado) => ({ id: `${id}|${receta}`, ejecucionId: id, recetaId: receta, receta, area: 'PANADERÍA',
    fecha: HOY, instante: instante(HOY, '09:00'), tandas: 1, costo, unidadesEsperadas: esperado, unidadSalida: unidad, persona, porReceta: true });
  const res = (id, receta, costo, unidad, esperado, vendible, rechazado) => ({ produccionId: id, recetaId: receta, receta, area: 'PANADERÍA',
    fecha: HOY, unidad, esperado, vendible, rechazado, mermaPreparacionGr: null, mermaCoccionGr: null, costo, persona });
  const h = { ...vacio,
    producciones: [prod('E1', 'MASA', 3000, null, null), prod('E2', 'PAN', 1000, 'UND', 10)],
    resultados: [res('E1', 'MASA', 3000, 'GR', null, 10000, 0), res('E2', 'PAN', 1000, 'UND', 10, 8, 2)] };
  const r = panelDe(h, { periodo: '7d' }).rendimiento;
  // Rechazo: masa 0 % (peso 3.000) y pan 20 % (peso 1.000) → 5 %. Sumando medidas saldria 2 / 10.010 = 0,02 %.
  cerca(ind(r.indicadores, 'rechazo').valor, 5, 'rechazo sin mezclar');
  // Rendimiento: solo el pan tiene esperado: 80 %.
  cerca(ind(r.indicadores, 'cumplimiento_rendimiento').valor, 80, 'rendimiento');
  assert.ok(!/10\.0/.test(ind(r.indicadores, 'rechazo').base), 'la base no suma medidas');
  assert.deepEqual(r.porReceta.map((x) => [x.recetaId, x.unidad, x.obtenido]), [['PAN', 'UND', 10], ['MASA', 'GR', 10000]]);
  cerca(r.porArea[1].rechazoPct, 5, 'por area tampoco mezcla');
  // Sin costo en ningun resultado: promedio simple (0 % y 20 % → 10 %).
  const sinCosto = { ...h, resultados: h.resultados.map((x) => ({ ...x, costo: 0 })), producciones: h.producciones.map((x) => ({ ...x, costo: 0 })) };
  cerca(ind(panelDe(sinCosto, { periodo: '7d' }).rendimiento.indicadores, 'rechazo').valor, 10, 'promedio simple');
});

await prueba('rendimiento: si algún resultado no tiene costo, todos pesan igual', () => {
  const resultado = (costo, vendible) => ({ recetaId: 'X', receta: 'X', area: 'PANADERÍA', unidad: 'UND', esperado: 10,
    vendible, rechazado: 10 - vendible, mermaPreparacionGr: null, mermaCoccionGr: null, costo });
  // Uno sin costo (lotes sin precio al confirmar) no puede quedar con peso cero:
  // 100 % y 50 % dan 75 %, no el 100 % del único que tiene costo.
  cerca(agregarResultados([resultado(1000, 10), resultado(0, 5)]).cumplimiento, 75, 'promedio simple con uno sin costo');
  // Todos con costo: (1.000 × 100 + 3.000 × 50) ÷ 4.000 = 62,5 %.
  cerca(agregarResultados([resultado(1000, 10), resultado(3000, 5)]).cumplimiento, 62.5, 'ponderado por costo');
});

await prueba('rendimiento: el costo por unidad se compara con lo previsto por la receta, no con el periodo anterior', () => {
  const costo = ind(PANEL.rendimiento.indicadores, 'costo_unidad_real');
  assert.equal(costo.comparadoCon, 'el costo previsto por la receta');
  for (const i of [...PANEL.hoyResumen.indicadores, ...PANEL.produccion.indicadores, ...PANEL.bodega.indicadores]) {
    assert.equal(i.comparadoCon, null, `${i.id} se compara con el periodo anterior`);
  }
});

await prueba('tiempos: una confirmación del área consume el inicio y la producción adicional no lo hereda', () => {
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: copiar(LOTES), planes: [], ejecuciones: [],
    eventos: [], notas: [], preparaciones: [], resultados: [] };
  const dia = '2026-03-10';
  planear(datos, dia, '06:00', [{ id: PAN.id, factor: 1 }]);
  enDia(datos, dia, '08:00', () => iniciarPreparacionEn(datos, { fecha: dia, recetaId: PAN.id }, JEFE));
  enDia(datos, dia, '10:00', () => aprobarPlanEn(datos, { fecha: dia, revision: revision(datos, dia),
    responsable: 'Ana QA', motivo: 'Producción', costeo: costeoPendiente(datos, dia) }));
  // Producción adicional del mismo pan, confirmada receta a receta a las 15:00
  // sin volver a empezar: no tiene tiempo medible (no 7 h desde el inicio de las 8:00).
  planear(datos, dia, '11:00', [{ id: PAN.id, factor: 2 }]);
  confirmar(datos, dia, '15:00', PAN.id);
  assert.deepEqual(hechosDe(datos, HOY).tiempos.filter((t) => t.fecha === dia), []);
});

await prueba('nombres legibles: una sola forma de escribir cada receta o ingrediente', () => {
  assert.equal(nombreLegible('BISCOTTIS DE ALMENDRA Y CHOCOLATE CHIPS'), 'Biscottis de Almendra y Chocolate Chips');
  assert.equal(nombreLegible('AZÚCAR ( YEMAS )'), 'Azúcar (Yemas)');
  assert.equal(nombreLegible('PAN BRIOCHE X 10 UND'), 'Pan Brioche x 10 und');
  assert.equal(nombreLegible('CREMA AGRIA Y MIEL ( SCM ) 2'), 'Crema Agria y Miel (SCM) 2');
  assert.equal(nombreLegible(''), '');
  assert.equal(nombreLegible(null), '');
});

await prueba('ingredientes por acabarse: sin «meta 0»; la base dice la cobertura en días', () => {
  assert.deepEqual(coberturaBajaResumen(0, 12, 3), { valor: 0, estado: 'bien', base: 'Todos alcanzan para 3 días o más' });
  assert.deepEqual(coberturaBajaResumen(2, 12, 3), { valor: 2, estado: 'atencion', base: '2 ingredientes por debajo de 3 días' });
  assert.equal(coberturaBajaResumen(3, 12, 3).estado, 'mal');
  // Sin consumo no hay con qué medir la cobertura: «sin datos», no un 0 verde.
  assert.deepEqual(coberturaBajaResumen(0, 0, 3), { valor: null, estado: 'sin_datos', base: 'Sin consumo registrado en los últimos 28 días' });
  for (const lista of [PANEL.hoyResumen.indicadores, PANEL.bodega.indicadores]) {
    const i = ind(lista, 'cobertura_baja');
    assert.equal(i.meta, null, 'la tarjeta no debe decir «Meta: máximo 0»');
    assert.equal(i.estado, i.valor === 0 ? 'bien' : i.estado);
  }
});

await prueba('bodega: valor reconstruido, compras, consumo, perdidas, cobertura, vencimientos y canasta', () => {
  const b = PANEL.bodega;
  // Harina 9.400×2 + huevo 1×500 + azucar 5×4.000 + leche 3.000 + crema 500×5 + harina nueva 10.000×2,5.
  const valor = 18800 + 500 + 20000 + 3000 + 2500 + 25000;
  cerca(ind(b.indicadores, 'valor_bodega').valor, valor, 'valor actual');
  // Al cierre del 1 de marzo solo estaban las cinco compras del 1: 20.000 + 1.500 + 20.000 + 3.000 + 2.500.
  cerca(ind(b.indicadores, 'valor_bodega').anterior, 47000, 'valor anterior');
  cerca(b.valor.puntos.at(-1).valores.valor, valor, 'la reconstruccion llega al valor actual');
  // El 2 salen 200 g de harina (−400); el 28 entra la harina nueva (+25.000).
  cerca(b.valor.puntos[0].valores.valor, 47000 - 400, 'cierre del 2');
  cerca(b.valor.puntos.find((pt) => pt.desde === '2026-03-28').valores.valor, 47000 - 400 + 25000, 'cierre del 28');
  assert.equal(ind(b.indicadores, 'compras').valor, 25000);
  // Lo pagado el 1 (la crema se pagó entera: 5.000, aunque hoy queden 500 g).
  assert.equal(ind(b.indicadores, 'compras').anterior, 20000 + 1500 + 20000 + 3000 + 5000);
  assert.equal(ind(b.indicadores, 'consumo').valor, 2200);
  assert.equal(ind(b.indicadores, 'perdidas').valor, 0);
  cerca(ind(b.indicadores, 'dias_inventario').valor, valor / (2200 / 30), 'dias de inventario');
  assert.equal(ind(b.indicadores, 'por_vencer').valor, 500, 'el huevo vence el 5 de abril');
  assert.deepEqual(b.proveedores.map((p) => [p.nombre, p.valor, p.detalle]), [['Molino', 25000, '1 compra']]);
  assert.deepEqual(b.vencimientos.map((v) => [v.loteId, v.dias, v.valor]), [['L005', -11, 2500], ['L002', 5, 500]]);
  // Consumo de los ultimos 28 dias (4 al 31): harina 400 g, huevo 100 g.
  const harina = b.cobertura.find((c) => c.ingrediente === 'HARINA');
  const huevo = b.cobertura.find((c) => c.ingrediente === 'HUEVO');
  cerca(harina.existenciaGr, 19400, 'harina en gramos');
  cerca(harina.dias, 19400 / (400 / 28), 'dias de harina');
  cerca(huevo.dias, 50 / (100 / 28), 'dias de huevo: 1 und × 50 g');
  assert.equal(b.cobertura[0].ingrediente, 'HUEVO', 'ordenado por dias');
  assert.equal(ind(b.indicadores, 'cobertura_baja').valor, 0);
  // Canasta: la harina se compro a 2 (antes del 2) y a 2,5 el 28: +25 %; el huevo no tiene
  // compra nueva (0 %). Pesos: harina 1.200, huevo 1.000 → 1.200 × 25 % / 2.200.
  cerca(b.canasta.indice, 1200 * 0.25 / 2200 * 100, 'indice de canasta');
  assert.equal(b.canasta.comparados, 2);
  assert.deepEqual(b.canasta.alzas.map((a) => [a.ingrediente, a.antes, a.despues]), [['HARINA', 2, 2.5]]);
  const c = PANEL.calidad;
  assert.deepEqual(c, { produccionesMedidas: 2, produccionesTotales: 4, recetasSinRendimiento: 0,
    lotesSinVencimiento: 1, lotesSinEquivalencia: 1, comprasSinProveedor: 0 });
});

await prueba('equipo: personas, tiempos, asignadas y notas', () => {
  const e = PANEL.equipo;
  assert.equal(ind(e.indicadores, 'personas_activas').valor, 2);
  assert.equal(ind(e.indicadores, 'recetas_por_persona').valor, 2);
  assert.equal(ind(e.indicadores, 'tiempo_preparacion').valor, 90);
  // Hoy: pan sin asignar, torta asignada.
  assert.equal(ind(e.indicadores, 'asignadas').valor, 50);
  // N1 (29) abierta; N4 es del 2 de abril (futura) y N3 esta hecha.
  assert.equal(ind(e.indicadores, 'tareas_abiertas').valor, 1);
  assert.equal(ind(e.indicadores, 'felicitaciones').valor, 1);
  // Orden por tandas: Jefe 3 (1 + 1 + 1), Ana 2.
  assert.deepEqual(e.personas.map((p) => [p.nombre, p.recetas, p.tandas, p.costo]), [['Jefe QA', 3, 3, 1800], ['Ana QA', 1, 2, 400]]);
  assert.deepEqual(e.personas[0].porArea, { 'PANADERÍA': 2, 'PASTELERÍA': 1, GALLETAS: 0 });
  assert.deepEqual(e.tiempos.map((t) => [t.area, t.mediana, t.n]), [['PASTELERÍA', null, 0], ['PANADERÍA', 90, 1], ['GALLETAS', null, 0]]);
  assert.deepEqual(e.notas, { abiertas: 1, hechas: 1, porTipo: { tarea: 1, pendiente: 1, recomendacion: 0, felicitacion: 1 } });
});

await prueba('hoy: avance, en preparacion, costo real + estimado, presupuesto por proyeccion y areas', () => {
  const h = PANEL.hoyResumen;
  assert.equal(ind(h.indicadores, 'avance_hoy').valor, 0);
  assert.equal(ind(h.indicadores, 'avance_hoy').base, '0 de 2 recetas listas');
  assert.equal(ind(h.indicadores, 'en_preparacion').valor, 1);
  assert.equal(ind(h.indicadores, 'en_preparacion').base, '1 sin asignar');
  // Confirmado 200 + pendiente: harina 400 g (800) + huevo 1 de 2 (500, falta el otro) = 1.500.
  const costo = ind(h.indicadores, 'costo_hoy');
  assert.equal(costo.valor, 1500);
  assert.ok(costo.base.includes('estimado incompleto'), costo.base);
  assert.equal(costo.anterior, null, 'ningun martes anterior tuvo produccion');
  // Mes: 2.200 en 31 de 31 dias; sin presupuesto -> sin meta; con 2.000 -> atencion (hasta 2.200).
  const mes = ind(h.indicadores, 'presupuesto_mes');
  assert.equal(mes.valor, 2200);
  assert.equal(mes.estado, 'sin_meta');
  const conPresupuesto = panelDe(hechosDe(DATOS), { metas: { ...METAS_BASE, presupuestoMensual: 2000 } });
  assert.equal(ind(conPresupuesto.hoyResumen.indicadores, 'presupuesto_mes').estado, 'atencion');
  const corto = panelDe(hechosDe(DATOS), { metas: { ...METAS_BASE, presupuestoMensual: 1900 } });
  assert.equal(ind(corto.hoyResumen.indicadores, 'presupuesto_mes').estado, 'mal');
  // Solo la torta del 30 cae en los ultimos 7 dias: 2 de 2.
  assert.equal(ind(h.indicadores, 'rendimiento_7d').valor, 100);
  assert.equal(ind(h.indicadores, 'rechazo_7d').valor, 0);
  assert.equal(ind(h.indicadores, 'rechazo_7d').estado, 'bien');
  // Hace 7 dias (24): compras del 1 menos la harina del 2.
  cerca(ind(h.indicadores, 'valor_bodega').anterior, 46600, 'valor hace 7 dias');
  assert.deepEqual(h.areas.map((a) => [a.area, a.recetas, a.listas, a.enPreparacion, a.pendientes, a.tandas, a.tandasListas]), [
    ['PASTELERÍA', 1, 0, 1, 1, 1, 0], ['PANADERÍA', 1, 0, 0, 1, 3, 1], ['GALLETAS', 0, 0, 0, 0, 0, 0]]);
});

await prueba('alertas: tipos, prioridad, destino y sin dinero en el texto', () => {
  assert.deepEqual(PANEL.atencion.map((a) => [a.tipo, a.prioridad, a.cantidad]), [
    ['faltantes_hoy', 1, 1], ['vencidos', 1, 1],
    ['atrasadas', 2, 1], ['por_vencer', 2, 1], ['sin_equivalencia', 2, 1], ['sin_asignar', 2, 1],
    ['sin_resultado', 3, 1], ['notas_abiertas', 3, 1], ['alza_precio', 3, 1]]);
  const por = (t) => PANEL.atencion.find((a) => a.tipo === t);
  assert.equal(por('faltantes_hoy').detalle, 'Huevo', 'los avisos nombran como se lee, no en mayúsculas');
  assert.equal(por('vencidos').dinero, 2500);
  assert.equal(por('por_vencer').dinero, 500);
  assert.deepEqual(por('atrasadas').destino, { modulo: 'plan', fecha: '2026-03-30' });
  assert.equal(por('atrasadas').detalle, 'lun 30 mar: 1 receta');
  assert.equal(por('sin_equivalencia').detalle.startsWith('Leche'), true);
  assert.equal(por('sin_asignar').detalle, 'Qa Pan x 10 und');
  assert.equal(por('sin_resultado').detalle.includes('Qa Pan x 10 und'), true);
  assert.equal(por('alza_precio').detalle, 'Harina +25 %');
  for (const a of PANEL.atencion) {
    assert.ok(!/\$/.test(a.titulo + a.detalle), `${a.tipo} lleva dinero en el texto`);
    assert.ok(['plan', 'almacen', 'recetario', 'ingredientes'].includes(a.destino.modulo));
  }
  // Mañana: 5 tandas de torta piden 10 huevos que no hay; el de hoy ya se avisa. Galleta pide azucar (hay).
  const datos = copiar(DATOS);
  planear(datos, '2026-04-01', '06:00', [{ id: GALLETA.id, factor: 60 }, { id: 'QA-GALLETA-2', factor: 50 }]);
  const conManana = panelDe(hechosDe(datos));
  const manana = conManana.atencion.find((a) => a.tipo === 'faltantes_manana');
  assert.equal(manana.detalle, 'Azucar', '60 × 50 g + 50 × 50 g = 5,5 kg de azucar y hay 5 kg');
  // Con cobertura minima de 20 dias el huevo (14 dias) avisa.
  const exigente = panelDe(hechosDe(DATOS), { metas: { ...METAS_BASE, coberturaMinima: 20 } });
  assert.equal(exigente.atencion.find((a) => a.tipo === 'cobertura').detalle, 'Huevo (14 d)');
  assert.equal(ind(exigente.hoyResumen.indicadores, 'cobertura_baja').valor, 1);
});

// --- Sin dinero ---------------------------------------------------------------------
const CLAVES_DE_DINERO = ['costo', 'costoUnidad', 'costoReal', 'costoPrevisto', 'proveedores', 'canasta', 'comprasVsConsumo',
  'gasto', 'gastoAnterior', 'costoAnterior'];

function revisarSinDinero(panel) {
  const texto = JSON.stringify(panel);
  assert.ok(!texto.includes('"dinero":true'), 'queda algo marcado como dinero');
  assert.ok(!texto.includes('$'), 'queda una cifra en pesos en algun texto');
  const recorrer = (v, ruta) => {
    if (Array.isArray(v)) v.forEach((x, i) => recorrer(x, `${ruta}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        assert.ok(!CLAVES_DE_DINERO.includes(k), `${ruta}.${k} es dinero`);
        recorrer(x, `${ruta}.${k}`);
      }
    }
  };
  recorrer(panel, 'panel');
  assert.equal(panel.verCostos, false);
  assert.ok(!('valor' in panel.bodega), 'serie de valor de bodega');
  assert.ok(panel.bodega.vencimientos.every((v) => !('valor' in v)), 'valor de vencimientos');
  assert.ok(panel.atencion.every((a) => a.dinero === null && a.tipo !== 'alza_precio'));
}

await prueba('sin costos: el panel no deja pasar ninguna cifra de dinero y el ranking pasa a tandas', () => {
  const sin = panelDe(hechosDe(DATOS), { verCostos: false });
  revisarSinDinero(sin);
  // Todos los indicadores sin dinero siguen, en su orden.
  const esperados = PANEL.hoyResumen.indicadores.filter((i) => !i.dinero).map((i) => i.id);
  assert.deepEqual(sin.hoyResumen.indicadores.map((i) => i.id), esperados);
  assert.deepEqual(sin.hoyResumen.indicadores.map((i) => i.id), ['avance_hoy', 'en_preparacion', 'rendimiento_7d', 'rechazo_7d', 'cobertura_baja']);
  assert.ok(sin.produccion.indicadores.some((i) => i.id === 'tandas'));
  // Por tandas el pan (4) va primero: 80 %.
  assert.deepEqual(sin.produccion.recetas.map((r) => [r.recetaId, r.participacion, r.acumulado]), [['QA-PAN', 80, 80], ['QA-TORTA', 20, 100]]);
  assert.deepEqual(sin.produccion.pareto, { recetas: 2, top20: 1, porcentajeTop20: 80 });
  assert.deepEqual(sin.atencion.map((a) => a.tipo), PANEL.atencion.filter((a) => a.tipo !== 'alza_precio').map((a) => a.tipo));
  // `sinDinero` sobre un panel con costos da lo mismo y no lo muta.
  const copia = JSON.stringify(PANEL);
  const directo = sinDinero(PANEL);
  revisarSinDinero(directo);
  assert.equal(JSON.stringify(PANEL), copia);
  assert.deepEqual(directo, sin);
});

await prueba('sin costos con datos de ejemplo de 90 dias tampoco deja pasar dinero', async () => {
  const recetas = JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8')).recipes;
  const { operacionDeEjemplo } = await import('../src/core/bi/ejemplo.js');
  const doc = operacionDeEjemplo(recetas, { hoy: '2026-09-22' });
  assert.ok(doc.ok, doc.message);
  const h = hechosDeOperacion(doc.value, recetas, { hoy: '2026-09-22', origen: 'ejemplo' });
  assert.ok(h.ok);
  for (const periodo of Object.keys(PERIODOS_BI)) {
    const sin = construirPanel(h.value, { periodo, metas: METAS_BASE, verCostos: false });
    assert.ok(sin.ok);
    revisarSinDinero(sin.value);
  }
  // Rendimiento: hechos + panel de 90 dias en menos de 150 ms (mejor de 5, sin la primera compilacion).
  const medidas = [];
  for (let i = 0; i < 6; i++) {
    const t = performance.now();
    const hh = hechosDeOperacion(doc.value, recetas, { hoy: '2026-09-22', origen: 'ejemplo' });
    construirPanel(hh.value, { periodo: '30d', metas: METAS_BASE, verCostos: true });
    medidas.push(performance.now() - t);
  }
  const mejor = Math.min(...medidas.slice(1));
  console.log(`   hechos + panel de 90 días de ejemplo: ${mejor.toFixed(1)} ms (${h.value.producciones.length} producciones, ${h.value.movimientos.length} movimientos)`);
  assert.ok(mejor < 150, `el panel tarda ${mejor} ms`);
});

// --- Casos limite -----------------------------------------------------------------
await prueba('sin datos: todo vacio, nada falla, todos los indicadores en «sin datos»', () => {
  const vacio = { version: 1, operacionVersion: 1, secuencia: 0, lotes: [], planes: [], ejecuciones: [], eventos: [] };
  const h = hechosDe(vacio);
  for (const periodo of Object.keys(PERIODOS_BI)) {
    for (const verCostos of [true, false]) {
      const p = panelDe(h, { periodo, verCostos });
      const todos = [p.hoyResumen, p.produccion, p.rendimiento, p.bodega, p.equipo].flatMap((s) => s.indicadores);
      assert.ok(todos.length > 0);
      for (const i of todos) assert.equal(i.estado, 'sin_datos', `${periodo} ${i.id}`);
      assert.deepEqual(p.atencion, []);
      assert.deepEqual(p.produccion.recetas, []);
      assert.deepEqual(p.produccion.pareto, { recetas: 0, top20: 0, porcentajeTop20: null });
      assert.equal(p.hoyResumen.areas.length, 3);
      assert.ok(!JSON.stringify(p).includes('NaN') && !JSON.stringify(p).includes('Infinity'));
      assert.ok(Object.values(p.calidad).every((n) => n === 0));
    }
  }
  assert.equal(construirPanel(h, { periodo: 'semana' }).ok, false);
  assert.equal(construirPanel({ hoy: HOY }, {}).ok, false);
  assert.equal(hechosDeOperacion(null, []).ok, false);
});

await prueba('un solo dia, receta sin rendimiento, lote sin precio: divisiones por cero dan «sin datos»', () => {
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, planes: [], ejecuciones: [], eventos: [], notas: [], preparaciones: [], resultados: [],
    lotes: [normalizarLote({ id: 'L1', ingrediente: 'AZUCAR', unidad: 'GR', pesoCompra: 1000, costoCompra: 0, existencia: 1000,
      fechaCompra: '2026-03-01', vencimiento: '2026-12-31' })] };
  // Galleta: no dice cuanto rinde; el azucar no tiene precio (costo 0).
  planear(datos, HOY, '06:00', [{ id: GALLETA.id, factor: 1 }]);
  const conPrecio0 = aprobarPlanEn(datos, { fecha: HOY, revision: 1, responsable: 'Ana QA', motivo: 'P', costeo: costeoPendiente(datos, HOY) });
  assert.ok(conPrecio0.ok, conPrecio0.message);
  const ej = datos.ejecuciones[0];
  ej.instante = instante(HOY, '09:00');
  // Resultado sin unidades esperadas y con 0 obtenidas.
  datos.resultados.push({ produccionId: ej.id, recetaId: GALLETA.id, revision: 1, unidad: 'UND', esperado: null, vendible: 0, rechazado: 0,
    mermaPreparacionGr: null, mermaCoccionGr: null, motivo: 'Se perdió todo', actualizado: instante(HOY, '10:00'), autor: JEFE });
  const p = panelDe(hechosDe(datos), { periodo: '7d' });
  assert.equal(ind(p.produccion.indicadores, 'gasto').valor, 0);
  assert.equal(ind(p.produccion.indicadores, 'unidades').valor, null);
  assert.equal(ind(p.produccion.indicadores, 'unidades').estado, 'sin_datos');
  assert.equal(p.calidad.recetasSinRendimiento, 1);
  assert.equal(ind(p.rendimiento.indicadores, 'cumplimiento_rendimiento').valor, null);
  assert.equal(ind(p.rendimiento.indicadores, 'rechazo').valor, null);
  assert.equal(ind(p.rendimiento.indicadores, 'costo_unidad_real').valor, null);
  assert.equal(ind(p.rendimiento.indicadores, 'costo_rechazo').valor, 0);
  assert.equal(ind(p.rendimiento.indicadores, 'medidas').valor, 100);
  assert.equal(ind(p.bodega.indicadores, 'valor_bodega').valor, 0, 'sin precio no suma');
  assert.equal(ind(p.bodega.indicadores, 'rotacion').valor, null, 'valor promedio 0: sin datos');
  assert.equal(ind(p.bodega.indicadores, 'dias_inventario').valor, null, 'consumo 0: sin datos');
  assert.equal(ind(p.hoyResumen.indicadores, 'avance_hoy').valor, 100);
  assert.equal(p.produccion.recetas[0].costoUnidad, null);
  assert.equal(p.produccion.recetas[0].participacion, null, 'gasto total 0: sin participacion');
  assert.ok(!JSON.stringify(p).includes('NaN') && !JSON.stringify(p).includes('Infinity'));
});

// --- Metas ---------------------------------------------------------------------------
await prueba('metas: definicion, normalizar y validar lo escrito por una persona', () => {
  assert.deepEqual(DEFINICION_METAS.map((d) => d.clave), ['presupuestoMensual', 'cumplimientoPlan', 'rendimientoMinimo', 'rechazoMaximo',
    'coberturaMinima', 'avisoVencimiento', 'alzaPrecio']);
  assert.deepEqual(METAS_BASE, { presupuestoMensual: null, cumplimientoPlan: 90, rendimientoMinimo: 95, rechazoMaximo: 5,
    coberturaMinima: 3, avisoVencimiento: 7, alzaPrecio: 10 });
  assert.deepEqual(normalizarMetas({ cumplimientoPlan: 150, rechazoMaximo: '3', coberturaMinima: 4, otra: 1, presupuestoMensual: -5 }),
    { ...METAS_BASE, coberturaMinima: 4 });
  assert.deepEqual(normalizarMetas(null), METAS_BASE);
  assert.deepEqual(normalizarMetas('basura'), METAS_BASE);
  const v = validarMetas({ presupuestoMensual: '$ 2.500.000', rechazoMaximo: '12,5', rendimientoMinimo: '97.5', coberturaMinima: ' 4 ' });
  assert.ok(v.ok, v.message);
  assert.deepEqual(v.value, { ...METAS_BASE, presupuestoMensual: 2500000, rechazoMaximo: 12.5, rendimientoMinimo: 97.5, coberturaMinima: 4 });
  assert.equal(validarMetas({ presupuestoMensual: '' }).value.presupuestoMensual, null, 'presupuesto vacio = sin presupuesto');
  const vacio = validarMetas({ cumplimientoPlan: '' });
  assert.equal(vacio.code, 'meta_invalida');
  assert.ok(vacio.message.startsWith('Cumplimiento mínimo del plan'), vacio.message);
  const texto = validarMetas({ rechazoMaximo: 'mucho' });
  assert.ok(!texto.ok && texto.message.startsWith('Rechazo máximo'));
  const fuera = validarMetas({ cumplimientoPlan: '101' });
  assert.ok(!fuera.ok && fuera.message.includes('entre 0 y 100'), fuera.message);
  assert.equal(validarMetas({ avisoVencimiento: 0 }).ok, false);
  assert.equal(validarMetas({ alzaPrecio: Infinity }).ok, false);
  assert.equal(validarMetas(null).ok, false);
});

await prueba('metas: leer nunca falla (vacio, JSON roto, version ajena, almacenamiento que lanza) y escribir guarda autor', () => {
  memoria.delete(CLAVE_METAS);
  assert.deepEqual(leerMetas(), { metas: METAS_BASE, actualizado: null, autor: null });
  memoria.set(CLAVE_METAS, '{roto');
  assert.deepEqual(leerMetas().metas, METAS_BASE);
  memoria.set(CLAVE_METAS, JSON.stringify({ version: 2, metas: { cumplimientoPlan: 50 } }));
  assert.deepEqual(leerMetas().metas, METAS_BASE);
  memoria.set(CLAVE_METAS, JSON.stringify({ version: 1, metas: { cumplimientoPlan: 'x', rechazoMaximo: 8 }, autor: 3 }));
  assert.deepEqual(leerMetas(), { metas: { ...METAS_BASE, rechazoMaximo: 8 }, actualizado: null, autor: null });
  lecturaRota = true;
  assert.deepEqual(leerMetas().metas, METAS_BASE);
  lecturaRota = false;
  const escrito = escribirMetas({ ...METAS_BASE, cumplimientoPlan: 85 }, { id: 'u1', nombre: 'Gerente' });
  assert.ok(escrito.ok);
  const leido = leerMetas();
  assert.equal(leido.metas.cumplimientoPlan, 85);
  assert.deepEqual(leido.autor, { id: 'u1', nombre: 'Gerente' });
  assert.ok(Number.isFinite(Date.parse(leido.actualizado)));
  assert.equal(escribirMetas({ cumplimientoPlan: 900 }, { id: 'u1', nombre: 'G' }).ok, false);
  assert.equal(escribirMetas(METAS_BASE, null).code, 'autor');
  memoria.delete(CLAVE_METAS);
});

// --- Caso de uso: permisos ----------------------------------------------------------
const usuario = (rol) => ({ id: `u-${rol}`, nombre: `Persona ${rol}`, codigo: rol.toUpperCase(), rol });

await prueba('cargarPanel: operario y sin sesion no ven el panel; el jefe de obrador lo ve sin dinero', () => {
  memoria.set(CLAVE_OPERACION, JSON.stringify(DATOS));
  setState({ recetario: { recipes: RECETAS } });
  setState({ usuario: null });
  assert.equal(cargarPanel({}).code, 'permiso');
  setState({ usuario: usuario('operario') });
  assert.equal(cargarPanel({}).code, 'permiso');
  setState({ usuario: { ...usuario('x'), rol: 'desconocido' } });
  assert.equal(cargarPanel({}).code, 'permiso', 'un rol que no existe cuenta como el mas bajo');
  setState({ usuario: usuario('obrador') });
  const obrador = cargarPanel({ periodo: '12m' });
  assert.ok(obrador.ok, obrador.message);
  revisarSinDinero(obrador.value);
  assert.equal(obrador.value.origen, 'local');
  assert.equal(obrador.value.rango.clave, '12m');
  for (const rol of ['gerencia', 'admin']) {
    setState({ usuario: usuario(rol) });
    const r = cargarPanel({});
    assert.ok(r.ok && r.value.verCostos === true, rol);
    assert.equal(r.value.rango.clave, PERIODO_POR_DEFECTO);
    // El caso de uso usa el hoy real: en 12 meses entra la produccion de marzo del escenario.
    const anio = cargarPanel({ periodo: '12m' });
    assert.equal(anio.value.produccion.indicadores.find((i) => i.id === 'gasto').valor, 2200, rol);
  }
  assert.equal(cargarPanel({ periodo: 'nada' }).code, 'periodo');
  memoria.set(CLAVE_OPERACION, '{roto');
  assert.equal(cargarPanel({}).ok, false, 'un documento ilegible no se inventa');
  memoria.delete(CLAVE_OPERACION);
});

await prueba('cargarPanel con ejemplo: pide prepararlo antes y luego usa los 90 dias simulados', async () => {
  const recetas = JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8')).recipes;
  setState({ recetario: { recipes: recetas } });
  setState({ usuario: usuario('gerencia') });
  assert.equal(cargarPanel({ ejemplo: true }).code, 'ejemplo_no_listo');
  const antes = new Map(memoria);
  const listo = await prepararEjemplo();
  assert.ok(listo.ok, listo.message);
  assert.deepEqual(new Map(memoria), antes, 'el ejemplo no escribe en el almacenamiento');
  const r = cargarPanel({ ejemplo: true, periodo: '7d' });
  assert.ok(r.ok, r.message);
  assert.equal(r.value.origen, 'ejemplo');
  assert.ok(r.value.produccion.recetas.length > 0);
  // Una segunda preparacion reutiliza la misma (no regenera).
  const t = performance.now();
  assert.ok((await prepararEjemplo()).ok);
  assert.ok(performance.now() - t < 50);
  // Cambiar el recetario invalida el ejemplo preparado.
  setState({ recetario: { recipes: recetas.slice(1) } });
  assert.equal(cargarPanel({ ejemplo: true }).code, 'ejemplo_no_listo');
});

await prueba('metas desde el caso de uso: solo gerencia y administracion guardan; el obrador no ve las de dinero', () => {
  memoria.delete(CLAVE_METAS);
  setState({ usuario: usuario('obrador') });
  const vista = estadoMetas();
  assert.equal(vista.puedeEditar, false);
  assert.deepEqual(vista.definicion.map((d) => d.clave), ['cumplimientoPlan', 'rendimientoMinimo', 'rechazoMaximo', 'coberturaMinima', 'avisoVencimiento']);
  assert.ok(!('presupuestoMensual' in vista.metas) && !('alzaPrecio' in vista.metas));
  assert.equal(guardarMetasResumen({ cumplimientoPlan: '80' }).code, 'permiso');
  assert.equal(memoria.has(CLAVE_METAS), false, 'no se escribio nada');
  setState({ usuario: usuario('operario') });
  assert.equal(guardarMetasResumen({ cumplimientoPlan: '80' }).code, 'permiso');
  setState({ usuario: null });
  assert.equal(guardarMetasResumen({ cumplimientoPlan: '80' }).code, 'autor');
  setState({ usuario: usuario('gerencia') });
  assert.equal(estadoMetas().puedeEditar, true);
  assert.equal(estadoMetas().definicion.length, 7);
  const mal = guardarMetasResumen({ rechazoMaximo: 'abc' });
  assert.equal(mal.code, 'meta_invalida');
  assert.equal(memoria.has(CLAVE_METAS), false);
  const bien = guardarMetasResumen({ presupuestoMensual: '3.000.000', rechazoMaximo: '4,5' });
  assert.ok(bien.ok, bien.message);
  assert.equal(bien.value.presupuestoMensual, 3000000);
  // Un segundo guardado parcial conserva lo guardado antes, no la base.
  assert.ok(guardarMetasResumen({ cumplimientoPlan: '92' }).ok);
  const e = estadoMetas();
  assert.deepEqual([e.metas.presupuestoMensual, e.metas.rechazoMaximo, e.metas.cumplimientoPlan], [3000000, 4.5, 92]);
  assert.deepEqual(e.autor, { id: 'u-gerencia', nombre: 'Persona gerencia' });
  setState({ usuario: usuario('admin') });
  assert.ok(guardarMetasResumen({ presupuestoMensual: '' }).ok);
  assert.equal(estadoMetas().metas.presupuestoMensual, null);
  memoria.delete(CLAVE_METAS);
});

if (fallos.length) {
  console.log(`\n${fallos.length} prueba(s) FALLARON: ${fallos.join(' · ')}`);
  process.exit(1);
}
console.log(`\n${cantidad} pruebas del motor de indicadores: todas correctas.`);
