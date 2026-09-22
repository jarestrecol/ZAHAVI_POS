import { splitYield } from '../lib/format.js';
import { ordenesPorArea } from './ordenes.js';
import { copiar, registrarEvento, personaValida, alMenos, resultadoValido } from './bitacora.js';
import { ok, err } from './storage.js';

export const UNIDADES_RESULTADO = ['UND', 'PORC', 'PAQ', 'CAJA', 'GR', 'KG', 'ML', 'LT'];
const numero = (v) => typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim().replace(',', '.')) : NaN;
const opcional = (v) => v === '' || v === null || v === undefined ? null : numero(v);
const positivo = (v) => Number.isFinite(v) && v > 0 && v <= 1e12;
const noNegativo = (v) => Number.isFinite(v) && v >= 0 && v <= 1e12;

/** Solo rendimientos inequívocos del nombre congelado. Nunca se escribe la receta. */
export function rendimientoPrevisto(entrada) {
  const { cantidad, unidad } = splitYield(entrada.recipe.nombre);
  const aliases = { UND: 'UND', UNDS: 'UND', UNIDADES: 'UND', UDS: 'UND', PORC: 'PORC', PORCIONES: 'PORC',
    PAQ: 'PAQ', PAQUETES: 'PAQ', CAJA: 'CAJA', CAJAS: 'CAJA' };
  const medida = aliases[unidad.toUpperCase().replace(/\.$/, '')];
  const valor = numero(cantidad);
  // «32 UND O 8 PAQ» necesita que la persona elija su medida de salida.
  return medida && positivo(valor) && positivo(valor * entrada.factor)
    ? { cantidad: valor * entrada.factor, unidad: medida } : { cantidad: null, unidad: null };
}

export function resultadoDe(datos, produccionId, recetaId) {
  return (datos.resultados || []).find((r) => r.produccionId === produccionId && r.recetaId === recetaId) || null;
}

/** El autor de la confirmación registra su primera medición; el jefe corrige. */
export function puedeRegistrarResultado(autor, ejecucion, anterior = null) {
  return personaValida(autor) && (alMenos(autor, 'obrador') || (!anterior && ejecucion.autor?.id === autor.id));
}

/** Costos leídos de la confirmación: cambios de precios posteriores no intervienen. */
export function costoDeResultado(ejecucion, recetaId) {
  if (ejecucion.entradas.length === 1 && ejecucion.entradas[0].recipe.id === recetaId) return ejecucion.costeo.costoTotal;
  return ordenesPorArea(ejecucion.entradas, [], ejecucion.fecha, ejecucion.costeo)
    .flatMap((g) => g.entradas).find((e) => e.recipe.id === recetaId)?.costo ?? null;
}

export function indicadoresResultado(ejecucion, resultado) {
  const costo = costoDeResultado(ejecucion, resultado.recetaId);
  const obtenido = resultado.vendible + resultado.rechazado;
  const costoPrevisto = resultado.esperado > 0 ? costo / resultado.esperado : null;
  const costoReal = resultado.vendible > 0 ? costo / resultado.vendible : null;
  return { costo, obtenido, costoPrevisto, costoReal,
    diferencia: resultado.esperado === null ? null : obtenido - resultado.esperado,
    cumplimiento: resultado.esperado > 0 ? resultado.vendible / resultado.esperado * 100 : null,
    rechazoPorcentaje: obtenido > 0 ? resultado.rechazado / obtenido * 100 : null,
    variacionCosto: costoPrevisto > 0 && costoReal !== null ? (costoReal / costoPrevisto - 1) * 100 : null };
}

/** Una medición por receta y confirmación. La transacción la ejecuta la app. */
export function guardarResultadoEn(datos, solicitud, autor) {
  if (!personaValida(autor)) return err('autor', 'Vuelve a entrar para registrar quién midió el resultado.');
  const ejecucion = datos.ejecuciones.find((e) => e.id === solicitud.produccionId);
  const entrada = ejecucion?.entradas.find((e) => e.recipe.id === solicitud.recetaId);
  if (!entrada) return err('produccion', 'Primero confirma la producción de esta receta.');
  const anterior = resultadoDe(datos, ejecucion.id, entrada.recipe.id);
  if (!puedeRegistrarResultado(autor, ejecucion, anterior)) return err('permiso', 'Solo el jefe de obrador puede corregir resultados o registrar los de otra persona.');
  if (solicitud.revision !== (anterior?.revision || 0)) return err('conflicto', 'El resultado cambió en otra pestaña. Vuelve a abrir la receta antes de guardar.');
  const previsto = rendimientoPrevisto(entrada);
  const unidad = previsto.unidad || String(solicitud.unidad || '').trim().toUpperCase();
  const esperado = previsto.cantidad ?? opcional(solicitud.esperado);
  const vendible = numero(solicitud.vendible), rechazado = numero(solicitud.rechazado);
  const mermaPreparacionGr = opcional(solicitud.mermaPreparacionGr), mermaCoccionGr = opcional(solicitud.mermaCoccionGr);
  if (!UNIDADES_RESULTADO.includes(unidad)) return err('unidad', 'Elige la medida del producto terminado.');
  if (esperado !== null && !positivo(esperado)) return err('esperado', 'La cantidad esperada debe ser mayor que cero, o quedar vacía si se desconoce.');
  if (![vendible, rechazado].every(noNegativo) || !noNegativo(vendible + rechazado)) return err('cantidad', 'Indica las cantidades vendibles y rechazadas, desde cero hasta un billón.');
  if (![mermaPreparacionGr, mermaCoccionGr].every((n) => n === null || noNegativo(n))) return err('merma', 'Las pérdidas en gramos deben ser números desde cero; déjalas vacías si no se midieron.');
  const motivo = String(solicitud.motivo || '').trim();
  if (motivo.length > 500) return err('motivo', 'El motivo admite hasta 500 caracteres.');
  const diferencia = esperado !== null && Math.abs(vendible + rechazado - esperado) > 1e-8 * Math.max(1, esperado);
  if (!motivo && (anterior || rechazado > 0 || vendible === 0 || mermaPreparacionGr > 0 || mermaCoccionGr > 0 || diferencia)) {
    return err('motivo', 'Explica la pérdida, diferencia de rendimiento o corrección antes de guardar.');
  }
  const resultado = { produccionId: ejecucion.id, recetaId: entrada.recipe.id, revision: (anterior?.revision || 0) + 1,
    unidad, esperado, vendible, rechazado, mermaPreparacionGr, mermaCoccionGr,
    motivo: motivo || 'Resultado medido', actualizado: new Date().toISOString(),
    autor: { id: autor.id, nombre: autor.nombre, codigo: autor.codigo } };
  if (!resultadoValido(resultado)) return err('resultado', 'Revisa las medidas del resultado.');
  if (!Object.values(indicadoresResultado(ejecucion, resultado)).every((n) => n === null || Number.isFinite(n))) {
    return err('cantidad', 'Estas cantidades son demasiado pequeñas para calcular un costo válido. Revisa la medida de salida.');
  }
  datos.resultados = [...(datos.resultados || []).filter((r) => !(r.produccionId === ejecucion.id && r.recetaId === entrada.recipe.id)), resultado];
  registrarEvento(datos, 'resultado_guardado', { fecha: ejecucion.fecha, produccionId: ejecucion.id,
    recetaId: entrada.recipe.id, responsable: autor.nombre, motivo: resultado.motivo, antes: anterior, despues: resultado });
  return ok(copiar(resultado));
}
