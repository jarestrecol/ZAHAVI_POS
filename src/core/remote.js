/**
 * Acceso al recetario compartido del servidor.
 *
 * Cuando la aplicacion corre en Vercel existe `/api/recipes`, que lee y escribe
 * el archivo del repositorio: eso es lo que hace que la panaderia y la casa de
 * produccion vean lo mismo. Cuando no existe (archivo local, o servidor
 * estatico sin funciones) todo sigue funcionando contra el archivo publicado y
 * el almacenamiento del equipo.
 *
 * Todos los resultados usan la misma forma que el resto del nucleo:
 * `{ok: true, value}` o `{ok: false, code, message}`.
 */

const ENDPOINT = './api/recipes';

/** Clave de edicion guardada para la sesion del navegador. */
const KEY_STORAGE = 'zahavi_edit_key';

/** Milisegundos antes de dar por perdida una peticion. */
const TIMEOUT_MS = 12000;

/** Indica si el servidor ofrece el recetario compartido. */
let available = false;

/**
 * Ultimo resultado de hablar con el servidor, para poder decirlo en Ajustes.
 *
 * `available` solo distingue "hay servidor" de "no lo hay", y eso no basta para
 * diagnosticar: una funcion mal configurada y una caida de red se veian igual
 * desde fuera, y las dos acaban en "no me guarda".
 *
 *   desconocido  todavia no se ha intentado leer
 *   ok           el servidor respondio y entrego el recetario
 *   sin_api      este sitio no tiene la funcion: no hay a donde publicar
 *   error        la funcion existe pero fallo (variables sin poner, token
 *                caducado, GitHub caido)
 *   sin_red      no se pudo llegar al servidor
 *
 * @type {'desconocido'|'ok'|'sin_api'|'error'|'sin_red'}
 */
let serverState = 'desconocido';

/** Momento de la ultima lectura correcta, en hora local. @type {Date|null} */
let lastReadAt = null;

/**
 * sha del archivo leido. Sin el no se puede publicar: es lo que permite al
 * servidor detectar que otro equipo escribio entre medias.
 * @type {string|null}
 */
let currentSha = null;

/**
 * Se pone cuando el servidor rechaza por conflicto. Mientras siga en pie no se
 * puede volver a publicar: hay que recargar y aplicar los cambios sobre la
 * version nueva. Sin esto, un segundo clic en Publicar borraba el trabajo de la
 * otra sede.
 */
let staleSinceConflict = false;

/**
 * Indica si se puede publicar ahora mismo. Hace falta que el servidor responda,
 * que se haya leido el archivo (de ahi sale el sha) y que no haya un conflicto
 * pendiente de resolver.
 *
 * @returns {boolean}
 */
export function canPublish() {
  return available && currentSha !== null && !staleSinceConflict;
}

/**
 * Indica si hay un conflicto que obliga a recargar antes de publicar.
 * @returns {boolean}
 */
export function needsReload() {
  return staleSinceConflict;
}

/**
 * Diagnostico de la conexion con el recetario compartido.
 *
 * Existe para que Ajustes pueda contestar en una linea a "no me guarda" sin
 * abrir las herramientas del navegador.
 *
 * @returns {{state: string, readAt: Date|null, hasReference: boolean, conflict: boolean}}
 */
export function serverStatus() {
  return {
    state: serverState,
    readAt: lastReadAt,
    hasReference: currentSha !== null,
    conflict: staleSinceConflict,
  };
}

/**
 * Clave de edicion guardada en este navegador, si la hay.
 * @returns {string}
 */
export function getEditKey() {
  try {
    return window.sessionStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/**
 * Guarda la clave de edicion para no volver a pedirla en esta sesion.
 * @param {string} value
 */
export function setEditKey(value) {
  try {
    if (value) window.sessionStorage.setItem(KEY_STORAGE, value);
    else window.sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* sin almacenamiento de sesion: se pedira cada vez */
  }
}

/**
 * Lee el recetario compartido.
 *
 * @returns {Promise<{ok: true, value: {recipes: Array, ingredientes: Array, revision: string, sha: string}} | {ok: false, code: string, message: string}>}
 */
export async function fetchShared() {
  try {
    const response = await withTimeout(fetch(ENDPOINT, { cache: 'no-store' }));

    if (response.status === 404 || response.status === 405) {
      available = false;
      serverState = 'sin_api';
      descartarCuerpo(response);
      return { ok: false, code: 'sin_api', message: 'Este sitio no tiene recetario compartido.' };
    }
    if (!response.ok) {
      // El servidor existe pero no pudo entregar: no hay sha, asi que no se
      // puede publicar aunque la API responda.
      available = true;
      currentSha = null;
      serverState = 'error';
      descartarCuerpo(response);
      return { ok: false, code: 'servidor', message: 'El servidor no pudo entregar el recetario.' };
    }

    const data = await response.json();
    if (!Array.isArray(data.recipes) || typeof data.sha !== 'string') {
      available = true;
      currentSha = null;
      serverState = 'error';
      return { ok: false, code: 'formato', message: 'El servidor devolvió un recetario ilegible.' };
    }

    available = true;
    currentSha = data.sha;
    staleSinceConflict = false;
    serverState = 'ok';
    lastReadAt = new Date();

    return {
      ok: true,
      value: {
        recipes: data.recipes,
        ingredientes: Array.isArray(data.ingredientes) ? data.ingredientes : [],
        revision: typeof data.revision === 'string' ? data.revision : '',
        sha: data.sha,
      },
    };
  } catch {
    serverState = 'sin_red';
    return { ok: false, code: 'sin_red', message: 'Sin conexión con el servidor.' };
  }
}

/**
 * Publica el recetario para todas las sedes.
 *
 * @param {{recipes: Array, ingredientes: Array, password: string, author?: string}} payload
 * @returns {Promise<{ok: true, value: {revision: string, count: number}} | {ok: false, code: string, message: string}>}
 */
export async function publishShared(payload) {
  if (currentSha === null) {
    return {
      ok: false,
      code: 'sin_referencia',
      message: 'Vuelve a cargar el recetario antes de publicar.',
    };
  }
  if (staleSinceConflict) {
    return {
      ok: false,
      code: 'recarga',
      message: 'Otro equipo publicó cambios. Recarga la página antes de volver a publicar.',
    };
  }

  try {
    const response = await withTimeout(
      fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: payload.password,
          recipes: payload.recipes,
          ingredientes: payload.ingredientes,
          author: payload.author,
          sha: currentSha,
        }),
      }),
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      return { ok: false, code: 'clave', message: data.error || 'Clave de edición incorrecta.' };
    }
    if (response.status === 409) {
      // No se adopta el sha del servidor: hacerlo permitia que un segundo clic
      // publicara encima del trabajo ajeno. Hay que recargar.
      staleSinceConflict = true;
      return {
        ok: false,
        code: 'conflicto',
        message: data.error || 'Otro equipo publicó antes. Recarga la página para ver su versión.',
      };
    }
    if (!response.ok) {
      return { ok: false, code: 'servidor', message: data.error || 'No se pudo publicar.' };
    }

    if (typeof data.sha === 'string') currentSha = data.sha;
    return { ok: true, value: { revision: data.revision || '', count: data.count || 0 } };
  } catch {
    return { ok: false, code: 'red', message: 'Sin conexión con el servidor. Inténtalo de nuevo.' };
  }
}

/**
 * Cierra el cuerpo de una respuesta que no se va a leer.
 *
 * Sin esto la peticion queda abierta hasta que el navegador la recoja por su
 * cuenta: nadie consume el flujo, y con `Cache-Control: no-store` -que es lo
 * que declara `/api/` en produccion- tampoco lo vacia la cache. No se pierde
 * nada visible, pero la conexion sigue ocupada y cualquier medida de "la pagina
 * termino de cargar" se queda esperando para siempre.
 *
 * @param {Response} response
 */
function descartarCuerpo(response) {
  try {
    // `cancel` devuelve una promesa: si se rechazara sin capturar, la red de
    // seguridad del arranque (`salvavidas.js`) lo tomaria por un fallo grave y
    // taparia el recetario con un aviso, que es justo lo contrario de lo que
    // esta funcion pretende.
    if (response.body && !response.bodyUsed) response.body.cancel().catch(() => {});
  } catch {
    /* navegador que no lo permite: se deja que lo recoja el */
  }
}

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('tiempo agotado')), TIMEOUT_MS)),
  ]);
}
