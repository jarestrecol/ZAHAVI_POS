/**
 * =============================================================================
 *  PREPARACION RECETA A RECETA
 * =============================================================================
 *
 *  El dia de produccion se trabaja una receta cada vez:
 *
 *      pendiente ──empezar──▶ en preparacion ──confirmar──▶ lista
 *
 *  «Lista» no se guarda: se deduce de que ya no le quedan tandas pendientes
 *  (`core/produccion.js`). Confirmar es aprobar la produccion de ESA receta,
 *  con las mismas garantias de siempre: se recalcula el costo FEFO, se niega si
 *  falta algo y se descuenta de bodega solo lo pendiente. Si despues se le
 *  suman tandas, vuelve a estar pendiente por la diferencia.
 *
 *  QUIEN PUEDE QUE, AQUI Y NO SOLO EN LA PANTALLA: asignar es del jefe de
 *  obrador en adelante; un operario solo empieza, deja o confirma lo que tiene
 *  asignado. Es la capa que se llevara al servidor cuando la produccion se
 *  centralice.
 *
 *  Cada receta del dia puede tener un TRABAJADOR asignado, de su misma area.
 *  Es lo que ve esa persona en «Mi producción». La lista de trabajadores y su
 *  area vienen de Supabase (`0011`); la asignacion se guarda en este equipo,
 *  como el resto de la produccion, hasta que la produccion se centralice.
 */

import {
  copiar, registrarEvento, fechaValida, hoyLocal, personaValida, trabajadorValido, alMenos,
} from './bitacora.js';
import { producidoPorReceta, aprobarPlanEn } from './produccion.js';
import { notasDelDia, nombreResponsable } from './notas.js';
import { ALL_CATEGORIES, CATEGORIES } from './schema.js';
import { ok, err } from './storage.js';

const redondear = (n) => Math.round(n * 1000) / 1000;
const persona = (p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo });

/**
 * Las recetas de un dia con su estado.
 *
 * @returns {Array<{recipe: object, factor: number, producido: number, pendiente: number,
 *   estado: 'pendiente'|'en_preparacion'|'lista', parcial: boolean, preparacion: object|null}>}
 */
export function recetasDelDia(datos, fecha) {
  const plan = datos.planes.find((p) => p.fecha === fecha);
  if (!plan) return [];
  const producido = producidoPorReceta(datos, fecha);
  return plan.entradas.map((e) => {
    const hecho = redondear(producido.get(e.recipe.id) || 0);
    const pendiente = Math.max(0, redondear(e.factor - hecho));
    const preparacion = preparacionDe(datos, fecha, e.recipe.id);
    const estado = pendiente === 0 ? 'lista' : preparacion?.iniciada ? 'en_preparacion' : 'pendiente';
    return { recipe: e.recipe, factor: e.factor, producido: hecho, pendiente, estado,
      parcial: hecho > 0 && pendiente > 0, preparacion };
  });
}

export function preparacionDe(datos, fecha, recetaId) {
  return (datos.preparaciones || []).find((p) => p.fecha === fecha && p.recetaId === recetaId) || null;
}

/** Lo que tiene asignado una persona ese dia. */
export function asignadasA(datos, personaId, fecha) {
  return recetasDelDia(datos, fecha).filter((r) => r.preparacion?.asignado?.id === personaId);
}

/**
 * Lo que la celda del calendario necesita saber de un dia.
 *
 * Las areas salen en el orden del catalogo, y un area ajena al catalogo se
 * añade al final en vez de perderse.
 */
export function resumenDelDia(datos, fecha) {
  const recetas = recetasDelDia(datos, fecha);
  const areas = [...CATEGORIES, ...new Set(recetas.map((r) => r.recipe.categoria).filter((c) => !CATEGORIES.includes(c)))];
  const porArea = areas.map((area) => {
    const delArea = recetas.filter((r) => r.recipe.categoria === area);
    return {
      area,
      total: delArea.length,
      listas: delArea.filter((r) => r.estado === 'lista').length,
      enCurso: delArea.filter((r) => r.estado === 'en_preparacion').length,
    };
  }).filter((a) => a.total > 0);
  const listas = recetas.filter((r) => r.estado === 'lista').length;
  return {
    fecha,
    recetas: recetas.length,
    listas,
    enCurso: recetas.filter((r) => r.estado === 'en_preparacion').length,
    estado: !recetas.length ? null : listas === recetas.length ? 'lista' : listas || recetas.some((r) => r.estado !== 'pendiente') ? 'en_curso' : 'planeada',
    porArea,
    notas: notasDelDia(datos, fecha),
  };
}

/** Un operario solo trabaja lo que tiene asignado. */
function puedeTrabajar(autor, receta) {
  if (alMenos(autor, 'obrador') || receta.preparacion?.asignado?.id === autor.id) return ok(receta);
  return err('permiso', 'Esta receta no está asignada a ti.');
}

function recetaDelPlan(datos, fecha, recetaId) {
  if (!fechaValida(fecha)) return err('fecha', 'Elige un día válido.');
  const receta = recetasDelDia(datos, fecha).find((r) => r.recipe.id === recetaId);
  if (!receta) return err('receta_invalida', 'Esa receta no está en la producción del día.');
  return ok(receta);
}

function guardarPreparacion(datos, tipo, receta, cambio, autor, motivo) {
  const { fecha } = cambio;
  const antes = receta.preparacion;
  const despues = {
    fecha, recetaId: receta.recipe.id,
    iniciada: null, iniciadaPor: null, asignado: null, asignadoPor: null,
    ...(antes || {}), ...cambio, actualizada: new Date().toISOString(),
  };
  datos.preparaciones = [
    ...(datos.preparaciones || []).filter((p) => !(p.fecha === fecha && p.recetaId === receta.recipe.id)),
    despues,
  ];
  registrarEvento(datos, tipo, { fecha, recetaId: receta.recipe.id, responsable: nombreResponsable(autor),
    autorId: autor.id, motivo, antes, despues });
  return ok(copiar(despues));
}

/** Empieza a producir una receta. Repetirlo no cambia la hora de inicio. */
export function iniciarPreparacionEn(datos, { fecha, recetaId }, autor) {
  if (!personaValida(autor)) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.');
  const r = recetaDelPlan(datos, fecha, recetaId);
  if (!r.ok) return r;
  const permiso = puedeTrabajar(autor, r.value);
  if (!permiso.ok) return permiso;
  if (fecha > hoyLocal()) return err('futuro', 'Esta producción es de un día que aún no llega. Se empieza el día programado.');
  if (r.value.estado === 'lista') return err('ya_lista', 'Esta receta ya está lista.');
  if (r.value.estado === 'en_preparacion') return ok(copiar(r.value.preparacion));
  return guardarPreparacion(datos, 'preparacion_iniciada', r.value,
    { fecha, iniciada: new Date().toISOString(), iniciadaPor: persona(autor) }, autor, 'Empezó a producir');
}

/** Devuelve una receta en preparacion a pendiente, sin tocar la bodega. */
export function cancelarPreparacionEn(datos, { fecha, recetaId }, autor) {
  if (!personaValida(autor)) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.');
  const r = recetaDelPlan(datos, fecha, recetaId);
  if (!r.ok) return r;
  const permiso = puedeTrabajar(autor, r.value);
  if (!permiso.ok) return permiso;
  if (r.value.estado !== 'en_preparacion') return err('no_iniciada', 'Esta receta no está en preparación.');
  return guardarPreparacion(datos, 'preparacion_cancelada', r.value,
    { fecha, iniciada: null, iniciadaPor: null }, autor, 'Dejó de producir');
}

/**
 * Asigna la receta a un trabajador de su area, o la deja sin asignar (`null`).
 *
 * Una receta lista no se reasigna: quien la saco ya quedo en el historial.
 */
export function asignarRecetaEn(datos, { fecha, recetaId, trabajador }, autor) {
  if (!personaValida(autor)) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.');
  if (!alMenos(autor, 'obrador')) return err('permiso', 'Asignar recetas es del jefe de obrador en adelante.');
  const r = recetaDelPlan(datos, fecha, recetaId);
  if (!r.ok) return r;
  if (r.value.estado === 'lista') return err('ya_lista', 'Esta receta ya está lista: no se puede cambiar quién la saca.');
  if (trabajador !== null && !trabajadorValido(trabajador)) {
    return err('trabajador', 'Elige un trabajador con área de producción asignada.');
  }
  if (trabajador && trabajador.area !== r.value.recipe.categoria) {
    return err('area_distinta', 'Ese trabajador es de otra área. Asigna la receta a alguien de su área.');
  }
  if ((r.value.preparacion?.asignado?.id || null) === (trabajador?.id || null)) return ok(copiar(r.value.preparacion));
  const asignado = trabajador ? { ...persona(trabajador), area: trabajador.area } : null;
  return guardarPreparacion(datos, 'receta_asignada', r.value,
    { fecha, asignado, asignadoPor: asignado ? persona(autor) : null }, autor,
    asignado ? `Asignada a ${nombreResponsable(asignado)}` : 'Sin asignar');
}

/**
 * Confirma que una receta quedo preparada: descuenta de bodega SOLO esa receta.
 *
 * @param {{fecha: string, revision: number, recetaId: string, costeo: object}} solicitud
 *   `costeo` es el que se enseño en pantalla; si la bodega cambio, se niega.
 */
export function confirmarRecetaEn(datos, solicitud, autor) {
  if (!personaValida(autor)) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.');
  const { fecha, revision, recetaId, costeo } = solicitud;
  const receta = recetaDelPlan(datos, fecha, recetaId);
  if (!receta.ok) return receta;
  const permiso = puedeTrabajar(autor, receta.value);
  if (!permiso.ok) return permiso;
  const r = aprobarPlanEn(datos, { fecha, revision, recetaId, costeo, area: ALL_CATEGORIES,
    responsable: nombreResponsable(autor), motivo: 'Receta preparada' });
  if (!r.ok) return r;
  r.value.autor = persona(autor);
  // La preparacion termino. Se conserva la asignacion; el inicio ya esta en el
  // historial, y si luego se suman tandas la receta vuelve a empezar de cero.
  const preparacion = preparacionDe(datos, fecha, recetaId);
  if (preparacion?.iniciada) {
    Object.assign(preparacion, { iniciada: null, iniciadaPor: null, actualizada: new Date().toISOString() });
  }
  return r;
}
