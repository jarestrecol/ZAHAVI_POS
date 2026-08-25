/**
 * Busqueda, filtrado y armado del indice.
 *
 * Funciones puras: no tocan el DOM ni el almacenamiento, asi que se pueden
 * comprobar de forma aislada.
 */

import { normalize, byName } from '../lib/format.js';
import { CATEGORIES, ALL_CATEGORIES } from './schema.js';

/**
 * Filtra por categoria y por texto. La busqueda ignora acentos y mayusculas.
 *
 * Mira el NOMBRE y el CODIGO de la receta, no sus ingredientes. Buscar dentro
 * de los ingredientes existio y se retiro a peticion del negocio: escribir
 * "leche" devolvia decenas de recetas que solo la llevaban como un renglon
 * mas, y eso enterraba la que se estaba buscando por su nombre. Si algun dia
 * hace falta encontrar recetas por lo que llevan (por ejemplo, para saber que
 * se ve afectado al cambiar un proveedor), conviene que sea una busqueda
 * aparte y no mezclada con esta.
 *
 * @param {Array} recipes
 * @param {{query: string, category: string}} criteria
 * @returns {Array}
 */
export function filterRecipes(recipes, criteria) {
  const category = criteria.category || ALL_CATEGORIES;
  const needle = normalize(criteria.query || '').trim();

  return recipes.filter((recipe) => {
    if (category !== ALL_CATEGORIES && recipe.categoria !== category) return false;
    if (needle === '') return true;
    if (normalize(recipe.nombre).includes(needle)) return true;
    return normalize(recipe.id).includes(needle);
  });
}

/**
 * Ordena alfabeticamente sin mutar el array recibido.
 *
 * @param {Array} recipes
 * @returns {Array}
 */
export function sortRecipes(recipes) {
  return [...recipes].sort(byName);
}

/**
 * Categorias presentes en los datos, con TODAS al frente. Se preserva el orden
 * canonico y se anaden al final las que aparezcan en recetas importadas.
 *
 * @param {Array} recipes
 * @returns {Array<string>}
 */
export function availableCategories(recipes) {
  const canonical = CATEGORIES;
  const present = new Set(recipes.map((recipe) => recipe.categoria).filter(Boolean));
  const ordered = canonical.filter((category) => present.has(category));
  const extra = [...present].filter((category) => !canonical.includes(category)).sort();
  return [ALL_CATEGORIES, ...ordered, ...extra];
}

/**
 * Cuenta cuantos ingredientes tiene una receta, contando todos sus componentes.
 *
 * @param {object} recipe
 * @returns {number}
 */
export function countItems(recipe) {
  return recipe.componentes.reduce((total, component) => total + component.items.length, 0);
}

/**
 * Cuenta cuantas recetas hay por categoria. TODAS es el total.
 *
 * @param {Array} recipes
 * @returns {Record<string, number>}
 */
export function categoryCounts(recipes) {
  const counts = { [ALL_CATEGORIES]: recipes.length };
  for (const recipe of recipes) {
    if (!recipe.categoria) continue;
    counts[recipe.categoria] = (counts[recipe.categoria] || 0) + 1;
  }
  return counts;
}
