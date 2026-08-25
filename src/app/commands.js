/**
 * =============================================================================
 *  CASOS DE USO
 * =============================================================================
 *
 *  Aqui vive lo que la aplicacion SABE HACER, separado de lo que la aplicacion
 *  PINTA. Son las cuatro operaciones que tocan las 121 recetas de la panaderia:
 *
 *      guardar   ·   eliminar   ·   publicar   ·   descartar
 *
 *  Antes estaban escritas dentro de `main.js`, mezcladas con el codigo que
 *  construye la pantalla. Eso tenia dos problemas:
 *
 *    1. Cada una repetia la misma coreografia (llamar al repositorio, mirar el
 *       resultado, actualizar el estado, avisar, navegar) con pequenas
 *       variaciones, asi que era facil que una se desviara de las demas.
 *
 *    2. No se podian comprobar sin un navegador, justo siendo las operaciones
 *       donde se pueden perder los datos.
 *
 *  Ahora cada una es una funcion con nombre que devuelve siempre la misma forma
 *  de resultado, y `main.js` se limita a llamarlas.
 *
 *  FORMA DEL RESULTADO
 *  -------------------
 *  Todas devuelven lo mismo que el nucleo:
 *
 *      { ok: true,  value: <lo que sea> }
 *      { ok: false, code: 'motivo', message: 'texto para la persona' }
 *
 *  Quien llama solo tiene que mirar `ok`. El `message` ya viene redactado para
 *  mostrarse tal cual en pantalla.
 */

import * as repo from '../core/repository.js';
import { setState, notify } from '../core/store.js';
import { navigate, ALL_CATEGORIES } from '../core/router.js';
import { announce } from '../lib/a11y.js';
import { setEditKey, getEditKey } from '../core/remote.js';
import { signIn, signOut } from '../core/access.js';
import { publicarEnSegundoPlano, sePuedePublicarSolo } from './sync.js';

/**
 * Pide la clave de edicion si es lo unico que falta para publicar.
 *
 * SE COMPRUEBA LA CONDICION, NO EL MOTIVO QUE DEJO `sync.js`. El motivo cuenta
 * como acabo el ULTIMO intento, y eso no es lo mismo que lo que pasa ahora:
 * despues de publicar a mano, la clave ya esta puesta pero el motivo sigue
 * diciendo `sin_clave`, y el dialogo reaparecia en cada guardado siguiente
 * pidiendo algo que ya se habia dado.
 *
 * Las cuatro condiciones son las de publicar, en el orden en que dejan de
 * tener sentido:
 *
 *   sin cambios          no hay nada que enviar
 *   con conflicto        hay dos versiones y eso se decide en Ajustes, mirando
 *                        las dos; la clave no arregla nada
 *   sin servidor         no hay a donde publicar (archivo local, o despliegue
 *                        sin las variables puestas)
 *   con clave ya puesta  este equipo ya publica solo
 *
 * Sin red no se pide tampoco, porque `canPublishToAll()` exige haber leido el
 * recetario del servidor: sin esa lectura no hay referencia con la que publicar.
 */
function pedirClaveSiEsLoUnicoQueFalta() {
  const cambios = repo.localChanges();
  if (!cambios.dirty || cambios.conflict) return;
  if (!repo.canPublishToAll()) return;
  if (getEditKey()) return;
  setState({ pedirClave: true });
}

/**
 * Vuelca al estado lo que el repositorio tenga ahora mismo.
 *
 * Se llama tras cualquier operacion que cambie las recetas. Es una sola linea
 * repetida en cinco sitios, y tenerla aqui evita que alguna se olvide de
 * refrescar el catalogo de ingredientes ademas de las recetas.
 */
function refreshState() {
  setState({
    recipes: repo.findAll(),
    ingredientes: repo.allIngredients(),
  });
}

// ---------------------------------------------------------------------------
//  GUARDAR UNA RECETA
// ---------------------------------------------------------------------------

/**
 * Guarda una receta nueva o modificada en este equipo.
 *
 * Guardar y publicar siguen siendo dos cosas distintas: esto escribe en el
 * equipo, siempre, tambien sin conexion. Lo que cambia es que, si se puede
 * publicar, no hace falta acordarse de pulsar nada: `sync.js` lo hace en
 * segundo plano. El mensaje dice cual de los dos casos ha ocurrido, porque la
 * diferencia importa: uno lo ven las demas sedes y el otro no.
 *
 * @param {object} recipe receta ya validada por el editor
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function saveRecipe(recipe) {
  const result = repo.save(recipe);

  if (!result.ok) {
    notify(result.message, 'error');
    return result;
  }

  refreshState();
  notify(
    sePuedePublicarSolo() ? 'Receta guardada. Publicando…' : 'Receta guardada en este equipo.',
    'success',
  );
  announce('Receta guardada.');
  // El permiso muere con la accion: volver a editar vuelve a pedir la clave.
  setState({ autorizacion: null });
  navigate({ name: 'detail', id: recipe.id });
  publicarEnSegundoPlano();
  pedirClaveSiEsLoUnicoQueFalta();

  return result;
}

// ---------------------------------------------------------------------------
//  ELIMINAR UNA RECETA
// ---------------------------------------------------------------------------

/**
 * Elimina una receta de este equipo.
 *
 * El dialogo de confirmacion ya se mostro antes de llegar aqui: esta funcion no
 * vuelve a preguntar.
 *
 * @param {string} id codigo de la receta, por ejemplo "R057"
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
export function deleteRecipe(id) {
  const result = repo.remove(id);

  if (!result.ok) {
    notify(result.message, 'error');
    // El permiso se retira tambien cuando el borrado FALLA: si no, un reintento
    // sobre la misma receta se saltaria la puerta.
    setState({ confirmDelete: null, autorizacion: null });
    return result;
  }

  refreshState();
  setState({ confirmDelete: null, autorizacion: null });
  notify(
    sePuedePublicarSolo() ? 'Receta eliminada. Publicando…' : 'Receta eliminada en este equipo.',
    'success',
  );
  announce('Receta eliminada.');
  navigate({ name: 'index', id: null });
  publicarEnSegundoPlano();
  pedirClaveSiEsLoUnicoQueFalta();

  return result;
}

// ---------------------------------------------------------------------------
//  PUBLICAR PARA TODAS LAS SEDES
// ---------------------------------------------------------------------------

/**
 * Envia el recetario de este equipo al servidor, para que lo vean la panaderia
 * y la casa de produccion.
 *
 * Es la unica operacion que sale del dispositivo, y la unica que necesita la
 * clave de edicion. La clave NO se comprueba aqui: viaja al servidor, que es
 * quien la valida. Si aqui se comprobara, bastaria con abrir las herramientas
 * del navegador para saltarsela.
 *
 * Cuando la publicacion sale bien, la clave se guarda para el resto de la
 * sesion, para no tener que escribirla en cada publicacion.
 *
 * @param {string} password clave de edicion escrita por la persona
 * @returns {Promise<{ok: true, value: {revision: string, count: number}} | {ok: false, code: string, message: string}>}
 */
export async function publish(password) {
  const result = await repo.publishToAll({ password, author: 'recetario' });

  if (!result.ok) {
    // El error se muestra dentro del propio dialogo de Ajustes, junto al campo
    // de la clave, que es donde la persona esta mirando.
    return result;
  }

  setEditKey(password);
  refreshState();
  notify(`Publicado para todas las sedes: ${result.value.count} recetas.`, 'success');
  announce('Recetario publicado.');

  return result;
}

// ---------------------------------------------------------------------------
//  DESCARTAR LOS CAMBIOS DE ESTE EQUIPO
// ---------------------------------------------------------------------------

/**
 * Tira los cambios sin publicar de este equipo y vuelve a la version publicada.
 *
 * Es una operacion destructiva y no se puede deshacer, asi que el boton que la
 * dispara esta marcado como peligroso en la interfaz.
 *
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
export function discardChanges() {
  const result = repo.discardLocalChanges();

  if (!result.ok) {
    notify(result.message, 'error');
    return result;
  }

  refreshState();
  setState({ settingsOpen: false });
  notify(`Se descartaron los cambios. Vuelves a la versión publicada (${result.value} recetas).`, 'info');
  announce('Cambios locales descartados.');
  navigate({ name: 'index', id: null, query: '', category: ALL_CATEGORIES });

  return result;
}

// ---------------------------------------------------------------------------
//  ABRIR Y CERRAR LA SESION DE ESTE EQUIPO
// ---------------------------------------------------------------------------

/*
 * Entrar y salir estaban escritos dentro de las vistas, y cada copia limpiaba
 * un conjunto distinto de claves: `views/settings.js` borraba `settingsOpen`,
 * `main.js` no, y ninguna de las dos retiraba `autorizacion`. Es decir, un
 * permiso de escritura podia sobrevivir a un cierre de sesion.
 *
 * Ahora la lista vive UNA sola vez, aqui, y los dos sitios llaman a lo mismo.
 */

/**
 * Todo lo que deja de tener sentido cuando ya no hay nadie dentro.
 *
 * `recipes` e `ingredientes` NO se tocan a proposito: son el recetario, no la
 * sesion, y borrarlos dejaria al siguiente turno sin nada que consultar
 * mientras vuelve a cargar. Los cambios sin publicar tampoco se pierden.
 */
const SESION_CERRADA = Object.freeze({
  authed: false,
  // Permiso de escritura: lo primero que hay que retirar.
  autorizacion: null,
  pedirClave: false,
  // Ventanas y pantallas de trabajo: ninguna sobrevive al cambio de persona.
  settingsOpen: false,
  confirmDelete: null,
  production: null,
  planOpen: false,
  ingredientsOpen: false,
  planPrint: null,
  factor: 1,
  loginError: '',
});

/**
 * Abre la sesion en este equipo.
 *
 * El resultado de la escritura SE MIRA: si el almacenamiento no admite la marca
 * de sesion, la persona entra y la siguiente recarga la saca sin explicacion.
 *
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
export function entrarSesion() {
  const result = signIn();

  if (!result.ok) {
    notify(result.message, 'error');
    return result;
  }

  setState({ authed: true, loginError: '' });
  return result;
}

/**
 * Cierra la sesion de este equipo.
 *
 * LA CLAVE DE EDICION SE REVOCA AQUI, y es lo primero que se hace. Sin eso,
 * quien entrara despues heredaba la clave que dejo guardada la persona anterior
 * y podia publicar sin conocerla: fue un defecto real, encontrado en una
 * auditoria de seguridad. Es la unica proteccion real del sistema.
 *
 * @returns {{ok: true, value: undefined}}
 */
export function cerrarSesion() {
  setEditKey(null);
  signOut();
  setState(SESION_CERRADA);
  return { ok: true, value: undefined };
}
