/**
 * =============================================================================
 *  AJUSTES · ESTADO DEL RECETARIO
 * =============================================================================
 *
 *  Cuantas recetas hay y cuantas tienen el metodo escrito. Nada mas: el
 *  recetario vive en el servidor (0024), asi que ya no hay cambios sin
 *  publicar, ni publicacion, ni descartes que mostrar aqui. Cada cambio queda
 *  como version en el servidor, con quien lo hizo.
 */

import { el } from '../../lib/dom.js';

/**
 * @param {{recipeCount: number, withMethod: number}} options
 * @returns {HTMLElement}
 */
export function renderStatusBlock(options) {
  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Estado del recetario' }),
    el('p', { class: 'settings__count' }, [
      el('strong', { text: String(options.recipeCount) }),
      options.recipeCount === 1 ? ' receta' : ' recetas',
      options.withMethod > 0
        ? `, ${options.withMethod} con el método escrito.`
        : '. Ninguna tiene el método escrito todavía.',
    ]),
    el('p', {
      class: 'settings__help',
      text: 'El recetario está guardado en el servidor: lo que se cambia lo ven todas las sedes al momento, y cada cambio queda como versión con quien lo hizo.',
    }),
  ]);
}
