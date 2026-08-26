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
import { recordarFoco } from './lib/a11y.js';
import { drenarTrasPintar } from './lib/paint.js';
import { leerEscalaTexto } from './core/preferencias.js';
import { renderDialogs } from './dialogs.js';
import { handleShortcuts } from './shortcuts.js';
import * as repo from './core/repository.js';
import { getState, setState, subscribe, notify, clearNotice, recetario } from './core/store.js';
import { getRoute, navigate, onRouteChange, startRouter } from './core/router.js';
import { escalarReceta } from './core/scale.js';
import { ensureAccess, isSignedIn, estadoClave, anotarGeneracion } from './core/access.js';
import {
  saveRecipe,
  deleteRecipe,
  publish,
  discardChanges,
  entrarSesion,
  cerrarSesion,
} from './app/commands.js';
import { iniciarSincronizacion, estadoSincronizacion } from './app/sync.js';
import { renderLogin } from './views/login.js';
import { renderHeader, renderBadges } from './views/header.js';
import { renderSidebar, SEARCH_ID, restaurarFocoBusqueda } from './views/sidebar.js';
import { renderDetail, renderPlaceholder, renderNotFound } from './views/detail.js';
import { renderSkeleton } from './views/skeleton.js';
import { renderRecipeSheet, renderIndexSheet, renderPlanSheet } from './views/print.js';

/** Contenedor donde se pinta la aplicacion. */
const app = document.getElementById('app');

/** Contenedor aparte para la hoja de impresion, que no se ve en pantalla. */
const printRoot = document.getElementById('print-root');

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
    recetario: { recipes: loaded.recipes, ingredientes: loaded.ingredientes },
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
    cerrarSesion();
  }

  // `hydrate` avisa cuando algo no salio como esperaba: sin conexion, sin
  // recetas, o cambios locales danados que hubo que apartar.
  if (loaded.warning) notify(loaded.warning, 'info');

  // Tamano del texto de las recetas, elegido en Ajustes y propio de este
  // aparato. Va ANTES de `subscribe`, asi que no provoca un repintado extra: el
  // primer pintado ya sale con el tamano elegido y no se ve el salto de
  // aplicarlo despues.
  setState({ escalaTexto: leerEscalaTexto() });

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
  if (recetario().factor === 1) return;
  setState({ recetario: { factor: 1 } });
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
  // ESCRIBIENDO EN EL BUSCADOR NO SE CRUZA LA PANTALLA.
  //
  // La View Transitions API fotografia el documento entero antes y despues de
  // cada cambio, y aqui llega un cambio por pulsacion. En un telefono ese
  // trabajo es la mitad del tiron que se siente al teclear -la otra mitad era
  // el campo que se reconstruia, ver `sidebar.js`- y ademas no se ve nunca,
  // porque la tecla siguiente cancela la transicion anterior antes de que
  // termine: es el AbortError que se recoge mas abajo, que en el buscador
  // saltaba constantemente. Se pinta directo y se acabo.
  const escribiendoEnBuscador = Boolean(
    document.activeElement && document.activeElement.id === SEARCH_ID,
  );

  if (escribiendoEnBuscador || typeof document.startViewTransition !== 'function') {
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
 * Hay tres pantallas posibles:
 *
 *      cargando   -> esqueleto, mientras se leen las recetas
 *      entrada    -> si nadie ha iniciado sesion en este equipo
 *      recetario  -> lo normal: barra, listado y receta
 */
function paint() {
  const state = getState();
  const route = getRoute();

  // Tamano del texto de las recetas: viaja al CSS como un atributo de la raiz
  // del documento, no como un numero. Las cifras viven en `tokens.css`, que es
  // donde manda la regla 3, y asi el navegador tampoco tiene que confiar en un
  // valor calculado en JavaScript.
  //
  // Se pone ANTES de cualquier salida temprana para que valga tambien en la
  // pantalla de carga y en la de entrada.
  document.documentElement.dataset.escala = state.escalaTexto;

  // El buscador se anota ANTES de vaciar la pantalla: es el unico momento en el
  // que todavia se puede saber si tenia el foco. Por donde iba el cursor ya no
  // hace falta apuntarlo, porque el campo no se reconstruye -`sidebar.js`
  // reutiliza el mismo nodo- y un nodo se lleva su propio cursor consigo.
  const searchHadFocus = Boolean(
    document.activeElement && document.activeElement.id === SEARCH_ID,
  );

  // Lo mismo para el resto de la pantalla, pero pensando en los dialogos: el
  // que se abra aqui mismo necesita saber a que boton devolver el foco cuando
  // se cierre, y ese boton deja de existir dos lineas mas abajo.
  recordarFoco();

  // El listado tambien se reconstruye entero, asi que hay que acordarse de por
  // donde iba. Ver `listaScroll`, mas abajo.
  recordarScrollDelListado();

  clear(app);

  // --- Pantalla de carga -------------------------------------------------
  if (!state.ready) {
    app.appendChild(renderSkeleton());
    return;
  }

  // --- Pantalla de entrada -----------------------------------------------
  if (!state.authed) {
    renderDialogs(null);
    app.appendChild(
      renderLogin({
        error: state.loginError,
        onError: (texto) => setState({ loginError: texto }),
        onEntrar: entrarSesion,
      }),
    );
    clear(printRoot);
    return;
  }

  // --- Recetario ---------------------------------------------------------
  const recipe = route.name === 'detail' ? repo.findById(route.id) : null;
  if (recipe) ultimaRecetaVista = recipe.id;

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
      onPlan: () => setState({ recetario: { planOpen: true } }),
      onIngredients: () => setState({ recetario: { ingredientsOpen: true } }),
      onSettings: () => setState({ settingsOpen: true }),
    }),

    el('div', { class: 'workspace' }, [
      // Izquierda: filtros, buscador y listado completo.
      renderSidebar({
        recipes: state.recetario.recipes,
        query: route.query,
        category: route.category,
        // Con una receta abierta manda la receta; sin ninguna, la ultima que se
        // estuvo mirando. `selectedOpen` distingue las dos, que se ven igual
        // pero no significan lo mismo.
        selectedId: recipe ? recipe.id : ultimaRecetaVista,
        selectedOpen: Boolean(recipe),
        focusSearch: searchHadFocus,
      }),

      // Derecha: la receta abierta, o la bienvenida si no hay ninguna.
      el('div', { class: 'panel' }, [renderPanel(state, route, recipe)]),
    ]),
  ]);

  app.appendChild(shell);

  // EL FOCO DEL BUSCADOR SE DEVUELVE AQUI Y AHORA, no en el cuadro de animacion
  // siguiente. Entre el `clear(app)` de mas arriba y esta linea no cabe ni un
  // fotograma, asi que el teclado del telefono no llega a cerrarse. Con el
  // `requestAnimationFrame` que habia antes si cabia, y el teclado bajaba y
  // subia con cada pulsacion.
  if (searchHadFocus) restaurarFocoBusqueda();

  // Se devuelve el listado al mismo punto en el que estaba, en vez de dejarlo
  // arriba del todo por defecto.
  restaurarScrollDelListado(claveDelListado(route));

  // Aviso flotante de la ultima operacion (guardado, error, publicacion).
  if (state.notice) app.appendChild(renderNotice(state));

  renderDialogs(shell);
  renderPrint(state, route, recipe);
}

/**
 * POR DONDE IBA EL LISTADO, Y DE QUE LISTADO.
 *
 * El repintado reconstruye la lista entera, y un elemento recien creado no
 * tiene memoria de su desplazamiento. Antes esto se resolvia leyendo el
 * `scrollTop` del nodo viejo justo antes de destruirlo y escribiendolo en el
 * nuevo, todo dentro del mismo pintado. En escritorio funciona, porque el
 * listado no se va nunca de la pantalla.
 *
 * EN CELULAR Y TABLETA NO FUNCIONABA, y es lo que reporto el obrador: abrir una
 * receta y volver dejaba la lista arriba del todo, con lo que despues de cada
 * consulta habia que volver a bajar hasta donde uno estaba. La causa es que ahi
 * no caben las dos cosas a la vez y `.app[data-view='detail'] .sidebar` pone la
 * lista en `display: none` (responsive.css). Un elemento sin caja no se
 * desplaza: escribirle `scrollTop` no hace nada, y leerselo devuelve 0. Asi
 * que al abrir la receta la posicion no llegaba a guardarse en ninguna parte, y
 * el primer repintado dentro de la ficha la sustituia por ese 0.
 *
 * De ahi las dos reglas de aqui abajo:
 *
 *   1. La posicion vive EN UNA VARIABLE, no en el DOM. Sobrevive a que la lista
 *      desaparezca de la pantalla, que es justo lo que hace falta.
 *   2. Ni se anota ni se restaura cuando la lista no tiene caja. Sin esa
 *      guarda, cada repintado con la ficha abierta escribiria un 0 encima de lo
 *      recordado, que es exactamente el defecto.
 *
 * @type {{clave: string, top: number}}
 */
let listaScroll = { clave: '', top: 0 };

/**
 * La ultima receta que se abrio, para dejarla marcada en el listado.
 *
 * POR QUE HACE FALTA
 * ------------------
 * En escritorio el listado y la ficha se ven a la vez, asi que la fila de la
 * receta abierta se pinta sola: hay una receta en la ruta y ya esta. En celular
 * y tableta no caben las dos, y al volver de la receta la ruta es el indice: no
 * hay ninguna abierta, ninguna fila queda marcada, y despues de cada consulta
 * hay que acordarse de cual se acababa de mirar en una columna de 121 filas
 * iguales.
 *
 * Vive aqui al lado de `listaScroll` y por el mismo motivo: es memoria de
 * pantalla del ciclo de pintado, no un dato del recetario. No se guarda en
 * ningun sitio y se pierde al recargar, que es lo correcto: al dia siguiente
 * nadie sigue mirando la receta de ayer.
 *
 * Si la receta se elimina, su codigo deja de aparecer en el listado y la marca
 * se cae sola: no hay que limpiarla.
 *
 * @type {string|null}
 */
let ultimaRecetaVista = null;

/**
 * La clave del listado QUE HAY PUESTO EN LA PANTALLA ahora mismo.
 *
 * Hace falta porque `paint()` ya trabaja con la ruta NUEVA mientras el DOM
 * todavia muestra la lista ANTERIOR: al anotar la posicion, la ruta dice
 * "galletas" y lo que se esta midiendo sigue siendo la lista completa. Sin esta
 * variable, cambiar de categoria guardaba la altura de la lista vieja con la
 * etiqueta de la nueva, y la lista de galletas se abria a media altura.
 *
 * @type {string}
 */
let claveEnPantalla = '';

/**
 * La identidad del listado: la categoria filtrada y la busqueda.
 *
 * Dos filtros distintos son DOS LISTAS distintas, y devolver a la altura 900 de
 * la anterior es caer en cualquier sitio. Con la clave por delante, cambiar de
 * categoria o de busqueda empieza arriba -que es lo correcto para una lista que
 * no se habia visto- y volver de una receta conserva el sitio, que es lo que se
 * pidio.
 *
 * @param {object} route
 * @returns {string}
 */
function claveDelListado(route) {
  // Se serializa en vez de pegar los dos textos con un separador: cualquier
  // separador que se eligiera podria aparecer dentro de una busqueda y hacer
  // que dos listados distintos compartieran clave.
  return JSON.stringify([route.category, route.query]);
}

/**
 * Anota por donde va el listado, si es que se puede saber.
 *
 * `clientHeight` vale 0 cuando la lista esta oculta, y ese es el unico caso que
 * hay que dejar pasar de largo. Leer 0 de una lista sin caja y darlo por bueno
 * es lo que borraba la posicion.
 *
 */
function recordarScrollDelListado() {
  const lista = app.querySelector('.sidebar__list');
  if (!lista || lista.clientHeight === 0) return;
  listaScroll = { clave: claveEnPantalla, top: lista.scrollTop };
}

/**
 * Devuelve el listado a donde estaba, si sigue siendo el mismo listado.
 *
 * @param {string} clave
 */
function restaurarScrollDelListado(clave) {
  // Se apunta SIEMPRE, tambien con la lista oculta: en celular la ficha se
  // pinta sin listado y aun asi pertenece al mismo filtro, asi que al volver
  // tiene que reconocerse.
  claveEnPantalla = clave;

  const lista = app.querySelector('.sidebar__list');
  if (!lista || lista.clientHeight === 0) return;

  // Solo se recuerda UNA posicion, la ultima. Guardar una por filtro obligaria
  // a un mapa que crece con cada busqueda tecleada, y no compra nada: lo que se
  // pidio es que volver de una receta no mueva la lista, no que cada filtro
  // recuerde su altura de hace media hora.
  lista.scrollTop = listaScroll.clave === clave ? listaScroll.top : 0;
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
  if (recipe) {
    return renderDetail({
      recipe,
      canEdit: true,
      factor: state.recetario.factor,
      onPesar: () => setState({ recetario: { production: recipe.id } }),
      onEliminar: () => setState({ recetario: { confirmDelete: recipe.id } }),
      onFactor: (factor) => setState({ recetario: { factor } }),
    });
  }

  if (route.name === 'detail') {
    return renderNotFound({
      id: route.id,
      onBack: () => navigate({ name: 'index', id: null }),
    });
  }

  return renderPlaceholder({
    count: state.recetario.recipes.length,
    withMethod: state.recetario.recipes.filter((r) => (r.metodo || '').trim()).length,
    categories: new Set(state.recetario.recipes.map((r) => r.categoria).filter(Boolean)).size,
    ingredients: state.recetario.ingredientes.length,
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
  if (state.recetario.planPrint) {
    printRoot.appendChild(renderPlanSheet(state.recetario.planPrint));
    return;
  }

  printRoot.appendChild(
    recipe
      ? renderRecipeSheet(escalarReceta(recipe, state.recetario.factor), state.recetario.factor)
      : renderIndexSheet({ recipes: state.recetario.recipes, query: route.query, category: route.category }),
  );
}

