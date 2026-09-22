/**
 * =============================================================================
 *  «NECESITA ATENCIÓN»
 * =============================================================================
 *
 *  La lista de lo que hay que hacer hoy, ya ordenada por el núcleo (prioridad y
 *  luego cantidad). Cada fila dice qué pasa, cuánto, y lleva a donde se arregla.
 *
 *  Se ven las primeras seis; el resto queda plegado. Una lista de veinte avisos
 *  del mismo peso es una lista que nadie lee, y el orden ya puso arriba lo que
 *  más importa.
 *
 *  El tono va con icono y palabra («Urgente», «Atención», «Para revisar»),
 *  nunca solo con color. En el modo ejemplo los enlaces se muestran como texto:
 *  llevarían a la producción REAL, donde ese problema no existe.
 */

import { el, icon } from '../../lib/dom.js';
import { formatear } from '../graficas/comun.js';
import { ICONO_ATENCION, ICONO_MAL } from './kpi.js';

const ICONO_INFO = ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5.5', 'M12 7.6v.3'];

const TONOS = Object.freeze({
  critico: { palabra: 'Urgente', icono: ICONO_MAL },
  atencion: { palabra: 'Atención', icono: ICONO_ATENCION },
  info: { palabra: 'Para revisar', icono: ICONO_INFO },
});

const VISIBLES = 6;

/**
 * @param {Object} opciones
 * @param {Array<Object>} opciones.alertas `panel.atencion`
 * @param {(destino: Object) => string} opciones.hrefDe
 * @param {boolean} [opciones.ejemplo=false] enlaces desactivados
 * @returns {HTMLElement}
 */
export function renderAtencion({ alertas, hrefDe, ejemplo = false }) {
  const lista = Array.isArray(alertas) ? alertas : [];
  const primeras = lista.slice(0, VISIBLES);
  const resto = lista.slice(VISIBLES);

  return el('section', { class: 'resumen__seccion resumen-atencion', attrs: { 'aria-labelledby': 'resumen-atencion-titulo' } }, [
    el('div', { class: 'resumen__encabezado' }, [
      // tabindex -1: la línea de avisos de «Hoy» trae el foco hasta aquí.
      el('h2', { id: 'resumen-atencion-titulo', class: 'resumen__titulo-seccion', attrs: { tabindex: '-1' }, text: 'Necesita atención' }),
      lista.length ? el('span', { class: 'resumen-atencion__cuenta', text: lista.length === 1 ? '1 aviso' : `${lista.length} avisos` }) : null,
    ]),
    // Una sola explicación, y no un «desactivado» en cada fila.
    ejemplo && lista.length
      ? el('p', { class: 'resumen-atencion__nota', text: 'En el ejemplo, los accesos de cada aviso no llevan a ningún sitio: abrirían tu operación real, donde estos avisos no existen.' })
      : null,
    lista.length
      ? el('ol', { class: 'resumen-atencion__lista' }, primeras.map((a) => filaAlerta(a, hrefDe, ejemplo)))
      : el('p', { class: 'resumen-atencion__vacia' }, [
        icon(TONOS.info.icono, { class: 'resumen-atencion__icono' }),
        el('span', { text: 'Todo en orden: nada requiere atención hoy.' }),
      ]),
    resto.length ? el('details', { class: 'resumen-atencion__mas' }, [
      el('summary', { text: resto.length === 1 ? 'Ver 1 aviso más' : `Ver ${resto.length} avisos más` }),
      el('ol', { class: 'resumen-atencion__lista', attrs: { start: String(VISIBLES + 1) } }, resto.map((a) => filaAlerta(a, hrefDe, ejemplo))),
    ]) : null,
  ]);
}

function filaAlerta(alerta, hrefDe, ejemplo) {
  const tono = TONOS[alerta.tono] || TONOS.info;
  const href = !ejemplo && alerta.destino && typeof hrefDe === 'function' ? hrefDe(alerta.destino) : null;
  const accion = alerta.accion || 'Ver';
  // La cantidad ya va en el título («3 lotes vencidos»); aparte solo se dice
  // cuánto dinero está en juego, y solo a quien puede verlo (el núcleo lo
  // deja en null para el jefe de obrador).
  const cifras = Number.isFinite(alerta.dinero)
    ? [el('span', { class: 'resumen-alerta__dinero', text: formatear(alerta.dinero, 'pesos') })]
    : [];

  return el('li', { class: 'resumen-alerta', dataset: { tono: TONOS[alerta.tono] ? alerta.tono : 'info', tipo: alerta.tipo } }, [
    el('span', { class: 'resumen-alerta__tono' }, [
      icon(tono.icono, { class: 'resumen-alerta__icono' }),
      el('span', { text: tono.palabra }),
    ]),
    el('div', { class: 'resumen-alerta__texto' }, [
      el('p', { class: 'resumen-alerta__titulo', text: alerta.titulo }),
      alerta.detalle ? el('p', { class: 'resumen-alerta__detalle', text: alerta.detalle }) : null,
    ]),
    cifras.length ? el('p', { class: 'resumen-alerta__cifras' }, cifras) : null,
    href
      ? el('a', { class: 'resumen-alerta__accion', href, attrs: { 'aria-label': `${accion}: ${alerta.titulo}` } }, [el('span', { text: accion }), el('span', { attrs: { 'aria-hidden': 'true' }, text: ' →' })])
      : el('span', { class: 'resumen-alerta__accion resumen-alerta__accion--inactiva', text: accion }),
  ]);
}
