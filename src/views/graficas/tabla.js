/**
 * =============================================================================
 *  KIT DE GRAFICAS: TABLA EQUIVALENTE
 * =============================================================================
 *
 *  Toda grafica lleva debajo sus mismas cifras en una tabla, plegada en un
 *  `<details>` «Ver los datos en tabla». Es el camino GARANTIZADO a cada valor:
 *  para quien usa lector de pantalla, para quien quiere la cifra exacta y para
 *  comprobar que el dibujo dice lo que dicen los datos.
 *
 *  La tabla desplaza dentro de su caja: la pagina no se ensancha en telefono.
 */

import { el } from '../../lib/dom.js';
import { formatear } from './comun.js';

const ALINEACION = { derecha: 'derecha', right: 'derecha', end: 'derecha', centro: 'centro', center: 'centro', izquierda: 'izquierda', left: 'izquierda', start: 'izquierda' };

function textoDe(valor, formato) {
  if (formato) return formatear(typeof valor === 'number' ? valor : null, formato);
  if (valor === null || valor === undefined || valor === '') return '—';
  return String(valor);
}

/**
 * @param {object} opciones
 * @param {string} opciones.titulo lo que describe la tabla (va en `<caption>`)
 * @param {Array<{id: string, nombre: string, formato?: string, alinear?: string}>} opciones.columnas
 *   la primera columna es la cabecera de cada fila; `formato` usa `formatear`
 * @param {Array<object>} opciones.filas objetos con una clave por `columna.id`
 * @param {boolean} [opciones.abierta] mostrarla ya desplegada
 * @returns {HTMLDetailsElement}
 */
export function tablaDeDatos({ titulo, columnas = [], filas = [], abierta = false } = {}) {
  // Las cifras a la derecha, para que se comparen columna abajo; el texto a
  // la izquierda. Se puede forzar con `alinear`.
  const alinearDe = (c) => ALINEACION[c.alinear] || (c.formato ? 'derecha' : 'izquierda');
  const cuerpo = filas.length
    ? filas.map((fila) => el('tr', {}, columnas.map((c, i) => el(i === 0 ? 'th' : 'td', {
      class: 'graf__celda',
      dataset: { alinear: alinearDe(c) },
      attrs: i === 0 ? { scope: 'row' } : {},
      text: textoDe(fila?.[c.id], c.formato),
    }))))
    : [el('tr', {}, [el('td', { class: 'graf__celda', dataset: { alinear: 'izquierda' }, colspan: Math.max(1, columnas.length), text: 'Sin datos en este periodo.' })])];

  return el('details', { class: 'graf__datos', open: abierta }, [
    el('summary', { class: 'graf__datos-boton', text: 'Ver los datos en tabla' }),
    el('div', { class: 'graf__tabla-caja' }, [
      el('table', { class: 'graf__tabla' }, [
        el('caption', { class: 'sr-only', text: titulo || 'Datos de la gráfica' }),
        el('thead', {}, [el('tr', {}, columnas.map((c) => el('th', {
          class: 'graf__celda', dataset: { alinear: alinearDe(c) }, attrs: { scope: 'col' }, text: c.nombre,
        })))]),
        el('tbody', {}, cuerpo),
      ]),
    ]),
  ]);
}
