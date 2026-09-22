/**
 * =============================================================================
 *  FRANJA «HOY» DEL RESUMEN
 * =============================================================================
 *
 *  Lo primero que ve el gerente al entrar: cómo va el día (avance, lo que se
 *  está preparando, gasto, bodega) y cómo va cada área. No depende del periodo
 *  elegido en las pestañas: «hoy» siempre es hoy.
 *
 *  Cada cifra se compara con algo distinto (el gasto de hoy con los últimos
 *  cuatro días iguales, la bodega con hace una semana). La frase de la
 *  variación lo dice, para que «+12 %» no se lea contra un periodo que no es.
 */

import { el } from '../../lib/dom.js';
import { nombreLegible } from '../../core/bi/periodos.js';
import { formatear } from '../graficas/comun.js';
import { filaIndicadores } from './kpi.js';

/** Con qué se compara cada indicador de hoy (ver contrato §5, `hoyResumen`). */
const COMPARADO_CON = Object.freeze({
  costo_hoy: 'el promedio de los últimos 4 días iguales',
  presupuesto_mes: 'el mismo tramo del mes anterior',
  rendimiento_7d: 'los 7 días anteriores',
  rechazo_7d: 'los 7 días anteriores',
  valor_bodega: 'el valor de hace 7 días',
});

const TONO_AREA = Object.freeze({ 'PASTELERÍA': 'pasteleria', 'PANADERÍA': 'panaderia', GALLETAS: 'galletas' });

const plural = (n, uno, varios) => `${formatear(n, 'numero')} ${n === 1 ? uno : varios}`;

/**
 * «1 urgente · 3 en atención · 2 para revisar». La lista de avisos queda
 * debajo de esta franja cuando la pantalla no da para ponerlas lado a lado:
 * esta línea dice desde arriba que hay algo urgente y lleva hasta allí.
 */
function lineaDeAvisos(alertas, onVerAvisos) {
  const lista = Array.isArray(alertas) ? alertas : [];
  if (!lista.length) return null;
  const cuenta = (tono) => lista.filter((a) => a.tono === tono).length;
  const urgentes = cuenta('critico');
  const atencion = cuenta('atencion');
  const revisar = lista.length - urgentes - atencion;
  const partes = [
    urgentes ? `${urgentes} ${urgentes === 1 ? 'urgente' : 'urgentes'}` : null,
    atencion ? `${atencion} en atención` : null,
    revisar ? `${revisar} para revisar` : null,
  ].filter(Boolean).join(' · ');
  return el('p', { class: 'resumen-hoy__avisos', dataset: { urgente: String(urgentes > 0) } }, [
    el('span', { class: 'resumen-hoy__avisos-texto', text: `Necesita atención: ${partes}.` }),
    typeof onVerAvisos === 'function'
      ? el('button', {
        type: 'button', class: 'btn btn--quiet resumen-hoy__avisos-ir', dataset: { foco: 'ver-avisos' },
        text: lista.length === 1 ? 'Ver el aviso' : `Ver los ${lista.length} avisos`,
        on: { click: onVerAvisos },
      })
      : null,
  ]);
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.hoyResumen `panel.hoyResumen`
 * @param {string|null} opciones.hrefProduccion enlace a la producción de hoy; null lo muestra como texto (modo ejemplo)
 * @param {Array<Object>} [opciones.alertas] `panel.atencion`, para la línea de avisos
 * @param {() => void} [opciones.onVerAvisos] lleva el foco a la lista de avisos
 * @returns {HTMLElement}
 */
export function renderHoy({ hoyResumen, hrefProduccion, alertas = [], onVerAvisos = null }) {
  const indicadores = hoyResumen?.indicadores || [];
  const areas = hoyResumen?.areas || [];
  const hayProgramado = areas.some((a) => a.recetas > 0);

  return el('section', { class: 'resumen__seccion resumen-hoy', attrs: { 'aria-labelledby': 'resumen-hoy-titulo' } }, [
    el('div', { class: 'resumen__encabezado' }, [
      el('h2', { id: 'resumen-hoy-titulo', class: 'resumen__titulo-seccion', text: 'Hoy' }),
      hrefProduccion
        ? el('a', { class: 'text-link', href: hrefProduccion, text: 'Ir a la producción de hoy →' })
        : el('span', { class: 'resumen__accion-inactiva', text: 'Ir a la producción de hoy' }),
    ]),
    lineaDeAvisos(alertas, onVerAvisos),
    filaIndicadores(indicadores, {
      etiqueta: 'Indicadores de hoy',
      comparadoCon: (indicador) => COMPARADO_CON[indicador.id] || 'el periodo anterior',
    }),
    el('div', { class: 'resumen-areas' }, [
      el('h3', { class: 'resumen-areas__titulo', text: 'Avance por área' }),
      hayProgramado ? null : el('p', { class: 'resumen-areas__nada', text: 'Sin producción programada para hoy.' }),
      el('ul', { class: 'resumen-areas__lista', attrs: { 'aria-label': 'Avance de hoy por área' } }, areas.map(filaArea)),
    ]),
  ]);
}

function filaArea(area) {
  const nombre = nombreLegible(area.area);
  const tono = TONO_AREA[area.area] || 'otros';
  const avance = area.recetas > 0 ? Math.round((area.listas / area.recetas) * 100) : 0;
  const detalle = area.recetas > 0
    ? [
      area.enPreparacion ? `${plural(area.enPreparacion, 'en preparación', 'en preparación')}` : null,
      area.pendientes ? `${plural(area.pendientes, 'pendiente', 'pendientes')}` : null,
      Number.isFinite(area.tandas) && area.tandas > 0 ? `${formatear(area.tandasListas || 0, 'numero')} de ${formatear(area.tandas, 'numero')} ${area.tandas === 1 ? 'tanda lista' : 'tandas listas'}` : null,
    ].filter(Boolean).join(' · ')
    : 'Nada programado hoy';

  return el('li', { class: 'resumen-area', dataset: { tono } }, [
    el('div', { class: 'resumen-area__cabeza' }, [
      el('span', { class: 'resumen-area__nombre', text: nombre }),
      el('span', { class: 'resumen-area__cifra', text: area.recetas > 0 ? `${area.listas} de ${plural(area.recetas, 'receta lista', 'recetas listas')}` : '—' }),
    ]),
    // La barra es decorativa: la cifra de arriba ya dice lo mismo en palabras.
    el('div', { class: 'resumen-area__barra', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { class: 'resumen-area__relleno', style: { width: `${avance}%` } }),
    ]),
    el('p', { class: 'resumen-area__detalle', text: detalle }),
  ]);
}
