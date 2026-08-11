/**
 * Repositorio de recetas: unica puerta entre la aplicacion y el almacenamiento.
 *
 * Nada fuera de este archivo toca localStorage para leer o escribir recetas.
 */

import { readJson, writeJson, ok, err } from './storage.js';
import { validateBackup, normalizeRecipe, nextRecipeId, SCHEMA_VERSION } from './schema.js';

/** Clave del recetario. Se conserva el nombre de la version anterior para no perder datos. */
const RECIPES_KEY = 'zahavi_recetario_v1';

/** Clave de la fecha del ultimo respaldo exportado. */
const BACKUP_KEY = 'zahavi_recetario_backup_v1';

/** Ruta del archivo semilla que acompana a la aplicacion. */
const SEED_URL = './data/recipes.json';

/**
 * Estado en memoria. El repositorio es la fuente de verdad y el store lee de aqui.
 * @type {{recipes: Array, ingredientes: Array, source: string}}
 */
let cache = { recipes: [], ingredientes: [], source: 'empty' };

/**
 * Carga el recetario. Orden: lo guardado en el dispositivo, luego la semilla que
 * viaja con la aplicacion, y si nada de eso existe, vacio.
 *
 * @returns {Promise<{recipes: Array, ingredientes: Array, source: 'storage'|'seed'|'empty', warning?: string}>}
 */
export async function hydrate() {
  const stored = readJson(RECIPES_KEY, null);
  const migrated = migrate(stored);

  if (migrated && migrated.recipes.length > 0) {
    cache = { recipes: migrated.recipes, ingredientes: migrated.ingredientes, source: 'storage' };
    return { ...cache };
  }

  const seeded = await loadSeed();
  if (seeded.recipes.length > 0) {
    cache = { recipes: seeded.recipes, ingredientes: seeded.ingredientes, source: 'seed' };
    persist();
    return { ...cache };
  }

  cache = { recipes: [], ingredientes: [], source: 'empty' };
  return { ...cache, warning: seeded.warning };
}

/**
 * Convierte cualquier formato guardado previamente al formato actual.
 * v1 guardaba un array pelado de recetas, sin envoltorio ni version.
 *
 * @param {any} stored
 * @returns {{version: number, recipes: Array, ingredientes: Array}|null}
 */
function migrate(stored) {
  if (stored === null || stored === undefined) return null;
  const result = validateBackup(stored);
  if (!result.ok) return null;
  return result.value;
}

async function loadSeed() {
  try {
    const response = await fetch(SEED_URL, { cache: 'no-cache' });
    if (!response.ok) {
      return { recipes: [], ingredientes: [], warning: 'No se encontró el archivo de recetas inicial.' };
    }
    const data = await response.json();
    const result = validateBackup(data);
    if (!result.ok) {
      return { recipes: [], ingredientes: [], warning: result.message };
    }
    return { recipes: result.value.recipes, ingredientes: result.value.ingredientes };
  } catch {
    // Abrir el archivo con doble clic (file://) bloquea fetch. No es un error:
    // simplemente se empieza con el recetario vacio y se importa un respaldo.
    return {
      recipes: [],
      ingredientes: [],
      warning: 'No se pudieron cargar las recetas iniciales. Importa un respaldo desde Ajustes.',
    };
  }
}

function persist() {
  return writeJson(RECIPES_KEY, {
    version: SCHEMA_VERSION,
    recipes: cache.recipes,
    ingredientes: cache.ingredientes,
    savedAt: new Date().toISOString(),
  });
}

/**
 * Todas las recetas, en el orden en que estan guardadas.
 * @returns {Array}
 */
export function findAll() {
  return cache.recipes;
}

/**
 * Catalogo de ingredientes conocidos, usado para autocompletar en el editor.
 * @returns {Array<{id: string, nombre: string, unidad: string}>}
 */
export function allIngredients() {
  return cache.ingredientes;
}

/**
 * @param {string} id
 * @returns {object|null}
 */
export function findById(id) {
  return cache.recipes.find((recipe) => recipe.id === id) || null;
}

/**
 * Inserta o actualiza una receta ya validada.
 *
 * @param {object} recipe receta normalizada
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function save(recipe) {
  const index = cache.recipes.findIndex((item) => item.id === recipe.id);
  const recipes =
    index >= 0
      ? cache.recipes.map((item, i) => (i === index ? recipe : item))
      : [...cache.recipes, recipe];

  const previous = cache.recipes;
  cache = { ...cache, recipes };
  const written = persist();
  if (!written.ok) {
    cache = { ...cache, recipes: previous };
    return written;
  }
  return ok(recipe);
}

/**
 * Elimina una receta.
 *
 * @param {string} id
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
export function remove(id) {
  const previous = cache.recipes;
  const recipes = previous.filter((recipe) => recipe.id !== id);
  if (recipes.length === previous.length) {
    return err('not_found', 'La receta ya no existe.');
  }
  cache = { ...cache, recipes };
  const written = persist();
  if (!written.ok) {
    cache = { ...cache, recipes: previous };
    return written;
  }
  return ok(undefined);
}

/**
 * Reemplaza todo el recetario. Lo usa la importacion de respaldos.
 *
 * @param {{recipes: Array, ingredientes: Array}} backup respaldo ya validado
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
export function replaceAll(backup) {
  const previous = cache;
  cache = {
    recipes: backup.recipes.map((recipe, index) => normalizeRecipe(recipe, index)),
    ingredientes: backup.ingredientes && backup.ingredientes.length ? backup.ingredientes : previous.ingredientes,
    source: 'import',
  };
  const written = persist();
  if (!written.ok) {
    cache = previous;
    return written;
  }
  return ok(cache.recipes.length);
}

/**
 * Siguiente identificador libre.
 * @returns {string}
 */
export function nextId() {
  return nextRecipeId(cache.recipes);
}

/**
 * Contenido para exportar como archivo de respaldo.
 * @returns {object}
 */
export function toBackup() {
  return {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    recipes: cache.recipes,
    ingredientes: cache.ingredientes,
  };
}

/**
 * Marca que se acaba de exportar un respaldo, para poder avisar cuando pase
 * demasiado tiempo sin copia de seguridad.
 */
export function markBackupTaken() {
  writeJson(BACKUP_KEY, { at: new Date().toISOString(), count: cache.recipes.length });
}

/**
 * Fecha del ultimo respaldo exportado, o null si nunca se hizo uno.
 * @returns {string|null}
 */
export function lastBackupAt() {
  const record = readJson(BACKUP_KEY, null);
  return record && typeof record.at === 'string' ? record.at : null;
}
