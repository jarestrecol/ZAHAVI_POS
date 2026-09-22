/**
 * =============================================================================
 *  KIT DE GRAFICAS: BARRAS HORIZONTALES (ranking)
 * =============================================================================
 *
 *  «Que recetas se llevan el gasto», «que proveedores», «quien produjo mas».
 *  Horizontales porque los nombres de receta son largos y asi se leen enteros
 *  en telefono sin girar la cabeza.
 *
 *  EN HTML Y NO EN SVG. Es una lista ordenada con una barra al lado de cada
 *  nombre: el lector de pantalla la recorre fila a fila, el texto se parte
 *  solo cuando no cabe y la cifra va escrita al final de cada barra (en un
 *  ranking la cifra ES lo que se busca, asi que se rotula siempre; por eso no
 *  hace falta tooltip).
 *
 *  - Una sola serie = un solo color para todas las barras. Colorear por valor
 *    repetiria lo que ya dice el largo. Si las filas traen `tono` (su area),
 *    ese color dice identidad y aparece la leyenda.
 *  - Con `pareto`, cada fila dice su porcentaje acumulado y se marca la fila
 *    donde se llega al 80 % del total.
 *  - Se muestran `maximoFilas`; la tabla tiene todas.
 */

import { el } from '../../lib/dom.js';
import { figura, leyenda, mensajeVacio, formatear, esNumero, tonoSeguro } from './comun.js';
import { tablaDeDatos } from './tabla.js';

const NOMBRE_TONO = { pasteleria: 'Pastelería', panaderia: 'Panadería', galletas: 'Galletas', total: 'Total', otros: 'Otras' };
const CORTE_PARETO = 80;
const PCT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const pct = (v) => `${PCT.format(v)} %`;

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {Array<{id: string, nombre: string, valor: number|null, formato?: string, detalle?: string, tono?: string}>} opciones.filas
 *   ya ordenadas (el kit no reordena: el orden lo decide quien calcula)
 * @param {string} opciones.formato formato de las cifras (cada fila puede traer el suyo)
 * @param {number} [opciones.maximoFilas=10]
 * @param {boolean} [opciones.pareto=false]
 * @param {string} [opciones.subtitulo]
 * @param {string} [opciones.vacio]
 * @param {string} [opciones.nombreColumna] cabecera de la primera columna de la tabla ("Receta")
 * @param {string} [opciones.medida='del total'] como se nombra lo que se acumula en las frases del
 *   Pareto: 'del gasto', 'de las tandas'… («explican el 72 % del gasto»)
 * @returns {HTMLElement} `<figure class="graf">`
 */
export function graficaBarras({ titulo, filas, formato = 'numero', maximoFilas = 10, pareto = false, subtitulo, vacio: textoVacio, nombreColumna = 'Nombre', medida = 'del total' } = {}) {
  const deQue = String(medida || 'del total').trim() || 'del total';
  const caja = figura({ titulo, subtitulo, clase: 'graf--barras' });
  const todas = Array.isArray(filas) ? filas.filter(Boolean) : [];
  const positivos = todas.map((f) => (esNumero(f.valor) && f.valor > 0 ? f.valor : 0));
  const total = positivos.reduce((a, b) => a + b, 0);

  if (!todas.length || !todas.some((f) => esNumero(f.valor) && f.valor !== 0)) {
    caja.append(mensajeVacio(textoVacio));
    return caja;
  }

  // Acumulado sobre TODAS las filas, no solo las visibles: el 80 % es del total.
  let suma = 0;
  const acumulados = positivos.map((v) => { suma += v; return total > 0 ? (suma / total) * 100 : 0; });
  const corte = pareto ? acumulados.findIndex((a) => a >= CORTE_PARETO - 1e-9) : -1;

  const limite = Math.max(1, Math.floor(maximoFilas) || 10);
  const visibles = todas.slice(0, limite);
  const maximo = Math.max(...positivos.slice(0, limite), 0) || 1;
  const conTono = visibles.some((f) => f.tono);
  const tonoDe = (f) => (conTono ? tonoSeguro(f.tono || 'otros') : 'uno');

  if (pareto && total > 0) {
    // «El 20 % de las recetas explica el X %»: la frase que se queda.
    const cuantas = Math.max(1, Math.ceil(todas.length * 0.2));
    const parte = acumulados[cuantas - 1];
    caja.append(el('p', { class: 'graf-barras__resumen', text: `${cuantas === 1 ? 'La primera' : `Las ${cuantas} primeras`} de ${todas.length} (el 20 %) ${cuantas === 1 ? 'explica' : 'explican'} el ${pct(parte)} ${deQue}.` }));
  }
  if (conTono) {
    const tonos = [...new Set(visibles.map(tonoDe))];
    if (tonos.length >= 2) caja.append(leyenda(tonos.map((t) => ({ nombre: NOMBRE_TONO[t] || 'Otras', tono: t, forma: 'caja' }))));
  }

  const lista = el('ol', { class: 'graf-barras', attrs: { 'aria-label': titulo || 'Ranking' } });
  visibles.forEach((f, i) => {
    const formatoFila = f.formato || formato;
    const ancho = esNumero(f.valor) && f.valor > 0 ? Math.max(0.5, (f.valor / maximo) * 100) : 0;
    lista.append(el('li', { class: 'graf-barras__fila', dataset: { corte: String(i === corte) } }, [
      el('span', { class: 'graf-barras__texto' }, [
        el('span', { class: 'graf-barras__nombre', text: f.nombre ?? '—' }),
        f.detalle ? el('span', { class: 'graf-barras__detalle', text: f.detalle }) : null,
      ]),
      el('span', { class: 'graf-barras__pista', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { class: 'graf-barras__barra', dataset: { tono: tonoDe(f) }, style: { width: `${ancho.toFixed(2)}%` } }),
      ]),
      el('span', { class: 'graf-barras__cifras' }, [
        el('span', { class: 'graf-barras__valor', text: formatear(f.valor, formatoFila) }),
        pareto ? el('span', { class: 'graf-barras__acumulado', text: `${pct(acumulados[i])} acum.` }) : null,
      ]),
    ]));
    if (i === corte) {
      lista.append(el('li', { class: 'graf-barras__marca' }, [
        `Hasta aquí, el ${pct(acumulados[i])} ${deQue} con ${i + 1} de ${todas.length}.`,
      ]));
    }
  });
  caja.append(lista);

  if (todas.length > limite) {
    caja.append(el('p', { class: 'graf__nota', text: `Se muestran ${limite} de ${todas.length}. Las demás están en la tabla.` }));
  }

  const conDetalle = todas.some((f) => f.detalle);
  caja.append(tablaDeDatos({
    titulo: titulo || 'Ranking',
    columnas: [
      { id: 'nombre', nombre: nombreColumna },
      ...(conDetalle ? [{ id: 'detalle', nombre: 'Detalle' }] : []),
      { id: 'valorTexto', nombre: 'Valor', alinear: 'derecha' },
      { id: 'participacion', nombre: 'Participación', formato: 'porcentaje' },
      ...(pareto ? [{ id: 'acumulado', nombre: 'Acumulado', formato: 'porcentaje' }] : []),
    ],
    filas: todas.map((f, i) => ({
      nombre: f.nombre,
      detalle: f.detalle || '',
      valorTexto: formatear(f.valor, f.formato || formato),
      participacion: total > 0 ? (positivos[i] / total) * 100 : null,
      acumulado: acumulados[i],
    })),
  }));
  return caja;
}
