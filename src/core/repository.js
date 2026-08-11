/**
 * Repositorio de recetas: unica puerta entre la aplicacion y el almacenamiento.
 *
 * Modelo de datos de la fase 1, sin base de datos y sin servidor:
 *
 *   `data/recipes.json` del propio sitio es la version PUBLICADA. Es lo que ven
 *   todos los dispositivos, en la panaderia y en la casa de produccion, y solo
 *   cambia cuando se publica una version nueva del sitio.
 *
 *   Lo que alguien edita en su navegador queda como CAMBIO LOCAL: vive en ese
 *   dispositivo y no lo ve nadie mas. Para que llegue a las demas sedes hay que
 *   descargar el archivo actualizado y publicarlo.
 *
 * Esta distincion es deliberada y visible en la interfaz. Sin ella, cada sede
 * acabaria con un recetario distinto sin que nadie se diera cuenta.
 */

import { readJson, writeJson, ok, err } from './storage.js';
import { validateBackup, normalizeRecipe, nextRecipeId, SCHEMA_VERSION } from './schema.js';
import { fetchShared, publishShared, isRemoteAvailable } from './remote.js';

/** Clave de los cambios locales sin publicar. */
const LOCAL_KEY = 'zahavi_recetario_v1';

/** Clave de la fecha del ultimo respaldo exportado. */
const BACKUP_KEY = 'zahavi_recetario_backup_v1';

/** Archivo publicado que viaja con el sitio. */
const PUBLISHED_URL = './data/recipes.json';

/**
 * @type {{recipes: Array, ingredientes: Array, revision: string}}
 */
let published = { recipes: [], ingredientes: [], revision: '' };

/**
 * Estado que se muestra: el publicado, o el local si hay cambios sin publicar.
 * @type {{recipes: Array, ingredientes: Array}}
 */
let current = { recipes: [], ingredientes: [] };

/** Hay ediciones en este dispositivo que no estan en la version publicada. */
let dirty = false;

/**
 * La version publicada cambio mientras habia cambios locales pendientes.
 * Se avisa porque hay que decidir cual conservar.
 */
let conflict = false;

/**
 * Carga el recetario. Siempre intenta primero la version publicada, para que
 * un dispositivo nuevo vea exactamente lo mismo que los demas.
 *
 * @returns {Promise<{recipes: Array, ingredientes: Array, source: string, warning?: string}>}
 */
export async function hydrate() {
  const fetched = await loadPublished();
  const local = readJson(LOCAL_KEY, null);

  if (fetched.ok) {
    published = fetched.value;
  }

  const localValid = local && validateBackup(local).ok ? validateBackup(local).value : null;
  const localIsDirty = Boolean(local && local.dirty);

  // Sin cambios locales: manda siempre lo publicado.
  if (!localValid || !localIsDirty) {
    if (fetched.ok) {
      current = { recipes: published.recipes, ingredientes: published.ingredientes };
      dirty = false;
      // Se guarda copia de lo publicado aunque no haya ediciones: es lo que
      // permite abrir el recetario cuando manana no haya señal en la cocina.
      cachePublished();
      return { ...current, source: 'published' };
    }
    // Sin red y sin cambios locales, sirve la ultima copia que haya.
    if (localValid) {
      current = { recipes: localValid.recipes, ingredientes: localValid.ingredientes };
      dirty = false;
      return { ...current, source: 'cache', warning: fetched.message };
    }
    current = { recipes: [], ingredientes: [] };
    return { ...current, source: 'empty', warning: fetched.message };
  }

  // Hay cambios locales sin publicar.
  current = { recipes: localValid.recipes, ingredientes: localValid.ingredientes };
  dirty = true;
  conflict = fetched.ok && local.baseRevision !== undefined && local.baseRevision !== published.revision;

  return {
    ...current,
    source: 'local',
    warning: conflict
      ? 'Se publicó una versión nueva del recetario, pero este equipo tiene cambios sin publicar. Revisa cuál conservar en Ajustes.'
      : undefined,
  };
}

async function loadPublished() {
  // Primero el recetario compartido del servidor: es el que ven todas las sedes
  // y el que recoge lo que alguien acaba de publicar desde otro equipo.
  const shared = await fetchShared();
  if (shared.ok) {
    const validated = validateBackup(shared.value);
    if (validated.ok) {
      return {
        ok: true,
        value: {
          recipes: validated.value.recipes,
          ingredientes: validated.value.ingredientes,
          revision: shared.value.revision,
        },
      };
    }
  }

  // Sin funciones de servidor (archivo local, o alojamiento estatico): se lee el
  // archivo que viaja con el sitio.
  try {
    const response = await fetch(PUBLISHED_URL, { cache: 'no-cache' });
    if (!response.ok) {
      return { ok: false, message: 'No se pudo leer el recetario publicado.' };
    }
    const data = await response.json();
    const result = validateBackup(data);
    if (!result.ok) return { ok: false, message: result.message };
    return {
      ok: true,
      value: {
        recipes: result.value.recipes,
        ingredientes: result.value.ingredientes,
        revision: typeof data.revision === 'string' ? data.revision : '',
      },
    };
  } catch {
    // Sin conexion. Es lo normal en una cocina con mala señal: se sigue
    // trabajando con lo que ya esta guardado en el dispositivo.
    return { ok: false, message: 'Sin conexión: se muestra la última copia guardada en este equipo.' };
  }
}

/** Guarda el estado actual como cambios locales pendientes de publicar. */
function persist() {
  return writeJson(LOCAL_KEY, {
    version: SCHEMA_VERSION,
    dirty: true,
    baseRevision: published.revision,
    savedAt: new Date().toISOString(),
    recipes: current.recipes,
    ingredientes: current.ingredientes,
  });
}

/**
 * Guarda una copia de la version publicada, sin marcarla como cambio. Es la que
 * se usa cuando no hay conexion.
 */
function cachePublished() {
  writeJson(LOCAL_KEY, {
    version: SCHEMA_VERSION,
    dirty: false,
    baseRevision: published.revision,
    savedAt: new Date().toISOString(),
    recipes: published.recipes,
    ingredientes: published.ingredientes,
  });
}

/**
 * Todas las recetas.
 * @returns {Array}
 */
export function findAll() {
  return current.recipes;
}

/**
 * Catalogo de ingredientes, usado para autocompletar en el editor.
 * @returns {Array<{id: string, nombre: string, unidad: string}>}
 */
export function allIngredients() {
  return current.ingredientes;
}

/**
 * @param {string} id
 * @returns {object|null}
 */
export function findById(id) {
  return current.recipes.find((recipe) => recipe.id === id) || null;
}

/**
 * Inserta o actualiza una receta ya validada.
 *
 * @param {object} recipe
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function save(recipe) {
  const index = current.recipes.findIndex((item) => item.id === recipe.id);
  const recipes =
    index >= 0
      ? current.recipes.map((item, i) => (i === index ? recipe : item))
      : [...current.recipes, recipe];

  const previous = current;
  current = { ...current, recipes };
  const written = persist();
  if (!written.ok) {
    current = previous;
    return written;
  }
  dirty = true;
  return ok(recipe);
}

/**
 * Elimina una receta.
 *
 * @param {string} id
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
export function remove(id) {
  const previous = current;
  const recipes = previous.recipes.filter((recipe) => recipe.id !== id);
  if (recipes.length === previous.recipes.length) {
    return err('not_found', 'La receta ya no existe.');
  }
  current = { ...current, recipes };
  const written = persist();
  if (!written.ok) {
    current = previous;
    return written;
  }
  dirty = true;
  return ok(undefined);
}

/**
 * Reemplaza todo el recetario a partir de un respaldo validado.
 *
 * @param {{recipes: Array, ingredientes: Array}} backup
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
export function replaceAll(backup) {
  const previous = current;
  current = {
    recipes: backup.recipes.map((recipe, index) => normalizeRecipe(recipe, index)),
    ingredientes: backup.ingredientes && backup.ingredientes.length ? backup.ingredientes : previous.ingredientes,
  };
  const written = persist();
  if (!written.ok) {
    current = previous;
    return written;
  }
  dirty = true;
  return ok(current.recipes.length);
}

/**
 * Descarta los cambios de este dispositivo y vuelve a la version publicada.
 *
 * @returns {{ok: true, value: number}}
 */
export function discardLocalChanges() {
  current = { recipes: published.recipes, ingredientes: published.ingredientes };
  dirty = false;
  conflict = false;
  cachePublished();
  return ok(current.recipes.length);
}

/**
 * Resumen de lo que cambia respecto de la version publicada. Sirve para que la
 * interfaz pueda decir exactamente que hay pendiente.
 *
 * @returns {{dirty: boolean, conflict: boolean, added: number, modified: number, removed: number, total: number}}
 */
export function localChanges() {
  if (!dirty) return { dirty: false, conflict: false, added: 0, modified: 0, removed: 0, total: 0 };

  const byId = new Map(published.recipes.map((recipe) => [recipe.id, recipe]));
  let added = 0;
  let modified = 0;

  for (const recipe of current.recipes) {
    const original = byId.get(recipe.id);
    if (!original) added += 1;
    else if (JSON.stringify(original) !== JSON.stringify(recipe)) modified += 1;
  }

  const currentIds = new Set(current.recipes.map((recipe) => recipe.id));
  const removed = published.recipes.filter((recipe) => !currentIds.has(recipe.id)).length;

  return { dirty: true, conflict, added, modified, removed, total: added + modified + removed };
}

/**
 * Identificador de la version publicada que se esta usando.
 * @returns {string}
 */
export function publishedRevision() {
  return published.revision;
}

/**
 * Siguiente identificador libre.
 * @returns {string}
 */
export function nextId() {
  return nextRecipeId(current.recipes);
}

/**
 * Contenido del archivo `data/recipes.json` con el estado actual, listo para
 * reemplazar el del proyecto y publicar una version nueva.
 *
 * @returns {object}
 */
export function toPublishableFile() {
  return {
    version: SCHEMA_VERSION,
    revision: new Date().toISOString().slice(0, 10),
    recipes: current.recipes,
    ingredientes: current.ingredientes,
  };
}

/**
 * Indica si este sitio puede publicar para todas las sedes o solo guardar en
 * este equipo.
 *
 * @returns {boolean}
 */
export function canPublishToAll() {
  return isRemoteAvailable();
}

/**
 * Publica el estado actual para todas las sedes.
 *
 * @param {{password: string, author?: string}} options
 * @returns {Promise<{ok: true, value: {revision: string, count: number}} | {ok: false, code: string, error: string}>}
 */
export async function publishToAll(options) {
  const result = await publishShared({
    recipes: current.recipes,
    ingredientes: current.ingredientes,
    password: options.password,
    author: options.author,
  });

  if (result.ok) {
    // Lo publicado pasa a ser la referencia: ya no hay nada pendiente.
    published = {
      recipes: current.recipes,
      ingredientes: current.ingredientes,
      revision: result.value.revision,
    };
    dirty = false;
    conflict = false;
    cachePublished();
  }

  return result;
}

/** Marca que se acaba de exportar un respaldo. */
export function markBackupTaken() {
  writeJson(BACKUP_KEY, { at: new Date().toISOString(), count: current.recipes.length });
}

/**
 * Fecha del ultimo respaldo exportado, o null si nunca se hizo uno.
 * @returns {string|null}
 */
export function lastBackupAt() {
  const record = readJson(BACKUP_KEY, null);
  return record && typeof record.at === 'string' ? record.at : null;
}
