/**
 * La metafora fisica del libro: portada cerrada y carcasa de la pagina abierta.
 *
 * Todo el ornamento (tela, lomo, cantos, papel envejecido) vive en CSS. Aqui solo
 * se decide la estructura y las clases de estado. Las animaciones se neutralizan
 * solas cuando el sistema pide menos movimiento, porque son clases y no estilos
 * en linea.
 */

import { el } from '../lib/dom.js';

/** Nervios del lomo de la portada cerrada. */
const SPINE_BANDS = 4;

/**
 * Portada cerrada. Es un unico boton: todo su contenido es decorativo y se
 * oculta a los lectores de pantalla para que el nombre accesible sea limpio.
 *
 * @param {{state: 'closed'|'opening'|'shutting', onOpen: () => void}} options
 * @returns {HTMLElement}
 */
export function renderClosedBook(options) {
  const bands = [];
  for (let i = 0; i < SPINE_BANDS; i += 1) bands.push(el('span', { class: 'cover__band' }));

  return el('div', { class: 'cover-stage cover-stage--' + options.state }, [
    el(
      'button',
      {
        type: 'button',
        class: 'cover',
        attrs: { 'aria-label': 'Abrir el recetario' },
        disabled: options.state !== 'closed',
        on: { click: options.onOpen },
      },
      [
        el('span', { class: 'cover__shadow', attrs: { 'aria-hidden': 'true' } }),
        el('span', { class: 'cover__spine', attrs: { 'aria-hidden': 'true' } }, bands),
        el('span', { class: 'cover__board', attrs: { 'aria-hidden': 'true' } }, [
          el('span', { class: 'cover__frame' }),
          el('span', { class: 'cover__frame cover__frame--inner' }),
          el('span', { class: 'cover__eyebrow', text: 'panadería · pastelería' }),
          el('span', { class: 'cover__wordmark', text: 'Zahavi' }),
          el('span', { class: 'cover__rule' }),
          el('span', { class: 'cover__subtitle', text: 'Recetario' }),
          el('span', {
            class: 'cover__prompt',
            text: options.state === 'closed' ? 'toca para abrir' : '',
          }),
        ]),
        el('span', { class: 'cover__fore-edge', attrs: { 'aria-hidden': 'true' } }),
      ],
    ),
  ]);
}

/**
 * Carcasa del libro abierto: tapa, cantos y el pliego de papel donde se monta la
 * pagina activa.
 *
 * @param {{content: Node, turning: 'fwd'|'back'|null, shutting: boolean}} options
 * @returns {HTMLElement}
 */
export function renderBookShell(options) {
  return el(
    'div',
    { class: 'stage' + (options.shutting ? ' stage--shutting' : '') },
    [
      el('div', { class: 'book' }, [
        el('span', { class: 'book__edge book__edge--left', attrs: { 'aria-hidden': 'true' } }),
        el('div', { class: 'paper' }, [
          el('span', { class: 'paper__gutter', attrs: { 'aria-hidden': 'true' } }),
          el('span', { class: 'paper__stitching', attrs: { 'aria-hidden': 'true' } }),
          el('main', { class: 'paper__content', id: 'contenido' }, [options.content]),
          options.turning ? renderLeaf(options.turning) : null,
        ]),
        el('span', { class: 'book__edge book__edge--right', attrs: { 'aria-hidden': 'true' } }),
      ]),
    ],
  );
}

/**
 * La hoja que gira sobre el lomo. Puramente decorativa.
 *
 * @param {'fwd'|'back'} direction
 * @returns {HTMLElement}
 */
function renderLeaf(direction) {
  return el('div', { class: 'leaf leaf--' + direction, attrs: { 'aria-hidden': 'true' } }, [
    el('span', { class: 'leaf__cast' }),
    el('span', { class: 'leaf__sheet' }, [el('span', { class: 'leaf__sheen' })]),
  ]);
}
