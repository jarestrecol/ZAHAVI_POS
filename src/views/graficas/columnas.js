/**
 * =============================================================================
 *  KIT DE GRAFICAS: COLUMNAS (apiladas o agrupadas)
 * =============================================================================
 *
 *  Cuanto hubo en cada periodo, y de que parte. Apiladas por defecto: la
 *  altura total es la suma y cada tramo es un area (parte del todo). Agrupadas
 *  cuando lo que se compara es cada serie contra las otras.
 *
 *  - Columnas finas (tope de 24 unidades): el aire entre ellas es parte del
 *    dibujo. Punta redondeada de 4, base recta, todas desde la misma linea.
 *  - Entre tramos apilados, un hueco de 2 del color de la superficie: separa
 *    sin trazar un borde que seria tinta sin dato.
 *  - Con `apiladas`, una serie de tono «total» NO se apila: la suma ya es el
 *    total, y apilarla contaria todo dos veces. Se dice en el tooltip.
 *  - Se rotula solo la columna mas alta; el resto, tooltip y tabla.
 *  - El objetivo del puntero es la franja entera del periodo, no el tramo.
 */

import { el, svg } from '../../lib/dom.js';
import {
  figura, leyenda, mensajeVacio, medidasLienzo, techoRedondo, formatear, rotuloCubeta, cuantasCubetas,
  valoresDe, hayDatos, esNumero, tonoSeguro, activarLectura, adaptarAlAncho, AYUDA_TECLADO, indicesConRotulo, rejillaY, lineaDeMeta,
} from './comun.js';
import { tablaDeDatos } from './tabla.js';

const NOMBRE_GRANO = { dia: 'Día', semana: 'Semana', mes: 'Mes' };
const HUECO = 2;
const RADIO = 4;

/** Rectangulo con las esquinas de arriba redondeadas (la punta del dato). */
function rutaColumna(x, arriba, ancho, alto, redondear) {
  const r = redondear ? Math.min(RADIO, ancho / 2, alto) : 0;
  const abajo = arriba + alto;
  if (r <= 0) return `M${x} ${abajo} V${arriba} H${x + ancho} V${abajo} Z`;
  return `M${x} ${abajo} V${arriba + r} Q${x} ${arriba} ${x + r} ${arriba} H${x + ancho - r} Q${x + ancho} ${arriba} ${x + ancho} ${arriba + r} V${abajo} Z`;
}

const f1 = (v) => Number(v.toFixed(1));

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {object} opciones.serie `Serie` del contrato (§5)
 * @param {boolean} [opciones.apiladas=true]
 * @param {number} [opciones.alto]
 * @param {string} [opciones.subtitulo]
 * @param {string} [opciones.vacio] texto del mensaje cuando no hay datos
 * @returns {HTMLElement} `<figure class="graf">`
 */
export function graficaColumnas({ titulo, serie, apiladas = true, alto, subtitulo, vacio: textoVacio } = {}) {
  const caja = figura({ titulo, subtitulo, clase: 'graf--columnas' });
  const todas = Array.isArray(serie?.series) ? serie.series : [];
  const series = apiladas && todas.length > 1 ? todas.filter((s) => s.tono !== 'total') : todas;
  const puntos = Array.isArray(serie?.puntos) ? serie.puntos : [];
  const formato = serie?.formato || 'numero';
  const grano = serie?.grano || 'dia';
  const ids = series.map((s) => s.id);

  if (!puntos.length || !series.length || !hayDatos(valoresDe(puntos, ids))) {
    caja.append(mensajeVacio(textoVacio));
    return caja;
  }

  const n = puntos.length;
  const valor = (p, id) => (esNumero(p.valores?.[id]) ? Math.max(0, p.valores[id]) : 0);
  const sumaDe = (p) => ids.reduce((s, id) => s + valor(p, id), 0);
  const totales = puntos.map(sumaDe);
  const conTotal = apiladas && series.length > 1;

  if (series.length >= 2) caja.append(leyenda(series.map((s) => ({ nombre: s.nombre, tono: s.tono, forma: 'caja' }))));
  const lienzo = el('div', { class: 'graf__lienzo' });
  caja.append(lienzo);

  // El dibujo se hace al ancho real de la caja, y se rehace si cambia.
  adaptarAlAncho(lienzo, (anchoPx) => {
    const m = medidasLienzo({ alto, anchoPx });
    const anchoUtil = m.ancho - m.izquierda - m.derecha;
    const altoUtil = m.alto - m.arriba - m.abajo;
    const maximo = Math.max(0, ...(apiladas ? totales : valoresDe(puntos, ids)), esNumero(serie.meta?.valor) ? serie.meta.valor : 0);
    // Un poco de techo extra para el rotulo de la columna mas alta.
    const techo = techoRedondo(maximo * 1.08);
    const banda = anchoUtil / n;
    const centro = (i) => m.izquierda + banda * (i + 0.5);
    const y = (v) => m.arriba + altoUtil - (Math.max(0, v) / techo) * altoUtil;
    const k = series.length;
    const anchoCol = apiladas ? Math.min(24, banda * 0.62) : Math.min(24, (banda * 0.8 - HUECO * (k - 1)) / k);
    const anchoGrupo = apiladas ? anchoCol : anchoCol * k + HUECO * (k - 1);

    // Franjas de lectura DEBAJO de todo: se aclaran al pasar sin tapar el dato.
    const bandas = puntos.map((_, i) => svg('rect', {
      class: 'graf__banda', x: f1(m.izquierda + banda * i), y: m.arriba, width: f1(banda), height: altoUtil,
    }));
    const hijos = [...bandas, ...rejillaY(m, techo, formato, y)];

    for (const i of indicesConRotulo(n, m.rotulos)) {
      hijos.push(svg('text', { class: 'graf__eje', x: f1(centro(i)), y: m.alto - 8, 'text-anchor': n > 1 && i === 0 && banda < 40 ? 'start' : n > 1 && i === n - 1 && banda < 40 ? 'end' : 'middle' },
        [rotuloCubeta(puntos[i], grano, { eje: true })]));
    }

    puntos.forEach((p, i) => {
      if (apiladas) {
        let acumulado = 0;
        const tramos = series.map((s) => ({ s, v: valor(p, s.id) })).filter((t) => t.v > 0);
        tramos.forEach((t, j) => {
          const arriba = y(acumulado + t.v);
          const abajo = y(acumulado) - (j > 0 ? HUECO : 0);
          acumulado += t.v;
          const altoTramo = abajo - arriba;
          if (altoTramo <= 0.4) return;
          hijos.push(svg('path', {
            class: 'graf__columna', 'data-tono': tonoSeguro(t.s.tono),
            d: rutaColumna(f1(centro(i) - anchoCol / 2), f1(arriba), f1(anchoCol), f1(altoTramo), j === tramos.length - 1),
          }));
        });
      } else {
        series.forEach((s, j) => {
          const v = valor(p, s.id);
          if (v <= 0) return;
          const x0 = centro(i) - anchoGrupo / 2 + j * (anchoCol + HUECO);
          hijos.push(svg('path', {
            class: 'graf__columna', 'data-tono': tonoSeguro(s.tono),
            d: rutaColumna(f1(x0), f1(y(v)), f1(anchoCol), f1(y(0) - y(v)), true),
          }));
        });
      }
    });

    hijos.push(...lineaDeMeta(m, serie.meta, formato, y));

    // Solo se rotula la columna mas alta: un numero en cada una no se lee.
    const alturas = apiladas ? totales : puntos.map((p) => Math.max(...ids.map((id) => valor(p, id))));
    const mayor = alturas.reduce((a, v, i) => (v > alturas[a] ? i : a), 0);
    hijos.push(svg('text', { class: 'graf__rotulo-valor', x: f1(centro(mayor)), y: f1(y(alturas[mayor]) - 6), 'text-anchor': 'middle' },
      [formatear(alturas[mayor], formato, { corto: true })]));

    const suma = totales.reduce((a, b) => a + b, 0);
    const etiqueta = [
      `${titulo || 'Gráfica'}. Columnas ${apiladas ? 'apiladas' : 'agrupadas'} de ${cuantasCubetas(n, grano)}, del ${rotuloCubeta(puntos[0], grano, { largo: true })} al ${rotuloCubeta(puntos[n - 1], grano, { largo: true })}.`,
      `Series: ${series.map((s) => s.nombre).join(', ')}.`,
      `Mayor: ${formatear(alturas[mayor], formato)} (${rotuloCubeta(puntos[mayor], grano, { largo: true })}).`,
      apiladas ? `Suma del periodo: ${formatear(suma, formato)}.` : '',
      AYUDA_TECLADO,
    ].filter(Boolean).join(' ');

    const dibujo = svg('svg', { class: 'graf__svg', viewBox: `0 0 ${m.ancho} ${m.alto}`, role: 'img', 'aria-label': etiqueta }, hijos);
    lienzo.append(dibujo);

    return activarLectura({
      lienzo, dibujo, total: n, ancho: m.ancho, alto: m.alto,
      indiceEn: (vx, vy) => {
        if (vx < m.izquierda || vx > m.ancho - m.derecha || vy > m.alto) return null;
        return Math.min(n - 1, Math.max(0, Math.floor((vx - m.izquierda) / banda)));
      },
      anclaDe: (i) => ({ x: centro(i) + anchoGrupo / 2, y: m.arriba }),
      marcar: (i, activo) => bandas[i].classList.toggle('graf__banda--activa', activo),
      contenidoDe: (i) => ({
        titulo: rotuloCubeta(puntos[i], grano, { largo: true }),
        filas: [
          // En orden de arriba abajo, como se ven los tramos.
          ...[...series].reverse().map((s) => ({ nombre: s.nombre, valor: formatear(puntos[i].valores?.[s.id], formato), tono: s.tono, forma: 'caja' })),
          ...(conTotal ? [{ nombre: 'Total', valor: formatear(totales[i], formato) }] : []),
        ],
      }),
    });
  });

  caja.append(tablaDeDatos({
    titulo: `${titulo || 'Gráfica'} por ${(NOMBRE_GRANO[grano] || 'periodo').toLowerCase()}`,
    columnas: [
      { id: 'periodo', nombre: NOMBRE_GRANO[grano] || 'Periodo' },
      ...series.map((s) => ({ id: `s:${s.id}`, nombre: s.nombre, formato })),
      ...(conTotal ? [{ id: 'total', nombre: 'Total', formato }] : []),
    ],
    filas: puntos.map((p, i) => {
      const fila = { periodo: rotuloCubeta(p, grano, { largo: true }), total: totales[i] };
      for (const s of series) fila[`s:${s.id}`] = p.valores?.[s.id] ?? null;
      return fila;
    }).reverse(),
  }));
  return caja;
}
