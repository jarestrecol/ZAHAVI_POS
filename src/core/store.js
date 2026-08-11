/**
 * Estado de la aplicacion.
 *
 * Contiene solo lo que no cabe en la URL: sesion, datos cargados, borrador en
 * edicion y estado de los dialogos. La vista activa, la receta abierta, la
 * busqueda y el filtro de categoria viven en el hash y los aporta el enrutador.
 */

/**
 * @typedef {Object} State
 * @property {boolean} ready datos ya cargados
 * @property {boolean} authed sesion iniciada
 * @property {Array} recipes
 * @property {Array} ingredientes
 * @property {'closed'|'opening'|'open'|'shutting'} book
 * @property {'fwd'|'back'|null} turning
 * @property {object|null} draft receta en edicion
 * @property {boolean} draftIsNew
 * @property {string|null} confirmDelete id pendiente de confirmar
 * @property {string|null} production id de la receta abierta en modo produccion
 * @property {boolean} online hay conexion en este momento
 * @property {boolean} settingsOpen
 * @property {string} notice mensaje visible para la persona usuaria
 * @property {'info'|'error'|'success'} noticeKind
 * @property {string} loginError
 */

/** Estado inicial. */
const INITIAL = Object.freeze({
  ready: false,
  authed: false,
  recipes: [],
  ingredientes: [],
  book: 'closed',
  turning: null,
  draft: null,
  draftIsNew: false,
  confirmDelete: null,
  production: null,
  online: true,
  settingsOpen: false,
  notice: '',
  noticeKind: 'info',
  loginError: '',
});

let state = INITIAL;
const listeners = new Set();

/**
 * Estado actual. Nunca se muta: para cambiarlo se usa setState.
 * @returns {State}
 */
export function getState() {
  return state;
}

/**
 * Aplica un cambio parcial y avisa a los suscriptores.
 * Si ninguna clave cambia de valor no se notifica, para evitar renders inutiles.
 *
 * @param {Partial<State>} patch
 */
export function setState(patch) {
  const next = { ...state, ...patch };
  const changed = Object.keys(patch).some((key) => state[key] !== next[key]);
  if (!changed) return;
  const previous = state;
  state = next;
  listeners.forEach((listener) => listener(state, previous));
}

/**
 * Suscribe un oyente a los cambios de estado.
 *
 * @param {(state: State, previous: State) => void} listener
 * @returns {() => void} funcion para cancelar la suscripcion
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Muestra un aviso en la interfaz.
 *
 * @param {string} message
 * @param {'info'|'error'|'success'} [kind]
 */
export function notify(message, kind = 'info') {
  setState({ notice: message, noticeKind: kind });
}

/** Oculta el aviso actual. */
export function clearNotice() {
  if (state.notice !== '') setState({ notice: '', noticeKind: 'info' });
}

/** Devuelve el estado a sus valores iniciales. Solo para pruebas. */
export function resetState() {
  state = INITIAL;
  listeners.clear();
}
