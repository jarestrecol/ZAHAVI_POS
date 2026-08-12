/**
 * =============================================================================
 *  USUARIOS DE ACCESO
 * =============================================================================
 *
 *  Cada persona entra con su nombre y su clave, en lugar de compartir una sola
 *  contrasena entre todo el equipo. Asi, cuando alguien deja de trabajar en la
 *  panaderia, se le quita su acceso sin tener que avisar al resto de un cambio
 *  de clave.
 *
 *  LIMITE QUE HAY QUE CONOCER
 *  --------------------------
 *  Los usuarios se guardan EN CADA EQUIPO, no en el servidor. Crear un usuario
 *  en la panaderia no lo crea en la casa de produccion: hay que darlo de alta en
 *  cada aparato donde vaya a entrar.
 *
 *  Y sigue siendo una cortina, no una cerradura: todo se comprueba dentro del
 *  navegador y quien tenga el enlace puede ver el contenido igualmente. Sirve
 *  para que cada quien tenga su acceso y para que un cliente asomado al
 *  mostrador no vea las formulas. La unica proteccion real del sistema es la
 *  clave de edicion, que se comprueba en el servidor.
 *
 *  COMO SE GUARDAN LAS CLAVES
 *  --------------------------
 *  Nunca en claro. Se guarda el resumen SHA-256 cuando el navegador lo permite.
 *  Abriendo el archivo con doble clic, Chrome no considera la pagina un contexto
 *  seguro y no ofrece `crypto.subtle`; ahi la credencial se marca como `plain`
 *  para saber con que se esta comparando, en vez de fallar en silencio.
 */

import { readJson, writeJson, readText, writeText, removeKey, ok, err } from './storage.js';
import { setEditKey } from './remote.js';

/** Donde se guarda la lista de usuarios de este equipo. */
const USERS_KEY = 'zahavi_usuarios_v1';

/** Quien tiene la sesion abierta ahora mismo. */
const SESSION_KEY = 'zahavi_sesion_v1';

/** Clave de la contrasena unica anterior, para poder migrarla. */
const LEGACY_PASSWORD_KEY = 'zahavi_recetario_pwd_v2';

/** Nombre del primer usuario, el que existe antes de crear ninguno. */
export const DEFAULT_USER = 'zahavi';

/** Clave de fabrica de ese primer usuario. */
export const DEFAULT_PASSWORD = 'zahavi2026';

/** Longitud minima de una clave. */
export const MIN_PASSWORD_LENGTH = 4;

/** Longitud maxima del nombre de usuario. */
const MAX_NAME_LENGTH = 40;

/* ===========================================================================
 *  RESUMEN DE CLAVES
 * ======================================================================== */

/**
 * `crypto.subtle` solo existe en contextos seguros.
 * @returns {boolean}
 */
function hasSubtleCrypto() {
  return typeof window.crypto !== 'undefined' && typeof window.crypto.subtle !== 'undefined';
}

/**
 * @param {string} plain
 * @returns {Promise<string>}
 */
async function digest(plain) {
  const bytes = new TextEncoder().encode(plain);
  const hash = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convierte una clave en lo que se guarda, etiquetado con el metodo usado.
 *
 * @param {string} plain
 * @returns {Promise<{alg: 'sha-256'|'plain', value: string}>}
 */
async function toCredential(plain) {
  if (hasSubtleCrypto()) return { alg: 'sha-256', value: await digest(plain) };
  return { alg: 'plain', value: plain };
}

/**
 * Compara una clave escrita con la credencial guardada.
 *
 * @param {string} plain
 * @param {{alg: string, value: string}} credential
 * @returns {Promise<boolean>}
 */
async function matches(plain, credential) {
  if (!credential || typeof credential.value !== 'string') return false;
  if (credential.alg === 'sha-256') {
    if (!hasSubtleCrypto()) return false;
    return (await digest(plain)) === credential.value;
  }
  return plain === credential.value;
}

/* ===========================================================================
 *  LISTA DE USUARIOS
 * ======================================================================== */

/**
 * Usuarios dados de alta en este equipo.
 *
 * @returns {Array<{name: string, credential: object, createdAt: string}>}
 */
function readUsers() {
  const stored = readJson(USERS_KEY, null);
  return Array.isArray(stored) ? stored : [];
}

/**
 * Nombres de los usuarios de este equipo, para mostrarlos en Ajustes.
 *
 * Nunca devuelve las credenciales: no hacen falta fuera de este archivo.
 *
 * @returns {Array<{name: string, createdAt: string}>}
 */
export function listUsers() {
  return readUsers().map((user) => ({ name: user.name, createdAt: user.createdAt }));
}

/**
 * Prepara la lista de usuarios la primera vez.
 *
 * Si el equipo venia de la contrasena unica anterior, la conserva bajo el
 * usuario de fabrica para que nadie se quede fuera tras la actualizacion.
 *
 * @returns {Promise<void>}
 */
export async function ensureUsers() {
  if (readUsers().length > 0) return;

  const legacy = readJson(LEGACY_PASSWORD_KEY, null);
  const credential =
    legacy && typeof legacy.value === 'string' ? legacy : await toCredential(DEFAULT_PASSWORD);

  writeJson(USERS_KEY, [
    { name: DEFAULT_USER, credential, createdAt: new Date().toISOString() },
  ]);
  removeKey(LEGACY_PASSWORD_KEY);
}

/**
 * Comprueba nombre y clave.
 *
 * El nombre no distingue mayusculas: escribir "Zahavi" o "zahavi" es lo mismo.
 *
 * @param {string} name
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyUser(name, password) {
  const clean = String(name || '').trim().toLowerCase();
  const user = readUsers().find((item) => item.name.toLowerCase() === clean);
  if (!user) return false;
  return matches(password, user.credential);
}

/**
 * Da de alta un usuario en este equipo.
 *
 * @param {string} name
 * @param {string} password
 * @param {string} confirmation
 * @returns {Promise<{ok: true, value: string} | {ok: false, code: string, message: string}>}
 */
export async function createUser(name, password, confirmation) {
  const clean = String(name || '').trim();

  if (clean === '') {
    return err('nombre_vacio', 'Escribe un nombre de usuario.');
  }
  if (clean.length > MAX_NAME_LENGTH) {
    return err('nombre_largo', `El nombre no puede pasar de ${MAX_NAME_LENGTH} caracteres.`);
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return err('clave_corta', `La clave debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password !== confirmation) {
    return err('clave_distinta', 'Las dos claves no coinciden.');
  }

  const users = readUsers();
  if (users.some((user) => user.name.toLowerCase() === clean.toLowerCase())) {
    return err('nombre_repetido', `Ya existe un usuario llamado ${clean} en este equipo.`);
  }

  const next = [...users, { name: clean, credential: await toCredential(password), createdAt: new Date().toISOString() }];
  const written = writeJson(USERS_KEY, next);
  if (!written.ok) return written;

  return ok(clean);
}

/**
 * Cambia la clave de un usuario, comprobando antes la actual.
 *
 * @param {string} name
 * @param {string} current
 * @param {string} next
 * @param {string} confirmation
 * @returns {Promise<{ok: true, value: undefined} | {ok: false, code: string, message: string}>}
 */
export async function changePassword(name, current, next, confirmation) {
  const clean = String(name || '').trim().toLowerCase();
  const users = readUsers();
  const index = users.findIndex((user) => user.name.toLowerCase() === clean);

  if (index === -1) return err('sin_usuario', 'Ese usuario no existe en este equipo.');
  if (!(await matches(current, users[index].credential))) {
    return err('clave_actual', 'La clave actual no es correcta.');
  }
  if (!next || next.length < MIN_PASSWORD_LENGTH) {
    return err('clave_corta', `La clave nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (next !== confirmation) {
    return err('clave_distinta', 'Las dos claves nuevas no coinciden.');
  }

  const updated = users.map((user, i) => (i === index ? { ...user, credential: null } : user));
  updated[index] = { ...users[index], credential: await toCredential(next) };

  const written = writeJson(USERS_KEY, updated);
  if (!written.ok) return written;

  return ok(undefined);
}

/**
 * Quita el acceso de un usuario a este equipo.
 *
 * No se puede quedar el equipo sin ningun usuario: eso dejaria el recetario sin
 * forma de entrar.
 *
 * @param {string} name
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
export function removeUser(name) {
  const clean = String(name || '').trim().toLowerCase();
  const users = readUsers();

  if (users.length <= 1) {
    return err('ultimo_usuario', 'No se puede quitar el último usuario: nadie podría entrar.');
  }
  if (currentUser().toLowerCase() === clean) {
    return err('usuario_actual', 'No puedes quitar el usuario con el que estás dentro.');
  }

  const next = users.filter((user) => user.name.toLowerCase() !== clean);
  if (next.length === users.length) return err('sin_usuario', 'Ese usuario no existe.');

  const written = writeJson(USERS_KEY, next);
  if (!written.ok) return written;

  return ok(undefined);
}

/* ===========================================================================
 *  SESION
 * ======================================================================== */

/**
 * @returns {boolean}
 */
export function isSignedIn() {
  return currentUser() !== '';
}

/**
 * Nombre de quien tiene la sesion abierta, o cadena vacia si no hay ninguna.
 * @returns {string}
 */
export function currentUser() {
  return readText(SESSION_KEY) || '';
}

/**
 * @param {string} name
 */
export function signIn(name) {
  writeText(SESSION_KEY, String(name).trim());
}

/**
 * Cierra la sesion de este equipo y borra tambien la clave de edicion en
 * cache.
 *
 * Sin esto, quien entrara despues heredaba la clave de edicion que dejo
 * guardada la persona anterior: bastaba con abrir Ajustes para publicar sin
 * conocerla. La clave de edicion es la unica proteccion real del sistema
 * (ver la cabecera de este archivo), asi que cerrar sesion tiene que
 * revocarla igual que revoca el acceso a la interfaz.
 */
export function signOut() {
  removeKey(SESSION_KEY);
  setEditKey(null);
}

/**
 * Indica si el usuario de fabrica sigue con su clave original, para poder
 * avisarlo en la pantalla de entrada.
 *
 * @returns {Promise<boolean>}
 */
export async function isUsingDefaultPassword() {
  return verifyUser(DEFAULT_USER, DEFAULT_PASSWORD);
}
