/**
 * Ajustes: contrasena, respaldo y estado del almacenamiento.
 */

import { el } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { isoDate } from '../lib/format.js';
import { changePassword, MIN_PASSWORD_LENGTH } from '../core/auth.js';
import { validateBackup } from '../core/schema.js';
import { createWindow } from './window.js';

/** Tamano maximo aceptado para un archivo de respaldo. */
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

/** Dias tras los cuales se recomienda exportar un respaldo nuevo. */
const BACKUP_REMINDER_DAYS = 30;

/**
 * @param {Object} options
 * @param {number} options.recipeCount
 * @param {string|null} options.lastBackupAt
 * @param {() => object} options.getBackup
 * @param {(backup: object) => void} options.onImport
 * @param {() => void} options.onExported
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openSettings(options) {
  const passwordMessage = el('p', { class: 'form-note', attrs: { role: 'status' } });
  const dataMessage = el('p', { class: 'form-note', attrs: { role: 'status' } });

  const newPassword = el('input', {
    type: 'password',
    id: 'pwd-new',
    class: 'field',
    autocomplete: 'new-password',
  });
  const confirmPassword = el('input', {
    type: 'password',
    id: 'pwd-confirm',
    class: 'field',
    autocomplete: 'new-password',
  });

  const applyPassword = async () => {
    const result = await changePassword(newPassword.value, confirmPassword.value);
    passwordMessage.textContent = result.ok ? 'Contraseña actualizada.' : result.message;
    passwordMessage.classList.toggle('is-error', !result.ok);
    if (result.ok) {
      newPassword.value = '';
      confirmPassword.value = '';
      announce('Contraseña actualizada.');
    }
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(options.getBackup(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `zahavi-recetario-${isoDate()}.json` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    options.onExported();
    dataMessage.textContent = 'Respaldo descargado. Guárdalo fuera de este equipo.';
    dataMessage.classList.remove('is-error');
    announce('Respaldo descargado.');
  };

  const importBackup = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_BACKUP_BYTES) {
      showImportError(`El archivo pesa demasiado (máximo ${MAX_BACKUP_BYTES / 1024 / 1024} MB).`);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showImportError('No se pudo leer el archivo.');
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        showImportError('El archivo no es un JSON válido.');
        return;
      }
      const result = validateBackup(parsed);
      if (!result.ok) {
        showImportError(result.message);
        return;
      }
      options.onImport(result.value);
    };
    reader.readAsText(file);
  };

  function showImportError(message) {
    dataMessage.textContent = message;
    dataMessage.classList.add('is-error');
    announce(message, 'assertive');
  }

  const fileInput = el('input', {
    type: 'file',
    id: 'backup-file',
    class: 'sr-only',
    accept: 'application/json,.json',
    on: { change: importBackup },
  });

  const body = el('div', { class: 'settings' }, [
    el('section', { class: 'settings__row' }, [
      el('h3', { class: 'section-label', text: 'Cambiar contraseña' }),
      el('div', { class: 'settings__grid' }, [
        el('div', null, [
          el('label', { class: 'label', for: 'pwd-new', text: 'nueva contraseña' }),
          newPassword,
        ]),
        el('div', null, [
          el('label', { class: 'label', for: 'pwd-confirm', text: 'confirmar' }),
          confirmPassword,
        ]),
      ]),
      el('div', { class: 'settings__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Actualizar',
          on: { click: applyPassword },
        }),
        passwordMessage,
      ]),
      el('p', {
        class: 'settings__help',
        text: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Es un filtro visual: cualquiera con acceso a este equipo puede ver las recetas.`,
      }),
    ]),
    el('section', { class: 'settings__row' }, [
      el('h3', { class: 'section-label', text: 'Respaldo' }),
      el('p', { class: 'settings__count' }, [
        el('strong', { text: String(options.recipeCount) }),
        options.recipeCount === 1
          ? ' receta guardada en este dispositivo.'
          : ' recetas guardadas en este dispositivo.',
      ]),
      renderBackupWarning(options.lastBackupAt),
      el('div', { class: 'settings__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Exportar respaldo',
          on: { click: exportBackup },
        }),
        el('label', { class: 'btn btn--ghost', for: 'backup-file', text: 'Importar respaldo' }),
        fileInput,
      ]),
      dataMessage,
      el('p', {
        class: 'settings__help',
        text: 'Importar reemplaza todo el recetario de este dispositivo. Exporta antes si tienes cambios sin respaldar.',
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
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: 'Cerrar',
          on: { click: options.onClose },
        }),
      ]),
    ],
  });
}

function renderBackupWarning(lastBackupAt) {
  if (!lastBackupAt) {
    return el('p', {
      class: 'settings__warning',
      text: 'Nunca has exportado un respaldo. Si se borran los datos del navegador, el recetario se pierde.',
    });
  }
  const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86400000);
  if (days < BACKUP_REMINDER_DAYS) return null;
  return el('p', {
    class: 'settings__warning',
    text: `El último respaldo es de hace ${days} días. Conviene exportar uno nuevo.`,
  });
}
