/**
 * =============================================================================
 *  INDICADORES DE BODEGA
 * =============================================================================
 *
 *  Cuanto dinero hay en bodega, cuanto entro y salio, para cuantos dias alcanza
 *  cada ingrediente y que se va a vencer.
 *
 *  EL VALOR EN EL TIEMPO SE RECONSTRUYE. No hay fotos guardadas del inventario:
 *  el valor al cierre de cada dia, semana o mes se obtiene reproduciendo los
 *  movimientos en orden (cada uno deja el saldo del lote y lo que vale). Un
 *  lote sin precio vale cero, como en la pantalla de bodega.
 *
 *  LA COBERTURA SE MIDE EN GRAMOS. Existencia no vencida en gramos ÷ consumo
 *  diario promedio de los ultimos 28 dias. Un lote sin equivalencia en gramos
 *  no se puede sumar y se avisa aparte («sin equivalencia»); no se le inventa
 *  un peso. Solo se miden los ingredientes que se consumen.
 */

import { claveDe } from '../almacen.js';
import { sumarDias } from '../bitacora.js';
import { toleranciaDe } from './metas.js';
import {
  cubetas, indiceDeCubetas, crearIndicador, enRango, sumarCampo, dividir, diasEntre, estadoContraMeta, plural, vaciarIndicadores,
  coberturaBajaResumen,
} from './periodos.js';

export const DIAS_CONSUMO_COBERTURA = 28;

const claveIngrediente = (nombre) => claveDe(nombre, '');
const valorDeLote = (l) => (l.valorUnitario === null ? 0 : l.valorUnitario * (Number(l.existencia) || 0));

/** Valor actual de la bodega: existencia × precio de compra de cada lote. */
export const valorActual = (hechos) => hechos.lotes.reduce((s, l) => s + valorDeLote(l), 0);

/** Dias que faltan para una fecha (negativo si ya paso). */
export const diasHasta = (hoy, fecha) => diasEntre(hoy, fecha) - 1;

/**
 * Valor de la bodega al cierre de cada fecha pedida (ascendentes), reproduciendo
 * los movimientos. Si dos movimientos del mismo lote llegan fuera de orden por
 * su fecha declarada, gana el mas reciente en instante.
 */
export function valoresAlCierre(movimientos, fechas) {
  const porLote = new Map();
  let total = 0;
  let i = 0;
  return fechas.map((fecha) => {
    while (i < movimientos.length && movimientos[i].fecha <= fecha) {
      const m = movimientos[i++];
      const previo = porLote.get(m.loteId);
      if (previo && previo.instante > m.instante) continue;
      total += m.valorSaldo - (previo?.valor || 0);
      porLote.set(m.loteId, { valor: m.valorSaldo, instante: m.instante });
    }
    // Evita arrastrar -0,0000001 por la resta de flotantes.
    return Math.abs(total) < 1e-6 ? 0 : total;
  });
}

/**
 * Cobertura por ingrediente consumido en los ultimos 28 dias.
 *
 * @returns {Array<{ingrediente: string, existenciaGr: number, consumoDiarioGr: number, dias: number|null,
 *   proximoVencimiento: string|null, estado: string}>}
 */
export function coberturaDe(hechos, metas) {
  const desde = sumarDias(hechos.hoy, -(DIAS_CONSUMO_COBERTURA - 1));
  const consumo = new Map();
  for (const c of hechos.consumoGramos) {
    if (c.fecha < desde || c.fecha > hechos.hoy) continue;
    const k = claveIngrediente(c.ingrediente);
    const fila = consumo.get(k) || { ingrediente: c.ingrediente, gramos: 0 };
    fila.gramos += c.gramos;
    consumo.set(k, fila);
  }
  const existencias = new Map();
  for (const l of hechos.lotes) {
    // Lo vencido no se puede usar y lo comprado para una fecha futura aun no esta.
    if (!(l.existencia > 0) || l.estado === 'vencido' || (l.fechaCompra && l.fechaCompra > hechos.hoy)) continue;
    const k = claveIngrediente(l.ingrediente);
    const e = existencias.get(k) || { gramos: 0, vence: null };
    if (l.gramosPorUnidad !== null) e.gramos += l.existencia * l.gramosPorUnidad;
    if (l.vencimiento && (!e.vence || l.vencimiento < e.vence)) e.vence = l.vencimiento;
    existencias.set(k, e);
  }
  const tolerancia = toleranciaDe('coberturaMinima');
  return [...consumo].map(([k, c]) => {
    const e = existencias.get(k) || { gramos: 0, vence: null };
    const consumoDiarioGr = c.gramos / DIAS_CONSUMO_COBERTURA;
    const dias = dividir(e.gramos, consumoDiarioGr);
    return { ingrediente: c.ingrediente, existenciaGr: e.gramos, consumoDiarioGr, dias, proximoVencimiento: e.vence,
      estado: estadoContraMeta(dias, metas.coberturaMinima, 'subir', tolerancia) };
  }).sort((a, b) => (a.dias === null) - (b.dias === null) || (a.dias ?? 0) - (b.dias ?? 0)
    || a.ingrediente.localeCompare(b.ingrediente, 'es'));
}

/** Ingredientes cuya cobertura esta por debajo de la meta. */
export const coberturaBaja = (cobertura, metas) => cobertura.filter((c) => c.dias !== null
  && Number.isFinite(metas.coberturaMinima) && c.dias < metas.coberturaMinima);

/** Lotes con existencia vencidos o que vencen dentro del aviso. */
export function vencimientosDe(hechos, metas) {
  return hechos.lotes.filter((l) => l.existencia > 0 && l.vencimiento)
    .map((l) => ({ loteId: l.id, ingrediente: l.ingrediente, vencimiento: l.vencimiento, dias: diasHasta(hechos.hoy, l.vencimiento),
      existencia: l.existencia, unidad: l.unidad, valor: valorDeLote(l) }))
    .filter((v) => v.dias <= metas.avisoVencimiento)
    .sort((a, b) => a.dias - b.dias || a.ingrediente.localeCompare(b.ingrediente, 'es'));
}

/** Perdidas valorizadas: bajas de lotes con existencia y ajustes que la bajan. */
const esPerdida = (m) => (m.tipo === 'baja' || m.tipo === 'ajuste') && m.cantidad < 0;

export function seccionBodega(hechos, { rango, metas }) {
  const lista = cubetas(rango.desde, rango.hasta, rango.grano);
  const cierres = valoresAlCierre(hechos.movimientos, [rango.anterior.hasta, ...lista.map((c) => c.hasta)]);
  const valorAnterior = cierres[0];
  const valorSerie = cierres.slice(1);
  const valor = { id: 'valor_bodega', nombre: 'Valor de la bodega', formato: 'pesos', dinero: true, grano: rango.grano,
    series: [{ id: 'valor', nombre: 'Valor', tono: 'total' }],
    puntos: lista.map((c, i) => ({ desde: c.desde, hasta: c.hasta, valores: { valor: valorSerie[i] } })), meta: null };

  const compras = (r) => hechos.movimientos.filter((m) => m.tipo === 'compra' && enRango(m.fecha, r));
  const consumo = (r) => hechos.consumoGramos.filter((c) => enRango(c.fecha, r));
  const perdidas = (r) => hechos.movimientos.filter((m) => esPerdida(m) && enRango(m.fecha, r));
  const comprasActual = compras(rango);
  const consumoActual = sumarCampo(consumo(rango), 'costo');
  const consumoPrevio = sumarCampo(consumo(rango.anterior), 'costo');

  const puntosCyC = lista.map((c) => ({ desde: c.desde, hasta: c.hasta, valores: { compras: 0, consumo: 0 } }));
  const cubetaDeFecha = indiceDeCubetas(lista);
  for (const m of comprasActual) {
    const i = cubetaDeFecha(m.fecha);
    if (i >= 0) puntosCyC[i].valores.compras += m.costoCompra;
  }
  for (const c of consumo(rango)) {
    const i = cubetaDeFecha(c.fecha);
    if (i >= 0) puntosCyC[i].valores.consumo += c.costo;
  }
  const comprasVsConsumo = { id: 'compras_consumo', nombre: 'Compras y consumo', formato: 'pesos', dinero: true, grano: rango.grano,
    series: [{ id: 'compras', nombre: 'Compras', tono: 'uno' }, { id: 'consumo', nombre: 'Consumo', tono: 'total' }],
    puntos: puntosCyC, meta: null };

  const actual = valorActual(hechos);
  const promedioValor = valorSerie.length ? sumarCampo(valorSerie) / valorSerie.length : null;
  const rotacion = dividir(consumoActual, promedioValor);
  const consumoDiario = dividir(consumoActual, rango.dias);
  const cobertura = coberturaDe(hechos, metas);
  const bajas = coberturaBaja(cobertura, metas);
  const vencimientos = vencimientosDe(hechos, metas);
  const porVencer = vencimientos.filter((v) => v.dias >= 0);
  const valorPerdidas = (r) => perdidas(r).reduce((s, m) => s + (m.valor === null ? 0 : -m.valor), 0);

  const indicadores = [
    crearIndicador({ id: 'valor_bodega', nombre: 'Valor en bodega', valor: actual, anterior: valorAnterior, formato: 'pesos', dinero: true,
      base: `${plural(hechos.lotes.filter((l) => l.existencia > 0).length, 'lote con existencia', 'lotes con existencia')}`,
      definicion: 'Existencia de cada lote × su precio de compra por unidad. Los lotes sin precio no suman. Se compara con el valor al cierre del periodo anterior.',
      chispa: valorSerie }),
    crearIndicador({ id: 'compras', nombre: 'Compras', valor: sumarCampo(comprasActual, 'costoCompra'), anterior: sumarCampo(compras(rango.anterior), 'costoCompra'),
      formato: 'pesos', dinero: true, base: plural(comprasActual.length, 'compra'),
      definicion: 'Suma de lo pagado en las compras registradas en bodega con fecha de compra en el periodo. Los saldos iniciales no son compras.',
      chispa: puntosCyC.map((p) => p.valores.compras) }),
    crearIndicador({ id: 'consumo', nombre: 'Consumo', valor: consumoActual, anterior: consumoPrevio, formato: 'pesos', dinero: true,
      definicion: 'Costo de la materia prima que salió de bodega al confirmar producción en el periodo, con los precios congelados al confirmar.',
      chispa: puntosCyC.map((p) => p.valores.consumo) }),
    crearIndicador({ id: 'rotacion', nombre: 'Rotación', valor: rotacion === null ? null : Math.round(rotacion * 10) / 10,
      formato: 'numero', sentido: 'subir', base: rotacion === null ? null : 'Veces que se usó lo guardado en el periodo',
      definicion: 'Consumo del periodo ÷ valor promedio de la bodega en el periodo. 2 quiere decir que en el periodo se usó dos veces lo que hay guardado.' }),
    crearIndicador({ id: 'dias_inventario', nombre: 'Días de inventario', valor: dividir(actual, consumoDiario), formato: 'dias', dinero: true,
      base: 'Al ritmo de consumo del periodo',
      definicion: 'Valor actual de la bodega ÷ consumo diario promedio del periodo: para cuántos días alcanza lo guardado, en dinero.' }),
    crearIndicador({ id: 'perdidas', nombre: 'Pérdidas de bodega', valor: valorPerdidas(rango), anterior: valorPerdidas(rango.anterior),
      formato: 'pesos', sentido: 'bajar', dinero: true, base: plural(perdidas(rango).length, 'baja o ajuste', 'bajas o ajustes'),
      definicion: 'Valor de lo que salió de bodega sin ir a producción: lotes dados de baja con existencia y ajustes que bajaron la existencia.' }),
    crearIndicador({ id: 'por_vencer', nombre: 'Valor por vencer', valor: sumarCampo(porVencer, 'valor'), formato: 'pesos', sentido: 'bajar', dinero: true,
      base: `${plural(porVencer.length, 'lote')} en los próximos ${plural(metas.avisoVencimiento, 'día', 'días')}`,
      definicion: 'Valor de los lotes con existencia que vencen desde hoy hasta el aviso de vencimiento de las metas.' }),
    crearIndicador({ id: 'cobertura_baja', nombre: 'Ingredientes por acabarse', formato: 'numero', sentido: 'bajar',
      ...coberturaBajaResumen(bajas.length, cobertura.length, metas.coberturaMinima),
      definicion: 'Ingredientes cuya existencia no vencida alcanza para menos días que la cobertura mínima de las metas, según el consumo diario promedio de los últimos 28 días.' }),
  ];

  const proveedoresMapa = new Map();
  for (const m of comprasActual) {
    const nombre = m.proveedor.trim() || 'Sin proveedor';
    const p = proveedoresMapa.get(nombre) || { nombre, valor: 0, compras: 0 };
    p.valor += m.costoCompra;
    p.compras += 1;
    proveedoresMapa.set(nombre, p);
  }
  const proveedores = [...proveedoresMapa.values()].sort((a, b) => b.valor - a.valor || a.nombre.localeCompare(b.nombre, 'es'))
    .map((p) => ({ id: p.nombre, nombre: p.nombre, valor: p.valor, formato: 'pesos', detalle: plural(p.compras, 'compra'), dinero: true }));

  const sinHistoria = !hechos.lotes.length && !hechos.movimientos.length;
  return {
    indicadores: sinHistoria ? vaciarIndicadores(indicadores) : indicadores,
    valor, comprasVsConsumo, proveedores, canasta: canastaDe(hechos, rango), cobertura, vencimientos,
  };
}

/**
 * Indice de precios de la canasta consumida: cuanto subio, ponderado por lo que
 * se gasto en cada ingrediente, el precio por gramo entre el inicio y el fin
 * del periodo.
 */
export function canastaDe(hechos, rango) {
  const peso = new Map();
  for (const c of hechos.consumoGramos) {
    if (!enRango(c.fecha, rango)) continue;
    const k = claveIngrediente(c.ingrediente);
    const p = peso.get(k) || { ingrediente: c.ingrediente, costo: 0 };
    p.costo += c.costo;
    peso.set(k, p);
  }
  const comprasPorIngrediente = new Map();
  for (const m of hechos.movimientos) {
    if (m.tipo !== 'compra' || m.precioPorGramo === null || m.fecha > rango.hasta) continue;
    const k = claveIngrediente(m.ingrediente);
    if (!comprasPorIngrediente.has(k)) comprasPorIngrediente.set(k, []);
    comprasPorIngrediente.get(k).push(m);
  }
  let pesoTotal = 0;
  let ponderado = 0;
  const alzas = [];
  let comparados = 0;
  const consumidos = [...peso.values()].filter((p) => p.costo > 0).length;
  for (const [k, p] of peso) {
    if (!(p.costo > 0)) continue;
    const compras = comprasPorIngrediente.get(k) || [];
    const previas = compras.filter((m) => m.fecha <= rango.desde);
    const inicio = previas.length ? previas.at(-1) : compras.find((m) => m.fecha >= rango.desde);
    const fin = compras.at(-1);
    if (!inicio || !fin || !(inicio.precioPorGramo > 0)) continue;
    const cambio = fin.precioPorGramo / inicio.precioPorGramo - 1;
    comparados += 1;
    pesoTotal += p.costo;
    ponderado += p.costo * cambio;
    if (cambio > 0) alzas.push({ ingrediente: p.ingrediente, antes: inicio.precioPorGramo, despues: fin.precioPorGramo, variacion: cambio });
  }
  alzas.sort((a, b) => b.variacion - a.variacion || a.ingrediente.localeCompare(b.ingrediente, 'es'));
  return { indice: pesoTotal > 0 ? (ponderado / pesoTotal) * 100 : null, comparados, consumidos, alzas: alzas.slice(0, 8) };
}
