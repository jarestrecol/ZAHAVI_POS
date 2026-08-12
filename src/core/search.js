/**
 * Busqueda, filtrado y armado del indice.
 *
 * Funciones puras: no tocan el DOM ni el almacenamiento, asi que se pueden
 * comprobar de forma aislada.
 */

import { normalize, byName } from '../lib/format.js';
import { ALL_CATEGORIES } from './router.js';

/**
 * Filtra por categoria y por texto. La busqueda ignora acentos y mayusculas, y
 * mira nombre, codigo e ingredientes.
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
    if (normalize(recipe.id).includes(needle)) return true;
    return recipe.componentes.some((component) =>
      component.items.some((item) => normalize(item.ingrediente).includes(needle)),
    );
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
  const canonical = ['PASTELERÍA', 'PANADERÍA', 'GALLETAS'];
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
