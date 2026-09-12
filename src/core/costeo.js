/**
 * =============================================================================
 *  COSTEO DE LA PRODUCCION CONTRA EL ALMACEN
 * =============================================================================
 *
 *  Responde la pregunta que el usuario formulo asi:
 *
 *      "si yo voy a cargar el plan del dia, de alguna forma matematica me pueda
 *       decir cuanto es el costo de la produccion en relacion a lo que compre y
 *       tengo en almacen, y pueda ir tanto descontando de bodega lo que voy a
 *       producir como calcularle el precio por unidad de medida de lo que voy a
 *       consumir"
 *
 *  ES UNA TRANSFORMACION DE LECTURA: NO ESCRIBE NADA.
 *  ---------------------------------------------------
 *  Igual que `core/scale.js` y `core/plan.js`. Calcular lo que costaria una
 *  produccion y DESCONTARLA del almacen son dos cosas distintas, y mezclarlas
 *  seria el peor error posible aqui: bastaria con abrir la pantalla para que las
 *  existencias empezaran a bajar solas. Descontar vive en `app/almacen.js`, lo
 *  pide una persona de forma explicita, y consume exactamente este resultado.
 *
 *  EL COSTO SE CALCULA LOTE A LOTE, NO CON UN PRECIO MEDIO
 *  ------------------------------------------------------
 *  Dos bultos de harina comprados con dos meses de diferencia no cuestan lo
 *  mismo, y de cual se saque cambia el costo de la tanda. Promediarlos daria una
 *  cifra que no corresponde a ninguna compra real y que ademas se movería sola
 *  cada vez que entrara mercancia nueva. Se consume por FEFO -vence antes, sale
 *  antes- y se suma lo que de verdad cuesta cada tramo.
 *
 *  LA REGLA DE LAS UNIDADES, OTRA VEZ
 *  ----------------------------------
 *  Si el plan pide un ingrediente en GR y el almacen solo lo tiene en UND, esa
 *  linea sale con estado `sin_precio`. NO se busca en otra unidad y NO se
 *  inventa un factor. Es deliberado y es lo que mas dinero protege: `CLAUDE.md`
 *  seccion 13 documenta que decidir si `AGUA` en GR y en ML son lo mismo -lo
 *  son- o si `MANTEQUILLA 1050 UND` es un error -lo es- exige conocer la
 *  formula, y eso lo decide la panaderia.
 */

import { claveDe, estadoVencimiento, lotesOrdenadosFEFO, valorUnitario } from './almacen.js';

/**
 * @typedef {Object} LineaCosteada
 * @property {string} ingrediente
 * @property {string} unidad
 * @property {number} cantidad   lo que pide el plan
 * @property {number} disponible existencia total en esa MISMA unidad
 * @property {number} consumo    lo que se puede cubrir
 * @property {number} faltante   lo que habria que comprar
 * @property {number} costo      suma real por lote, en pesos
 * @property {number|null} precioMedio  costo por unidad de medida consumida
 * @property {'ok'|'parcial'|'sin_existencia'|'sin_precio'} estado
 * @property {Array<object>} origen  de que lotes sale, y cuanto de cada uno
 */

/**
 * Cruza las lineas consolidadas del plan con las existencias del almacen.
 *
 * @param {Array<{ingrediente: string, unidad: string, cantidad: number}>} lineasDelPlan
 *   las que devuelve `consolidar()` de `core/plan.js`
 * @param {Array<object>} lotes
 * @param {Date|string} [hoy]
 * @returns {{lineas: Array<LineaCosteada>, costoTotal: number, lineasSinPrecio: number, lineasConFaltante: number, cubiertoTotal: number}}
 */
export function costearPlan(lineasDelPlan, lotes, hoy) {
  // Las existencias se agrupan por ingrediente+unidad UNA VEZ y se van gastando
  // sobre esa copia. Asi dos lineas del mismo ingrediente no pueden "gastar" las
  // mismas existencias dos veces, que es como un plan pareceria cubierto cuando
  // no lo esta.
  const agrupado = agruparDisponible(lotes, hoy);
  const despensa = agrupado.despensa;

  const lineas = [];
  let costoTotal = 0;
  let lineasSinPrecio = 0;
  let lineasConFaltante = 0;
  let pedidoTotal = 0;
  let cubiertoAcumulado = 0;

  for (const linea of lineasDelPlan || []) {
    const unidad = String(linea.unidad || '').trim().toUpperCase();
    const cantidad = cifra(linea.cantidad);
    const clave = claveDe(linea.ingrediente, unidad);
    const bolsa = despensa.get(clave);

    pedidoTotal += cantidad;

    if (!bolsa || bolsa.restantes.length === 0) {
      // Ni una sola compra de este ingrediente EN ESTA UNIDAD.
      lineas.push({
        ingrediente: linea.ingrediente,
        unidad,
        cantidad,
        disponible: 0,
        consumo: 0,
        faltante: cantidad,
        costo: 0,
        precioMedio: null,
        estado: 'sin_precio',
        origen: [],
      });
      lineasSinPrecio += 1;
      lineasConFaltante += 1;
      continue;
    }

    const disponible = bolsa.restantes.reduce((n, r) => n + r.queda, 0);
    let porCubrir = Math.min(cantidad, disponible);
    const consumo = porCubrir;
    let costo = 0;
    const origen = [];

    // FEFO: se recorre en el orden en que vencen, gastando cada lote hasta
    // agotarlo antes de pasar al siguiente.
    for (const resto of bolsa.restantes) {
      if (porCubrir <= 0) break;
      if (resto.queda <= 0) continue;

      const sale = Math.min(resto.queda, porCubrir);
      const unitario = valorUnitario(resto.lote);
      const importe = unitario === null ? 0 : unitario * sale;

      resto.queda -= sale;
      porCubrir -= sale;
      costo += importe;

      origen.push({
        loteId: resto.lote.id,
        lote: resto.lote.lote,
        marca: resto.lote.marca,
        cantidad: sale,
        costo: Math.round(importe),
        vencimiento: resto.lote.vencimiento,
        sinPrecio: unitario === null,
      });
    }

    const faltante = redondearCantidad(cantidad - consumo);
    const estado = consumo <= 0 ? 'sin_existencia' : faltante > 0 ? 'parcial' : 'ok';

    if (faltante > 0) lineasConFaltante += 1;
    cubiertoAcumulado += consumo;
    costoTotal += costo;

    lineas.push({
      ingrediente: linea.ingrediente,
      unidad,
      cantidad,
      disponible: redondearCantidad(disponible),
      consumo: redondearCantidad(consumo),
      faltante,
      // El dinero se redondea AQUI y solo aqui, al cerrar la linea. Redondear
      // cada tramo por separado y sumar despues hace que el total no cuadre con
      // la suma de lo que se ve en pantalla, que es justo la clase de error que
      // hace desconfiar de toda la cifra.
      costo: Math.round(costo),
      precioMedio: consumo > 0 ? costo / consumo : null,
      estado,
      origen,
    });
  }

  return {
    lineas,
    costoTotal: Math.round(costoTotal),
    lineasSinPrecio,
    lineasConFaltante,
    cubiertoTotal: pedidoTotal > 0 ? cubiertoAcumulado / pedidoTotal : 0,
    // Lotes que existen y tienen existencia, pero que NO se han contado por
    // estar vencidos. Se informa para que la cifra se pueda leer bien: si no,
    // el plan diria que falta harina teniendo un bulto en la estanteria, y
    // pareceria un fallo del programa en vez de lo que es.
    lotesVencidosIgnorados: agrupado.vencidosIgnorados,
  };
}

/**
 * Convierte un costeo en las bajas que habria que aplicar al almacen.
 *
 * Se devuelve como dato y no se aplica: quien escribe es `app/almacen.js`.
 * Separarlo permite ademas enseñar en pantalla exactamente que se va a
 * descontar ANTES de tocar nada.
 *
 * @param {{lineas: Array<LineaCosteada>}} costeo
 * @returns {Map<string, number>} id de lote -> cuanto sale de el
 */
export function bajasDelCosteo(costeo) {
  const bajas = new Map();
  for (const linea of (costeo && costeo.lineas) || []) {
    for (const tramo of linea.origen || []) {
      bajas.set(tramo.loteId, (bajas.get(tramo.loteId) || 0) + tramo.cantidad);
    }
  }
  return bajas;
}

/* ===========================================================================
 *  AYUDAS
 * ======================================================================== */

/**
 * Agrupa las existencias por ingrediente+unidad, ya en orden FEFO.
 *
 * LO VENCIDO NO SE CUENTA, Y ESTO NO ES UN DETALLE
 * -----------------------------------------------
 * FEFO significa "lo que vence antes, sale antes", y aplicado sin mas a un
 * almacen que contiene un lote YA vencido produce justo lo contrario de lo que
 * se busca: ese lote es el primero de la fila, asi que seria el primero en
 * entrar en produccion. En un almacen de alimentos eso no es una imprecision de
 * la cuenta, es mandar producto caducado al obrador.
 *
 * Se comprobo ejecutandolo: con los lotes de ejemplo, pedir 2.000 GR de
 * `CHOCOLATE 70%` gastaba primero los 1.500 del lote vencido.
 *
 * Asi que lo vencido queda fuera del calculo, y el resultado dice cuantos lotes
 * se dejaron fuera para que la cifra se pueda interpretar. Que hacer con ese
 * producto -tirarlo, devolverlo, revisar la fecha- es una decision del negocio,
 * y esta pantalla no la toma: solo se niega a contarlo como disponible.
 *
 * @param {Array<object>} lotes
 * @param {Date|string} [hoy]
 * @returns {{despensa: Map<string, {restantes: Array<{lote: object, queda: number}>}>, vencidosIgnorados: number}}
 */
function agruparDisponible(lotes, hoy) {
  const mapa = new Map();
  let vencidosIgnorados = 0;

  for (const lote of lotesOrdenadosFEFO(lotes)) {
    const queda = cifra(lote.existencia);
    if (queda <= 0) continue;

    if (estadoVencimiento(lote, hoy) === 'vencido') {
      vencidosIgnorados += 1;
      continue;
    }

    const clave = claveDe(lote.ingrediente, lote.unidad);
    if (!mapa.has(clave)) mapa.set(clave, { restantes: [] });
    mapa.get(clave).restantes.push({ lote, queda });
  }

  return { despensa: mapa, vencidosIgnorados };
}

function cifra(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const leido = parseFloat(String(valor === undefined || valor === null ? '' : valor).replace(',', '.'));
  return Number.isFinite(leido) ? leido : 0;
}

/**
 * Recorta la basura de coma flotante de las cantidades.
 *
 * Sin esto, restar 1000 menos 999,9 deja `0.09999999999997726` y la pantalla
 * enseña un faltante que no existe. Tres decimales sobran para gramos.
 */
function redondearCantidad(valor) {
  return Math.round(valor * 1000) / 1000;
}
