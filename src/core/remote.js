/**
 * Acceso al recetario compartido del servidor.
 *
 * Cuando la aplicacion corre en Vercel existe `/api/recipes`, que lee y escribe
 * el archivo del repositorio: eso es lo que hace que la panaderia y la casa de
 * produccion vean lo mismo. Cuando no existe (archivo local, o servidor
 * estatico sin funciones) todo sigue funcionando contra el archivo publicado y
 * el almacenamiento del equipo.
 */

const ENDPOINT = './api/recipes';

/** Clave de edicion guardada para la sesion del navegador. */
const KEY_STORAGE = 'zahavi_edit_key';

/** Milisegundos antes de dar por perdida una peticion. */
const TIMEOUT_MS = 12000;

/** Indica si el servidor ofrece el recetario compartido. Se descubre al arrancar. */
let available = false;

/**
 * sha del archivo que se leyo, necesario para publicar sin pisar a otro equipo.
 * @type {string|null}
 */
let currentSha = null;

/**
 * @returns {boolean}
 */
export function isRemoteAvailable() {
  return available;
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
 * @returns {Promise<{ok: true, value: {recipes: Array, ingredientes: Array, revision: string}} | {ok: false, error: string}>}
 */
export async function fetchShared() {
  try {
    const response = await withTimeout(fetch(ENDPOINT, { cache: 'no-store' }));
    if (response.status === 404 || response.status === 405) {
      available = false;
      return { ok: false, error: 'sin_api' };
    }
    if (!response.ok) {
      available = true;
      return { ok: false, error: 'El servidor no pudo entregar el recetario.' };
    }
    const data = await response.json();
    if (!Array.isArray(data.recipes)) {
      available = true;
      return { ok: false, error: 'El servidor devolvió un recetario ilegible.' };
    }
    available = true;
    currentSha = typeof data.sha === 'string' ? data.sha : null;
    return {
      ok: true,
      value: {
        recipes: data.recipes,
        ingredientes: Array.isArray(data.ingredientes) ? data.ingredientes : [],
        revision: typeof data.revision === 'string' ? data.revision : '',
      },
    };
  } catch {
    return { ok: false, error: 'sin_red' };
  }
}

/**
 * Publica el recetario para todas las sedes.
 *
 * @param {{recipes: Array, ingredientes: Array, password: string, author?: string}} payload
 * @returns {Promise<{ok: true, value: {revision: string, count: number}} | {ok: false, code: string, error: string}>}
 */
export async function publishShared(payload) {
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
      return { ok: false, code: 'clave', error: data.error || 'Clave de edición incorrecta.' };
    }
    if (response.status === 409) {
      if (typeof data.sha === 'string') currentSha = data.sha;
      return { ok: false, code: 'conflicto', error: data.error || 'Otro equipo publicó antes.' };
    }
    if (!response.ok) {
      return { ok: false, code: 'servidor', error: data.error || 'No se pudo publicar.' };
    }

    if (typeof data.sha === 'string') currentSha = data.sha;
    return { ok: true, value: { revision: data.revision || '', count: data.count || 0 } };
  } catch {
    return { ok: false, code: 'red', error: 'Sin conexión con el servidor. Inténtalo de nuevo.' };
  }
}

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('tiempo agotado')), TIMEOUT_MS)),
  ]);
}
