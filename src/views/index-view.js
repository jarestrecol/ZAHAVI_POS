/**
 * Indice general: todas las recetas como tabla de contenidos del libro.
 *
 * La version anterior calculaba en JavaScript el numero de columnas, la altura de
 * fila y el tamano de letra, midiendo el DOM despues de pintar y volviendo a
 * renderizar si no cuadraba. Aqui el reparto lo hace CSS con `columns` y
 * `clamp()`, sin medir nada: una sola pasada de pintado y sin oscilaciones.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName } from '../lib/format.js';
import { buildIndexCells, availableCategories, filterRecipes, sortRecipes } from '../core/search.js';
import { navigate, ALL_CATEGORIES } from '../core/router.js';

/** Abreviatura de categoria mostrada al final de cada linea. */
const CATEGORY_ABBR = 3;

/**
 * Filas que caben holgadamente en una columna a pantalla completa. Sirve para
 * elegir cuantas columnas usar sin medir el DOM: con pocas recetas conviene
 * repartirlas en columnas anchas donde el nombre entero quepa, y no en muchas
 * columnas estrechas que lo cortarian.
 */
const ROWS_PER_COLUMN = 26;

/** Reparto minimo y maximo. El pliego queda simetrico con un numero par. */
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 8;

/**
 * Numero de columnas para una cantidad de celdas dada, redondeado al par
 * superior. CSS reduce ese numero por su cuenta si la pantalla es estrecha.
 *
 * @param {number} cellCount
 * @returns {number}
 */
function columnCount(cellCount) {
  const needed = Math.ceil(cellCount / ROWS_PER_COLUMN);
  const bounded = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, needed));
  return bounded % 2 === 0 ? bounded : bounded + 1;
}

/**
 * @param {{recipes: Array, query: string, category: string, selectedId: string|null}} params
 * @returns {HTMLElement}
 */
export function renderIndex(params) {
  const matches = sortRecipes(filterRecipes(params.recipes, params));
  const categories = availableCategories(params.recipes);

  return el('section', { class: 'page page--index', attrs: { 'aria-labelledby': 'index-heading' } }, [
    renderRunningHead(matches.length, params.category, categories),
    matches.length === 0 ? renderEmpty(params.query) : renderColumns(matches, params.selectedId),
  ]);
}

function renderRunningHead(count, category, categories) {
  const scope = category !== ALL_CATEGORIES ? ' · ' + category.toLowerCase() : '';
  const recipeWord = count === 1 ? 'receta' : 'recetas';

  return el('div', { class: 'running-head' }, [
    el('div', { class: 'running-head__title' }, [
      el('h2', { class: 'display', id: 'index-heading', text: 'Índice general' }),
      el('p', { class: 'running-head__count', text: `${count} ${recipeWord}${scope}` }),
    ]),
    el(
      'div',
      { class: 'chips no-print', attrs: { role: 'group', 'aria-label': 'Filtrar por categoría' } },
      categories.map((name) =>
        el('button', {
          type: 'button',
          class: 'chip',
          text: name.toLowerCase(),
          attrs: { 'aria-pressed': String(name === category) },
          on: { click: () => navigate({ name: 'index', id: null, category: name }) },
        }),
      ),
    ),
  ]);
}

function renderEmpty(query) {
  const message = query
    ? 'Ninguna receta coincide con la búsqueda.'
    : 'Todavía no hay recetas. Crea la primera o importa un respaldo desde Ajustes.';
  return el('p', { class: 'page__empty', text: message });
}

function renderColumns(recipes, selectedId) {
  const cells = buildIndexCells(recipes);

  return el(
    'ul',
    {
      class: 'index-list index-list--c' + columnCount(cells.length),
      attrs: { 'aria-label': 'Listado de recetas' },
    },
    cells.map((cell) =>
      cell.type === 'letter' ? renderLetter(cell.letter) : renderRow(cell.recipe, selectedId),
    ),
  );
}

function renderLetter(letter) {
  return el('li', { class: 'index-list__letter', attrs: { 'aria-hidden': 'true' } }, [
    el('span', { text: letter }),
    el('span', { class: 'index-list__letter-rule' }),
  ]);
}

function renderRow(recipe, selectedId) {
  const { base, rinde } = splitName(recipe.nombre);
  const isSelected = recipe.id === selectedId;

  return el('li', { class: 'index-list__item' }, [
    el(
      'a',
      {
        class: 'index-row' + (isSelected ? ' is-selected' : ''),
        href: '#/receta/' + encodeURIComponent(recipe.id),
        attrs: {
          'aria-current': isSelected ? 'true' : null,
          'data-category': recipe.categoria,
        },
      },
      [
        el('span', { class: 'index-row__dot', attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'index-row__name', text: titleCase(base) }),
        el('span', { class: 'index-row__leader', attrs: { 'aria-hidden': 'true' } }),
        rinde
          ? el('span', {
              class: 'index-row__yield',
              text: '×' + rinde.replace(/\s+/g, ' ').toLowerCase(),
            })
          : null,
        el('span', {
          class: 'index-row__cat',
          text: (recipe.categoria || '—').slice(0, CATEGORY_ABBR).toLowerCase(),
        }),
      ],
    ),
  ]);
}
