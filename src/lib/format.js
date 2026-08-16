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
 * Separa el nombre en sus TRES partes editables: base, cantidad y unidad.
 *
 * "TORTA DE BANANO X 2 UND" -> { base: "TORTA DE BANANO", cantidad: "2",
 *                                unidad: "UND" }
 *
 * El rendimiento vive dentro del nombre porque asi llego del Excel original y
 * asi esta escrito en las 121 recetas. Eso no obliga a PEDIRLO como texto
 * libre: el editor lo separa al abrir y lo vuelve a juntar al guardar, de modo
 * que la cantidad se teclea en un campo numerico y la unidad se elige de una
 * lista. Lo que se almacena no cambia.
 *
 * @param {string} nombre
 * @returns {{base: string, cantidad: string, unidad: string}}
 */
export function splitYield(nombre) {
  const { base, rinde } = splitName(nombre);
  if (!rinde) return { base, cantidad: '', unidad: '' };

  const match = rinde.match(/^([\d.,]+)\s*(.*)$/);
  // Un rendimiento sin cifra al principio no se puede repartir en dos campos.
  // Se devuelve entero como unidad para no perderlo: el editor lo conserva.
  if (!match) return { base, cantidad: '', unidad: rinde.trim() };

  return { base, cantidad: match[1], unidad: match[2].trim() };
}

/**
 * Lista de unidades de rendimiento que debe ofrecer un desplegable.
 *
 * Si el valor actual no esta entre las conocidas, se añade al final en vez de
 * descartarse. Hoy pasa con una sola receta, `BAGUEL NORMAL X 32 UND O 8 PAQ.`,
 * cuyo rendimiento es doble: sin esto, abrirla y guardarla le borraria la mitad
 * del rendimiento en silencio.
 *
 * Vive aqui, y no dentro de la vista, para poder comprobarse sin navegador: es
 * la pieza que evita una perdida de datos y merece una prueba propia.
 *
 * @param {Array<string>} conocidas
 * @param {string} actual
 * @returns {Array<string>}
 */
export function yieldUnitList(conocidas, actual) {
  const valor = String(actual || '').trim();
  if (valor === '' || conocidas.includes(valor)) return [...conocidas];
  return [...conocidas, valor];
}

/**
 * Distintivo corto del rendimiento, para listas que muestran el nombre base.
 *
 * "TORTA X 2 UND" -> "×2 und". Cadena vacia si la receta no declara ninguno.
 *
 * Hace falta porque el nombre base NO es unico: 14 de las 121 recetas comparten
 * base con otra y solo se distinguen por el rendimiento. Cuatro se llaman
 * "Sacher Torte" y dos "Pan Brioche". Una lista que muestre unicamente la base
 * ofrece filas identicas entre las que no hay forma de elegir, y eso ya pasaba
 * en el plan del dia y en el catalogo de ingredientes.
 *
 * @param {string} nombre
 * @returns {string}
 */
export function yieldLabel(nombre) {
  const { rinde } = splitName(nombre);
  return rinde ? '×' + rinde.toLowerCase() : '';
}

/**
 * Vuelve a juntar las tres partes en el nombre que se almacena.
 *
 * Escribe la forma canonica: "BASE X 15 UND". Las 13 recetas que hoy usan `x`
 * minuscula o "2UND" sin espacio NO se normalizan por la puerta de atras: el
 * editor solo llama aqui cuando alguien cambio el rendimiento de verdad, y
 * conserva el nombre original byte a byte cuando no lo toco. Reescribir un
 * nombre es cambiar la identidad con la que esa receta aparece en el plan, en
 * el catalogo y en las busquedas.
 *
 * @param {string} base
 * @param {string|number} cantidad
 * @param {string} unidad
 * @returns {string}
 */
export function composeName(base, cantidad, unidad) {
  const nombre = String(base || '').trim();
  if (nombre === '') return '';

  const numero = String(cantidad === null || cantidad === undefined ? '' : cantidad).trim();
  if (numero === '') return nombre;

  const medida = String(unidad || '').trim();
  return medida ? `${nombre} X ${numero} ${medida}` : `${nombre} X ${numero}`;
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
