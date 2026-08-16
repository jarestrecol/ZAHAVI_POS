/**
 * Pantalla de entrada.
 *
 * Dos momentos en la misma pantalla:
 *
 *   1. ENTRAR      una sola clave, la del equipo.
 *   2. RENOVAR     si esa clave ya cumplio la semana, no se entra hasta
 *                  cambiarla.
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
  PASSWORD_MAX_AGE_DAYS,
} from '../core/access.js';
import { setState, getState } from '../core/store.js';

/**
 * @param {{showDefaultHint: boolean}} options
 * @returns {HTMLElement}
 */
export function renderLogin(options) {
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

      // La clave es correcta. Si ya cumplio la semana, se cambia antes de
      // entrar: en ese punto ya sabemos que quien esta delante la conoce.
      if (estadoClave().caducada) {
        setState({ loginError: '' });
        mostrar(formularioRenovacion(clave.value));
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
      options.showDefaultHint
        ? el('p', { class: 'login__hint' }, ['Acceso inicial: ', el('code', { text: DEFAULT_PASSWORD })])
        : null,
      aviso(),
    ]);

    enfocar(clave);
    return form;
  }

  /* ---------------------------------------------------------------------
   *  2. Renovar la clave de la semana
   * ------------------------------------------------------------------ */

  /**
   * @param {string} actual la clave que se acaba de comprobar
   * @returns {HTMLElement}
   */
  function formularioRenovacion(actual) {
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
      el('p', { class: 'login__aviso' }, [
        el('strong', { text: 'Toca renovar la clave.' }),
        ` Se cambia cada ${PASSWORD_MAX_AGE_DAYS} días, y la de este equipo ya los cumplió.`,
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
