/**
 * Envoltorio de localStorage con errores explicitos.
 *
 * localStorage lanza en modo privado de algunos navegadores y cuando se agota la
 * cuota. Aqui nunca se propaga la excepcion: se devuelve un resultado que la
 * capa superior debe mirar, para que un guardado fallido no pase inadvertido.
 */

/**
 * @typedef {{ ok: true, value: any } | { ok: false, code: string, message: string }} Result
 */

/** Resultado correcto. */
export function ok(value) {
  return { ok: true, value };
}

/** Resultado fallido con codigo estable y mensaje para la persona usuaria. */
export function err(code, message) {
  return { ok: false, code, message };
}

let available = null;

/**
 * Comprueba una sola vez si localStorage es utilizable en este contexto.
 *
 * @returns {boolean}
 */
export function isStorageAvailable() {
  if (available !== null) return available;
  try {
    const probe = '__zahavi_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Lee y parsea un valor JSON. Devuelve el valor por defecto si falta o esta corrupto.
 *
 * @param {string} key
 * @param {any} [fallback]
 * @returns {any}
 */
export function readJson(key, fallback = null) {
  if (!isStorageAvailable()) return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Serializa y guarda un valor.
 *
 * @param {string} key
 * @param {any} value
 * @returns {Result}
 */
export function writeJson(key, value) {
  if (!isStorageAvailable()) {
    return err(
      'storage_unavailable',
      'Este navegador no permite guardar datos localmente. Revisa si estás en modo incógnito.',
    );
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return ok(undefined);
  } catch (error) {
    if (isQuotaError(error)) {
      return err(
        'quota_exceeded',
        'No queda espacio para guardar en este dispositivo. Elimina recetas que ya no uses.',
      );
    }
    return err('storage_write_failed', 'No se pudo guardar en este dispositivo.');
  }
}

/**
 * Lee una cadena simple, sin JSON.
 *
 * @param {string} key
 * @returns {string|null}
 */
export function readText(key) {
  if (!isStorageAvailable()) return null;
  return window.localStorage.getItem(key);
}

/**
 * Guarda una cadena simple.
 *
 * @param {string} key
 * @param {string} value
 * @returns {Result}
 */
export function writeText(key, value) {
  if (!isStorageAvailable()) return err('storage_unavailable', 'No se pudo guardar en este dispositivo.');
  try {
    window.localStorage.setItem(key, value);
    return ok(undefined);
  } catch (error) {
    if (isQuotaError(error)) return err('quota_exceeded', 'No queda espacio para guardar.');
    return err('storage_write_failed', 'No se pudo guardar en este dispositivo.');
  }
}

/**
 * Elimina una clave.
 *
 * @param {string} key
 */
export function removeKey(key) {
  if (!isStorageAvailable()) return;
  window.localStorage.removeItem(key);
}

function isQuotaError(error) {
  if (!error) return false;
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  );
}
