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
 *      1. `boot()`      lee la sesion guardada y carga las recetas
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
import { drenarTrasPintar, hayTrasPintar } from './lib/paint.js';
import { leerEscalaTexto } from './core/preferencias.js';
import {
  claveDelListado,
  recordarScrollDelListado,
  restaurarScrollDelListado,
  recordarRecetaVista,
  recetaMarcada,
} from './memoria-pantalla.js';
import { renderDialogs } from './dialogs.js';
import { renderPantallas, cerrarPantallas, sigueLaMismaPantalla } from './pantallas.js';
import { handleShortcuts } from './shortcuts.js';
import * as repo from './core/repository.js';
import { getState, setState, subscribe, notify, clearNotice, recetario } from './core/store.js';
import { buildHash, getRoute, navigate, onRouteChange, startRouter } from './core/router.js';
import { escalarReceta } from './core/scale.js';
import { leerSesion, retirarAccesoAnterior } from './core/sesion.js';
import {
  saveRecipe,
  deleteRecipe,
  publish,
  discardChanges,
  ingresar,
  verificarCodigo,
  cancelarVerificacion,
  vigilarTurno,
  revalidarSesionActual,
} from './app/commands.js';
import { iniciarSincronizacion, estadoSincronizacion } from './app/sync.js';
import { cargarAlmacen } from './app/almacen.js';
import { renderLogin } from './views/login.js';
import { renderBarra, renderBadges } from './views/header.js';
import { ICON_NUEVA } from './lib/iconos.js';
import { renderSidebar, SEARCH_ID, restaurarFocoBusqueda } from './views/sidebar.js';
import { renderDetail, renderPlaceholder, renderNotFound } from './views/detail.js';
import { renderPortada } from './views/portada.js';
import { renderInicio } from './views/inicio.js';
import { cargarPanel, estadoMetas, guardarMetasResumen, prepararEjemplo } from './app/resumen.js';
import { renderNavigation } from './views/navigation.js';
import {
  renderRecipeSheet,
  renderIndexSheet,
  renderPlanSheet,
  renderIngredientsSheet,
} from './views/print.js';

/** Contenedor donde se pinta la aplicacion. */
const app = document.getElementById('app');

/** Contenedor aparte para la hoja de impresion, que no se ve en pantalla. */
const printRoot = document.getElementById('print-root');

/**
 * Cada cuanto se vuelve a comprobar la sesion con el servidor.
 *
 * Es lo maximo que tarda en salir de la pantalla alguien dado de baja en un
 * aparato que no se recarga. Los datos de Supabase se le niegan desde el primer
 * momento (ver `db/migraciones/0009`); esto solo le cierra la interfaz.
 */
const REVALIDAR_CADA_MS = 15 * 60 * 1000;

boot();

/* ===========================================================================
 *  1. ARRANQUE
 * ======================================================================== */

/**
 * Prepara todo y pinta por primera vez.
 *
 * El orden importa: primero la sesion guardada (porque decide si se ve la
 * pantalla de entrada o el menu), despues las recetas, y solo entonces se
 * activan las suscripciones que provocan repintados.
 */
async function boot() {
  // Cada persona entra con su codigo y su PIN, comprobados por Supabase. La
  // clave del equipo de antes ya no abre nada, y lo que dejo guardado en este
  // aparato se borra: ver `core/sesion.js`.
  retirarAccesoAnterior();

  // La sesion guardada decide la primera pantalla SIN esperar a la red: quien
  // ya entro en este equipo abre directamente, tambien sin conexion. Que siga
  // valiendo se comprueba despues de pintar, ver `revalidarSesionActual`.
  const sesion = leerSesion();
  setState({
    authed: sesion !== null,
    usuario: sesion ? sesion.usuario : null,
    online: navigator.onLine !== false,
  });
  // El turno de 6 horas se mira ANTES del primer pintado y sin red: una tableta
  // encendida al dia siguiente no puede abrir a nombre de quien entro ayer.
  vigilarTurno();

  // Carga las recetas: primero las del servidor, y si no hay red, la copia
  // guardada en este equipo.
  const loaded = await repo.hydrate();
  setState({
    ready: true,
    recetario: { recipes: loaded.recipes, ingredientes: loaded.ingredientes },
  });

  // `hydrate` avisa cuando algo no salio como esperaba: sin conexion, sin
  // recetas, o cambios locales danados que hubo que apartar.
  if (loaded.warning) notify(loaded.warning, 'info');

  // El almacen de este aparato. Va aqui, con el resto de la carga y antes de
  // `subscribe`, para que el primer pintado ya salga con los lotes puestos y no
  // haga falta un repintado extra.
  //
  // No se publica ni viaja a la otra sede: ver la cabecera de `core/almacen.js`.
  // Que falle no puede impedir abrir el recetario, y por eso `leerAlmacen` no
  // devuelve un error sino un aviso.
  cargarAlmacen();

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

  // LA SESION SE COMPRUEBA CONTRA EL SERVIDOR DESPUES DE PINTAR, sin bloquear
  // el arranque: una baja, un perfil desactivado o un cambio de rol llegan a
  // este equipo en cuanto hay red, y sin red no se saca a nadie. No se espera
  // a propósito: el recetario tiene que abrir aunque Supabase tarde.
  revalidarSesionActual();

  // Estado de la conexion: en una cocina se cae a menudo y conviene decirlo.
  // Al volver la red se comprueba otra vez la sesion, porque una tableta que
  // pasa el dia sin señal no llego a hacerlo al arrancar.
  window.addEventListener('online', () => {
    setState({ online: true });
    revalidarSesionActual();
  });

  // Y CADA RATO, porque la tableta de pared del obrador no recarga nunca: sin
  // esto, una baja no llegaba a ella hasta que alguien la reiniciara. Tambien al
  // volver a la pestaña, que es cuando alguien retoma el aparato. Sin red o sin
  // sesion no hace nada: `revalidarSesionActual` sale sin preguntar.
  //
  // El turno se vigila en los dos sitios SIN mirar la red. Su temporizador se
  // retrasa con la pestaña en segundo plano o la tableta dormida, y al volver es
  // cuando alguien retoma el aparato: justo cuando no puede encontrarlo abierto
  // a nombre de otro.
  window.setInterval(() => {
    if (!vigilarTurno().value) return;
    if (navigator.onLine !== false && document.visibilityState === 'visible') revalidarSesionActual();
  }, REVALIDAR_CADA_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !vigilarTurno().value) return;
    if (navigator.onLine !== false) revalidarSesionActual();
  });
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

  // Tampoco dentro de un módulo que se queda en pantalla: no hay nada que
  // animar y la transición bloquea los toques mientras dura (`pantallas.js`).
  // Salvo si algo espera al repintado (imprimir), que cuenta con que llegue
  // después de la navegación que sigue.
  const mismoModulo = !hayTrasPintar() && sigueLaMismaPantalla(getState(), getRoute());
  if (escribiendoEnBuscador || typeof document.startViewTransition !== 'function' || mismoModulo) {
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
 * Los avisos de contexto: sin conexion, sin recetario compartido, o cambios sin
 * publicar.
 *
 * Van en su propia funcion porque se pintan en DOS pantallas, el menu y el
 * recetario, y son justo los avisos que no pueden depender de en cual se este:
 * quien entra por la mañana y se queda en el menu tiene que ver igual que no
 * hay conexion.
 *
 * @param {object} state
 * @returns {Array<HTMLElement>}
 */
function avisosDeContexto(state) {
  return renderBadges({
    changes: repo.localChanges(),
    online: state.online,
    server: repo.serverDiagnosis(),
    sync: estadoSincronizacion(),
    onOpenSettings: () => setState({ settingsOpen: true }),
  });
}

/**
 * Hay cuatro pantallas posibles:
 *
 *      cargando   -> esqueleto, mientras se leen las recetas
 *      entrada    -> si nadie ha iniciado sesion en este equipo
 *      menu       -> a donde se entra: los modulos del sistema
 *      modulo     -> barra, listado y receta, con su ventana si toca
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
  recordarScrollDelListado(app);

  clear(app);

  // --- Portada de arranque -----------------------------------------------
  if (!state.ready) {
    app.appendChild(renderPortada());
    return;
  }

  // --- Pantalla de entrada -----------------------------------------------
  if (!state.authed) {
    // Si alguien cierra sesion con un modulo abierto, ese modulo no puede
    // quedarse encima enseñando lo que hay comprado.
    cerrarPantallas();
    renderDialogs(null);
    app.appendChild(
      renderLogin({
        error: state.loginError,
        campo: state.loginCampo,
        enCurso: state.loginEnCurso,
        online: state.online,
        paso: state.loginPaso,
        qr: state.loginQr,
        secreto: state.loginSecreto,
        onIngresar: ingresar,
        onVerificar: verificarCodigo,
        onCancelarVerificacion: cancelarVerificacion,
      }),
    );
    clear(printRoot);
    return;
  }

  /*
   * --- Pantallas de modulo ------------------------------------------------
   *
   * Produccion, ingredientes y almacen son pantallas COMPLETAS, no ventanas
   * encima del recetario. Cuelgan del `body` y no de `#app` para que este
   * repintado no las destruya: llevan por dentro lo que la persona esta
   * haciendo -la seleccion del plan, el formulario de un lote a medio
   * rellenar- y sacarlas del documento borraria eso y el foco.
   *
   * Se llama SIEMPRE, no solo cuando toca una: es lo que retira la anterior al
   * salir del modulo.
   */
  const pantalla = renderPantallas(state, route, avisosDeContexto(state));
  if (pantalla) {
    // Ajustes se puede abrir desde el aviso de «cambios sin publicar», que vive
    // dentro de la propia pantalla, asi que hay que poder dejarla inerte.
    renderDialogs(pantalla);
    // La hoja es independiente de la pantalla. Imprimir producción no debe
    // cerrar su editor ni destruir un borrador sin guardar.
    if (state.recetario.planPrint) renderPrint(state, route, null);
    else clear(printRoot);
    return;
  }

  // --- El menu de modulos -------------------------------------------------
  //
  // Es la pantalla a la que se entra. Va antes que el recetario porque desde
  // aqui ya no se cae en el listado por defecto: se elige.
  if (route.modulo === 'inicio') {
    for (const badge of avisosDeContexto(state)) app.appendChild(badge);

    const menu = renderInicio({
      recipes: state.recetario.recipes,
      lotes: state.almacen.lotes,
      recetaDeFondo: route.id,
      usuario: state.usuario,
      // Funciones y no datos: el panel se recalcula al cambiar de periodo o de
      // modo sin pasar por un repintado global.
      cargarPanel,
      estadoMetas,
      onGuardarMetas: guardarMetasResumen,
      prepararEjemplo,
      // Los avisos llevan a donde se arreglan; conservan la receta de fondo
      // como el resto de enlaces del menú.
      hrefDe: (destino) => buildHash({
        modulo: destino.modulo, name: 'index', fecha: destino.fecha,
        id: destino.modulo === 'recetario' ? null : route.id || null,
      }),
      onSettings: () => setState({ settingsOpen: true }),
    });
    app.appendChild(menu);

    if (state.notice) app.appendChild(renderNotice(state));

    // Ajustes se puede abrir desde aqui, asi que el menu tambien tiene que
    // poder quedarse inerte por debajo de la ventana.
    renderDialogs(menu);

    // Sin receta abierta no hay nada que imprimir, y dejar la hoja anterior
    // montada haria que Ctrl+P sacara lo ultimo que se estuvo mirando.
    clear(printRoot);
    return;
  }

  // --- Un modulo ----------------------------------------------------------
  const recipe = route.name === 'detail' ? repo.findById(route.id) : null;
  if (recipe) recordarRecetaVista(recipe.id);

  // Avisos que van por encima de todo: sin conexion, sin recetario compartido,
  // o cambios sin publicar.
  for (const badge of avisosDeContexto(state)) app.appendChild(badge);

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
    // Los modulos se abren NAVEGANDO, no encendiendo una bandera del estado.
    //
    // `core/store.js` ya decia en su cabecera que la vista activa vive en el
    // hash y no en el estado, y sin embargo el plan, los ingredientes y el
    // almacen eran tres booleanos ahi dentro. Eso significaba que no se podian
    // enlazar, que no sobrevivian a una recarga y que el menu no tenia a donde
    // apuntar. Ahora son direcciones como cualquier otra pantalla.
    /*
     * La barra del recetario se queda con DOS botones: volver al menu y crear
     * una receta.
     *
     * Los de produccion, ingredientes y almacen se fueron al menu, que es de
     * donde cuelgan. Mientras eran ventanas que se abrian encima tenia sentido
     * tenerlos aqui; desde que cada uno es una pantalla completa, tener sus
     * botones dentro del recetario decia que el recetario es la aplicacion y
     * los demas accesorios suyos, que es justo lo que este sistema ya no es.
     *
     * Ajustes tambien se fue, y ademas gana algo: detras de ese boton estan
     * publicar, descartar cambios y cerrar la sesion, y no tiene por que
     * estar a un toque desde la pantalla en la que se pesa.
     */
    renderBarra({
      subtitulo: 'recetario',
      // Sin `id: null`: la receta que se esta leyendo viaja al menu y de alli a
      // cualquier modulo, para poder volver a ella. Ver `buildHash`.
      onMenu: () => navigate({ modulo: 'inicio', name: 'index' }),
      acciones: [
        {
          label: 'Nueva receta',
          icon: ICON_NUEVA,
          variant: 'btn--accent',
          onClick: () => navigate({ modulo: 'recetario', name: 'new', id: null }),
        },
      ],
    }),

    renderNavigation('recetario'),
    el('div', { class: 'workspace' }, [
      // Izquierda: filtros, buscador y listado completo.
      renderSidebar({
        recipes: state.recetario.recipes,
        query: route.query,
        category: route.category,
        // Con una receta abierta manda la receta; sin ninguna, la ultima que se
        // estuvo mirando. `selectedOpen` distingue las dos, que se ven igual
        // pero no significan lo mismo.
        selectedId: recetaMarcada(recipe),
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
  restaurarScrollDelListado(app, claveDelListado(route));

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

  // Lo mismo para el catalogo de ingredientes: lo acaba de pedir una persona de
  // forma explicita, asi que manda sobre la receta que hubiera abierta detras.
  if (state.recetario.ingredientesPrint) {
    printRoot.appendChild(renderIngredientsSheet(state.recetario.ingredientesPrint));
    return;
  }

  printRoot.appendChild(
    recipe
      ? renderRecipeSheet(escalarReceta(recipe, state.recetario.factor), state.recetario.factor)
      : renderIndexSheet({ recipes: state.recetario.recipes, query: route.query, category: route.category }),
  );
}
