/**
 * Utilidades de accesibilidad: foco, anuncios y preferencia de movimiento.
 */

import { el } from './dom.js';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Tiempo que el anuncio permanece en la region viva antes de limpiarse. */
const ANNOUNCE_CLEAR_MS = 4000;

let liveRegion = null;
let announceTimer = null;

/**
 * Anuncia un mensaje a los lectores de pantalla sin robar el foco.
 * Se usa tras guardar, eliminar o importar, donde el cambio visual no basta.
 *
 * @param {string} message
 * @param {'polite'|'assertive'} [priority]
 */
export function announce(message, priority = 'polite') {
  if (!liveRegion) {
    liveRegion = el('div', {
      class: 'sr-only',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' },
    });
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', priority);
  // Limpiar primero fuerza el reanuncio cuando el mensaje se repite.
  liveRegion.textContent = '';
  window.requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    liveRegion.textContent = '';
  }, ANNOUNCE_CLEAR_MS);
}

/**
 * Encierra el foco dentro de un contenedor mientras esta abierto un dialogo.
 * Devuelve la funcion de liberacion, que ademas restaura el foco anterior.
 *
 * @param {HTMLElement} container
 * @param {{ onEscape?: () => void, initialFocus?: HTMLElement }} [options]
 * @returns {() => void}
 */
export function trapFocus(container, options = {}) {
  const previous = document.activeElement;

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      if (options.onEscape) {
        event.preventDefault();
        options.onEscape();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusableWithin(container);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', handleKeydown);

  const target = options.initialFocus || focusableWithin(container)[0] || container;
  // El nodo puede acabar de montarse: esperar al siguiente cuadro evita perder el foco.
  window.requestAnimationFrame(() => {
    if (target.isConnected) target.focus();
  });

  return () => {
    container.removeEventListener('keydown', handleKeydown);
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  };
}

/**
 * Elementos enfocables visibles dentro de un contenedor.
 *
 * @param {ParentNode} container
 * @returns {Array<HTMLElement>}
 */
export function focusableWithin(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (node) => node.offsetParent !== null || node === document.activeElement,
  );
}

/**
 * Deja una rama del documento fuera del alcance del teclado y de los lectores
 * de pantalla mientras hay un dialogo abierto por encima.
 *
 * @param {HTMLElement|null} node
 * @param {boolean} inert
 */
export function setInert(node, inert) {
  if (!node) return;
  if (inert) {
    node.setAttribute('inert', '');
    node.setAttribute('aria-hidden', 'true');
  } else {
    node.removeAttribute('inert');
    node.removeAttribute('aria-hidden');
  }
}
