/**
 * =============================================================================
 *  PUBLICAR: LA CLAVE DE EDICION, PEDIDA DONDE HACE FALTA
 * =============================================================================
 *
 *  EL PROBLEMA QUE RESUELVE
 *  ------------------------
 *  Publicar necesita la clave de edicion, y esa clave solo se pedia en Ajustes.
 *  Sobre el papel bastaba con ir alli una vez por sesion. En la practica no
 *  bastaba, y el resultado fue el peor posible: en toda la vida del recetario no
 *  llego a publicarse NI UNA sola vez. Las recetas se guardaban en el equipo, el
 *  aviso decia la verdad -"guardada en este equipo"-, y nadie llegaba nunca a la
 *  pantalla donde estaba el paso que faltaba.
 *
 *  Un paso obligatorio escondido detras de un menu no es un paso: es un muro.
 *
 *  LO QUE HACE
 *  -----------
 *  La primera vez que alguien guarda algo en cada sesion, si este sitio puede
 *  publicar y todavia no hay clave, se pide AQUI MISMO, en el momento, con el
 *  cambio ya guardado y a salvo. Se escribe la clave, se publica, y a partir de
 *  ahi el equipo publica solo hasta que se cierre el navegador.
 *
 *  LO QUE NO HACE, Y POR QUE
 *  -------------------------
 *  No guarda la clave en el disco. Sigue viviendo en la sesion del navegador
 *  (`core/remote.js`), asi que al cerrar hay que volver a escribirla. Guardarla
 *  de forma permanente ahorraria ese gesto una vez al dia, pero dejaria la llave
 *  del repositorio escrita en un equipo del mostrador, y eso no compensa.
 *
 *  No bloquea el trabajo. "Ahora no" cierra y deja el cambio guardado en el
 *  equipo, exactamente como antes: quien no tenga la clave a mano sigue
 *  trabajando, y el aviso de cambios sin publicar queda en la cabecera.
 */

import { el } from '../lib/dom.js';
import { createWindow } from './window.js';

/**
 * @param {Object} options
 * @param {number} options.pendientes cuantos cambios hay sin publicar
 * @param {(password: string) => Promise<object>} options.onPublish
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openPublicar(options) {
  /**
   * El error va con el tratamiento de error de la aplicacion -fondo, borde
   * lateral, cuerpo de texto normal- y no con el de una nota al pie. Una clave
   * mal escrita en el mostrador tiene que verse a la primera.
   *
   * Lleva `role="alert"`, que ya lo anuncia solo al cambiar su texto. NO se
   * llama ademas a `announce()`: la region viva es unica y compartida, asi que
   * un segundo mensaje borraria el primero antes de que terminara de leerse.
   */
  const message = el('p', { class: 'form-error', attrs: { role: 'alert' } });

  const key = el('input', {
    type: 'password',
    id: 'publicar-clave',
    class: 'field',
    placeholder: 'Clave de edición',
    autocomplete: 'off',
  });

  // La accion principal de esta pantalla lleva el relleno ambar de marca, que
  // es lo que en esta aplicacion significa "esta es LA accion". `btn--primary`
  // (relleno de tinta) es el avance dentro de un flujo, no la accion mayor.
  const button = el('button', {
    type: 'button',
    class: 'btn btn--accent',
    text: 'Publicar',
    on: { click: () => enviar() },
  });

  async function enviar() {
    if (!key.value.trim()) {
      message.textContent = 'Escribe la clave de edición para publicar.';
      key.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Publicando…';
    message.textContent = '';

    const result = await options.onPublish(key.value.trim());

    button.textContent = 'Publicar';
    button.disabled = false;

    if (!result.ok) {
      message.textContent = result.message;
      key.select();
      return;
    }

    // Salio bien: la clave queda guardada para el resto de la sesion y este
    // equipo ya publica solo. No hay nada mas que decir aqui.
    options.onClose();
  }

  // Intro publica, que es lo que espera cualquiera que acaba de escribir una
  // clave. Sin esto habria que soltar el teclado para buscar el boton.
  key.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      enviar();
    }
  });

  const body = el('div', { class: 'settings' }, [
    el('section', { class: 'settings__row' }, [
      el('p', { class: 'settings__count' }, [
        el('strong', { text: 'Guardado en este equipo.' }),
        options.pendientes === 1
          ? ' Queda 1 cambio por enviar a las demás sedes.'
          : ` Quedan ${options.pendientes} cambios por enviar a las demás sedes.`,
      ]),

      el('p', {
        class: 'settings__help',
        text: 'Escribe la clave de edición una vez y este equipo publicará solo el resto del día. Es la clave que da la panadería para publicar, distinta de la que usas para entrar.',
      }),

      el('label', { class: 'label label--spaced', for: 'publicar-clave', text: 'clave de edición' }),
      key,
    ]),

    // El error va FUERA de la seccion: `.form-error` trae su propio margen
    // lateral, pensado para alinearse con el borde del dialogo. Dentro de una
    // seccion que ya tiene relleno quedaria indentado el doble.
    message,
  ]);

  window.requestAnimationFrame(() => {
    if (key.isConnected) key.focus();
  });

  return createWindow({
    title: 'Publicar para todas las sedes',
    // La ranura de `meta` identifica QUE se esta tocando en el resto de la
    // aplicacion, asi que aqui lleva lo que hay en juego, no el nombre de la
    // casa.
    meta: options.pendientes === 1 ? '1 cambio' : `${options.pendientes} cambios`,
    size: 'narrow',
    onClose: options.onClose,
    body,
    footer: [
      el('p', {
        class: 'win__hint',
        text: 'Sin publicar, el cambio se queda solo en este equipo.',
      }),
      // Las dos acciones juntas en el pie, que es donde se busca la resolucion.
      // Con "Publicar" arriba en el cuerpo, la barra inferior solo ofrecia la
      // negativa y la jerarquia quedaba del reves.
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Ahora no',
          on: { click: options.onClose },
        }),
        button,
      ]),
    ],
  });
}
