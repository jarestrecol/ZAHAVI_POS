/**
 * =============================================================================
 *  COSTO DE LA PRODUCCION DEL DIA
 * =============================================================================
 *
 *  El panel que cruza el plan del dia con el almacen y contesta tres preguntas
 *  seguidas, que son las que el usuario pidio:
 *
 *      ¿cuanto cuesta producir esto, con lo que compre de verdad?
 *      ¿me alcanza lo que tengo en bodega?
 *      ¿a que precio por unidad de medida me sale cada ingrediente?
 *
 *  POR QUE VIVE EN SU PROPIO ARCHIVO Y NO DENTRO DE `views/plan.js`
 *  ----------------------------------------------------------------
 *  `CLAUDE.md` seccion 5 marca `views/plan.js` como uno de los archivos a
 *  vigilar por tamano (584 lineas) y dice cual es su costura natural: "el
 *  resultado del plan". Esta es justo esa costura. Ademas, el costeo va a
 *  servir despues para el costo POR RECETA, que no tiene nada que ver con el
 *  plan del dia: meterlo alli lo dejaria atrapado.
 *
 *  Es un panel compartido, del mismo orden que `views/window.js`: no es una
 *  vista llamando a otra para pintar una pantalla, es una pieza que se monta
 *  dentro de otra.
 *
 *  NO ESCRIBE NADA. El calculo es una transformacion de lectura
 *  (`core/costeo.js`). Descontar de bodega ya no se hace aqui: desde PROD-002
 *  es confirmar una receta en «Sacar producción» (`core/preparacion.js`).
 */

import { el, clear } from '../lib/dom.js';
import { formatMedida as formatQty, pesos, titleCase } from '../lib/format.js';
import { costearPlan } from '../core/costeo.js';
import { agruparGramos } from '../core/materiales-produccion.js';

/** Rotulo de cada estado. El color nunca es la unica señal. */
const ROTULO = {
  ok: 'Cubierto',
  parcial: 'No alcanza',
  sin_existencia: 'Sin existencia',
  sin_precio: 'Sin precio',
  sin_conversion: 'Falta equivalencia',
};

const CLASE = {
  ok: 'costeo__estado--ok',
  parcial: 'costeo__estado--parcial',
  sin_existencia: 'costeo__estado--parcial',
  sin_precio: 'costeo__estado--sinprecio',
  sin_conversion: 'costeo__estado--sinprecio',
};

/**
 * Construye el panel de costo para un plan ya consolidado.
 *
 * @param {Object} options
 * @param {{lineas: Array}} options.plan lo que devuelve `consolidar()`
 * @param {Array<object>} options.lotes existencias del almacen
 * @param {string} [options.rotulo] que representa la cifra total
 * @param {object} [options.costeo] costeo ya calculado, para no repetir la cuenta
 * @returns {HTMLElement}
 */
export function renderCosteo(options) {
  const caja = el('section', { class: 'costeo' });
  const lotes = options.lotes || [];

  if (lotes.length === 0 && !options.costeo && !options.plan?.lineas?.length) {
    // Sin almacen no hay nada que cruzar, y decirlo es mas util que enseñar una
    // tabla de ceros: la salida es dar de alta las compras.
    caja.appendChild(
      el('p', {
        class: 'costeo__vacio',
        text:
          'El almacén de este equipo está vacío, así que todavía no se puede calcular el costo. Da de alta tus compras en Almacén y esta cuenta aparecerá sola.',
      }),
    );
    return caja;
  }

  const costeo = options.costeo || costearPlan(options.plan.lineas, lotes, options.hoy);
  pintar();
  return caja;

  function pintar() {
    clear(caja);

    const cubierto = Math.round(costeo.cubiertoTotal * 100);

    caja.appendChild(
      el('div', { class: 'costeo__cabecera' }, [
        el('div', { class: 'costeo__total' }, [
          el('span', { class: 'costeo__total-cifra', text: pesos(costeo.costoTotal) }),
          el('span', {
            class: 'costeo__total-rotulo',
            text: options.rotulo || 'costo cubierto de las tandas pendientes; excluye faltantes',
          }),
        ]),
        el('div', { class: 'costeo__datos' }, [
          dato(`${cubierto}%`, 'cobertura media por ingrediente'),
        dato(String(costeo.lineasConFaltante), 'por completar'),
        dato(String(costeo.lineasSinPrecio), 'sin precio o equivalencia'),
        ]),
      ]),
    );

    /*
     * EL AVISO QUE EVITA QUE LA CIFRA SE LEA MAL.
     *
     * El costeo NO cuenta los lotes vencidos, a proposito: FEFO aplicado a
     * ciegas los pondria los primeros de la fila y mandaria producto caducado
     * al obrador. Pero si no se dice, el plan diria que falta harina teniendo un
     * bulto en la estanteria, y pareceria un fallo del programa.
     */
    if (costeo.lotesVencidosIgnorados > 0) {
      caja.appendChild(
        el('p', {
          class: 'costeo__aviso',
          text:
            costeo.lotesVencidosIgnorados === 1
              ? 'Hay 1 lote vencido en el almacén y no se ha contado como disponible.'
              : `Hay ${costeo.lotesVencidosIgnorados} lotes vencidos en el almacén y no se han contado como disponibles.`,
        }),
      );
    }

    if (costeo.lineasSinPrecio > 0) {
      caja.appendChild(
        el('p', {
          class: 'costeo__aviso',
          text:
            'El costo se calcula en gramos con las equivalencias de Bodega. Completa los pesos equivalentes y las compras que falten; una equivalencia desconocida no se supone.',
        }),
      );
    }

    caja.appendChild(
      el('div', { class: 'costeo__head', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { text: 'ingrediente' }),
        el('span', { class: 'costeo__num', text: 'necesita' }),
        el('span', { class: 'costeo__num', text: 'en bodega' }),
        el('span', { class: 'costeo__num', text: 'falta' }),
        el('span', { class: 'costeo__num', text: 'precio / und' }),
        el('span', { class: 'costeo__num', text: 'costo' }),
        el('span'),
      ]),
    );

    caja.appendChild(el('ul', { class: 'costeo__lista' }, agruparGramos(costeo.lineas).map(linea)));

  }

  function dato(cifra, rotulo) {
    return el('div', { class: 'costeo__dato' }, [
      el('span', { class: 'costeo__dato-cifra', text: cifra }),
      el('span', { class: 'costeo__dato-rotulo', text: rotulo }),
    ]);
  }

  function linea(l) {
    return el('li', { class: 'costeo__linea', dataset: { ingrediente: l.ingrediente } }, [
      el('span', { class: 'costeo__ing' }, [el('span', { text: titleCase(l.ingrediente) }),
        el('small', { text: ' · Fórmula: ' + (l.fuentes || [l]).map((f) =>
          `${formatQty(f.cantidadReceta ?? f.cantidad)} ${f.unidadReceta || f.unidad} → ${f.cantidad === null ? 'sin convertir' : formatQty(f.cantidad) + ' g'}`).join(' + ') }),
        l.motivo ? el('small', { text: ` · ${l.motivo}` }) : null]),
      el('span', { class: 'costeo__num', text: l.cantidad === null ? 'Sin convertir' : `${formatQty(l.cantidad)} ${l.unidad}` }),
      el('span', { class: 'costeo__num', text: formatQty(l.disponible) }),
      el('span', {
        class: 'costeo__num',
        text: l.faltante > 0 ? formatQty(l.faltante) : '—',
      }),
      el('span', {
        class: 'costeo__num',
        // Tres decimales: un gramo de harina vale menos de un peso, y sin
        // decimales la columna entera diria "$0".
        text:
          l.precioMedio === null
            ? '—'
            : '$' + (Math.round(l.precioMedio * 1000) / 1000).toLocaleString('es-CO'),
      }),
      el('span', { class: 'costeo__num costeo__costo', text: l.costo > 0 ? pesos(l.costo) : '—' }),
      el('span', { class: 'costeo__estado ' + CLASE[l.estado], text: ROTULO[l.estado] }),
      l.origen && l.origen.length ? lotesDe(l) : null,
    ]);
  }

  /**
   * De que compras sale la cifra: el ingrediente UNICO es el lote comprado,
   * con su proveedor, su vencimiento y su precio. Es lo que permite comprobar
   * el costo contra la factura en vez de creerlo.
   */
  function lotesDe(l) {
    const nombre = titleCase(l.ingrediente);
    return el('details', { class: 'costeo__lotes' }, [
      el('summary', { text: `${l.origen.length === 1 ? 'De 1 compra' : `De ${l.origen.length} compras`} (vence antes, sale antes)` }),
      el('table', { class: 'costeo__lotes-tabla' }, [
        el('caption', { class: 'sr-only', text: `Compras de bodega que cubren ${nombre}` }),
        el('thead', {}, [el('tr', {}, ['Lote', 'Proveedor', 'Vence', 'Sale', 'Precio / und', 'Costo']
          .map((t) => el('th', { scope: 'col', text: t })))]),
        el('tbody', {}, l.origen.map((t) => el('tr', {}, [
          el('td', { text: [t.loteId, t.lote].filter(Boolean).join(' · ') }),
          el('td', { text: t.proveedor || t.marca || '—' }),
          el('td', { text: t.vencimiento || 'sin fecha' }),
          el('td', { class: 'costeo__num', text: `${formatQty(t.cantidad)} ${t.unidad || l.unidad}${t.cantidadGramos === undefined ? '' : ` = ${formatQty(t.cantidadGramos)} g`}` }),
          el('td', { class: 'costeo__num', text: t.precioUnitario === null ? 'sin precio'
            : '$' + (Math.round(t.precioUnitario * 1000) / 1000).toLocaleString('es-CO') + `/${t.unidad || l.unidad}`
              + (t.precioPorGramo === undefined ? '' : ` · $${t.precioPorGramo.toLocaleString('es-CO', { maximumFractionDigits: 6 })}/g`) }),
          el('td', { class: 'costeo__num', text: pesos(t.costo) }),
        ]))),
      ]),
    ]);
  }
}
