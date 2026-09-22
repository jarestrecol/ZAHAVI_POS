/**
 * =============================================================================
 *  GASTO DE PRODUCCION EN EL TIEMPO
 * =============================================================================
 *
 *  Cuanta materia prima se gasto en producir, por dia, semana, mes o año. Es
 *  la cifra que responde "¿estamos gastando mas que el mes pasado?".
 *
 *  SOLO LO CONFIRMADO. Se suma el costo CONGELADO de cada produccion aprobada
 *  (`ejecucion.costeo`), no lo planeado: un plan puede no producirse, y el
 *  costo de hoy recalculado con los precios de hoy no es lo que costo el mes
 *  pasado. Es la misma regla con la que el historial conserva los costos.
 *
 *  LOS PERIODOS VACIOS CUENTAN. Una semana sin produccion es un cero en la
 *  grafica, no un hueco: sin el cero, la linea uniria el lunes con el jueves y
 *  pareceria que hubo gasto en medio.
 *
 *  POR AREA con el mismo reparto que la pantalla de produccion
 *  (`ordenesPorArea`), para que la suma de las areas cuadre con el total que
 *  se ve en el dia.
 *
 *  Las semanas empiezan en lunes, como la agenda. Las fechas son dias de
 *  Colombia (`hoyLocal`), no instantes UTC.
 *
 *  Funciones puras: no leen almacenamiento ni conocen el DOM.
 */

import { ordenesPorArea } from './ordenes.js';
import { CATEGORIES } from './schema.js';
import { fechaValida, hoyLocal, semanaDe, sumarDias } from './bitacora.js';
import { ok, err } from './storage.js';

/**
 * Agrupaciones que ofrece el tablero y cuantos periodos se ven de cada una.
 *
 * Treinta dias, doce semanas, doce meses y cinco años: lo bastante para ver una
 * tendencia sin que los puntos se amontonen en un telefono.
 */
export const PERIODOS_GASTO = Object.freeze({
  dia: Object.freeze({ nombre: 'Día', plural: 'días', cantidad: 30, femenino: false }),
  semana: Object.freeze({ nombre: 'Semana', plural: 'semanas', cantidad: 12, femenino: true }),
  mes: Object.freeze({ nombre: 'Mes', plural: 'meses', cantidad: 12, femenino: false }),
  año: Object.freeze({ nombre: 'Año', plural: 'años', cantidad: 5, femenino: false }),
});

/** Primer dia del periodo que contiene `fecha`. */
export function inicioDePeriodo(fecha, periodo) {
  if (periodo === 'semana') return semanaDe(fecha)[0];
  if (periodo === 'mes') return `${fecha.slice(0, 7)}-01`;
  if (periodo === 'año') return `${fecha.slice(0, 4)}-01-01`;
  return fecha;
}

/** Primer dia del periodo que empieza `pasos` periodos despues de `inicio`. */
function desplazar(inicio, periodo, pasos) {
  if (periodo === 'dia') return sumarDias(inicio, pasos);
  if (periodo === 'semana') return sumarDias(inicio, 7 * pasos);
  const anio = Number(inicio.slice(0, 4));
  const mes = Number(inicio.slice(5, 7)) - 1;
  const destino = periodo === 'mes' ? new Date(Date.UTC(anio, mes + pasos, 1)) : new Date(Date.UTC(anio + pasos, 0, 1));
  return destino.toISOString().slice(0, 10);
}

/**
 * Serie del gasto de materia prima de la produccion confirmada.
 *
 * @param {{ejecuciones: Array<object>}} datos bitacora de operacion
 * @param {'dia'|'semana'|'mes'|'año'} periodo
 * @param {{hasta?: string, cantidad?: number}} [opciones] ultimo dia incluido y
 *   cuantos periodos se devuelven; por defecto, hoy y los de `PERIODOS_GASTO`
 * @returns {{ok: true, value: {periodo: string, areas: Array<string>, puntos: Array<{desde: string, hasta: string, total: number, producciones: number, porArea: Object<string, number>}>, total: number, maximo: number, promedio: number, producciones: number}} | {ok: false, code: string, message: string}}
 */
export function serieDeGasto(datos, periodo, opciones = {}) {
  if (!Object.hasOwn(PERIODOS_GASTO, periodo)) return err('periodo', 'Elige agrupar por día, semana, mes o año.');
  const hasta = opciones.hasta ?? hoyLocal();
  if (!fechaValida(hasta)) return err('fecha', 'La fecha final del informe no es válida.');
  const cantidad = opciones.cantidad ?? PERIODOS_GASTO[periodo].cantidad;
  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 366) return err('cantidad', 'El informe admite entre 1 y 366 periodos.');
  if (!Array.isArray(datos?.ejecuciones)) return err('datos', 'No se pudo leer la producción registrada.');

  const ultimo = inicioDePeriodo(hasta, periodo);
  const puntos = [];
  for (let paso = cantidad - 1; paso >= 0; paso--) {
    const desde = desplazar(ultimo, periodo, -paso);
    puntos.push({ desde, hasta: sumarDias(desplazar(desde, periodo, 1), -1), total: 0, producciones: 0, porArea: {} });
  }
  // Un mapa por inicio de periodo: cada produccion cae en uno sin recorrerlos todos.
  const porInicio = new Map(puntos.map((p) => [p.desde, p]));
  const areas = new Set(CATEGORIES);

  for (const ejecucion of datos.ejecuciones) {
    if (!fechaValida(ejecucion?.fecha) || ejecucion.fecha > hasta) continue;
    const punto = porInicio.get(inicioDePeriodo(ejecucion.fecha, periodo));
    if (!punto) continue;
    punto.total += ejecucion.costeo.costoTotal;
    punto.producciones += 1;
    for (const grupo of ordenesPorArea(ejecucion.entradas, [], ejecucion.fecha, ejecucion.costeo)) {
      areas.add(grupo.categoria);
      punto.porArea[grupo.categoria] = (punto.porArea[grupo.categoria] || 0) + grupo.costo;
    }
  }

  // Todas las areas en todos los puntos, con cero: la grafica dibuja lineas
  // completas y la tabla no enseña celdas vacias que parezcan "sin dato".
  const listaAreas = [...areas];
  for (const punto of puntos) {
    for (const area of listaAreas) punto.porArea[area] = punto.porArea[area] || 0;
  }

  const total = puntos.reduce((suma, p) => suma + p.total, 0);
  return ok({
    periodo,
    areas: listaAreas,
    puntos,
    total,
    maximo: puntos.reduce((mayor, p) => Math.max(mayor, p.total), 0),
    promedio: Math.round(total / puntos.length),
    producciones: puntos.reduce((suma, p) => suma + p.producciones, 0),
  });
}

/**
 * Variacion del ultimo periodo frente al anterior, en proporcion.
 *
 * Devuelve null cuando no hay con que comparar: pasar de cero a algo no es un
 * "infinito por ciento" que se pueda enseñar.
 *
 * @param {Array<{total: number}>} puntos
 * @returns {number|null}
 */
export function variacionReciente(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2) return null;
  const anterior = puntos[puntos.length - 2].total;
  const actual = puntos[puntos.length - 1].total;
  if (!(anterior > 0)) return null;
  return (actual - anterior) / anterior;
}
