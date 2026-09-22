/**
 * =============================================================================
 *  KIT DE GRAFICAS: BARRA CONTRA LA META (bala)
 * =============================================================================
 *
 *  Una barra de progreso con la meta marcada encima: «vamos en 82 % y la meta
 *  es 90 %». Va dentro de la tarjeta de un indicador, que ya escribe el valor
 *  en grande; aqui se repite en pequeno junto a la meta para que la barra se
 *  entienda sola.
 *
 *  - El relleno toma el color del estado, y la pista un tono suave del MISMO
 *    color: el estado se lee en toda la barra.
 *  - El estado se dice con icono + palabra (Bien, Atención, Mal), nunca solo
 *    con el color.
 *  - `sentido` dice que es bueno: 'subir' (la meta es un minimo, «≥») o
 *    'bajar' (la meta es un tope, «≤», como el presupuesto).
 *  - La escala va de cero a un poco mas del mayor de los dos, para que ni el
 *    valor ni la meta toquen el borde. Los porcentajes hasta 100 van de 0 a 100.
 */

import { el } from '../../lib/dom.js';
import { formatear, esNumero, insigniaEstado } from './comun.js';

const SIGNO = { subir: '≥', bajar: '≤' };
const PALABRA_META = { subir: 'mínima', bajar: 'máxima' };

/**
 * @param {object} opciones
 * @param {number|null} opciones.valor
 * @param {number|null} opciones.meta
 * @param {string} opciones.formato
 * @param {'subir'|'bajar'|'neutral'|null} [opciones.sentido]
 * @param {'bien'|'atencion'|'mal'|'sin_meta'|'sin_datos'} opciones.estado
 * @returns {HTMLElement} `<div class="graf-meta">`
 */
export function barraDeMeta({ valor, meta, formato = 'numero', sentido = null, estado } = {}) {
  const hayValor = esNumero(valor);
  const hayMeta = esNumero(meta);
  const clave = !hayValor ? 'sin_datos' : !hayMeta ? 'sin_meta' : estado || 'sin_meta';
  const v = hayValor ? Math.max(0, valor) : 0;
  const mMeta = hayMeta ? Math.max(0, meta) : 0;
  const mayor = Math.max(v, mMeta);
  const escala = formato === 'porcentaje' && mayor <= 100 ? 100 : (mayor > 0 ? mayor * 1.15 : 1);
  const relleno = hayValor ? Math.min(100, (v / escala) * 100) : 0;
  const marca = hayMeta ? Math.min(100, (mMeta / escala) * 100) : null;

  const signo = SIGNO[sentido] || '';
  const textoMeta = hayMeta ? `meta ${signo ? `${signo} ` : ''}${formatear(meta, formato)}` : 'sin meta definida';
  const lectura = hayValor ? `${formatear(valor, formato)} · ${textoMeta}` : `Sin datos · ${textoMeta}`;
  const leidoCompleto = hayMeta
    ? `${hayValor ? formatear(valor, formato) : 'Sin datos'} frente a una meta ${PALABRA_META[sentido] || ''} de ${formatear(meta, formato)}`.replace('  ', ' ')
    : lectura;

  return el('div', { class: 'graf-meta', dataset: { estado: clave } }, [
    el('div', { class: 'graf-meta__pista', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { class: 'graf-meta__relleno', style: { width: `${relleno.toFixed(2)}%` } }),
      marca === null ? null : el('span', { class: 'graf-meta__marca', style: { left: `${marca.toFixed(2)}%` } }),
    ]),
    el('p', { class: 'graf-meta__texto' }, [
      insigniaEstado(clave),
      el('span', { class: 'graf-meta__lectura', text: lectura, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'sr-only', text: `${leidoCompleto}.` }),
    ]),
  ]);
}
