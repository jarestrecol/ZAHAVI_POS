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
 *  NO ESCRIBE NADA POR SU CUENTA. El calculo es una transformacion de lectura
 *  (`core/costeo.js`) y descontar es una accion explicita que sale por callback
 *  hasta `app/almacen.js`.
 */

import { el, clear } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { formatQty, pesos, titleCase } from '../lib/format.js';
import { costearPlan } from '../core/costeo.js';

/** Rotulo de cada estado. El color nunca es la unica señal. */
const ROTULO = {
  ok: 'Cubierto',
  parcial: 'No alcanza',
  sin_existencia: 'Sin existencia',
  sin_precio: 'Sin precio',
};

const CLASE = {
  ok: 'costeo__estado--ok',
  parcial: 'costeo__estado--parcial',
  sin_existencia: 'costeo__estado--parcial',
  sin_precio: 'costeo__estado--sinprecio',
};

/**
 * Construye el panel de costo para un plan ya consolidado.
 *
 * @param {Object} options
 * @param {{lineas: Array}} options.plan lo que devuelve `consolidar()`
 * @param {Array<object>} options.lotes existencias del almacen
 * @param {(costeo: object) => object} options.onDescontar
 * @returns {HTMLElement}
 */
export function renderCosteo(options) {
  const caja = el('section', { class: 'costeo' });
  const lotes = options.lotes || [];

  if (lotes.length === 0) {
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

  const costeo = costearPlan(options.plan.lineas, lotes);
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
            text: 'costo de esta producción, con lo que hay en bodega',
          }),
        ]),
        el('div', { class: 'costeo__datos' }, [
          dato(`${cubierto}%`, 'cubierto por el almacén'),
          dato(String(costeo.lineasConFaltante), 'hay que comprar'),
          dato(String(costeo.lineasSinPrecio), 'sin precio'),
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
            'Lo marcado como «sin precio» no está en el almacén con esa misma unidad de medida. Las unidades nunca se convierten solas: decidir si son lo mismo es cosa de la panadería.',
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

    caja.appendChild(el('ul', { class: 'costeo__lista' }, costeo.lineas.map(linea)));

    caja.appendChild(pie());
  }

  function dato(cifra, rotulo) {
    return el('div', { class: 'costeo__dato' }, [
      el('span', { class: 'costeo__dato-cifra', text: cifra }),
      el('span', { class: 'costeo__dato-rotulo', text: rotulo }),
    ]);
  }

  function linea(l) {
    return el('li', { class: 'costeo__linea' }, [
      el('span', { class: 'costeo__ing', text: titleCase(l.ingrediente) }),
      el('span', { class: 'costeo__num', text: `${formatQty(l.cantidad)} ${l.unidad}` }),
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
    ]);
  }

  /**
   * El pie, con la accion destructiva.
   *
   * Descontar del almacen no se hace de un toque: se pregunta primero, y la
   * pregunta dice exactamente cuanto se va a restar. Es la unica accion de esta
   * pantalla que cambia datos.
   */
  function pie() {
    const host = el('div', { class: 'costeo__acciones' });

    const botonDescontar = el('button', {
      type: 'button',
      class: 'btn btn--primary',
      text: 'Descontar del almacén',
      disabled: costeo.costoTotal <= 0,
      on: { click: () => preguntar() },
    });

    host.appendChild(
      el('p', {
        class: 'costeo__nota',
        text: 'Descontar resta del almacén lo que esta producción va a consumir. Solo se resta lo que hay.',
      }),
    );
    host.appendChild(botonDescontar);

    function preguntar() {
      clear(host);
      host.appendChild(
        el('div', { class: 'costeo__confirmar' }, [
          el('span', {
            text: `¿Descontar del almacén ${pesos(costeo.costoTotal)} de materia prima? Esto cambia las existencias.`,
          }),
          el('button', {
            type: 'button',
            class: 'btn btn--primary',
            text: 'Sí, descontar',
            on: {
              click: () => {
                const r = options.onDescontar(costeo);
                const texto =
                  r && r.ok
                    ? 'Descontado del almacén. Las existencias ya están actualizadas.'
                    : (r && r.message) || 'No se pudo descontar.';

                /*
                 * EL RESULTADO RECOGE EL FOCO.
                 *
                 * El boton que se acaba de pulsar desaparece con este repintado,
                 * asi que sin esto el foco caeria al `body`: la ventana dejaria
                 * de responder al teclado y Escape no la cerraria, que es como
                 * alguien que navega sin raton se queda atrapado dentro.
                 *
                 * `tabindex="-1"` lo hace enfocable por programa sin meterlo en
                 * el recorrido del tabulador, que es el patron correcto para el
                 * resultado de una accion.
                 */
                const aviso = el('p', {
                  class: r && r.ok ? 'costeo__hecho' : 'costeo__aviso',
                  text: texto,
                  attrs: { tabindex: '-1' },
                });

                clear(host);
                host.appendChild(aviso);
                aviso.focus();
                announce(texto, 'assertive');
              },
            },
          }),
          el('button', {
            type: 'button',
            class: 'btn btn--quiet',
            text: 'Ahora no',
            on: {
              click: () => {
                pintar();
                // El boton que se pulso ya no existe: el foco vuelve a la accion
                // de la que se acaba de salir.
                const volver = caja.querySelector('.costeo__acciones button');
                if (volver) volver.focus();
              },
            },
          }),
        ]),
      );
      const primero = host.querySelector('button');
      if (primero) primero.focus();
    }

    return host;
  }
}
