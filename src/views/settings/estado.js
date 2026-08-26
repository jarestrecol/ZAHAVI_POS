/**
 * =============================================================================
 *  AJUSTES · ESTADO DEL RECETARIO Y PUBLICACION
 * =============================================================================
 *
 *  Cuantas recetas hay, que version esta publicada, si este equipo tiene
 *  cambios que las demas sedes todavia no ven, y la salida para mandarlos.
 *
 *  Va todo junto porque es una sola pregunta con dos mitades: que hay, y que
 *  falta por salir. Separarlas obligaria a leer dos bloques para saber si se
 *  puede cerrar el turno.
 */

import { el } from '../../lib/dom.js';

/* ===========================================================================
 *  1. ESTADO Y PUBLICACION
 * ======================================================================== */

export function renderStatusBlock(options) {

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
