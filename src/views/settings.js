/**
 * =============================================================================
 *  AJUSTES
 * =============================================================================
 *
 *  Dos bloques, en este orden:
 *
 *      1. ESTADO Y PUBLICACION
 *         Cuantas recetas hay, que version esta publicada y si este equipo tiene
 *         cambios que las demas sedes todavia no ven. Desde aqui se publica.
 *
 *      2. LA CLAVE DE ESTE EQUIPO
 *         Cambiarla, y saber que alcanza solo a este aparato.
 *
 *  LO QUE NO ESTA, Y POR QUE
 *  -------------------------
 *  No hay descarga del recetario ni carga de archivos. Sacar una copia completa
 *  de las formulas a un archivo suelto es justo lo que no debe poder hacerse
 *  desde el mostrador. La copia de seguridad de verdad es el historial del
 *  repositorio: cada publicacion queda guardada ahi y se puede recuperar
 *  cualquier version anterior.
 */

import { el } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import {
  changePassword,
  signOut,
  MIN_PASSWORD_LENGTH,
} from '../core/access.js';
import { setState } from '../core/store.js';
import { APP_VERSION } from '../core/version.js';
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
 * @param {{state: string, readAt: Date|null}} options.server diagnostico del servidor
 * @param {{motivo: string, texto: string, pendiente: boolean}} options.sync publicacion automatica
 * @param {(password: string) => Promise<object>} options.onPublish
 * @param {() => void} options.onDiscard
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openSettings(options) {
  const body = el('div', { class: 'settings' }, [
    renderStatusBlock(options),
    renderDiagnosisBlock(options),
    renderPasswordBlock(),
  ]);

  return createWindow({
    title: 'Ajustes',
    // La version, en la barra de titulo de Ajustes: es la primera pregunta
    // cuando alguien llama diciendo que su pantalla no se parece a la de la
    // otra sede, y asi se lee sin abrir nada.
    meta: `zahavi · recetario v${APP_VERSION}`,
    size: 'narrow',
    onClose: options.onClose,
    body,
    footer: [
      // Aqui decia "Sesion abierta en este equipo", que solo constataba que se
      // esta mirando la aplicacion. El mismo hueco trabaja en las otras dos
      // ventanas: la de publicar avisa de lo que pasa si no se publica, y la de
      // la clave dice que consultar no la necesita. Vacio es mas honesto que
      // relleno, asi que se deja el hueco para cuando haya algo que decir.
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
              // hasta que alguien vuelva a entrar con la clave.
              setState({ authed: false, settingsOpen: false });
            },
          },
        }),
        // Cerrar va en el tratamiento apagado, no en el de tinta. Era el boton
        // con MAS peso visual de la ventana y no hace nada que no hagan ya la
        // equis de la barra, Escape y el clic fuera. Segun el propio sistema de
        // diseño, el relleno de tinta es "el avance dentro de un flujo", y
        // descartar no lo es.
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
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

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Estado del recetario' }),

    // Un solo recuento en vez de dos lineas que repetian la misma cifra.
    //
    // Y ya no se llama "version" a la marca de la ultima publicacion: la barra
    // de titulo de esta misma ventana dice `v1.5.0` a cuatrocientos pixeles de
    // aqui, y eran dos cosas distintas con el mismo nombre.
    el('p', { class: 'settings__count' }, [
      el('strong', { text: String(options.recipeCount) }),
      options.recipeCount === 1 ? ' receta' : ' recetas',
      options.withMethod > 0
        ? `, ${options.withMethod} con el método escrito.`
        : '. Ninguna tiene el método escrito todavía.',
    ]),

    options.revision
      ? el('p', { class: 'settings__help', text: `Última publicación: ${options.revision}.` })
      : null,

    renderChanges(options.changes),

    // El bloque de publicar solo aparece si este sitio tiene la funcion de
    // servidor activa. Sin ella no hay a donde publicar.
    options.canPublish ? renderPublish(options) : null,

    // Aqui iba un aviso de "este sitio no tiene publicacion compartida". Se
    // retiro porque el bloque de Conexion, doscientos pixeles mas abajo, ya lo
    // dice DOS veces: en "Recetario compartido" y en "Publicacion automatica".
    // Tres formas de decir lo mismo en la misma pantalla no informan mas.

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

/* ===========================================================================
 *  1b. DIAGNOSTICO
 * ======================================================================== */

/**
 * Estado real del enlace con el recetario compartido.
 *
 * EXISTE PARA CONTESTAR UNA SOLA PREGUNTA: "no me guarda, ¿que pasa?". Antes,
 * responderla obligaba a abrir las herramientas del navegador y mirar si la
 * peticion a `/api/recipes` contestaba, algo que no puede hacer quien esta
 * detras del mostrador. Cuatro lineas evitan esa llamada de telefono.
 *
 * Se muestra tal cual, sin suavizarlo: si este equipo no publica, hay que
 * poder leerlo aqui en una linea.
 */
function renderDiagnosisBlock(options) {
  const server = options.server || { state: 'desconocido', readAt: null };
  const sync = options.sync || { motivo: '', texto: '' };

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Conexión' }),

    el('dl', { class: 'diag' }, [
      ...linea('Recetario compartido', estadoDelServidor(server.state)),
      ...linea('Última lectura', horaCorta(server.readAt)),
      ...linea('Publicación automática', estadoDeLaPublicacion(options, sync)),
      // "Sin conexion: Listo" era la peor linea de la ventana: la etiqueta
      // nombra una averia y el valor una preparacion, asi que el par entero se
      // leia como "no tiene usted conexion". Lo que describe es una capacidad.
      ...linea('Uso sin señal', modoSinConexion()),
    ]),

    // El texto exacto del servidor, cuando lo hay. Es lo que convierte
    // "responde con error" en algo que se puede arreglar: dice si faltan las
    // variables de entorno, si el token no tiene permiso o si la rama no
    // existe. Va debajo de la tabla y no dentro, porque es una frase entera.
    server.error
      ? el('p', { class: 'diag__error', attrs: { role: 'status' } }, [
          el('strong', { text: 'El servidor responde: ' }),
          server.error,
        ])
      : null,

    sync.texto ? el('p', { class: 'settings__help', text: sync.texto }) : null,
  ]);
}

/**
 * Una fila del diagnostico.
 *
 * @param {string} etiqueta
 * @param {string} valor
 * @returns {Array<HTMLElement>}
 */
function linea(etiqueta, valor) {
  return [
    el('div', { class: 'diag__row' }, [
      el('dt', { class: 'diag__label', text: etiqueta }),
      el('dd', { class: 'diag__value', text: valor }),
    ]),
  ];
}

function estadoDelServidor(estado) {
  switch (estado) {
    case 'ok':
      return 'Conectado';
    case 'sin_api':
      // "Sitio" aqui es el despliegue, pero en la panaderia un sitio es una
      // sede: quien lee esto en Panaderia entiende "no disponible en esta sede".
      return 'No configurado';
    case 'error':
      return 'Responde con error';
    case 'sin_red':
      return 'Sin conexión';
    default:
      return 'Sin comprobar';
  }
}

function estadoDeLaPublicacion(options, sync) {
  if (!options.canPublish) return 'No disponible';
  if (sync.motivo === 'sin_clave') return 'Pendiente de la primera publicación';
  if (sync.motivo === 'clave') return 'Detenida: la clave dejó de valer';
  if (sync.motivo === 'conflicto') return 'Detenida: hay que recargar';
  if (sync.motivo === 'conflicto_version') return 'Detenida: hay dos versiones';
  if (sync.pendiente) return 'Pendiente de conexión';
  return 'Activa';
}

/**
 * Si este equipo puede abrir el recetario sin señal.
 *
 * `controller` es la prueba de que el service worker no solo esta registrado,
 * sino sirviendo ya esta pagina: registrado pero sin controlar todavia significa
 * que hoy, sin red, no habria recetario.
 */
function modoSinConexion() {
  if (!('serviceWorker' in navigator)) return 'No disponible en este navegador';
  return navigator.serviceWorker.controller ? 'Listo' : 'Se activa al recargar';
}

function horaCorta(fecha) {
  if (!(fecha instanceof Date)) return 'Todavía no';
  // `'es'` a secas, igual que la fecha de las hojas impresas (`views/print.js`):
  // el recetario esta en español de principio a fin y no depende de la region
  // que tenga configurada cada equipo.
  return fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

/* ===========================================================================
 *  1c. PUBLICAR
 * ======================================================================== */

/**
 * Bloque de publicacion.
 *
 * La clave de edicion NO se comprueba aqui: viaja al servidor, que es quien la
 * valida. Comprobarla en el navegador seria inutil, porque cualquiera puede ver
 * y cambiar lo que corre en su propia pagina.
 */
/**
 * La salida manual cuando la publicacion automatica no basto.
 *
 * AQUI HABIA UN FORMULARIO CON SU PROPIO CAMPO DE CLAVE, y era la unica via para
 * publicar. Por eso en toda la vida del recetario no se publico ni una vez:
 * nadie descubria que habia que entrar en Ajustes a escribir una segunda clave.
 *
 * Ya no hace falta. Crear, modificar y eliminar piden la clave antes de tocar la
 * receta, y despues se publica solo. Para llegar hasta aqui hay que haberla
 * escrito hace un momento, asi que pedirla otra vez no protege nada: solo era
 * un tercer sitio donde equivocarse, con la misma clave.
 *
 * Y el campo tenia un problema propio: se rellenaba con `options.editKey`, o sea
 * que dejaba la clave de edicion del dia escrita en el DOM de un equipo del
 * mostrador. Justo lo contrario de lo que se decidio al montar la puerta: que la
 * clave guardada NO es un permiso.
 *
 * Lo que si sigue haciendo falta es el BOTON. Es la unica forma de sacar un
 * cambio guardado ayer cuando hoy nadie va a volver a editar: al arrancar nadie
 * intenta publicar, y sin editar de nuevo eso se queda en el equipo. Ademas el
 * aviso de la cabecera dice "Publicar" y trae aqui; sin boton, lo unico que se
 * encontraria sobre el trabajo pendiente seria "Descartar".
 *
 * @param {object} options
 * @returns {HTMLElement|null}
 */
function renderPublish(options) {
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

  // Sin cambios pendientes no hay nada que publicar, y un boton apagado sin
  // explicacion es peor que ningun boton.
  if (!options.changes.dirty) return null;

  return el('div', { class: 'settings__publish' }, [
    el('button', {
      type: 'button',
      class: 'btn btn--accent',
      text: 'Publicar ahora',
      on: { click: options.onPedirClave },
    }),
    el('p', {
      class: 'settings__help',
      text: 'Normalmente no hace falta: cada cambio guardado sale solo hacia las demás sedes. Esto es para cuando quedó algo sin enviar.',
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
 *  2. LA CLAVE DE ESTE EQUIPO
 * ======================================================================== */

/**
 * Cambio de la clave del equipo, con los dias que le quedan a la vista.
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
    const result = await changePassword(current.value, next.value, confirmation.value);

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
    el('h3', { class: 'section-label', text: 'Clave de acceso · una cortina, no una cerradura' }),

    // DONDE VIVE ESTA CLAVE, dicho en la pantalla donde se cambia y no solo en
    // el manual. Cambiarla aqui no la cambia en la tableta del obrador, y eso
    // hay que saberlo ANTES de cambiarla, no despues de que la otra sede llame
    // preguntando por que no entra.
    el('p', { class: 'settings__count' }, [
      el('strong', { text: 'Esta clave es de este aparato.' }),
      ' Cambiarla aquí no la cambia en los demás equipos.',
    ]),

    el('div', { class: 'settings__grid' }, [
      el('div', null, [el('label', { class: 'label', for: 'pwd-current', text: 'clave actual' }), current]),
      // La regla del campo va PEGADA al campo. Estaba en la ultima frase de un
      // parrafo debajo del boton, asi que se leia despues de que el error ya la
      // hubiera dicho.
      el('div', null, [
        el('label', { class: 'label', for: 'pwd-new', text: 'clave nueva' }),
        next,
        el('p', {
          class: 'settings__pista',
          text: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres, distinta de la actual.`,
        }),
      ]),
      el('div', null, [el('label', { class: 'label', for: 'pwd-confirm', text: 'repetir la nueva' }), confirmation]),
    ]),

    el('div', { class: 'settings__actions' }, [
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Cambiar clave', on: { click: apply } }),
      message,
    ]),

    el('p', {
      class: 'settings__help',
      text: 'No caduca. La panadería puede retirarla desde el servidor: entonces todos los equipos piden una nueva en la siguiente carga.',
    }),

    // Aqui iba una nota sobre el modelo de amenaza, y era el ultimo texto de la
    // ventana: explicaba que esta clave es una cortina y remataba señalando a la
    // clave de edicion, que desde hoy ya no vive en esta pantalla. Su sitio es
    // `docs/SEGURIDAD.md`; la idea que valia la pena conservar cabe en el titulo
    // de la seccion.
  ]);
}
