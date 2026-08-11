/**
 * Lista lateral de recetas: filtros de categoria y listado completo.
 *
 * Sustituye al indice a doble pagina del libro. La lista queda siempre visible,
 * asi que saltar de una receta a otra es un clic y no hay que volver atras.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName, indexLetter } from '../lib/format.js';
import { filterRecipes, sortRecipes, availableCategories } from '../core/search.js';
import { navigate } from '../core/router.js';

/**
 * @param {{recipes: Array, query: string, category: string, selectedId: string|null}} params
 * @returns {HTMLElement}
 */
export function renderSidebar(params) {
  const matches = sortRecipes(filterRecipes(params.recipes, params));
  const categories = availableCategories(params.recipes);
  const word = matches.length === 1 ? 'receta' : 'recetas';

  return el('nav', { class: 'sidebar', attrs: { 'aria-label': 'Listado de recetas' } }, [
    el(
      'div',
      { class: 'sidebar__filters', attrs: { role: 'group', 'aria-label': 'Filtrar por categoría' } },
      categories.map((name) =>
        el('button', {
          type: 'button',
          class: 'chip',
          text: name.toLowerCase(),
          attrs: { 'aria-pressed': String(name === params.category) },
          on: { click: () => navigate({ name: 'index', id: null, category: name }) },
        }),
      ),
    ),
    el('p', {
      class: 'sidebar__count',
      attrs: { role: 'status' },
      text: `${matches.length} ${word}`,
    }),
    matches.length === 0 ? renderEmpty(params.query) : renderList(matches, params.selectedId),
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
