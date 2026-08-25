/**
 * =============================================================================
 *  ESTADO DE LA APLICACION
 * =============================================================================
 *
 *  Contiene solo lo que no cabe en la URL: sesion, datos cargados, borrador en
 *  edicion y estado de los dialogos. La vista activa, la receta abierta, la
 *  busqueda y el filtro de categoria viven en el hash y los aporta el enrutador.
 *
 *  POR QUE EL ESTADO VA POR MODULOS
 *  --------------------------------
 *  Antes esto era una bolsa PLANA de dieciseis claves, y diez de ellas eran del
 *  recetario (`recipes`, `factor`, `planOpen`, `confirmDelete`...). Funcionaba
 *  con un modulo. Con tres serian unas cuarenta claves sueltas compitiendo por
 *  nombres en el mismo sitio: el dia que el costeo quisiera su propio `factor` o
 *  su propio `confirmDelete`, o se inventa un prefijo o pisa el del recetario.
 *
 *  Ahora hay dos niveles y solo dos:
 *
 *      TRANSVERSAL   lo que vale para toda la aplicacion, sea cual sea el
 *                    modulo que se este mirando: la sesion, la conexion, el
 *                    aviso visible, el permiso de escritura.
 *
 *      POR MODULO    todo lo demas, dentro de su propia clave. Un modulo nuevo
 *                    anade UNA entrada aqui y no toca nada de lo que ya existe.
 *
 *  No hay un tercer nivel a proposito: `setState` fusiona exactamente uno, y
 *  anidar mas volveria a hacer falta comparar en profundidad, que es justo el
 *  coste que este diseno evita.
 */

/**
 * @typedef {Object} EstadoRecetario
 * @property {Array} recipes
 * @property {Array} ingredientes
 * @property {string|null} confirmDelete id pendiente de confirmar
 * @property {string|null} production id de la receta abierta en modo produccion
 * @property {number} factor multiplicador de la tanda que se esta viendo
 * @property {boolean} planOpen plan de produccion abierto
 * @property {boolean} ingredientsOpen catalogo de ingredientes abierto
 * @property {object|null} planPrint plan pendiente de imprimir
 */

/**
 * @typedef {Object} State
 * @property {boolean} ready datos ya cargados
 * @property {boolean} authed sesion iniciada
 * @property {boolean} online hay conexion en este momento
 * @property {boolean} settingsOpen
 * @property {boolean} pedirClave hay que pedir la clave de edicion para publicar
 * @property {{accion: string, id: string|null}|null} autorizacion permiso de un
 *   solo uso para crear, modificar o eliminar, concedido tras comprobar la clave
 * @property {string} notice mensaje visible para la persona usuaria
 * @property {'info'|'error'|'success'} noticeKind
 * @property {string} loginError
 * @property {EstadoRecetario} recetario
 */

/**
 * Modulos declarados.
 *
 * `setState` fusiona un nivel dentro de estas claves y las reemplaza fuera. Un
 * modulo que no este aqui se trataria como un valor suelto, asi que anadirlo a
 * `INITIAL` sin anadirlo a esta lista haria que cada `setState` parcial borrara
 * el resto del modulo. `scripts/verificar.mjs` comprueba que las dos listas
 * coinciden.
 */
export const MODULOS = Object.freeze(['recetario']);

/** Estado inicial del modulo de recetas. */
const RECETARIO_INICIAL = Object.freeze({
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
});

/** Estado inicial completo. */
const INITIAL = Object.freeze({
  ready: false,
  authed: false,
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
  recetario: RECETARIO_INICIAL,
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
 * Estado del modulo de recetas, que es el atajo mas usado con diferencia.
 *
 * Existe para no repetir `getState().recetario` en cada lectura y, sobre todo,
 * para que el dia que llegue el costeo la forma de leer sea la misma en los dos
 * (`recetario()` / `costos()`) y no una mezcla de atajos y rutas largas.
 *
 * @returns {EstadoRecetario}
 */
export function recetario() {
  return state.recetario;
}

/**
 * Aplica un cambio parcial y avisa a los suscriptores.
 *
 * Dos comportamientos segun la clave, y la diferencia importa:
 *
 *     setState({ ready: true })                 reemplaza el valor
 *     setState({ recetario: { factor: 2 } })    FUSIONA dentro del modulo
 *
 * Sin la fusion, cambiar el factor borraria las recetas cargadas. Con ella, cada
 * modulo se toca por partes sin conocer el resto de su propio contenido.
 *
 * Si ninguna clave cambia de valor no se notifica, para evitar repintados
 * inutiles. La comparacion es por identidad dentro de un nivel: basta porque
 * nada de lo que se guarda aqui se muta en el sitio.
 *
 * @param {Partial<State>} patch
 */
export function setState(patch) {
  const next = { ...state };
  let cambio = false;

  for (const clave of Object.keys(patch)) {
    const valor = patch[clave];

    if (MODULOS.includes(clave)) {
      const actual = state[clave];
      const distinto = Object.keys(valor).some((k) => actual[k] !== valor[k]);
      if (distinto) {
        next[clave] = { ...actual, ...valor };
        cambio = true;
      }
      continue;
    }

    if (state[clave] !== valor) {
      next[clave] = valor;
      cambio = true;
    }
  }

  if (!cambio) return;

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
