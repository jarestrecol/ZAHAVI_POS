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
import { setInert, recordarFoco } from './lib/a11y.js';
import * as repo from './core/repository.js';
import { getState, setState, subscribe, notify, clearNotice } from './core/store.js';
import { getRoute, navigate, onRouteChange, startRouter } from './core/router.js';
import { ensureAccess, isSignedIn, estadoClave, signOut, anotarGeneracion } from './core/access.js';
import { emptyRecipe } from './core/schema.js';
import { escalarReceta } from './core/scale.js';
import { getEditKey } from './core/remote.js';
import { saveRecipe, deleteRecipe, publish, discardChanges } from './app/commands.js';
import { iniciarSincronizacion, estadoSincronizacion } from './app/sync.js';
import { renderLogin } from './views/login.js';
import { renderHeader, renderBadges } from './views/header.js';
import { renderSidebar, SEARCH_ID } from './views/sidebar.js';
import { renderDetail, renderPlaceholder, renderNotFound } from './views/detail.js';
import { renderSkeleton } from './views/skeleton.js';
import { openEditor } from './views/editor.js';
import { openSettings } from './views/settings.js';
import { openPublicar } from './views/publicar.js';
import { openConfirmDelete } from './views/confirm.js';
import { openProduction } from './views/production.js';
import { openPlan } from './views/plan.js';
import { openIngredients } from './views/ingredients.js';
import { renderRecipeSheet, renderIndexSheet, renderPlanSheet } from './views/print.js';

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
  // La clave del equipo se crea la primera vez que alguien abre la aplicacion.
  // Si el equipo venia de un modelo anterior (la lista de usuarios, o la clave
  // unica de antes), se conserva la que ya conocia el personal en vez de
  // dejarlos fuera: ver `ensureAccess` en `core/access.js`.
  //
  // El resultado SE MIRA. Si la escritura de la credencial falla -cuota
  // agotada, modo privado-, `readAccess()` seguira devolviendo null en cada
  // arranque, y entonces `verifyPassword` contesta false hasta para la clave
  // correcta: la pantalla de entrada diria "clave incorrecta" sin una sola
  // pista de que el problema es del almacenamiento y no de lo que se escribio.
  const acceso = await ensureAccess();
  if (!acceso.ok) notify(acceso.message, 'error');

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

  // LA CLAVE RETIRADA SE COMPRUEBA AQUI, y no antes, porque la generacion
  // vigente viaja con el recetario: hasta haberlo leido no se sabe si la
  // panaderia retiro la clave de este equipo.
  //
  // Se comprueba al arrancar y no mientras se trabaja: sacar a alguien de la
  // pantalla a media tanda seria peor que el riesgo que se evita. Tampoco
  // basta con mirarlo al entrar, porque la sesion no vence y la tableta de
  // pared del obrador no cierra sesion nunca: ahi no dejaba de poder entrar
  // nadie. En la practica el equipo se recarga a diario, y quien conoce la
  // clave vigente la pone en el mismo formulario de entrada.
  //
  // Sin red, `generacionAcceso()` sigue valiendo la ultima conocida, asi que un
  // obrador sin señal nunca queda fuera por esto.
  anotarGeneracion(repo.generacionAcceso());
  if (isSignedIn() && estadoClave().caducada) {
    signOut();
    setState({ authed: false });
  }

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

  // Publicacion automatica: lo que se guarda sale hacia las demas sedes sin
  // depender de que alguien se acuerde de pulsar Publicar. Ver `app/sync.js`.
  iniciarSincronizacion();

  // La red de seguridad del arranque (`salvavidas.js`) espera esta marca. Sin
  // ella, a los pocos segundos sustituye la pantalla por un aviso de fallo.
  document.documentElement.dataset.arranque = 'listo';
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
 * CUIDADO: con la transicion por medio, `paint()` NO es sincrono. El navegador
 * fotografia la pantalla actual y llama al callback despues, asi que al volver
 * de `setState` el documento todavia muestra lo anterior. Quien necesite el
 * DOM ya cambiado usa `trasPintar`, mas abajo.
 */
function render() {
  if (typeof document.startViewTransition !== 'function') {
    paint();
    drenarTrasPintar();
    return;
  }

  const transicion = document.startViewTransition(() => paint());

  // `updateCallbackDone` se cumple cuando `paint()` ha terminado de cambiar el
  // DOM, sin esperar a que acabe la animacion. Se drena tambien si la promesa
  // se rechaza: mejor ejecutar lo pendiente que dejarlo colgado hasta el
  // siguiente pintado, que llegaria con otro estado.
  transicion.updateCallbackDone.then(drenarTrasPintar, drenarTrasPintar);

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
 * Cola de trabajos que solo pueden hacerse con la pantalla ya repintada.
 *
 * Existe porque imprimir el plan del dia sacaba la ficha de la receta abierta:
 * se guardaba el plan en el estado y se llamaba a `window.print()` dentro de un
 * `requestAnimationFrame`, dando por hecho que para entonces la hoja del plan
 * ya estaria montada. Con la View Transitions API no lo estaba, y encima el
 * plan se borraba del estado justo despues, asi que la hoja correcta no llegaba
 * a existir en ningun momento.
 *
 * @type {Array<() => void>}
 */
const pendientesTrasPintar = [];

/**
 * Apunta un trabajo para cuando la pantalla refleje el estado nuevo.
 *
 * Se apunta ANTES del cambio de estado que lo provoca: si el navegador no usa
 * transiciones, el repintado ocurre dentro de `setState` y ya seria tarde.
 *
 * @param {() => void} trabajo
 */
function trasPintar(trabajo) {
  pendientesTrasPintar.push(trabajo);
}

/** Ejecuta y vacia lo que estuviera esperando al repintado. */
function drenarTrasPintar() {
  const trabajos = pendientesTrasPintar.splice(0);
  for (const trabajo of trabajos) trabajo();
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
  // devolverselo despues y no cortar a alguien a media palabra. Se anota
  // tambien POR DONDE iba el cursor: devolver el foco al final del texto es
  // igual de molesto que perderlo cuando alguien esta corrigiendo una letra en
  // mitad de la palabra, y los repintados de fondo (una publicacion que
  // termina, la conexion que vuelve) llegan sin avisar.
  const searchNode = document.activeElement && document.activeElement.id === SEARCH_ID
    ? document.activeElement
    : null;
  const searchHadFocus = Boolean(searchNode);
  const searchCaret = searchNode ? searchNode.selectionStart : null;

  // Lo mismo para el resto de la pantalla, pero pensando en los dialogos: el
  // que se abra aqui mismo necesita saber a que boton devolver el foco cuando
  // se cierre, y ese boton deja de existir dos lineas mas abajo.
  recordarFoco();

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
    app.appendChild(renderLogin());
    clear(printRoot);
    return;
  }

  // --- Recetario ---------------------------------------------------------
  const recipe = route.name === 'detail' ? repo.findById(route.id) : null;

  // Avisos que van por encima de todo: sin conexion, sin recetario compartido,
  // o cambios sin publicar.
  for (const badge of renderBadges({
    changes: repo.localChanges(),
    online: state.online,
    server: repo.serverDiagnosis(),
    sync: estadoSincronizacion(),
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
  // El atributo sigue a la RUTA, no a la receta encontrada: si alguien abre el
  // enlace de una receta que ya no existe, en celular hay que enseñarle el
  // aviso, y con `view='index'` se veria el listado y el aviso quedaria oculto.
  const vista = route.name === 'detail' ? 'detail' : 'index';

  const shell = el('div', { class: 'app', dataset: { view: vista } }, [
    // Barra superior: marca, buscador y acciones.
    renderHeader({
      canEdit: true,
      onNewRecipe: () => navigate({ name: 'new', id: null }),
      onPlan: () => setState({ planOpen: true }),
      onIngredients: () => setState({ ingredientsOpen: true }),
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
        searchCaret,
      }),

      // Derecha: la receta abierta, o la bienvenida si no hay ninguna.
      el('div', { class: 'panel' }, [renderPanel(state, route, recipe)]),
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
 * Contenido del panel derecho: la receta, el aviso de que no existe, o la
 * bienvenida.
 *
 * El caso del medio no es teorico. Los enlaces a recetas se comparten por
 * mensajeria entre las dos sedes, y una receta puede haberse eliminado o
 * renumerado desde entonces. Antes ese enlace llevaba a la bienvenida sin decir
 * nada, y el efecto para quien lo abria era que el enlace "no hacia nada".
 *
 * @param {object} state
 * @param {object} route
 * @param {object|null} recipe
 * @returns {HTMLElement}
 */
function renderPanel(state, route, recipe) {
  if (recipe) return renderDetail({ recipe, canEdit: true, factor: state.factor });

  if (route.name === 'detail') {
    return renderNotFound({
      id: route.id,
      onBack: () => navigate({ name: 'index', id: null }),
    });
  }

  return renderPlaceholder({
    count: state.recipes.length,
    withMethod: state.recipes.filter((r) => (r.metodo || '').trim()).length,
    categories: new Set(state.recipes.map((r) => r.categoria).filter(Boolean)).size,
    ingredients: state.ingredientes.length,
  });
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

  // Un plan pendiente de imprimir manda sobre todo lo demas: es lo que la
  // persona acaba de pedir de forma explicita.
  if (state.planPrint) {
    printRoot.appendChild(renderPlanSheet(state.planPrint));
    return;
  }

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
  else if (state.pedirClave) openDialog = buildPublicar();
  else if (state.planOpen) openDialog = buildPlan(state);
  else if (state.ingredientsOpen) openDialog = buildIngredients(state);
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

  // Clave fija: el dialogo lleva por dentro el campo de la clave a medio
  // escribir, y cualquier repintado de la aplicacion lo borraria.
  if (state.pedirClave) return 'publicar';

  // Clave fija a proposito: el plan lleva su propia seleccion por dentro y se
  // repinta solo. Si la clave cambiara, cualquier repintado de la aplicacion
  // lo reconstruiria y se perderia lo que se llevara elegido. Lo mismo vale
  // para el catalogo de ingredientes, que guarda su busqueda y su orden.
  if (state.planOpen) return 'plan';
  if (state.ingredientsOpen) return 'ingredientes';

  if (state.settingsOpen) {
    const changes = repo.localChanges();
    // El estado del servidor forma parte de la clave porque el bloque de
    // Conexion lo muestra: si cambia mientras Ajustes esta abierto (vuelve la
    // red, se publica solo), el dialogo tiene que repintarse para no seguir
    // enseñando un diagnostico viejo.
    const sync = estadoSincronizacion();
    const servidor = repo.serverDiagnosis().state;
    return [
      'settings',
      changes.total,
      changes.dirty,
      repo.publishedRevision(),
      servidor,
      sync.motivo,
    ].join(':');
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

/**
 * Plan de produccion del dia.
 *
 * Al pedir imprimir se guarda el plan en el estado y se cierra la ventana: la
 * hoja se genera en `renderPrint` y `window.print()` se llama despues del
 * repintado, para que el navegador encuentre la hoja ya montada. Sin esa
 * espera se imprimiria lo que hubiera antes.
 *
 * Esa espera es `trasPintar`, y no un `requestAnimationFrame`: el cuadro llega
 * antes que el pintado cuando hay una View Transition por medio. El trabajo se
 * apunta antes de `setState` porque sin transiciones el repintado ocurre
 * dentro de esa misma llamada.
 */
function buildPlan(state) {
  return openPlan({
    recipes: state.recipes,
    onClose: () => setState({ planOpen: false, planPrint: null }),
    onPrint: (plan) => {
      trasPintar(() => {
        window.print();
        // El plan deja de estar pendiente en cuanto se manda a imprimir: si
        // se quedara, la siguiente impresion sacaria el plan en vez de la
        // receta que se estuviera viendo.
        setState({ planPrint: null });
      });
      setState({ planOpen: false, planPrint: plan });
    },
  });
}

/**
 * Catalogo de ingredientes.
 *
 * Solo lee el recetario: no cambia nada ni guarda nada.
 */
function buildIngredients(state) {
  return openIngredients({
    recipes: state.recipes,
    onClose: () => setState({ ingredientsOpen: false }),
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

/**
 * Pide la clave de edicion justo despues de guardar, que es donde hace falta.
 *
 * Se cierra pase lo que pase con la publicacion: si sale bien no queda nada que
 * decir aqui, y si sale mal el mensaje se enseña dentro del propio dialogo antes
 * de que nadie lo cierre.
 */
function buildPublicar() {
  return openPublicar({
    pendientes: repo.localChanges().total,
    onPublish: publish,
    onClose: () => setState({ pedirClave: false }),
  });
}

/** Ajustes: estado de publicacion, contrasena y recuperacion. */
function buildSettings(state) {
  return openSettings({
    recipeCount: state.recipes.length,
    withMethod: state.recipes.filter((r) => (r.metodo || '').trim()).length,
    revision: repo.publishedRevision(),
    changes: repo.localChanges(),
    canPublish: repo.canPublishToAll(),
    needsReload: repo.needsReloadBeforePublish(),
    editKey: getEditKey(),
    server: repo.serverDiagnosis(),
    sync: estadoSincronizacion(),
    onPublish: publish,
    onDiscard: discardChanges,
    onClose: () => setState({ settingsOpen: false }),
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
