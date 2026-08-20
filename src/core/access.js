/**
 * =============================================================================
 *  ACCESO AL RECETARIO
 * =============================================================================
 *
 *  UNA sola clave para todo el equipo, que se retira cuando hace falta.
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
 *  LA GENERACION DE ACCESO
 *  -----------------------
 *  Aqui hubo una caducidad semanal, y hay que contar por que se retiro, porque
 *  la idea era buena y la ejecucion no podia funcionar.
 *
 *  Prometia lo que prometia la baja de usuarios: que quien dejara de trabajar
 *  aqui dejara de poder entrar, en todos los equipos a la vez. No lo cumplia en
 *  ninguno de los dos extremos. No REVOCABA, porque quien conocia la clave se la
 *  renovaba a si mismo indefinidamente. Y no PROPAGABA, porque cada aparato
 *  guarda su clave y rota por su cuenta: cuatro aparatos eran cuatro cambios que
 *  alguien tenia que coordinar por telefono cada siete dias. Una rotacion
 *  obligatoria por calendario que ademas empuja hacia zahavi1, zahavi2, zahavi3.
 *
 *  Lo que hay ahora es un numero, `ACCESS_GENERATION`, que sirve el servidor
 *  junto al recetario. Cada equipo recuerda con que generacion guardo su clave.
 *  Cuando el servidor anuncia una mayor, la clave de ese equipo deja de valer y
 *  la siguiente carga pide una nueva.
 *
 *  Eso si revoca y si propaga: subir el numero una vez retira el acceso en las
 *  dos sedes y en todos los aparatos. Y se hace cuando hay MOTIVO -alguien deja
 *  el equipo, la clave corrio de boca en boca-, no cada siete dias porque toque.
 *
 *  Sigue funcionando SIN CONEXION, que era la condicion innegociable: sin
 *  servidor se usa la ultima generacion conocida, asi que un equipo sin señal
 *  nunca queda fuera. Se entera cuando vuelva la red, igual que se entera de una
 *  receta nueva. Por eso la clave de acceso no puede validarse en el servidor:
 *  el recetario tiene que abrir a las cinco de la mañana en un obrador sin
 *  cobertura.
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

/**
 * Generacion de acceso que declara el servidor, anotada al cargar.
 *
 * Arranca en 0 -"nunca se ha revocado"- y solo la mueve `anotarGeneracion`. Que
 * el valor por defecto sea 0 es lo que hace que un despliegue sin la variable
 * puesta se comporte exactamente como si esto no existiera.
 */
let generacionServidor = 0;

/**
 * Anota la generacion que viene del servidor.
 *
 * La llama el arranque despues de leer el recetario. Solo acepta subidas: un
 * servidor que de pronto contesta 0 -variable borrada por error, despliegue a
 * medias- no puede reactivar claves que ya se habian retirado.
 *
 * @param {number} valor
 */
export function anotarGeneracion(valor) {
  const numero = Number.parseInt(valor, 10);
  if (Number.isFinite(numero) && numero > generacionServidor) generacionServidor = numero;
}

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
  if (readAccess()) return ok(undefined);

  const migrada = leerCredencialAnterior();
  const credential = migrada ? migrada.credential : await toCredential(DEFAULT_PASSWORD);
  const changedAt = migrada && migrada.changedAt ? migrada.changedAt : new Date().toISOString();

  // El resultado SE MIRA antes de borrar nada. Si esta escritura falla -cuota
  // agotada, almacenamiento no disponible- y aun asi se borraran las claves
  // heredadas, el arranque siguiente no encontraria ni la nueva ni la vieja y
  // caeria a la clave de fabrica: el equipo quedaria abierto con la clave de
  // instalacion sin decirselo a nadie. Dejando la migracion sin tocar, se
  // reintenta sola en el proximo arranque.
  const written = writeJson(ACCESS_KEY, { credential, changedAt, gen: generacionServidor });
  if (!written.ok) return written;

  removeKey(LEGACY_USERS_KEY);
  removeKey(LEGACY_PASSWORD_KEY);

  return ok(undefined);
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
 * La clave nueva queda sellada con la generacion de acceso vigente, que es de
 * lo unico que depende que vuelva a pedirse un cambio.
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
  // Repetir la misma clave daria por atendida una retirada sin haber cambiado
  // nada, que es exactamente lo que la retirada viene a evitar.
  if (await matches(next, acceso.credential)) {
    return err('clave_repetida', 'La clave nueva tiene que ser distinta de la actual.');
  }

  // La clave nueva se sella con la generacion vigente: es lo que hace que deje
  // de pedirse el cambio hasta que alguien vuelva a subir el numero.
  const written = writeJson(ACCESS_KEY, {
    credential: await toCredential(next),
    changedAt: new Date().toISOString(),
    gen: generacionServidor,
  });
  if (!written.ok) return written;

  return ok(undefined);
}

/* ===========================================================================
 *  RETIRADA DE LA CLAVE
 * ======================================================================== */

/**
 * Estado de la clave de este equipo frente a la generacion del servidor.
 *
 * `caducada` conserva el nombre que ya usaban el arranque y la pantalla de
 * entrada, pero ya no significa "cumplio siete dias" sino "la panaderia retiro
 * esta clave". `motivo` dice cual de los dos casos es, para poder explicarlo en
 * pantalla en vez de soltar un "toca renovar" sin razon visible.
 *
 * @returns {{caducada: boolean, motivo: string, generacion: number, vigente: number}}
 */
export function estadoClave() {
  const acceso = readAccess();

  // Sin clave guardada no hay nada que comprobar, y pedir una nueva es la
  // salida segura: siempre esta al alcance de quien acaba de demostrar que
  // conoce la actual.
  if (!acceso) {
    return { caducada: true, motivo: 'sin_clave', generacion: 0, vigente: generacionServidor };
  }

  // Una entrada anterior a este modelo no lleva `gen`. Cuenta como 0, que es
  // lo mismo que declara un servidor sin la variable puesta: nadie queda fuera
  // por actualizar.
  const propia = Number.isFinite(acceso.gen) ? acceso.gen : 0;

  return {
    caducada: propia < generacionServidor,
    motivo: propia < generacionServidor ? 'revocada' : '',
    generacion: propia,
    vigente: generacionServidor,
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
