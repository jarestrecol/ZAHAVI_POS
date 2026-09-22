/**
 * Enrutado por hash, POR MODULOS.
 *
 * Se usa hash y no la History API por dos motivos: GitHub Pages no reescribe
 * rutas, asi que recargar en /receta/R001 daria 404; y al abrir el archivo con
 * doble clic no hay servidor que reescriba nada. Con hash, la busqueda, el filtro
 * y la receta abierta sobreviven a la recarga y se pueden compartir por enlace.
 *
 * POR QUE UNA RUTA TIENE AHORA DOS PIEZAS
 * ---------------------------------------
 * Antes `name` codificaba a la vez QUE modulo y QUE pantalla dentro de el, con
 * los literales `receta` y `nueva` escritos en dos sitios espejados. Con un solo
 * modulo colaba. Con cinco no: cada modulo nuevo obligaba a tocar `parseHash` y
 * `buildHash` a la vez y a acordarse de los dos.
 *
 *     modulo   a que parte del sistema se esta entrando
 *     name     que pantalla dentro de ese modulo
 *
 * Un modulo nuevo es UNA entrada en `MODULOS` y nada mas, salvo que tenga
 * pantallas propias, y hoy solo las tiene el recetario.
 *
 * Formas admitidas:
 *   #/                             el menu
 *   #/recetario                    listado
 *   #/recetario/receta/R001        detalle
 *   #/recetario/receta/R001/editar editor sobre una receta existente
 *   #/recetario/nueva              editor de receta nueva
 *   #/plan · #/ingredientes · #/almacen
 * Parametros: ?q=texto&cat=CATEGORIA
 *
 * LOS ENLACES ANTIGUOS SIGUEN VALIENDO, Y NO ES CORTESIA
 * -----------------------------------------------------
 * `#/receta/R001` y `#/nueva` se entienden igual que antes y llevan al
 * recetario. Esos enlaces estan pegados en conversaciones entre las dos sedes y
 * guardados en la pantalla de inicio de los telefonos: romperlos seria que a
 * alguien deje de funcionarle un acceso directo sin haber tocado nada.
 *
 * No se reescriben solos en la barra de direcciones. Reescribir obligaria a
 * tocar el historial nada mas arrancar, y lo unico que se ganaria es que la
 * direccion quede mas bonita. En cuanto se navega a cualquier sitio, `buildHash`
 * ya emite la forma nueva.
 */

// El filtro "TODAS" se declara en el esquema, que es donde viven las
// categorias. Se reexporta aqui porque viaja en el hash (`?cat=`) y quien lea
// este archivo lo espera a mano.
export { ALL_CATEGORIES } from './schema.js';
import { ALL_CATEGORIES } from './schema.js';

/**
 * Los modulos del sistema y el segmento con el que se les llama.
 *
 * `inicio` no tiene segmento: es la raiz, el menu. Que sea la raiz y no una
 * direccion propia importa, porque es donde cae quien escribe la direccion a
 * secas o quien pulsa un enlace roto.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MODULOS = Object.freeze({
  inicio: '',
  recetario: 'recetario',
  plan: 'plan',
  ingredientes: 'ingredientes',
  almacen: 'almacen',
});

/** Segmento -> modulo, para no recorrer la tabla en cada lectura del hash. */
const POR_SEGMENTO = new Map(
  Object.entries(MODULOS)
    .filter(([, segmento]) => segmento !== '')
    .map(([modulo, segmento]) => [segmento, modulo]),
);

/**
 * Primeros segmentos que pertenecian al recetario cuando no habia modulos.
 * Se conservan para que los enlaces repartidos sigan abriendo donde abrian.
 */
const LEGADO_RECETARIO = new Set(['receta', 'nueva']);

/**
 * @typedef {{modulo: string, name: 'index'|'detail'|'edit'|'new', id: string|null, query: string, category: string}} Route
 */

const listeners = new Set();
let current = parseHash(window.location.hash);

/**
 * Pantallas que solo existen dentro del recetario.
 *
 * Pedir una de ellas ES pedir el recetario, aunque quien lo pida no lo diga.
 */
const PANTALLAS_DEL_RECETARIO = new Set(['detail', 'edit', 'new']);

/**
 * Pantalla dentro del recetario, a partir de los segmentos que le quedan.
 *
 * @param {string[]} segments
 * @returns {{name: Route['name'], id: string|null}|null} null si el hash no se puede leer
 */
function pantallaDelRecetario(segments) {
  if (segments[0] === 'nueva') return { name: 'new', id: null };

  if (segments[0] === 'receta' && segments[1]) {
    // `decodeURIComponent` LANZA ante un porcentaje incompleto (`%E0%A4%A`), y
    // esto se ejecuta al evaluar el modulo, antes de que exista nada. Una
    // excepcion aqui rompe la cadena de importacion entera: el recetario no
    // arranca, la pantalla se queda en la red de seguridad, y recargar tampoco
    // salva porque el hash sigue en la barra de direcciones. Bastaba con mandar
    // ese enlace por mensaje al obrador.
    let id;
    try {
      id = decodeURIComponent(segments[1]);
    } catch {
      return null;
    }
    if (segments[2] === 'editar') return { name: 'edit', id };
    return { name: 'detail', id };
  }

  return { name: 'index', id: null };
}

/**
 * Traduce un hash a ruta. Cualquier cosa irreconocible cae en el menu.
 *
 * @param {string} hash
 * @returns {Route}
 */
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const [path, search] = raw.split('?');
  const params = new URLSearchParams(search || '');
  const query = params.get('q') || '';
  const category = params.get('cat') || ALL_CATEGORIES;
  const segments = path.split('/').filter(Boolean);
  const base = { query, category };

  /*
   * La raiz: el menu. Y SI lleva receta de fondo, al contrario que los demas
   * caminos que acaban aqui.
   *
   * La diferencia esta en el motivo por el que se llega: `#/?r=R016` lo escribe
   * el propio sistema al pulsar «Menú» desde una ficha, y dice «venia de
   * leer la R016». Una direccion ilegible tambien acaba en el menu, pero
   * entonces no se venia de ninguna parte y el fondo tiene que quedar en nulo:
   * por eso los otros `return` de esta funcion siguen poniendo `id: null` a
   * mano en vez de compartir esta linea.
   */
  if (segments.length === 0) {
    return { modulo: 'inicio', name: 'index', id: params.get('r') || null, ...base };
  }

  // Forma antigua, sin nombre de modulo delante.
  if (LEGADO_RECETARIO.has(segments[0])) {
    const pantalla = pantallaDelRecetario(segments);
    if (!pantalla) return { modulo: 'inicio', name: 'index', id: null, ...base };
    return { modulo: 'recetario', ...pantalla, ...base };
  }

  const modulo = POR_SEGMENTO.get(segments[0]);
  if (!modulo) return { modulo: 'inicio', name: 'index', id: null, ...base };

  if (modulo === 'recetario') {
    const pantalla = pantallaDelRecetario(segments.slice(1));
    if (!pantalla) return { modulo: 'inicio', name: 'index', id: null, ...base };
    return { modulo: 'recetario', ...pantalla, ...base };
  }

  /*
   * Los demas modulos son una sola pantalla, y se abren ENCIMA del recetario.
   *
   * Por eso llevan `?r=`: es la receta que estaba abierta detras. Sin ella,
   * consultar el plan del dia a media lectura de una formula y cerrarlo
   * devolvia al listado, y habia que volver a buscar la receta. Eso hoy no pasa
   * -son ventanas sobre la pantalla, no direcciones- y convertirlas en
   * direcciones sin guardar el fondo habria empeorado el trabajo diario a
   * cambio de una mejora de arquitectura, que es un mal cambio.
   */
  return { modulo, name: 'index', id: params.get('r') || null, ...base,
    ...(modulo === 'plan' && params.get('fecha') ? { fecha: params.get('fecha') } : {}) };
}

/**
 * Construye el hash correspondiente a una ruta. Siempre en la forma nueva.
 *
 * @param {Partial<Route>} route
 * @returns {string}
 */
export function buildHash(route) {
  const params = new URLSearchParams();
  if (route.query) params.set('q', route.query);
  if (route.category && route.category !== ALL_CATEGORIES) params.set('cat', route.category);
  const search = params.toString();
  const suffix = search ? '?' + search : '';

  /*
   * Sin `modulo`, se deduce del nombre de la pantalla.
   *
   * Sin esta deduccion, a quien llamara con `{name: 'detail', id: 'R010'}` -la
   * forma que valia antes de que hubiera modulos- se le devolvia `#/`, o sea el
   * menu: perdia el destino en silencio y parecia que el enlace no hacia nada.
   */
  const modulo = route.modulo || (PANTALLAS_DEL_RECETARIO.has(route.name) ? 'recetario' : 'inicio');
  const segmento = MODULOS[modulo] === undefined ? '' : MODULOS[modulo];

  if (modulo !== 'recetario') {
    if (modulo === 'plan' && route.fecha) params.set('fecha', route.fecha);
    /*
     * La receta que queda detras, para poder volver a ella.
     *
     * El menu TAMBIEN la lleva, y eso es lo que mantiene vivo el camino entero.
     * Mientras el plan, el catalogo y el almacen se abrian desde un boton de la
     * barra del recetario, el fondo se heredaba en un solo salto. Ahora se
     * llega a ellos desde el menu, o sea en dos saltos, y un menu que perdiera
     * el fondo por el camino dejaria a quien consulta la bodega a media formula
     * teniendo que buscar la receta otra vez entre 122.
     */
    if (route.id) params.set('r', route.id);
    const conFondo = params.toString();
    return '#/' + segmento + (conFondo ? '?' + conFondo : '');
  }

  if (route.name === 'new') return '#/recetario/nueva' + suffix;
  if (route.name === 'detail' && route.id) {
    return '#/recetario/receta/' + encodeURIComponent(route.id) + suffix;
  }
  if (route.name === 'edit' && route.id) {
    return '#/recetario/receta/' + encodeURIComponent(route.id) + '/editar' + suffix;
  }
  return '#/recetario' + suffix;
}

/**
 * Ruta actual.
 * @returns {Route}
 */
export function getRoute() {
  return current;
}

/**
 * Navega a una ruta nueva. Los campos no indicados se heredan de la actual, de
 * modo que abrir una receta conserva la busqueda y el filtro vigentes, y que
 * moverse dentro de un modulo no obliga a repetir cual es.
 *
 * @param {Partial<Route>} patch
 * @param {{replace?: boolean}} [options]
 */
export function navigate(patch, options = {}) {
  /*
   * LA PANTALLA PEDIDA MANDA SOBRE EL MODULO HEREDADO.
   *
   * Heredar el modulo es lo que permite que moverse dentro de uno no obligue a
   * repetir cual es. Pero `detail`, `edit` y `new` solo existen en el recetario,
   * y heredarlos desde otro modulo construia una direccion imposible.
   *
   * No es teorico: pulsar una receta desde el catalogo de Ingredientes armaba
   * `#/ingredientes?r=R010` y la pantalla se quedaba donde estaba. Lo cazo una
   * prueba de navegador, no la revision, y se arregla AQUI y no en cada sitio
   * que navega, porque en cada sitio hay que acordarse y aqui no.
   */
  const cruza = !patch.modulo && PANTALLAS_DEL_RECETARIO.has(patch.name);
  const next = { ...current, ...patch, ...(cruza ? { modulo: 'recetario' } : {}) };
  const hash = buildHash(next);
  if (hash === window.location.hash) return;
  if (options.replace) {
    window.history.replaceState(null, '', hash);
    handleChange();
  } else {
    window.location.hash = hash;
  }
}

/**
 * Suscribe a los cambios de ruta.
 *
 * @param {(route: Route, previous: Route) => void} listener
 * @returns {() => void}
 */
export function onRouteChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Arranca el enrutador y emite la ruta inicial. */
export function startRouter() {
  window.addEventListener('hashchange', handleChange);
  const previous = current;
  listeners.forEach((listener) => listener(current, previous));
}

function handleChange() {
  const previous = current;
  current = parseHash(window.location.hash);
  listeners.forEach((listener) => listener(current, previous));
}
