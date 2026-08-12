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
      return { ok: false, code: 'sin_api', message: 'Este sitio no tiene recetario compartido.' };
    }
    if (!response.ok) {
      // El servidor existe pero no pudo entregar: no hay sha, asi que no se
      // puede publicar aunque la API responda.
      available = true;
      currentSha = null;
      return { ok: false, code: 'servidor', message: 'El servidor no pudo entregar el recetario.' };
    }

    const data = await response.json();
    if (!Array.isArray(data.recipes) || typeof data.sha !== 'string') {
      available = true;
      currentSha = null;
      return { ok: false, code: 'formato', message: 'El servidor devolvió un recetario ilegible.' };
    }

    available = true;
    currentSha = data.sha;
    staleSinceConflict = false;

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

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('tiempo agotado')), TIMEOUT_MS)),
  ]);
}
