/**
 * =============================================================================
 *  CATALOGO DE INGREDIENTES
 * =============================================================================
 *
 *  Recorre las 121 recetas y saca la lista de ingredientes DISTINTOS que se
 *  usan, con cuantas veces aparece cada uno y cuanto se gasta en total.
 *
 *  PARA QUE SIRVE HOY
 *  ------------------
 *  Para saber que se compra de verdad. El recetario tiene 1282 lineas de
 *  ingrediente, pero solo 159 ingredientes distintos: el resto son repeticiones
 *  del mismo producto en recetas distintas. Esta lista es la que responde a
 *  "cuantos productos distintos manejo" y "cuales son los que mas peso tienen".
 *
 *  PARA QUE VA A SERVIR
 *  --------------------
 *  Es la base del costeo. Cuando cada ingrediente tenga un precio, el costo de
 *  una receta sale de multiplicar sus cantidades por ese precio, y el costo de
 *  la produccion del dia de sumar las recetas del plan. Por eso aqui ya se
 *  calcula el TOTAL de cada ingrediente agrupado por unidad: es exactamente lo
 *  que hay que multiplicar por el precio.
 *
 *  LA REGLA DE LAS UNIDADES
 *  ------------------------
 *  Un mismo ingrediente puede aparecer en gramos en una receta y en unidades en
 *  otra. NUNCA se suman entre si: cada unidad lleva su propio total. Sumar 500
 *  GR con 2 UND daria una cifra sin ningun significado, y con un precio por
 *  medio el error se convertiria en dinero.
 *
 *  Funciones puras: no tocan el DOM ni el almacenamiento, y no modifican las
 *  recetas que reciben.
 */

import { normalize } from '../lib/format.js';

/**
 * @typedef {Object} Ingrediente
 * @property {string} nombre           como se escribe en las recetas
 * @property {number} lineas           en cuantas lineas aparece
 * @property {number} recetas          en cuantas recetas distintas aparece
 * @property {Array<{unidad: string, total: number}>} totales  gasto por unidad
 * @property {Array<{id: string, nombre: string, categoria: string, unidades: Array<string>}>} enRecetas
 *   donde se usa, en orden alfabetico, con las unidades que emplea cada receta
 */

/**
 * Construye el catalogo a partir del recetario.
 *
 * @param {Array} recipes
 * @returns {Array<Ingrediente>} ordenado de mas usado a menos
 */
export function catalogoIngredientes(recipes) {
  /** @type {Map<string, Ingrediente & {_unidades: Map<string, number>, _recetas: Map<string, {nombre: string, categoria: string}>}>} */
  const mapa = new Map();

  for (const recipe of recipes || []) {
    for (const componente of recipe.componentes || []) {
      for (const item of componente.items || []) {
        const nombre = String(item.ingrediente || '').trim();
        if (!nombre) continue;

        // Se agrupa ignorando acentos y mayusculas, pero se conserva la
        // primera forma escrita para mostrarla: "AZÚCAR" y "AZUCAR" son el
        // mismo producto en la despensa.
        const clave = normalize(nombre).replace(/\s+/g, ' ');

        if (!mapa.has(clave)) {
          mapa.set(clave, {
            nombre,
            lineas: 0,
            recetas: 0,
            totales: [],
            enRecetas: [],
            _unidades: new Map(),
            _recetas: new Map(),
          });
        }

        const entrada = mapa.get(clave);
        entrada.lineas += 1;

        const unidad = String(item.unidad || '').trim().toUpperCase() || '—';

        // Se guarda tambien la categoria: la lista desplegada la usa para poner
        // el punto de color, la misma señal de lectura rapida que el listado
        // principal. Sin ella habria que volver a buscar cada receta por id.
        //
        // Y SE GUARDA LA UNIDAD DE CADA RECETA. Saber que un ingrediente se mide
        // de dos formas no sirve de nada si no se sabe DONDE: hay que unificar
        // las unidades antes de poner precios, y sin esto tocaba abrir las 121
        // recetas a mano para encontrar las que se salen.
        //
        // Es un conjunto porque una misma receta puede usar dos unidades del
        // mismo ingrediente en componentes distintos. Ocurre una vez -R048 lleva
        // agua en GR y en ML- y es justo el caso mas grave, porque la
        // incoherencia esta dentro de una sola formula.
        if (!entrada._recetas.has(recipe.id)) {
          entrada._recetas.set(recipe.id, {
            nombre: recipe.nombre,
            categoria: recipe.categoria,
            unidades: new Set(),
          });
        }
        entrada._recetas.get(recipe.id).unidades.add(unidad);

        const cantidad = numero(item.cantidad);
        if (Number.isFinite(cantidad)) {
          entrada._unidades.set(unidad, (entrada._unidades.get(unidad) || 0) + cantidad);
        }
      }
    }
  }

  const catalogo = [...mapa.values()].map((entrada) => ({
    nombre: entrada.nombre,
    lineas: entrada.lineas,
    recetas: entrada._recetas.size,
    totales: [...entrada._unidades.entries()]
      .map(([unidad, total]) => ({ unidad, total }))
      .sort((a, b) => b.total - a.total),
    // Alfabetico: la lista se recorre buscando una receta concreta, y el orden
    // de aparicion en el archivo no ayuda a nadie a encontrarla.
    enRecetas: [...entrada._recetas.entries()]
      .map(([id, receta]) => ({
        id,
        nombre: receta.nombre,
        categoria: receta.categoria,
        unidades: [...receta.unidades].sort(),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  }));

  return ordenarPorUso(catalogo);
}

/**
 * Reparte las recetas de un ingrediente segun la unidad con que lo miden.
 *
 * PARA QUE SIRVE
 * --------------
 * Es el paso que faltaba para poder unificar unidades antes del costeo. La
 * pantalla ya avisaba de que un ingrediente "se mide de dos formas distintas",
 * pero no decia DONDE, asi que la unica forma de encontrar las que se salen era
 * abrir recetas a mano. Son 67 lineas repartidas en 47 de las 121.
 *
 * EL ORDEN NO ES ALFABETICO Y ESO IMPORTA
 * ---------------------------------------
 * Los grupos salen de la unidad menos usada a la mas usada. La minoritaria es
 * casi siempre la que hay que mirar -dos recetas en ML frente a treinta y nueve
 * en GR-, asi que va arriba, donde se lee sin desplazar.
 *
 * OJO: MINORITARIA NO SIGNIFICA EQUIVOCADA. Hay dos casos distintos y solo
 * quien conoce la formula puede separarlos: el agua en GR y en ML es lo mismo
 * (1 g = 1 ml) y ninguna receta esta mal, mientras que `MANTEQUILLA 1050 UND`
 * no existe y si hay que corregirla. Por eso esto solo MUESTRA: no marca nada
 * como error ni ofrece arreglarlo en bloque.
 *
 * @param {Ingrediente} ingrediente
 * @returns {Array<{unidad: string, recetas: Array<{id: string, nombre: string, categoria: string}>}>}
 */
export function recetasPorUnidad(ingrediente) {
  const grupos = new Map();

  for (const receta of ingrediente.enRecetas || []) {
    // Una receta que use dos unidades del mismo ingrediente aparece en los dos
    // grupos, a proposito: es el caso mas grave y tiene que verse dos veces.
    for (const unidad of receta.unidades || []) {
      if (!grupos.has(unidad)) grupos.set(unidad, []);
      grupos.get(unidad).push({
        id: receta.id,
        nombre: receta.nombre,
        categoria: receta.categoria,
      });
    }
  }

  return [...grupos.entries()]
    .map(([unidad, recetas]) => ({ unidad, recetas }))
    .sort((a, b) => a.recetas.length - b.recetas.length || a.unidad.localeCompare(b.unidad));
}

/**
 * De mas usado a menos, y a igualdad de uso por orden alfabetico.
 *
 * @param {Array<Ingrediente>} catalogo
 * @returns {Array<Ingrediente>}
 */
export function ordenarPorUso(catalogo) {
  return [...catalogo].sort(
    (a, b) => b.recetas - a.recetas || b.lineas - a.lineas || a.nombre.localeCompare(b.nombre, 'es'),
  );
}

/**
 * Por orden alfabetico, para buscar uno concreto.
 *
 * @param {Array<Ingrediente>} catalogo
 * @returns {Array<Ingrediente>}
 */
export function ordenarPorNombre(catalogo) {
  return [...catalogo].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Filtra el catalogo por texto, sin distinguir acentos ni mayusculas.
 *
 * @param {Array<Ingrediente>} catalogo
 * @param {string} query
 * @returns {Array<Ingrediente>}
 */
export function filtrarIngredientes(catalogo, query) {
  const needle = normalize(query || '').trim();
  if (needle === '') return catalogo;
  return catalogo.filter((i) => normalize(i.nombre).includes(needle));
}

/**
 * Cifras generales del catalogo, para la cabecera de la pantalla.
 *
 * `enUnaSolaReceta` no es una curiosidad: son los ingredientes que habra que
 * mantener con precio actualizado para una unica receta, y eso tiene un costo
 * operativo que conviene ver antes de comprometerse con el costeo.
 *
 * @param {Array<Ingrediente>} catalogo
 * @returns {{distintos: number, lineas: number, enUnaSolaReceta: number, conVariasUnidades: number}}
 */
export function resumenCatalogo(catalogo) {
  return {
    distintos: catalogo.length,
    lineas: catalogo.reduce((n, i) => n + i.lineas, 0),
    enUnaSolaReceta: catalogo.filter((i) => i.recetas === 1).length,
    conVariasUnidades: catalogo.filter((i) => i.totales.length > 1).length,
  };
}

function numero(value) {
  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(',', '.'));
}
