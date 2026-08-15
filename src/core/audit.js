/**
 * =============================================================================
 *  REVISION DE DATOS
 * =============================================================================
 *
 *  Busca valores sospechosos en el recetario y los senala. NO corrige nada, ni
 *  siquiera propone un valor: decidir cuanto chocolate lleva una torta es del
 *  negocio, no del programa. Lo unico que hace es poner delante lo que merece
 *  una segunda mirada.
 *
 *  POR QUE EXISTE
 *  --------------
 *  Las 121 recetas vienen de anos de hoja de calculo, y ahi los errores no se
 *  ven: una celda con un cero de mas parece igual que las demas. Dos casos
 *  reales encontrados a mano en este catalogo:
 *
 *      SACHER TORTE x 8  ->  CHOCOLATE 70%: 10008 GR
 *                            Las variantes x1, x5 y x6 escalan exactas; lo
 *                            coherente serian 1008. Nueve kilos de diferencia.
 *
 *      BERLINAS          ->  LECHE medida en MG (miligramos)
 *                            Es la unica linea en MG de las 1282. Casi seguro
 *                            que deberia ser ML.
 *
 *  Las dos reglas que los detectan estan implementadas aqui.
 *
 *  COMO SE INTERPRETA
 *  ------------------
 *  Un hallazgo NO es un error confirmado: es una anomalia estadistica. Hay
 *  recetas legitimamente raras. Por eso la interfaz habla de "revisar", nunca
 *  de "corregir", y no ofrece ningun boton que cambie datos.
 */

import { normalize, splitName } from '../lib/format.js';

/** Cuantas veces tiene que aparecer una unidad para no considerarse rara. */
const UNIDAD_RARA_MAXIMO = 3;

/**
 * Lineas minimas para poder hablar de "unidad rara".
 *
 * La regla es relativa al tamano del catalogo: en un recetario de tres lineas,
 * TODAS las unidades aparecen una o dos veces y todas se marcarian. Hacen falta
 * suficientes datos para que "poco usada" signifique algo. Con las 1282 lineas
 * reales sobra de largo; el limite existe para recetarios recien empezados.
 */
const LINEAS_MINIMAS_PARA_RAREZA = 50;

/**
 * Cuanto se puede desviar una cantidad de lo que predicen sus variantes antes
 * de marcarla. Un 20% cubre el redondeo normal de una formula sin dejar pasar
 * un cero de mas.
 */
const TOLERANCIA = 0.2;

/** Gravedad de cada tipo de hallazgo, para poder ordenarlos. */
const GRAVEDAD = { alta: 3, media: 2, baja: 1 };

/**
 * Revisa el recetario entero.
 *
 * @param {Array} recipes
 * @returns {Array<{tipo: string, gravedad: string, recetaId: string, recetaNombre: string, detalle: string, sugerencia: string}>}
 */
export function revisar(recipes) {
  const hallazgos = [
    ...cantidadesFueraDePatron(recipes),
    ...unidadesRaras(recipes),
    ...ingredientesCasiIguales(recipes),
    ...cantidadesImposibles(recipes),
  ];

  // De lo mas grave a lo menos, y dentro de cada grupo por receta, para que
  // revisar la lista de arriba abajo sea revisar por prioridad.
  return hallazgos.sort(
    (a, b) => GRAVEDAD[b.gravedad] - GRAVEDAD[a.gravedad] || a.recetaId.localeCompare(b.recetaId),
  );
}

/* ===========================================================================
 *  1. CANTIDADES FUERA DEL PATRON DE SUS VARIANTES
 * ======================================================================== */

/**
 * Compara las variantes escaladas de una misma receta.
 *
 * Si existen "SACHER TORTE X 1", "X 5", "X 6" y "X 8", sus cantidades deberian
 * guardar la misma proporcion que sus rendimientos. Cuando una se sale, casi
 * siempre es un dedazo al escribir.
 *
 * Es la regla que detecta el error de los nueve kilos de chocolate.
 */
function cantidadesFueraDePatron(recipes) {
  const hallazgos = [];

  for (const familia of agruparPorFamilia(recipes)) {
    if (familia.length < 2) continue;

    // Se toma como referencia la variante de menor rendimiento: es la formula
    // base de la que salieron las demas.
    const ordenadas = [...familia].sort((a, b) => a.rinde - b.rinde);
    const base = ordenadas[0];

    for (const variante of ordenadas.slice(1)) {
      const proporcion = variante.rinde / base.rinde;
      if (!Number.isFinite(proporcion) || proporcion <= 0) continue;

      for (const item of lineas(variante.recipe)) {
        const equivalente = lineas(base.recipe).find(
          (otro) => normalize(otro.ingrediente) === normalize(item.ingrediente),
        );
        if (!equivalente) continue;

        const esperado = numero(equivalente.cantidad) * proporcion;
        const real = numero(item.cantidad);
        if (!Number.isFinite(esperado) || !Number.isFinite(real) || esperado === 0) continue;

        const desvio = Math.abs(real - esperado) / esperado;
        if (desvio <= TOLERANCIA) continue;

        hallazgos.push({
          tipo: 'Cantidad fuera de patrón',
          gravedad: desvio > 2 ? 'alta' : 'media',
          recetaId: variante.recipe.id,
          recetaNombre: variante.recipe.nombre,
          detalle: `${item.ingrediente}: ${redondear(real)} ${item.unidad}`,
          sugerencia:
            `Sus variantes escalan a ${redondear(esperado)} ${item.unidad}. ` +
            `Comparar con ${base.recipe.nombre}.`,
        });
      }
    }
  }

  return hallazgos;
}

/**
 * Agrupa las recetas que son variantes escaladas de una misma formula.
 *
 * @param {Array} recipes
 * @returns {Array<Array<{recipe: object, rinde: number}>>}
 */
function agruparPorFamilia(recipes) {
  const grupos = new Map();

  for (const recipe of recipes) {
    const { base, rinde } = splitName(recipe.nombre);
    if (!rinde) continue;

    const cantidad = parseFloat(String(rinde).replace(',', '.'));
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

    const clave = normalize(base);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push({ recipe, rinde: cantidad });
  }

  return [...grupos.values()].filter((g) => g.length > 1);
}

/* ===========================================================================
 *  2. UNIDADES QUE APENAS SE USAN
 * ======================================================================== */

/**
 * Una unidad que aparece en una o dos lineas de las 1282 suele ser un error de
 * tecleo, no una unidad de verdad. Es la regla que detecta el unico MG del
 * catalogo, en las Berlinas.
 */
function unidadesRaras(recipes) {
  const cuenta = new Map();
  let totalLineas = 0;

  for (const recipe of recipes) {
    for (const item of lineas(recipe)) {
      totalLineas += 1;
      const unidad = String(item.unidad || '').trim().toUpperCase();
      if (!unidad) continue;
      cuenta.set(unidad, (cuenta.get(unidad) || 0) + 1);
    }
  }

  // Sin datos suficientes, "poco usada" no significa nada: en un recetario
  // pequeno todas las unidades lo serian.
  if (totalLineas < LINEAS_MINIMAS_PARA_RAREZA) return [];

  const hallazgos = [];
  for (const recipe of recipes) {
    for (const item of lineas(recipe)) {
      const unidad = String(item.unidad || '').trim().toUpperCase();
      if (!unidad) continue;

      const veces = cuenta.get(unidad);
      if (veces > UNIDAD_RARA_MAXIMO) continue;

      hallazgos.push({
        tipo: 'Unidad poco usada',
        gravedad: veces === 1 ? 'alta' : 'media',
        recetaId: recipe.id,
        recetaNombre: recipe.nombre,
        detalle: `${item.ingrediente}: ${redondear(numero(item.cantidad))} ${unidad}`,
        sugerencia:
          veces === 1
            ? `"${unidad}" es la única vez que aparece en todo el recetario. Revisar si debería ser otra unidad.`
            : `"${unidad}" solo aparece ${veces} veces en todo el recetario.`,
      });
    }
  }

  return hallazgos;
}

/* ===========================================================================
 *  3. INGREDIENTES ESCRITOS DE DOS FORMAS
 * ======================================================================== */

/**
 * "AZUCAR" y "AZÚCAR" son el mismo ingrediente para una persona, pero dos
 * distintos para el sistema. Importa poco hoy y mucho en la fase de costos,
 * donde cada nombre distinto es una linea de precio que mantener.
 */
function ingredientesCasiIguales(recipes) {
  const porClave = new Map();

  for (const recipe of recipes) {
    for (const item of lineas(recipe)) {
      const nombre = String(item.ingrediente || '').trim();
      if (!nombre) continue;

      // La clave ignora acentos, mayusculas y espacios de sobra: si dos
      // escrituras coinciden aqui pero difieren en el texto, son la misma cosa
      // escrita de dos maneras.
      const clave = normalize(nombre).replace(/\s+/g, ' ');
      if (!porClave.has(clave)) porClave.set(clave, new Map());

      const formas = porClave.get(clave);
      if (!formas.has(nombre)) formas.set(nombre, []);
      formas.get(nombre).push(recipe);
    }
  }

  const hallazgos = [];
  for (const formas of porClave.values()) {
    if (formas.size < 2) continue;

    const variantes = [...formas.keys()];
    const primera = formas.get(variantes[0])[0];

    hallazgos.push({
      tipo: 'Ingrediente escrito de varias formas',
      gravedad: 'baja',
      recetaId: primera.id,
      recetaNombre: primera.nombre,
      detalle: variantes.map((v) => `"${v}"`).join(' · '),
      sugerencia: 'El sistema los trata como ingredientes distintos. Conviene unificar la escritura.',
    });
  }

  return hallazgos;
}

/* ===========================================================================
 *  4. CANTIDADES IMPOSIBLES
 * ======================================================================== */

/** Cantidades que no pueden ser correctas en ninguna receta. */
function cantidadesImposibles(recipes) {
  const hallazgos = [];

  for (const recipe of recipes) {
    for (const item of lineas(recipe)) {
      const cantidad = numero(item.cantidad);

      if (!Number.isFinite(cantidad)) {
        hallazgos.push({
          tipo: 'Cantidad ilegible',
          gravedad: 'alta',
          recetaId: recipe.id,
          recetaNombre: recipe.nombre,
          detalle: `${item.ingrediente}: "${item.cantidad}"`,
          sugerencia: 'No es un número: no se puede pesar ni escalar.',
        });
        continue;
      }

      if (cantidad <= 0) {
        hallazgos.push({
          tipo: 'Cantidad en cero',
          gravedad: 'media',
          recetaId: recipe.id,
          recetaNombre: recipe.nombre,
          detalle: `${item.ingrediente}: ${cantidad}`,
          sugerencia: 'Un ingrediente con cantidad cero o negativa. Revisar si sobra la línea.',
        });
      }
    }
  }

  return hallazgos;
}

/* ===========================================================================
 *  AYUDANTES
 * ======================================================================== */

/** Todas las lineas de ingrediente de una receta, sin importar el componente. */
function lineas(recipe) {
  return recipe.componentes.flatMap((component) => component.items);
}

/** Convierte a numero admitiendo coma decimal. */
function numero(value) {
  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(',', '.'));
}

/** Redondea para mostrar, sin arrastrar el ruido de coma flotante del Excel. */
function redondear(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10).replace('.', ',') : '—';
}

/**
 * Resumen por gravedad, para el encabezado de la pantalla.
 *
 * @param {Array} hallazgos
 * @returns {{alta: number, media: number, baja: number, total: number}}
 */
export function resumen(hallazgos) {
  return {
    alta: hallazgos.filter((h) => h.gravedad === 'alta').length,
    media: hallazgos.filter((h) => h.gravedad === 'media').length,
    baja: hallazgos.filter((h) => h.gravedad === 'baja').length,
    total: hallazgos.length,
  };
}
