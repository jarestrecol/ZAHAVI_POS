/**
 * Cabecera: marca, buscador y acciones.
 */

import { el, svg } from '../lib/dom.js';
import { navigate } from '../core/router.js';

/** Espera tras la ultima tecla antes de aplicar la busqueda. */
const SEARCH_DEBOUNCE_MS = 180;

/**
 * @param {Object} options
 * @param {string} options.query
 * @param {boolean} options.showBack
 * @param {() => void} options.onCloseBook
 * @param {() => void} options.onNewRecipe
 * @param {() => void} options.onSettings
 * @param {() => void} options.onSignOut
 * @returns {HTMLElement}
 */
export function renderHeader(options) {
  let debounce = null;

  const search = el('input', {
    type: 'search',
    id: 'search-recipes',
    class: 'search__field',
    value: options.query,
    placeholder: 'Buscar receta o ingrediente…',
    autocomplete: 'off',
    on: {
      input: (event) => {
        const value = event.target.value;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          navigate({ name: 'index', id: null, query: value }, { replace: true });
        }, SEARCH_DEBOUNCE_MS);
      },
      search: (event) => {
        clearTimeout(debounce);
        navigate({ name: 'index', id: null, query: event.target.value }, { replace: true });
      },
    },
  });

  return el('header', { class: 'topbar no-print' }, [
    el('button', {
      type: 'button',
      class: 'topbar__brand',
      attrs: { 'aria-label': 'Cerrar el libro' },
      on: { click: options.onCloseBook },
      title: 'Cerrar el libro',
    }, [
      el('span', { class: 'topbar__wordmark', text: 'Zahavi' }),
      el('span', { class: 'topbar__sub', text: 'recetario' }),
    ]),

    el('div', { class: 'search' }, [
      el('label', { class: 'sr-only', for: 'search-recipes', text: 'Buscar receta o ingrediente' }),
      svg('svg', { class: 'search__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
        svg('circle', { cx: 11, cy: 11, r: 7 }),
        svg('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
      ]),
      search,
      options.query
        ? el('button', {
            type: 'button',
            class: 'search__clear',
            text: '×',
            attrs: { 'aria-label': 'Borrar la búsqueda' },
            on: {
              click: () => {
                navigate({ name: 'index', id: null, query: '' }, { replace: true });
              },
            },
          })
        : null,
    ]),

    el('div', { class: 'topbar__spacer' }),

    options.showBack
      ? el('button', {
          type: 'button',
          class: 'btn btn--accent',
          text: '← Todas las recetas',
          on: { click: () => navigate({ name: 'index', id: null }) },
        })
      : null,
    el('button', {
      type: 'button',
      class: 'btn btn--dark-ghost btn--emphasis',
      text: '+ Nueva receta',
      on: { click: options.onNewRecipe },
    }),
    el('button', {
      type: 'button',
      class: 'btn btn--dark-ghost',
      text: 'Ajustes',
      on: { click: options.onSettings },
    }),
    el('button', {
      type: 'button',
      class: 'btn btn--dark-ghost btn--quiet',
      text: 'Salir',
      on: { click: options.onSignOut },
    }),
  ]);
}

/**
 * Marca visual del origen de los datos. Abrir el archivo por doble clic y abrir
 * el sitio web usan almacenes distintos del navegador: lo que se edita en uno no
 * aparece en el otro. Decirlo evita que alguien crea que se perdieron recetas.
 *
 * @returns {HTMLElement|null}
 */
export function renderContextBadge() {
  if (window.location.protocol !== 'file:') return null;
  return el('p', {
    class: 'context-badge no-print',
    text: 'Modo archivo local: las recetas de esta ventana no son las mismas que las del sitio web.',
  });
}

