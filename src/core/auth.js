/**
 * Bloqueo de pantalla del recetario.
 *
 * IMPORTANTE: esto es una cortina, no una cerradura. Todo ocurre en el navegador
 * y cualquiera con acceso al dispositivo puede leer el recetario desde las
 * herramientas de desarrollo. Sirve para que un cliente que se asome al mostrador
 * no vea las formulas, no para proteger frente a alguien decidido. La proteccion
 * real es no publicar las recetas reales en un sitio publico.
 */

import { readJson, writeJson, readText, writeText, removeKey } from './storage.js';

const PASSWORD_KEY = 'zahavi_recetario_pwd_v2';
const LEGACY_PASSWORD_KEY = 'zahavi_recetario_pwd_v1';
const SESSION_KEY = 'zahavi_recetario_auth_v1';

/** Contrasena de fabrica, mostrada en la pantalla de entrada. */
export const DEFAULT_PASSWORD = 'zahavi2026';

/** Longitud minima al cambiar la contrasena. */
export const MIN_PASSWORD_LENGTH = 4;

/**
 * crypto.subtle solo existe en contextos seguros. Al abrir el archivo con doble
 * clic (file://) Chrome no lo considera seguro y no esta disponible, asi que la
 * credencial se guarda etiquetada con el algoritmo usado para poder verificarla
 * despues sin ambiguedad.
 *
 * @returns {boolean}
 */
function hasSubtleCrypto() {
  return typeof window.crypto !== 'undefined' && typeof window.crypto.subtle !== 'undefined';
}

async function digest(plain) {
  const bytes = new TextEncoder().encode(plain);
  const hash = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Crea la credencial guardable a partir de una contrasena en claro.
 *
 * @param {string} plain
 * @returns {Promise<{alg: 'sha-256'|'plain', value: string}>}
 */
async function toCredential(plain) {
  if (hasSubtleCrypto()) {
    return { alg: 'sha-256', value: await digest(plain) };
  }
  return { alg: 'plain', value: plain };
}

/**
 * Asegura que exista una credencial. Migra la contrasena en claro que guardaba
 * la version anterior.
 *
 * @returns {Promise<void>}
 */
export async function ensurePassword() {
  const current = readJson(PASSWORD_KEY, null);
  if (current && typeof current.value === 'string') return;

  const legacy = readText(LEGACY_PASSWORD_KEY);
  const plain = typeof legacy === 'string' && legacy !== '' ? legacy : DEFAULT_PASSWORD;
  writeJson(PASSWORD_KEY, await toCredential(plain));
  removeKey(LEGACY_PASSWORD_KEY);
}

/**
 * Comprueba una contrasena contra la credencial guardada.
 *
 * @param {string} plain
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain) {
  const stored = readJson(PASSWORD_KEY, null);
  if (!stored || typeof stored.value !== 'string') {
    return plain === DEFAULT_PASSWORD;
  }
  if (stored.alg === 'sha-256') {
    if (!hasSubtleCrypto()) return false;
    return (await digest(plain)) === stored.value;
  }
  return plain === stored.value;
}

/**
 * Cambia la contrasena.
 *
 * @param {string} next
 * @param {string} confirmation
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function changePassword(next, confirmation) {
  if (!next || next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (next !== confirmation) {
    return { ok: false, message: 'Las contraseñas no coinciden.' };
  }
  const written = writeJson(PASSWORD_KEY, await toCredential(next));
  if (!written.ok) return { ok: false, message: written.message };
  return { ok: true };
}

/**
 * @returns {boolean}
 */
export function isSignedIn() {
  return readText(SESSION_KEY) === '1';
}

export function signIn() {
  writeText(SESSION_KEY, '1');
}

export function signOut() {
  removeKey(SESSION_KEY);
}

/**
 * Indica si sigue vigente la contrasena de fabrica, para poder avisarlo.
 *
 * @returns {Promise<boolean>}
 */
export async function isUsingDefaultPassword() {
  return verifyPassword(DEFAULT_PASSWORD);
}
