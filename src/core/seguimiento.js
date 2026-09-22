import { claveDe, valorUnitario, estadoVencimiento } from './almacen.js';
import { hoyLocal } from './bitacora.js';

export const enPeriodo = (fecha, periodo) => fecha >= periodo.desde && fecha <= periodo.hasta;
export const fechaEvento = (e) => hoyLocal(new Date(e.instante));
export const esMovimiento = (e) => ['apertura', 'ejemplo', 'compra', 'ajuste', 'baja', 'consumo'].includes(e.tipo);

export function seguimientoProductos(datos, periodo) {
  const mapa = new Map();
  const movimientos = datos.eventos.filter(esMovimiento);
  const asegurar = (l) => {
    const clave = claveDe(l.ingrediente, l.unidad);
    if (!mapa.has(clave)) mapa.set(clave, { clave, ingrediente: l.ingrediente, unidad: l.unidad,
      compras: [], movimientos: [], consumido: 0, diasConsumo: new Set(), disponible: 0, saldoCierre: 0, inicio: null });
    return mapa.get(clave);
  };
  for (const l of datos.lotes) {
    const p = asegurar(l);
    if (estadoVencimiento(l, hoyLocal()) !== 'vencido') p.disponible += l.existencia;
  }
  const saldos = new Map();
  for (const e of movimientos) {
    const lote = e.despues || e.antes;
    const p = asegurar(lote);
    const fecha = fechaEvento(e);
    if (!p.inicio || fecha < p.inicio) p.inicio = fecha;
    if (fecha <= periodo.hasta) saldos.set(lote.id, e.despues);
    if (!enPeriodo(fecha, periodo)) continue;
    p.movimientos.push(e);
    if (e.tipo === 'compra') p.compras.push(e);
    if (e.tipo === 'consumo') {
      p.consumido += e.antes.existencia - e.despues.existencia;
      p.diasConsumo.add(fecha);
    }
  }
  for (const lote of saldos.values()) if (lote) asegurar(lote).saldoCierre += lote.existencia;
  const finObservado = periodo.hasta < hoyLocal() ? periodo.hasta : hoyLocal();
  return [...mapa.values()].map((p) => {
    const inicioObservado = p.inicio && p.inicio > periodo.desde ? p.inicio : periodo.desde;
    const dias = Math.max(1, Math.round((Date.parse(finObservado) - Date.parse(inicioObservado)) / 86400000) + 1);
    const fechas = [...new Set(p.compras.map((e) => e.despues.fechaCompra || fechaEvento(e)))].sort();
    const intervalo = fechas.length > 1 ? (Date.parse(fechas.at(-1)) - Date.parse(fechas[0])) / 86400000 / (fechas.length - 1) : null;
    return { ...p, diasObservados: dias, saldoCierre: !p.inicio || p.inicio > periodo.hasta ? null : p.saldoCierre,
      diasConsumo: p.diasConsumo.size, intervalo, cobertura: p.consumido > 0 ? p.disponible / (p.consumido / dias) : null,
      gasto: p.compras.reduce((s, e) => s + e.despues.costoCompra, 0) };
  }).sort((a, b) => a.ingrediente.localeCompare(b.ingrediente, 'es'));
}

export function cambioPrecio(e) {
  const antes = e.antes ? valorUnitario(e.antes) : null;
  const despues = e.despues ? valorUnitario(e.despues) : null;
  return { antes, despues };
}
