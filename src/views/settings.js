/**
 * =============================================================================
 *  AJUSTES
 * =============================================================================
 *
 *  Cuatro bloques, en este orden:
 *
 *      1. ESTADO Y PUBLICACION
 *         Cuantas recetas hay, que version esta publicada y si este equipo tiene
 *         cambios que las demas sedes todavia no ven. Desde aqui se publica.
 *
 *      2. REVISION DE DATOS
 *         Valores del recetario que se salen del patron y merecen una segunda
 *         mirada. Solo senala: no cambia nada.
 *
 *      3. USUARIOS
 *         Alta y baja de personas que pueden entrar en ESTE equipo.
 *
 *      4. MI CLAVE
 *         Cambiar la clave del usuario que tiene la sesion abierta.
 *
 *  LO QUE NO ESTA, Y POR QUE
 *  -------------------------
 *  No hay descarga del recetario ni carga de archivos. Sacar una copia completa
 *  de las formulas a un archivo suelto es justo lo que no debe poder hacerse
 *  desde el mostrador. La copia de seguridad de verdad es el historial del
 *  repositorio: cada publicacion queda guardada ahi y se puede recuperar
 *  cualquier version anterior.
 */

import { el, clear } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { revisar, resumen } from '../core/audit.js';
import { navigate } from '../core/router.js';
import {
  createUser,
  changePassword,
  removeUser,
  listUsers,
  currentUser,
  signOut,
  MIN_PASSWORD_LENGTH,
} from '../core/users.js';
import { setState } from '../core/store.js';
import { createWindow } from './window.js';

/**
 * @param {Object} options
 * @param {number} options.recipeCount cuantas recetas hay
 * @param {number} options.withMethod cuantas tienen metodo escrito
 * @param {string} options.revision version publicada en uso
 * @param {object} options.changes resumen de cambios sin publicar
 * @param {boolean} options.canPublish si este sitio tiene publicacion compartida
 * @param {boolean} options.needsReload si hay que recargar antes de publicar
 * @param {string} options.editKey clave de edicion guardada en la sesion
 * @param {(password: string) => Promise<object>} options.onPublish
 * @param {() => void} options.onDiscard
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openSettings(options) {
  const body = el('div', { class: 'settings' }, [
    renderStatusBlock(options),
    renderAuditBlock(options.recipes, options.onClose),
    renderUsersBlock(),
    renderPasswordBlock(),
  ]);

  return createWindow({
    title: 'Ajustes',
    meta: 'zahavi · recetario',
    size: 'narrow',
    onClose: options.onClose,
    body,
    footer: [
      el('p', { class: 'win__hint', text: `Sesión de ${currentUser()} en este equipo.` }),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cerrar sesión',
          on: {
            click: () => {
              signOut();
              // La sesion es de este dispositivo: cerrarla no toca ni las
              // recetas ni los cambios sin publicar, solo saca a la persona
              // hasta que alguien vuelva a entrar con su usuario y clave.
              setState({ authed: false, settingsOpen: false });
            },
          },
        }),
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

/* ===========================================================================
 *  1. ESTADO Y PUBLICACION
 * ======================================================================== */

function renderStatusBlock(options) {
  const message = el('p', { class: 'form-note', attrs: { role: 'status' } });

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Estado del recetario' }),

    el('p', { class: 'settings__count' }, [
      el('strong', { text: String(options.recipeCount) }),
      options.recipeCount === 1 ? ' receta.' : ' recetas.',
      options.revision ? ` Versión publicada: ${options.revision}.` : '',
    ]),

    el('p', {
      class: 'settings__help',
      text: `${options.withMethod} de ${options.recipeCount} recetas tienen el método escrito.`,
    }),

    renderChanges(options.changes),

    // El bloque de publicar solo aparece si este sitio tiene la funcion de
    // servidor activa. Sin ella no hay a donde publicar.
    options.canPublish ? renderPublish(options, message) : null,

    options.canPublish
      ? null
      : el('p', {
          class: 'settings__help',
          text: 'Este sitio no tiene publicación compartida activa: los cambios se quedan en este equipo.',
        }),

    options.changes.dirty
      ? el('div', { class: 'settings__actions' }, [
          el('button', {
            type: 'button',
            class: 'btn btn--danger',
            text: 'Descartar cambios de este equipo',
            on: { click: options.onDiscard },
          }),
        ])
      : null,
  ]);
}

/**
 * Bloque de publicacion.
 *
 * La clave de edicion NO se comprueba aqui: viaja al servidor, que es quien la
 * valida. Comprobarla en el navegador seria inutil, porque cualquiera puede ver
 * y cambiar lo que corre en su propia pagina.
 */
function renderPublish(options, message) {
  const key = el('input', {
    type: 'password',
    id: 'edit-key',
    class: 'field',
    value: options.editKey || '',
    placeholder: 'Clave de edición',
    autocomplete: 'off',
  });

  // Otra sede publico mientras tanto: hay que recargar para no pisar su trabajo.
  if (options.needsReload) {
    return el('div', { class: 'settings__publish' }, [
      el('p', {
        class: 'settings__warning settings__warning--strong',
        text: 'Otro equipo publicó cambios. Recarga la página para ver su versión antes de volver a publicar.',
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        text: 'Recargar ahora',
        on: { click: () => window.location.reload() },
      }),
    ]);
  }

  const button = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: 'Publicar para todas las sedes',
    disabled: !options.changes.dirty,
    on: {
      click: async () => {
        if (!key.value.trim()) {
          message.textContent = 'Escribe la clave de edición para publicar.';
          message.classList.add('is-error');
          return;
        }

        button.disabled = true;
        button.textContent = 'Publicando…';
        message.classList.remove('is-error');
        message.textContent = '';

        const result = await options.onPublish(key.value.trim());

        button.textContent = 'Publicar para todas las sedes';
        button.disabled = !options.changes.dirty;

        if (!result.ok) {
          message.textContent = result.message;
          message.classList.add('is-error');
          announce(result.message, 'assertive');
          return;
        }

        message.textContent = `Publicado. ${result.value.count} recetas disponibles en todas las sedes.`;
      },
    },
  });

  return el('div', { class: 'settings__publish' }, [
    el('label', { class: 'label', for: 'edit-key', text: 'clave de edición' }),
    el('div', { class: 'settings__publish-row' }, [key, button]),
    message,
    el('p', {
      class: 'settings__help',
      text: 'Al publicar, los cambios quedan disponibles al instante en todas las sedes y se guardan en el historial.',
    }),
  ]);
}

/**
 * Resumen de lo que este equipo tiene sin publicar.
 */
function renderChanges(changes) {
  if (!changes.dirty) {
    return el('p', { class: 'settings__ok', text: 'Este equipo está igual que la versión publicada.' });
  }

  // Sin haber podido leer la version publicada no hay contra que comparar, asi
  // que se dice eso en lugar de inventar un recuento.
  if (changes.unknown) {
    return el('p', {
      class: 'settings__warning',
      text: 'Este equipo tiene cambios sin publicar, pero no se pudo leer la versión publicada para compararlos. Vuelve a intentarlo con conexión.',
    });
  }

  const partes = [];
  if (changes.added) partes.push(`${changes.added} nueva${changes.added === 1 ? '' : 's'}`);
  if (changes.modified) partes.push(`${changes.modified} modificada${changes.modified === 1 ? '' : 's'}`);
  if (changes.removed) partes.push(`${changes.removed} eliminada${changes.removed === 1 ? '' : 's'}`);
  if (changes.catalogChanged) partes.push('catálogo de ingredientes');

  return el('div', null, [
    el('p', {
      class: 'settings__warning',
      text: `Cambios sin publicar en este equipo: ${partes.join(', ')}.`,
    }),
    changes.conflict
      ? el('p', {
          class: 'settings__warning settings__warning--strong',
          text: 'Además se publicó una versión nueva del recetario. Si descartas los cambios de este equipo, se perderán.',
        })
      : null,
  ]);
}

/* ===========================================================================
 *  2. REVISION DE DATOS
 * ======================================================================== */

/**
 * Lista los valores del recetario que merecen una segunda mirada.
 *
 * NO corrige nada ni propone un valor concreto: decidir cuanto chocolate lleva
 * una torta es del negocio. Lo unico que hace es poner delante lo que se sale
 * del patron, con un enlace para ir a esa receta y mirarla.
 *
 * Un hallazgo no es un error confirmado, es una anomalia. Por eso el texto
 * habla siempre de "revisar" y no hay ningun boton que cambie datos.
 *
 * @param {Array} recipes recetario completo
 * @param {() => void} onClose para cerrar Ajustes al ir a una receta
 * @returns {HTMLElement}
 */
function renderAuditBlock(recipes, onClose) {
  const hallazgos = revisar(recipes || []);
  const cuenta = resumen(hallazgos);

  if (cuenta.total === 0) {
    return el('section', { class: 'settings__row' }, [
      el('h3', { class: 'section-label', text: 'Revisión de datos' }),
      el('p', { class: 'settings__ok', text: 'No se encontró ningún valor fuera de lo normal.' }),
    ]);
  }

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Revisión de datos' }),

    el('p', { class: 'settings__count' }, [
      el('strong', { text: String(cuenta.total) }),
      cuenta.total === 1 ? ' valor por revisar.' : ' valores por revisar.',
    ]),

    el('ul', { class: 'audit' }, hallazgos.map((h) => renderHallazgo(h, onClose))),

    el('p', {
      class: 'settings__help',
      text: 'Son valores que se salen del patrón, no errores confirmados: una receta puede ser legítimamente distinta. El sistema no cambia nada por su cuenta.',
    }),
  ]);
}

/**
 * Un hallazgo de la revision.
 *
 * @param {object} hallazgo
 * @param {() => void} onClose
 * @returns {HTMLElement}
 */
function renderHallazgo(hallazgo, onClose) {
  return el('li', { class: 'audit__item', attrs: { 'data-gravedad': hallazgo.gravedad } }, [
    el('div', { class: 'audit__head' }, [
      el('span', { class: 'audit__tipo', text: hallazgo.tipo }),
      el('span', { class: 'audit__gravedad', text: hallazgo.gravedad }),
    ]),

    el('p', { class: 'audit__detalle', text: hallazgo.detalle }),
    el('p', { class: 'audit__sugerencia', text: hallazgo.sugerencia }),

    el('button', {
      type: 'button',
      class: 'btn-link audit__ir',
      text: 'Ver ' + hallazgo.recetaNombre,
      on: {
        click: () => {
          navigate({ name: 'detail', id: hallazgo.recetaId });
          onClose();
        },
      },
    }),
  ]);
}

/* ===========================================================================
 *  3. USUARIOS
 * ======================================================================== */

/**
 * Alta y baja de las personas que pueden entrar en este equipo.
 *
 * Los usuarios son de cada aparato: crear uno aqui no lo crea en la otra sede.
 * Se dice de forma explicita para que nadie lo suponga.
 */
function renderUsersBlock() {
  const message = el('p', { class: 'form-note', attrs: { role: 'status' } });
  const list = el('ul', { class: 'users' });

  const name = el('input', { type: 'text', id: 'user-name', class: 'field', autocomplete: 'off' });
  const pass = el('input', { type: 'password', id: 'user-pass', class: 'field', autocomplete: 'new-password' });
  const pass2 = el('input', { type: 'password', id: 'user-pass2', class: 'field', autocomplete: 'new-password' });

  /** Repinta la lista de usuarios dados de alta. */
  function drawList() {
    clear(list);
    const yo = currentUser().toLowerCase();

    for (const user of listUsers()) {
      const esYo = user.name.toLowerCase() === yo;

      list.appendChild(
        el('li', { class: 'users__item' }, [
          el('span', { class: 'users__name', text: user.name }),
          esYo ? el('span', { class: 'users__tag', text: 'tú' }) : null,

          // No se ofrece quitar el usuario propio ni el ultimo que queda.
          esYo || listUsers().length <= 1
            ? null
            : el('button', {
                type: 'button',
                class: 'btn-icon',
                text: '×',
                attrs: { 'aria-label': `Quitar el acceso de ${user.name}` },
                on: {
                  click: () => {
                    const result = removeUser(user.name);
                    if (!result.ok) {
                      showError(result.message);
                      return;
                    }
                    message.classList.remove('is-error');
                    message.textContent = `Se quitó el acceso de ${user.name}.`;
                    announce(`Acceso de ${user.name} retirado.`);
                    drawList();
                  },
                },
              }),
        ]),
      );
    }
  }

  function showError(text) {
    message.textContent = text;
    message.classList.add('is-error');
    announce(text, 'assertive');
  }

  const add = async () => {
    const result = await createUser(name.value, pass.value, pass2.value);

    if (!result.ok) {
      showError(result.message);
      return;
    }

    message.classList.remove('is-error');
    message.textContent = `Usuario ${result.value} creado en este equipo.`;
    announce(`Usuario ${result.value} creado.`);
    name.value = '';
    pass.value = '';
    pass2.value = '';
    drawList();
  };

  drawList();

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Quién puede entrar' }),
    list,

    el('div', { class: 'settings__grid settings__grid--3' }, [
      el('div', null, [el('label', { class: 'label', for: 'user-name', text: 'nombre' }), name]),
      el('div', null, [el('label', { class: 'label', for: 'user-pass', text: 'clave' }), pass]),
      el('div', null, [el('label', { class: 'label', for: 'user-pass2', text: 'repetir' }), pass2]),
    ]),

    el('div', { class: 'settings__actions' }, [
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Crear usuario', on: { click: add } }),
      message,
    ]),

    el('p', {
      class: 'settings__help',
      text: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Los usuarios son de este equipo: para que alguien entre desde la otra sede, hay que crearlo también allí.`,
    }),
  ]);
}

/* ===========================================================================
 *  4. MI CLAVE
 * ======================================================================== */

/**
 * Cambio de clave del usuario que tiene la sesion abierta.
 *
 * Pide la clave actual antes de dejar cambiarla: si alguien deja la sesion
 * abierta, que otro no pueda quedarse con el acceso.
 */
function renderPasswordBlock() {
  const message = el('p', { class: 'form-note', attrs: { role: 'status' } });

  const current = el('input', { type: 'password', id: 'pwd-current', class: 'field', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', id: 'pwd-new', class: 'field', autocomplete: 'new-password' });
  const confirmation = el('input', { type: 'password', id: 'pwd-confirm', class: 'field', autocomplete: 'new-password' });

  const apply = async () => {
    const result = await changePassword(currentUser(), current.value, next.value, confirmation.value);

    if (!result.ok) {
      message.textContent = result.message;
      message.classList.add('is-error');
      announce(result.message, 'assertive');
      return;
    }

    message.classList.remove('is-error');
    message.textContent = 'Clave actualizada.';
    announce('Clave actualizada.');
    current.value = '';
    next.value = '';
    confirmation.value = '';
  };

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Mi clave' }),

    el('div', { class: 'settings__grid settings__grid--3' }, [
      el('div', null, [el('label', { class: 'label', for: 'pwd-current', text: 'clave actual' }), current]),
      el('div', null, [el('label', { class: 'label', for: 'pwd-new', text: 'clave nueva' }), next]),
      el('div', null, [el('label', { class: 'label', for: 'pwd-confirm', text: 'repetir' }), confirmation]),
    ]),

    el('div', { class: 'settings__actions' }, [
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Cambiar clave', on: { click: apply } }),
      message,
    ]),

    el('p', {
      class: 'settings__help',
      text: 'La clave protege frente a miradas casuales sobre el mostrador. Quien tenga el enlace puede ver el contenido igualmente: lo que de verdad protege el recetario es la clave de edición.',
    }),
  ]);
}
