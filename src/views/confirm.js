/**
 * Confirmacion de borrado.
 *
 * En la version anterior este dialogo estaba escrito pero nunca se mostraba: nada
 * lo montaba y nada asignaba el id pendiente, asi que eliminar una receta era
 * imposible desde la interfaz. Aqui queda conectado.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName } from '../lib/format.js';
import { createWindow } from './window.js';

/**
 * @param {{recipe: object, onConfirm: () => void, onCancel: () => void}} options
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openConfirmDelete(options) {
  const { base } = splitName(options.recipe.nombre);

  const body = el('div', { class: 'confirm' }, [
    el('p', { class: 'confirm__text' }, [
      'Vas a eliminar ',
      el('strong', { text: titleCase(base) }),
      ' del recetario de este dispositivo. Esta acción no se puede deshacer.',
    ]),
    el('p', {
      class: 'confirm__hint',
      text: 'Si tienes un respaldo exportado, podrás recuperarla importándolo de nuevo.',
    }),
  ]);

  return createWindow({
    title: 'Eliminar receta',
    meta: options.recipe.id,
    size: 'narrow',
    onClose: options.onCancel,
    body,
    footer: [
      el('span'),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Cancelar',
          on: { click: options.onCancel },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--destructive',
          text: 'Eliminar',
          on: { click: options.onConfirm },
        }),
      ]),
    ],
  });
}
