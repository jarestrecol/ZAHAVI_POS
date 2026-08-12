/**
 * Validacion y normalizacion del recetario.
 *
 * Todo dato que entra desde fuera (archivo de respaldo elegido por la persona
 * usuaria, JSON semilla, contenido previo de localStorage escrito por una version
 * anterior) pasa por aqui antes de llegar al estado. La version anterior solo
 * comprobaba Array.isArray, de modo que un respaldo incompleto rompia el render
 * despues de haberse guardado.
 */

import { ok, err } from './storage.js';

/**
 * Categorias del recetario.
 *
 * Son las tres que usa la panaderia y no hay mas: las 121 recetas se reparten
 * entre ellas sin excepcion. Antes existia una cuarta, "OTROS", que no usaba
 * ninguna receta y solo servia para ensuciar el selector del editor.
 */
export const CATEGORIES = Object.freeze(['PASTELERÍA', 'PANADERÍA', 'GALLETAS']);

/**
 * Categoria que se asigna cuando un dato llega sin ella. Se elige pasteleria
 * por ser la mayoritaria, para que nada quede fuera de los tres filtros.
 */
export const DEFAULT_CATEGORY = 'PASTELERÍA';

/** Unidades sugeridas en el editor. El campo admite texto libre. */
export const UNITS = Object.freeze(['GR', 'ML', 'UND', 'MG', 'CM']);

/** Nombre por defecto de un componente sin titulo. */
export const DEFAULT_COMPONENT = 'PRINCIPAL';

/** Version actual del formato guardado. */
export const SCHEMA_VERSION = 2;

/** Tope de recetas por respaldo. Corta archivos absurdos antes de procesarlos. */
const MAX_RECIPES = 5000;

/** Tope de items por componente. */
const MAX_ITEMS = 500;

/** Longitud maxima de un campo de texto libre. */
const MAX_TEXT = 20000;

/**
 * Normaliza una receta suelta, rellenando lo que falte en lugar de rechazarla.
 * Se usa para datos ya aceptados; la puerta de entrada es validateBackup.
 *
 * @param {any} input
 * @param {number} position indice usado para generar un id si no lo trae
 * @returns {{id: string, nombre: string, categoria: string, metodo: string, componentes: Array}}
 */
export function normalizeRecipe(input, position = 0) {
  const source = input && typeof input === 'object' ? input : {};
  const componentes = Array.isArray(source.componentes) ? source.componentes : [];

  return {
    id: cleanText(source.id) || 'R' + String(position + 1).padStart(3, '0'),
    nombre: cleanText(source.nombre),
    categoria: normalizeCategory(source.categoria),
    metodo: cleanText(source.metodo),
    componentes: componentes.slice(0, MAX_ITEMS).map(normalizeComponent).filter((c) => c.items.length > 0),
  };
}

function normalizeComponent(input) {
  const source = input && typeof input === 'object' ? input : {};
  const items = Array.isArray(source.items) ? source.items : [];
  return {
    nombre: cleanText(source.nombre) || DEFAULT_COMPONENT,
    items: items.slice(0, MAX_ITEMS).map(normalizeItem).filter((item) => item.ingrediente !== ''),
  };
}

function normalizeItem(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    ingrediente: cleanText(source.ingrediente),
    cantidad: cleanText(source.cantidad),
    unidad: cleanText(source.unidad),
  };
}

function normalizeCategory(value) {
  const clean = cleanText(value).toUpperCase();
  return clean || DEFAULT_CATEGORY;
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_TEXT).trim();
}

/**
 * Valida una receta antes de guardarla desde el editor.
 *
 * @param {any} draft
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function validateRecipe(draft) {
  if (!draft || typeof draft !== 'object') {
    return err('recipe_invalid', 'La receta no tiene un formato válido.');
  }
  const nombre = cleanText(draft.nombre);
  if (nombre === '') {
    return err('name_required', 'El nombre de la receta es obligatorio.');
  }
  const normalized = normalizeRecipe({ ...draft, nombre });
  if (normalized.componentes.length === 0) {
    return err('items_required', 'Agrega al menos un ingrediente con nombre.');
  }
  return ok(normalized);
}

/**
 * Valida un archivo de respaldo completo. Politica de todo o nada: si el archivo
 * no es reconocible no se toca nada de lo que ya hay guardado.
 *
 * Acepta tres formas por compatibilidad:
 *   - { version, recipes: [...], ingredientes: [...] }  formato actual
 *   - { recipes: [...] }                                 formato de la version anterior
 *   - [ ... ]                                            array pelado muy antiguo
 *
 * @param {any} input
 * @returns {{ok: true, value: {version: number, recipes: Array, ingredientes: Array}} | {ok: false, code: string, message: string}}
 */
export function validateBackup(input) {
  const rawRecipes = extractRecipes(input);
  if (rawRecipes === null) {
    return err(
      'backup_shape',
      'El archivo no parece un respaldo del recetario. Debe contener una lista de recetas.',
    );
  }
  if (rawRecipes.length > MAX_RECIPES) {
    return err('backup_too_large', `El archivo supera el límite de ${MAX_RECIPES} recetas.`);
  }

  const recipes = rawRecipes.map(normalizeRecipe).filter((recipe) => recipe.nombre !== '');
  if (recipes.length === 0) {
    return err('backup_empty', 'El archivo no contiene ninguna receta con nombre.');
  }

  return ok({
    version: SCHEMA_VERSION,
    recipes: dedupeIds(recipes),
    ingredientes: extractIngredients(input),
  });
}

function extractRecipes(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.recipes)) return input.recipes;
  return null;
}

function extractIngredients(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.ingredientes)) return [];
  return input.ingredientes
    .map((item, index) => {
      const source = item && typeof item === 'object' ? item : {};
      return {
        id: cleanText(source.id) || 'I' + String(index + 1).padStart(3, '0'),
        nombre: cleanText(source.nombre),
        unidad: cleanText(source.unidad),
      };
    })
    .filter((item) => item.nombre !== '');
}

/**
 * Garantiza ids unicos. Un respaldo con ids repetidos hacia que editar una receta
 * sobrescribiera otra distinta.
 *
 * @param {Array<{id: string}>} recipes
 * @returns {Array<{id: string}>}
 */
function dedupeIds(recipes) {
  const seen = new Set();
  return recipes.map((recipe) => {
    if (!seen.has(recipe.id)) {
      seen.add(recipe.id);
      return recipe;
    }
    let counter = 1;
    let candidate = `${recipe.id}-${counter}`;
    while (seen.has(candidate)) {
      counter += 1;
      candidate = `${recipe.id}-${counter}`;
    }
    seen.add(candidate);
    return { ...recipe, id: candidate };
  });
}

/**
 * Siguiente id libre con el formato Rnnn.
 *
 * @param {Array<{id: string}>} recipes
 * @returns {string}
 */
export function nextRecipeId(recipes) {
  const taken = new Set(recipes.map((recipe) => recipe.id));
  let n = 1;
  while (taken.has('R' + String(n).padStart(3, '0'))) n += 1;
  return 'R' + String(n).padStart(3, '0');
}

/**
 * Receta vacia para el formulario de creacion.
 *
 * @param {string} id
 * @returns {object}
 */
export function emptyRecipe(id) {
  return {
    id,
    nombre: '',
    categoria: 'PASTELERÍA',
    metodo: '',
    componentes: [{ nombre: DEFAULT_COMPONENT, items: [{ ingrediente: '', cantidad: '', unidad: 'GR' }] }],
  };
}
