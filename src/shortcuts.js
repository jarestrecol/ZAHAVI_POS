/**
 * =============================================================================
 *  ATAJOS DE TECLADO
 * =============================================================================
 *
 *  Los atajos del recetario, en su propio archivo porque no tienen nada que ver
 *  con arrancar la aplicacion ni con pintarla, que es de lo que se ocupa
 *  `main.js`.
 *
 *  Todos comparten una regla: con un dialogo delante no se disparan. Las teclas
 *  pertenecen a la ventana abierta, no al listado que queda detras.
 */

import { getState, recetario } from './core/store.js';
import { getRoute, navigate } from './core/router.js';
import { SEARCH_ID } from './views/sidebar.js';
import { hayDialogoAbierto } from './dialogs.js';
import { hayPantallaDeModulo } from './pantallas.js';

/**
 * Atajos de teclado.
 *
 * Son pocos a proposito: solo lo que de verdad se repite muchas veces al dia.
 *
 *      /            ir al buscador
 *      flechas      recorrer el listado de recetas
 *      E            editar la receta abierta
 *      Escape       salir del buscador y limpiar la busqueda
 *
 * No se activan mientras se escribe en un campo ni con un dialogo abierto: ahi
 * las teclas pertenecen a lo que la persona esta haciendo.
 *
 * @param {KeyboardEvent} event
 */
export function handleShortcuts(event) {
  const state = getState();

  if (!state.ready || !state.authed) return;
  // Con un modulo completo delante, el listado de recetas ni siquiera esta en
  // pantalla: las flechas y las letras pertenecen a ese modulo.
  if (hayDialogoAbierto() || hayPantallaDeModulo() || state.recetario.production) return;

  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

  // Barra: al buscador desde cualquier punto.
  if (event.key === '/' && !typing) {
    event.preventDefault();
    const field = document.getElementById(SEARCH_ID);
    if (field) field.focus();
    return;
  }

  // Escape dentro del buscador: soltar el foco y limpiar la busqueda.
  if (event.key === 'Escape' && typing && target.id === SEARCH_ID) {
    target.blur();
    navigate({ name: 'index', id: null, query: '' }, { replace: true });
    return;
  }

  // El resto de atajos no deben interferir con la escritura.
  if (typing) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  const route = getRoute();
  if ((event.key === 'e' || event.key === 'E') && route.name === 'detail') {
    event.preventDefault();
    navigate({ name: 'edit', id: route.id });
  }
}

/**
 * Mueve la seleccion por el listado con las flechas.
 *
 * Se apoya en los enlaces ya pintados en lugar de recalcular la lista filtrada,
 * porque asi respeta exactamente lo que la persona esta viendo, incluidos el
 * filtro de categoria y la busqueda activa.
 *
 * @param {number} delta 1 para bajar, -1 para subir
 */
function moveSelection(delta) {
  const links = Array.from(document.querySelectorAll('.recipe-link'));
  if (links.length === 0) return;

  const activeIndex = links.findIndex((link) => link.classList.contains('is-active'));

  // Si no hay ninguna receta abierta, la primera flecha selecciona la primera.
  const nextIndex =
    activeIndex === -1 ? 0 : Math.min(links.length - 1, Math.max(0, activeIndex + delta));
  const next = links[nextIndex];
  if (!next) return;

  // El codigo se lee de `data-id`, no recortando la direccion: desde que el
  // enlace conserva el filtro y la busqueda, la direccion lleva parametros
  // detras (`#/receta/R123?cat=GALLETAS`) y recortarla daba un codigo invalido.
  const id = next.dataset.id;
  if (!id) return;
  navigate({ name: 'detail', id });
  next.scrollIntoView({ block: 'nearest' });
}

