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
import { getState, setState, recetario, notify } from './core/store.js';
import { getRoute, navigate } from './core/router.js';
import { emptyRecipe } from './core/schema.js';
import { escalarReceta } from './core/scale.js';
import {
  saveRecipe,
  deleteRecipe,
  cerrarSesion,
  cambiarEscalaTexto,
} from './app/commands.js';
import { alMenos } from './core/bitacora.js';
import { openEditor } from './views/editor.js';
import { openSettings } from './views/settings.js';
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
    // Retirar una receta es del jefe de obrador en adelante: lo decide el
    // servidor, y aqui solo no se ofrece a quien no puede.
    nombre: 'borrado',
    activo: (state) => Boolean(state.recetario.confirmDelete),
    puerta: true,
    clave: (state) => 'delete:' + state.recetario.confirmDelete,
    monta: (state) => buildConfirmDelete(state),
  },
  {
    nombre: 'ajustes',
    activo: (state) => state.settingsOpen,
    // El recuento de recetas forma parte de la clave porque Ajustes lo muestra.
    clave: (state) => 'settings:' + state.recetario.recipes.length,
    monta: (state) => buildSettings(state),
  },
  {
    nombre: 'editor',
    activo: (state, route) =>
      route.modulo === 'recetario' && (route.name === 'new' || route.name === 'edit'),
    puerta: true,
    clave: (state, route) => (route.name === 'new' ? 'new' : 'edit:' + route.id),
    monta: (state, route) => buildEditor(route),
  },
];

/**
 * Decide que dialogo toca, con su clave ya resuelta.
 *
 * LA PUERTA SE APLICA AQUI, EN UN SOLO SITIO. Crear, modificar y retirar
 * recetas es del jefe de obrador en adelante, la misma regla que aplica el
 * servidor (0024): a quien no puede no se le abre el dialogo, se le dice por
 * que y se le devuelve a la receta. El servidor lo rechazaria igual (403); esto
 * solo evita que alguien escriba una receta entera para nada.
 *
 * @param {object} state
 * @param {object} route
 * @returns {{clave: string, monta: () => object|null}|null}
 */
function resolverDialogo(state, route) {
  const entrada = DIALOGOS.find((d) => d.activo(state, route));
  if (!entrada) return null;

  if (entrada.puerta && !alMenos(state.usuario, 'obrador')) {
    return {
      clave: 'sin-permiso-' + entrada.clave(state, route),
      monta: () => {
        setState({ recetario: { confirmDelete: null } });
        notify('Editar el recetario es del jefe de obrador en adelante.', 'info');
        if (route.name === 'new' || route.name === 'edit') {
          navigate({ name: route.id ? 'detail' : 'index', id: route.id || null }, { replace: true });
        }
        return null;
      },
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
    onCancel: () => setState({ recetario: { confirmDelete: null } }),
    onConfirm: () => deleteRecipe(recipe.id),
  });
}

/** Ajustes: estado del recetario, sesion de quien entro y tamaño del texto. */
function buildSettings(state) {
  return openSettings({
    recipeCount: state.recetario.recipes.length,
    withMethod: state.recetario.recipes.filter((r) => (r.metodo || '').trim()).length,
    usuario: state.usuario,
    turnoHasta: state.turnoHasta,
    // La escala NO entra en la clave del dialogo, unas lineas mas arriba: se
    // pasa para pintar cual esta elegida al ABRIR, y a partir de ahi el propio
    // grupo de botones se encarga. Meterla en la clave reconstruiria Ajustes
    // entero con cada pulsacion y el foco saldria del boton recien tocado.
    escalaTexto: state.escalaTexto,
    onEscalaTexto: cambiarEscalaTexto,
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
    onCancel: () => navigate(isNew ? { name: 'index', id: null } : { name: 'detail', id: route.id }),
    onSave: saveRecipe,
  });
}
