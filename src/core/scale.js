/**
 * =============================================================================
 *  ESCALADO DE TANDA
 * =============================================================================
 *
 *  Multiplica las cantidades de una receta para producir mas o menos de lo que
 *  dice su formula original.
 *
 *  POR QUE HACE FALTA
 *  ------------------
 *  Sin esta funcion, la unica forma de tener "Sacher Torte para 5" era duplicar
 *  la receta a mano y reescribir sus cantidades. Eso es exactamente lo que hay
 *  en el catalogo: 14 de las 121 recetas (el 12%) son variantes escaladas a
 *  mano de otras 6, y en una de esas copias se colo un error de nueve kilos de
 *  chocolate. La cuenta la hace mejor la maquina.
 *
 *  NO TOCA LOS DATOS
 *  -----------------
 *  Esto es una transformacion de LECTURA. Devuelve una copia con las cantidades
 *  multiplicadas y no escribe nada: ni en el almacenamiento del equipo, ni en
 *  el recetario publicado. Las 121 recetas auditadas quedan intactas pase lo
 *  que pase con el factor. Por eso el factor vive en el estado de la pantalla y
 *  se pierde al cerrar, igual que una lupa: aumenta lo que se ve, no lo que
 *  hay.
 *
 *  LO QUE NO SE ESCALA
 *  -------------------
 *  Las unidades de longitud (CM) describen una medida fisica, no una cantidad:
 *  un molde de 24 cm sigue siendo de 24 cm aunque se hagan cuatro tortas. Se
 *  dejan tal cual y se marcan para que la interfaz pueda avisarlo.
 */

import { splitYield, formatMedida } from '../lib/format.js';

/** Factor sin escalado: la receta tal como esta escrita. */
export const FACTOR_ORIGINAL = 1;

/** Atajos que ofrece la interfaz. */
export const FACTORES = [0.5, 1, 2, 3, 4];

/**
 * Unidades que describen una medida fisica y NO se multiplican.
 *
 * Un molde de 24 CM no pasa a 48 CM por doblar la tanda: se usan dos moldes de
 * 24. Multiplicarlo daria una instruccion imposible de seguir.
 */
const UNIDADES_NO_ESCALABLES = new Set(['CM', 'MM', 'M', 'PULG', '°C', 'C', 'MIN', 'HORA', 'HORAS']);

/**
 * Limites de seguridad: fuera de este rango el factor no tiene sentido.
 *
 * Van exportados porque `normalizarFactor` recorta en silencio, y cualquier
 * pantalla que deje escribir un factor a mano tiene que poder avisar ANTES de
 * que el recorte ocurra. Sin esto, el plan de produccion llego a enseñar el
 * rendimiento de 500 tandas mientras consolidaba 100: dos cifras distintas
 * para la misma peticion, y una de ellas se imprimia.
 */
export const FACTOR_MIN = 0.05;
export const FACTOR_MAX = 100;

/**
 * Indica si una unidad se multiplica al escalar.
 *
 * @param {string} unidad
 * @returns {boolean}
 */
export function esEscalable(unidad) {
  return !UNIDADES_NO_ESCALABLES.has(String(unidad || '').trim().toUpperCase());
}

/**
 * Deja un factor dentro de un rango con sentido.
 *
 * Un factor de cero vaciaria la receta y uno negativo daria cantidades
 * imposibles, asi que ambos se descartan y se vuelve al original.
 *
 * @param {number|string} value
 * @returns {number}
 */
export function normalizarFactor(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return FACTOR_ORIGINAL;
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, parsed));
}

/**
 * Rendimiento numerico declarado en el nombre de la receta.
 *
 * "TORTA DE BANANO X 2 UND" -> 2. Sirve para poder pedir "quiero 6" en vez de
 * pensar en multiplicadores. Devuelve null cuando el nombre no lo declara: son
 * 34 de las 121 recetas, y para esas solo se ofrece el multiplicador.
 *
 * Se apoya en `splitYield` en vez de volver a buscar la cifra con una expresion
 * propia. Antes tenia la suya, sin anclar al principio, y coincidia con la de
 * `splitYield` solo por casualidad: el dia que se aflojara el patron de
 * rendimiento para leer los nombres que hoy no se leen, las dos habrian
 * empezado a devolver cosas distintas sin que nada lo avisara.
 *
 * @param {string} nombre
 * @returns {number|null}
 */
export function rendimientoBase(nombre) {
  const { cantidad } = splitYield(nombre);
  if (!cantidad) return null;
  const parsed = parseFloat(cantidad.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Rendimiento ya escalado, listo para mostrarse: "6 und".
 *
 * Vive aqui y no en una vista porque es una REGLA, no una decoracion. Estaba
 * escrita dentro de `views/detail.js`, asi que la pantalla la aplicaba y la
 * hoja impresa no: con la tanda al triple, la pantalla decia "Rinde 6 und" y el
 * papel que se lleva al obrador seguia diciendo "Rinde 2 und" con las
 * cantidades ya multiplicadas debajo. Exactamente lo que prohibe la regla 8:
 * enseñar una cifra y calcular otra.
 *
 * @param {string} nombre nombre ORIGINAL de la receta, sin escalar
 * @param {number} factor
 * @returns {string} cadena vacia si la receta no declara rendimiento
 */
export function rendimientoEscalado(nombre, factor) {
  const { cantidad, unidad } = splitYield(nombre);
  if (!cantidad) return '';

  const base = rendimientoBase(nombre);
  if (factor === FACTOR_ORIGINAL || base === null) {
    return `${cantidad}${unidad ? ' ' + unidad : ''}`.toLowerCase();
  }

  return `${formatMedida(base * factor)}${unidad ? ' ' + unidad : ''}`.toLowerCase();
}

/**
 * Devuelve una COPIA de la receta con las cantidades multiplicadas.
 *
 * La receta recibida no se modifica en ningun caso. Con factor 1 se devuelve
 * tal cual, sin copiar, porque es el caso mas frecuente con diferencia.
 *
 * @param {object} recipe receta original
 * @param {number} factor multiplicador ya normalizado
 * @returns {object} receta escalada, lista para pintar
 */
export function escalarReceta(recipe, factor) {
  const f = normalizarFactor(factor);
  if (f === FACTOR_ORIGINAL) return recipe;

  return {
    ...recipe,
    componentes: recipe.componentes.map((component) => ({
      ...component,
      items: component.items.map((item) => {
        if (!esEscalable(item.unidad)) return item;

        const cantidad = typeof item.cantidad === 'number'
          ? item.cantidad
          : parseFloat(String(item.cantidad).replace(',', '.'));

        // Una cantidad que no es un numero se deja intacta: multiplicar texto
        // daria un resultado sin sentido. Hoy no ocurre en ninguna de las 1282
        // lineas, pero una receta nueva podria traerlo.
        if (!Number.isFinite(cantidad)) return item;

        return { ...item, cantidad: cantidad * f };
      }),
    })),
  };
}

/**
 * Indica si una receta tiene alguna linea que no se escalara.
 *
 * La interfaz lo usa para avisar de que quedan medidas sin multiplicar, en vez
 * de dejar que alguien lo descubra delante del horno.
 *
 * @param {object} recipe
 * @returns {boolean}
 */
export function tieneMedidasFijas(recipe) {
  return recipe.componentes.some((component) =>
    component.items.some((item) => !esEscalable(item.unidad)),
  );
}
