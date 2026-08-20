/**
 * Pantalla de entrada.
 *
 * Dos momentos en la misma pantalla:
 *
 *   1. ENTRAR      una sola clave, la del equipo.
 *   2. RENOVAR     si esa clave fue retirada -o es todavia la de instalacion-,
 *                  no se entra hasta cambiarla.
 *
 *  El cambio se pide DESPUES de comprobar la clave actual, nunca antes. Asi no
 *  hay riesgo de dejar a nadie fuera: quien llega hasta aqui acaba de demostrar
 *  que la conoce, y por tanto puede cambiarla.
 */

import { el, replaceChildren } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import {
  verifyPassword,
  changePassword,
  signIn,
  estadoClave,
  DEFAULT_PASSWORD,
  MIN_PASSWORD_LENGTH,
} from '../core/access.js';
import { setState, getState } from '../core/store.js';
import { APP_VERSION, APP_FASE } from '../core/version.js';

/**
 * @returns {HTMLElement}
 */
export function renderLogin() {
  const host = el('div', { class: 'login__host' });

  /** Pinta uno de los dos momentos dentro del mismo marco. */
  function mostrar(nodo) {
    replaceChildren(host, [nodo]);
  }

  mostrar(formularioEntrada());

  /* ---------------------------------------------------------------------
   *  1. Entrar
   * ------------------------------------------------------------------ */

  function formularioEntrada() {
    const clave = el('input', {
      type: 'password',
      id: 'login-password',
      class: 'field',
      autocomplete: 'current-password',
      attrs: { 'aria-describedby': 'login-error', required: true },
    });

    const error = el('p', {
      class: 'login__error',
      id: 'login-error',
      attrs: { role: 'alert' },
      text: getState().loginError,
    });

    const submit = async (event) => {
      event.preventDefault();

      if (!(await verifyPassword(clave.value))) {
        const texto = 'Clave incorrecta.';
        error.textContent = texto;
        setState({ loginError: texto });
        announce(texto, 'assertive');
        clave.value = '';
        clave.focus();
        return;
      }

      // La clave es correcta. Hay dos casos en los que NO se entra todavia,
      // y los dos se resuelven en la misma pantalla siguiente: cambiarla.
      //
      //   1. Es la clave de fabrica. Cada equipo empieza con ella, asi que
      //      sin esto quedaria puesta para siempre en cuanto alguien no se
      //      acordara de cambiarla, y una clave que es la misma en todas las
      //      instalaciones del mundo no es una clave.
      //   2. La panaderia la retiro, subiendo la generacion de acceso.
      //
      // El cambio se pide DESPUES de comprobar la clave, nunca antes: quien
      // llega hasta aqui acaba de demostrar que la conoce, asi que puede
      // cambiarla y nadie se queda fuera.
      const esDeFabrica = clave.value === DEFAULT_PASSWORD;
      if (esDeFabrica || estadoClave().caducada) {
        setState({ loginError: '' });
        mostrar(formularioRenovacion(clave.value, esDeFabrica ? 'inicial' : 'retirada'));
        return;
      }

      entrar();
    };

    const form = el('form', { class: 'login__card', on: { submit } }, [
      marca(),
      el('label', { class: 'label', for: 'login-password', text: 'clave' }),
      clave,
      error,
      el('button', { type: 'submit', class: 'btn btn--primary btn--block', text: 'Entrar' }),
      // Aqui iba la clave de fabrica escrita, para que nadie se quedara fuera
      // el primer dia. Se retiro: cualquiera que abriera el enlace la leia, y
      // no era cosa de un solo dia, porque cada equipo nuevo empieza con ella
      // y volvia a mostrarla. Ahora la clave inicial se comunica por fuera y el
      // sistema OBLIGA a cambiarla en el primer acceso de cada equipo.
      aviso(),
      pie(),
    ]);

    enfocar(clave);
    return form;
  }

  /* ---------------------------------------------------------------------
   *  2. Renovar la clave retirada
   * ------------------------------------------------------------------ */

  /**
   * @param {string} actual la clave que se acaba de comprobar
   * @param {'inicial'|'retirada'} motivo por que hay que cambiarla
   * @returns {HTMLElement}
   */
  function formularioRenovacion(actual, motivo = 'retirada') {
    const nueva = el('input', {
      type: 'password',
      id: 'renew-password',
      class: 'field',
      autocomplete: 'new-password',
      attrs: { 'aria-describedby': 'renew-error', required: true },
    });

    const confirmacion = el('input', {
      type: 'password',
      id: 'renew-password-2',
      class: 'field',
      autocomplete: 'new-password',
      attrs: { 'aria-describedby': 'renew-error', required: true },
    });

    const error = el('p', { class: 'login__error', id: 'renew-error', attrs: { role: 'alert' } });

    const submit = async (event) => {
      event.preventDefault();

      const result = await changePassword(actual, nueva.value, confirmacion.value);
      if (!result.ok) {
        error.textContent = result.message;
        announce(result.message, 'assertive');
        return;
      }

      announce('Clave renovada.');
      entrar();
    };

    const form = el('form', { class: 'login__card', on: { submit } }, [
      marca(),
      motivo === 'inicial'
        ? el('p', { class: 'login__aviso' }, [
            el('strong', { text: 'Pon la clave de tu equipo.' }),
            ' La que acabas de usar es la de instalación y es igual en todas partes,' +
              ' así que no sirve como clave. Esta se queda en este aparato y no caduca:' +
              ' solo se pedirá otra si la panadería retira la actual.',
          ])
        : el('p', { class: 'login__aviso' }, [
            el('strong', { text: 'La panadería retiró esta clave.' }),
            ' Pon la nueva que os hayan dado. No es que haya caducado por tiempo:' +
              ' alguien la ha retirado a propósito, y el cambio vale para las dos sedes.',
          ]),
      el('label', { class: 'label', for: 'renew-password', text: 'clave nueva' }),
      nueva,
      el('label', { class: 'label label--spaced', for: 'renew-password-2', text: 'repetir la clave nueva' }),
      confirmacion,
      error,
      el('button', { type: 'submit', class: 'btn btn--primary btn--block', text: 'Guardar y entrar' }),
      el('p', {
        class: 'login__hint',
        text: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres, y distinta de la anterior.`,
      }),
      aviso(),
      pie(),
    ]);

    enfocar(nueva);
    return form;
  }

  function entrar() {
    signIn();
    setState({ authed: true, loginError: '' });
  }

  /* ---------------------------------------------------------------------
   *  Piezas comunes a los dos momentos
   * ------------------------------------------------------------------ */

  function marca() {
    return el('div', { class: 'login__brand' }, [
      el('img', {
        class: 'login__logo',
        src: './assets/logo-zahavi.png',
        alt: 'Zahavi, panadería, repostería y café',
        width: 254,
        height: 78,
      }),
      el('h1', { class: 'login__wordmark sr-only', id: 'login-title', text: 'Zahavi' }),
      el('p', { class: 'login__tagline', text: 'Recetario de producción' }),
    ]);
  }

  function aviso() {
    return el('p', {
      class: 'login__disclaimer',
      text: 'Esta clave solo evita miradas casuales sobre el mostrador. No protege el contenido frente a quien tenga el enlace.',
    });
  }

  /**
   * Version del recetario, en letra pequena bajo el formulario.
   *
   * Esta en la pantalla de entrada porque es la unica que ve todo el mundo,
   * tambien quien nunca abre Ajustes. Cuando una sede dice que algo "no le
   * aparece", lo primero que hay que saber es si las dos estan mirando la misma
   * version, y preguntarlo por telefono deja de ser una adivinanza.
   */
  function pie() {
    return el('p', {
      class: 'login__version',
      text: `${APP_FASE} · v${APP_VERSION}`,
    });
  }

  /** El nodo acaba de montarse: hay que esperar al siguiente cuadro. */
  function enfocar(campo) {
    window.requestAnimationFrame(() => {
      if (campo.isConnected) campo.focus();
    });
  }

  return el('main', { class: 'login', id: 'contenido', attrs: { 'aria-labelledby': 'login-title' } }, [
    host,
  ]);
}
