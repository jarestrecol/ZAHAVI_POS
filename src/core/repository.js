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
 *   pulsar Publicar en Ajustes, que envia el cambio al servidor.
 *
 * Esta distincion es deliberada y visible en la interfaz. Sin ella, cada sede
 * acabaria con un recetario distinto sin que nadie se diera cuenta.
 */

import { readJson, writeJson, ok, err } from './storage.js';
import { validateBackup, nextRecipeId, SCHEMA_VERSION } from './schema.js';
import {
  fetchShared,
  publishShared,
  canPublish as canPublishRemote,
  needsReload,
  serverStatus,
} from './remote.js';

/** Clave de los cambios locales sin publicar. */
const LOCAL_KEY = 'zahavi_recetario_v1';

/** Archivo publicado que viaja con el sitio. */
const PUBLISHED_URL = './data/recipes.json';

/** Donde se aparta una copia local ilegible en lugar de sobrescribirla. */
const RESCUE_KEY = 'zahavi_recetario_rescate';

/**
 * Version publicada, o null si en este arranque no se pudo leer.
 *
 * La distincion importa: antes esto empezaba como un objeto con listas vacias, y
 * si la app arrancaba sin red se quedaba asi. Entonces el recuento de cambios
 * comparaba contra una lista vacia y anunciaba "121 nuevas" tras editar una sola
 * receta, se guardaba una revision base vacia, y se habilitaba publicar sin tener
 * con que comparar.
 *
 * @type {{recipes: Array, ingredientes: Array, revision: string}|null}
 */
let published = null;

/**
 * Estado que se muestra: el publicado, o el local si hay cambios sin publicar.
 * @type {{recipes: Array, ingredientes: Array}}
 */
let current = { recipes: [], ingredientes: [] };

/** Hay ediciones en este dispositivo que no estan en la version publicada. */
let dirty = false;

/**
 * Revision publicada sobre la que se hicieron los cambios locales. Se conserva
 * aunque no haya red, para no perder la referencia de contra que se edito.
 */
let baseRevision = '';

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

  const validation = local ? validateBackup(local) : { ok: false };
  const localValid = validation.ok ? validation.value : null;
  const localIsDirty = Boolean(local && local.dirty);

  // Habia cambios sin publicar pero la copia local no se puede leer. No se
  // sobrescribe: se aparta a una clave de rescate y se avisa. Antes se perdian
  // en silencio al guardar encima la version publicada.
  if (local && localIsDirty && !localValid) {
    writeJson(RESCUE_KEY, local);
    baseRevision = '';
    conflict = false;
    if (fetched.ok) {
      published = fetched.value;
      current = { recipes: published.recipes, ingredientes: published.ingredientes };
      dirty = false;
      cachePublished();
    } else {
      current = { recipes: [], ingredientes: [] };
      dirty = false;
    }
    return {
      ...current,
      source: 'rescued',
      warning:
        'Los cambios sin publicar de este equipo estaban dañados y no se pudieron leer. Se guardaron aparte y se muestra la versión publicada.',
    };
  }

  // Sin cambios locales: manda siempre lo publicado.
  if (!localValid || !localIsDirty) {
    conflict = false;
    if (fetched.ok) {
      current = { recipes: published.recipes, ingredientes: published.ingredientes };
      baseRevision = published.revision;
      dirty = false;
      // Se guarda copia de lo publicado aunque no haya ediciones: es lo que
      // permite abrir el recetario cuando manana no haya señal en la cocina.
      const written = cachePublished();
      return {
        ...current,
        source: 'published',
        warning: written.ok ? undefined : written.message,
      };
    }
    // Sin red y sin cambios locales, sirve la ultima copia que haya.
    if (localValid) {
      current = { recipes: localValid.recipes, ingredientes: localValid.ingredientes };
      baseRevision = typeof local.baseRevision === 'string' ? local.baseRevision : '';
      dirty = false;
      return { ...current, source: 'cache', warning: fetched.message };
    }
    current = { recipes: [], ingredientes: [] };
    return { ...current, source: 'empty', warning: fetched.message };
  }

  // Hay cambios locales sin publicar.
  current = { recipes: localValid.recipes, ingredientes: localValid.ingredientes };
  baseRevision = typeof local.baseRevision === 'string' ? local.baseRevision : '';
  dirty = true;
  conflict = Boolean(published) && baseRevision !== '' && baseRevision !== published.revision;

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

/**
 * Guarda el estado actual como cambios locales pendientes de publicar.
 *
 * Si en este arranque no se pudo leer la version publicada, se conserva la
 * revision base que ya hubiera guardada: machacarla con una cadena vacia hacia
 * perder la referencia de contra que se estaba editando.
 */
function persist() {
  return writeJson(LOCAL_KEY, {
    version: SCHEMA_VERSION,
    dirty: true,
    baseRevision: published ? published.revision : baseRevision,
    savedAt: new Date().toISOString(),
    recipes: current.recipes,
    ingredientes: current.ingredientes,
  });
}

/**
 * Guarda una copia de la version publicada, sin marcarla como cambio. Es la que
 * se usa cuando no hay conexion, asi que si esta escritura falla hay que
 * decirlo: manana en la cocina no habria recetario.
 *
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
function cachePublished() {
  if (!published) return err('sin_publicado', 'No hay versión publicada que guardar.');
  return writeJson(LOCAL_KEY, {
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
 * Descarta los cambios de este dispositivo y vuelve a la version publicada.
 *
 * @returns {{ok: true, value: number}}
 */
export function discardLocalChanges() {
  if (!published) {
    return err(
      'sin_publicado',
      'No se pudo leer la versión publicada, así que no hay a qué volver. Inténtalo con conexión.',
    );
  }
  const previous = current;
  current = { recipes: published.recipes, ingredientes: published.ingredientes };
  const written = cachePublished();
  if (!written.ok) {
    // Si no se pudo escribir, los cambios locales siguen en el almacenamiento y
    // reaparecerian al recargar: no se puede anunciar que se descartaron.
    current = previous;
    return written;
  }
  dirty = false;
  conflict = false;
  baseRevision = published.revision;
  return ok(current.recipes.length);
}

/**
 * Resumen de lo que cambia respecto de la version publicada. Sirve para que la
 * interfaz pueda decir exactamente que hay pendiente.
 *
 * @returns {{dirty: boolean, conflict: boolean, added: number, modified: number, removed: number, total: number}}
 */
export function localChanges() {
  if (!dirty) return { dirty: false, conflict: false, unknown: false, added: 0, modified: 0, removed: 0, total: 0 };

  // Sin version publicada no hay contra que comparar. Antes se comparaba contra
  // una lista vacia y se anunciaba "121 nuevas" tras editar una sola receta.
  if (!published) {
    return { dirty: true, conflict: false, unknown: true, added: 0, modified: 0, removed: 0, total: 0 };
  }

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

  // El catalogo tambien cuenta: una copia local con las mismas recetas y
  // distintos ingredientes dejaba "0 cambios" con el boton de publicar activo.
  const catalogChanged =
    JSON.stringify(published.ingredientes) !== JSON.stringify(current.ingredientes) ? 1 : 0;

  const total = added + modified + removed + catalogChanged;

  // Se escribio algo en este equipo, pero el resultado coincide con lo
  // publicado: por ejemplo, crear una receta y volver a borrarla, o deshacer a
  // mano una edicion. Para la persona no hay ningun cambio pendiente, asi que
  // tampoco debe verlo.
  //
  // La marca interna `dirty` no dice "difiere de lo publicado", dice "hay una
  // copia local que manda sobre lo publicado", y eso sigue siendo cierto: por
  // eso se corrige aqui, al informar, y no tocando la marca. Sin esto, la
  // cabecera anunciaba "0 cambios sin publicar" con el boton de publicar
  // activo, y Ajustes listaba los cambios con la enumeracion vacia.
  if (total === 0) {
    return { dirty: false, conflict, unknown: false, added: 0, modified: 0, removed: 0, catalogChanged: 0, total: 0 };
  }

  return {
    dirty: true,
    conflict,
    unknown: false,
    added,
    modified,
    removed,
    catalogChanged,
    total,
  };
}

/**
 * Identificador de la version publicada que se esta usando.
 * @returns {string}
 */
export function publishedRevision() {
  return published ? published.revision : '';
}

/**
 * Siguiente identificador libre.
 * @returns {string}
 */
export function nextId() {
  return nextRecipeId(current.recipes);
}

/**
 * Indica si este sitio puede publicar para todas las sedes o solo guardar en
 * este equipo.
 *
 * @returns {boolean}
 */
export function canPublishToAll() {
  // Hace falta el servidor, haber leido la version publicada (de ahi sale la
  // referencia que evita pisar a otra sede) y que no quede un conflicto abierto.
  return canPublishRemote() && published !== null;
}

/**
 * Indica si hay que recargar antes de poder publicar, porque otra sede publico
 * mientras tanto.
 *
 * @returns {boolean}
 */
export function needsReloadBeforePublish() {
  return needsReload();
}

/**
 * Diagnostico del enlace con el recetario compartido.
 *
 * El repositorio es la unica puerta al almacenamiento, asi que tambien es quien
 * debe contestar en que estado esta: las vistas no hablan con `remote.js`.
 *
 * @returns {{state: string, readAt: Date|null, hasReference: boolean, conflict: boolean, revision: string}}
 */
export function serverDiagnosis() {
  return { ...serverStatus(), revision: published ? published.revision : '' };
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
    baseRevision = result.value.revision;
    cachePublished();
  }

  return result;
}


