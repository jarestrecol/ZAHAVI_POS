/**
 * =============================================================================
 *  DIALOGOS
 * =============================================================================
 *
 *  Monta como maximo un dialogo por encima de la aplicacion, y decide cual.
 *
 *  POR QUE VIVE FUERA DE main.js
 *  -----------------------------
 *  Porque es el bloque que mas crece: cada modulo nuevo trae sus propias
 *  ventanas, y en `main.js` se comia la mitad del archivo compitiendo con el
 *  arranque y el pintado, que no tienen nada que ver.
 *
 *  POR QUE NO VIVE EN app/ NI EN views/
 *  ------------------------------------
 *  Porque no es ninguna de las dos cosas. Construye pantallas, asi que no puede
 *  ser un caso de uso (`app/` tiene prohibido importar de `views/`, y esa
 *  frontera la comprueba `scripts/verificar.mjs`). Y decide CUAL construir
 *  mirando el estado y la ruta, asi que tampoco es una vista: las vistas pintan
 *  lo que les dan. Es composicion, el mismo nivel que `main.js`, y por eso vive
 *  a su lado y no dentro de una capa.
 */

import { setInert } from './lib/a11y.js';
import * as repo from './core/repository.js';
import { getState, setState, recetario } from './core/store.js';
import { getRoute, navigate } from './core/router.js';
import { emptyRecipe } from './core/schema.js';
import { escalarReceta } from './core/scale.js';
import {
  saveRecipe,
  deleteRecipe,
  publish,
  discardChanges,
  cerrarSesion,
  cambiarEscalaTexto,
} from './app/commands.js';
import { estadoSincronizacion } from './app/sync.js';
import { openEditor } from './views/editor.js';
import { openSettings } from './views/settings.js';
import { openPublicar } from './views/publicar.js';
import { openDesbloquear } from './views/desbloquear.js';
import { openConfirmDelete } from './views/confirm.js';
import { openProduction } from './views/production.js';

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
 * Indica si hay un dialogo abierto ahora mismo.
 *
 * Lo consultan los atajos de teclado: con una ventana delante, las flechas y
 * las letras pertenecen a esa ventana y no al listado de detras.
 *
 * @returns {boolean}
 */
export function hayDialogoAbierto() {
  return openDialog !== null;
}

/**
 * Monta como maximo un dialogo por encima de la aplicacion.
 *
 * REGLA IMPORTANTE: si el dialogo que toca mostrar es el mismo que ya esta
 * puesto, se deja tal cual. Reconstruirlo borraria lo que se este escribiendo en
 * el editor y sacaria el foco del campo. Por eso cada dialogo tiene una clave,
 * declarada junto a el en la tabla `DIALOGOS`.
 *
 * Mientras hay un dialogo abierto, el resto de la aplicacion queda inerte: no se
 * puede tabular hacia ella ni la leen los lectores de pantalla.
 *
 * @param {HTMLElement|null} shell la aplicacion que queda por debajo
 */
export function renderDialogs(shell) {
  const state = getState();
  const route = getRoute();
  const elegido = resolverDialogo(state, route);
  const key = elegido ? elegido.clave : null;

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

  openDialog = elegido ? elegido.monta() : null;
  openDialogKey = openDialog ? key : null;
  setInert(shell, Boolean(openDialog));
  if (openDialog) document.body.appendChild(openDialog.node);
}

/**
 * Los dialogos, en orden de prioridad. El primero que este activo es el que se
 * muestra.
 *
 * Cada renglon dice TRES cosas que antes vivian en dos sitios distintos:
 *
 *     activo   cuando toca este dialogo
 *     clave    como se llama, que es lo que decide si hay que reconstruirlo
 *     monta    como se construye
 *
 * Y opcionalmente una cuarta, `puerta`, que declara que esa accion necesita la
 * clave de edicion ANTES de abrirse. La resuelve `resolverDialogo` en un solo
 * punto: es la regla 11 del proyecto, y montarla aqui y no en cada boton es lo
 * que hace que cubra tambien los atajos de teclado y entrar por la direccion
 * directa.
 *
 * POR QUE ES UNA TABLA Y NO DOS CADENAS DE `if`
 * ---------------------------------------------
 * Porque lo fueron, gemelas, y habia que mantenerlas sincronizadas a mano. El
 * prefijo `clave-` habia que acordarse de ponerlo en las dos, y olvidarlo dejaba
 * la puerta puesta con el editor detras, esperando a nadie. Se corrigio tres
 * veces por separado antes de entender que el problema no era el olvido sino la
 * forma. Con la tabla, la clave y el constructor son el mismo renglon: anadir
 * uno sin el otro deja de ser posible.
 */
const DIALOGOS = [
  {
    nombre: 'produccion',
    activo: (state) => Boolean(state.recetario.production),
    clave: (state) => 'prod:' + state.recetario.production,
    monta: (state) => buildProduction(state),
  },
  {
    // Eliminar sale hacia las demas sedes en cuanto se publica, asi que pide la
    // clave antes incluso de enseñar la confirmacion.
    nombre: 'borrado',
    activo: (state) => Boolean(state.recetario.confirmDelete),
    puerta: (state) => ['delete', state.recetario.confirmDelete],
    clave: (state) => 'delete:' + state.recetario.confirmDelete,
    monta: (state) => buildConfirmDelete(state),
  },
  {
    // Clave fija: el dialogo lleva por dentro el campo de la clave a medio
    // escribir, y cualquier repintado de la aplicacion lo borraria.
    nombre: 'publicar',
    activo: (state) => state.pedirClave,
    clave: () => 'publicar',
    monta: () => buildPublicar(),
  },
  {
    nombre: 'ajustes',
    activo: (state) => state.settingsOpen,
    // El estado del servidor forma parte de la clave porque el bloque de
    // Conexion lo muestra: si cambia mientras Ajustes esta abierto (vuelve la
    // red, se publica solo), el dialogo tiene que repintarse para no seguir
    // enseñando un diagnostico viejo.
    clave: () => {
      const changes = repo.localChanges();
      const sync = estadoSincronizacion();
      return [
        'settings',
        changes.total,
        changes.dirty,
        repo.publishedRevision(),
        repo.serverDiagnosis().state,
        sync.motivo,
      ].join(':');
    },
    monta: (state) => buildSettings(state),
  },
  {
    nombre: 'editor',
    activo: (state, route) =>
      route.modulo === 'recetario' && (route.name === 'new' || route.name === 'edit'),
    puerta: (state, route) => [route.name, route.id],
    clave: (state, route) => (route.name === 'new' ? 'new' : 'edit:' + route.id),
    monta: (state, route) => buildEditor(route),
  },
];

/**
 * Decide que dialogo toca, con su clave ya resuelta.
 *
 * LA PUERTA SE APLICA AQUI, EN UN SOLO SITIO. Cuando una entrada declara
 * `puerta` y falta la clave de edicion, se sustituye el dialogo por el de
 * desbloqueo Y se prefija la clave: las dos cosas juntas, porque separarlas es
 * exactamente el defecto que esta tabla vino a cerrar. Sin el prefijo, poner la
 * clave no reconstruia el dialogo y la puerta se quedaba puesta.
 *
 * @param {object} state
 * @param {object} route
 * @returns {{clave: string, monta: () => object｜null}|null}
 */
function resolverDialogo(state, route) {
  const entrada = DIALOGOS.find((d) => d.activo(state, route));
  if (!entrada) return null;

  const puerta = entrada.puerta ? entrada.puerta(state, route) : null;
  const [accion, id] = puerta || [];

  if (puerta && faltaLaClave(accion, id)) {
    return {
      clave: 'clave-' + entrada.clave(state, route),
      monta: () => buildDesbloquear(accion, id),
    };
  }

  return {
    clave: entrada.clave(state, route),
    monta: () => entrada.monta(state, route),
  };
}


/**
 * Modo Pesar: pantalla completa para el momento de pesar ingredientes.
 *
 * Recibe la receta YA escalada. Es el sitio donde el factor mas importa: es
 * justo donde alguien esta con la bascula delante siguiendo las cifras al pie
 * de la letra.
 */
function buildProduction(state) {
  const recipe = repo.findById(state.recetario.production);
  if (!recipe) {
    setState({ recetario: { production: null } });
    return null;
  }
  return openProduction({
    recipe: escalarReceta(recipe, state.recetario.factor),
    factor: state.recetario.factor,
    onClose: () => setState({ recetario: { production: null } }),
  });
}

/** Confirmacion antes de eliminar una receta. */
function buildConfirmDelete(state) {
  const recipe = repo.findById(state.recetario.confirmDelete);
  if (!recipe) {
    setState({ recetario: { confirmDelete: null } });
    return null;
  }
  return openConfirmDelete({
    recipe,
    // Igual que en la puerta: cancelar AQUI tambien retira el permiso. Sin
    // esto, el permiso sobrevivia a la cancelacion y un segundo intento de
    // eliminar la MISMA receta se saltaba la puerta sin volver a pedir la
    // clave. Vale para las tres salidas del dialogo -boton, Escape y la equis-,
    // porque las tres acaban aqui.
    onCancel: () => setState({ recetario: { confirmDelete: null }, autorizacion: null }),
    onConfirm: () => deleteRecipe(recipe.id),
  });
}

/**
 * Indica si hay que pedir la clave de edicion antes de dejar tocar el recetario.
 *
 * Consultar, buscar, escalar la tanda, imprimir y el Modo Pesar no pasan por
 * aqui: son de todo el obrador. Lo que se protege es lo que CAMBIA formulas,
 * porque con la publicacion automatica en marcha eso llega a las dos sedes.
 *
 * Sin recetario compartido no se pide nada. Ahi no hay servidor que pueda
 * comprobar la clave, y tampoco hay a donde publicar: lo que se escriba se
 * queda en el aparato. Exigir una clave que nadie puede verificar seria pedir
 * algo que no existe y dejar el recetario inservible en local.
 *
 * @returns {boolean}
 */
function faltaLaClave(accion, id) {
  if (!repo.canPublishToAll()) return false;

  // NO se mira si la clave esta guardada en la sesion. Esa clave existe para
  // que la publicacion salga sola despues de guardar, y usarla tambien como
  // permiso de entrada convertia la primera comprobacion del dia en una llave
  // que abria el resto de la jornada: quien se encontrara la tableta del
  // mostrador abierta podia crear, cambiar o borrar formulas de las dos sedes
  // sin que nadie volviera a preguntarle nada.
  //
  // Lo que se mira es la autorizacion, que vale para UNA accion concreta y se
  // retira en cuanto esa accion termina.
  const permiso = getState().autorizacion;
  return !(permiso && permiso.accion === accion && permiso.id === (id || null));
}

/**
 * Pide la clave de edicion antes de crear, modificar o eliminar.
 *
 * Al acertar, la clave queda en la sesion y este mismo repintado sustituye el
 * dialogo por lo que se estaba pidiendo: el editor o la confirmacion de
 * borrado. No hay que volver a pulsar nada.
 *
 * @param {"new"|"edit"|"delete"} accion
 * @param {string|null} id
 */
function buildDesbloquear(accion, id) {
  const recipe = id ? repo.findById(id) : null;

  return openDesbloquear({
    accion,
    nombre: recipe ? recipe.nombre : '',
    onVerificar: async (password) => {
      const result = await repo.verificarClaveEdicion(password);
      if (result.ok) {
        // La clave se guarda para que la publicacion salga sola despues de
        // guardar; la autorizacion es lo que abre esta accion, y solo esta.
        repo.guardarClaveEdicion(password);
        setState({ autorizacion: { accion, id: id || null } });
      }
      return result;
    },
    onClose: () => {
      // Cancelar deshace lo que se pedia, para no dejar el recetario en un
      // estado a medias donde el dialogo vuelve a aparecer solo.
      if (accion === 'delete') setState({ recetario: { confirmDelete: null }, autorizacion: null });
      else {
        setState({ autorizacion: null });
        navigate({ name: id ? 'detail' : 'index', id: id || null }, { replace: true });
      }
    },
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

/** Ajustes: estado de publicacion, sesion de quien entro y recuperacion. */
function buildSettings(state) {
  return openSettings({
    recipeCount: state.recetario.recipes.length,
    withMethod: state.recetario.recipes.filter((r) => (r.metodo || '').trim()).length,
    revision: repo.publishedRevision(),
    changes: repo.localChanges(),
    canPublish: repo.canPublishToAll(),
    needsReload: repo.needsReloadBeforePublish(),
    server: repo.serverDiagnosis(),
    sync: estadoSincronizacion(),
    usuario: state.usuario,
    turnoHasta: state.turnoHasta,
    // La escala NO entra en la clave del dialogo, unas lineas mas arriba: se
    // pasa para pintar cual esta elegida al ABRIR, y a partir de ahi el propio
    // grupo de botones se encarga. Meterla en la clave reconstruiria Ajustes
    // entero con cada pulsacion y el foco saldria del boton recien tocado.
    escalaTexto: state.escalaTexto,
    onEscalaTexto: cambiarEscalaTexto,
    // No se publica desde Ajustes: se abre el dialogo que ya sabe pedir la clave,
    // enfocar el campo, aceptar Intro y enseñar el error donde se esta mirando.
    onPedirClave: () => setState({ pedirClave: true }),
    onDiscard: discardChanges,
    onSalir: cerrarSesion,
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
    ingredientes: recetario().ingredientes,
    onCancel: () => {
      // El permiso muere con la ventana: volver a abrir el editor vuelve a
      // pedir la clave.
      setState({ autorizacion: null });
      navigate(isNew ? { name: 'index', id: null } : { name: 'detail', id: route.id });
    },
    onSave: saveRecipe,
  });
}
