/**
 * =============================================================================
 *  PERIODOS DEL RESUMEN
 * =============================================================================
 *
 *  Que dias mira el panel y con que dias se compara. Todo el panel usa estas
 *  mismas funciones para que «30 días» signifique lo mismo en cada cifra.
 *
 *  SIEMPRE HASTA HOY. Los periodos terminan hoy, no al final de la semana o del
 *  mes: el panel dice como vamos, y un mes que aun no termina se compara con el
 *  MISMO numero de dias del mes anterior (del 1 al 21 contra del 1 al 21), no
 *  con el mes anterior entero, que siempre pareceria mejor.
 *
 *  CUBETAS PARCIALES. Una grafica por semanas empieza en lunes y la ultima
 *  semana llega solo hasta hoy. La primera y la ultima cubeta pueden ser mas
 *  cortas; se dice en sus fechas `desde`/`hasta`, no se estiran.
 *
 *  Fechas = dias de Colombia (`hoyLocal`). Semanas desde el lunes, como la
 *  agenda. Funciones puras.
 */

import { fechaValida, semanaDe, sumarDias } from '../bitacora.js';
import { ok, err } from '../storage.js';
import { CATEGORIES } from '../schema.js';

/** Periodos que ofrece el panel, en su orden de presentacion. */
export const PERIODOS_BI = Object.freeze({
  '7d': Object.freeze({ nombre: '7 días', grano: 'dia' }),
  '30d': Object.freeze({ nombre: '30 días', grano: 'dia' }),
  mes: Object.freeze({ nombre: 'Este mes', grano: 'dia' }),
  '12s': Object.freeze({ nombre: '12 semanas', grano: 'semana' }),
  '12m': Object.freeze({ nombre: '12 meses', grano: 'mes' }),
});

export const PERIODO_POR_DEFECTO = '30d';

const inicioDeMes = (fecha) => `${fecha.slice(0, 7)}-01`;

/** Primer dia del mes que esta `pasos` meses despues del de `fecha`. */
function mesDesplazado(fecha, pasos) {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7)) - 1;
  return new Date(Date.UTC(anio, mes + pasos, 1)).toISOString().slice(0, 10);
}

/** Ultimo dia del mes de `fecha`. */
export const finDeMes = (fecha) => sumarDias(mesDesplazado(fecha, 1), -1);

/** Dias entre dos fechas, contando las dos. */
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 86400000) + 1;
}

/**
 * Rango de un periodo que termina hoy y el rango con el que se compara.
 *
 * @param {string} clave una de `PERIODOS_BI`
 * @param {string} hoy 'YYYY-MM-DD'
 */
export function rangoDe(clave, hoy) {
  if (!Object.hasOwn(PERIODOS_BI, clave)) return err('periodo', 'Elige un periodo: 7 días, 30 días, este mes, 12 semanas o 12 meses.');
  if (!fechaValida(hoy)) return err('fecha', 'La fecha de hoy no es válida.');
  const { nombre, grano } = PERIODOS_BI[clave];
  let desde; let anterior;
  if (clave === '7d' || clave === '30d') {
    const n = clave === '7d' ? 7 : 30;
    desde = sumarDias(hoy, -(n - 1));
    anterior = { desde: sumarDias(desde, -n), hasta: sumarDias(desde, -1) };
  } else if (clave === 'mes') {
    desde = inicioDeMes(hoy);
    const previo = mesDesplazado(hoy, -1);
    // Mismo numero de dias desde el dia 1 del mes previo, sin pasar de su fin:
    // el 31 de marzo se compara con febrero entero, no con el 3 de marzo.
    const tope = finDeMes(previo);
    const hastaPrevio = sumarDias(previo, diasEntre(desde, hoy) - 1);
    anterior = { desde: previo, hasta: hastaPrevio < tope ? hastaPrevio : tope };
  } else if (clave === '12s') {
    desde = sumarDias(semanaDe(hoy)[0], -77);
    anterior = { desde: sumarDias(desde, -84), hasta: sumarDias(desde, -1) };
  } else {
    desde = mesDesplazado(hoy, -11);
    anterior = { desde: mesDesplazado(hoy, -23), hasta: sumarDias(desde, -1) };
  }
  return ok({ clave, nombre, grano, desde, hasta: hoy, dias: diasEntre(desde, hoy), anterior });
}

/** Inicio natural de la cubeta que contiene `fecha` (lunes o dia 1). */
export function cubetaDe(fecha, grano) {
  if (grano === 'semana') return semanaDe(fecha)[0];
  if (grano === 'mes') return inicioDeMes(fecha);
  return fecha;
}

/** Cubetas contiguas que cubren `desde..hasta`; la primera y la ultima pueden ser parciales. */
export function cubetas(desde, hasta, grano) {
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) return [];
  const lista = [];
  let inicio = cubetaDe(desde, grano);
  while (inicio <= hasta) {
    const siguiente = grano === 'semana' ? sumarDias(inicio, 7) : grano === 'mes' ? mesDesplazado(inicio, 1) : sumarDias(inicio, 1);
    const fin = sumarDias(siguiente, -1);
    lista.push({ desde: inicio < desde ? desde : inicio, hasta: fin > hasta ? hasta : fin });
    inicio = siguiente;
  }
  return lista;
}

/**
 * Buscador de cubeta por fecha: devuelve el indice o -1 si la fecha no cae en
 * ninguna. Se arma una vez por serie para no recorrer las cubetas por cada hecho.
 */
export function indiceDeCubetas(lista) {
  const porDia = new Map();
  lista.forEach((c, i) => {
    for (let d = c.desde; d <= c.hasta; d = sumarDias(d, 1)) porDia.set(d, i);
  });
  return (fecha) => porDia.get(fecha) ?? -1;
}

/** Variacion como proporcion (0,12 = +12 %); null si no hay con que comparar. */
export function variacionEntre(actual, anterior) {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior) || anterior <= 0) return null;
  return (actual - anterior) / anterior;
}

/**
 * Semaforo de una cifra contra su meta.
 *
 * 'subir': cumplir es llegar a la meta; hasta `tolerancia` por debajo es atencion.
 * 'bajar': cumplir es no pasarla; hasta `tolerancia` por encima es atencion.
 */
export function estadoContraMeta(valor, meta, sentido, tolerancia) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return 'sin_datos';
  if (meta === null || meta === undefined || !Number.isFinite(meta) || (sentido !== 'subir' && sentido !== 'bajar')) return 'sin_meta';
  const margen = Number.isFinite(tolerancia) && tolerancia > 0 ? tolerancia : 0;
  if (sentido === 'subir') {
    if (valor >= meta) return 'bien';
    return valor >= meta - margen ? 'atencion' : 'mal';
  }
  if (valor <= meta) return 'bien';
  return valor <= meta + margen ? 'atencion' : 'mal';
}

/**
 * Indicador con la forma comun del panel. Calcula la variacion y el semaforo
 * en un solo sitio para que todas las tarjetas sigan la misma regla.
 */
export function crearIndicador({ id, nombre, valor = null, formato, anterior = null, sentido = 'neutral', meta = null,
  tolerancia = null, dinero = false, base = null, definicion, chispa: valoresChispa = null, estado = null,
  comparadoCon = null }) {
  const limpio = (v) => (Number.isFinite(v) ? v : null);
  const v = limpio(valor);
  const a = limpio(anterior);
  const m = limpio(meta);
  return {
    id, nombre, valor: v, formato, anterior: a, variacion: variacionEntre(v, a), sentido, meta: m,
    estado: estado ?? (v === null ? 'sin_datos' : estadoContraMeta(v, m, sentido, tolerancia)),
    dinero, base, definicion, chispa: Array.isArray(valoresChispa) ? valoresChispa : null,
    // Contra qué se mide `anterior` cuando NO es el periodo anterior (p. ej. el
    // costo previsto por la receta). Sin esto la tarjeta diría «frente a los 30
    // días anteriores» de una cifra que no viene de ahí.
    comparadoCon: typeof comparadoCon === 'string' && comparadoCon ? comparadoCon : null,
  };
}

// --- Ayudas comunes de los indicadores ---------------------------------------

/** La fecha cae dentro del rango (los dos extremos incluidos). */
export const enRango = (fecha, rango) => fecha >= rango.desde && fecha <= rango.hasta;

export const sumarCampo = (lista, campo) => lista.reduce((s, x) => s + (Number(campo ? x[campo] : x) || 0), 0);

/** Proporcion en porcentaje (0-100); null si el divisor no es positivo. */
export const porcentaje = (parte, total) => (total > 0 && Number.isFinite(parte) ? (parte / total) * 100 : null);

/** Division que devuelve null en vez de infinito o NaN. */
export const dividir = (a, b) => (b > 0 && Number.isFinite(a) ? a / b : null);

export function mediana(valores) {
  const orden = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!orden.length) return null;
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

/** Las tres areas del catalogo siempre, y al final las ajenas que aparezcan. */
export function areasDe(...listas) {
  const extra = new Set();
  for (const lista of listas) for (const x of lista) if (x.area && !CATEGORIES.includes(x.area)) extra.add(x.area);
  return [...CATEGORIES, ...extra];
}

const TONO_AREA = { 'PASTELERÍA': 'pasteleria', 'PANADERÍA': 'panaderia', GALLETAS: 'galletas' };
/** Tono de grafica de un area; lo ajeno al catalogo es 'otros'. */
export const tonoDeArea = (area) => TONO_AREA[area] || 'otros';

/** Nombre legible de un area del catalogo: 'PASTELERÍA' -> 'Pastelería'. */
export const nombreDeArea = (area) => (area ? area.charAt(0) + area.slice(1).toLowerCase() : 'Sin área');

/**
 * Estado y base de «Ingredientes por acabarse». No lleva meta numérica: «Meta:
 * máximo 0» junto a un 0 no dice de qué es el cero. La referencia real es la
 * cobertura mínima en días, y se escribe en la base.
 *
 * @param {number} bajas cuántos ingredientes no alcanzan la cobertura mínima
 * @param {number} consumidos cuántos ingredientes tuvieron consumo en 28 días
 * @param {number} diasMinimos la meta de cobertura, en días
 */
export function coberturaBajaResumen(bajas, consumidos, diasMinimos) {
  const dias = plural(diasMinimos, 'día', 'días');
  if (!consumidos) return { valor: null, estado: 'sin_datos', base: 'Sin consumo registrado en los últimos 28 días' };
  return {
    valor: bajas,
    estado: bajas === 0 ? 'bien' : bajas <= 2 ? 'atencion' : 'mal',
    base: bajas === 0 ? `Todos alcanzan para ${dias} o más` : `${plural(bajas, 'ingrediente')} por debajo de ${dias}`,
  };
}

/** Palabras que en un nombre propio de receta o ingrediente van en minúscula. */
const MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'o', 'x', 'con', 'sin', 'para', 'en', 'a', 'al',
  // Unidades del rendimiento («x 10 und»).
  'und', 'unds', 'gr', 'kg', 'ml', 'lt', 'porc', 'paq']);

/**
 * Nombre de receta o ingrediente para leer, igual en todo el panel: «Biscottis
 * de Almendra y Chocolate Chips», «Azúcar (Yemas)», «Pan Brioche x 10 und». El
 * recetario los guarda en mayúsculas y la misma receta no debe aparecer escrita
 * de dos maneras (en mayúsculas en un aviso y con Cada Palabra en una tabla).
 * Solo cambia cómo se muestra; el dato guardado no se toca.
 *
 * @param {string} nombre
 * @returns {string}
 */
export function nombreLegible(nombre) {
  const limpio = String(nombre || '').trim().replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  if (!limpio) return '';
  const palabras = limpio.toLocaleLowerCase('es').split(' ');
  return palabras.map((p, i) => {
    if (i > 0 && MENORES.has(p)) return p;
    // Las siglas entre paréntesis («(SCM)») se conservan como vinieron.
    const original = limpio.split(' ')[i];
    if (/^\(?[A-ZÁÉÍÓÚÑÜ]{2,4}\)?$/.test(original) && original.startsWith('(')) return original;
    return p.replace(/^(\(?)(\p{L})/u, (_m, abre, letra) => abre + letra.toLocaleUpperCase('es'));
  }).join(' ');
}

/** Id estable de la serie de un area en las graficas. */
export const serieDeArea = (area) => TONO_AREA[area] || `otros:${area}`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** 'lun 14 sep': dia corto para textos de alertas y bases. */
export function diaCorto(fecha) {
  const d = new Date(fecha + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

/** Cifra con separador de miles colombiano, para textos (no para dinero). */
export const cifraCorta = (n, decimales = 0) => (Number.isFinite(n)
  ? n.toLocaleString('es-CO', { maximumFractionDigits: decimales, minimumFractionDigits: 0 }) : '—');

/** Singular o plural segun la cantidad: plural(1, 'receta') -> '1 receta'. */
export const plural = (n, singular, varias = `${singular}s`) => `${cifraCorta(n)} ${n === 1 ? singular : varias}`;

/**
 * Indicadores sin ningun hecho detras: sin historia, «0 tandas» no es una cifra
 * medida sino la ausencia de datos, y se dice asi (valor null, 'sin_datos').
 */
export const vaciarIndicadores = (indicadores) => indicadores.map((i) => ({
  ...i, valor: null, anterior: null, variacion: null, estado: 'sin_datos', chispa: null,
}));
