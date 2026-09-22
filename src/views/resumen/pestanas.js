/**
 * =============================================================================
 *  PESTAÑAS DE ANÁLISIS Y SELECTOR DE PERIODO
 * =============================================================================
 *
 *  Cuatro miradas (Producción · Rendimiento y merma · Bodega y compras ·
 *  Equipo) sobre un mismo periodo. El periodo va en la misma fila que las
 *  pestañas porque vale para las cuatro: cambiar de pestaña no lo reinicia.
 *
 *  Pestañas según el patrón ARIA: una sola pestaña en el orden de tabulación
 *  (tabindex itinerante), flechas para moverse, Inicio y Fin a los extremos.
 *  La activación sigue al foco: el panel ya está calculado (la vista guarda el
 *  último) y cambiar de pestaña solo repinta.
 *
 *  Cada pestaña se pinta dentro de un límite de error: si una falla, las
 *  otras tres y la franja de hoy siguen funcionando.
 */

import { el } from '../../lib/dom.js';
import { PERIODOS_BI } from '../../core/bi/periodos.js';
import { renderPestanaProduccion } from './pestana-produccion.js';
import { renderPestanaRendimiento } from './pestana-rendimiento.js';
import { renderPestanaBodega } from './pestana-bodega.js';
import { renderPestanaEquipo } from './pestana-equipo.js';

/** Pestañas en su orden. `seccion` es la clave de `Panel` que pinta cada una. */
export const PESTANAS = Object.freeze([
  Object.freeze({ clave: 'produccion', nombre: 'Producción', seccion: 'produccion', pintar: renderPestanaProduccion }),
  Object.freeze({ clave: 'rendimiento', nombre: 'Rendimiento y merma', seccion: 'rendimiento', pintar: renderPestanaRendimiento }),
  Object.freeze({ clave: 'bodega', nombre: 'Bodega y compras', seccion: 'bodega', pintar: renderPestanaBodega }),
  Object.freeze({ clave: 'equipo', nombre: 'Equipo', seccion: 'equipo', pintar: renderPestanaEquipo }),
]);

export const pestanaValida = (clave) => PESTANAS.some((p) => p.clave === clave);

/**
 * Pinta una parte del panel sin dejar que su fallo tumbe lo demás.
 *
 * El error se registra en la consola (es un defecto, hay que verlo) y en
 * pantalla se dice qué parte falló y qué hacer.
 *
 * @param {string} nombre qué parte es, para el mensaje: «la pestaña Equipo»
 * @param {() => Node} construir
 * @returns {Node}
 */
export function seccionSegura(nombre, construir) {
  try {
    return construir();
  } catch (error) {
    console.error(`Resumen: falló ${nombre}`, error);
    return el('div', { class: 'resumen__fallo', attrs: { role: 'alert' } }, [
      el('p', { text: `No se pudo mostrar ${nombre}. El resto del resumen sigue disponible; recarga la página para intentarlo de nuevo.` }),
    ]);
  }
}

const DIA_MES = new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const ANIO = (iso) => iso.slice(0, 4);
const diaMes = (iso) => DIA_MES.format(new Date(`${iso}T12:00:00Z`));

/**
 * «del 24 de agosto al 22 de septiembre de 2026», con los meses completos
 * (las abreviaturas mezclaban «ago» y «sept»). El año va una sola vez si los
 * dos extremos caen en el mismo.
 */
function tramo(desde, hasta) {
  return ANIO(desde) === ANIO(hasta)
    ? `del ${diaMes(desde)} al ${diaMes(hasta)} de ${ANIO(hasta)}`
    : `del ${diaMes(desde)} de ${ANIO(desde)} al ${diaMes(hasta)} de ${ANIO(hasta)}`;
}

/** «Del 24 de agosto al 22 de septiembre de 2026 · se compara con el 25 de julio al 23 de agosto de 2026». */
function textoRango(rango) {
  if (!rango?.desde || !rango?.hasta) return null;
  const actual = tramo(rango.desde, rango.hasta);
  const anterior = rango.anterior?.desde && rango.anterior?.hasta
    ? ` · se compara con ${tramo(rango.anterior.desde, rango.anterior.hasta).replace(/^del /, 'el ')}` : '';
  return `D${actual.slice(1)}${anterior}`;
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.panel el `Panel` completo
 * @param {string} opciones.pestana clave activa
 * @param {string} opciones.periodo clave activa
 * @param {(clave: string) => void} opciones.onPestana
 * @param {(clave: string) => void} opciones.onPeriodo
 * @returns {HTMLElement}
 */
export function renderAnalisis({ panel, pestana, periodo, onPestana, onPeriodo }) {
  const activa = PESTANAS.find((p) => p.clave === pestana) || PESTANAS[0];

  const pestanas = el('div', { class: 'resumen-pestanas', attrs: { role: 'tablist', 'aria-label': 'Análisis' } },
    PESTANAS.map((p, indice) => el('button', {
      type: 'button', class: 'resumen-pestana', id: `resumen-tab-${p.clave}`,
      dataset: { foco: `tab-${p.clave}`, pestana: p.clave },
      attrs: {
        role: 'tab', 'aria-selected': String(p === activa), 'aria-controls': `resumen-panel-${p.clave}`,
        tabindex: p === activa ? '0' : '-1',
      },
      text: p.nombre,
      on: {
        click: () => onPestana(p.clave),
        keydown: (evento) => {
          const destino = {
            ArrowRight: (indice + 1) % PESTANAS.length,
            ArrowLeft: (indice - 1 + PESTANAS.length) % PESTANAS.length,
            Home: 0,
            End: PESTANAS.length - 1,
          }[evento.key];
          if (destino === undefined) return;
          evento.preventDefault();
          onPestana(PESTANAS[destino].clave);
        },
      },
    })));

  const periodos = el('div', { class: 'resumen-periodos', attrs: { role: 'group', 'aria-label': 'Periodo del análisis' } },
    Object.entries(PERIODOS_BI).map(([clave, info]) => el('button', {
      type: 'button', class: 'resumen-periodo', text: info.nombre,
      dataset: { foco: `periodo-${clave}`, periodo: clave },
      attrs: { 'aria-pressed': String(clave === periodo) },
      on: { click: () => onPeriodo(clave) },
    })));

  const seccion = panel?.[activa.seccion];
  const rango = panel?.rango || null;

  return el('section', { class: 'resumen__seccion resumen-analisis', attrs: { 'aria-labelledby': 'resumen-analisis-titulo' } }, [
    el('div', { class: 'resumen__encabezado' }, [
      el('h2', { id: 'resumen-analisis-titulo', class: 'resumen__titulo-seccion', text: 'Análisis' }),
    ]),
    el('div', { class: 'resumen-analisis__herramientas' }, [pestanas, periodos]),
    textoRango(rango) ? el('p', { class: 'resumen-analisis__rango', text: textoRango(rango) }) : null,
    el('div', {
      class: 'resumen-analisis__panel', id: `resumen-panel-${activa.clave}`,
      attrs: { role: 'tabpanel', 'aria-labelledby': `resumen-tab-${activa.clave}`, tabindex: '0' },
    }, [
      seccion
        ? seccionSegura(`la pestaña ${activa.nombre}`, () => activa.pintar({ seccion, verCostos: Boolean(panel.verCostos), rango }))
        : el('p', { class: 'resumen__fallo', text: 'Esta pestaña todavía no tiene datos.' }),
    ]),
  ]);
}
