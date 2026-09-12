/**
 * =============================================================================
 *  CASOS DE USO DEL ALMACEN
 * =============================================================================
 *
 *  Lo que CAMBIA el almacen. `core/almacen.js` sabe de datos y reglas, las
 *  vistas construyen pantallas, y aqui en medio vive lo que orquesta las dos
 *  cosas: leer, validar, guardar y avisar.
 *
 *  Es el unico sitio que hace `setState` del modulo. Las vistas reciben
 *  callbacks, que es la regla 12 del proyecto y la comprueba
 *  `scripts/verificar.mjs`.
 */

import { getState, setState, notify } from '../core/store.js';
import {
  leerAlmacen,
  guardarLotes,
  validarLote,
  siguienteId,
  lotesDemo,
} from '../core/almacen.js';
import { bajasDelCosteo } from '../core/costeo.js';
import { pesos } from '../lib/format.js';

/**
 * Costeos que YA se descontaron.
 *
 * Es un `WeakSet` y no una bandera porque lo que hay que recordar es "este
 * resultado concreto ya se aplico", no "se esta aplicando algo". Sin esto, un
 * doble toque en el boton de descontar -que en una tableta con harina en los
 * dedos pasa constantemente- restaria dos veces la misma produccion y dejaria
 * el almacen corto sin que nadie pudiera notarlo mirando la pantalla.
 *
 * `WeakSet` para que el resultado se pueda recoger cuando nadie lo use ya.
 */
const yaDescontados = new WeakSet();

/**
 * Carga el almacen de este aparato en el estado.
 *
 * @returns {{lotes: Array<object>, warning: string}}
 */
export function cargarAlmacen() {
  const leido = leerAlmacen();
  setState({ almacen: { lotes: leido.lotes } });
  if (leido.warning) notify(leido.warning, 'info');
  return leido;
}

/**
 * Da de alta o modifica un lote.
 *
 * @param {object} lote
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function guardarLote(lote) {
  const revisado = validarLote(lote);
  if (!revisado.ok) return revisado;

  const actuales = getState().almacen.lotes;
  const limpio = revisado.value;

  // Sin codigo es un alta. Se pide uno nuevo aqui y no en la vista: el codigo
  // depende de todos los demas lotes, y eso es una regla de negocio.
  if (!limpio.id) limpio.id = siguienteId(actuales);

  const indice = actuales.findIndex((l) => l.id === limpio.id);
  const siguientes = indice >= 0
    ? actuales.map((l, i) => (i === indice ? limpio : l))
    : [...actuales, limpio];

  const escrito = guardarLotes(siguientes);
  if (!escrito.ok) return escrito;

  setState({ almacen: { lotes: siguientes } });
  notify(
    indice >= 0 ? `Lote ${limpio.id} actualizado.` : `Lote ${limpio.id} dado de alta.`,
    'success',
  );
  return { ok: true, value: limpio };
}

/**
 * Elimina un lote.
 *
 * @param {string} id
 * @returns {{ok: true, value: any} | {ok: false, code: string, message: string}}
 */
export function eliminarLote(id) {
  const actuales = getState().almacen.lotes;
  const siguientes = actuales.filter((l) => l.id !== id);

  if (siguientes.length === actuales.length) {
    return { ok: false, code: 'no_existe', message: 'Ese lote ya no está en el almacén.' };
  }

  const escrito = guardarLotes(siguientes);
  if (!escrito.ok) return escrito;

  setState({ almacen: { lotes: siguientes } });
  notify(`Lote ${id} eliminado del almacén.`, 'success');
  return { ok: true, value: undefined };
}

/**
 * Descuenta del almacen lo que una produccion va a consumir.
 *
 * ES DESTRUCTIVO Y NUNCA OCURRE SOLO. Lo pide una persona despues de ver
 * exactamente que se va a descontar. Solo se resta lo que el costeo dio por
 * CUBIERTO: lo que falta no estaba, asi que no hay nada que restar, y restarlo
 * dejaria existencias negativas fingiendo un consumo que no ocurrio.
 *
 * @param {{lineas: Array<object>}} costeo el resultado de `costearPlan`
 * @returns {{ok: true, value: {lotes: number, importe: number}} | {ok: false, code: string, message: string}}
 */
export function descontarProduccion(costeo) {
  if (!costeo || !Array.isArray(costeo.lineas) || costeo.lineas.length === 0) {
    return { ok: false, code: 'sin_costeo', message: 'No hay ninguna producción calculada que descontar.' };
  }

  if (yaDescontados.has(costeo)) {
    return {
      ok: false,
      code: 'ya_descontado',
      message: 'Esta producción ya se descontó del almacén. No se ha restado dos veces.',
    };
  }

  const bajas = bajasDelCosteo(costeo);
  if (bajas.size === 0) {
    return {
      ok: false,
      code: 'nada_que_descontar',
      message: 'Ninguno de estos ingredientes está en el almacén, así que no hay nada que descontar.',
    };
  }

  const actuales = getState().almacen.lotes;
  const siguientes = actuales.map((lote) => {
    const sale = bajas.get(lote.id);
    if (!sale) return lote;
    // `Math.max(0, ...)` es la ultima red: el costeo ya limita el consumo a lo
    // disponible, pero una existencia negativa es de esos errores que no se ven
    // mirando la pantalla y envenenan todas las cuentas de despues.
    return { ...lote, existencia: Math.max(0, redondear(lote.existencia - sale)) };
  });

  const escrito = guardarLotes(siguientes);
  if (!escrito.ok) return escrito;

  yaDescontados.add(costeo);
  setState({ almacen: { lotes: siguientes, costeo: null } });

  const importe = costeo.costoTotal || 0;
  notify(
    `Producción descontada del almacén: ${bajas.size} lotes, ${pesos(importe)}.`,
    'success',
  );
  return { ok: true, value: { lotes: bajas.size, importe } };
}

/**
 * Siembra lotes de ejemplo, solo si el almacen esta vacio.
 *
 * Existe porque un almacen en blanco no enseña nada: no se ve como se lee una
 * fila, ni que significa un lote vencido, ni como cruza con el plan del dia.
 * Con datos de ejemplo la pantalla se explica sola desde el primer minuto.
 *
 * NUNCA pisa datos reales: si ya hay un solo lote, no hace nada.
 *
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
export function sembrarDemo() {
  const actuales = getState().almacen.lotes;
  if (actuales.length > 0) {
    return {
      ok: false,
      code: 'almacen_con_datos',
      message: 'El almacén ya tiene lotes: los de ejemplo no se añaden para no mezclarlos con los reales.',
    };
  }

  const demo = lotesDemo();
  const escrito = guardarLotes(demo);
  if (!escrito.ok) return escrito;

  setState({ almacen: { lotes: demo } });
  return { ok: true, value: demo.length };
}

/**
 * Vacia el almacen entero de este aparato.
 *
 * Sirve sobre todo para quitar los lotes de ejemplo de una vez cuando llegan los
 * de verdad. Quien llama tiene que haber confirmado antes.
 *
 * @returns {{ok: true, value: any} | {ok: false, code: string, message: string}}
 */
export function vaciarAlmacen() {
  const escrito = guardarLotes([]);
  if (!escrito.ok) return escrito;
  setState({ almacen: { lotes: [], costeo: null } });
  notify('Almacén vaciado en este equipo.', 'success');
  return { ok: true, value: undefined };
}

function redondear(valor) {
  return Math.round(Number(valor) * 1000) / 1000;
}
