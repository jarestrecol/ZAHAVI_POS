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
 * Aviso permanente de que este equipo tiene cambios que las demas sedes no ven.
 * Sin esto, alguien edita en la panaderia, nadie lo ve en la casa de produccion
 * y los dos recetarios se separan sin que nadie lo note.
 *
 * @param {{dirty: boolean, total: number, conflict: boolean}} changes
 * @param {() => void} onOpenSettings
 * @returns {HTMLElement|null}
 */
export function renderPendingBadge(changes, onOpenSettings) {
  if (window.location.protocol === 'file:') {
    return el('p', {
      class: 'context-badge no-print',
      text: 'Modo archivo local: estas recetas no son las mismas que las del sitio web.',
    });
  }
  if (!changes.dirty) return null;

  const cuenta = changes.total === 1 ? '1 cambio' : `${changes.total} cambios`;

  return el('p', { class: 'context-badge no-print' }, [
    `${cuenta} sin publicar en este equipo. Las demás sedes todavía no los ven. `,
    el('button', {
      type: 'button',
      class: 'context-badge__action',
      text: 'Publicar',
      on: { click: onOpenSettings },
    }),
  ]);
}

