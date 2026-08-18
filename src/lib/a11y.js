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
 * Se usa tras guardar, eliminar o publicar, donde el cambio visual no basta.
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
 * Ultimo elemento con foco antes de un repintado, en señas.
 * @type {{id: string, etiqueta: string, tag: string}|null}
 */
let focoAntesDelPintado = null;

/**
 * Anota quien tenia el foco justo antes de reconstruir la pantalla.
 *
 * Hace falta porque los dialogos se montan DENTRO del repintado: para cuando
 * uno llama a `trapFocus`, el boton que lo abrio ya se ha ido del documento y
 * el foco esta en `<body>`. Sin esta nota, al cerrar no habria a donde
 * volver y el teclado reaparecia al principio de la pagina.
 */
export function recordarFoco() {
  const activo = document.activeElement;
  if (activo instanceof HTMLElement && activo !== document.body) {
    focoAntesDelPintado = describirNodo(activo);
  }
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
  // Quien tenia el foco puede desaparecer del documento mientras el dialogo
  // esta abierto: la aplicacion se repinta entera y el boton que lo abrio pasa
  // a ser otro nodo con las mismas señas. Se guardan esas señas para poder
  // devolver el foco a su reemplazo. Si el repintado ya se lo llevo por
  // delante, sirve la nota que dejo `recordarFoco`.
  const senas = describirNodo(previous) || focoAntesDelPintado;

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

    // El contenedor cuenta como "antes del primero": retroceder desde el
    // dialogo recien abierto tiene que llevar al ultimo control, no salirse.
    if (event.shiftKey && (active === first || active === container || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', handleKeydown);

  // El objetivo se decide EN el siguiente cuadro, no ahora.
  //
  // Quien llama todavia esta montando el dialogo: el nodo aun no cuelga del
  // documento, y un nodo sin conectar no tiene ningun elemento enfocable
  // (`offsetParent` es null para todos). Resolverlo antes de tiempo devolvia
  // el contenedor pelado, que sin `tabindex` no acepta el foco, y este se
  // quedaba en `<body>`. Con el foco fuera del dialogo no le llegaba ninguna
  // tecla, porque quien las escucha es el propio panel: en Modo Pesar no
  // respondian ni la barra espaciadora, ni las flechas, ni Escape, y en el
  // resto de ventanas Escape no cerraba. Con raton no se notaba nada.
  window.requestAnimationFrame(() => {
    if (!container.isConnected) return;
    const target = options.initialFocus || container;
    if (!target.isConnected) return;
    // Se enfoca el contenedor y no el primer boton a proposito: un boton
    // enfocado se lleva la barra espaciadora y el Intro, que en Modo Pesar son
    // las teclas de pesar y avanzar. Desde el contenedor, el primer Tab entra
    // igualmente en los controles.
    if (target === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }
    target.focus();
  });

  return () => {
    container.removeEventListener('keydown', handleKeydown);
    const destino = recuperarNodo(previous, senas);
    if (destino) destino.focus();
  };
}

/**
 * Señas para reencontrar un nodo despues de un repintado: identificador,
 * etiqueta accesible y tipo de elemento.
 *
 * @param {EventTarget|null} node
 * @returns {{id: string, etiqueta: string, tag: string}|null}
 */
function describirNodo(node) {
  if (!(node instanceof HTMLElement) || node === document.body) return null;
  const id = node.id || '';
  const etiqueta = node.getAttribute('aria-label') || '';
  // Sin identificador ni etiqueta no hay forma de reconocerlo despues, y
  // devolver unas señas vacias taparia la nota de `recordarFoco`.
  if (!id && !etiqueta) return null;
  return { id, etiqueta, tag: node.tagName };
}

/**
 * El mismo nodo si sigue en el documento; si no, el que ocupa su lugar tras el
 * repintado. Devuelve null cuando no hay ninguno al que volver.
 *
 * @param {EventTarget|null} previous
 * @param {{id: string, etiqueta: string, tag: string}|null} senas
 * @returns {HTMLElement|null}
 */
function recuperarNodo(previous, senas) {
  // `<body>` no cuenta como foco anterior: es donde acaba el foco cuando el
  // repintado se lleva por delante al elemento que lo tenia, y devolverselo
  // dejaria el teclado al principio de la pagina.
  const sirve = previous instanceof HTMLElement && previous !== document.body && previous.isConnected;
  if (sirve) return previous;
  if (!senas) return null;

  if (senas.id) {
    const porId = document.getElementById(senas.id);
    if (porId) return porId;
  }
  if (senas.etiqueta) {
    const candidatos = document.querySelectorAll(senas.tag.toLowerCase() + '[aria-label]');
    for (const candidato of candidatos) {
      if (candidato.getAttribute('aria-label') === senas.etiqueta) return candidato;
    }
  }
  return null;
}

/**
 * Elementos enfocables visibles dentro de un contenedor.
 *
 * @param {ParentNode} container
 * @returns {Array<HTMLElement>}
 */
function focusableWithin(container) {
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
