/**
 * =============================================================================
 *  KIT DE GRAFICAS: MAPA DE CALOR (calendario)
 * =============================================================================
 *
 *  Un cuadro por dia: semanas en columnas y de lunes a domingo en filas, como
 *  el calendario de produccion. Se ve de un vistazo el ritmo de la semana
 *  (viernes y sabado fuertes, domingo textoVacio) y los huecos.
 *
 *  - UNA tonalidad (el naranja de la marca), de claro a oscuro: es magnitud,
 *    no identidad. Cuatro escalones mas el cero, que es gris de superficie; un
 *    dia sin dato (fuera de lo medido) se dibuja solo con el borde.
 *  - Escala con «Menos … Más» debajo: el color no se interpreta solo.
 *  - Cada cuadro es su propio objetivo del puntero; con el teclado, las flechas
 *    se mueven como en un calendario (arriba/abajo un dia, izquierda/derecha
 *    una semana).
 *  - El cuadro se calcula con el ancho REAL de la caja (entre 12 y 30 px) y se
 *    dibuja a una unidad por pixel: el texto sale a su tamano en una tarjeta
 *    estrecha y los cuadros no crecen sin limite en escritorio.
 */

import { el, svg } from '../../lib/dom.js';
import {
  figura, mensajeVacio, formatear, rotuloCubeta, partesDe, DIAS_SEMANA, esNumero, hayDatos,
  activarLectura, adaptarAlAncho, esEstrecho,
} from './comun.js';
import { tablaDeDatos } from './tabla.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/* El cuadro se ajusta al ancho de la caja, entre un minimo que aun se apunta
   con el raton y un maximo a partir del cual cuadros mas grandes no dicen mas. */
const CELDA_BASE = 22;
const CELDA_MIN = 12;
const CELDA_MAX = 30;
const HUECO = 3;
const IZQUIERDA = 34;
const ARRIBA = 20;
const NIVELES = 4;

/** Fecha `YYYY-MM-DD` desplazada `dias`, sin pasar por la zona horaria. */
function sumar(iso, dias) {
  const { anio, mes, dia } = partesDe(iso);
  const f = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return f.toISOString().slice(0, 10);
}

/** Escalon de color de un valor: 0 = cero, 1..4 = cuartos del maximo. */
function nivelDe(valor, maximo) {
  if (!esNumero(valor)) return 'sin';
  if (valor <= 0 || maximo <= 0) return '0';
  return String(Math.min(NIVELES, Math.max(1, Math.ceil((valor / maximo) * NIVELES))));
}

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {Array<{fecha: string, valor: number|null, detalle?: string}>} opciones.dias
 * @param {string} opciones.formato
 * @param {string} [opciones.subtitulo]
 * @param {string} [opciones.vacio]
 * @returns {HTMLElement} `<figure class="graf">`
 */
export function mapaDeCalor({ titulo, dias, formato = 'numero', subtitulo, vacio: textoVacio } = {}) {
  const caja = figura({ titulo, subtitulo, clase: 'graf--calor' });
  const validos = (Array.isArray(dias) ? dias : []).filter((d) => d && partesDe(d.fecha));
  if (!validos.length || !hayDatos(validos.map((d) => d.valor))) {
    caja.append(mensajeVacio(textoVacio));
    return caja;
  }

  const porFecha = new Map(validos.map((d) => [d.fecha, d]));
  const fechas = [...porFecha.keys()].sort();
  const desde = fechas[0];
  const hasta = fechas[fechas.length - 1];
  const inicio = sumar(desde, -partesDe(desde).semana);            // lunes de la primera semana
  const fin = sumar(hasta, 6 - partesDe(hasta).semana);             // domingo de la ultima

  // Celdas del rango medido, en orden: dos celdas seguidas son dos dias seguidos.
  const celdas = [];
  for (let f = inicio, k = 0; f <= fin; f = sumar(f, 1), k++) {
    if (f < desde || f > hasta) continue;
    const dato = porFecha.get(f);
    celdas.push({ fecha: f, columna: Math.floor(k / 7), fila: k % 7, valor: esNumero(dato?.valor) ? dato.valor : null, detalle: dato?.detalle || '' });
  }
  const semanas = celdas[celdas.length - 1].columna + 1;
  const maximo = Math.max(0, ...celdas.map((c) => c.valor ?? 0));

  const conValor = celdas.filter((c) => c.valor !== null);
  const mayor = conValor.reduce((a, c) => (c.valor > a.valor ? c : a), conValor[0]);
  const activos = conValor.filter((c) => c.valor > 0);
  const ceros = conValor.length - activos.length;
  const promedio = activos.length ? activos.reduce((s, c) => s + c.valor, 0) / activos.length : null;
  const etiqueta = [
    `${titulo || 'Mapa de calor'}. Calendario de ${semanas} ${semanas === 1 ? 'semana' : 'semanas'}, del ${rotuloCubeta({ desde }, 'dia', { largo: true })} al ${rotuloCubeta({ desde: hasta }, 'dia', { largo: true })}; un cuadro por día, de lunes a domingo hacia abajo.`,
    `Día más alto: ${rotuloCubeta({ desde: mayor.fecha }, 'dia', { largo: true })}, ${formatear(mayor.valor, formato)}.`,
    `${ceros} ${ceros === 1 ? 'día' : 'días'} en cero.`,
    promedio !== null ? `Promedio de los días con actividad: ${formatear(promedio, formato)}.` : '',
    'Con el foco en la gráfica, arriba y abajo cambian de día, izquierda y derecha de semana. Todas las cifras están en la tabla.',
  ].filter(Boolean).join(' ');
  const indiceDeFecha = new Map(celdas.map((c, i) => [c.fecha, i]));

  const lienzo = el('div', { class: 'graf__lienzo' });
  caja.append(lienzo);

  // El dibujo se hace al ancho real de la caja, y se rehace si cambia.
  adaptarAlAncho(lienzo, (anchoPx) => {
    const celda = anchoPx
      ? Math.max(CELDA_MIN, Math.min(CELDA_MAX, Math.floor((anchoPx - IZQUIERDA) / semanas - HUECO)))
      : CELDA_BASE;
    const paso = celda + HUECO;
    const ancho = IZQUIERDA + semanas * paso;
    const alto = ARRIBA + 7 * paso;
    const xDe = (c) => IZQUIERDA + c.columna * paso;
    const yDe = (c) => ARRIBA + c.fila * paso;

    const hijos = [];
    // Dias de la semana a la izquierda; con cuadros pequenos, uno si y otro no.
    const apretado = celda < 16 || (!anchoPx && esEstrecho());
    DIAS_SEMANA.forEach((nombre, fila) => {
      if (apretado && fila % 2 === 1) return;
      hijos.push(svg('text', { class: 'graf__eje', x: IZQUIERDA - 6, y: ARRIBA + fila * paso + celda / 2 + 4, 'text-anchor': 'end' }, [nombre]));
    });
    // Mes arriba, en la semana donde empieza. La primera columna lleva el mes
    // de su primer dia, salvo que en ella empiece otro (29 jun–5 jul es «jul»).
    // Dos rotulos quedan al menos a dos columnas.
    const mesDeColumna = new Map();
    for (const c of celdas) {
      const d = partesDe(c.fecha);
      if (d.dia === 1) mesDeColumna.set(c.columna, d.mes);
      else if (c.columna === 0 && !mesDeColumna.has(0)) mesDeColumna.set(0, d.mes);
    }
    let ultimaColumnaMes = -3;
    for (const [columna, mes] of [...mesDeColumna].sort((x, y) => x[0] - y[0])) {
      if (columna - ultimaColumnaMes < 2) continue;
      hijos.push(svg('text', { class: 'graf__eje', x: IZQUIERDA + columna * paso, y: ARRIBA - 7 }, [MESES[mes - 1]]));
      ultimaColumnaMes = columna;
    }
    const cuadros = celdas.map((c) => svg('rect', {
      class: 'graf-calor__celda', 'data-nivel': nivelDe(c.valor, maximo),
      x: xDe(c), y: yDe(c), width: celda, height: celda, rx: 3,
    }));
    hijos.push(...cuadros);

    // Una unidad por pixel: ancho y alto propios, y nunca mas ancho que la
    // caja (antes de medirla puede pasarse; entonces escala hacia abajo).
    const dibujo = svg('svg', {
      class: 'graf__svg graf-calor__svg', viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto,
      role: 'img', 'aria-label': etiqueta,
    }, hijos);
    lienzo.append(dibujo);

    return activarLectura({
      lienzo, dibujo, total: celdas.length, ancho, alto,
      inicial: celdas.length - 1,
      indiceEn: (vx, vy) => {
        const columna = Math.floor((vx - IZQUIERDA) / paso);
        const fila = Math.floor((vy - ARRIBA) / paso);
        if (columna < 0 || fila < 0 || fila > 6) return null;
        return indiceDeFecha.get(sumar(inicio, columna * 7 + fila)) ?? null;
      },
      // Filas de arriba: el tooltip baja desde el cuadro; filas de abajo: sube.
      anclaDe: (i) => (celdas[i].fila < 4
        ? { x: xDe(celdas[i]) + celda / 2, y: yDe(celdas[i]) }
        : { x: xDe(celdas[i]) + celda / 2, y: yDe(celdas[i]) + celda, vertical: 'arriba' }),
      marcar: (i, activo) => cuadros[i].classList.toggle('graf-calor__celda--activa', activo),
      mover: (i, tecla) => ({ ArrowUp: i - 1, ArrowDown: i + 1, ArrowLeft: i - 7, ArrowRight: i + 7, Home: 0, End: celdas.length - 1 }[tecla] ?? i),
      contenidoDe: (i) => {
        const c = celdas[i];
        return {
          titulo: rotuloCubeta({ desde: c.fecha }, 'dia', { largo: true }),
          filas: [{ nombre: c.detalle, valor: c.valor === null ? 'Sin dato' : formatear(c.valor, formato) }],
        };
      },
    });
  });

  // Escala: que significa cada escalon, en palabras y con sus limites.
  const cuarto = maximo / NIVELES;
  caja.append(el('div', { class: 'graf-calor__escala' }, [
    el('span', { class: 'graf-calor__escala-grupo' }, [
      el('span', { class: 'graf-calor__muestra', dataset: { nivel: '0' }, attrs: { 'aria-hidden': 'true' } }), 'Cero',
    ]),
    el('span', { class: 'graf-calor__escala-grupo' }, [
      'Menos',
      ...[1, 2, 3, 4].map((n) => el('span', { class: 'graf-calor__muestra', dataset: { nivel: String(n) }, attrs: { 'aria-hidden': 'true' } })),
      `Más (hasta ${formatear(maximo, formato, { corto: true })})`,
    ]),
    el('span', { class: 'sr-only', text: `Cada escalón de color es un cuarto del máximo: ${[1, 2, 3, 4].map((n) => `hasta ${formatear(cuarto * n, formato)}`).join(', ')}.` }),
  ]));

  const conDetalle = celdas.some((c) => c.detalle);
  caja.append(tablaDeDatos({
    titulo: titulo || 'Mapa de calor',
    columnas: [
      { id: 'dia', nombre: 'Día' },
      { id: 'valor', nombre: 'Valor', formato },
      ...(conDetalle ? [{ id: 'detalle', nombre: 'Detalle' }] : []),
    ],
    filas: celdas.map((c) => ({ dia: rotuloCubeta({ desde: c.fecha }, 'dia', { largo: true }), valor: c.valor, detalle: c.detalle })).reverse(),
  }));
  return caja;
}
