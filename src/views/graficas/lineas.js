/**
 * =============================================================================
 *  KIT DE GRAFICAS: LINEAS (tendencia en el tiempo)
 * =============================================================================
 *
 *  Una linea por serie sobre UNA sola escala Y. Sirve para el gasto por area,
 *  el valor de la bodega o el rendimiento: todo lo que se lee como «como va».
 *
 *  - Lineas de 2 px, rejilla de un pelo y mas clara que el dato.
 *  - Leyenda desde dos series, y el nombre al final de cada linea cuando son
 *    cuatro o menos y no se montan (si se montarian, se quitan: apilarlos
 *    lejos de su linea confunde mas que ayuda; queda la leyenda).
 *  - La serie de comparacion (el periodo anterior) va en gris punteado, detras.
 *  - Un valor nulo CORTA la linea: no se inventa un tramo que no se midio.
 *  - Sin datos o todo en cero: mensaje, y ninguna linea en cero inventada.
 *  - Al pasar el puntero, una raya vertical busca el periodo mas cercano y el
 *    tooltip dice todas las series a la vez; con el teclado, las flechas.
 */

import { el, svg } from '../../lib/dom.js';
import {
  figura, leyenda, mensajeVacio, medidasLienzo, techoRedondo, formatear, rotuloCubeta, cuantasCubetas,
  valoresDe, hayDatos, esNumero, tonoSeguro, activarLectura, adaptarAlAncho, AYUDA_TECLADO, indicesConRotulo, rejillaY, lineaDeMeta,
} from './comun.js';
import { tablaDeDatos } from './tabla.js';

const NOMBRE_GRANO = { dia: 'Día', semana: 'Semana', mes: 'Mes' };
const SEPARACION_ROTULO = 14;
const DESPLAZAMIENTO_MAXIMO = 8;
const recortar = (texto, n) => (texto.length > n ? `${texto.slice(0, n - 1)}…` : texto);

/** Trazado de una serie, cortado en cada nulo. */
function trazado(puntos, id, x, y) {
  let d = '';
  let abierto = false;
  puntos.forEach((p, i) => {
    const v = p.valores?.[id];
    if (!esNumero(v)) { abierto = false; return; }
    d += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    abierto = true;
  });
  return d.trim();
}

/** Tramos continuos para el lavado de area (una sola serie). */
function lavado(puntos, id, x, y, base) {
  const tramos = [];
  let actual = [];
  puntos.forEach((p, i) => {
    const v = p.valores?.[id];
    if (esNumero(v)) actual.push([x(i), y(v)]);
    else if (actual.length) { tramos.push(actual); actual = []; }
  });
  if (actual.length) tramos.push(actual);
  return tramos.filter((t) => t.length > 1).map((t) =>
    `M${t[0][0].toFixed(1)} ${base} ${t.map(([a, b]) => `L${a.toFixed(1)} ${b.toFixed(1)}`).join(' ')} L${t[t.length - 1][0].toFixed(1)} ${base} Z`).join(' ');
}

/** Ultimo indice con valor de una serie, o -1. */
function ultimoConValor(puntos, id) {
  for (let i = puntos.length - 1; i >= 0; i--) if (esNumero(puntos[i].valores?.[id])) return i;
  return -1;
}

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {object} opciones.serie `Serie` del contrato (§5)
 * @param {number} [opciones.alto] alto del dibujo en unidades del lienzo (272 por defecto)
 * @param {object|null} [opciones.comparacion] `Serie` del periodo anterior, mismo formato; se alinea por posicion
 * @param {string} [opciones.subtitulo] linea bajo el titulo (unidad, fuente)
 * @param {string} [opciones.vacio] texto del mensaje cuando no hay datos
 * @returns {HTMLElement} `<figure class="graf">`
 */
export function graficaLineas({ titulo, serie, alto, comparacion = null, subtitulo, vacio: textoVacio } = {}) {
  const caja = figura({ titulo, subtitulo, clase: 'graf--lineas' });
  const series = Array.isArray(serie?.series) ? serie.series : [];
  const puntos = Array.isArray(serie?.puntos) ? serie.puntos : [];
  const formato = serie?.formato || 'numero';
  const grano = serie?.grano || 'dia';
  const ids = series.map((s) => s.id);

  if (!puntos.length || !series.length || !hayDatos(valoresDe(puntos, ids))) {
    caja.append(mensajeVacio(textoVacio));
    return caja;
  }

  // La comparacion solo se dibuja si habla en la misma unidad: dos escalas
  // en un mismo eje inventarian una relacion que no esta en los datos.
  const comp = comparacion && comparacion.formato === formato && Array.isArray(comparacion.puntos) && Array.isArray(comparacion.series)
    && comparacion.series.length ? comparacion : null;
  const compIds = comp ? comp.series.map((s) => s.id) : [];
  const nombreComp = (s) => (comp.series.length === 1 ? 'Periodo anterior' : `${s.nombre} (periodo anterior)`);

  const n = puntos.length;
  const itemsLeyenda = [
    ...series.map((s) => ({ nombre: s.nombre, tono: s.tono, forma: 'linea' })),
    ...(comp ? comp.series.map((s) => ({ nombre: nombreComp(s), tono: 'comparacion', forma: 'punteada' })) : []),
  ];
  if (itemsLeyenda.length >= 2) caja.append(leyenda(itemsLeyenda));
  const lienzo = el('div', { class: 'graf__lienzo' });
  caja.append(lienzo);

  // El dibujo se hace al ancho real de la caja, y se rehace si cambia.
  adaptarAlAncho(lienzo, (anchoPx) => {
    // Rotulo directo al final solo con 2 a 4 series: con una sola, el titulo de
    // la figura ya la nombra y el rotulo solo quitaba ancho (y se cortaba:
    // «Valor al cier…»).
    const conRotulos = series.length >= 2 && series.length <= 4;
    const m = medidasLienzo({ alto, rotulosDirectos: conRotulos, anchoPx });
    const anchoUtil = m.ancho - m.izquierda - m.derecha;
    const altoUtil = m.alto - m.arriba - m.abajo;
    const maximo = Math.max(0, ...valoresDe(puntos, ids),
      ...(comp ? valoresDe(comp.puntos.slice(0, puntos.length), compIds) : []),
      esNumero(serie.meta?.valor) ? serie.meta.valor : 0);
    const techo = techoRedondo(maximo);
    const x = (i) => m.izquierda + (n === 1 ? anchoUtil / 2 : (i * anchoUtil) / (n - 1));
    const y = (v) => m.arriba + altoUtil - (Math.max(0, v) / techo) * altoUtil;
    const base = (m.arriba + altoUtil).toFixed(1);

    const hijos = [...rejillaY(m, techo, formato, y), ...lineaDeMeta(m, serie.meta, formato, y)];

    // Eje del tiempo: pocos rotulos, y siempre el ultimo. Los extremos se
    // alinean hacia dentro: centrados, se saldrian del dibujo.
    for (const i of indicesConRotulo(n, m.rotulos)) {
      const ancla = n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle';
      hijos.push(svg('text', { class: 'graf__eje', x: x(i), y: m.alto - 8, 'text-anchor': ancla },
        [rotuloCubeta(puntos[i], grano, { eje: true })]));
    }

    // Detras de todo, la comparacion: contexto, no protagonista.
    if (comp) {
      const compPuntos = comp.puntos.slice(0, n);
      for (const s of comp.series) {
        const d = trazado(compPuntos, s.id, x, y);
        if (d) hijos.push(svg('path', { class: 'graf__linea graf__linea--comparacion', 'data-tono': 'comparacion', d }));
      }
    }

    // Una sola serie: un lavado suave debajo ayuda a leer el volumen.
    if (series.length === 1 && !comp) {
      const d = lavado(puntos, series[0].id, x, y, base);
      if (d) hijos.push(svg('path', { class: 'graf__area', 'data-tono': tonoSeguro(series[0].tono), d }));
    }

    for (const s of series) {
      const d = trazado(puntos, s.id, x, y);
      if (d) hijos.push(svg('path', { class: 'graf__linea', 'data-tono': tonoSeguro(s.tono), d }));
      // Un punto sin vecinos no dibuja linea: se marca con un punto para que no
      // desaparezca.
      puntos.forEach((p, i) => {
        const v = p.valores?.[s.id];
        if (!esNumero(v)) return;
        const antes = i > 0 && esNumero(puntos[i - 1].valores?.[s.id]);
        const despues = i < n - 1 && esNumero(puntos[i + 1].valores?.[s.id]);
        if (!antes && !despues) hijos.push(svg('circle', { class: 'graf__punto', 'data-tono': tonoSeguro(s.tono), cx: x(i), cy: y(v), r: 4 }));
      });
      // El final de cada linea se marca: es el valor que mas se lee.
      const fin = ultimoConValor(puntos, s.id);
      if (fin >= 0) hijos.push(svg('circle', { class: 'graf__punto', 'data-tono': tonoSeguro(s.tono), cx: x(fin), cy: y(puntos[fin].valores[s.id]), r: 4 }));
    }

    // Nombre al final de cada linea (<= 4 series, lienzo ancho). Se separan un
    // poco si se tocan (una linea de texto, 14 unidades); si alguno tendria que
    // alejarse de su linea mas de 8, se quitan TODOS: apilados lejos de su linea
    // confunden mas que ayudan, y la leyenda de arriba ya dice quien es quien.
    if (conRotulos && !m.estrecho) {
      const rotulos = series.map((s) => {
        const fin = ultimoConValor(puntos, s.id);
        return fin < 0 ? null : { s, fin, yReal: y(puntos[fin].valores[s.id]) };
      }).filter(Boolean).sort((a, b) => a.yReal - b.yReal);
      let previo = -Infinity;
      let separados = true;
      for (const r of rotulos) {
        r.yTexto = Math.max(r.yReal, previo + SEPARACION_ROTULO);
        if (r.yTexto - r.yReal > DESPLAZAMIENTO_MAXIMO || r.yTexto > m.alto - m.abajo + 4) separados = false;
        previo = r.yTexto;
      }
      if (separados) {
        for (const r of rotulos) {
          hijos.push(svg('text', { class: 'graf__rotulo-final', x: x(r.fin) + 9, y: r.yTexto + 4 }, [recortar(r.s.nombre, 14)]));
        }
      }
    }

    // Capa de lectura: la raya que busca el periodo y los puntos resaltados.
    const cruz = svg('line', { class: 'graf__cruz', x1: 0, x2: 0, y1: m.arriba, y2: m.arriba + altoUtil, visibility: 'hidden' });
    const focos = series.map((s) => svg('circle', { class: 'graf__foco', 'data-tono': tonoSeguro(s.tono), r: 5, visibility: 'hidden' }));
    hijos.push(cruz, ...focos);

    const primero = rotuloCubeta(puntos[0], grano, { largo: true });
    const ultimo = rotuloCubeta(puntos[n - 1], grano, { largo: true });
    const resumenes = series.map((s) => {
      const fin = ultimoConValor(puntos, s.id);
      let mayor = -1;
      puntos.forEach((p, i) => { const v = p.valores?.[s.id]; if (esNumero(v) && (mayor < 0 || v > puntos[mayor].valores[s.id])) mayor = i; });
      if (fin < 0) return `${s.nombre}: sin datos`;
      return `${s.nombre}: último ${formatear(puntos[fin].valores[s.id], formato)}, máximo ${formatear(puntos[mayor].valores[s.id], formato)} (${rotuloCubeta(puntos[mayor], grano, { largo: true })})`;
    });
    const etiqueta = [
      `${titulo || 'Gráfica'}. Líneas de ${cuantasCubetas(n, grano)}, del ${primero} al ${ultimo}.`,
      `${resumenes.join('; ')}.`,
      serie.meta && esNumero(serie.meta.valor) ? `${serie.meta.nombre || 'Meta'}: ${formatear(serie.meta.valor, formato)}.` : '',
      comp ? 'En gris punteado, el periodo anterior.' : '',
      AYUDA_TECLADO,
    ].filter(Boolean).join(' ');

    const dibujo = svg('svg', {
      class: 'graf__svg', viewBox: `0 0 ${m.ancho} ${m.alto}`, role: 'img', 'aria-label': etiqueta, focusable: 'true',
    }, hijos);
    lienzo.append(dibujo);

    const franja = n === 1 ? anchoUtil : anchoUtil / (n - 1);
    return activarLectura({
      lienzo, dibujo, total: n, ancho: m.ancho, alto: m.alto,
      indiceEn: (vx) => {
        if (vx < m.izquierda - franja / 2 || vx > m.ancho - m.derecha + franja / 2) return null;
        return Math.min(n - 1, Math.max(0, Math.round(n === 1 ? 0 : ((vx - m.izquierda) / anchoUtil) * (n - 1))));
      },
      anclaDe: (i) => ({ x: x(i), y: m.arriba }),
      marcar: (i, activo) => {
        cruz.setAttribute('visibility', activo ? 'visible' : 'hidden');
        cruz.setAttribute('x1', x(i)); cruz.setAttribute('x2', x(i));
        series.forEach((s, k) => {
          const v = puntos[i].valores?.[s.id];
          const ver = activo && esNumero(v);
          focos[k].setAttribute('visibility', ver ? 'visible' : 'hidden');
          if (ver) { focos[k].setAttribute('cx', x(i)); focos[k].setAttribute('cy', y(v)); }
        });
      },
      contenidoDe: (i) => ({
        titulo: rotuloCubeta(puntos[i], grano, { largo: true }),
        filas: [
          ...series.map((s) => ({ nombre: s.nombre, valor: formatear(puntos[i].valores?.[s.id], formato), tono: s.tono })),
          ...(comp && comp.puntos[i] ? comp.series.map((s) => ({
            nombre: `${nombreComp(s)} · ${rotuloCubeta(comp.puntos[i], comp.grano || grano)}`,
            valor: formatear(comp.puntos[i].valores?.[s.id], formato), tono: 'comparacion', forma: 'punteada',
          })) : []),
        ],
      }),
    });
  });

  // Lo mas reciente arriba: es lo primero que se busca en la tabla.
  caja.append(tablaDeDatos({
    titulo: `${titulo || 'Gráfica'} por ${(NOMBRE_GRANO[grano] || 'periodo').toLowerCase()}`,
    columnas: [
      { id: 'periodo', nombre: NOMBRE_GRANO[grano] || 'Periodo' },
      ...series.map((s) => ({ id: `s:${s.id}`, nombre: s.nombre, formato })),
      ...(comp ? comp.series.map((s) => ({ id: `c:${s.id}`, nombre: nombreComp(s), formato })) : []),
    ],
    filas: puntos.map((p, i) => {
      const fila = { periodo: rotuloCubeta(p, grano, { largo: true }) };
      for (const s of series) fila[`s:${s.id}`] = p.valores?.[s.id] ?? null;
      if (comp) for (const s of comp.series) fila[`c:${s.id}`] = comp.puntos[i]?.valores?.[s.id] ?? null;
      return fila;
    }).reverse(),
  }));
  return caja;
}
