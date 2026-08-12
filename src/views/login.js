/**
 * Pantalla de entrada.
 */

import { el } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { verifyUser, signIn, DEFAULT_USER, DEFAULT_PASSWORD } from '../core/users.js';
import { setState, getState } from '../core/store.js';

/**
 * @param {{showDefaultHint: boolean}} options
 * @returns {HTMLElement}
 */
export function renderLogin(options) {
  // Cada persona entra con su nombre: asi se puede quitar el acceso a alguien
  // sin obligar al resto a cambiar de clave.
  const user = el('input', {
    type: 'text',
    id: 'login-user',
    class: 'field',
    autocomplete: 'username',
    autocapitalize: 'off',
    attrs: { 'aria-describedby': 'login-error', required: true },
  });

  const input = el('input', {
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

    const valid = await verifyUser(user.value, input.value);
    if (!valid) {
      // El mensaje no distingue si fallo el usuario o la clave: decirlo
      // ayudaria a quien esta probando nombres.
      const texto = 'Usuario o clave incorrectos.';
      error.textContent = texto;
      setState({ loginError: texto });
      announce(texto, 'assertive');
      input.value = '';
      input.focus();
      return;
    }

    signIn(user.value.trim());
    setState({ authed: true, loginError: '' });
  };

  const form = el('form', { class: 'login__card', on: { submit } }, [
    el('div', { class: 'login__brand' }, [
      el('img', {
        class: 'login__logo',
        src: './assets/logo-zahavi.png',
        alt: 'Zahavi, panadería, repostería y café',
        width: 254,
        height: 78,
      }),
      el('h1', { class: 'login__wordmark sr-only', id: 'login-title', text: 'Zahavi' }),
      el('p', { class: 'login__tagline', text: 'Recetario de producción' }),
    ]),
    el('label', { class: 'label', for: 'login-user', text: 'usuario' }),
    user,
    el('label', { class: 'label label--spaced', for: 'login-password', text: 'clave' }),
    input,
    error,
    el('button', { type: 'submit', class: 'btn btn--primary btn--block', text: 'Entrar' }),
    options.showDefaultHint
      ? el('p', { class: 'login__hint' }, [
          'Acceso inicial: ',
          el('code', { text: DEFAULT_USER }),
          ' / ',
          el('code', { text: DEFAULT_PASSWORD }),
        ])
      : null,
    el('p', {
      class: 'login__disclaimer',
      text: 'Esta clave solo evita miradas casuales sobre el mostrador. No protege el contenido frente a quien tenga el enlace.',
    }),
  ]);

  window.requestAnimationFrame(() => {
    if (user.isConnected) user.focus();
  });

  return el('main', { class: 'login', id: 'contenido', attrs: { 'aria-labelledby': 'login-title' } }, [form]);
}
