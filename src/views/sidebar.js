/**
 * Lista lateral de recetas: filtros de categoria y listado completo.
 *
 * Sustituye al indice a doble pagina del libro. La lista queda siempre visible,
 * asi que saltar de una receta a otra es un clic y no hay que volver atras.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName, indexLetter } from '../lib/format.js';
import { filterRecipes, sortRecipes, availableCategories, categoryCounts } from '../core/search.js';
import { navigate } from '../core/router.js';

/**
 * @param {{recipes: Array, query: string, category: string, selectedId: string|null}} params
 * @returns {HTMLElement}
 */
export function renderSidebar(params) {
  const matches = sortRecipes(filterRecipes(params.recipes, params));
  const categories = availableCategories(params.recipes);
  const counts = categoryCounts(params.recipes);
  const word = matches.length === 1 ? 'receta' : 'recetas';

  return el('nav', { class: 'sidebar', attrs: { 'aria-label': 'Listado de recetas' } }, [
    el(
      'div',
      { class: 'sidebar__filters', attrs: { role: 'group', 'aria-label': 'Filtrar por categoría' } },
      categories.map((name) => renderCategoryChip(name, counts[name] || 0, params.category)),
    ),
    el('p', {
      class: 'sidebar__count',
      attrs: { role: 'status' },
      text: `${matches.length} ${word}`,
    }),
    matches.length === 0 ? renderEmpty(params.query) : renderList(matches, params.selectedId),
  ]);
}

/**
 * Un segmento del filtro de categoria: punto de color, nombre y conteo.
 *
 * Los tres van siempre, incluido TODAS, que lleva el punto en color de marca:
 * si a uno le faltara el punto, su nombre arrancaria desplazado respecto a los
 * demas y la columna dejaria de leerse recta.
 *
 * El nombre accesible se declara entero en `aria-label` y los tres hijos se
 * ocultan con `aria-hidden`, para que el lector de pantalla diga "pastelería
 * (66 recetas)" en vez de encadenar los trozos sueltos y repetir la cifra.
 *
 * @param {string} name nombre de la categoria, o TODAS
 * @param {number} count cuantas recetas tiene
 * @param {string} activeCategory categoria filtrada ahora mismo
 * @returns {HTMLElement}
 */
function renderCategoryChip(name, count, activeCategory) {
  const word = count === 1 ? 'receta' : 'recetas';

  return el('button', {
    type: 'button',
    class: 'chip',
    attrs: {
      'aria-pressed': String(name === activeCategory),
      'data-category': name,
      'aria-label': `${name.toLowerCase()} (${count} ${word})`,
    },
    on: { click: () => navigate({ name: 'index', id: null, category: name }) },
  }, [
    el('span', { class: 'chip__dot', attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'chip__label', attrs: { 'aria-hidden': 'true' }, text: name.toLowerCase() }),
    el('span', { class: 'chip__count', attrs: { 'aria-hidden': 'true' }, text: String(count) }),
  ]);
}

function renderEmpty(query) {
  return el('div', { class: 'sidebar__empty' }, [
    el('p', {
      text: query
        ? `Ninguna receta coincide con “${query}”.`
        : 'Todavía no hay recetas. Crea la primera con "Nueva receta".',
    }),
    // El boton de borrar del buscador puede quedar fuera de vista en tablet con
    // la lista desplazada, asi que la salida tambien esta aqui.
    query
      ? el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Borrar búsqueda',
          on: { click: () => navigate({ name: 'index', id: null, query: '' }, { replace: true }) },
        })
      : null,
  ]);
}

function renderList(recipes, selectedId) {
  const items = [];
  let lastLetter = null;

  for (const recipe of recipes) {
    const letter = indexLetter(recipe.nombre);
    if (letter !== lastLetter) {
      items.push(el('li', { class: 'sidebar__letter', attrs: { 'aria-hidden': 'true' } }, [letter]));
      lastLetter = letter;
    }
    items.push(el('li', null, [renderLink(recipe, selectedId)]));
  }

  return el('ul', { class: 'sidebar__list' }, items);
}

function renderLink(recipe, selectedId) {
  const { base, rinde } = splitName(recipe.nombre);
  const isActive = recipe.id === selectedId;

  return el(
    'a',
    {
      class: 'recipe-link' + (isActive ? ' is-active' : ''),
      href: '#/receta/' + encodeURIComponent(recipe.id),
      attrs: {
        'aria-current': isActive ? 'true' : null,
        'data-category': recipe.categoria,
        title: recipe.nombre,
      },
    },
    [
      // Punto de categoria en todas las filas, no solo en la activa: da lectura
      // instantanea de que es cada cosa y rompe la monotonia de 121 filas iguales.
      el('span', { class: 'recipe-link__dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'recipe-link__name', text: titleCase(base) }),
      rinde ? el('span', { class: 'recipe-link__yield', text: '×' + rinde.toLowerCase() }) : null,
    ],
  );
}
