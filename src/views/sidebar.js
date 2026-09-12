/**
 * =============================================================================
 *  LISTA LATERAL DE RECETAS
 * =============================================================================
 *
 *  Dos partes, de arriba abajo:
 *
 *      FILTROS    una rejilla con las tres categorias mas "todas", cada una
 *                 con su punto de color y su recuento
 *      LISTADO    las recetas que pasan el filtro y la busqueda, agrupadas por
 *                 la letra inicial
 *
 *  La lista queda siempre visible en pantallas anchas, asi que saltar de una
 *  receta a otra es un clic y nunca hay que volver atras. En celular y tableta
 *  no caben la lista y la ficha a la vez: `main.js` decide cual de las dos se
 *  ve (ver `data-view` en responsive.css).
 */

import { el, svg } from '../lib/dom.js';
import { titleCase, splitName, indexLetter } from '../lib/format.js';
import { filterRecipes, sortRecipes, availableCategories, categoryCounts } from '../core/search.js';
import { navigate, buildHash, getRoute } from '../core/router.js';

/** Espera tras la ultima tecla antes de aplicar la busqueda. */
const SEARCH_DEBOUNCE_MS = 160;

/** Id del campo de busqueda, para que el atajo de teclado pueda enfocarlo. */
export const SEARCH_ID = 'search-recipes';

/**
 * @param {{recipes: Array, query: string, category: string, selectedId: string|null, selectedOpen: boolean, focusSearch: boolean}} params
 * @returns {HTMLElement}
 */
export function renderSidebar(params) {
  const matches = sortRecipes(filterRecipes(params.recipes, params));
  const categories = availableCategories(params.recipes);
  const counts = categoryCounts(params.recipes);
  const word = matches.length === 1 ? 'receta' : 'recetas';

  return el('nav', { class: 'sidebar', attrs: { 'aria-label': 'Listado de recetas' } }, [
    el(
      'div',
      { class: 'sidebar__filters', attrs: { role: 'group', 'aria-label': 'Filtrar por categoría' } },
      categories.map((name) => renderCategoryChip(name, counts[name] || 0, params.category)),
    ),
    renderSearch(params.query, params.focusSearch),
    el('p', {
      class: 'sidebar__count',
      attrs: { role: 'status' },
      text: `${matches.length} ${word}`,
    }),
    matches.length === 0
      ? renderEmpty(params.query)
      : renderList(matches, params.selectedId, params.selectedOpen),
  ]);
}

/**
 * Campo de busqueda VIVO: el MISMO nodo entre repintados.
 *
 * POR QUE SE GUARDA AQUI
 * ----------------------
 * Cada repintado reconstruye el arbol entero, asi que el buscador se fabricaba
 * de cero con cada tecla. En un ordenador no se nota. En un telefono se veia
 * exactamente lo que reporto el obrador -el teclado se cierra y se vuelve a
 * abrir con cada pulsacion, y escribir "brioche" es una pelea-, porque la
 * secuencia era esta:
 *
 *     1. `clear(app)` saca del documento el campo que tiene el foco
 *     2. quitar el foco cierra el teclado del sistema
 *     3. el foco se devolvia un cuadro de animacion DESPUES, dentro de un
 *        `requestAnimationFrame`, y el teclado volvia a subir
 *
 * La regla 16 dice que se puede reconstruir todo SALVO lo que la persona esta
 * usando. Aqui se aplica al pie de la letra: si el campo tenia el foco, el
 * repintado REUTILIZA ese mismo elemento en vez de fabricar otro. Al ser el
 * mismo nodo conserva su texto y su cursor sin que nadie los copie a mano, que
 * es de donde salia el defecto de "briocheR005" que arrastraba la version
 * anterior.
 *
 * @type {HTMLInputElement|null}
 */
let campoBusqueda = null;

/**
 * Devuelve el foco al buscador despues de un repintado.
 *
 * La llama `main.js` de forma SINCRONA, en la misma tarea en la que acaba de
 * insertar el arbol nuevo. Es la otra mitad de la correccion: entre el
 * `clear(app)` que desconecta el campo y este `focus()` no cabe ni un
 * fotograma, asi que el navegador no llega a animar el cierre del teclado.
 * Hacerlo dentro de `requestAnimationFrame`, como antes, dejaba un fotograma
 * entero por medio, y eso es justo lo que se veia parpadear.
 */
export function restaurarFocoBusqueda() {
  if (!campoBusqueda || !campoBusqueda.isConnected) return;
  if (document.activeElement === campoBusqueda) return;

  // `preventScroll` porque el navegador de un telefono desplaza la pagina hasta
  // el campo al enfocarlo, y aqui el campo ya esta donde tiene que estar: el
  // salto solo serviria para marear a quien esta escribiendo.
  campoBusqueda.focus({ preventScroll: true });
}

/**
 * Buscador del listado.
 *
 * Se aplica con un pequeno retardo tras la ultima tecla, para no rehacer el
 * listado con cada pulsacion. Si mientras corre ese retardo se abre una
 * receta, la busqueda ya no se aplica: arrastraria a la persona de vuelta al
 * indice justo despues de haber elegido algo.
 *
 * `focusSearch` lo decide `main.js` ANTES de vaciar la pantalla, y por eso es
 * un parametro y no algo que se mire aqui: cuando esta funcion corre, el arbol
 * anterior ya esta desconectado y `document.activeElement` es el cuerpo del
 * documento, asi que preguntarlo ahora siempre diria que no.
 *
 * Al reutilizar el campo NO se le reescribe el valor. Si alguien esta tecleando
 * y llega un repintado de fondo -vuelve la conexion, termina una publicacion-,
 * `query` es la ultima busqueda ya aplicada y el campo lleva lo que la persona
 * ha escrito despues: lo que vale es lo segundo.
 *
 * @param {string} query texto de la busqueda ya aplicada
 * @param {boolean} focusSearch si el campo tenia el foco antes de repintar
 * @returns {HTMLElement}
 */
function renderSearch(query, focusSearch) {
  const field = focusSearch && campoBusqueda ? campoBusqueda : construirCampo(query);
  campoBusqueda = field;

  return el('div', { class: 'sidebar__search search' }, [
    el('label', { class: 'sr-only', for: SEARCH_ID, text: 'Buscar receta' }),
    svg('svg', { class: 'search__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
      svg('circle', { cx: 11, cy: 11, r: 7 }),
      svg('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
    ]),
    field,
    query
      ? el('button', {
          type: 'button',
          class: 'search__clear',
          text: '×',
          attrs: { 'aria-label': 'Borrar la búsqueda' },
          on: { click: () => navigate({ name: 'index', id: null, query: '' }, { replace: true }) },
        })
      : // La tecla de atajo se anuncia solo cuando el campo esta vacio, para no
        // taparla con el boton de borrar.
        el('kbd', { class: 'search__key', text: '/', attrs: { 'aria-hidden': 'true' } }),
  ]);
}

/**
 * Fabrica el campo. Solo se llama cuando no hay uno vivo al que volver.
 *
 * El temporizador del retardo vive en esta clausura, asi que reutilizar el nodo
 * reutiliza tambien su temporizador. Antes cada repintado estrenaba uno y el
 * anterior seguia corriendo por su cuenta.
 *
 * @param {string} query
 * @returns {HTMLInputElement}
 */
function construirCampo(query) {
  let debounce = null;

  return el('input', {
    type: 'search',
    id: SEARCH_ID,
    class: 'search__field',
    value: query,
    placeholder: 'Buscar receta…',
    autocomplete: 'off',
    on: {
      input: (event) => {
        const value = event.target.value;
        const routeAtTyping = getRoute();
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          const now = getRoute();
          if (now.name !== routeAtTyping.name || now.id !== routeAtTyping.id) return;
          navigate({ name: 'index', id: null, query: value }, { replace: true });
        }, SEARCH_DEBOUNCE_MS);
      },
    },
  });
}

/**
 * Un segmento del filtro de categoria: punto de color, nombre y conteo.
 *
 * Los tres van siempre, incluido TODAS, que lleva el punto en color de marca:
 * si a uno le faltara el punto, su nombre arrancaria desplazado respecto a los
 * demas y la columna dejaria de leerse recta.
 *
 * El nombre se muestra tal cual viene en los datos, en MAYUSCULAS, igual que
 * la etiqueta de categoria de la ficha de receta.
 *
 * El nombre accesible se declara entero en `aria-label` y los tres hijos se
 * ocultan con `aria-hidden`, para que el lector de pantalla diga "pastelería
 * (66 recetas)" en vez de encadenar los trozos sueltos y repetir la cifra. Ese
 * texto va en minusculas a proposito: algunos lectores de pantalla deletrean
 * letra por letra lo que esta todo en mayusculas.
 *
 * @param {string} name nombre de la categoria, o TODAS
 * @param {number} count cuantas recetas tiene
 * @param {string} activeCategory categoria filtrada ahora mismo
 * @returns {HTMLElement}
 */
function renderCategoryChip(name, count, activeCategory) {
  const word = count === 1 ? 'receta' : 'recetas';

  return el('button', {
    type: 'button',
    class: 'chip',
    attrs: {
      'aria-pressed': String(name === activeCategory),
      'data-category': name,
      'aria-label': `${name.toLowerCase()} (${count} ${word})`,
    },
    on: { click: () => navigate({ name: 'index', id: null, category: name }) },
  }, [
    el('span', { class: 'chip__dot', attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'chip__label', attrs: { 'aria-hidden': 'true' }, text: name }),
    el('span', { class: 'chip__count', attrs: { 'aria-hidden': 'true' }, text: String(count) }),
  ]);
}

function renderEmpty(query) {
  return el('div', { class: 'sidebar__empty' }, [
    el('p', {
      text: query
        ? `Ninguna receta coincide con “${query}”.`
        : 'Todavía no hay recetas. Crea la primera con "Nueva receta".',
    }),
    // El boton de borrar del buscador puede quedar fuera de vista en tablet con
    // la lista desplazada, asi que la salida tambien esta aqui.
    query
      ? el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Borrar búsqueda',
          on: { click: () => navigate({ name: 'index', id: null, query: '' }, { replace: true }) },
        })
      : null,
  ]);
}

function renderList(recipes, selectedId, selectedOpen) {
  const items = [];
  let lastLetter = null;

  for (const recipe of recipes) {
    const letter = indexLetter(recipe.nombre);
    if (letter !== lastLetter) {
      items.push(el('li', { class: 'sidebar__letter', attrs: { 'aria-hidden': 'true' } }, [letter]));
      lastLetter = letter;
    }
    items.push(el('li', null, [renderLink(recipe, selectedId, selectedOpen)]));
  }

  return el('ul', { class: 'sidebar__list' }, items);
}

/**
 * Una fila del listado.
 *
 * El enlace se construye con `buildHash` sobre la ruta actual, NO a mano. Es
 * importante: escrito a mano quedaba `#/receta/R123` pelado, sin los
 * parametros, asi que al abrir una receta se perdian el filtro de categoria y
 * la busqueda y el listado volvia a mostrarlas todas. Pasando por `buildHash`,
 * la direccion conserva `?cat=` y `?q=`.
 *
 * El codigo va tambien en `data-id`: quien necesite leerlo (las flechas del
 * teclado, en main.js) lo toma de ahi en vez de recortar la direccion, que
 * ahora lleva parametros detras.
 *
 * LA MARCA SIGUE PUESTA AL VOLVER AL LISTADO, que es lo que hacia falta en
 * celular y tableta: ahi la ficha ocupa la pantalla entera, asi que al volver
 * no hay ninguna receta abierta y sin esto no quedaba ni rastro de cual se
 * acababa de mirar.
 *
 * Las dos situaciones se ven IGUAL y se anuncian DISTINTO. `aria-current` dice
 * "este es el elemento actual del conjunto" y solo es cierto con la receta
 * abierta de verdad; al volver al listado ya no lo esta, asi que en su lugar va
 * una nota que solo oye quien usa lector de pantalla. Sin ella, la unica pista
 * de cual era seria el color, y el color no lo ve todo el mundo.
 *
 * @param {object} recipe
 * @param {string|null} selectedId receta abierta, o la ultima que se miro
 * @param {boolean} selectedOpen si esa receta esta abierta ahora mismo
 * @returns {HTMLElement}
 */
function renderLink(recipe, selectedId, selectedOpen) {
  const { base, rinde } = splitName(recipe.nombre);
  const isActive = recipe.id === selectedId;

  return el(
    'a',
    {
      class: 'recipe-link' + (isActive ? ' is-active' : ''),
      // `modulo` se fija a mano y no se hereda de la ruta actual. El listado
      // se sigue viendo por debajo cuando estan abiertos el plan, el catalogo
      // o el almacen, y ahi la ruta vigente es la de ESE modulo: heredarla
      // habria construido `#/plan?r=R010` y pulsar una receta no habria abierto
      // ninguna receta. El resto de la ruta si se hereda, que es lo que
      // conserva el filtro y la busqueda.
      href: buildHash({ ...getRoute(), modulo: 'recetario', name: 'detail', id: recipe.id }),
      attrs: {
        'aria-current': isActive && selectedOpen ? 'true' : null,
        'data-category': recipe.categoria,
        'data-id': recipe.id,
        title: recipe.nombre,
      },
    },
    [
      // Punto de categoria en todas las filas, no solo en la activa: da lectura
      // instantanea de que es cada cosa y rompe la monotonia de 121 filas iguales.
      el('span', { class: 'recipe-link__dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'recipe-link__name', text: titleCase(base) }),
      rinde ? el('span', { class: 'recipe-link__yield', text: '×' + rinde.toLowerCase() }) : null,
      isActive && !selectedOpen
        ? el('span', { class: 'sr-only', text: ' (la última que abriste)' })
        : null,
    ],
  );
}
