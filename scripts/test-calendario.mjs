/**
 * Pruebas del calendario de produccion (PROD-002): festivos de Colombia por
 * año, semanas del mes, notas del dia, registro directo de recetas y
 * preparacion receta a receta con asignacion por area.
 *
 * Se ejecuta con:  npm run test:calendario
 */

import assert from 'node:assert/strict';
import { leerOperacion, CLAVE_OPERACION, hoyLocal, sumarDias } from '../src/core/bitacora.js';
import {
  pascua, festivosDe, festivo, semanasDelMes, sumarMeses, nombreMes, ANIO_MIN,
} from '../src/core/calendario.js';
import { guardarNotaEn, eliminarNotaEn, notasDelDia, LARGO_MAXIMO_NOTA } from '../src/core/notas.js';
import { fijarRecetaEn, costeoPendiente, aprobarPlanEn } from '../src/core/produccion.js';
import {
  recetasDelDia, resumenDelDia, iniciarPreparacionEn, cancelarPreparacionEn, asignarRecetaEn,
  confirmarRecetaEn, asignadasA,
} from '../src/core/preparacion.js';
import { normalizarLote, lotesDemo, siguienteId } from '../src/core/almacen.js';
import { readFileSync } from 'node:fs';

const memoria = new Map();
globalThis.window = { localStorage: {
  getItem: (k) => memoria.get(k) ?? null,
  setItem: (k, v) => memoria.set(k, v),
  removeItem: (k) => memoria.delete(k),
} };

const hoy = hoyLocal();
const manana = sumarDias(hoy, 1);
const pan = { id: 'QA-PAN', nombre: 'QA PAN X 10 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad: '100', unidad: 'GR' }] }] };
const galleta = { id: 'QA-GAL', nombre: 'QA GALLETA X 20 UND', categoria: 'GALLETAS', metodo: '',
  componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad: '50', unidad: 'GR' },
    { ingrediente: 'AZUCAR', cantidad: '10', unidad: 'GR' }] }] };
const recetas = [pan, galleta];
const lote = (id, ingrediente, costo) => normalizarLote({ id, ingrediente, unidad: 'GR', pesoCompra: 1000,
  costoCompra: costo, existencia: 1000, fechaCompra: hoy, vencimiento: sumarDias(hoy, 60) });
const base = () => ({ version: 1, operacionVersion: 1, secuencia: 0, planes: [], ejecuciones: [], eventos: [],
  notas: [], preparaciones: [], lotes: [lote('L1', 'HARINA', 10000), lote('L2', 'AZUCAR', 5000)] });
const jefe = { id: 'u-jefe', nombre: 'Jefa Obrador', codigo: 'JEFA', rol: 'obrador' };
// Ana y Leo son operarios: como autores, solo trabajan lo que tienen asignado.
const ana = { id: 'u-ana', nombre: 'Ana Panadera', codigo: 'ANA', area: 'PANADERÍA', rol: 'operario' };
const leo = { id: 'u-leo', nombre: 'Leo Galletas', codigo: 'LEO', area: 'GALLETAS', rol: 'operario' };
const gerente = { id: 'u-ger', nombre: 'Gina Gerente', codigo: 'GINA', rol: 'gerencia' };
const fijar = (datos, recetaId, factor, fecha = hoy) => fijarRecetaEn(datos, {
  fecha, revision: datos.planes.find((p) => p.fecha === fecha)?.revision || 0, recetaId, factor,
  responsable: 'Jefa Obrador (JEFA)', motivo: 'Registro de producción' }, recetas);
const confirmar = (datos, recetaId, fecha = hoy) => confirmarRecetaEn(datos, {
  fecha, recetaId, revision: datos.planes.find((p) => p.fecha === fecha).revision,
  costeo: costeoPendiente(datos, fecha, { recetaId }) }, ana);
/** El documento tiene que poder guardarse y volver a leerse tal cual. */
const releer = (datos) => { memoria.set(CLAVE_OPERACION, JSON.stringify(datos)); return leerOperacion(); };

let cantidad = 0;
function prueba(nombre, fn) { fn(); cantidad += 1; console.log(`OK ${nombre}`); }

prueba('la Pascua sale bien en años conocidos', () => {
  for (const [anio, fecha] of [[2000, '2000-04-23'], [2024, '2024-03-31'], [2025, '2025-04-20'],
    [2026, '2026-04-05'], [2027, '2027-03-28'], [2038, '2038-04-25']]) assert.equal(pascua(anio), fecha, anio);
});

prueba('festivos de Colombia 2026, con Ley Emiliani y Pascua', () => {
  const esperados = ['2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01',
    '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17',
    '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25'];
  assert.deepEqual([...festivosDe(2026).keys()], esperados);
  assert.equal(festivo('2026-01-12'), 'Reyes Magos');
  assert.equal(festivo('2026-01-06'), null, 'el 6 de enero de 2026 es martes: se traslada');
  assert.equal(festivo('2026-12-08'), 'Inmaculada Concepción');
});

prueba('dos festivos el mismo lunes no se pierden (2025)', () => {
  const f2025 = festivosDe(2025);
  assert.equal(f2025.size, 17);
  assert.equal(f2025.get('2025-06-30'), 'San Pedro y San Pablo · Sagrado Corazón de Jesús');
  assert.equal(festivosDe(2027).get('2027-05-10'), 'Ascensión del Señor');
  assert.equal(festivosDe(2027).get('2027-05-31'), 'Corpus Christi');
});

prueba('todo año nuevo se calcula solo: trasladables siempre en lunes', () => {
  const fijos = new Set(['01-01', '05-01', '07-20', '08-07', '12-08', '12-25']);
  for (let anio = ANIO_MIN; anio <= 2100; anio += 1) {
    const f = festivosDe(anio);
    assert.ok(f.size >= 16 && f.size <= 18, `${anio}: ${f.size}`);
    for (const [fecha, nombre] of f) {
      assert.equal(fecha.slice(0, 4), String(anio));
      if (fijos.has(fecha.slice(5)) || /Santo/.test(nombre)) continue;
      assert.equal(new Date(fecha + 'T12:00:00Z').getUTCDay(), 1, `${fecha} ${nombre}`);
    }
  }
  assert.equal(festivosDe(1500).size, 0);
  assert.equal(festivosDe(2026.5).size, 0);
  assert.equal(festivo('2026-02-30'), null);
});

prueba('semanas de lunes a domingo que cubren el mes', () => {
  const sep = semanasDelMes(2026, 9);
  assert.equal(sep.length, 5);
  assert.equal(sep[0][0].fecha, '2026-08-31');
  assert.equal(sep[0][0].delMes, false);
  assert.equal(sep.at(-1).at(-1).fecha, '2026-10-04');
  assert.equal(semanasDelMes(2027, 2).length, 4, 'febrero de 2027 empieza en lunes y cabe justo');
  assert.equal(semanasDelMes(2026, 8).length, 6);
  for (let mes = 1; mes <= 12; mes += 1) {
    const semanas = semanasDelMes(2028, mes);
    assert.ok(semanas.every((s) => s.length === 7 && new Date(s[0].fecha + 'T12:00:00Z').getUTCDay() === 1));
    assert.equal(semanas.flat().filter((d) => d.delMes).length, new Date(Date.UTC(2028, mes, 0)).getUTCDate());
  }
  assert.deepEqual(semanasDelMes(2026, 13), []);
  assert.deepEqual(sumarMeses(2026, 12, 1), { anio: 2027, mes: 1 });
  assert.deepEqual(sumarMeses(2026, 1, -1), { anio: 2025, mes: 12 });
  assert.deepEqual(sumarMeses(2026, 3, -27), { anio: 2023, mes: 12 });
  assert.match(nombreMes(2026, 9), /septiembre.*2026/);
});

prueba('notas: crear, validar, editar con revisión y borrar con traza', () => {
  const datos = base();
  const nueva = guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: '  Limpiar   hornos  ' }, jefe);
  assert.equal(nueva.ok, true);
  assert.equal(nueva.value.texto, 'Limpiar hornos');
  assert.equal(nueva.value.autor.codigo, 'JEFA');
  assert.equal(datos.eventos.at(-1).tipo, 'nota_guardada');
  assert.equal(datos.eventos.at(-1).responsable, 'Jefa Obrador (JEFA)');
  for (const [cambio, codigo] of [[{ tipo: 'venta' }, 'tipo'], [{ texto: '   ' }, 'texto'],
    [{ texto: 'x'.repeat(LARGO_MAXIMO_NOTA + 1) }, 'texto'], [{ area: 'CAFÉ' }, 'area'], [{ fecha: '2026-02-30' }, 'fecha']]) {
    assert.equal(guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'ok', ...cambio }, jefe).code, codigo);
  }
  assert.equal(guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'ok' }, { nombre: 'Sin id' }).code, 'autor');
  const { id } = nueva.value;
  assert.equal(guardarNotaEn(datos, { id, revision: 1, fecha: hoy, tipo: 'tarea', texto: 'Limpiar hornos', hecha: true }, jefe).value.hecha, true);
  assert.equal(guardarNotaEn(datos, { id, revision: 1, fecha: hoy, tipo: 'tarea', texto: 'otra' }, jefe).code, 'conflicto');
  const felicitacion = guardarNotaEn(datos, { fecha: hoy, tipo: 'felicitacion', texto: 'Buen turno', hecha: true, area: 'GALLETAS' }, jefe);
  assert.equal(felicitacion.value.hecha, false, 'una felicitación no se «cumple»');
  assert.deepEqual(notasDelDia(datos, hoy).map((n) => n.tipo), ['tarea', 'felicitacion']);
  assert.equal(releer(datos).ok, true);
  assert.equal(eliminarNotaEn(datos, { id, revision: 1 }, jefe).code, 'conflicto');
  assert.equal(eliminarNotaEn(datos, { id, revision: 2 }, jefe).ok, true);
  assert.equal(datos.eventos.at(-1).tipo, 'nota_eliminada');
  assert.equal(datos.eventos.at(-1).antes.texto, 'Limpiar hornos');
  assert.equal(eliminarNotaEn(datos, { id, revision: 2 }, jefe).code, 'no_existe');
  assert.equal(releer(datos).ok, true);
});

prueba('un historial anterior sin notas se lee; una nota dañada lo bloquea', () => {
  const viejo = base();
  delete viejo.notas; delete viejo.preparaciones;
  const leido = releer(viejo);
  assert.equal(leido.ok, true);
  assert.deepEqual(leido.value.notas, []);
  assert.deepEqual(leido.value.preparaciones, []);
  const datos = base();
  guardarNotaEn(datos, { fecha: hoy, tipo: 'pendiente', texto: 'Pedir harina' }, jefe);
  datos.notas[0].autor = null;
  assert.equal(releer(datos).ok, false);
  const otro = base();
  otro.notas = 'nada';
  assert.equal(releer(otro).ok, false);
});

prueba('registro directo: añadir, cambiar y quitar recetas guardando al instante', () => {
  const datos = base();
  assert.equal(fijar(datos, pan.id, 2).ok, true);
  assert.equal(fijar(datos, galleta.id, 1).ok, true);
  assert.equal(datos.planes[0].revision, 2);
  assert.equal(fijar(datos, pan.id, 3).ok, true);
  assert.deepEqual(datos.planes[0].entradas.map((e) => [e.recipe.id, e.factor]), [[pan.id, 3], [galleta.id, 1]]);
  assert.equal(fijarRecetaEn(datos, { fecha: hoy, revision: 1, recetaId: pan.id, factor: 1,
    responsable: 'QA', motivo: 'x' }, recetas).code, 'conflicto');
  assert.equal(fijar(datos, 'NO-EXISTE', 1).code, 'receta');
  assert.equal(fijar(datos, galleta.id, 0).ok, true);
  assert.equal(fijar(datos, galleta.id, 0).code, 'receta_invalida');
  const quitado = fijar(datos, pan.id, 0);
  assert.equal(quitado.ok, true);
  assert.equal(quitado.value.plan, null, 'sin recetas ni producción, el día queda sin plan');
  assert.equal(datos.planes.length, 0);
  assert.equal(datos.eventos.at(-1).tipo, 'plan_eliminado');
  assert.equal(releer(datos).ok, true);
});

prueba('preparación: empezar, deshacer, y nada de empezar un día futuro', () => {
  const datos = base();
  fijar(datos, pan.id, 1); fijar(datos, pan.id, 1, manana);
  assert.equal(recetasDelDia(datos, hoy)[0].estado, 'pendiente');
  assert.equal(iniciarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, ana).code, 'permiso', 'no la tiene asignada');
  const inicio = iniciarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, jefe);
  assert.equal(inicio.ok, true);
  assert.equal(recetasDelDia(datos, hoy)[0].estado, 'en_preparacion');
  const eventos = datos.eventos.length;
  assert.equal(iniciarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, jefe).value.iniciada, inicio.value.iniciada);
  assert.equal(datos.eventos.length, eventos, 'repetir no registra otro inicio');
  assert.equal(iniciarPreparacionEn(datos, { fecha: manana, recetaId: pan.id }, jefe).code, 'futuro');
  assert.equal(iniciarPreparacionEn(datos, { fecha: hoy, recetaId: galleta.id }, jefe).code, 'receta_invalida');
  assert.equal(cancelarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, jefe).ok, true);
  assert.equal(recetasDelDia(datos, hoy)[0].estado, 'pendiente');
  assert.equal(cancelarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, jefe).code, 'no_iniciada');
  assert.equal(releer(datos).ok, true);
});

prueba('asignar solo a alguien del área de la receta', () => {
  const datos = base();
  fijar(datos, pan.id, 1); fijar(datos, galleta.id, 1);
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, trabajador: leo }, jefe).code, 'area_distinta');
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, trabajador: { ...ana, area: null } }, jefe).code, 'trabajador');
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, trabajador: ana }, jefe).ok, true);
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: galleta.id, trabajador: leo }, jefe).ok, true);
  assert.deepEqual(asignadasA(datos, ana.id, hoy).map((r) => r.recipe.id), [pan.id]);
  assert.deepEqual(asignadasA(datos, leo.id, hoy).map((r) => r.recipe.id), [galleta.id]);
  assert.equal(datos.eventos.at(-1).motivo, 'Asignada a Leo Galletas (LEO)');
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: galleta.id, trabajador: null }, jefe).ok, true);
  assert.deepEqual(asignadasA(datos, leo.id, hoy), []);
  assert.equal(releer(datos).ok, true);
  // Quitar la receta del día se lleva su asignación.
  fijar(datos, pan.id, 0);
  assert.equal(datos.preparaciones.some((p) => p.recetaId === pan.id), false);
  assert.equal(releer(datos).ok, true);
});

prueba('confirmar una receta descuenta solo esa receta y la deja lista', () => {
  const datos = base();
  fijar(datos, pan.id, 2); fijar(datos, galleta.id, 1);
  asignarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, trabajador: ana }, jefe);
  iniciarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, ana);
  const costeoGalleta = costeoPendiente(datos, hoy, { recetaId: galleta.id });
  assert.equal(confirmarRecetaEn(datos, { fecha: hoy, recetaId: galleta.id, revision: 3, costeo: costeoGalleta }, ana).code,
    'permiso', 'la galleta no es de Ana');
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: galleta.id, trabajador: leo }, ana).code, 'permiso');
  const r = confirmar(datos, pan.id);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.value.recetaId, pan.id);
  assert.equal(r.value.responsable, 'Ana Panadera (ANA)');
  assert.equal(datos.lotes.find((l) => l.id === 'L1').existencia, 800, 'solo la harina del pan: 2 × 100');
  assert.equal(datos.lotes.find((l) => l.id === 'L2').existencia, 1000, 'el azúcar de la galleta sigue ahí');
  const estados = Object.fromEntries(recetasDelDia(datos, hoy).map((x) => [x.recipe.id, x.estado]));
  assert.deepEqual(estados, { [pan.id]: 'lista', [galleta.id]: 'pendiente' });
  assert.equal(confirmar(datos, pan.id).code, 'ya_producido');
  assert.equal(asignarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, trabajador: null }, jefe).code, 'ya_lista');
  assert.equal(iniciarPreparacionEn(datos, { fecha: hoy, recetaId: pan.id }, ana).code, 'ya_lista');
  assert.equal(fijar(datos, pan.id, 0).code, 'ya_producido', 'lo producido no se quita');
  assert.equal(fijar(datos, pan.id, 1).code, 'ya_producido');
  const resumen = resumenDelDia(datos, hoy);
  assert.equal(resumen.estado, 'en_curso');
  assert.deepEqual(resumen.porArea.map((a) => [a.area, a.total, a.listas]), [['PANADERÍA', 1, 1], ['GALLETAS', 1, 0]]);
  assert.equal(releer(datos).ok, true);

  // Tandas extra: vuelve a pendiente por la diferencia, con la asignación intacta.
  assert.equal(fijar(datos, pan.id, 3).ok, true);
  const panHoy = recetasDelDia(datos, hoy).find((x) => x.recipe.id === pan.id);
  assert.deepEqual([panHoy.estado, panHoy.pendiente, panHoy.parcial], ['pendiente', 1, true]);
  assert.equal(panHoy.preparacion.asignado.id, ana.id);
  assert.equal(confirmar(datos, pan.id).ok, true);
  assert.equal(datos.lotes.find((l) => l.id === 'L1').existencia, 700);
  assert.equal(confirmarRecetaEn(datos, { fecha: hoy, recetaId: galleta.id,
    revision: datos.planes[0].revision, costeo: costeoPendiente(datos, hoy, { recetaId: galleta.id }) }, jefe).ok, true);
  assert.equal(resumenDelDia(datos, hoy).estado, 'lista');
  assert.equal(releer(datos).ok, true);
});

prueba('confirmar se niega si la bodega cambió o falta materia prima', () => {
  const datos = base();
  fijar(datos, pan.id, 1);
  const costeo = costeoPendiente(datos, hoy, { recetaId: pan.id });
  datos.lotes[0].costoCompra = 99999;
  assert.equal(confirmarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, revision: 1, costeo }, jefe).code, 'costeo_cambio');
  const escaso = base();
  escaso.lotes[0].existencia = 10;
  fijar(escaso, pan.id, 1);
  assert.equal(confirmarRecetaEn(escaso, { fecha: hoy, recetaId: pan.id, revision: 1,
    costeo: costeoPendiente(escaso, hoy, { recetaId: pan.id }) }, jefe).code, 'faltantes');
  assert.equal(escaso.lotes[0].existencia, 10);
  assert.equal(aprobarPlanEn(escaso, { fecha: hoy, revision: 1, recetaId: 'OTRA', responsable: 'QA', motivo: 'x',
    costeo: null }).code, 'receta_invalida');
  assert.equal(confirmarRecetaEn(escaso, { fecha: hoy, recetaId: pan.id, revision: 1, costeo: null }, {}).code, 'autor');
});

prueba('una preparación dañada bloquea el historial', () => {
  const datos = base();
  fijar(datos, pan.id, 1);
  asignarRecetaEn(datos, { fecha: hoy, recetaId: pan.id, trabajador: ana }, jefe);
  assert.equal(releer(datos).ok, true);
  const roto = structuredClone(datos);
  roto.preparaciones[0].asignado.area = 'CAFÉ';
  assert.equal(releer(roto).ok, false);
  const duplicado = structuredClone(datos);
  duplicado.preparaciones.push(structuredClone(duplicado.preparaciones[0]));
  assert.equal(releer(duplicado).ok, false);
  const evento = structuredClone(datos);
  evento.eventos.at(-1).recetaId = '';
  assert.equal(releer(evento).ok, false);
});

prueba('las notas son del jefe de obrador en adelante, y dicen quién las cambió', () => {
  const datos = base();
  assert.equal(guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'x' }, ana).code, 'permiso');
  assert.equal(guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'x' }, { ...jefe, rol: undefined }).code, 'permiso',
    'sin rol, el permiso más bajo');
  const nota = guardarNotaEn(datos, { fecha: hoy, tipo: 'recomendacion', texto: 'Hornear a 180' }, gerente).value;
  assert.equal(nota.cambiadaPor, null);
  const cambiada = guardarNotaEn(datos, { id: nota.id, revision: 1, fecha: hoy, tipo: 'recomendacion', texto: 'Hornear a 220' }, jefe).value;
  assert.equal(cambiada.autor.nombre, 'Gina Gerente');
  assert.deepEqual(cambiada.cambiadaPor, { id: jefe.id, nombre: jefe.nombre, codigo: jefe.codigo });
  const devuelta = guardarNotaEn(datos, { id: nota.id, revision: 2, fecha: hoy, tipo: 'recomendacion', texto: 'Hornear a 180' }, gerente).value;
  assert.equal(devuelta.cambiadaPor, null, 'la autora la dejó como la escribió');
  assert.equal(eliminarNotaEn(datos, { id: nota.id, revision: 3 }, ana).code, 'permiso');
  assert.equal(releer(datos).ok, true);
  const rota = structuredClone(datos);
  rota.notas[0].cambiadaPor = { nombre: 'sin id' };
  assert.equal(releer(rota).ok, false);
});

prueba('una nota puede ir dirigida a una persona, y solo ella la marca hecha', () => {
  const datos = base();
  const para = { id: ana.id, nombre: ana.nombre, codigo: ana.codigo };
  assert.equal(guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'Sacar el pan', area: 'PANADERÍA', persona: para }, jefe).code,
    'para', 'un área y una persona a la vez no existe');
  assert.equal(guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'Sacar el pan', persona: { nombre: 'Sin id' } }, jefe).code, 'persona');
  const nota = guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'Sacar el pan', persona: para }, jefe).value;
  assert.deepEqual(nota.persona, para);
  assert.equal(nota.area, null);

  // La excepción del operario: marcar hecha lo suyo, y nada más.
  assert.equal(guardarNotaEn(datos, { id: nota.id, revision: 1, fecha: hoy, tipo: 'tarea',
    texto: 'Sacar el pan', persona: para, hecha: true }, leo).code, 'permiso', 'la nota es de Ana, no de Leo');
  assert.equal(guardarNotaEn(datos, { id: nota.id, revision: 1, fecha: hoy, tipo: 'tarea',
    texto: 'Otro texto', persona: para, hecha: true }, ana).code, 'permiso', 'no puede reescribirla');
  assert.equal(guardarNotaEn(datos, { id: nota.id, revision: 1, fecha: hoy, tipo: 'tarea',
    texto: 'Sacar el pan', persona: null, hecha: true }, ana).code, 'permiso', 'no puede quitarse el destinatario');
  const hecha = guardarNotaEn(datos, { id: nota.id, revision: 1, fecha: hoy, tipo: 'tarea',
    texto: 'Sacar el pan', persona: para, hecha: true }, ana);
  assert.equal(hecha.ok, true);
  assert.equal(hecha.value.hecha, true);
  assert.equal(eliminarNotaEn(datos, { id: nota.id, revision: 2 }, ana).code, 'permiso', 'borrar sigue siendo del jefe');
  assert.equal(releer(datos).ok, true);
  const rota = structuredClone(datos);
  rota.notas[0].area = 'PANADERÍA';
  assert.equal(releer(rota).ok, false, 'guardada con los dos destinos, el historial se bloquea');
});

prueba('registrar desde el calendario guarda solo el cambio: el historial no se come el almacenamiento', () => {
  const publicado = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));
  const recetasReales = publicado.recipes;
  const datos = { ...base(), lotes: lotesDemo(hoy, recetasReales) };
  const veinte = recetasReales.slice(0, 20);
  let fecha = hoy;
  for (let dia = 0; dia < 30; dia += 1) {
    for (const r of veinte) {
      const revision = datos.planes.find((p) => p.fecha === fecha)?.revision || 0;
      assert.equal(fijarRecetaEn(datos, { fecha, revision, recetaId: r.id, factor: 1, responsable: 'Jefa', motivo: 'QA' }, recetasReales).ok, true);
    }
    const revision = datos.planes.find((p) => p.fecha === fecha).revision;
    assert.equal(fijarRecetaEn(datos, { fecha, revision, recetaId: veinte[0].id, factor: 2, responsable: 'Jefa', motivo: 'QA' }, recetasReales).ok, true);
    fecha = sumarDias(fecha, 1);
  }
  const ajustes = datos.eventos.filter((e) => e.tipo === 'plan_ajustado');
  assert.equal(ajustes.length, 30 * 21);
  assert.equal(datos.eventos.some((e) => e.tipo === 'plan_guardado'), false);
  assert.deepEqual([ajustes[20].tandasAntes, ajustes[20].tandasDespues, ajustes[20].recetaId], [1, 2, veinte[0].id]);
  assert.equal(ajustes[0].tandasAntes, null);
  // Un mes de 20 recetas diarias, con la bodega de ejemplo completa, cabe de
  // sobra en los ~5 millones de caracteres que da un navegador.
  const tamano = JSON.stringify(datos).length;
  assert.ok(tamano < 2_500_000, `el documento mide ${tamano} caracteres`);
  console.log(`   (un mes de 20 recetas diarias: ${tamano.toLocaleString("es-CO")} caracteres)`);
  assert.equal(releer(datos).ok, true);
  const roto = structuredClone(datos);
  roto.eventos.find((e) => e.tipo === 'plan_ajustado').tandasDespues = -1;
  assert.equal(releer(roto).ok, false);
});

prueba('el código de un lote nuevo solo mira códigos de lote', () => {
  assert.equal(siguienteId([{ id: 'L012' }, { id: '98955bd6-1111-4111-8111-111111111111' }, { id: '7' }]), 'L013');
  assert.equal(siguienteId([]), 'L001');
});

console.log(`${cantidad} comprobaciones del calendario de producción correctas.`);
