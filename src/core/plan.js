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
 *  Igual que el escalado, es una transformación de lectura. La persistencia
 *  de planes por fecha pertenece a core/bitacora.js y app/produccion.js.
 */

import { normalize } from '../lib/format.js';
import { escalarReceta, normalizarFactor } from './scale.js';

/**
 * Consolida las recetas elegidas en una sola lista de ingredientes.
 *
 * Cada linea guarda ademas de donde sale cada gramo: no solo en que recetas
 * entra el ingrediente, sino cuanto pone cada una. Es lo que permite responder
 * "de los 4.500 GR de harina, cuanto es del pan" sin rehacer la cuenta a mano,
 * y lo que convierte una cifra consolidada en una cifra comprobable.
 *
 * @param {Array<{recipe: object, factor: number}>} seleccion recetas y cuanto
 *   se produce de cada una
 * @returns {{lineas: Array, recetas: Array, totalLineas: number, conflictos: number}}
 */
export function consolidar(seleccion) {
  /** @type {Map<string, {ingrediente: string, unidad: string, cantidad: number, recetas: Map<string, {nombre: string, cantidad: number}>}>} */
  const acumulado = new Map();

  for (const entrada of seleccion) {
    const factor = normalizarFactor(entrada.factor);
    const receta = escalarReceta(entrada.recipe, factor);

    for (const componente of receta.componentes) {
      for (const item of componente.items) {
        const nombre = String(item.ingrediente || '').trim();
        if (!nombre) continue;

        const unidad = String(item.unidad || '').trim().toUpperCase();
        // El recetario mantiene las dimensiones en CM. El papel, en cambio,
        // es un consumible de cada tanda al preparar la lista de materiales.
        const cantidad = numero(item.cantidad) * (unidad === 'CM' && normalize(nombre) === 'PAPEL PARAFINADO' ? factor : 1);
        // Se descarta lo que no es una cantidad que se pueda pesar. El cero no
        // aporta nada a una lista de lo que hay que sacar del almacen, y una
        // cantidad negativa restaria del total sin que nada lo indicara: la
        // lista saldria corta y no habria forma de notarlo mirandola. Hoy no
        // hay ninguna en las 1.282 lineas del catalogo; esto es la red por si
        // entra una al editar.
        if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

        // La clave incluye la unidad a proposito: es lo que impide sumar
        // gramos con unidades. Dos entradas distintas para el mismo
        // ingrediente en dos unidades es el resultado correcto, no un fallo.
        const clave = normalize(nombre) + '|' + unidad;

        if (!acumulado.has(clave)) {
          acumulado.set(clave, {
            ingrediente: nombre,
            unidad,
            cantidad: 0,
            recetas: new Map(),
          });
        }

        const linea = acumulado.get(clave);
        linea.cantidad += cantidad;

        // Una misma receta puede repetir el ingrediente en dos componentes (la
        // harina de la masa y la del espolvoreado). Se suma su aporte, no se
        // pisa: si no, el desglose no cuadraria con el total de la linea.
        //
        // La clave es el ID, no el nombre. Con el nombre, dos recetas distintas
        // que se llamen igual se funden en una sola entrada: el total sigue
        // bien, pero el desglose dice "de 1 receta" y atribuye a una sola lo
        // que ponen dos, que es justo lo que el desglose existe para evitar.
        // Los nombres son unicos hoy solo porque llevan el rendimiento dentro,
        // y el editor no impide repetirlos.
        const yaPuesto = linea.recetas.get(entrada.recipe.id);
        linea.recetas.set(entrada.recipe.id, {
          nombre: entrada.recipe.nombre,
          cantidad: (yaPuesto ? yaPuesto.cantidad : 0) + cantidad,
        });
      }
    }
  }

  const lineas = [...acumulado.values()]
    .map((linea) => ({
      ...linea,
      // De mayor a menor aporte: quien lee el desglose busca primero quien pone
      // el grueso de la cifra, no el orden alfabetico.
      recetas: [...linea.recetas]
        .map(([id, aporte]) => ({ id, nombre: aporte.nombre, cantidad: aporte.cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es')),
    }))
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
 * Nombres de los ingredientes que aparecen con mas de una unidad.
 *
 * No es un error del plan: es informacion que hay que dar. Puede ser legitimo
 * (agua en GR en una masa y en ML en un almibar) o senal de un dato mal puesto.
 * El plan los lista por separado en cualquier caso y deja la lectura a quien
 * sabe de esto.
 *
 * Devuelve los nombres y no solo cuantos son porque el aviso tiene que poder
 * decir CUALES: con cuarenta ingredientes en pantalla, "3 ingredientes aparecen
 * con unidades distintas" obliga a buscarlos a ojo uno por uno.
 *
 * @param {Array} lineas
 * @returns {Array<string>} en el mismo orden alfabetico que las lineas
 */
export function ingredientesConVariasUnidades(lineas) {
  /** @type {Map<string, {nombre: string, lineas: number}>} */
  const porIngrediente = new Map();
  for (const linea of lineas) {
    const clave = normalize(linea.ingrediente);
    const visto = porIngrediente.get(clave);
    if (visto) visto.lineas += 1;
    else porIngrediente.set(clave, { nombre: linea.ingrediente, lineas: 1 });
  }
  return [...porIngrediente.values()].filter((i) => i.lineas > 1).map((i) => i.nombre);
}

/**
 * Cuantos ingredientes aparecen con mas de una unidad.
 *
 * @param {Array} lineas
 * @returns {number}
 */
function contarIngredientesConVariasUnidades(lineas) {
  return ingredientesConVariasUnidades(lineas).length;
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
