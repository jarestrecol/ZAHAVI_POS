/**
 * =============================================================================
 *  KIT DE GRAFICAS: CHISPA (mini tendencia)
 * =============================================================================
 *
 *  Una linea diminuta junto a la cifra de una tarjeta: dice «sube», «baja» o
 *  «da tumbos» sin ejes ni numeros. Es DECORATIVA (`aria-hidden`): el valor y
 *  su variacion ya estan escritos en la tarjeta, y el detalle en la pestaña.
 *
 *  - Linea en el gris de contexto y el ultimo punto en tinta: el presente es
 *    lo que importa.
 *  - La escala va del minimo al maximo de la propia serie (lo que se lee es la
 *    forma, no la magnitud). Todo igual = linea plana en medio.
 *  - Un nulo corta la linea. Con menos de dos valores no se dibuja nada.
 */

import { svg } from '../../lib/dom.js';
import { esNumero } from './comun.js';

const ANCHO = 80;
const ALTO = 24;
const MARGEN = 3;

/**
 * @param {object} opciones
 * @param {Array<number|null>} opciones.valores uno por cubeta, en orden
 * @param {string} [opciones.formato] no se usa para dibujar; se deja en `data-formato`
 * @param {string} [opciones.nombre] de que es la tendencia; se deja en `data-nombre`
 * @returns {SVGElement}
 */
export function chispa({ valores, formato, nombre } = {}) {
  const lista = Array.isArray(valores) ? valores : [];
  const numeros = lista.filter(esNumero);
  const base = {
    class: 'graf-chispa', viewBox: `0 0 ${ANCHO} ${ALTO}`, 'aria-hidden': 'true', focusable: 'false',
    'data-formato': formato || null, 'data-nombre': nombre || null,
  };
  if (numeros.length < 2) return svg('svg', { ...base, class: 'graf-chispa graf-chispa--vacia' });

  const min = Math.min(...numeros);
  const max = Math.max(...numeros);
  const n = lista.length;
  const x = (i) => MARGEN + (n === 1 ? 0 : (i * (ANCHO - 2 * MARGEN)) / (n - 1));
  const y = (v) => (max === min ? ALTO / 2 : MARGEN + (1 - (v - min) / (max - min)) * (ALTO - 2 * MARGEN));

  let d = '';
  let abierto = false;
  let ultimo = -1;
  lista.forEach((v, i) => {
    if (!esNumero(v)) { abierto = false; return; }
    d += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    abierto = true;
    ultimo = i;
  });
  return svg('svg', base, [
    svg('path', { class: 'graf-chispa__linea', d: d.trim() }),
    svg('circle', { class: 'graf-chispa__fin', cx: x(ultimo).toFixed(1), cy: y(lista[ultimo]).toFixed(1), r: 2.5 }),
  ]);
}
