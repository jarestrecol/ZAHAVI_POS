/**
 * Ajustes: estado de publicacion, contrasena y recuperacion.
 *
 * El bloque principal es el de publicacion, porque en un sitio sin servidor es
 * donde se decide si lo que alguien edito llega o no al resto de las sedes.
 */

import { el } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { changePassword, MIN_PASSWORD_LENGTH } from '../core/auth.js';
import { validateBackup } from '../core/schema.js';
import { createWindow } from './window.js';

/** Tamano maximo aceptado para un archivo importado. */
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

/**
 * @param {Object} options
 * @param {number} options.recipeCount
 * @param {string} options.revision version publicada en uso
 * @param {{dirty: boolean, conflict: boolean, added: number, modified: number, removed: number, total: number}} options.changes
 * @param {() => object} options.getPublishableFile
 * @param {() => void} options.onDiscard
 * @param {(backup: object) => void} options.onImport
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openSettings(options) {
  const passwordMessage = el('p', { class: 'form-note', attrs: { role: 'status' } });
  const dataMessage = el('p', { class: 'form-note', attrs: { role: 'status' } });

  const newPassword = el('input', { type: 'password', id: 'pwd-new', class: 'field', autocomplete: 'new-password' });
  const confirmPassword = el('input', { type: 'password', id: 'pwd-confirm', class: 'field', autocomplete: 'new-password' });

  const applyPassword = async () => {
    const result = await changePassword(newPassword.value, confirmPassword.value);
    passwordMessage.textContent = result.ok ? 'Contraseña actualizada en este equipo.' : result.message;
    passwordMessage.classList.toggle('is-error', !result.ok);
    if (result.ok) {
      newPassword.value = '';
      confirmPassword.value = '';
      announce('Contraseña actualizada.');
    }
  };

  const downloadFile = () => {
    const blob = new Blob([JSON.stringify(options.getPublishableFile(), null, 2) + '\n'], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'recipes.json' });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    dataMessage.textContent = 'Archivo descargado. Reemplaza data/recipes.json del proyecto y vuelve a publicar el sitio.';
    dataMessage.classList.remove('is-error');
    announce('Archivo de recetas descargado.');
  };

  const importFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      showError(`El archivo pesa demasiado (máximo ${MAX_BACKUP_BYTES / 1024 / 1024} MB).`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => showError('No se pudo leer el archivo.');
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        showError('El archivo no es un JSON válido.');
        return;
      }
      const result = validateBackup(parsed);
      if (!result.ok) {
        showError(result.message);
        return;
      }
      options.onImport(result.value);
    };
    reader.readAsText(file);
  };

  function showError(message) {
    dataMessage.textContent = message;
    dataMessage.classList.add('is-error');
    announce(message, 'assertive');
  }

  const fileInput = el('input', {
    type: 'file',
    id: 'backup-file',
    class: 'sr-only',
    accept: 'application/json,.json',
    on: { change: importFile },
  });

  const body = el('div', { class: 'settings' }, [
    el('section', { class: 'settings__row' }, [
      el('h3', { class: 'section-label', text: 'Estado del recetario' }),
      el('p', { class: 'settings__count' }, [
        el('strong', { text: String(options.recipeCount) }),
        options.recipeCount === 1 ? ' receta.' : ' recetas.',
        options.revision ? ` Versión publicada: ${options.revision}.` : '',
      ]),
      renderChanges(options.changes),
      el('div', { class: 'settings__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn ' + (options.changes.dirty ? 'btn--primary' : 'btn--ghost'),
          text: 'Descargar recetas actualizadas',
          on: { click: downloadFile },
        }),
        options.changes.dirty
          ? el('button', {
              type: 'button',
              class: 'btn btn--danger',
              text: 'Descartar cambios de este equipo',
              on: { click: options.onDiscard },
            })
          : null,
      ]),
      dataMessage,
      el('p', { class: 'settings__help' }, [
        'Los cambios hechos aquí se guardan solo en este equipo. Para que los vean también en la otra sede, ',
        el('strong', { text: 'descarga el archivo y publícalo' }),
        ': reemplaza ',
        el('code', { text: 'data/recipes.json' }),
        ' en el proyecto y vuelve a desplegar el sitio.',
      ]),
    ]),

    el('section', { class: 'settings__row' }, [
      el('h3', { class: 'section-label', text: 'Cambiar contraseña' }),
      el('div', { class: 'settings__grid' }, [
        el('div', null, [el('label', { class: 'label', for: 'pwd-new', text: 'nueva contraseña' }), newPassword]),
        el('div', null, [el('label', { class: 'label', for: 'pwd-confirm', text: 'confirmar' }), confirmPassword]),
      ]),
      el('div', { class: 'settings__actions' }, [
        el('button', { type: 'button', class: 'btn btn--ghost', text: 'Actualizar', on: { click: applyPassword } }),
        passwordMessage,
      ]),
      el('p', {
        class: 'settings__help',
        text: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Solo afecta a este equipo y es un filtro visual, no una protección real.`,
      }),
    ]),

    el('section', { class: 'settings__row' }, [
      el('h3', { class: 'section-label', text: 'Recuperar desde un archivo' }),
      el('div', { class: 'settings__actions' }, [
        el('label', { class: 'btn btn--ghost', for: 'backup-file', text: 'Cargar archivo de recetas' }),
        fileInput,
      ]),
      el('p', {
        class: 'settings__help',
        text: 'Reemplaza todo el recetario de este equipo por el contenido del archivo. Úsalo solo para recuperar una copia.',
      }),
    ]),
  ]);

  return createWindow({
    title: 'Ajustes',
    meta: 'zahavi · recetario',
    size: 'narrow',
    onClose: options.onClose,
    body,
    footer: [
      el('p', { class: 'win__hint', text: 'Sesión activa en este equipo.' }),
      el('div', { class: 'win__actions' }, [
        el('button', { type: 'button', class: 'btn btn--primary', text: 'Cerrar', on: { click: options.onClose } }),
      ]),
    ],
  });
}

function renderChanges(changes) {
  if (!changes.dirty) {
    return el('p', { class: 'settings__ok', text: 'Este equipo está igual que la versión publicada.' });
  }

  const partes = [];
  if (changes.added) partes.push(`${changes.added} nueva${changes.added === 1 ? '' : 's'}`);
  if (changes.modified) partes.push(`${changes.modified} modificada${changes.modified === 1 ? '' : 's'}`);
  if (changes.removed) partes.push(`${changes.removed} eliminada${changes.removed === 1 ? '' : 's'}`);

  return el('div', null, [
    el('p', { class: 'settings__warning', text: `Cambios sin publicar en este equipo: ${partes.join(', ')}.` }),
    changes.conflict
      ? el('p', {
          class: 'settings__warning settings__warning--strong',
          text: 'Además se publicó una versión nueva del recetario. Si descartas los cambios de este equipo, se perderán; si publicas, sustituirás la versión nueva.',
        })
      : null,
  ]);
}
