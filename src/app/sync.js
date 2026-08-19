/**
 * =============================================================================
 *  PUBLICACION AUTOMATICA
 * =============================================================================
 *
 *  EL PROBLEMA QUE RESUELVE
 *  ------------------------
 *  Guardar y publicar son dos gestos distintos, y esa separacion es deliberada
 *  (ver `core/repository.js`). Pero tiene un fallo humano evidente: alguien
 *  edita quince recetas durante tres semanas, no pulsa Publicar ni una vez, y
 *  la otra sede sigue trabajando con formulas viejas sin que nadie lo note.
 *  Cambiar el navegador, limpiar los datos del sitio o estrenar equipo, y ese
 *  trabajo desaparece.
 *
 *  LO QUE HACE
 *  -----------
 *  Tras cada guardado o borrado, si se puede publicar, se publica solo. Si no
 *  se puede, el cambio queda donde estaba y se reintenta cuando vuelva la
 *  conexion. El boton de Publicar de Ajustes sigue existiendo y sigue siendo
 *  la via manual: esto no lo sustituye, lo adelanta.
 *
 *  LO QUE NO HACE, Y POR QUE
 *  -------------------------
 *  No escribe en el servidor durante la edicion, solo al terminar de guardar.
 *  Y nunca convierte la conexion en un requisito: sin red se guarda igual en el
 *  equipo, que es lo que permite seguir trabajando cuando en el obrador no hay
 *  señal. Ese es el motivo de que esto sea una sincronizacion y no un guardado
 *  contra un servidor.
 *
 *  LA CLAVE
 *  --------
 *  Publicar necesita la clave de edicion, y esa clave vive solo en la sesion
 *  del navegador (`sessionStorage`), nunca en el disco: ver `core/remote.js`.
 *  Consecuencia directa y buscada: la primera publicacion de cada sesion se
 *  hace a mano, y a partir de ahi el equipo publica solo. Guardarla de forma
 *  permanente evitaria ese paso, pero dejaria la llave del repositorio en un
 *  equipo del mostrador.
 */

import * as repo from '../core/repository.js';
import { setState, notify } from '../core/store.js';
import { getEditKey, setEditKey } from '../core/remote.js';
import { announce } from '../lib/a11y.js';

/**
 * Espera antes de reintentar tras un fallo de red.
 *
 * El evento `online` es la señal principal, pero no siempre llega: el navegador
 * lo emite cuando recupera interfaz de red, no cuando el servidor vuelve a
 * responder. Este temporizador cubre ese hueco.
 */
const REINTENTO_MS = 20000;

/** Hay una publicacion en marcha: no se lanza otra encima. */
let enCurso = false;

/** Quedaron cambios sin publicar por un motivo que puede resolverse solo. */
let pendiente = false;

/**
 * Por que no se publico la ultima vez. Es lo que la interfaz muestra.
 * @type {'' | 'sin_cambios' | 'sin_servidor' | 'sin_clave' | 'sin_red' | 'conflicto' | 'clave'}
 */
let motivo = '';

/** Temporizador de reintento en marcha, si lo hay. */
let temporizador = null;

/**
 * Arranca la sincronizacion.
 *
 * Se llama una sola vez, al terminar el arranque. A partir de ahi la vuelta de
 * la conexion dispara el reintento de lo que quedara pendiente.
 */
export function iniciarSincronizacion() {
  window.addEventListener('online', () => {
    if (pendiente) publicarEnSegundoPlano();
  });
}

/**
 * Estado de la sincronizacion, para que la interfaz pueda explicarlo.
 *
 * @returns {{enCurso: boolean, pendiente: boolean, motivo: string, texto: string}}
 */
export function estadoSincronizacion() {
  return { enCurso, pendiente, motivo, texto: explicar(motivo) };
}

/**
 * Indica si el proximo guardado va a publicarse solo.
 *
 * Lo usa el mensaje que se muestra al guardar: decir "guardada en este equipo"
 * cuando el cambio sale hacia las demas sedes seria mentir, y decir "publicada"
 * cuando se queda en el equipo seria peor.
 *
 * @returns {boolean}
 */
export function sePuedePublicarSolo() {
  if (repo.localChanges().conflict) return false;
  return repo.canPublishToAll() && Boolean(getEditKey()) && navigator.onLine !== false;
}

/**
 * Traduce el motivo a algo que se pueda leer en pantalla.
 *
 * @param {string} codigo
 * @returns {string}
 */
export function explicar(codigo) {
  switch (codigo) {
    case 'sin_servidor':
      return 'Este equipo no está conectado al recetario compartido: lo que guardes se queda aquí.';
    case 'sin_clave':
      return 'Publica una vez desde Ajustes y, a partir de ahí, este equipo publicará solo.';
    case 'sin_red':
      return 'Sin conexión: se publicará en cuanto vuelva.';
    case 'conflicto':
      return 'Otro equipo publicó antes. Recarga la página para ver su versión.';
    case 'conflicto_version':
      return 'Otra sede publicó una versión nueva mientras este equipo tenía cambios. No se publica solo: hay que decidir en Ajustes cuál se conserva.';
    case 'clave':
      return 'La clave de edición dejó de valer. Publica desde Ajustes con la clave nueva.';
    default:
      return '';
  }
}

/**
 * Intenta publicar sin bloquear a quien esta trabajando.
 *
 * Se llama despues de guardar o borrar. No devuelve promesa a proposito: quien
 * guarda no debe esperar a que termine la publicacion para seguir usando el
 * recetario.
 */
export function publicarEnSegundoPlano() {
  publicar().catch(() => {
    // `publicar` ya traduce cualquier fallo a un motivo. Este catch solo evita
    // que un error inesperado quede como promesa sin capturar en la consola.
    pendiente = true;
  });
}

/**
 * Publica los cambios de este equipo si se dan las condiciones.
 *
 * @returns {Promise<{ok: boolean, code: string}>}
 */
async function publicar() {
  if (enCurso) return { ok: false, code: 'en_curso' };

  const cambios = repo.localChanges();
  if (!cambios.dirty) return terminar('sin_cambios', false);

  // OTRA SEDE PUBLICO MIENTRAS ESTE EQUIPO TENIA CAMBIOS.
  //
  // Aqui hay que parar, y es el freno mas importante de este modulo. Publicar
  // envia el recetario ENTERO de este equipo, y este equipo se quedo en la
  // version anterior: lo que la otra sede acaba de publicar no esta en el.
  // Como el servidor ya tiene la referencia nueva -se leyo al cargar-, no
  // rechazaria nada: aceptaria el envio y el trabajo ajeno desapareceria en
  // silencio.
  //
  // Esa decision no puede tomarla un automatismo, porque no hay respuesta
  // correcta general: hay que mirar las dos versiones y elegir. Se deja en
  // manos de quien esta delante, con el aviso de Ajustes.
  if (cambios.conflict) return terminar('conflicto_version', false);

  // Sin servidor no hay a donde publicar: es el caso del archivo abierto desde
  // el disco o de un despliegue sin las variables de entorno puestas.
  if (!repo.canPublishToAll()) {
    return terminar(repo.needsReloadBeforePublish() ? 'conflicto' : 'sin_servidor', false);
  }

  const clave = getEditKey();
  if (!clave) return terminar('sin_clave', false);

  if (navigator.onLine === false) return terminar('sin_red', true);

  enCurso = true;
  const resultado = await repo.publishToAll({ password: clave, author: 'recetario (automático)' });
  enCurso = false;

  if (resultado.ok) {
    // El estado tiene que refrescarse aunque las recetas no hayan cambiado: lo
    // que cambia es la referencia de lo publicado, y de ahi sale el aviso de
    // "cambios sin publicar" que debe desaparecer de la cabecera.
    setState({ recipes: repo.findAll(), ingredientes: repo.allIngredients() });
    notify('Publicado para todas las sedes.', 'success');
    announce('Cambios publicados.');
    return terminar('', false);
  }

  // La clave guardada dejo de valer: se borra para que se vuelva a pedir en vez
  // de reintentar en bucle con una clave que el servidor ya rechaza.
  if (resultado.code === 'clave') {
    setEditKey('');
    notify(explicar('clave'), 'error');
    return terminar('clave', false);
  }

  if (resultado.code === 'conflicto' || resultado.code === 'recarga') {
    notify(explicar('conflicto'), 'error');
    return terminar('conflicto', false);
  }

  // Red o servidor: se reintenta solo. No se avisa con un error porque no hay
  // nada que la persona pueda hacer, y el aviso de cambios sin publicar de la
  // cabecera ya deja constancia de que queda algo pendiente.
  return terminar('sin_red', true);
}

/**
 * Cierra un intento: guarda el motivo y programa el reintento si toca.
 *
 * @param {string} codigo
 * @param {boolean} reintentar
 * @returns {{ok: boolean, code: string}}
 */
function terminar(codigo, reintentar) {
  motivo = codigo;
  pendiente = reintentar;

  if (temporizador !== null) {
    window.clearTimeout(temporizador);
    temporizador = null;
  }

  if (reintentar) {
    temporizador = window.setTimeout(() => {
      temporizador = null;
      if (pendiente) publicarEnSegundoPlano();
    }, REINTENTO_MS);
  }

  return { ok: codigo === '', code: codigo };
}
