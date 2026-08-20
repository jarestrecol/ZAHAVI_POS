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
 * @property {string|null} confirmDelete id pendiente de confirmar
 * @property {string|null} production id de la receta abierta en modo produccion
 * @property {number} factor multiplicador de la tanda que se esta viendo
 * @property {boolean} planOpen plan de produccion abierto
 * @property {boolean} ingredientsOpen catalogo de ingredientes abierto
 * @property {object|null} planPrint plan pendiente de imprimir
 * @property {boolean} online hay conexion en este momento
 * @property {boolean} settingsOpen
 * @property {boolean} pedirClave hay que pedir la clave de edicion para publicar
 * @property {{accion: string, id: string|null}|null} autorizacion permiso de un
 *   solo uso para crear, modificar o eliminar, concedido tras comprobar la clave
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
  confirmDelete: null,
  production: null,
  // El multiplicador de la tanda es estado de PANTALLA, no un dato de la
  // receta: no se guarda en ningun sitio y vuelve a 1 al cambiar de receta.
  // Ver `core/scale.js` para el porque.
  factor: 1,
  // Plan de produccion abierto. Tampoco se guarda: se pierde al cerrarlo.
  planOpen: false,
  // Catalogo de ingredientes abierto. Solo lee: no guarda nada.
  ingredientsOpen: false,
  // Plan pendiente de imprimir, si se pidio imprimirlo.
  planPrint: null,
  online: true,
  settingsOpen: false,
  // Se acaba de guardar algo que puede publicarse pero falta la clave de
  // edicion. Es estado de PANTALLA: no se guarda, y "Ahora no" lo apaga.
  pedirClave: false,
  // PERMISO DE UN SOLO USO para tocar el recetario, concedido tras comprobar la
  // clave de edicion contra el servidor. Vale para la accion que dice y para
  // ninguna mas, y se retira en cuanto esa accion termina o se cancela: crear,
  // modificar y eliminar piden la clave CADA VEZ.
  autorizacion: null,
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

