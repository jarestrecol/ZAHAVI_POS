/**
 * =============================================================================
 *  AJUSTES · CONEXION
 * =============================================================================
 *
 *  Donde viven los datos y si hay red para llegar a ellos. Antes aqui se
 *  diagnosticaba la publicacion del recetario en GitHub; eso ya no existe
 *  (decision F1-D): el recetario y la operacion viven en Supabase, se leen y
 *  se escriben alli, y sin red no se trabaja (F4-1).
 */

import { el } from '../../lib/dom.js';

/**
 * @param {{online?: boolean, recipeCount?: number}} options
 * @returns {HTMLElement}
 */
export function renderDiagnosisBlock(options) {
  const enLinea = options.online !== false && (typeof navigator === 'undefined' || navigator.onLine !== false);
  return el('section', { class: 'settings__row settings__row--diagnostico' }, [
    el('h3', { class: 'section-label', text: 'Conexión' }),
    el('dl', { class: 'diag' }, [
      ...linea('Datos', 'Supabase: recetario, bodega y producción'),
      ...linea('Red', enLinea ? 'Con conexión' : 'Sin conexión'),
      ...linea('Recetario leído', typeof options.recipeCount === 'number' ? `${options.recipeCount} recetas` : '—'),
    ]),
    el('p', {
      class: 'settings__help',
      text: 'No se guarda copia en este equipo: sin conexión la aplicación avisa y no deja registrar nada, para que nunca haya dos versiones de los datos.',
    }),
  ]);
}

/** Un par etiqueta / valor de la lista. */
function linea(etiqueta, valor) {
  return [
    el('div', { class: 'diag__row' }, [
      el('dt', { class: 'diag__label', text: etiqueta }),
      el('dd', { class: 'diag__value', text: valor }),
    ]),
  ];
}
