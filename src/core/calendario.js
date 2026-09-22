/**
 * =============================================================================
 *  CALENDARIO DE PRODUCCION
 * =============================================================================
 *
 *  Meses de lunes a domingo y festivos de Colombia, para cualquier año.
 *
 *  LOS FESTIVOS SE CALCULAN, NO SE ESCRIBEN
 *  ----------------------------------------
 *  Decision del negocio (2026-09-16): el calendario tiene que servir el año que
 *  viene sin que nadie cargue una lista. En Colombia casi todos los festivos se
 *  mueven: la Ley 51 de 1983 (Ley Emiliani) pasa al lunes siguiente los que no
 *  caen en lunes, y cuatro dependen de la Pascua. Una lista escrita a mano
 *  estaria mal el primero de enero siguiente.
 *
 *  - Fijos, no se mueven: 1 ene, 1 may, 20 jul, 7 ago, 8 dic, 25 dic.
 *  - Se trasladan al lunes: 6 ene, 19 mar, 29 jun, 15 ago, 12 oct, 1 nov, 11 nov.
 *  - Segun la Pascua: Jueves y Viernes Santo (no se mueven); Ascension (+43),
 *    Corpus Christi (+64) y Sagrado Corazon (+71), que ya caen en lunes.
 *
 *  Dos festivos pueden caer el mismo lunes (2025: San Pedro y Sagrado Corazon,
 *  30 de junio). Se juntan los nombres: perder uno seria mentir sobre el dia.
 *
 *  Todo es aritmetica de fechas en UTC con texto `AAAA-MM-DD`, igual que
 *  `core/bitacora.js`: la zona horaria del aparato no puede mover un dia.
 */

import { sumarDias, fechaValida } from './bitacora.js';

/** Años en los que el calendario tiene sentido. Fuera de aqui no hay festivos. */
export const ANIO_MIN = 1984;
export const ANIO_MAX = 2999;

export const DIAS_SEMANA = Object.freeze(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);

const FIJOS = [
  [1, 1, 'Año Nuevo'],
  [5, 1, 'Día del Trabajo'],
  [7, 20, 'Día de la Independencia'],
  [8, 7, 'Batalla de Boyacá'],
  [12, 8, 'Inmaculada Concepción'],
  [12, 25, 'Navidad'],
];

const TRASLADABLES = [
  [1, 6, 'Reyes Magos'],
  [3, 19, 'San José'],
  [6, 29, 'San Pedro y San Pablo'],
  [8, 15, 'Asunción de la Virgen'],
  [10, 12, 'Día de la Raza'],
  [11, 1, 'Todos los Santos'],
  [11, 11, 'Independencia de Cartagena'],
];

/** Dias desde el domingo de Pascua. Los tres ultimos ya incluyen el traslado. */
const DE_PASCUA = [
  [-3, 'Jueves Santo'],
  [-2, 'Viernes Santo'],
  [43, 'Ascensión del Señor'],
  [64, 'Corpus Christi'],
  [71, 'Sagrado Corazón de Jesús'],
];

const iso = (anio, mes, dia) => new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);
const diaSemana = (fecha) => new Date(fecha + 'T12:00:00Z').getUTCDay();
const anioValido = (anio) => Number.isInteger(anio) && anio >= ANIO_MIN && anio <= ANIO_MAX;

/**
 * Domingo de Pascua del calendario gregoriano (algoritmo anonimo de Meeus).
 *
 * @param {number} anio
 * @returns {string} AAAA-MM-DD
 */
export function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(anio, mes, dia);
}

/** El lunes igual o siguiente a la fecha. */
function alLunes(fecha) {
  return sumarDias(fecha, (8 - diaSemana(fecha)) % 7);
}

const memoria = new Map();

/**
 * Festivos de Colombia de un año.
 *
 * @param {number} anio
 * @returns {Map<string, string>} fecha -> nombre (varios nombres unidos por « · »)
 */
export function festivosDe(anio) {
  if (!anioValido(anio)) return new Map();
  if (memoria.has(anio)) return memoria.get(anio);
  const lista = [
    ...FIJOS.map(([mes, dia, nombre]) => [iso(anio, mes, dia), nombre]),
    ...TRASLADABLES.map(([mes, dia, nombre]) => [alLunes(iso(anio, mes, dia)), nombre]),
    ...DE_PASCUA.map(([dias, nombre]) => [sumarDias(pascua(anio), dias), nombre]),
  ];
  const festivos = new Map();
  for (const [fecha, nombre] of lista.sort(([a], [b]) => a.localeCompare(b))) {
    festivos.set(fecha, festivos.has(fecha) ? `${festivos.get(fecha)} · ${nombre}` : nombre);
  }
  memoria.set(anio, festivos);
  return festivos;
}

/** @returns {string|null} el nombre del festivo, o null si el dia no lo es */
export function festivo(fecha) {
  if (!fechaValida(fecha)) return null;
  return festivosDe(Number(fecha.slice(0, 4))).get(fecha) || null;
}

/** @returns {{anio: number, mes: number}} mes de 1 a 12 */
export function mesDe(fecha) {
  return { anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)) };
}

/** Suma meses sin pasar por `Date` local. */
export function sumarMeses(anio, mes, cantidad) {
  const total = anio * 12 + (mes - 1) + cantidad;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/**
 * Semanas completas, de lunes a domingo, que cubren un mes.
 *
 * Entre 4 y 6 semanas, como un calendario de pared: los dias de los meses
 * vecinos rellenan la primera y la ultima fila y se marcan como ajenos.
 *
 * @returns {Array<Array<{fecha: string, delMes: boolean}>>}
 */
export function semanasDelMes(anio, mes) {
  if (!anioValido(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) return [];
  const primero = iso(anio, mes, 1);
  const ultimo = iso(anio, mes + 1, 0);
  let dia = sumarDias(primero, -((diaSemana(primero) + 6) % 7));
  const semanas = [];
  while (dia <= ultimo) {
    const semana = [];
    for (let i = 0; i < 7; i += 1) {
      semana.push({ fecha: dia, delMes: dia.slice(0, 7) === primero.slice(0, 7) });
      dia = sumarDias(dia, 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

/** «septiembre de 2026» */
export function nombreMes(anio, mes) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(anio, mes - 1, 15)));
}

/** «miércoles 16 de septiembre de 2026» */
export function fechaLarga(fecha, conAnio = true) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}),
  }).format(new Date(fecha + 'T12:00:00Z'));
}

/** Sabado o domingo. */
export function esFinDeSemana(fecha) {
  const d = diaSemana(fecha);
  return d === 0 || d === 6;
}
