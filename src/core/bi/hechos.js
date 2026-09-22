/**
 * =============================================================================
 *  HECHOS DE LA OPERACION
 * =============================================================================
 *
 *  Traduce el documento local de operacion (`leerOperacion()`) a listas planas
 *  de hechos: que se produjo, que estaba planeado, que falta, que se midio,
 *  que entro y salio de bodega. Todo el resto de `core/bi/` lee SOLO esto.
 *
 *  POR QUE UNA CAPA APARTE. Es el unico sitio que conoce la forma del
 *  documento local. Cuando la operacion se centralice en Supabase se escribira
 *  `hechosDeSupabase()` con esta misma salida y ningun indicador cambiara.
 *
 *  COSTOS CONGELADOS. El costo de cada receta es el que se congelo al
 *  confirmarla (`ejecucion.costeo`), repartido con la misma regla que la
 *  pantalla de produccion (`ordenesPorArea`, via `costoDeResultado`). Nunca se
 *  recalcula con los precios de hoy: si mañana sube la harina, lo que costo el
 *  pan de ayer no cambia.
 *
 *  NUNCA MUTA EL DOCUMENTO. Los lotes se copian; lo demas se lee.
 *
 *  Funcion pura: no lee almacenamiento ni conoce el DOM.
 */

import { fechaValida, hoyLocal } from '../bitacora.js';
import { ok, err } from '../storage.js';
import { valorUnitario, estadoVencimiento } from '../almacen.js';
import { factorGramos } from '../conversiones.js';
import { pendientesDelPlan } from '../produccion.js';
import { costoDeResultado, rendimientoPrevisto } from '../resultados-produccion.js';
import { ordenesPorArea } from '../ordenes.js';
import { esMovimiento } from '../seguimiento.js';

const porInstante = (a, b) => (a.instante < b.instante ? -1 : a.instante > b.instante ? 1 : 0);
const porFechaEInstante = (a, b) => a.fecha.localeCompare(b.fecha) || porInstante(a, b);
const copiarLista = (v) => (Array.isArray(v) ? v : []);
const MINUTOS_MAXIMOS = 24 * 60;

// Mismo dia de Colombia que `fechaEvento` (seguimiento.js) y `hoyLocal`, con
// el formateador creado una sola vez: crearlo por evento costaba ~200 ms en
// un historial de 90 dias (casi 8.000 movimientos).
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
const diaDeEvento = (e) => FORMATO_DIA.format(new Date(e.instante));

/** Costo congelado de cada receta de una confirmacion, calculado una sola vez. */
function costosDeEjecucion(ejecucion) {
  const mapa = new Map();
  if (ejecucion.entradas.length === 1) {
    mapa.set(ejecucion.entradas[0].recipe.id, costoDeResultado(ejecucion, ejecucion.entradas[0].recipe.id));
    return mapa;
  }
  // Misma cuenta que `costoDeResultado`, pero repartida de una vez: pedirla
  // receta por receta rehace el consolidado N veces por confirmacion.
  for (const grupo of ordenesPorArea(ejecucion.entradas, [], ejecucion.fecha, ejecucion.costeo)) {
    for (const e of grupo.entradas) mapa.set(e.recipe.id, e.costo);
  }
  return mapa;
}

/**
 * Quien confirmo, unificado.
 *
 * Las confirmaciones con sesion traen `autor` (id, nombre, codigo). Las antiguas
 * solo traen `responsable` como texto, escrito por `nombreResponsable` como
 * «Nombre (CODIGO)» o solo «Nombre». Para que una misma persona no salga dos
 * veces en Equipo: se quita el sufijo « (CODIGO)», y si ese codigo o ese nombre
 * (sin mayusculas ni espacios de sobra) es de alguien con sesion, se usa su id.
 * Si no, la persona queda con id null y se agrupa por nombre.
 */
const normalizarNombre = (t) => String(t || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
const SUFIJO_CODIGO = /^(.*\S)\s*\(([^()]+)\)$/;

function unificadorDePersonas(ejecuciones) {
  const porCodigo = new Map();
  const porNombre = new Map();
  for (const e of ejecuciones) {
    if (!e.autor?.id) continue;
    const persona = { id: e.autor.id, nombre: e.autor.nombre || e.responsable };
    if (e.autor.codigo) porCodigo.set(normalizarNombre(e.autor.codigo), persona);
    porNombre.set(normalizarNombre(persona.nombre), persona);
  }
  const nombres = new Map();
  return (e) => {
    if (e.autor?.id) return { id: e.autor.id, nombre: e.autor.nombre || e.responsable };
    const texto = String(e.responsable || '').trim();
    const partes = texto.match(SUFIJO_CODIGO);
    const nombre = partes ? partes[1].trim() : texto;
    const conocida = (partes && porCodigo.get(normalizarNombre(partes[2]))) || porNombre.get(normalizarNombre(nombre));
    if (conocida) return conocida;
    // Mismo objeto para el mismo nombre normalizado: «Ana QA» y «ana  qa» son una.
    const clave = normalizarNombre(nombre);
    if (!nombres.has(clave)) nombres.set(clave, { id: null, nombre: nombre || 'Sin nombre' });
    return nombres.get(clave);
  };
}

/** Lo que vale en bodega un lote tal como quedo: existencia × precio de compra. */
function valorDeLote(lote) {
  if (!lote) return 0;
  const unitario = valorUnitario(lote);
  return unitario === null ? 0 : unitario * (Number(lote.existencia) || 0);
}

function precioPorGramo(lote) {
  const unitario = valorUnitario(lote);
  const gramos = factorGramos(lote.unidad, lote.equivalencias);
  return unitario === null || gramos === null || !(gramos > 0) ? null : unitario / gramos;
}

/**
 * Hechos de la operacion local.
 *
 * @param {object} doc documento de `leerOperacion()`
 * @param {Array<object>} recetas recetario actual (reservado: hoy todo sale de las copias congeladas)
 * @param {{hoy?: string, origen?: 'local'|'ejemplo'}} [opciones]
 */
export function hechosDeOperacion(doc, recetas, { hoy = hoyLocal(), origen = 'local' } = {}) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.lotes)) return err('datos', 'No se pudo leer la operación de este equipo.');
  if (!fechaValida(hoy)) return err('fecha', 'La fecha de hoy no es válida.');
  const ejecuciones = [...copiarLista(doc.ejecuciones)].sort(porInstante);
  const planes = [...copiarLista(doc.planes)].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const eventos = [...copiarLista(doc.eventos)].sort(porInstante);

  // --- Produccion confirmada: una fila por receta y confirmacion -------------
  const producciones = [];
  const porId = new Map();
  const personaDe = unificadorDePersonas(ejecuciones);
  for (const e of ejecuciones) {
    const costos = costosDeEjecucion(e);
    const persona = personaDe(e);
    for (const entrada of e.entradas) {
      const previsto = rendimientoPrevisto(entrada);
      const fila = {
        id: `${e.id}|${entrada.recipe.id}`, ejecucionId: e.id, recetaId: entrada.recipe.id,
        receta: entrada.recipe.nombre, area: entrada.recipe.categoria, fecha: e.fecha, instante: e.instante,
        tandas: entrada.factor, costo: costos.get(entrada.recipe.id) ?? 0,
        unidadesEsperadas: previsto.cantidad, unidadSalida: previsto.unidad,
        persona, porReceta: e.recetaId !== null && e.recetaId !== undefined,
      };
      producciones.push(fila);
      porId.set(fila.id, fila);
    }
  }

  // --- Plan vigente y lo que falta de cada dia --------------------------------
  const planeado = [];
  const pendientes = [];
  for (const plan of planes) {
    for (const e of plan.entradas) {
      planeado.push({ fecha: plan.fecha, recetaId: e.recipe.id, receta: e.recipe.nombre, area: e.recipe.categoria, tandas: e.factor });
    }
    for (const e of pendientesDelPlan(doc, plan)) {
      pendientes.push({ fecha: plan.fecha, recetaId: e.recipe.id, receta: e.recipe.nombre, area: e.recipe.categoria,
        tandas: e.factor, recipe: e.recipe });
    }
  }

  // --- Resultados medidos -----------------------------------------------------
  const resultados = [];
  for (const r of copiarLista(doc.resultados)) {
    const fila = porId.get(`${r.produccionId}|${r.recetaId}`);
    // Un resultado sin su confirmacion no pasa la validacion del documento;
    // si llegara, no hay fecha ni costo con que ubicarlo y se omite.
    if (!fila) continue;
    resultados.push({ produccionId: r.produccionId, recetaId: r.recetaId, receta: fila.receta, area: fila.area,
      fecha: fila.fecha, instante: fila.instante, unidad: r.unidad, esperado: r.esperado, vendible: r.vendible,
      rechazado: r.rechazado, mermaPreparacionGr: r.mermaPreparacionGr, mermaCoccionGr: r.mermaCoccionGr,
      costo: fila.costo, persona: fila.persona });
  }
  resultados.sort(porFechaEInstante);

  // --- Preparaciones (estado de hoy y de cada dia) ----------------------------
  const recetaDelPlan = new Map(planeado.map((p) => [`${p.fecha}|${p.recetaId}`, p]));
  const preparaciones = [];
  for (const p of copiarLista(doc.preparaciones)) {
    const enPlan = recetaDelPlan.get(`${p.fecha}|${p.recetaId}`);
    if (!enPlan) continue;
    preparaciones.push({ fecha: p.fecha, recetaId: p.recetaId, receta: enPlan.receta, area: enPlan.area,
      iniciada: p.iniciada, asignado: p.asignado ? { id: p.asignado.id, nombre: p.asignado.nombre, area: p.asignado.area } : null });
  }
  preparaciones.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.receta.localeCompare(b.receta, 'es'));

  // --- Tiempos de preparacion -------------------------------------------------
  // Al confirmar, la preparacion vuelve a `iniciada: null`: el inicio solo
  // queda en el historial. Se recorre por receta y dia, en orden de instante,
  // la linea de inicios, cancelaciones y confirmaciones: una confirmacion toma
  // el ultimo inicio vigente y lo consume, para que una produccion adicional
  // confirmada sin empezar no herede el inicio de la primera.
  const lineaDeTiempo = new Map();
  const agregar = (clave, item) => {
    if (!lineaDeTiempo.has(clave)) lineaDeTiempo.set(clave, []);
    lineaDeTiempo.get(clave).push(item);
  };
  for (const e of eventos) {
    if (e.tipo === 'preparacion_iniciada' || e.tipo === 'preparacion_cancelada') {
      agregar(`${e.fecha}|${e.recetaId}`, { instante: e.instante, tipo: e.tipo });
    }
  }
  // Una confirmación del área o del día también consume el inicio, pero no se
  // mide: su instante no es el de esa receta terminada. Sin consumirlo, una
  // producción adicional confirmada receta a receta heredaría el inicio viejo.
  for (const f of producciones) {
    agregar(`${f.fecha}|${f.recetaId}`, { instante: f.instante, tipo: f.porReceta ? 'confirmada' : 'confirmada_en_grupo', fila: f });
  }
  const tiempos = [];
  for (const items of lineaDeTiempo.values()) {
    items.sort(porInstante);
    let inicio = null;
    for (const item of items) {
      if (item.tipo === 'preparacion_iniciada') inicio = item.instante;
      else if (item.tipo === 'preparacion_cancelada') inicio = null;
      else {
        if (inicio && item.tipo === 'confirmada') {
          const minutos = (Date.parse(item.instante) - Date.parse(inicio)) / 60000;
          if (minutos > 0 && minutos <= MINUTOS_MAXIMOS) {
            const f = item.fila;
            tiempos.push({ fecha: f.fecha, recetaId: f.recetaId, receta: f.receta, area: f.area, minutos, persona: f.persona, instante: f.instante });
          }
        }
        inicio = null;
      }
    }
  }
  tiempos.sort(porFechaEInstante);
  for (const t of tiempos) delete t.instante;

  // --- Lotes de hoy -----------------------------------------------------------
  // Se conservan los campos que `costearPlan` necesita (FEFO, equivalencias,
  // marca, lote) para poder calcular faltantes sobre los hechos.
  const lotes = doc.lotes.map((l) => ({
    id: l.id, ingrediente: l.ingrediente, unidad: l.unidad, existencia: l.existencia, pesoCompra: l.pesoCompra,
    costoCompra: l.costoCompra, valorUnitario: valorUnitario(l), gramosPorUnidad: factorGramos(l.unidad, l.equivalencias),
    vencimiento: l.vencimiento || '', fechaCompra: l.fechaCompra || '', proveedor: l.proveedor || '',
    estado: estadoVencimiento(l, hoy), marca: l.marca || '', lote: l.lote || '', registrado: l.registrado || '',
    ...(l.equivalencias === undefined ? {} : { equivalencias: { ...l.equivalencias } }),
  }));

  // --- Movimientos de bodega --------------------------------------------------
  const movimientos = [];
  for (const e of eventos) {
    if (!esMovimiento(e)) continue;
    const antes = e.antes || null;
    const despues = e.despues || null;
    const lote = despues || antes;
    const delta = (Number(despues?.existencia) || 0) - (Number(antes?.existencia) || 0);
    const precio = valorUnitario(delta < 0 ? antes : despues);
    movimientos.push({
      id: e.id, tipo: e.tipo,
      fecha: e.tipo === 'compra' && fechaValida(despues?.fechaCompra) ? despues.fechaCompra : diaDeEvento(e),
      instante: e.instante, loteId: lote.id, ingrediente: lote.ingrediente, unidad: lote.unidad,
      proveedor: (despues?.proveedor ?? antes?.proveedor) || '',
      cantidad: delta, valor: precio === null ? null : delta * precio,
      costoCompra: e.tipo === 'compra' ? Number(despues.costoCompra) || 0 : null,
      precioPorGramo: precioPorGramo(lote),
      // Saldo del lote despues del movimiento: permite reconstruir el valor de
      // la bodega en cualquier fecha, incluso cuando un ajuste solo cambia el precio.
      saldo: Number(despues?.existencia) || 0, valorSaldo: valorDeLote(despues),
      motivo: e.motivo || '',
    });
  }
  movimientos.sort(porFechaEInstante);

  // --- Notas ------------------------------------------------------------------
  const notas = copiarLista(doc.notas).map((n) => ({
    id: n.id, fecha: n.fecha, tipo: n.tipo, hecha: n.hecha === true, area: n.area ?? null,
    persona: n.persona ? { id: n.persona.id, nombre: n.persona.nombre } : null,
    autor: n.autor ? { id: n.autor.id, nombre: n.autor.nombre } : null,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha));

  // --- Consumo en gramos (congelado en cada confirmacion) --------------------
  const consumoGramos = [];
  for (const e of ejecuciones) {
    for (const l of e.costeo?.lineas || []) {
      // El agua de proceso no sale de bodega ni cuesta: no es consumo de inventario.
      if (l.servicio === true || !(l.consumo > 0)) continue;
      consumoGramos.push({ fecha: e.fecha, ingrediente: l.ingrediente, gramos: l.consumo, costo: Number(l.costo) || 0 });
    }
  }
  consumoGramos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  producciones.sort(porFechaEInstante);
  return ok({ hoy, origen, producciones, planeado, pendientes, resultados, preparaciones, tiempos, lotes, movimientos, notas, consumoGramos });
}
