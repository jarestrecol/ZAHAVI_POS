/**
 * Formateo de texto del recetario.
 *
 * Los datos vienen del Excel original en mayusculas sostenidas
 * ("ALMOJÁBANA (LEÓN) X 15 UND"). Aqui se convierten a la forma legible que
 * muestra la interfaz, sin tocar el dato almacenado.
 */

/** Sufijos de rendimiento que aparecen al final del nombre de una receta. */
const YIELD_UNITS = 'UND|UNDS|UNIDADES|UDS|PAQ\\.?|PAQUETES|CAJAS?|PORC\\.?|PORCIONES';
const YIELD_PATTERN = new RegExp(
  `\\s+[Xx]\\s+(\\d[\\d.,]*\\s*(?:${YIELD_UNITS})?(?:\\s+O\\s+\\d[\\d.,]*\\s*(?:UND|PAQ\\.?|CAJAS?)?)?)\\s*$`,
  'i',
);

/** Posicion minima del separador para no partir nombres que empiezan por "X". */
const MIN_YIELD_INDEX = 2;

/**
 * Decimales que se muestran de una cantidad.
 *
 * Uno basta: ninguna bascula de obrador aprecia mas, y el dato de origen trae
 * ruido de coma flotante del Excel (283.33333333333297 gr, 5.6666666666666696
 * und). Solo cambia la presentacion; el valor guardado no se toca.
 */
const QTY_DECIMALS = 1;

/**
 * Separa el nombre de una receta de su rendimiento.
 * "TORTA DE BANANO X 2 UND" -> { base: "TORTA DE BANANO", rinde: "2 UND" }
 *
 * @param {string} nombre
 * @returns {{ base: string, rinde: string }}
 */
export function splitName(nombre) {
  const value = (nombre || '').trim();
  const match = value.match(YIELD_PATTERN);
  if (match && match.index > MIN_YIELD_INDEX) {
    return { base: value.slice(0, match.index).trim(), rinde: match[1].trim() };
  }
  return { base: value, rinde: '' };
}

/**
 * Convierte MAYUSCULAS a Formato Titulo respetando acentos y separadores.
 *
 * @param {string} value
 * @returns {string}
 */
export function titleCase(value) {
  return (value || '')
    .toLowerCase()
    .replace(/(^|[\s(\-/])([a-záéíóúñü])/g, (_match, prefix, char) => prefix + char.toUpperCase());
}

/**
 * Formatea una cantidad para mostrarla. Acepta coma o punto decimal y devuelve
 * coma decimal, que es la convencion local.
 *
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
export function formatQty(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return String(value);
  const factor = 10 ** QTY_DECIMALS;
  return String(Math.round(parsed * factor) / factor).replace('.', ',');
}

/**
 * Normaliza para comparar y ordenar: sin acentos, en mayusculas.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalize(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * Letra bajo la que se agrupa una receta en el indice.
 *
 * @param {string} nombre
 * @returns {string} una letra A-Z, o "#" para lo demas
 */
export function indexLetter(nombre) {
  const first = normalize(nombre).charAt(0);
  return /[A-Z]/.test(first) ? first : '#';
}

/**
 * Comparador alfabetico en espanol para ordenar recetas por nombre.
 *
 * @param {{nombre: string}} a
 * @param {{nombre: string}} b
 * @returns {number}
 */
export function byName(a, b) {
  return a.nombre.localeCompare(b.nombre, 'es');
}
