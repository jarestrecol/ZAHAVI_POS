import { getState, setState, notify } from '../core/store.js';
import { leerAlmacen, validarLote, siguienteId, lotesDemo, valorUnitario, claveDe } from '../core/almacen.js';
import { copiar, registrarEvento, transaccionOperacion, hoyLocal, alMenos } from '../core/bitacora.js';
import { prepararLotesDemo, esLoteDemo } from '../core/precios-demo.js';
import { ok, err } from '../core/storage.js';

export function cargarAlmacen() {
  const leido = leerAlmacen();
  setState({ almacen: { lotes: leido.lotes } });
  if (leido.warning) notify(leido.warning, 'info');
  return leido;
}

export async function guardarLote(lote, contexto = {}) {
  const revisado = validarLote(lote);
  if (!revisado.ok) return revisado;
  if (revisado.value.fechaCompra > hoyLocal()) return err('compra_futura', 'Registra la compra cuando se reciba; una compra futura aún no es existencia disponible.');
  return ejecutar((datos) => {
    const limpio = revisado.value;
    const anterior = datos.lotes.find((l) => l.id === limpio.id);
    if (limpio.id && (!anterior || JSON.stringify(anterior) !== JSON.stringify(contexto.antes))) {
      return err('conflicto', 'Este lote cambió. Vuelve a abrir el formulario con las existencias actuales.');
    }
    if (!contexto.responsable?.trim() || (anterior && !contexto.motivo?.trim())) {
      return err('traza', 'Indica el responsable y, al corregir un lote, el motivo del cambio.');
    }
    if (anterior && claveDe(anterior.ingrediente, anterior.unidad) !== claveDe(limpio.ingrediente, limpio.unidad)) {
      return err('identidad', 'El ingrediente y la unidad identifican el historial. Registra otro lote para un producto distinto.');
    }
    if (!limpio.id) limpio.id = siguienteId([...datos.lotes, ...datos.eventos.flatMap((e) => e.despues?.id ? [e.despues] : [])]);
    limpio.registrado = anterior?.registrado || new Date().toISOString();
    const ultimo = anterior || [...datos.eventos].reverse().find((e) => ['compra', 'ajuste'].includes(e.tipo)
      && e.despues && claveDe(e.despues.ingrediente, e.despues.unidad) === claveDe(limpio.ingrediente, limpio.unidad))?.despues;
    const alertas = [];
    if (ultimo) {
      const precio = valorUnitario(limpio), previo = valorUnitario(ultimo);
      if (precio !== previo) alertas.push(`Precio por ${limpio.unidad}: ${previo} → ${precio}${previo > 0 ? ` (${((precio / previo - 1) * 100).toFixed(1)}%)` : ''}.`);
      if (limpio.proveedor !== ultimo.proveedor) alertas.push(`Proveedor: ${ultimo.proveedor || 'sin registrar'} → ${limpio.proveedor || 'sin registrar'}.`);
    }
    datos.lotes = [...datos.lotes.filter((l) => l.id !== limpio.id), limpio];
    registrarEvento(datos, anterior ? 'ajuste' : 'compra', { responsable: contexto.responsable.trim(),
      motivo: contexto.motivo?.trim() || 'Recepción de compra', antes: anterior || null, despues: limpio, alertas });
    return ok({ ...limpio, alertas });
  }, 'Lote guardado en el historial.');
}

export async function eliminarLote(id, contexto = {}) {
  return ejecutar((datos) => {
    const anterior = datos.lotes.find((l) => l.id === id);
    if (!anterior) return err('no_existe', 'Ese lote ya no está en el almacén.');
    if (JSON.stringify(anterior) !== JSON.stringify(contexto.antes)) return err('conflicto', 'El lote cambió. Actualiza la bodega antes de darlo de baja.');
    if (!contexto.responsable?.trim() || !contexto.motivo?.trim()) return err('traza', 'Indica el responsable y el motivo de la baja.');
    datos.lotes = datos.lotes.filter((l) => l.id !== id);
    registrarEvento(datos, 'baja', { responsable: contexto.responsable.trim(), motivo: contexto.motivo.trim(), antes: anterior, despues: null });
    return ok(id);
  }, 'Lote dado de baja; el historial se conserva.');
}

/**
 * Carga o COMPLETA los lotes de ejemplo.
 *
 * Completar hace falta porque los primeros ejemplos cubrian 16 ingredientes, y
 * una bodega que ya los tiene no podia costear casi nada. Lo que no se hace es
 * mezclarlos con compras reales: con una sola compra, apertura, ajuste o baja
 * en el historial, se rechaza. Los planes y los consumos de prueba no cuentan,
 * porque salen de los mismos ejemplos.
 */
export async function sembrarDemo() {
  const recetas = getState().recetario?.recipes || [];
  return ejecutar((datos) => {
    if (datos.eventos.some((e) => ['apertura', 'compra', 'ajuste', 'baja'].includes(e.tipo))) {
      return err('almacen_con_datos', 'Los ejemplos solo se cargan en una bodega sin compras reales, para no mezclarlos con tu historial.');
    }
    // Un lote escrito a mano que ya esta (mismo codigo y producto) no se repite.
    const presentes = new Set(datos.lotes.map((l) => `${l.id}|${claveDe(l.ingrediente, l.unidad)}`));
    const nuevos = lotesDemo(hoyLocal(), recetas).filter((l) => !presentes.has(`${l.id}|${claveDe(l.ingrediente, l.unidad)}`));
    if (!nuevos.length) return err('sin_cambios', 'La bodega ya tiene todos los lotes de ejemplo.');
    // Codigos nuevos contra TODO lo que existio: un codigo reutilizado haria
    // que el historial de consumos apuntara a otro lote.
    const usados = [...datos.lotes, ...datos.eventos.flatMap((e) => [e.antes, e.despues].filter((l) => l?.id))];
    for (const lote of nuevos) {
      if (usados.some((l) => l.id === lote.id)) lote.id = siguienteId(usados);
      usados.push(lote);
      datos.lotes.push(lote);
      registrarEvento(datos, 'ejemplo', { responsable: 'Demostración', motivo: 'Datos ficticios', antes: null, despues: lote });
    }
    return ok(nuevos.length);
  }, 'Datos de ejemplo cargados.');
}

async function ejecutar(cambio, mensaje) {
  const r = await transaccionOperacion(cambio);
  if (!r.ok) return r;
  setState({ almacen: { lotes: copiar(r.value.datos.lotes), costeo: null } });
  notify(mensaje, 'success');
  return ok(r.value.resultado);
}

/** Demo identificada y reversible: nunca cambia una compra real ni sus factores. */
export async function cargarDemoColombia() {
  const usuario = getState().usuario;
  if (!alMenos(usuario, 'gerencia')) return err('permiso', 'Solo gerencia o administración puede cargar precios demo.');
  const recetas = getState().recetario?.recipes || [];
  if (!recetas.length) return err('sin_recetas', 'Espera a que termine de cargar el recetario.');
  return ejecutar((datos) => {
    // Los ejemplos antiguos solo se reemplazan si no hubo una corrección manual.
    const antiguos = new Set(datos.eventos.filter((e) => e.tipo === 'ejemplo').map((e) => e.despues?.id));
    for (const e of datos.eventos) if (['compra', 'apertura', 'ajuste'].includes(e.tipo)) antiguos.delete(e.despues?.id);
    const reemplazar = datos.lotes.filter((l) => esLoteDemo(l) || antiguos.has(l.id));
    const reales = datos.lotes.filter((l) => !reemplazar.includes(l));
    const vigentes = datos.lotes.filter(esLoteDemo);
    if (vigentes.length) return err('demo_activa', 'La demo colombiana ya está cargada. Retírala antes de volver a prepararla.');
    let nuevos;
    try { nuevos = prepararLotesDemo(recetas, reales, hoyLocal()); }
    catch (e) { return err('equivalencias_demo', e.message); }
    const responsable = usuario.nombre || usuario.codigo;
    const usados = [...datos.lotes, ...datos.eventos.flatMap((e) => [e.antes, e.despues].filter((l) => l?.id))];
    for (const lote of reemplazar) registrarEvento(datos, 'baja', { responsable, motivo: 'Reemplazo de ejemplo anterior por demo Colombia', antes: lote, despues: null });
    datos.lotes = reales;
    for (const lote of nuevos) {
      lote.id = siguienteId(usados); usados.push(lote); datos.lotes.push(lote);
      registrarEvento(datos, 'ejemplo', { responsable, motivo: 'DEMO Colombia: precios públicos y estimaciones, pesos no calibrados salvo equivalencias conservadas', antes: null, despues: lote });
    }
    return ok(nuevos.length);
  }, 'Bodega demo Colombia cargada. Sus lotes están identificados como DEMO.');
}

export async function retirarDemoColombia() {
  const usuario = getState().usuario;
  if (!alMenos(usuario, 'gerencia')) return err('permiso', 'Solo gerencia o administración puede retirar la demo.');
  return ejecutar((datos) => {
    const demo = datos.lotes.filter(esLoteDemo);
    if (!demo.length) return err('sin_demo', 'No hay lotes de esta demo para retirar.');
    for (const lote of demo) registrarEvento(datos, 'baja', { responsable: usuario.nombre || usuario.codigo,
      motivo: 'Retiro de demo Colombia; se conservan compras reales e historial de pruebas', antes: lote, despues: null });
    datos.lotes = datos.lotes.filter((l) => !esLoteDemo(l));
    return ok(demo.length);
  }, 'Lotes demo retirados. Las compras reales y el historial se conservaron.');
}
