import { consolidar } from './plan.js';
import { costearPlan, bajasDelCosteo } from './costeo.js';
import { FACTOR_MIN, FACTOR_MAX, rendimientoBase } from './scale.js';
import { splitYield } from '../lib/format.js';
import { ALL_CATEGORIES, CATEGORIES } from './schema.js';
import { copiar, registrarEvento, fechaValida, hoyLocal, nuevoId } from './bitacora.js';
import { ok, err } from './storage.js';

export function producidoPorReceta(datos, fecha) {
  const cantidades = new Map();
  for (const ejecucion of datos.ejecuciones.filter((e) => e.fecha === fecha)) {
    for (const entrada of ejecucion.entradas) cantidades.set(entrada.recipe.id,
      (cantidades.get(entrada.recipe.id) || 0) + entrada.factor);
  }
  return cantidades;
}

export function pendientesDelPlan(datos, plan, area = ALL_CATEGORIES) {
  const producido = producidoPorReceta(datos, plan.fecha);
  return plan.entradas.map((e) => ({ ...e, factor: Math.round((e.factor - (producido.get(e.recipe.id) || 0)) * 1000) / 1000 }))
    .filter((e) => e.factor > 0 && (area === ALL_CATEGORIES || e.recipe.categoria === area));
}

/**
 * Valida y aplica un plan completo, SIN registrar el evento: quien llama decide
 * cuanto guarda el historial. Ver `guardarPlanEn` y `fijarRecetaEn`.
 */
function aplicarPlan(datos, solicitud, recetas) {
  const { fecha, revision = 0, entradas, responsable, motivo } = solicitud;
  if (!fechaValida(fecha)) return err('fecha', 'Elige una fecha válida para el plan.');
  if (!responsable?.trim() || !motivo?.trim()) return err('traza', 'Indica responsable y motivo para dejar constancia del cambio.');
  const anterior = datos.planes.find((p) => p.fecha === fecha);
  if ((anterior?.revision || 0) !== revision) return err('conflicto', 'Este plan cambió en otra pestaña. Vuelve a cargar el día antes de guardar.');
  if (!Array.isArray(entradas)) return err('entradas', 'El plan no contiene una lista válida.');
  const nuevas = [];
  const ids = new Set();
  for (const entrada of entradas) {
    const recipe = anterior?.entradas.find((e) => e.recipe.id === entrada.id)?.recipe || recetas.find((r) => r.id === entrada.id);
    if (!recipe || ids.has(entrada.id) || !Number.isFinite(entrada.factor) || entrada.factor < FACTOR_MIN || entrada.factor > FACTOR_MAX
      || Math.abs(entrada.factor - Math.round(entrada.factor * 1000) / 1000) > 0.00000001) {
      return err('receta', 'Revisa las recetas y sus tandas: no se permiten recetas repetidas, cantidades fuera de rango ni más de tres decimales.');
    }
    ids.add(entrada.id);
    const producido = producidoPorReceta(datos, fecha).get(entrada.id) || 0;
    const pendiente = Math.round((entrada.factor - producido) * 1000) / 1000;
    if (pendiente > 0 && pendiente < FACTOR_MIN) return err('incremento', `La producción adicional debe ser de al menos ${FACTOR_MIN} tandas.`);
    const partidas = entrada.partidas ?? (pendiente > 0 ? [pendiente] : []);
    if (!Array.isArray(partidas) || partidas.length > 2000 || partidas.some((n) => !Number.isFinite(n) || n < FACTOR_MIN || n > FACTOR_MAX
      || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.000001)
      || Math.abs(partidas.reduce((s, n) => s + n, 0) - Math.max(0, pendiente)) > 0.000001) {
      return err('partidas', 'Revisa las tandas de cada partida; deben sumar la cantidad pendiente de esta receta.');
    }
    nuevas.push({ recipe: copiar(recipe), factor: entrada.factor, partidas: [...partidas] });
  }
  for (const [id, cantidad] of producidoPorReceta(datos, fecha)) {
    if ((nuevas.find((e) => e.recipe.id === id)?.factor || 0) + 0.000001 < cantidad) {
      return err('ya_producido', 'No puedes quitar tandas ya producidas. Puedes añadir producción adicional al mismo día.');
    }
    const adicional = (nuevas.find((e) => e.recipe.id === id)?.factor || 0) - cantidad;
    if (adicional > 0.000001 && adicional < FACTOR_MIN) return err('incremento', `La producción adicional debe ser de al menos ${FACTOR_MIN} tandas.`);
  }
  const plan = { fecha, revision: revision + 1, entradas: nuevas, actualizado: new Date().toISOString(),
    responsable: responsable.trim(), motivo: motivo.trim() };
  const pendiente = consolidar(pendientesDelPlan(datos, plan));
  plan.estimado = costearPlan(pendiente.lineas, datos.lotes, fecha);
  datos.planes = [...datos.planes.filter((p) => p.fecha !== fecha), plan].sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Una receta que sale del plan se lleva su seguimiento: quien la tenia
  // asignada no debe seguir viendola en su lista.
  datos.preparaciones = (datos.preparaciones || [])
    .filter((p) => p.fecha !== fecha || nuevas.some((e) => e.recipe.id === p.recetaId));
  return ok({ plan, anterior: anterior || null });
}

/** Guarda el plan entero y deja en el historial el plan de antes y el de despues. */
export function guardarPlanEn(datos, solicitud, recetas) {
  const r = aplicarPlan(datos, solicitud, recetas);
  if (!r.ok) return r;
  const { plan, anterior } = r.value;
  registrarEvento(datos, 'plan_guardado', { fecha: plan.fecha, responsable: plan.responsable, motivo: plan.motivo,
    antes: anterior, despues: plan });
  return ok(plan);
}

/**
 * Tandas pendientes de un dia, opcionalmente de un area o de una sola receta.
 *
 * Es la misma seleccion que descuenta `aprobarPlanEn`: la pantalla la usa para
 * calcular el costo que enseña y que luego se compara al confirmar.
 */
export function pendientesPara(datos, plan, { area = ALL_CATEGORIES, recetaId = null } = {}) {
  const entradas = pendientesDelPlan(datos, plan, area);
  return recetaId === null ? entradas : entradas.filter((e) => e.recipe.id === recetaId);
}

/** Costo FEFO de lo pendiente, con la bodega actual. `null` si el dia no tiene plan. */
export function costeoPendiente(datos, fecha, seleccion = {}) {
  const plan = datos.planes.find((p) => p.fecha === fecha);
  if (!plan) return null;
  return costearPlan(consolidar(pendientesPara(datos, plan, seleccion)).lineas, datos.lotes, fecha);
}

export function aprobarPlanEn(datos, solicitud) {
  const { fecha, revision, responsable, motivo, costeo: previsto, area = ALL_CATEGORIES, recetaId = null } = solicitud;
  if (area !== ALL_CATEGORIES && !CATEGORIES.includes(area)) return err('area_invalida', 'Elige un área de producción válida. No se descontó inventario.');
  if (!responsable?.trim() || !motivo?.trim()) return err('traza', 'Indica responsable y motivo de la producción.');
  if (!fechaValida(fecha) || fecha > hoyLocal()) return err('futuro', 'Los días futuros se planifican; confirma la producción cuando llegue el día.');
  const plan = datos.planes.find((p) => p.fecha === fecha);
  if (!plan || plan.revision !== revision) return err('conflicto', 'La producción de este día cambió mientras tanto. Ya se volvió a cargar: revisa y confirma de nuevo.');
  if (recetaId !== null && !plan.entradas.some((e) => e.recipe.id === recetaId)) {
    return err('receta_invalida', 'Esa receta no está en la producción del día. No se descontó inventario.');
  }
  const entradas = pendientesPara(datos, plan, { area, recetaId });
  if (!entradas.length && recetaId !== null) return err('ya_producido', 'Esta receta ya está lista. No se descontó nada más.');
  if (!entradas.length) return err('ya_producido', area === ALL_CATEGORIES
    ? 'Este plan ya se produjo. Añade nuevas tandas para registrar una producción adicional.'
    : 'Esta área ya se produjo o no tiene tandas pendientes. Las demás áreas no se modificaron.');
  const costeo = costearPlan(consolidar(entradas).lineas, datos.lotes, fecha);
  if (costeo.lineasSinConversion) return err('sin_conversion', 'Completa o corrige las equivalencias en gramos en Bodega antes de confirmar la producción.');
  if (!costeo.lineas.length || costeo.lineasConFaltante || costeo.lineasSinPrecio) {
    return err('faltantes', 'Faltan ingredientes para completar la producción. Registra la compra o ajusta las tandas pendientes antes de aprobar.');
  }
  if (JSON.stringify(costeo) !== JSON.stringify(previsto)) return err('costeo_cambio', 'La bodega cambió desde el cálculo. Actualiza el día y revisa el costo antes de aprobar.');
  const ejecucion = { id: nuevoId(), fecha, planRevision: revision, instante: new Date().toISOString(),
    responsable: responsable.trim(), motivo: motivo.trim(), area, recetaId, entradas: copiar(entradas), costeo: copiar(costeo) };
  const bajas = bajasDelCosteo(costeo);
  for (const lote of datos.lotes) {
    const cantidad = bajas.get(lote.id) || 0;
    if (!cantidad) continue;
    const antes = copiar(lote);
    // Conservar fracciones de litro/unidad; redondear a 0,001 regalaría stock.
    lote.existencia = Math.max(0, lote.existencia - cantidad);
    registrarEvento(datos, 'consumo', { fecha, produccionId: ejecucion.id, responsable: ejecucion.responsable,
      motivo: ejecucion.motivo, antes, despues: lote });
  }
  datos.ejecuciones.push(ejecucion);
  for (const e of plan.entradas) if (entradas.some((x) => x.recipe.id === e.recipe.id)) e.partidas = [];
  registrarEvento(datos, 'produccion_aprobada', { fecha, produccionId: ejecucion.id,
    responsable: ejecucion.responsable, motivo: ejecucion.motivo, area, recetaId });
  return ok(ejecucion);
}

/**
 * Tandas que hay que registrar para sacar N unidades de una receta.
 *
 * Para cuando el lote ya salió y falta "una más": el obrador piensa en
 * unidades, el plan en tandas. Se redondea HACIA ARRIBA a tres decimales -una
 * unidad de una receta de 3 son 0,334 tandas, no 0,333- porque quien pide una
 * unidad tiene que poder sacarla entera. Por debajo del mínimo registrable se
 * sube al mínimo y se DICE cuántas saldrán: callarlo sería descontar de bodega
 * más de lo que la pantalla enseña.
 */
export function tandasParaUnidades(recipe, unidades) {
  const pedidas = typeof unidades === 'number' ? unidades : Number(String(unidades ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(pedidas) || pedidas <= 0) return err('unidades', 'Indica cuántas unidades necesitas, con un número mayor que cero.');
  const rendimiento = rendimientoBase(recipe?.nombre || '');
  if (rendimiento === null) return err('sin_rendimiento', 'Esta receta no dice cuántas unidades rinde. Añádela por tandas.');
  const exactas = pedidas / rendimiento;
  // El épsilon evita que 0,5 × 1000 = 500,0000001 suba a 501 por el redondeo binario.
  const tandas = Math.max(FACTOR_MIN, Math.ceil(exactas * 1000 - 1e-9) / 1000);
  if (tandas > FACTOR_MAX) return err('exceso', `Son más de ${FACTOR_MAX} tandas. Reparte el pedido en varios días.`);
  return ok({
    tandas, pedidas, rendimiento,
    salen: Math.round(tandas * rendimiento * 1000) / 1000,
    unidad: splitYield(recipe.nombre).unidad.toLowerCase(),
    alMinimo: exactas < FACTOR_MIN,
  });
}

/**
 * Elimina el plan de un día que todavía no tiene producción confirmada.
 *
 * Con producción confirmada NO se elimina: su costo y sus consumos ya están en
 * el historial y el plan es lo que les da contexto. Lo que sí se puede es
 * quitar las recetas que falten. El plan eliminado queda en el historial con
 * responsable y motivo, igual que un cambio.
 */
export function eliminarPlanEn(datos, solicitud) {
  const { fecha, revision, responsable, motivo } = solicitud;
  if (!responsable?.trim() || !motivo?.trim()) return err('traza', 'Indica responsable y motivo para dejar constancia de la eliminación.');
  const plan = datos.planes.find((p) => p.fecha === fecha);
  if (!plan) return err('sin_plan', 'Este día no tiene un plan guardado.');
  if (plan.revision !== revision) return err('conflicto', 'Este plan cambió en otra pestaña. Vuelve a cargar el día antes de eliminarlo.');
  if (datos.ejecuciones.some((e) => e.fecha === fecha)) {
    return err('ya_producido', 'Este día ya tiene producción confirmada: su plan no se puede eliminar. Quita solo las recetas que aún no se producen.');
  }
  datos.planes = datos.planes.filter((p) => p.fecha !== fecha);
  datos.preparaciones = (datos.preparaciones || []).filter((p) => p.fecha !== fecha);
  registrarEvento(datos, 'plan_eliminado', { fecha, responsable: responsable.trim(), motivo: motivo.trim(), antes: plan, despues: null });
  return ok({ fecha, revision: plan.revision });
}

/**
 * Pone una receta en el plan del dia con N tandas, o la quita (`factor` 0).
 *
 * Es el registro directo del calendario: cada toque guarda, sin borrador. Toma
 * las demas recetas del plan tal como estan -con su formula congelada- y pasa
 * por `guardarPlanEn`, asi que valen las mismas reglas: no se quita lo ya
 * producido, lo adicional respeta el minimo y dos pestañas no se pisan.
 *
 * Quitar la ultima receta de un dia sin produccion elimina el plan del dia.
 *
 * EL HISTORIAL GUARDA SOLO EL CAMBIO. Cada toque del calendario es una
 * escritura; con el plan entero antes y despues en cada evento, el documento
 * crecia con el cuadrado de las recetas del dia y llenaba el almacenamiento
 * del navegador en una semana. `plan_ajustado` dice que receta, de cuantas a
 * cuantas tandas y en que version quedo el plan: la formula congelada ya esta
 * en el plan y, si se produce, en la ejecucion.
 *
 * @returns {{ok: true, value: {plan: object|null}} | {ok: false, code: string, message: string}}
 */
export function fijarRecetaEn(datos, solicitud, recetas) {
  const { fecha, revision = 0, recetaId, factor, responsable, motivo } = solicitud;
  if (!fechaValida(fecha)) return err('fecha', 'Elige una fecha válida.');
  const plan = datos.planes.find((p) => p.fecha === fecha) || null;
  if ((plan?.revision || 0) !== revision) return err('conflicto', 'La producción de este día cambió en otra pestaña. Se volvió a cargar: revisa y repite el cambio.');
  const actuales = (plan?.entradas || []).map((e) => ({ id: e.recipe.id, factor: e.factor, partidas: e.partidas }));
  const presente = actuales.some((e) => e.id === recetaId);
  let entradas;
  if (!factor) {
    if (!presente) return err('receta_invalida', 'Esa receta ya no está en la producción del día.');
    entradas = actuales.filter((e) => e.id !== recetaId);
  } else {
    const nueva = { id: recetaId, factor, partidas: solicitud.partidas };
    entradas = presente ? actuales.map((e) => (e.id === recetaId ? nueva : e)) : [...actuales, nueva];
  }
  if (!entradas.length && plan && !datos.ejecuciones.some((e) => e.fecha === fecha)) {
    const r = eliminarPlanEn(datos, { fecha, revision, responsable, motivo });
    return r.ok ? ok({ plan: null }) : r;
  }
  const r = aplicarPlan(datos, { fecha, revision, entradas, responsable, motivo }, recetas);
  if (!r.ok) return r;
  const { plan: nuevo } = r.value;
  const receta = nuevo.entradas.find((e) => e.recipe.id === recetaId)?.recipe
    || plan?.entradas.find((e) => e.recipe.id === recetaId)?.recipe;
  registrarEvento(datos, 'plan_ajustado', {
    fecha, revision: nuevo.revision, recetaId, receta: receta?.nombre || recetaId,
    tandasAntes: actuales.find((e) => e.id === recetaId)?.factor ?? null,
    tandasDespues: factor || null,
    partidasAntes: actuales.find((e) => e.id === recetaId)?.partidas || null,
    partidasDespues: nuevo.entradas.find((e) => e.recipe.id === recetaId)?.partidas || [],
    responsable: nuevo.responsable, motivo: nuevo.motivo,
  });
  return ok({ plan: nuevo });
}

/** Proyección secuencial: el lunes y el martes no prometen el mismo stock. */
export function proyectarPlanes(datos, desde, hasta) {
  let lotes = copiar(datos.lotes);
  const resultados = [];
  for (const plan of datos.planes.filter((p) => p.fecha >= desde && p.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const costeo = costearPlan(consolidar(pendientesDelPlan(datos, plan)).lineas, lotes, plan.fecha);
    const bajas = bajasDelCosteo(costeo);
    lotes = lotes.map((l) => ({ ...l, existencia: Math.max(0, l.existencia - (bajas.get(l.id) || 0)) }));
    resultados.push({ fecha: plan.fecha, costeo });
  }
  return resultados;
}
