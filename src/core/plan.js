/**
 * =============================================================================
 *  PLAN DE PRODUCCION
 * =============================================================================
 *
 *  Junta varias recetas en una sola lista consolidada: lo que hay que pesar y
 *  lo que hay que comprar para la jornada entera, con cada ingrediente sumado
 *  una sola vez aunque aparezca en cinco recetas distintas.
 *
 *  Es el paso que faltaba entre "consultar una receta" y "planear el dia". Sin
 *  esto, quien organiza la produccion abre las recetas de una en una y suma la
 *  harina a mano.
 *
 *  LA REGLA QUE NO SE PUEDE ROMPER
 *  -------------------------------
 *  NUNCA se suman cantidades de unidades distintas. 500 GR de harina y 2 UND de
 *  huevo no son 502 de nada. Cuando un mismo ingrediente aparece con dos
 *  unidades, se listan por separado y se marca para que se vea.
 *
 *  Esto no es un detalle teorico: en el catalogo real la leche aparece en ML y,
 *  en una receta, en MG. Sumarlas daria una cifra sin sentido.
 *
 *  NO TOCA LOS DATOS
 *  -----------------
 *  Igual que el escalado, es una transformacion de lectura. El plan vive en la
 *  pantalla mientras se usa y no se guarda en ningun sitio.
 */

import { normalize } from '../lib/format.js';
import { escalarReceta, normalizarFactor } from './scale.js';

/**
 * Consolida las recetas elegidas en una sola lista de ingredientes.
 *
 * @param {Array<{recipe: object, factor: number}>} seleccion recetas y cuanto
 *   se produce de cada una
 * @returns {{lineas: Array, recetas: Array, totalLineas: number, conflictos: number}}
 */
export function consolidar(seleccion) {
  /** @type {Map<string, {ingrediente: string, unidad: string, cantidad: number, recetas: Set<string>}>} */
  const acumulado = new Map();

  for (const entrada of seleccion) {
    const factor = normalizarFactor(entrada.factor);
    const receta = escalarReceta(entrada.recipe, factor);

    for (const componente of receta.componentes) {
      for (const item of componente.items) {
        const nombre = String(item.ingrediente || '').trim();
        if (!nombre) continue;

        const unidad = String(item.unidad || '').trim().toUpperCase();
        const cantidad = numero(item.cantidad);
        if (!Number.isFinite(cantidad)) continue;

        // La clave incluye la unidad a proposito: es lo que impide sumar
        // gramos con unidades. Dos entradas distintas para el mismo
        // ingrediente en dos unidades es el resultado correcto, no un fallo.
        const clave = normalize(nombre) + '|' + unidad;

        if (!acumulado.has(clave)) {
          acumulado.set(clave, {
            ingrediente: nombre,
            unidad,
            cantidad: 0,
            recetas: new Set(),
          });
        }

        const linea = acumulado.get(clave);
        linea.cantidad += cantidad;
        linea.recetas.add(entrada.recipe.nombre);
      }
    }
  }

  const lineas = [...acumulado.values()]
    .map((linea) => ({ ...linea, recetas: [...linea.recetas] }))
    .sort((a, b) => a.ingrediente.localeCompare(b.ingrediente, 'es'));

  return {
    lineas,
    recetas: seleccion.map((s) => ({
      id: s.recipe.id,
      nombre: s.recipe.nombre,
      factor: normalizarFactor(s.factor),
    })),
    totalLineas: lineas.length,
    conflictos: contarIngredientesConVariasUnidades(lineas),
  };
}

/**
 * Cuenta los ingredientes que aparecen con mas de una unidad.
 *
 * No es un error del plan: es informacion que hay que dar. Puede ser legitimo
 * (agua en GR en una masa y en ML en un almibar) o senal de un dato mal puesto.
 * El plan los lista por separado en cualquier caso y deja la lectura a quien
 * sabe de esto.
 *
 * @param {Array} lineas
 * @returns {number}
 */
function contarIngredientesConVariasUnidades(lineas) {
  const porIngrediente = new Map();
  for (const linea of lineas) {
    const clave = normalize(linea.ingrediente);
    porIngrediente.set(clave, (porIngrediente.get(clave) || 0) + 1);
  }
  return [...porIngrediente.values()].filter((n) => n > 1).length;
}

/**
 * Indica si un ingrediente aparece en el plan con mas de una unidad.
 *
 * @param {Array} lineas
 * @param {string} ingrediente
 * @returns {boolean}
 */
export function tieneVariasUnidades(lineas, ingrediente) {
  const clave = normalize(ingrediente);
  return lineas.filter((l) => normalize(l.ingrediente) === clave).length > 1;
}

function numero(value) {
  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(',', '.'));
}
