/**
 * =============================================================================
 *  ACCESO AL RECETARIO
 * =============================================================================
 *
 *  UNA sola clave para todo el equipo, que caduca cada semana.
 *
 *  Antes habia usuarios: cada persona con su nombre y su clave. Sobre el papel
 *  era mejor, pero en la practica no lo era, porque los usuarios se guardan EN
 *  CADA APARATO y no en el servidor. Dar de alta a alguien en la panaderia no lo
 *  daba de alta en la casa de produccion: habia que repetir el alta en cada
 *  equipo, y cada baja habia que repetirla igual. Con dos sedes y personal que
 *  entra y sale, eso no se mantiene solo, y una lista de usuarios que nadie
 *  actualiza es peor que no tener lista: da la impresion de un control que no
 *  existe.
 *
 *  La caducidad semanal hace el trabajo que hacia la baja de usuarios, y lo hace
 *  sin depender de que alguien se acuerde: quien dejo de trabajar aqui deja de
 *  poder entrar en cuanto la clave rota, en todos los equipos a la vez y sin que
 *  nadie tenga que hacer nada.
 *
 *  SIGUE SIENDO UNA CORTINA, NO UNA CERRADURA
 *  ------------------------------------------
 *  Todo se comprueba dentro del navegador, y quien tenga el enlace puede ver el
 *  contenido igualmente. Sirve para que un cliente asomado al mostrador no vea
 *  las formulas. La unica proteccion real del sistema es la clave de edicion,
 *  que se comprueba en el servidor.
 *
 *  COMO SE GUARDA LA CLAVE
 *  -----------------------
 *  Nunca en claro. Se guarda el resumen SHA-256 cuando el navegador lo permite.
 *  Abriendo el archivo con doble clic, Chrome no considera la pagina un contexto
 *  seguro y no ofrece `crypto.subtle`; ahi la credencial se marca como `plain`
 *  para saber con que se esta comparando, en vez de fallar en silencio.
 */

import { readJson, writeJson, readText, writeText, removeKey, ok, err } from './storage.js';
import { setEditKey } from './remote.js';

/** Donde vive la clave de este equipo. */
const ACCESS_KEY = 'zahavi_acceso_v1';

/** Marca de sesion abierta. */
const SESSION_KEY = 'zahavi_sesion_v1';

/** Lista de usuarios del modelo anterior, para migrarla. */
const LEGACY_USERS_KEY = 'zahavi_usuarios_v1';

/** Clave unica de dos modelos atras, para migrarla tambien. */
const LEGACY_PASSWORD_KEY = 'zahavi_recetario_pwd_v2';

/** Nombre del usuario de fabrica del modelo anterior, el que se conserva al migrar. */
const LEGACY_DEFAULT_USER = 'zahavi';

/** Clave de fabrica. Se avisa en la pantalla de entrada mientras siga puesta. */
export const DEFAULT_PASSWORD = 'zahavi2026';

/** Longitud minima de una clave. */
export const MIN_PASSWORD_LENGTH = 4;

/** Cada cuantos dias hay que cambiarla. */
export const PASSWORD_MAX_AGE_DAYS = 7;

/** Milisegundos de un dia, para las cuentas de caducidad. */
const DIA_MS = 24 * 60 * 60 * 1000;

/* ===========================================================================
 *  RESUMEN DE LA CLAVE
 * ======================================================================== */

/**
 * `crypto.subtle` solo existe en contextos seguros.
 *
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
 *  LA CLAVE DE ESTE EQUIPO
 * ======================================================================== */

/**
 * Lo guardado, o null si este equipo todavia no tiene clave.
 *
 * @returns {{credential: object, changedAt: string}|null}
 */
function readAccess() {
  const stored = readJson(ACCESS_KEY, null);
  if (!stored || typeof stored !== 'object' || !stored.credential) return null;
  return stored;
}

/**
 * Prepara la clave la primera vez, migrando lo que hubiera.
 *
 * Hay dos modelos anteriores de los que se puede venir, y ninguno debe dejar a
 * nadie fuera tras la actualizacion:
 *
 *   1. LISTA DE USUARIOS. Se conserva la credencial del usuario de fabrica si
 *      existe, y si no la del primero de la lista. Con varios usuarios no hay
 *      forma de elegir "la buena", asi que se elige la unica que todo el mundo
 *      conocia. La fecha de cambio se hereda de su alta, no se pone a hoy: si
 *      esa clave lleva meses sin tocarse, lo honesto es pedir el cambio en la
 *      siguiente entrada, que es justo para lo que existe la caducidad.
 *
 *   2. CLAVE UNICA ANTERIOR, de dos modelos atras. Se conserva tal cual.
 *
 * @returns {Promise<void>}
 */
export async function ensureAccess() {
  if (readAccess()) return;

  const migrada = leerCredencialAnterior();
  const credential = migrada ? migrada.credential : await toCredential(DEFAULT_PASSWORD);
  const changedAt = migrada && migrada.changedAt ? migrada.changedAt : new Date().toISOString();

  writeJson(ACCESS_KEY, { credential, changedAt });

  removeKey(LEGACY_USERS_KEY);
  removeKey(LEGACY_PASSWORD_KEY);
}

/**
 * Busca una credencial en los dos formatos anteriores.
 *
 * @returns {{credential: object, changedAt: string}|null}
 */
function leerCredencialAnterior() {
  const usuarios = readJson(LEGACY_USERS_KEY, null);
  if (Array.isArray(usuarios) && usuarios.length > 0) {
    const preferido =
      usuarios.find((u) => String(u.name || '').toLowerCase() === LEGACY_DEFAULT_USER) || usuarios[0];
    if (preferido && preferido.credential) {
      return { credential: preferido.credential, changedAt: preferido.createdAt || '' };
    }
  }

  const suelta = readJson(LEGACY_PASSWORD_KEY, null);
  if (suelta && typeof suelta.value === 'string') {
    return { credential: suelta, changedAt: '' };
  }

  return null;
}

/**
 * Comprueba la clave escrita en la pantalla de entrada.
 *
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password) {
  const acceso = readAccess();
  if (!acceso) return false;
  return matches(password, acceso.credential);
}

/**
 * Cambia la clave, comprobando antes la actual.
 *
 * Reinicia el contador de la semana: la fecha de cambio es lo unico de lo que
 * depende la caducidad.
 *
 * @param {string} current
 * @param {string} next
 * @param {string} confirmation
 * @returns {Promise<{ok: true, value: undefined} | {ok: false, code: string, message: string}>}
 */
export async function changePassword(current, next, confirmation) {
  const acceso = readAccess();
  if (!acceso) return err('sin_clave', 'Este equipo todavía no tiene clave.');

  if (!(await matches(current, acceso.credential))) {
    return err('clave_actual', 'La clave actual no es correcta.');
  }
  if (!next || next.length < MIN_PASSWORD_LENGTH) {
    return err('clave_corta', `La clave nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (next !== confirmation) {
    return err('clave_distinta', 'Las dos claves nuevas no coinciden.');
  }
  // Repetir la misma clave dejaria el contador a cero sin cambiar nada, que es
  // exactamente lo que la caducidad viene a evitar.
  if (await matches(next, acceso.credential)) {
    return err('clave_repetida', 'La clave nueva tiene que ser distinta de la actual.');
  }

  const written = writeJson(ACCESS_KEY, {
    credential: await toCredential(next),
    changedAt: new Date().toISOString(),
  });
  if (!written.ok) return written;

  return ok(undefined);
}

/* ===========================================================================
 *  CADUCIDAD
 * ======================================================================== */

/**
 * Estado de la clave respecto a la semana.
 *
 * `dias` es cuantos han pasado desde el ultimo cambio. Una fecha ausente o
 * ilegible cuenta como caducada: ante la duda, se pide el cambio, que es la
 * salida segura y siempre esta al alcance de quien acaba de escribir la clave
 * actual.
 *
 * @returns {{dias: number, restantes: number, caducada: boolean}}
 */
export function estadoClave() {
  const acceso = readAccess();
  const marca = acceso ? Date.parse(acceso.changedAt) : NaN;

  if (!Number.isFinite(marca)) {
    return { dias: PASSWORD_MAX_AGE_DAYS, restantes: 0, caducada: true };
  }

  const dias = Math.floor((Date.now() - marca) / DIA_MS);
  return {
    dias,
    restantes: Math.max(0, PASSWORD_MAX_AGE_DAYS - dias),
    caducada: dias >= PASSWORD_MAX_AGE_DAYS,
  };
}

/**
 * Indica si la clave de fabrica sigue puesta, para avisarlo en la entrada.
 *
 * @returns {Promise<boolean>}
 */
export async function isUsingDefaultPassword() {
  return verifyPassword(DEFAULT_PASSWORD);
}

/* ===========================================================================
 *  SESION
 * ======================================================================== */

/**
 * @returns {boolean}
 */
export function isSignedIn() {
  // `readText` devuelve null cuando la clave no existe y tambien cuando el
  // almacenamiento no esta disponible. Comparar contra la cadena vacia sin
  // normalizar daba "sesion abierta" para null, es decir para el caso de no
  // haber entrado nunca.
  return (readText(SESSION_KEY) || '') !== '';
}

/** Abre la sesion en este equipo. */
export function signIn() {
  writeText(SESSION_KEY, new Date().toISOString());
}

/**
 * Cierra la sesion de este equipo y borra tambien la clave de edicion en cache.
 *
 * Sin esto, quien entrara despues heredaba la clave de edicion que dejo
 * guardada la persona anterior: bastaba con abrir Ajustes para publicar sin
 * conocerla. La clave de edicion es la unica proteccion real del sistema (ver
 * la cabecera de este archivo), asi que cerrar sesion tiene que revocarla igual
 * que revoca el acceso a la interfaz.
 */
export function signOut() {
  removeKey(SESSION_KEY);
  setEditKey(null);
}
