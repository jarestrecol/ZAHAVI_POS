import { claveDe, estadoVencimiento, lotesOrdenadosFEFO } from './almacen.js';
import { factorGramos, unidadCanonica } from './conversiones.js';
import { hoyLocal } from './bitacora.js';

/** Consulta de medidas: no cambia lotes ni fórmulas y no simula consumos. */
export function medidasDeIngrediente(nombre, lotes, fecha = hoyLocal()) {
  const propios = lotesOrdenadosFEFO(lotes || []).filter((l) => claveDe(l.ingrediente, '') === claveDe(nombre, ''));
  const detalle = propios.map((lote) => {
    const estado = lote.fechaCompra && lote.fechaCompra > fecha ? 'futuro' : estadoVencimiento(lote, fecha);
    const factor = factorGramos(lote.unidad, lote.equivalencias);
    return { lote, estado, factor, utilizable: lote.existencia > 0 && !['vencido', 'futuro'].includes(estado),
      gramosCompra: factor === null ? null : lote.pesoCompra * factor,
      gramosExistencia: factor === null ? null : lote.existencia * factor };
  });
  const disponibles = detalle.filter((d) => d.utilizable);
  const referencias = disponibles.length ? disponibles : detalle.filter((d) => !['vencido', 'futuro'].includes(d.estado));
  const unidades = ['GR', 'KG', 'ML', 'LT', 'UND', 'TANDA'];
  if (propios.some((l) => unidadCanonica(l.unidad) === 'CM' || l.equivalencias?.CM)) unidades.push('CM');
  const equivalencias = unidades.map((unidad) => {
    const fijo = factorGramos(unidad);
    const factores = fijo === null
      ? [...new Set(referencias.map((d) => factorGramos(unidad, d.lote.equivalencias)).filter((f) => f !== null))]
      : [fijo];
    return { unidad, factores, factor: factores.length === 1 ? factores[0] : null };
  });
  const cantidades = equivalencias.map(({ unidad, factor, factores }) => {
    let cantidad = 0, sinConversion = 0;
    for (const d of disponibles) {
      const origen = unidadCanonica(d.lote.unidad);
      let valor;
      // Las medidas de la misma dimensión no necesitan densidad/peso.
      if (origen === unidad) valor = d.lote.existencia;
      else if (origen === 'LT' && unidad === 'ML') valor = d.lote.existencia * 1000;
      else if (origen === 'ML' && unidad === 'LT') valor = d.lote.existencia / 1000;
      else {
        const destino = factorGramos(unidad, d.lote.equivalencias) ?? factor;
        valor = d.gramosExistencia === null || destino === null ? null : d.gramosExistencia / destino;
      }
      if (valor === null || !Number.isFinite(valor)) sinConversion++;
      else cantidad += valor;
    }
    return { unidad, cantidad, sinConversion, factor, factores };
  });
  const originales = new Map();
  for (const d of disponibles) originales.set(d.lote.unidad, (originales.get(d.lote.unidad) || 0) + d.lote.existencia);
  return { nombre, detalle, disponibles: disponibles.length, cantidades, equivalencias,
    originales: [...originales].map(([unidad, cantidad]) => ({ unidad, cantidad })) };
}

/** Equivalente de una cantidad original de receta, sin escribir sobre ella. */
export function gramosDeFormula(cantidad, unidad, resumen) {
  const factor = factorGramos(unidad) ?? resumen.equivalencias.find((e) => e.unidad === unidadCanonica(unidad))?.factor;
  if (factor === null || factor === undefined) return null;
  const gramos = cantidad * factor;
  return Number.isFinite(gramos) ? gramos : null;
}
