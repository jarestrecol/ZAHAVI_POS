/**
 * Barra superior: marca, buscador y acciones.
 */

import { el, svg } from '../lib/dom.js';
import { navigate, getRoute } from '../core/router.js';

/** Espera tras la ultima tecla antes de aplicar la busqueda. */
const SEARCH_DEBOUNCE_MS = 160;

/** Id del campo de busqueda, para que el atajo de teclado pueda enfocarlo. */
export const SEARCH_ID = 'search-recipes';

/**
 * @param {Object} options
 * @param {string} options.query
 * @param {boolean} options.canEdit
 * @param {() => void} options.onNewRecipe
 * @param {() => void} options.onSettings
 * @returns {HTMLElement}
 */
export function renderHeader(options) {
  let debounce = null;

  const search = el('input', {
    type: 'search',
    id: SEARCH_ID,
    class: 'search__field',
    value: options.query,
    placeholder: 'Buscar receta o ingrediente…',
    autocomplete: 'off',
    on: {
      input: (event) => {
        const value = event.target.value;
        const routeAtTyping = getRoute();
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          // Si mientras corria el temporizador se abrio una receta, no hay que
          // arrastrar al usuario de vuelta al indice.
          const now = getRoute();
          if (now.name !== routeAtTyping.name || now.id !== routeAtTyping.id) return;
          navigate({ name: 'index', id: null, query: value }, { replace: true });
        }, SEARCH_DEBOUNCE_MS);
      },
    },
  });

  // El render reconstruye la barra entera, asi que hay que devolver el cursor
  // al buscador si estaba escribiendo: un evento ajeno (perder la conexion, por
  // ejemplo) no debe sacarle el foco a media palabra.
  if (options.focusSearch) {
    window.requestAnimationFrame(() => {
      if (!search.isConnected) return;
      search.focus();
      const end = search.value.length;
      search.setSelectionRange(end, end);
    });
  }

  return el('header', { class: 'topbar no-print' }, [
    // La marca en la barra va en tipografia, no como imagen: el logo completo
    // es un bloque naranja con su propio fondo, y sobre la barra oscura quedaba
    // como un recorte pegado encima. El logo entero se reserva para la entrada y
    // la bienvenida, donde si funciona como pieza de marca.
    el('a', { class: 'topbar__brand', href: '#/', attrs: { 'aria-label': 'Zahavi, recetario' } }, [
      el('span', { class: 'topbar__wordmark', text: 'ZAHAVI' }),
      el('span', { class: 'topbar__dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'topbar__sub', text: 'recetario' }),
    ]),

    el('div', { class: 'search' }, [
      el('label', { class: 'sr-only', for: SEARCH_ID, text: 'Buscar receta o ingrediente' }),
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
            on: { click: () => navigate({ name: 'index', id: null, query: '' }, { replace: true }) },
          })
        : // La tecla de atajo se anuncia solo cuando el campo esta vacio, para no
          // taparla con el boton de borrar.
          el('kbd', { class: 'search__key', text: '/', attrs: { 'aria-hidden': 'true' } }),
    ]),

    el('div', { class: 'topbar__actions' }, [
      options.canEdit
        ? el('button', {
            type: 'button',
            class: 'btn btn--accent',
            text: 'Nueva receta',
            on: { click: options.onNewRecipe },
          })
        : null,
      el('button', {
        type: 'button',
        class: 'btn btn--dark-ghost',
        text: 'Ajustes',
        on: { click: options.onSettings },
      }),
    ]),
  ]);
}

/**
 * Avisos de contexto: cambios sin publicar y falta de conexion.
 *
 * @param {{changes: {dirty: boolean, total: number}, online: boolean, onOpenSettings: () => void}} options
 * @returns {Array<HTMLElement>}
 */
export function renderBadges(options) {
  const badges = [];

  if (!options.online) {
    badges.push(
      el('p', {
        class: 'context-badge context-badge--offline no-print',
        attrs: { role: 'status' },
        text: 'Sin conexión. Puedes seguir consultando y editando: los cambios se guardan en este equipo.',
      }),
    );
  }

  if (options.changes.dirty) {
    const cuenta = options.changes.total === 1 ? '1 cambio' : `${options.changes.total} cambios`;
    badges.push(
      el('p', { class: 'context-badge no-print' }, [
        `${cuenta} sin publicar en este equipo. `,
        el('button', {
          type: 'button',
          class: 'context-badge__action',
          text: 'Publicar',
          on: { click: options.onOpenSettings },
        }),
      ]),
    );
  }

  return badges;
}
