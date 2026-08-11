/**
 * Pantalla de entrada.
 */

import { el } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { verifyPassword, signIn, DEFAULT_PASSWORD } from '../core/auth.js';
import { setState, getState } from '../core/store.js';

/**
 * @param {{showDefaultHint: boolean}} options
 * @returns {HTMLElement}
 */
export function renderLogin(options) {
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
    const valid = await verifyPassword(input.value);
    if (!valid) {
      error.textContent = 'Contraseña incorrecta.';
      setState({ loginError: 'Contraseña incorrecta.' });
      announce('Contraseña incorrecta.', 'assertive');
      input.select();
      return;
    }
    signIn();
    setState({ authed: true, loginError: '' });
  };

  const form = el('form', { class: 'login__card', on: { submit } }, [
    el('div', { class: 'login__brand' }, [
      el('p', { class: 'eyebrow', text: 'panadería · pastelería' }),
      el('h1', { class: 'login__wordmark', id: 'login-title', text: 'Zahavi' }),
      el('span', { class: 'login__rule' }),
      el('p', { class: 'login__tagline', text: 'Recetario de producción' }),
    ]),
    el('label', { class: 'label', for: 'login-password', text: 'contraseña' }),
    input,
    error,
    el('button', { type: 'submit', class: 'btn btn--primary btn--block', text: 'Entrar' }),
    options.showDefaultHint
      ? el('p', { class: 'login__hint' }, ['Contraseña inicial: ', el('code', { text: DEFAULT_PASSWORD })])
      : null,
    el('p', {
      class: 'login__disclaimer',
      text: 'Esta clave solo evita miradas casuales sobre el mostrador. No protege el contenido frente a quien tenga el enlace.',
    }),
  ]);

  window.requestAnimationFrame(() => {
    if (input.isConnected) input.focus();
  });

  return el('main', { class: 'login', id: 'contenido', attrs: { 'aria-labelledby': 'login-title' } }, [form]);
}
