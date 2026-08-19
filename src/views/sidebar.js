/**
 * =============================================================================
 *  LISTA LATERAL DE RECETAS
 * =============================================================================
 *
 *  Dos partes, de arriba abajo:
 *
 *      FILTROS    una rejilla con las tres categorias mas "todas", cada una
 *                 con su punto de color y su recuento
 *      LISTADO    las recetas que pasan el filtro y la busqueda, agrupadas por
 *                 la letra inicial
 *
 *  La lista queda siempre visible en pantallas anchas, asi que saltar de una
 *  receta a otra es un clic y nunca hay que volver atras. En celular y tableta
 *  no caben la lista y la ficha a la vez: `main.js` decide cual de las dos se
 *  ve (ver `data-view` en responsive.css).
 */

import { el, svg } from '../lib/dom.js';
import { titleCase, splitName, indexLetter } from '../lib/format.js';
import { filterRecipes, sortRecipes, availableCategories, categoryCounts } from '../core/search.js';
import { navigate, buildHash, getRoute } from '../core/router.js';

/** Espera tras la ultima tecla antes de aplicar la busqueda. */
const SEARCH_DEBOUNCE_MS = 160;

/** Id del campo de busqueda, para que el atajo de teclado pueda enfocarlo. */
export const SEARCH_ID = 'search-recipes';

/**
 * @param {{recipes: Array, query: string, category: string, selectedId: string|null, focusSearch: boolean, searchCaret?: number|null}} params
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
    renderSearch(params.query, params.focusSearch, params.searchCaret),
    el('p', {
      class: 'sidebar__count',
      attrs: { role: 'status' },
      text: `${matches.length} ${word}`,
    }),
    matches.length === 0 ? renderEmpty(params.query) : renderList(matches, params.selectedId),
  ]);
}

/**
 * Buscador del listado.
 *
 * Se aplica con un pequeno retardo tras la ultima tecla, para no rehacer el
 * listado con cada pulsacion. Si mientras corre ese retardo se abre una
 * receta, la busqueda ya no se aplica: arrastraria a la persona de vuelta al
 * indice justo despues de haber elegido algo.
 *
 * @param {string} query texto actual
 * @param {boolean} focusSearch si hay que devolver el cursor tras repintar
 * @param {number|null} [caret] por donde iba el cursor antes de repintar
 * @returns {HTMLElement}
 */
function renderSearch(query, focusSearch, caret) {
  let debounce = null;

  const field = el('input', {
    type: 'search',
    id: SEARCH_ID,
    class: 'search__field',
    value: query,
    placeholder: 'Buscar receta…',
    autocomplete: 'off',
    on: {
      input: (event) => {
        const value = event.target.value;
        const routeAtTyping = getRoute();
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const now = getRoute();
          if (now.name !== routeAtTyping.name || now.id !== routeAtTyping.id) return;
          navigate({ name: 'index', id: null, query: value }, { replace: true });
        }, SEARCH_DEBOUNCE_MS);
      },
    },
  });

  // Cada render reconstruye el listado entero, asi que hay que devolver el
  // cursor a quien estuviera escribiendo: un evento ajeno, como perder la
  // conexion, no debe sacarle el foco a media palabra.
  if (focusSearch) {
    window.requestAnimationFrame(() => {
      if (!field.isConnected) return;

      // Si alguien ya esta escribiendo en este campo, no se toca NADA. El
      // cuadro llega despues de montar el campo, y para entonces puede haber
      // texto seleccionado a punto de sustituirse; moverle el cursor ahi
      // convierte lo escrito en un anadido al final. Sin esta salida, escribir
      // una busqueda nueva encima de la anterior daba "briocheR005".
      if (document.activeElement === field) return;

      field.focus();
      // Se vuelve por donde se iba, no al final: quien esta corrigiendo una
      // letra en mitad de una palabra pierde el sitio igual que si se le
      // hubiera ido el foco.
      const end = field.value.length;
      const pos = typeof caret === 'number' ? Math.min(caret, end) : end;
      field.setSelectionRange(pos, pos);
    });
  }

  return el('div', { class: 'sidebar__search search' }, [
    el('label', { class: 'sr-only', for: SEARCH_ID, text: 'Buscar receta' }),
    svg('svg', { class: 'search__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
      svg('circle', { cx: 11, cy: 11, r: 7 }),
      svg('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
    ]),
    field,
    query
      ? el('button', {
          type: 'button',
          class: 'search__clear',
          text: '×',
          attrs: { 'aria-label': 'Borrar la búsqueda' },
          on: { click: () => navigate({ name: 'index', id: null, query: '' }, { replace: true }) },
        })
      : // La tecla de atajo se anuncia solo cuando el campo esta vacio, para no
        // taparla con el boton de borrar.
        el('kbd', { class: 'search__key', text: '/', attrs: { 'aria-hidden': 'true' } }),
  ]);
}

/**
 * Un segmento del filtro de categoria: punto de color, nombre y conteo.
 *
 * Los tres van siempre, incluido TODAS, que lleva el punto en color de marca:
 * si a uno le faltara el punto, su nombre arrancaria desplazado respecto a los
 * demas y la columna dejaria de leerse recta.
 *
 * El nombre se muestra tal cual viene en los datos, en MAYUSCULAS, igual que
 * la etiqueta de categoria de la ficha de receta.
 *
 * El nombre accesible se declara entero en `aria-label` y los tres hijos se
 * ocultan con `aria-hidden`, para que el lector de pantalla diga "pastelería
 * (66 recetas)" en vez de encadenar los trozos sueltos y repetir la cifra. Ese
 * texto va en minusculas a proposito: algunos lectores de pantalla deletrean
 * letra por letra lo que esta todo en mayusculas.
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
    el('span', { class: 'chip__label', attrs: { 'aria-hidden': 'true' }, text: name }),
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

/**
 * Una fila del listado.
 *
 * El enlace se construye con `buildHash` sobre la ruta actual, NO a mano. Es
 * importante: escrito a mano quedaba `#/receta/R123` pelado, sin los
 * parametros, asi que al abrir una receta se perdian el filtro de categoria y
 * la busqueda y el listado volvia a mostrarlas todas. Pasando por `buildHash`,
 * la direccion conserva `?cat=` y `?q=`.
 *
 * El codigo va tambien en `data-id`: quien necesite leerlo (las flechas del
 * teclado, en main.js) lo toma de ahi en vez de recortar la direccion, que
 * ahora lleva parametros detras.
 *
 * @param {object} recipe
 * @param {string|null} selectedId receta abierta ahora mismo
 * @returns {HTMLElement}
 */
function renderLink(recipe, selectedId) {
  const { base, rinde } = splitName(recipe.nombre);
  const isActive = recipe.id === selectedId;

  return el(
    'a',
    {
      class: 'recipe-link' + (isActive ? ' is-active' : ''),
      href: buildHash({ ...getRoute(), name: 'detail', id: recipe.id }),
      attrs: {
        'aria-current': isActive ? 'true' : null,
        'data-category': recipe.categoria,
        'data-id': recipe.id,
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
