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
import { setEditKey } from '../core/remote.js';

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
 * Ojo: guardar NO publica. El cambio queda en este dispositivo hasta que
 * alguien pulse Publicar; por eso el mensaje lo dice de forma explicita.
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
  notify('Receta guardada en este equipo.', 'success');
  announce('Receta guardada.');
  navigate({ name: 'detail', id: recipe.id });

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
    setState({ confirmDelete: null });
    return result;
  }

  refreshState();
  setState({ confirmDelete: null });
  notify('Receta eliminada.', 'success');
  announce('Receta eliminada.');
  navigate({ name: 'index', id: null });

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
