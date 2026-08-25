/**
 * =============================================================================
 *  VALIDACION DEL RECETARIO EN EL SERVIDOR
 * =============================================================================
 *
 *  El navegador ya valida antes de guardar, pero esa comprobacion no cuenta
 *  aqui: este endpoint es la unica puerta de escritura sobre el recetario real,
 *  y quien llame a la API directamente se salta el cliente entero. Un envio con
 *  la clave correcta pero mal formado reemplazaria las recetas de las dos sedes
 *  por basura.
 *
 *  POR QUE HAY DOS VALIDACIONES Y NO UNA
 *  -------------------------------------
 *  Este archivo NO es una copia de `src/core/schema.js`. Aplican politicas
 *  distintas a proposito, porque resuelven momentos distintos:
 *
 *      src/core/schema.js  -> REPARA.  Lee lo que haya en el dispositivo o en un
 *                             archivo de respaldo y hace lo posible por
 *                             aprovecharlo: descarta lo ilegible, renombra
 *                             codigos repetidos, rellena lo que falta. Es
 *                             preferible mostrar 120 recetas que ninguna.
 *
 *      api/_schema.js      -> RECHAZA.  Antes de escribir sobre el recetario
 *                             compartido, si algo no cuadra se para todo. Es
 *                             preferible no publicar que publicar algo dudoso
 *                             encima del trabajo de las dos sedes.
 *
 *  Diferencias concretas, todas deliberadas:
 *
 *      caso                        cliente              servidor
 *      -------------------------   ------------------   ------------------
 *      receta sin nombre           la descarta          rechaza el envio
 *      codigos repetidos           renombra a R001-1    rechaza el envio
 *      componentes no es lista     lo trata como vacio  rechaza el envio
 *      ingredientes ausente        lo trata como vacio  rechaza el envio
 *
 *  `scripts/test-api.mjs` comprueba que el recetario real de produccion pasa por
 *  las dos sin que se altere ni un dato, que es la garantia que de verdad
 *  importa. Si alguien cambia una de las dos y las separa de mas, esa prueba
 *  falla.
 *
 *  El prefijo _ del nombre evita que Vercel publique este archivo como ruta.
 */

/** Tope de recetas por envio. */
const MAX_RECIPES = 5000;

/** Tope de items por componente y de componentes por receta. */
const MAX_ITEMS = 500;

/**
 * Tope del catalogo de ingredientes.
 *
 * `recipes` ya tenia su tope propio y el catalogo no, asi que quedaba acotado
 * solo por el peso total del envio. Un ingrediente ocupa pocos bytes, de modo
 * que dentro del mismo margen caben decenas de miles de entradas vacias de
 * sentido. Hoy son 159: veinte mil es imposible de alcanzar trabajando y corta
 * lo que no es trabajo.
 */
const MAX_INGREDIENTES = 20000;

/** Longitud maxima de un campo de texto libre. */
const MAX_TEXT = 20000;

/**
 * Tope del envio completo, ya serializado.
 *
 * 900 KB, no 4 MB. El limite de verdad no es este: la API de contenidos de
 * GitHub deja de entregar el archivo a partir de 1 MB, asi que un recetario
 * mayor se PUBLICA sin problema y despues no se puede volver a leer por el
 * mismo camino. Y el sintoma no ayuda: la lectura devuelve la metadata sin
 * contenido, `JSON.parse` falla y el servidor responde "el archivo de recetas
 * del repositorio no es un JSON valido", que manda a buscar una corrupcion de
 * datos que no existe.
 *
 * Mejor rechazar al publicar, que es cuando hay alguien delante leyendo el
 * mensaje. Hoy son 225 KB, asi que el margen sigue siendo enorme.
 */
export const MAX_BYTES = 900 * 1024;

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
  if (ingredientes.length > MAX_INGREDIENTES) {
    return { ok: false, error: `El envío supera el límite de ${MAX_INGREDIENTES} ingredientes.` };
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
      categoria: text(input.categoria).toUpperCase() || 'PASTELERÍA',
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
