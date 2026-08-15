/**
 * Barra superior: marca y acciones.
 *
 * El buscador ya no vive aqui: se movio al listado, justo debajo de los
 * filtros de categoria (ver `views/sidebar.js`). Buscar y filtrar son la misma
 * tarea, acotar el listado, asi que sus dos controles van juntos y encima de
 * lo que afectan, en vez de repartidos en dos zonas distintas de la pantalla.
 */

import { el } from '../lib/dom.js';

/**
 * @param {Object} options
 * @param {boolean} options.canEdit
 * @param {() => void} options.onNewRecipe
 * @param {() => void} options.onPlan
 * @param {() => void} options.onIngredients
 * @param {() => void} options.onSettings
 * @returns {HTMLElement}
 */
export function renderHeader(options) {
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

    // Empuja las acciones al extremo derecho, ahora que el buscador ya no
    // ocupa el centro de la barra.
    el('span', { class: 'topbar__spacer' }),

    el('div', { class: 'topbar__actions' }, [
      // Planear el dia y validar los ingredientes son tareas de jornada, no
      // de receta: por eso viven en la barra y no dentro de una ficha.
      el('button', {
        type: 'button',
        class: 'btn btn--dark-ghost',
        text: 'Plan del día',
        on: { click: options.onPlan },
      }),

      el('button', {
        type: 'button',
        class: 'btn btn--dark-ghost',
        text: 'Validador',
        on: { click: options.onIngredients },
      }),

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
