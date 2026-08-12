/**
 * =============================================================================
 *  ESQUELETO DE CARGA
 * =============================================================================
 *
 *  Lo que se ve durante el instante en que se leen las recetas.
 *
 *  En lugar de una frase suelta en mitad de la pantalla, se dibuja la silueta de
 *  la aplicacion: la barra oscura arriba, el listado a la izquierda y el panel a
 *  la derecha. Asi la pantalla no da un salto cuando llegan los datos, porque la
 *  estructura ya estaba puesta en el mismo sitio.
 */

import { el } from '../lib/dom.js';

/** Cuantas lineas grises se dibujan simulando el listado. */
const PLACEHOLDER_ROWS = 9;

/**
 * @returns {HTMLElement}
 */
export function renderSkeleton() {
  const rows = [];
  for (let i = 0; i < PLACEHOLDER_ROWS; i += 1) {
    rows.push(el('div', { class: 'booting__line' }));
  }

  return el(
    'div',
    {
      class: 'booting',
      // `aria-busy` avisa a los lectores de pantalla de que esto es un estado
      // transitorio y no contenido real.
      attrs: { 'aria-busy': 'true', 'aria-label': 'Cargando recetario' },
    },
    [
      // Barra superior.
      el('div', { class: 'booting__bar' }),

      el('div', { class: 'booting__body' }, [
        // Listado de la izquierda.
        el('div', { class: 'booting__side' }, rows),

        // Panel de la derecha: un titulo ancho y dos lineas de texto.
        el('div', { class: 'booting__main' }, [
          el('div', { class: 'booting__line booting__line--title' }),
          el('div', { class: 'booting__line' }),
          el('div', { class: 'booting__line' }),
        ]),
      ]),
    ],
  );
}
