import { el } from '../lib/dom.js';
import { formatMedida, fechaCorta } from '../lib/format.js';
import { medidasDeIngrediente, gramosDeFormula } from '../core/medidas-ingrediente.js';
import { factorGramos, MEDIDAS_EQUIVALENCIA } from '../core/conversiones.js';

const NOMBRES = { GR: 'Gramos', KG: 'Kilogramos', ML: 'Mililitros', LT: 'Litros', UND: 'Unidades', TANDA: 'Tandas', CM: 'Centímetros' };
const ESTADOS = { vencido: 'Vencido: excluido del disponible', futuro: 'Compra futura: excluida',
  proximo: 'Vence pronto', ok: 'En fecha', sin_fecha: 'Sin fecha de vencimiento' };

/** Ficha común de Bodega e Ingredientes. Solo consulta; sin precios privados. */
export function fichaMedidasIngrediente(nombre, lotes, { resumen = medidasDeIngrediente(nombre, lotes), totales = [] } = {}) {
  return el('section', { class: 'medidas-ing', attrs: { 'aria-label': `Medidas de ${nombre}` } }, [
    el('h3', { text: 'Disponibilidad y equivalencias' }),
    el('p', { text: 'Son distintas formas de expresar el mismo inventario; no se suman entre sí. El disponible excluye compras futuras y lotes vencidos.' }),
    el('div', { class: 'medidas-ing__tabla' }, [el('table', {}, [
      el('caption', { class: 'sr-only', text: `Medidas disponibles y peso equivalente de ${nombre}` }),
      el('thead', {}, [el('tr', {}, ['Medida', 'Disponible', 'Peso de 1 medida'].map((t) => el('th', { scope: 'col', text: t })))]),
      el('tbody', {}, resumen.cantidades.map((m) => el('tr', { dataset: { unidad: m.unidad } }, [
        el('th', { scope: 'row', text: NOMBRES[m.unidad] }),
        el('td', { text: m.sinConversion === resumen.disponibles && m.sinConversion > 0 ? 'Falta equivalencia'
          : `${formatMedida(m.cantidad)} ${m.unidad}${m.sinConversion ? ' · parcial' : ''}` }),
        el('td', { text: m.factor !== null ? `${formatMedida(m.factor)} g`
          : m.factores.length > 1 ? 'Varía por lote' : 'Sin registrar' }),
      ]))),
    ])]),
    resumen.cantidades.some((m) => m.sinConversion > 0) ? el('p', { class: 'medidas-ing__nota',
      text: 'Las cifras parciales solo incluyen lotes con equivalencia conocida. Completa los pesos necesarios al editar el lote en Bodega.' }) : null,
    totales.length ? el('div', { class: 'medidas-ing__formulas' }, [
      el('h4', { text: 'Cantidades originales del recetario' }),
      el('p', { text: 'Suma de las fórmulas base, no consumo de producción. El recetario conserva sus datos originales.' }),
      el('ul', {}, totales.map((t) => {
        const gramos = gramosDeFormula(t.total, t.unidad, resumen);
        return el('li', { text: `${formatMedida(t.total)} ${t.unidad} → ${gramos === null ? 'falta equivalencia única en gramos' : `${formatMedida(gramos)} g`}` });
      })),
    ]) : null,
    el('details', { class: 'medidas-ing__lotes' }, [
      el('summary', { text: `Compras y pesos por lote (${resumen.detalle.length})` }),
      ...resumen.detalle.map(({ lote, estado, gramosCompra, gramosExistencia }) => el('article', {}, [
        el('h4', { text: [lote.id, lote.lote, lote.marca].filter(Boolean).join(' · ') }),
        el('p', { text: `${lote.proveedor || 'Sin proveedor'} · ${lote.presentacion || 'Sin presentación'} · Compra: ${fechaCorta(lote.fechaCompra)}` }),
        el('p', { text: `Comprado: ${formatMedida(lote.pesoCompra)} ${lote.unidad} = ${gramosCompra === null ? 'peso sin registrar' : `${formatMedida(gramosCompra)} g`}` }),
        el('p', { text: `Existencia: ${formatMedida(lote.existencia)} ${lote.unidad} = ${gramosExistencia === null ? 'peso sin registrar' : `${formatMedida(gramosExistencia)} g`}` }),
        el('p', { text: `${ESTADOS[estado]} · ${fechaCorta(lote.vencimiento)}` }),
        el('ul', {}, MEDIDAS_EQUIVALENCIA.filter((u) => factorGramos(u, lote.equivalencias) !== null)
          .map((u) => el('li', { text: `1 ${u} = ${formatMedida(factorGramos(u, lote.equivalencias))} g` }))),
      ])),
      resumen.detalle.length ? null : el('p', { text: 'Todavía no hay compras de este ingrediente en Bodega.' }),
    ]),
  ]);
}
