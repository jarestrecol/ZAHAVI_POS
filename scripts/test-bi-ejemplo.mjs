/**
 * Pruebas de la operación de ejemplo del panel de Resumen (`src/core/bi/ejemplo.js`).
 *
 * El ejemplo se construye ejecutando el núcleo real, así que aquí se comprueba
 * lo que el núcleo no garantiza por sí solo: que el resultado sea determinista,
 * que pase la validación de `leerOperacion`, que no toque el almacenamiento,
 * que sea verosímil y que se genere rápido.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { operacionDeEjemplo, PERSONAS_EJEMPLO } from '../src/core/bi/ejemplo.js';
import { leerOperacion, CLAVE_OPERACION, hoyLocal, sumarDias } from '../src/core/bitacora.js';
import { recetasDelDia } from '../src/core/preparacion.js';
import { valorUnitario, claveDe } from '../src/core/almacen.js';
import { factorGramos } from '../src/core/conversiones.js';

const recetas = JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8')).recipes;
const HOY = '2026-09-20';
// Guarda contra una regresión de rendimiento, no una marca de velocidad: en
// reposo la mediana es de ~1,2 s, y con la suite de navegador corriendo a la vez
// sube a ~1,5 s. Con 2,5 s no falla por carga y una regresión al doble sí salta.
// El tiempo medido se imprime siempre, para verlo aunque pase.
const LIMITE_MS = 2500;

// Almacenamiento simulado. `modo = 'falla'` hace que cualquier acceso lance.
const memoria = new Map();
let modo = 'normal', accesos = 0;
const tocar = () => { accesos += 1; if (modo === 'falla') throw new Error('almacenamiento prohibido durante el ejemplo'); };
globalThis.window = { localStorage: {
  getItem: (k) => { tocar(); return memoria.get(k) ?? null; },
  setItem: (k, v) => { tocar(); memoria.set(k, v); },
  removeItem: (k) => { tocar(); memoria.delete(k); },
} };

let cantidad = 0;
function prueba(nombre, fn) { fn(); cantidad += 1; console.log(`OK ${nombre}`); }
function generar(opciones) {
  const t = performance.now();
  const r = operacionDeEjemplo(recetas, opciones);
  return { r, ms: performance.now() - t };
}

const copiaRecetas = JSON.stringify(recetas);
const tiempos = [];
const a = generar({ hoy: HOY }); tiempos.push(a.ms);
const b = generar({ hoy: HOY }); tiempos.push(b.ms);
const c = generar({ hoy: HOY, semilla: 7 }); tiempos.push(c.ms);
assert.equal(a.r.ok, true, a.r.message);
const doc = a.r.value;
const texto = JSON.stringify(doc);

prueba('determinista: misma semilla, mismo JSON; otra semilla, otro', () => {
  assert.equal(texto, JSON.stringify(b.r.value));
  assert.equal(c.r.ok, true);
  assert.notEqual(texto, JSON.stringify(c.r.value));
});

prueba('no modifica el recetario recibido', () => assert.equal(JSON.stringify(recetas), copiaRecetas));

prueba('pasa la validación de leerOperacion', () => {
  memoria.set(CLAVE_OPERACION, texto);
  const leido = leerOperacion();
  assert.equal(leido.ok, true, leido.message);
  assert.equal(leido.value.ejecuciones.length, doc.ejecuciones.length);
  assert.equal(leido.value.eventos.length, doc.eventos.length);
  memoria.clear();
});

prueba('no toca el almacenamiento: con localStorage que lanza, se genera igual', () => {
  modo = 'falla'; accesos = 0;
  const r = operacionDeEjemplo(recetas, { hoy: HOY, dias: 20, semilla: 3 });
  modo = 'normal';
  assert.equal(r.ok, true, r.message);
  assert.equal(accesos, 0);
});

const inicio = sumarDias(HOY, -89);
const pasados = (f) => f < HOY;

prueba('cubre 90 días y marca el documento como ejemplo', () => {
  assert.deepEqual(doc.ejemplo, { semilla: 20260921, dias: 90, desde: inicio, hasta: HOY });
  assert.ok(doc.planes.every((p) => p.fecha >= inicio && p.fecha <= HOY));
  assert.ok(doc.planes.length >= 70, `${doc.planes.length} días con plan`);
});

prueba('volumen: viernes+sábado > lunes+martes; domingo bajo', () => {
  const porDia = Array.from({ length: 7 }, () => ({ tandas: 0, dias: 0 }));
  for (let i = 0; i < 90; i++) {
    const f = sumarDias(inicio, i);
    const d = (new Date(f + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const plan = doc.planes.find((p) => p.fecha === f);
    porDia[d].dias += 1;
    porDia[d].tandas += plan ? plan.entradas.reduce((s, e) => s + e.factor, 0) : 0;
  }
  const media = (d) => porDia[d].tandas / porDia[d].dias;
  assert.ok(media(4) + media(5) > media(0) + media(1), 'fin de semana sin más volumen');
  assert.ok(media(6) < Math.min(...[0, 1, 2, 3, 4, 5].map(media)) / 2, 'domingo no es bajo');
  for (const p of doc.planes) {
    const d = (new Date(p.fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;
    if (d < 6) assert.ok(p.entradas.length >= 6 && p.entradas.length <= 14, `${p.fecha}: ${p.entradas.length} recetas`);
  }
});

prueba('≥ 85 % de lo planeado en días pasados está confirmado', () => {
  let plan = 0, hecho = 0;
  for (const p of doc.planes.filter((x) => pasados(x.fecha))) plan += p.entradas.reduce((s, e) => s + e.factor, 0);
  for (const e of doc.ejecuciones.filter((x) => pasados(x.fecha))) hecho += e.entradas.reduce((s, x) => s + x.factor, 0);
  assert.ok(hecho / plan >= 0.85 && hecho / plan <= 1, `confirmado ${(hecho / plan * 100).toFixed(1)} %`);
  const recientes = doc.planes.filter((p) => p.fecha >= sumarDias(HOY, -3) && p.fecha < HOY)
    .flatMap((p) => recetasDelDia(doc, p.fecha)).filter((r) => r.estado !== 'lista');
  assert.ok(recientes.length > 0, 'no hay recetas atrasadas en los últimos días');
});

prueba('resultados en 75-95 % de las confirmaciones; rechazo ≤ 12 %', () => {
  const confirmaciones = doc.ejecuciones.reduce((s, e) => s + e.entradas.length, 0);
  const tasa = doc.resultados.length / confirmaciones;
  assert.ok(tasa >= 0.75 && tasa <= 0.95, `resultados en ${(tasa * 100).toFixed(1)} %`);
  for (const r of doc.resultados) {
    const obtenido = r.vendible + r.rechazado;
    if (obtenido > 0) assert.ok(r.rechazado / obtenido <= 0.12 + 1e-9, `rechazo ${r.rechazado}/${obtenido}`);
  }
  assert.ok(doc.resultados.some((r) => r.rechazado > 0));
  assert.ok(doc.resultados.some((r) => r.mermaCoccionGr > 0 || r.mermaPreparacionGr > 0));
  assert.ok(doc.resultados.some((r) => r.revision === 2), 'sin correcciones');
  // Medidas de salida: unidades contables por rendimiento declarado, y GR para
  // preparaciones sin rendimiento. Nunca se mezclan en un mismo resultado.
  const unidades = new Set(doc.resultados.map((r) => r.unidad));
  assert.ok([...unidades].every((u) => ['UND', 'PORC', 'PAQ', 'CAJA', 'GR'].includes(u)), [...unidades].join(','));
  assert.ok(doc.resultados.filter((r) => r.unidad === 'GR').every((r) => r.esperado === null));
});

prueba('ninguna confirmación con faltantes ni sin precio', () => {
  for (const e of doc.ejecuciones) {
    assert.equal(e.costeo.lineasConFaltante, 0, e.id);
    assert.equal(e.costeo.lineasSinPrecio, 0, e.id);
    assert.ok(e.costeo.costoTotal > 0, e.id);
  }
});

prueba('personas ficticias con un solo id y un solo nombre en las ejecuciones', () => {
  assert.equal(PERSONAS_EJEMPLO.length, 5);
  assert.ok(PERSONAS_EJEMPLO.every((p) => p.nombre.endsWith('(ejemplo)')));
  const nombres = new Map(), ids = new Map();
  for (const e of doc.ejecuciones) {
    assert.ok(e.autor, `ejecución ${e.id} sin autor`);
    assert.ok(PERSONAS_EJEMPLO.some((p) => p.id === e.autor.id && p.nombre === e.autor.nombre), e.autor.nombre);
    (nombres.get(e.autor.id) || nombres.set(e.autor.id, new Set()).get(e.autor.id)).add(e.autor.nombre);
    (ids.get(e.autor.nombre) || ids.set(e.autor.nombre, new Set()).get(e.autor.nombre)).add(e.autor.id);
  }
  assert.ok([...nombres.values()].every((s) => s.size === 1));
  assert.ok([...ids.values()].every((s) => s.size === 1));
  assert.ok(doc.ejecuciones.some((e) => e.recetaId === null), 'sin cierre por área');
  assert.ok(doc.preparaciones.some((p) => p.asignado?.nombre.endsWith('(ejemplo)')));
});

prueba('compras con proveedores de ejemplo, alzas marcadas y 2-4 bajas', () => {
  const compras = doc.eventos.filter((e) => e.tipo === 'compra');
  assert.ok(compras.length >= 20, `${compras.length} compras`);
  assert.ok(compras.every((e) => e.despues.proveedor.endsWith('(ejemplo)')));
  const bajas = doc.eventos.filter((e) => e.tipo === 'baja');
  assert.ok(bajas.length >= 2 && bajas.length <= 4, `${bajas.length} bajas`);
  const precio = (l) => valorUnitario(l) / factorGramos(l.unidad, l.equivalencias);
  const porIngrediente = new Map();
  for (const e of compras) {
    const k = claveDe(e.despues.ingrediente, e.despues.unidad);
    porIngrediente.set(k, [...(porIngrediente.get(k) || []), precio(e.despues)]);
  }
  const conAlza = [...porIngrediente.values()].filter((p) => p.some((v, i) => i > 0 && v / p[i - 1] >= 1.12));
  assert.ok(conAlza.length >= 2, `${conAlza.length} ingredientes con alza ≥ 12 %`);
  // La deriva normal sube poco a poco: la mediana entre compras seguidas es pequeña.
  const saltos = [...porIngrediente.values()].flatMap((p) => p.slice(1).map((v, i) => v / p[i] - 1)).sort((x, y) => x - y);
  assert.ok(Math.abs(saltos[Math.floor(saltos.length / 2)]) < 0.05);
});

prueba('notas de los cuatro tipos, hechas y abiertas, alguna para una persona', () => {
  const tipos = new Set(doc.notas.map((n) => n.tipo));
  assert.deepEqual([...tipos].sort(), ['felicitacion', 'pendiente', 'recomendacion', 'tarea']);
  assert.ok(doc.notas.some((n) => n.hecha) && doc.notas.some((n) => !n.hecha && ['tarea', 'pendiente'].includes(n.tipo)));
  assert.ok(doc.notas.some((n) => n.persona?.nombre.endsWith('(ejemplo)')));
});

prueba('cada instante cae en su día simulado (Bogotá) y el historial está en orden', () => {
  const dia = (iso) => hoyLocal(new Date(iso));
  for (const e of doc.ejecuciones) assert.equal(dia(e.instante), e.fecha);
  for (const e of doc.eventos) {
    if (e.fecha) assert.equal(dia(e.instante), e.fecha, `${e.tipo} ${e.id}`);
    if (e.tipo === 'compra') assert.equal(dia(e.instante), e.despues.fechaCompra);
  }
  for (const n of doc.notas) assert.equal(dia(n.creada), n.fecha);
  for (const p of doc.preparaciones) if (p.iniciada) assert.equal(dia(p.iniciada), p.fecha);
  for (let i = 1; i < doc.eventos.length; i++) assert.ok(doc.eventos[i - 1].instante <= doc.eventos[i].instante, `evento ${i} fuera de orden`);
  assert.ok(doc.eventos.every((e) => e.instante < new Date().toISOString()));
});

prueba('hoy va a medias (aunque sea domingo): lista, en preparación y sin asignar', () => {
  for (const d of [doc, c.r.value]) {
    const hoy = recetasDelDia(d, HOY);
    assert.ok(hoy.some((r) => r.estado === 'lista'));
    assert.ok(hoy.some((r) => r.estado === 'en_preparacion'));
    assert.ok(hoy.some((r) => r.estado === 'pendiente' && !r.preparacion?.asignado));
  }
});

prueba('casos límite devuelven error claro', () => {
  for (const [args, code] of [[[[]], 'sin_recetas'], [[null], 'sin_recetas'],
    [[recetas, { dias: 0 }], 'dias_invalidos'], [[recetas, { dias: 367 }], 'dias_invalidos'], [[recetas, { dias: 2.5 }], 'dias_invalidos'],
    [[recetas, { hoy: '2026-02-30' }], 'fecha_invalida'], [[recetas, { hoy: 'ayer' }], 'fecha_invalida'],
    [[recetas, { hoy: sumarDias(hoyLocal(), 2) }], 'fecha_futura'], [[recetas, { semilla: NaN }], 'semilla_invalida']]) {
    const r = operacionDeEjemplo(...args);
    assert.equal(r.ok, false); assert.equal(r.code, code); assert.ok(r.message.length > 10);
  }
  const uno = operacionDeEjemplo(recetas, { hoy: HOY, dias: 1 });
  assert.equal(uno.ok, true, uno.message);
  const sinCosteo = operacionDeEjemplo([{ id: 'X', nombre: 'X', categoria: 'OTROS', componentes: [] }], { hoy: HOY, dias: 3 });
  assert.equal(sinCosteo.code, 'ejemplo_fallido');
});

prueba(`genera 90 días en menos de ${LIMITE_MS} ms`, () => {
  const mediana = [...tiempos].sort((x, y) => x - y)[1];
  console.log(`   tiempos: ${tiempos.map((t) => t.toFixed(0)).join(' ms, ')} ms (mediana ${mediana.toFixed(0)} ms); ` +
    `${doc.ejecuciones.length} confirmaciones, ${doc.lotes.length} lotes, ${(texto.length / 1e6).toFixed(1)} M caracteres`);
  assert.ok(mediana < LIMITE_MS);
});

console.log(`\n${cantidad} pruebas del ejemplo correctas.`);
