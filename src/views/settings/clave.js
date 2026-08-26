/**
 * =============================================================================
 *  AJUSTES · LA CLAVE DE ESTE EQUIPO
 * =============================================================================
 *
 *  La clave de ACCESO, que es local y solo alcanza a este aparato. No es la de
 *  edicion: esa la comprueba el servidor y no se toca desde aqui. Ver la
 *  seccion 8 de CLAUDE.md, que explica por que son dos cosas distintas.
 */

import { el } from '../../lib/dom.js';
import { changePassword, MIN_PASSWORD_LENGTH } from '../../core/access.js';

/* ===========================================================================
 *  2. LA CLAVE DE ESTE EQUIPO
 * ======================================================================== */

/**
 * Cambio de la clave del equipo, con los dias que le quedan a la vista.
 *
 * Pide la clave actual antes de dejar cambiarla: si alguien deja la sesion
 * abierta, que otro no pueda quedarse con el acceso.
 */
export function renderPasswordBlock() {
  const message = el('p', { class: 'form-note', attrs: { role: 'status' } });

  const current = el('input', { type: 'password', id: 'pwd-current', class: 'field', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', id: 'pwd-new', class: 'field', autocomplete: 'new-password' });
  const confirmation = el('input', { type: 'password', id: 'pwd-confirm', class: 'field', autocomplete: 'new-password' });

  const apply = async () => {
    const result = await changePassword(current.value, next.value, confirmation.value);

    if (!result.ok) {
      message.textContent = result.message;
      message.classList.add('is-error');
      // El nodo ya lleva `role="status"`, que lo anuncia solo al cambiar su
      // texto. Llamar ademas a `announce()` escribia el mismo mensaje en la
      // region viva compartida, que es unica: el segundo borraba al primero
      // antes de que terminara de leerse.
      return;
    }

    message.classList.remove('is-error');
    message.textContent = 'Clave actualizada.';

    current.value = '';
    next.value = '';
    confirmation.value = '';
  };

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Clave de acceso · una cortina, no una cerradura' }),

    // DONDE VIVE ESTA CLAVE, dicho en la pantalla donde se cambia y no solo en
    // el manual. Cambiarla aqui no la cambia en la tableta del obrador, y eso
    // hay que saberlo ANTES de cambiarla, no despues de que la otra sede llame
    // preguntando por que no entra.
    el('p', { class: 'settings__count' }, [
      el('strong', { text: 'Esta clave es de este aparato.' }),
      ' Cambiarla aquí no la cambia en los demás equipos.',
    ]),

    el('div', { class: 'settings__grid' }, [
      el('div', null, [el('label', { class: 'label', for: 'pwd-current', text: 'clave actual' }), current]),
      // La regla del campo va PEGADA al campo. Estaba en la ultima frase de un
      // parrafo debajo del boton, asi que se leia despues de que el error ya la
      // hubiera dicho.
      el('div', null, [
        el('label', { class: 'label', for: 'pwd-new', text: 'clave nueva' }),
        next,
        el('p', {
          class: 'settings__pista',
          text: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres, distinta de la actual.`,
        }),
      ]),
      el('div', null, [el('label', { class: 'label', for: 'pwd-confirm', text: 'repetir la nueva' }), confirmation]),
    ]),

    el('div', { class: 'settings__actions' }, [
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Cambiar clave', on: { click: apply } }),
      message,
    ]),

    el('p', {
      class: 'settings__help',
      text: 'No caduca. La panadería puede retirarla desde el servidor: entonces todos los equipos piden una nueva en la siguiente carga.',
    }),

    // Aqui iba una nota sobre el modelo de amenaza, y era el ultimo texto de la
    // ventana: explicaba que esta clave es una cortina y remataba señalando a la
    // clave de edicion, que desde hoy ya no vive en esta pantalla. Su sitio es
    // `CLAUDE.md`, seccion 8; la idea que valia la pena conservar cabe en el titulo
    // de la seccion.
  ]);
}
