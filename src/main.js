/**
 * =============================================================================
 *  ARRANQUE Y ORQUESTACION
 * =============================================================================
 *
 *  Este es el punto de entrada de la aplicacion. Su unico trabajo es decidir
 *  QUE se pinta y CUANDO. No sabe construir pantallas (eso lo hacen las vistas
 *  de `src/views/`) ni sabe guardar recetas (eso lo hacen los casos de uso de
 *  `src/app/commands.js`).
 *
 *  RECORRIDO DE UNA CARGA
 *  ----------------------
 *      1. `boot()`      prepara la contrasena y carga las recetas
 *      2. `render()`    pinta segun el estado y la direccion actual
 *      3. a partir de ahi, cualquier cambio de estado o de direccion
 *         vuelve a llamar a `render()`
 *
 *  POR QUE SE REPINTA TODO
 *  -----------------------
 *  Cada render reconstruye el arbol completo. Con 121 recetas eso son unos
 *  cientos de nodos y el navegador lo resuelve sin esfuerzo, asi que no hace
 *  falta comparar arboles ni llevar cuentas de que cambio. La unica excepcion
 *  son los dialogos: reconstruir el editor mientras alguien escribe le borraria
 *  lo escrito, y por eso llevan un tratamiento especial (ver `renderDialogs`).
 */

import { el, clear } from './lib/dom.js';
import { setInert } from './lib/a11y.js';
import * as repo from './core/repository.js';
import { getState, setState, subscribe, notify, clearNotice } from './core/store.js';
import { getRoute, navigate, onRouteChange, startRouter } from './core/router.js';
import { ensureUsers, isSignedIn, isUsingDefaultPassword } from './core/users.js';
import { emptyRecipe } from './core/schema.js';
import { escalarReceta } from './core/scale.js';
import { getEditKey } from './core/remote.js';
import { saveRecipe, deleteRecipe, publish, discardChanges } from './app/commands.js';
import { renderLogin } from './views/login.js';
import { renderHeader, renderBadges } from './views/header.js';
import { renderSidebar, SEARCH_ID } from './views/sidebar.js';
import { renderDetail, renderPlaceholder } from './views/detail.js';
import { renderSkeleton } from './views/skeleton.js';
import { openEditor } from './views/editor.js';
import { openSettings } from './views/settings.js';
import { openConfirmDelete } from './views/confirm.js';
import { openProduction } from './views/production.js';
import { renderRecipeSheet, renderIndexSheet } from './views/print.js';

/** Contenedor donde se pinta la aplicacion. */
const app = document.getElementById('app');

/** Contenedor aparte para la hoja de impresion, que no se ve en pantalla. */
const printRoot = document.getElementById('print-root');

/**
 * Dialogo abierto en este momento, o null si no hay ninguno.
 * @type {{node: HTMLElement, close: () => void}|null}
 */
let openDialog = null;

/**
 * Identidad del dialogo abierto, del tipo "edit:R012".
 *
 * Sirve para saber si el dialogo que toca mostrar es el mismo que ya esta
 * puesto. Si lo es, no se reconstruye: el editor perderia el texto a medio
 * escribir y el foco.
 *
 * @type {string|null}
 */
let openDialogKey = null;

/**
 * Indica si sigue vigente la contrasena de fabrica.
 *
 * Solo se usa para decidir si la pantalla de entrada muestra la pista. En
 * cuanto alguien cambia la contrasena, la pista desaparece.
 */
let usingDefaultPassword = false;

boot();

/* ===========================================================================
 *  1. ARRANQUE
 * ======================================================================== */

/**
 * Prepara todo y pinta por primera vez.
 *
 * El orden importa: primero la contrasena (porque decide si se ve la pantalla
 * de entrada o el recetario), despues las recetas, y solo entonces se activan
 * las suscripciones que provocan repintados.
 */
async function boot() {
  // El usuario de fabrica se crea la primera vez que alguien abre la app, y se
  // conserva la contrasena anterior si el equipo venia de la version con clave
  // unica.
  await ensureUsers();
  usingDefaultPassword = await isUsingDefaultPassword();

  setState({
    authed: isSignedIn(),
    online: navigator.onLine !== false,
  });

  // Carga las recetas: primero las del servidor, y si no hay red, la copia
  // guardada en este equipo.
  const loaded = await repo.hydrate();
  setState({
    ready: true,
    recipes: loaded.recipes,
    ingredientes: loaded.ingredientes,
  });

  // `hydrate` avisa cuando algo no salio como esperaba: sin conexion, sin
  // recetas, o cambios locales danados que hubo que apartar.
  if (loaded.warning) notify(loaded.warning, 'info');

  // A partir de aqui, cualquier cambio de estado o de direccion repinta.
  subscribe(render);
  // El reinicio del factor va ANTES de `render` a proposito: asi el estado ya
  // esta puesto cuando toca pintar y no se ve un parpadeo con las cantidades
  // de la receta anterior.
  onRouteChange(resetFactorAlCambiarDeReceta);
  onRouteChange(render);
  startRouter();
  render();

  // Estado de la conexion: en una cocina se cae a menudo y conviene decirlo.
  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));

  document.addEventListener('keydown', handleShortcuts);
  registerServiceWorker();
}

/**
 * Devuelve las cantidades a las de la formula al cambiar de receta.
 *
 * El multiplicador pertenece a la receta que se estaba mirando, no es una
 * preferencia de la persona. Arrastrarlo seria peligroso: se sale de una tanda
 * al triple, se abre otra receta y sus cantidades apareceran multiplicadas sin
 * que nadie lo haya pedido.
 *
 * @param {object} route ruta nueva
 * @param {object} previous ruta anterior
 */
function resetFactorAlCambiarDeReceta(route, previous) {
  if (route.id === previous.id) return;
  if (getState().factor === 1) return;
  setState({ factor: 1 });
}

/**
 * Registra el service worker, que es lo que permite abrir el recetario sin
 * conexion.
 *
 * Se hace despues del primer render: si fallara, la aplicacion ya esta en
 * pantalla y funciona igual mientras haya red.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Con el archivo abierto desde el disco no hay service worker posible, y
  // tampoco hace falta: ahi ya esta todo en local.
  if (window.location.protocol === 'file:') return;

  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* sin funcionamiento sin conexion; con red la aplicacion va igual */
  });
}

/* ===========================================================================
 *  2. ATAJOS DE TECLADO
 * ======================================================================== */

/**
 * Atajos de teclado.
 *
 * Son pocos a proposito: solo lo que de verdad se repite muchas veces al dia.
 *
 *      /            ir al buscador
 *      flechas      recorrer el listado de recetas
 *      E            editar la receta abierta
 *      Escape       salir del buscador y limpiar la busqueda
 *
 * No se activan mientras se escribe en un campo ni con un dialogo abierto: ahi
 * las teclas pertenecen a lo que la persona esta haciendo.
 *
 * @param {KeyboardEvent} event
 */
function handleShortcuts(event) {
  const state = getState();

  if (!state.ready || !state.authed) return;
  if (openDialog || state.production) return;

  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

  // Barra: al buscador desde cualquier punto.
  if (event.key === '/' && !typing) {
    event.preventDefault();
    const field = document.getElementById(SEARCH_ID);
    if (field) field.focus();
    return;
  }

  // Escape dentro del buscador: soltar el foco y limpiar la busqueda.
  if (event.key === 'Escape' && typing && target.id === SEARCH_ID) {
    target.blur();
    navigate({ name: 'index', id: null, query: '' }, { replace: true });
    return;
  }

  // El resto de atajos no deben interferir con la escritura.
  if (typing) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  const route = getRoute();
  if ((event.key === 'e' || event.key === 'E') && route.name === 'detail') {
    event.preventDefault();
    navigate({ name: 'edit', id: route.id });
  }
}

/**
 * Mueve la seleccion por el listado con las flechas.
 *
 * Se apoya en los enlaces ya pintados en lugar de recalcular la lista filtrada,
 * porque asi respeta exactamente lo que la persona esta viendo, incluidos el
 * filtro de categoria y la busqueda activa.
 *
 * @param {number} delta 1 para bajar, -1 para subir
 */
function moveSelection(delta) {
  const links = Array.from(document.querySelectorAll('.recipe-link'));
  if (links.length === 0) return;

  const activeIndex = links.findIndex((link) => link.classList.contains('is-active'));

  // Si no hay ninguna receta abierta, la primera flecha selecciona la primera.
  const nextIndex =
    activeIndex === -1 ? 0 : Math.min(links.length - 1, Math.max(0, activeIndex + delta));
  const next = links[nextIndex];
  if (!next) return;

  // El codigo se lee de `data-id`, no recortando la direccion: desde que el
  // enlace conserva el filtro y la busqueda, la direccion lleva parametros
  // detras (`#/receta/R123?cat=GALLETAS`) y recortarla daba un codigo invalido.
  const id = next.dataset.id;
  if (!id) return;
  navigate({ name: 'detail', id });
  next.scrollIntoView({ block: 'nearest' });
}

/* ===========================================================================
 *  3. PINTADO
 * ======================================================================== */

/**
 * Pinta la aplicacion entera segun el estado y la direccion actuales.
 *
 * Envuelve `paint()` con la View Transitions API cuando el navegador la
 * conoce: el paso de una pantalla a otra hace un cruce suave en vez de un
 * salto seco, sin que `paint()` sepa nada de esto. Progresivo a proposito:
 * en un navegador sin soporte, `paint()` se llama igual y la aplicacion
 * funciona identica, solo sin el cruce animado. La duracion sale de
 * `--dur-slow`, que cae a 0ms con movimiento reducido (ver tokens.css), asi
 * que ahi la transicion se vuelve instantanea sin ninguna comprobacion aqui.
 *
 * `paint()` se llama siempre de forma sincrona, dentro o fuera de la
 * transicion: lo unico que cambia es si el cambio se ve animado o no.
 */
function render() {
  if (typeof document.startViewTransition !== 'function') {
    paint();
    return;
  }

  const transicion = document.startViewTransition(() => paint());

  // El navegador SALTA una transicion cuando llega otra antes de que la
  // anterior termine. Pasa constantemente en uso normal: al escribir en el
  // buscador, al recorrer el listado con las flechas, al abrir una receta
  // mientras se cierra un dialogo. Cuando la salta, rechaza sus promesas con
  // un AbortError.
  //
  // No es un fallo: `paint()` ya hizo el cambio real y la pantalla esta
  // correcta; lo unico que se pierde es la animacion de esa vez. Pero si nadie
  // recoge ese rechazo, el navegador lo anuncia como error sin atrapar y
  // ensucia la consola.
  //
  // Se vigilan las DOS promesas. Un intento anterior cubria solo `ready` y el
  // aviso seguia saliendo, asi que aqui no se asume cual de las dos rechaza:
  // se cubren ambas y se descarta unicamente el AbortError. Cualquier otro
  // error (por ejemplo, uno de verdad dentro de `paint()`) se deja salir, para
  // no esconder un fallo real detras de esta red de seguridad.
  const descartarSalto = (error) => {
    if (error && error.name === 'AbortError') return;
    throw error;
  };

  transicion.ready.catch(descartarSalto);
  transicion.finished.catch(descartarSalto);
}

/**
 * Hay tres pantallas posibles:
 *
 *      cargando   -> esqueleto, mientras se leen las recetas
 *      entrada    -> si nadie ha iniciado sesion en este equipo
 *      recetario  -> lo normal: barra, listado y receta
 */
function paint() {
  const state = getState();
  const route = getRoute();

  // El buscador se reconstruye en cada render: se anota si tenia el foco para
  // devolverselo despues y no cortar a alguien a media palabra.
  const searchHadFocus = document.activeElement && document.activeElement.id === SEARCH_ID;

  // El listado tambien se reconstruye entero: es un elemento nuevo para el
  // navegador, sin memoria de por donde iba desplazado. Sin esto, elegir una
  // receta que esta mas abajo en la lista (la 27, por ejemplo) devolvia el
  // listado al principio en cada clic, en vez de quedarse donde estaba.
  const sidebarList = app.querySelector('.sidebar__list');
  const sidebarScrollTop = sidebarList ? sidebarList.scrollTop : 0;

  clear(app);

  // --- Pantalla de carga -------------------------------------------------
  if (!state.ready) {
    app.appendChild(renderSkeleton());
    return;
  }

  // --- Pantalla de entrada -----------------------------------------------
  if (!state.authed) {
    renderDialogs(null);
    app.appendChild(renderLogin({ showDefaultHint: usingDefaultPassword }));
    clear(printRoot);
    return;
  }

  // --- Recetario ---------------------------------------------------------
  const recipe = route.name === 'detail' ? repo.findById(route.id) : null;

  // Avisos que van por encima de todo: sin conexion, o cambios sin publicar.
  for (const badge of renderBadges({
    changes: repo.localChanges(),
    online: state.online,
    onOpenSettings: () => setState({ settingsOpen: true }),
  })) {
    app.appendChild(badge);
  }

  // En pantallas estrechas no caben el listado y la receta a la vez, asi que se
  // muestra uno u otro. Este atributo es lo que lo decide desde el CSS
  // (`.app[data-view='detail'] .sidebar`, en responsive.css), y por eso tiene
  // que ir en el MISMO nodo que lleva `class="app"` (este `shell`), no en el
  // `#app` de index.html que solo lo envuelve: puesto en el contenedor
  // equivocado, el selector nunca coincidia y el listado y la ficha se veian
  // los dos a la vez en movil, apretados dentro de la altura fija de la app.
  const shell = el('div', { class: 'app', dataset: { view: recipe ? 'detail' : 'index' } }, [
    // Barra superior: marca, buscador y acciones.
    renderHeader({
      canEdit: true,
      onNewRecipe: () => navigate({ name: 'new', id: null }),
      onSettings: () => setState({ settingsOpen: true }),
    }),

    el('div', { class: 'workspace' }, [
      // Izquierda: filtros, buscador y listado completo.
      renderSidebar({
        recipes: state.recipes,
        query: route.query,
        category: route.category,
        selectedId: recipe ? recipe.id : null,
        focusSearch: searchHadFocus,
      }),

      // Derecha: la receta abierta, o la bienvenida si no hay ninguna.
      el('div', { class: 'panel' }, [
        recipe
          ? renderDetail({ recipe, canEdit: true, factor: state.factor })
          : renderPlaceholder({
              count: state.recipes.length,
              withMethod: state.recipes.filter((r) => (r.metodo || '').trim()).length,
              categories: new Set(state.recipes.map((r) => r.categoria).filter(Boolean)).size,
              ingredients: state.ingredientes.length,
            }),
      ]),
    ]),
  ]);

  app.appendChild(shell);

  // Se devuelve el listado al mismo punto en el que estaba, en vez de dejarlo
  // arriba del todo por defecto.
  const newSidebarList = app.querySelector('.sidebar__list');
  if (newSidebarList) newSidebarList.scrollTop = sidebarScrollTop;

  // Aviso flotante de la ultima operacion (guardado, error, publicacion).
  if (state.notice) app.appendChild(renderNotice(state));

  renderDialogs(shell);
  renderPrint(state, route, recipe);
}

/**
 * Aviso flotante de la esquina inferior.
 *
 * @param {object} state
 * @returns {HTMLElement}
 */
function renderNotice(state) {
  return el('div', { class: 'notice notice--' + state.noticeKind, attrs: { role: 'status' } }, [
    el('span', { text: state.notice }),
    el('button', {
      type: 'button',
      class: 'notice__close',
      text: '×',
      attrs: { 'aria-label': 'Cerrar el aviso' },
      on: { click: clearNotice },
    }),
  ]);
}

/**
 * Pinta la hoja de impresion, que vive en un contenedor aparte.
 *
 * Se genera siempre, aunque no se vea: asi Ctrl+P imprime al instante lo que hay
 * en pantalla, sin pasos intermedios. Con una receta abierta imprime su ficha;
 * sin receta abierta, el indice completo con el filtro que este puesto.
 *
 * La hoja hereda el factor de la tanda: lo que se imprime tiene que ser lo
 * mismo que se esta viendo. Imprimir las cantidades originales mientras la
 * pantalla muestra el triple seria la peor version posible de esta funcion.
 */
function renderPrint(state, route, recipe) {
  clear(printRoot);
  printRoot.appendChild(
    recipe
      ? renderRecipeSheet(escalarReceta(recipe, state.factor), state.factor)
      : renderIndexSheet({ recipes: state.recipes, query: route.query, category: route.category }),
  );
}

/* ===========================================================================
 *  4. DIALOGOS
 * ======================================================================== */

/**
 * Monta como maximo un dialogo por encima de la aplicacion.
 *
 * REGLA IMPORTANTE: si el dialogo que toca mostrar es el mismo que ya esta
 * puesto, se deja tal cual. Reconstruirlo borraria lo que se este escribiendo en
 * el editor y sacaria el foco del campo. Por eso existe `dialogKey`.
 *
 * Mientras hay un dialogo abierto, el resto de la aplicacion queda inerte: no se
 * puede tabular hacia ella ni la leen los lectores de pantalla.
 *
 * @param {HTMLElement|null} shell la aplicacion que queda por debajo
 */
function renderDialogs(shell) {
  const state = getState();
  const route = getRoute();
  const key = dialogKey(state, route);

  // Ya esta puesto el que toca: no tocar nada.
  if (key !== null && key === openDialogKey) {
    setInert(shell, true);
    return;
  }

  // Cambio el dialogo (o ya no hace falta ninguno): se cierra el anterior.
  if (openDialog) {
    openDialog.close();
    openDialog = null;
    openDialogKey = null;
  }

  if (state.production) openDialog = buildProduction(state);
  else if (state.confirmDelete) openDialog = buildConfirmDelete(state);
  else if (state.settingsOpen) openDialog = buildSettings(state);
  else if (route.name === 'new' || route.name === 'edit') openDialog = buildEditor(route);

  openDialogKey = openDialog ? key : null;
  setInert(shell, Boolean(openDialog));
  if (openDialog) document.body.appendChild(openDialog.node);
}

/**
 * Identifica de forma estable el dialogo que corresponde al estado actual.
 *
 * Dos estados distintos con la misma clave se consideran el mismo dialogo y no
 * lo reconstruyen. Por eso la clave de Ajustes incluye el estado de publicacion:
 * tras publicar hay que repintarlo para que deje de decir "cambios sin publicar".
 *
 * @returns {string|null} null cuando no debe haber ningun dialogo
 */
function dialogKey(state, route) {
  if (state.production) return 'prod:' + state.production;
  if (state.confirmDelete) return 'delete:' + state.confirmDelete;

  if (state.settingsOpen) {
    const changes = repo.localChanges();
    return `settings:${changes.total}:${changes.dirty}:${repo.publishedRevision()}`;
  }

  if (route.name === 'new') return 'new';
  if (route.name === 'edit') return 'edit:' + route.id;

  return null;
}

/**
 * Modo Pesar: pantalla completa para el momento de pesar ingredientes.
 *
 * Recibe la receta YA escalada. Es el sitio donde el factor mas importa: es
 * justo donde alguien esta con la bascula delante siguiendo las cifras al pie
 * de la letra.
 */
function buildProduction(state) {
  const recipe = repo.findById(state.production);
  if (!recipe) {
    setState({ production: null });
    return null;
  }
  return openProduction({
    recipe: escalarReceta(recipe, state.factor),
    factor: state.factor,
    onClose: () => setState({ production: null }),
  });
}

/** Confirmacion antes de eliminar una receta. */
function buildConfirmDelete(state) {
  const recipe = repo.findById(state.confirmDelete);
  if (!recipe) {
    setState({ confirmDelete: null });
    return null;
  }
  return openConfirmDelete({
    recipe,
    onCancel: () => setState({ confirmDelete: null }),
    onConfirm: () => deleteRecipe(recipe.id),
  });
}

/** Ajustes: estado de publicacion, contrasena y recuperacion. */
function buildSettings(state) {
  return openSettings({
    recipeCount: state.recipes.length,
    // El recetario completo: lo necesita la revision de datos, que compara
    // unas recetas con otras para detectar valores fuera de patron.
    recipes: state.recipes,
    withMethod: state.recipes.filter((r) => (r.metodo || '').trim()).length,
    revision: repo.publishedRevision(),
    changes: repo.localChanges(),
    canPublish: repo.canPublishToAll(),
    needsReload: repo.needsReloadBeforePublish(),
    editKey: getEditKey(),
    onPublish: publish,
    onDiscard: discardChanges,
    onClose: () => {
      setState({ settingsOpen: false });
      // La contrasena pudo cambiar dentro del dialogo: la pista de la pantalla
      // de entrada solo debe verse mientras siga la de fabrica.
      isUsingDefaultPassword().then((isDefault) => {
        usingDefaultPassword = isDefault;
      });
    },
  });
}

/** Editor de recetas, tanto para crear como para modificar. */
function buildEditor(route) {
  const isNew = route.name === 'new';
  const source = isNew ? emptyRecipe(repo.nextId()) : repo.findById(route.id);

  // La receta que se pedia editar ya no existe: de vuelta al listado.
  if (!source) {
    navigate({ name: 'index', id: null }, { replace: true });
    return null;
  }

  return openEditor({
    draft: source,
    isNew,
    ingredientes: getState().ingredientes,
    onCancel: () => navigate(isNew ? { name: 'index', id: null } : { name: 'detail', id: route.id }),
    onSave: saveRecipe,
  });
}
