/** Costeo FEFO en gramos. Los tramos conservan la cantidad y unidad de compra.
 * Lectura pura: solo la aprobación aplica bajas y congela estas equivalencias. */
import { claveDe, estadoVencimiento, lotesOrdenadosFEFO, valorUnitario } from './almacen.js';
import { factorGramos, esAguaDeProceso } from './conversiones.js';

export function costearPlan(lineasDelPlan, lotes, hoy) {
  const fechaUso = typeof hoy === 'string' ? hoy : null;
  const vigentes = lotesOrdenadosFEFO(lotes).filter((l) => !fechaUso || !l.fechaCompra || l.fechaCompra <= fechaUso);
  const lotesVencidosIgnorados = vigentes.filter((l) => l.existencia > 0 && estadoVencimiento(l, hoy) === 'vencido').length;
  const utilizables = vigentes.filter((l) => estadoVencimiento(l, hoy) !== 'vencido');
  const despensa = utilizables.map((lote) => ({ lote, queda: Math.max(0, Number(lote.existencia) || 0) }));
  const lineas = [];
  for (const linea of lineasDelPlan || []) {
    const unidadReceta = String(linea.unidad || '').trim().toUpperCase();
    const cantidadReceta = Number(String(linea.cantidad ?? 0).replace(',', '.'));
    if (esAguaDeProceso(linea.ingrediente)) {
      const factorReceta = factorGramos(unidadReceta, { ML: 1 });
      const cantidad = factorReceta === null ? null : cantidadReceta * factorReceta;
      if (cantidad !== null && Number.isFinite(cantidad) && cantidad >= 0) {
        lineas.push({ ingrediente: linea.ingrediente, unidad: 'GR', unidadReceta, cantidadReceta, factorReceta,
          cantidad, disponible: cantidad, consumo: cantidad, faltante: 0, costo: 0, precioMedio: 0,
          estado: 'ok', origen: [], servicio: true, motivo: 'Agua de proceso: 1 ml ≈ 1 g. Sin compra ni descuento de bodega; costo de materia prima $0.' });
        continue;
      }
    }
    const propios = despensa.filter((r) => claveDe(r.lote.ingrediente, '') === claveDe(linea.ingrediente, ''));
    const fijo = factorGramos(unidadReceta);
    // La fórmula necesita un peso inequívoco; no elegir una densidad al azar.
    const conExistencia = propios.filter((r) => r.lote.existencia > 0);
    const referencias = conExistencia.length ? conExistencia : propios;
    const factores = [...new Set(referencias.map((r) => factorGramos(unidadReceta, r.lote.equivalencias)).filter((f) => f !== null))];
    const factorReceta = fijo ?? (factores.length === 1 ? factores[0] : null);
    const cantidad = factorReceta === null ? null : cantidadReceta * factorReceta;
    const disponibles = propios.filter((r) => r.queda > 0);
    const sinFactorCompra = disponibles.some((r) => factorGramos(r.lote.unidad, r.lote.equivalencias) === null);
    if (factorReceta === null || sinFactorCompra || !Number.isFinite(cantidad) || cantidad < 0) {
      lineas.push({ ingrediente: linea.ingrediente, unidad: 'GR', unidadReceta, cantidadReceta,
        factorReceta, cantidad: Number.isFinite(cantidad) ? cantidad : null, disponible: 0, consumo: 0, faltante: Number.isFinite(cantidad) ? cantidad : null,
        costo: 0, precioMedio: null, estado: 'sin_conversion', origen: [],
        motivo: factores.length > 1 && fijo === null
          ? 'Hay equivalencias diferentes para ' + unidadReceta + '. Revisa los lotes del ingrediente en Bodega.'
          : 'Falta una equivalencia válida en gramos. Edita el ingrediente en Bodega.' });
      continue;
    }
    let disponible = 0;
    for (const r of disponibles) disponible += r.queda * factorGramos(r.lote.unidad, r.lote.equivalencias);
    if (!Number.isFinite(disponible)) {
      lineas.push({ ingrediente: linea.ingrediente, unidad: 'GR', unidadReceta, cantidadReceta,
        factorReceta, cantidad, disponible: 0, consumo: 0, faltante: cantidad, costo: 0,
        precioMedio: null, estado: 'sin_conversion', origen: [], motivo: 'Revisa las cantidades y equivalencias: exceden el límite de cálculo.' });
      continue;
    }
    let porCubrir = cantidad, costo = 0;
    const origen = [];
    for (const resto of disponibles) {
      if (porCubrir <= 0) break;
      const gramosPorUnidad = factorGramos(resto.lote.unidad, resto.lote.equivalencias);
      const gramos = Math.min(resto.queda * gramosPorUnidad, porCubrir);
      const sale = Math.min(resto.queda, gramos / gramosPorUnidad);
      const unitario = valorUnitario(resto.lote);
      const previo = costo;
      costo += unitario === null ? 0 : unitario * sale;
      resto.queda -= sale;
      porCubrir -= gramos;
      origen.push({ loteId: resto.lote.id, lote: resto.lote.lote, marca: resto.lote.marca,
        proveedor: resto.lote.proveedor || '', unidad: resto.lote.unidad, cantidad: sale,
        cantidadGramos: gramos, gramosPorUnidad, precioPorGramo: unitario === null ? null : unitario / gramosPorUnidad,
        precioUnitario: unitario, costo: Math.round(costo) - Math.round(previo),
        vencimiento: resto.lote.vencimiento, sinPrecio: unitario === null });
    }
    // Tolerancia binaria; no perdonar miligramos por redondear el faltante.
    const faltante = porCubrir <= Number.EPSILON * Math.max(1, cantidad) * 16 ? 0 : porCubrir;
    const consumo = cantidad - porCubrir;
    const sinPrecio = origen.some((o) => o.sinPrecio);
    const estado = sinPrecio || !propios.length ? 'sin_precio'
      : consumo <= 0 && cantidad > 0 ? 'sin_existencia' : faltante > 0 ? 'parcial' : 'ok';
    lineas.push({ ingrediente: linea.ingrediente, unidad: 'GR', unidadReceta, cantidadReceta,
      factorReceta, cantidad, disponible, consumo, faltante,
      costo: Math.round(costo), precioMedio: consumo > 0 ? costo / consumo : null, estado, origen });
  }
  return { lineas, costoTotal: lineas.reduce((s, l) => s + l.costo, 0),
    lineasSinPrecio: lineas.filter((l) => ['sin_precio', 'sin_conversion'].includes(l.estado)).length,
    lineasSinConversion: lineas.filter((l) => l.estado === 'sin_conversion').length,
    lineasConFaltante: lineas.filter((l) => l.faltante > 0 || l.estado === 'sin_conversion').length,
    cubiertoTotal: lineas.length ? lineas.reduce((s, l) => s + (l.cantidad > 0 ? l.consumo / l.cantidad : 0), 0) / lineas.length : 0,
    lotesVencidosIgnorados };
}

/** Bajas en la unidad original del lote, también para históricos anteriores. */
export function bajasDelCosteo(costeo) {
  const bajas = new Map();
  for (const linea of costeo?.lineas || []) {
    for (const tramo of linea.origen || []) bajas.set(tramo.loteId, (bajas.get(tramo.loteId) || 0) + tramo.cantidad);
  }
  return bajas;
}
