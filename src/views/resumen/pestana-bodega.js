/**
 * =============================================================================
 *  RESUMEN · PESTAÑA «BODEGA Y COMPRAS»
 * =============================================================================
 *
 *  Cuánto hay, cuánto dura, qué vence y, para quien ve dinero, cuánto vale la
 *  bodega, cuánto se compró frente a lo que se consumió, a quién y cuánto han
 *  subido los precios. Recibe `panel.bodega` ya calculado por el núcleo.
 *
 *  LO QUE SIRVE A TODOS VA SIEMPRE. La cobertura (días que alcanza cada
 *  ingrediente) y los vencimientos no son dinero: el jefe de obrador los
 *  necesita para planear. Lo de pesos solo se pinta si el dato llegó; el núcleo
 *  ya lo quitó para quien no puede verlo (`sinDinero`), sin dejar huecos.
 *
 *  LISTAS VISIBLES, NO GRÁFICAS, para cobertura y vencimientos: la pregunta es
 *  «¿qué ingrediente?», y un nombre con su cifra y su estado en palabras la
 *  responde mejor que una barra.
 */

import { el, icon } from '../../lib/dom.js';
import { formatear } from '../graficas/comun.js';
import { graficaLineas } from '../graficas/lineas.js';
import { graficaColumnas } from '../graficas/columnas.js';
import { graficaBarras } from '../graficas/barras.js';
import { tablaDeDatos } from '../graficas/tabla.js';
import { ICONO_BIEN, ICONO_ATENCION, ICONO_MAL } from './kpi.js';
import { bloque, bloqueVacio, contenedorPestana, comoLista, esNumero, serieConDatos, nombreReceta, legible } from './pestana-produccion.js';

const IR_A_BODEGA = 'Registra las compras en Bodega, con su precio, peso y vencimiento.';

/** Filas visibles de cobertura; el resto queda en la tabla completa. */
const COBERTURA_VISIBLE = 10;

/**
 * Estado de cobertura en palabras, con icono: nunca solo color. El núcleo usa
 * el semáforo común (bien/atención/mal) o dice que no hay consumo para medir.
 */
const ESTADOS = Object.freeze({
  bien: { palabra: 'Alcanza', icono: ICONO_BIEN, tono: 'bien' },
  atencion: { palabra: 'Poco', icono: ICONO_ATENCION, tono: 'atencion' },
  mal: { palabra: 'Bajo la meta', icono: ICONO_MAL, tono: 'mal' },
  agotado: { palabra: 'Agotado', icono: ICONO_MAL, tono: 'mal' },
  sin_consumo: { palabra: 'Sin consumo', icono: null, tono: 'neutro' },
  sin_datos: { palabra: 'Sin consumo', icono: null, tono: 'neutro' },
  sin_meta: { palabra: 'Sin meta', icono: null, tono: 'neutro' },
});

function estadoCobertura(fila) {
  const conocido = ESTADOS[fila.estado];
  if (conocido) return conocido;
  // Un estado que esta vista no conoce se muestra tal cual, en texto: mejor
  // una palabra técnica que un recuadro vacío.
  return { palabra: String(fila.estado || 'Sin dato').replace(/_/g, ' '), icono: null, tono: 'neutro' };
}

function marcaEstado({ palabra, icono, tono }) {
  return el('span', { class: 'analisis__estado', dataset: { tono } }, [
    icono ? icon(icono, { class: 'analisis__estado-icono' }) : null,
    el('span', { text: palabra }),
  ]);
}

/**
 * Peso legible: gramos por debajo del kilo («250 g») y kilos por encima. En kilos
 * con un decimal, el consumo diario de la canela se leería «0 kg».
 */
function peso(gramos) {
  if (!esNumero(gramos)) return '—';
  if (Math.abs(gramos) < 1000) return `${formatear(Math.round(gramos), 'numero')} g`;
  return formatear(gramos / 1000, 'kg');
}

/** «Vence hoy», «Vence en 3 días», «Venció hace 2 días». */
function cuandoVence(dias) {
  if (!esNumero(dias)) return 'Sin fecha';
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1) return `Vence en ${dias} días`;
  if (dias === -1) return 'Venció ayer';
  return `Venció hace ${Math.abs(dias)} días`;
}

/* ---------------------------- Dinero ------------------------------------- */

function bloqueValor(seccion) {
  if (!seccion.valor) return null;
  const contenido = serieConDatos(seccion.valor)
    ? graficaLineas({ titulo: 'Valor de la bodega al cierre de cada periodo', serie: seccion.valor })
    : bloqueVacio('Sin lotes con precio para valorizar la bodega.', IR_A_BODEGA);
  return bloque({ id: 'bod-valor', titulo: 'Valor de la bodega', nota: 'Existencias por su precio de compra.', ancho: true }, [contenido]);
}

function bloqueComprasConsumo(seccion) {
  if (!seccion.comprasVsConsumo) return null;
  const contenido = serieConDatos(seccion.comprasVsConsumo)
    ? graficaColumnas({ titulo: 'Compras y consumo por periodo', serie: seccion.comprasVsConsumo, apiladas: false })
    : bloqueVacio('Sin compras ni consumo en este periodo.', `${IR_A_BODEGA} El consumo aparece al confirmar producción.`);
  return bloque({
    id: 'bod-compras',
    titulo: 'Compras frente a consumo',
    nota: 'Si las compras quedan por encima del consumo, la bodega está creciendo.',
    ancho: true,
  }, [contenido]);
}

function bloqueProveedores(seccion) {
  if (!Array.isArray(seccion.proveedores)) return null;
  const filas = seccion.proveedores.filter((f) => esNumero(f.valor) && f.valor > 0);
  const contenido = filas.length
    ? graficaBarras({
      titulo: 'Total comprado a cada proveedor',
      filas: filas.map((f) => ({ ...f, nombre: legible(f.nombre, 'Sin proveedor'), formato: f.formato || 'pesos' })),
      formato: 'pesos',
      maximoFilas: 8,
      nombreColumna: 'Proveedor',
    })
    : bloqueVacio('Sin compras registradas en este periodo.', IR_A_BODEGA);
  return bloque({ id: 'bod-proveedores', titulo: 'Compras por proveedor' }, [contenido]);
}

/** Precio por kilo, que es como se piensa una compra: «$4.200/kg». */
const porKilo = (precioPorGramo) => (esNumero(precioPorGramo) ? `${formatear(precioPorGramo * 1000, 'pesos')}/kg` : '—');

function bloqueCanasta(seccion) {
  const canasta = seccion.canasta;
  if (!canasta) return null;
  const explicacion = 'Cuánto subió el precio de lo que usas, pesado por lo que consumes de cada ingrediente: si la harina es la mitad del gasto, cuenta la mitad.';
  if (!esNumero(canasta.indice)) {
    return bloque({ id: 'bod-canasta', titulo: 'Inflación de tu canasta', nota: explicacion }, [
      bloqueVacio('Aún no hay dos compras del mismo ingrediente para comparar precios.', 'Registra cada compra en Bodega con su precio: al repetirse, aquí verás cuánto subió.'),
    ]);
  }
  const alzas = comoLista(canasta.alzas).filter((a) => esNumero(a.variacion));
  return bloque({ id: 'bod-canasta', titulo: 'Inflación de tu canasta', nota: explicacion }, [
    el('p', { class: 'analisis__cifra' }, [
      el('span', { class: 'analisis__cifra-valor', text: `${canasta.indice > 0 ? '+' : ''}${formatear(canasta.indice, 'porcentaje')}` }),
      el('span', {
        class: 'analisis__cifra-base',
        text: `en el periodo · ${canasta.comparados ?? 0} de ${canasta.consumidos ?? 0} ingredientes consumidos con precio para comparar`,
      }),
    ]),
    alzas.length
      ? graficaBarras({
        titulo: 'Mayores alzas de precio',
        filas: alzas.map((a, i) => ({
          id: `alza-${i}`,
          nombre: nombreReceta(a.ingrediente),
          valor: a.variacion * 100,
          formato: 'porcentaje',
          detalle: `${porKilo(a.antes)} → ${porKilo(a.despues)}`,
          dinero: true,
        })),
        formato: 'porcentaje',
        maximoFilas: 8,
        nombreColumna: 'Ingrediente',
      })
      : null,
  ]);
}

/* ------------------------- Para todos ------------------------------------ */

function bloqueCobertura(seccion) {
  const filas = comoLista(seccion.cobertura);
  if (!filas.length) {
    return bloque({ id: 'bod-cobertura', titulo: 'Cuánto alcanza la bodega' }, [
      bloqueVacio('Sin existencias en bodega para medir cuánto alcanzan.', IR_A_BODEGA),
    ]);
  }
  const visibles = filas.slice(0, COBERTURA_VISIBLE);
  return bloque({ id: 'bod-cobertura', titulo: 'Cuánto alcanza la bodega', nota: 'Días que alcanza lo que hay, al ritmo de consumo de las últimas 4 semanas. Primero lo que menos dura.', ancho: true }, [
    el('div', { class: 'analisis__tabla-marco' }, [
      el('table', { class: 'analisis__tabla' }, [
        el('caption', { class: 'sr-only', text: `Cobertura de bodega: los ${visibles.length} ingredientes que menos duran` }),
        el('thead', {}, [el('tr', {}, [
          el('th', { attrs: { scope: 'col' }, text: 'Ingrediente' }),
          el('th', { class: 'analisis__num', attrs: { scope: 'col' }, text: 'Alcanza' }),
          el('th', { attrs: { scope: 'col' }, text: 'Estado' }),
          el('th', { class: 'analisis__num analisis__col-extra', attrs: { scope: 'col' }, text: 'Hay' }),
          el('th', { class: 'analisis__num analisis__col-extra', attrs: { scope: 'col' }, text: 'Consumo diario' }),
        ])]),
        el('tbody', {}, visibles.map((f) => el('tr', {}, [
          el('th', { attrs: { scope: 'row' }, text: nombreReceta(f.ingrediente) }),
          el('td', { class: 'analisis__num', text: esNumero(f.dias) ? formatear(f.dias, 'dias') : '—' }),
          el('td', {}, [marcaEstado(estadoCobertura(f))]),
          el('td', { class: 'analisis__num analisis__col-extra', text: peso(f.existenciaGr) }),
          el('td', { class: 'analisis__num analisis__col-extra', text: peso(f.consumoDiarioGr) }),
        ]))),
      ]),
    ]),
    filas.length > visibles.length
      ? tablaDeDatos({
        titulo: `Los ${filas.length} ingredientes`,
        columnas: [
          { id: 'ingrediente', nombre: 'Ingrediente' },
          { id: 'dias', nombre: 'Alcanza', formato: 'dias' },
          { id: 'estado', nombre: 'Estado' },
          { id: 'existencia', nombre: 'Hay', alinear: 'derecha' },
          { id: 'consumo', nombre: 'Consumo diario', alinear: 'derecha' },
        ],
        filas: filas.map((f) => ({
          ingrediente: nombreReceta(f.ingrediente),
          dias: f.dias ?? null,
          estado: estadoCobertura(f).palabra,
          existencia: peso(f.existenciaGr),
          consumo: peso(f.consumoDiarioGr),
        })),
      })
      : null,
  ]);
}

function bloqueVencimientos(seccion) {
  const filas = comoLista(seccion.vencimientos).slice().sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  if (!filas.length) {
    return bloque({ id: 'bod-vencimientos', titulo: 'Vencimientos' }, [
      bloqueVacio('Nada vencido ni por vencer en los próximos días.'),
    ]);
  }
  return bloque({ id: 'bod-vencimientos', titulo: 'Vencimientos', nota: 'Lotes con existencia vencidos o por vencer.' }, [
    el('ul', { class: 'analisis__lista' }, filas.map((f) => {
      const vencido = esNumero(f.dias) && f.dias < 0;
      return el('li', { class: 'analisis__item' }, [
        el('div', { class: 'analisis__item-cabeza' }, [
          el('span', { class: 'analisis__item-nombre', text: nombreReceta(f.ingrediente) }),
          marcaEstado(vencido
            ? { palabra: cuandoVence(f.dias), icono: ICONO_MAL, tono: 'mal' }
            : { palabra: cuandoVence(f.dias), icono: ICONO_ATENCION, tono: 'atencion' }),
        ]),
        el('p', {
          class: 'analisis__item-detalle',
          text: [
            f.loteId ? `Lote ${f.loteId}` : null,
            esNumero(f.existencia) ? `${formatear(f.existencia, 'numero')} ${f.unidad || ''}`.trim() : null,
            esNumero(f.valor) ? formatear(f.valor, 'pesos') : null,
          ].filter(Boolean).join(' · '),
        }),
      ]);
    })),
  ]);
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.seccion `panel.bodega`
 * @param {boolean} opciones.verCostos
 * @param {Object} opciones.rango `panel.rango`
 * @returns {HTMLElement}
 */
export function renderPestanaBodega({ seccion, verCostos = false, rango } = {}) {
  const s = seccion || {};
  const dinero = verCostos
    ? [bloqueValor(s), bloqueComprasConsumo(s), bloqueProveedores(s), bloqueCanasta(s)]
    : [];
  return contenedorPestana('bodega', { indicadores: s.indicadores, rango, etiqueta: 'Indicadores de bodega y compras' }, [
    // Vencimientos antes que la cobertura: con dinero completa la fila de
    // proveedores y canasta en escritorio; la cobertura va a todo el ancho.
    ...dinero,
    bloqueVencimientos(s),
    bloqueCobertura(s),
  ]);
}
