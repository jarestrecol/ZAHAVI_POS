/**
 * Barra superior: marca y acciones.
 *
 * El buscador ya no vive aqui: se movio al listado, justo debajo de los
 * filtros de categoria (ver `views/sidebar.js`). Buscar y filtrar son la misma
 * tarea, acotar el listado, asi que sus dos controles van juntos y encima de
 * lo que afectan, en vez de repartidos en dos zonas distintas de la pantalla.
 */

import { el, svg, replaceChildren } from '../lib/dom.js';
import { effectiveTheme, toggleTheme } from '../core/theme.js';

/**
 * @param {Object} options
 * @param {boolean} options.canEdit
 * @param {() => void} options.onNewRecipe
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
      renderThemeToggle(),
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
 * Interruptor de tema claro/oscuro.
 *
 * No pasa por el estado de la aplicacion ni provoca un repintado completo:
 * es un ajuste de este dispositivo, no un dato del recetario, asi que se
 * resuelve aqui mismo cambiando su propio icono. El resto de la pantalla se
 * actualiza solo, porque todo su color sale de variables CSS.
 *
 * @returns {HTMLElement}
 */
function renderThemeToggle() {
  const button = el('button', {
    type: 'button',
    class: 'btn-icon theme-toggle',
    attrs: { 'aria-label': themeToggleLabel(), 'aria-pressed': String(effectiveTheme() === 'dark') },
    on: {
      click: () => {
        toggleTheme();
        button.setAttribute('aria-label', themeToggleLabel());
        button.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
        replaceChildren(button, [themeIcon()]);
      },
    },
  });
  replaceChildren(button, [themeIcon()]);
  return button;
}

function themeToggleLabel() {
  return effectiveTheme() === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
}

/** Sol en tema oscuro (invita a volver a claro), luna en tema claro. */
function themeIcon() {
  return effectiveTheme() === 'dark' ? sunIcon() : moonIcon();
}

function sunIcon() {
  return svg('svg', { class: 'theme-toggle__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('circle', { cx: 12, cy: 12, r: 4.2 }),
    svg('line', { x1: 12, y1: 2.4, x2: 12, y2: 5 }),
    svg('line', { x1: 12, y1: 19, x2: 12, y2: 21.6 }),
    svg('line', { x1: 4.2, y1: 12, x2: 1.6, y2: 12 }),
    svg('line', { x1: 22.4, y1: 12, x2: 19.8, y2: 12 }),
    svg('line', { x1: 6.3, y1: 6.3, x2: 4.5, y2: 4.5 }),
    svg('line', { x1: 19.5, y1: 19.5, x2: 17.7, y2: 17.7 }),
    svg('line', { x1: 6.3, y1: 17.7, x2: 4.5, y2: 19.5 }),
    svg('line', { x1: 19.5, y1: 4.5, x2: 17.7, y2: 6.3 }),
  ]);
}

function moonIcon() {
  return svg('svg', { class: 'theme-toggle__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svg('path', { d: 'M20.4 15.3A8.6 8.6 0 118.7 3.6a7 7 0 0011.7 11.7z' }),
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
