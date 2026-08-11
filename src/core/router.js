/**
 * Enrutado por hash.
 *
 * Se usa hash y no la History API por dos motivos: GitHub Pages no reescribe
 * rutas, asi que recargar en /receta/R001 daria 404; y al abrir el archivo con
 * doble clic no hay servidor que reescriba nada. Con hash, la busqueda, el filtro
 * y la receta abierta sobreviven a la recarga y se pueden compartir por enlace.
 *
 * Formas admitidas:
 *   #/                        indice
 *   #/receta/R001             detalle
 *   #/receta/R001/editar      editor sobre una receta existente
 *   #/nueva                   editor de receta nueva
 * Parametros: ?q=texto&cat=CATEGORIA
 */

/** Filtro de categoria que no filtra nada. */
export const ALL_CATEGORIES = 'TODAS';

/**
 * @typedef {{name: 'index'|'detail'|'edit'|'new', id: string|null, query: string, category: string}} Route
 */

const listeners = new Set();
let current = parseHash(window.location.hash);

/**
 * Traduce un hash a ruta. Cualquier cosa irreconocible cae en el indice.
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

  if (segments[0] === 'nueva') {
    return { name: 'new', id: null, query, category };
  }
  if (segments[0] === 'receta' && segments[1]) {
    const id = decodeURIComponent(segments[1]);
    if (segments[2] === 'editar') return { name: 'edit', id, query, category };
    return { name: 'detail', id, query, category };
  }
  return { name: 'index', id: null, query, category };
}

/**
 * Construye el hash correspondiente a una ruta.
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

  if (route.name === 'new') return '#/nueva' + suffix;
  if (route.name === 'detail' && route.id) return '#/receta/' + encodeURIComponent(route.id) + suffix;
  if (route.name === 'edit' && route.id) return '#/receta/' + encodeURIComponent(route.id) + '/editar' + suffix;
  return '#/' + suffix;
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
 * modo que abrir una receta conserva la busqueda y el filtro vigentes.
 *
 * @param {Partial<Route>} patch
 * @param {{replace?: boolean}} [options]
 */
export function navigate(patch, options = {}) {
  const next = { ...current, ...patch };
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
