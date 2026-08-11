/**
 * Validacion del recetario en el servidor.
 *
 * El navegador ya valida antes de guardar, pero esa comprobacion no sirve de
 * nada aqui: este endpoint es la unica puerta de escritura sobre el recetario
 * real, y quien llame a la API directamente se salta el cliente entero. Un envio
 * con la clave correcta pero mal formado reemplazaria las recetas de las dos
 * sedes por basura.
 *
 * Las reglas son las mismas que en `src/core/schema.js`. Estan duplicadas a
 * proposito: el modulo del navegador depende de `window` y no se puede importar
 * desde una funcion de servidor.
 *
 * El prefijo _ evita que Vercel publique este archivo como ruta.
 */

/** Tope de recetas por envio. */
const MAX_RECIPES = 5000;

/** Tope de items por componente y de componentes por receta. */
const MAX_ITEMS = 500;

/** Longitud maxima de un campo de texto libre. */
const MAX_TEXT = 20000;

/** Tope del envio completo, ya serializado. */
export const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Valida y normaliza el recetario recibido.
 *
 * @param {any} recipes
 * @param {any} ingredientes
 * @returns {{ok: true, value: {recipes: Array, ingredientes: Array}} | {ok: false, error: string}}
 */
export function validatePayload(recipes, ingredientes) {
  if (!Array.isArray(recipes)) {
    return { ok: false, error: 'El envío no contiene una lista de recetas.' };
  }
  if (recipes.length === 0) {
    return { ok: false, error: 'El envío no contiene ninguna receta.' };
  }
  if (recipes.length > MAX_RECIPES) {
    return { ok: false, error: `El envío supera el límite de ${MAX_RECIPES} recetas.` };
  }
  // Un catalogo ausente o mal formado no se sustituye por vacio en silencio:
  // eso borraria los 159 ingredientes sin que nadie se entere.
  if (!Array.isArray(ingredientes)) {
    return { ok: false, error: 'El envío no contiene una lista de ingredientes válida.' };
  }

  const clean = [];
  const seen = new Set();

  for (let i = 0; i < recipes.length; i += 1) {
    const result = normalizeRecipe(recipes[i], i);
    if (!result.ok) return { ok: false, error: `Receta ${i + 1}: ${result.error}` };
    if (seen.has(result.value.id)) {
      return { ok: false, error: `Hay dos recetas con el mismo código ${result.value.id}.` };
    }
    seen.add(result.value.id);
    clean.push(result.value);
  }

  return { ok: true, value: { recipes: clean, ingredientes: ingredientes.map(normalizeIngredient) } };
}

function normalizeRecipe(input, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'no es un objeto.' };
  }

  const nombre = text(input.nombre);
  if (nombre === '') return { ok: false, error: 'no tiene nombre.' };

  if (!Array.isArray(input.componentes)) {
    return { ok: false, error: 'no tiene lista de componentes.' };
  }
  if (input.componentes.length > MAX_ITEMS) {
    return { ok: false, error: 'tiene demasiados componentes.' };
  }

  const componentes = [];
  for (const raw of input.componentes) {
    if (!raw || typeof raw !== 'object') continue;
    if (!Array.isArray(raw.items)) continue;
    if (raw.items.length > MAX_ITEMS) return { ok: false, error: 'tiene demasiados ingredientes.' };

    const items = raw.items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        ingrediente: text(item.ingrediente),
        cantidad: text(item.cantidad),
        unidad: text(item.unidad),
      }))
      .filter((item) => item.ingrediente !== '');

    if (items.length > 0) {
      componentes.push({ nombre: text(raw.nombre) || 'PRINCIPAL', items });
    }
  }

  if (componentes.length === 0) {
    return { ok: false, error: 'no tiene ningún ingrediente.' };
  }

  return {
    ok: true,
    value: {
      id: text(input.id) || 'R' + String(index + 1).padStart(3, '0'),
      nombre,
      categoria: text(input.categoria).toUpperCase() || 'OTROS',
      metodo: text(input.metodo),
      componentes,
    },
  };
}

function normalizeIngredient(input, index) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    id: text(source.id) || 'I' + String(index + 1).padStart(3, '0'),
    nombre: text(source.nombre),
    unidad: text(source.unidad),
  };
}

function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_TEXT).trim();
}
