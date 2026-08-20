/**
 * =============================================================================
 *  LA CLAVE ANTES DE TOCAR UNA RECETA
 * =============================================================================
 *
 *  POR QUE EXISTE
 *  --------------
 *  Consultar el recetario lo hace todo el obrador: buscar, escalar la tanda,
 *  imprimir, pesar. Para eso basta con la clave de entrada, que sabe todo el
 *  mundo.
 *
 *  CAMBIAR una formula es otra cosa. Con la publicacion automatica en marcha,
 *  eliminar una receta ya no se queda en el aparato: sale hacia las dos sedes
 *  sin que nadie vuelva a preguntar nada. Es decir, quien se encontrara la
 *  tableta del mostrador abierta podia borrar una formula para la panaderia y
 *  para la casa de produccion, sin conocer mas clave que la de entrar.
 *
 *  Asi que crear, modificar y eliminar piden la clave de EDICION, que es la que
 *  el servidor comprueba y la unica proteccion real del sistema.
 *
 *  QUIEN COMPRUEBA LA CLAVE
 *  ------------------------
 *  El SERVIDOR, siempre. Este archivo no la compara con nada: se la manda a
 *  `/api/recipes` en modo comprobacion y espera su respuesta. Compararla aqui
 *  seria teatro, porque basta con abrir las herramientas del navegador para
 *  saltarse cualquier comprobacion que viva en el cliente.
 *
 *  SIN CONEXION
 *  ------------
 *  La clave queda en la sesion del navegador tras la primera comprobacion, asi
 *  que si ya se puso, se sigue trabajando aunque se caiga la señal: este
 *  dialogo no llega a aparecer. Lo que no se puede es EMPEZAR a editar sin red
 *  y sin haberla puesto antes, porque no hay a quien preguntar. Se dice tal
 *  cual, en vez de dejar escribir media receta para rechazarla al final.
 */

import { el } from '../lib/dom.js';
import { createWindow } from './window.js';

/** Que se va a hacer, dicho en la propia pantalla. */
const QUE_SE_VA_A_HACER = {
  new: 'crear una receta nueva',
  edit: 'modificar esta receta',
  delete: 'eliminar esta receta',
};

/**
 * @param {Object} options
 * @param {'new'|'edit'|'delete'} options.accion
 * @param {string} [options.nombre] nombre de la receta, cuando la hay
 * @param {(password: string) => Promise<object>} options.onVerificar
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openDesbloquear(options) {
  const message = el('p', { class: 'form-error', attrs: { role: 'alert' } });

  const key = el('input', {
    type: 'password',
    id: 'desbloquear-clave',
    class: 'field',
    placeholder: 'Clave de edición',
    autocomplete: 'off',
  });

  const button = el('button', {
    type: 'button',
    class: 'btn btn--accent',
    text: 'Continuar',
    on: { click: () => enviar() },
  });

  async function enviar() {
    if (!key.value.trim()) {
      message.textContent = 'Escribe la clave de edición para continuar.';
      key.focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Comprobando…';
    message.textContent = '';

    const result = await options.onVerificar(key.value.trim());

    button.textContent = 'Continuar';
    button.disabled = false;

    if (!result.ok) {
      message.textContent = result.message;
      key.select();
    }
    // Si sale bien, quien llama cierra el dialogo y sigue con lo que se pedia:
    // desde aqui no se decide que pasa despues.
  }

  key.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      enviar();
    }
  });

  const body = el('div', { class: 'settings' }, [
    el('section', { class: 'settings__row' }, [
      el('p', { class: 'settings__count' }, [
        'Vas a ',
        el('strong', { text: QUE_SE_VA_A_HACER[options.accion] || 'cambiar el recetario' }),
        options.nombre ? `: ${options.nombre}.` : '.',
      ]),

      el('p', {
        class: 'settings__help',
        text: 'Cambiar una fórmula llega a la panadería y a la casa de producción, así que hace falta la clave de edición. No es la que usas para entrar: es la que da la panadería para publicar. Se pide una vez y vale para el resto del día en este equipo.',
      }),

      el('label', {
        class: 'label label--spaced',
        for: 'desbloquear-clave',
        text: 'clave de edición',
      }),
      key,
    ]),

    message,
  ]);

  window.requestAnimationFrame(() => {
    if (key.isConnected) key.focus();
  });

  return createWindow({
    title: 'Clave de edición',
    meta: options.accion === 'delete' ? 'eliminar' : options.accion === 'new' ? 'crear' : 'modificar',
    size: 'narrow',
    onClose: options.onClose,
    body,
    footer: [
      el('p', {
        class: 'win__hint',
        text: 'Consultar, escalar tandas, imprimir y pesar no necesitan esta clave.',
      }),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cancelar',
          on: { click: options.onClose },
        }),
        button,
      ]),
    ],
  });
}
