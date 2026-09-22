/**
 * Carcasa de ventana modal: barra de titulo, cuerpo con desplazamiento y pie.
 *
 * Encierra el foco mientras esta abierta, cierra con Escape y devuelve el foco
 * al elemento que la abrio. La version anterior no hacia nada de esto.
 */

import { el, icon } from '../lib/dom.js';
import { trapFocus } from '../lib/a11y.js';
import { ICON_CERRAR } from '../lib/iconos.js';

let openCount = 0;

/**
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.meta] texto secundario de la barra de titulo
 * @param {'narrow'|'wide'} [options.size]
 * @param {() => void} options.onClose
 * @param {Node} options.body
 * @param {Array<Node>} [options.footer]
 * @param {boolean} [options.dismissOnBackdrop] cerrar al pulsar fuera; por
 *   defecto si. El editor lo desactiva: un clic accidental en el fondo no debe
 *   tirar una receta a medio escribir.
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function createWindow(options) {
  const titleId = 'win-title-' + Math.random().toString(36).slice(2, 8);

  const closeButton = el('button', {
    type: 'button',
    class: 'win__close',
    attrs: { 'aria-label': 'Cerrar' },
    on: { click: options.onClose },
  }, [icon(ICON_CERRAR, { class: 'icon--control' })]);

  const dialog = el(
    'div',
    {
      class: 'win win--' + (options.size || 'wide'),
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    },
    [
      el('div', { class: 'win__bar' }, [
        el('div', { class: 'win__titles' }, [
          el('h2', { class: 'win__title', id: titleId, text: options.title }),
          options.meta ? el('p', { class: 'win__meta', text: options.meta }) : null,
        ]),
        closeButton,
      ]),
      el('div', { class: 'win__body' }, [options.body]),
      options.footer && options.footer.length ? el('div', { class: 'win__footer' }, options.footer) : null,
    ],
  );

  const dismissOnBackdrop = options.dismissOnBackdrop !== false;

  const overlay = el(
    'div',
    {
      class: 'overlay',
      on: dismissOnBackdrop
        ? {
            // Solo cierra si el clic empieza y termina en el fondo, para que
            // arrastrar una seleccion desde dentro no cierre el dialogo.
            mousedown: (event) => {
              if (event.target === overlay) overlay.dataset.pressed = 'true';
            },
            click: (event) => {
              if (event.target === overlay && overlay.dataset.pressed === 'true') options.onClose();
              delete overlay.dataset.pressed;
            },
          }
        : {},
    },
    [dialog],
  );

  const release = trapFocus(dialog, { onEscape: options.onClose });

  openCount += 1;
  document.body.classList.add('is-modal-open');

  const close = () => {
    release();
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) document.body.classList.remove('is-modal-open');
    overlay.remove();
  };

  return { node: overlay, close };
}
