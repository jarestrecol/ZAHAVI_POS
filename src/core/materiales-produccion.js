/** Proyección de lectura. Conserva fórmulas y trazas originales en el costeo. */
import { consolidar } from './plan.js';
import { costearPlan } from './costeo.js';
import { claveDe } from './almacen.js';

export function agruparGramos(lineas) {
  const grupos = new Map();
  for (const l of lineas) {
    // Los históricos anteriores a la conversión conservan su unidad congelada.
    const clave = claveDe(l.ingrediente, l.unidad);
    let g = grupos.get(clave);
    if (!g) {
      g = { ...l, cantidad: 0, consumo: 0, faltante: 0, costo: 0, disponible: l.disponible,
        origen: [], fuentes: [], unidadReceta: null, motivo: l.servicio ? l.motivo : '', estado: 'ok' };
      grupos.set(clave, g);
    }
    g.fuentes.push(l);
    g.cantidad = g.cantidad === null || l.cantidad === null ? null : g.cantidad + l.cantidad;
    g.faltante = g.faltante === null || l.faltante === null ? null : g.faltante + l.faltante;
    g.consumo += l.consumo || 0;
    g.costo += l.costo || 0;
    g.origen.push(...(l.origen || []));
    if (l.estado === 'sin_conversion' || (g.estado !== 'sin_conversion' && l.estado !== 'ok')) g.estado = l.estado;
    if (l.motivo && !g.motivo.includes(l.motivo)) g.motivo += `${g.motivo ? ' ' : ''}${l.motivo}`;
  }
  return [...grupos.values()].map((g) => ({ ...g, precioMedio: g.consumo ? g.costo / g.consumo : null }));
}

export function materialesEnGramos(entradas, lotes, fecha) {
  const original = consolidar(entradas);
  const costeo = costearPlan(original.lineas, lotes, fecha);
  const lineas = agruparGramos(costeo.lineas);
  return { ...original, lineas, totalLineas: lineas.length,
    conflictos: lineas.filter((l) => l.cantidad === null).length };
}
