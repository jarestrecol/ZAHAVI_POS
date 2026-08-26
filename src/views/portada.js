/**
 * =============================================================================
 *  PORTADA DE ARRANQUE
 * =============================================================================
 *
 *  Lo que se ve durante el instante en que se leen las recetas.
 *
 *  Es la continuacion de la pantalla de arranque del sistema, no un esqueleto
 *  de la interfaz: el mismo naranja de marca, y el logotipo completo donde el
 *  sistema dejo el monograma. El porque de que el logotipo NO pueda ir en esa
 *  primera pantalla esta escrito junto a `.portada`, en `assets/css/views.css`.
 *
 *  ESTE MARCADO ESTA ESCRITO DOS VECES, Y ES A PROPOSITO: aqui, porque
 *  `render()` vacia `#app` y lo reconstruye entero; y en `index.html`, para que
 *  la portada se vea en el primer pintado sin esperar a que carguen los
 *  modulos. Si se cambia una copia hay que cambiar la otra, o el arranque dara
 *  un salto justo donde este archivo existe para evitarlo.
 */

import { el } from '../lib/dom.js';

/**
 * Medidas reales del archivo del logotipo. Van declaradas en el marcado para
 * que el renglon de estado no salte cuando la imagen termina de cargar.
 */
const LOGO_ANCHO = 254;
const LOGO_ALTO = 78;

/**
 * @returns {HTMLElement}
 */
export function renderPortada() {
  return el(
    'div',
    {
      class: 'portada',
      // `aria-busy` avisa a los lectores de pantalla de que esto es un estado
      // transitorio y no contenido real.
      attrs: { 'aria-busy': 'true' },
    },
    [
      el('img', {
        class: 'portada__logo',
        src: './assets/logo-zahavi.png',
        alt: 'Zahavi, panadería, repostería y café',
        width: LOGO_ANCHO,
        height: LOGO_ALTO,
      }),
      el('p', { class: 'portada__estado', text: 'Cargando recetario…' }),
    ],
  );
}
