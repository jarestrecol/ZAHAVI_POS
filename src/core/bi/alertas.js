/**
 * =============================================================================
 *  «NECESITA ATENCION»
 * =============================================================================
 *
 *  La lista corta de lo que hay que resolver, en orden de urgencia: lo que
 *  frena la produccion de hoy primero, lo que se puede perder despues, y al
 *  final lo que falta anotar.
 *
 *  CADA ALERTA LLEVA A DONDE SE ARREGLA (`destino`), y su texto nunca lleva
 *  dinero: la cifra de dinero va aparte (`dinero`) para que quitarla sin
 *  costos no deje una frase coja. La alerta de alza de precio es dinero entera
 *  y se retira completa.
 *
 *  Los faltantes se calculan con la MISMA cuenta que la confirmacion
 *  (`consolidar` + `costearPlan` sobre lo pendiente): si aqui dice que falta
 *  harina, al confirmar tambien faltara.
 */

import { sumarDias } from '../bitacora.js';
import { claveDe } from '../almacen.js';
import { estimadoPendiente } from './hoy.js';
import { coberturaDe, coberturaBaja, vencimientosDe } from './bodega.js';
import { sumarCampo, diaCorto, plural, cifraCorta, nombreLegible } from './periodos.js';

const DIAS_ATRAS = 14;

/** Hasta tres nombres y «y N más». */
function nombres(lista, maximo = 3) {
  const unicos = [...new Set(lista)];
  if (unicos.length <= maximo) return unicos.join(', ');
  return `${unicos.slice(0, maximo).join(', ')} y ${cifraCorta(unicos.length - maximo)} más`;
}

const alerta = (tipo, prioridad, datos) => ({
  id: tipo, tipo, prioridad, tono: prioridad === 1 ? 'critico' : prioridad === 2 ? 'atencion' : 'info', dinero: null, ...datos,
});

/** Lineas del costeo que impiden confirmar: faltan existencias o equivalencias. */
const lineasConProblema = (costeo) => (costeo?.lineas || []).filter((l) => l.faltante > 0 || l.estado === 'sin_conversion');

export function alertasDe(hechos, { metas }) {
  const hoy = hechos.hoy;
  const manana = sumarDias(hoy, 1);
  const desde = sumarDias(hoy, -DIAS_ATRAS);
  const lista = [];

  // --- Produccion atrasada -------------------------------------------------------
  const atrasadas = hechos.pendientes.filter((p) => p.fecha < hoy && p.fecha >= desde);
  if (atrasadas.length) {
    const porDia = new Map();
    for (const p of atrasadas) porDia.set(p.fecha, (porDia.get(p.fecha) || 0) + 1);
    const dias = [...porDia].sort(([a], [b]) => a.localeCompare(b));
    lista.push(alerta('atrasadas', 2, {
      titulo: `${plural(atrasadas.length, 'receta atrasada', 'recetas atrasadas')}`,
      detalle: dias.map(([f, n]) => `${diaCorto(f)}: ${plural(n, 'receta')}`).join(' · '),
      cantidad: atrasadas.length, destino: { modulo: 'plan', fecha: dias[0][0] }, accion: 'Ir a producción',
    }));
  }

  // --- Faltantes para hoy y para mañana -----------------------------------------
  const problemasHoy = lineasConProblema(estimadoPendiente(hechos, [hoy], hoy));
  if (problemasHoy.length) {
    lista.push(alerta('faltantes_hoy', 1, {
      titulo: `Falta materia prima para hoy: ${plural(problemasHoy.length, 'ingrediente')}`,
      detalle: nombres(problemasHoy.map((l) => nombreLegible(l.ingrediente))),
      cantidad: problemasHoy.length, destino: { modulo: 'almacen' }, accion: 'Ir a bodega',
    }));
  }
  if (hechos.pendientes.some((p) => p.fecha === manana)) {
    // Hoy y mañana juntos: lo que alcanza para hoy puede no alcanzar para los dos.
    const yaAvisados = new Set(problemasHoy.map((l) => claveDe(l.ingrediente, l.unidadReceta)));
    const nuevos = lineasConProblema(estimadoPendiente(hechos, [hoy, manana], manana))
      .filter((l) => !yaAvisados.has(claveDe(l.ingrediente, l.unidadReceta)));
    if (nuevos.length) {
      lista.push(alerta('faltantes_manana', 2, {
        titulo: `Para mañana no alcanza: ${plural(nuevos.length, 'ingrediente')}`,
        detalle: nombres(nuevos.map((l) => nombreLegible(l.ingrediente))),
        cantidad: nuevos.length, destino: { modulo: 'almacen' }, accion: 'Ir a bodega',
      }));
    }
  }

  // --- Bodega -----------------------------------------------------------------
  const bajas = coberturaBaja(coberturaDe(hechos, metas), metas);
  if (bajas.length) {
    lista.push(alerta('cobertura', 2, {
      titulo: `${plural(bajas.length, 'ingrediente alcanza', 'ingredientes alcanzan')} para menos de ${plural(metas.coberturaMinima, 'día', 'días')}`,
      detalle: nombres(bajas.map((c) => `${nombreLegible(c.ingrediente)} (${cifraCorta(c.dias, 1)} d)`)),
      cantidad: bajas.length, destino: { modulo: 'almacen' }, accion: 'Ir a bodega',
    }));
  }
  const vencimientos = vencimientosDe(hechos, metas);
  const vencidos = vencimientos.filter((v) => v.dias < 0);
  if (vencidos.length) {
    lista.push(alerta('vencidos', 1, {
      titulo: `${plural(vencidos.length, 'lote vencido', 'lotes vencidos')} con existencia`,
      detalle: `${nombres(vencidos.map((v) => nombreLegible(v.ingrediente)))}. No se usan en producción: dales de baja.`,
      cantidad: vencidos.length, dinero: sumarCampo(vencidos, 'valor'), destino: { modulo: 'almacen' }, accion: 'Ir a bodega',
    }));
  }
  const porVencer = vencimientos.filter((v) => v.dias >= 0);
  if (porVencer.length) {
    lista.push(alerta('por_vencer', 2, {
      titulo: `${plural(porVencer.length, 'lote vence', 'lotes vencen')} en ${plural(metas.avisoVencimiento, 'día', 'días')} o menos`,
      detalle: nombres(porVencer.map((v) => `${nombreLegible(v.ingrediente)} (${v.dias === 0 ? 'hoy' : diaCorto(v.vencimiento)})`)),
      cantidad: porVencer.length, dinero: sumarCampo(porVencer, 'valor'), destino: { modulo: 'almacen' }, accion: 'Ir a bodega',
    }));
  }
  const sinEquivalencia = hechos.lotes.filter((l) => l.existencia > 0 && l.gramosPorUnidad === null);
  if (sinEquivalencia.length) {
    lista.push(alerta('sin_equivalencia', 2, {
      titulo: `${plural(sinEquivalencia.length, 'lote', 'lotes')} sin equivalencia en gramos`,
      detalle: `${nombres(sinEquivalencia.map((l) => nombreLegible(l.ingrediente)))}. Sin ella no se pueden costear ni confirmar recetas que los usan.`,
      cantidad: sinEquivalencia.length, destino: { modulo: 'almacen' }, accion: 'Completar en bodega',
    }));
  }

  // --- Seguimiento ---------------------------------------------------------------
  const medidas = new Set(hechos.resultados.map((r) => `${r.produccionId}|${r.recetaId}`));
  const sinResultado = hechos.producciones.filter((p) => p.fecha >= desde && p.fecha < hoy && !medidas.has(p.id));
  if (sinResultado.length) {
    lista.push(alerta('sin_resultado', 3, {
      titulo: `${plural(sinResultado.length, 'producción', 'producciones')} sin resultado registrado`,
      detalle: `De los últimos ${DIAS_ATRAS} días: ${nombres(sinResultado.map((p) => nombreLegible(p.receta)))}`,
      cantidad: sinResultado.length, destino: { modulo: 'plan', fecha: sinResultado.at(-1).fecha }, accion: 'Registrar resultados',
    }));
  }
  const asignadas = new Set(hechos.preparaciones.filter((p) => p.fecha === hoy && p.asignado).map((p) => p.recetaId));
  const sinAsignar = hechos.pendientes.filter((p) => p.fecha === hoy && !asignadas.has(p.recetaId));
  if (sinAsignar.length) {
    lista.push(alerta('sin_asignar', 2, {
      titulo: `${plural(sinAsignar.length, 'receta', 'recetas')} de hoy sin asignar`,
      detalle: nombres(sinAsignar.map((p) => nombreLegible(p.receta))),
      cantidad: sinAsignar.length, destino: { modulo: 'plan', fecha: hoy }, accion: 'Asignar',
    }));
  }
  const abiertas = hechos.notas.filter((n) => (n.tipo === 'tarea' || n.tipo === 'pendiente') && !n.hecha && n.fecha <= hoy);
  if (abiertas.length) {
    lista.push(alerta('notas_abiertas', 3, {
      titulo: `${plural(abiertas.length, 'tarea o pendiente abierto', 'tareas o pendientes abiertos')}`,
      detalle: `La más antigua es del ${diaCorto(abiertas[0].fecha)}.`,
      cantidad: abiertas.length, destino: { modulo: 'plan', fecha: abiertas[0].fecha }, accion: 'Ver notas',
    }));
  }

  // --- Alza de precio (solo con costos) ----------------------------------------
  const desdeCompras = sumarDias(hoy, -6);
  const ultimaCompra = new Map();
  const alzas = [];
  for (const m of hechos.movimientos) {
    if (m.tipo !== 'compra' || m.precioPorGramo === null || m.fecha > hoy) continue;
    const k = claveDe(m.ingrediente, '');
    const previa = ultimaCompra.get(k);
    if (previa && m.fecha >= desdeCompras && previa.precioPorGramo > 0) {
      const cambio = m.precioPorGramo / previa.precioPorGramo - 1;
      if (cambio * 100 >= metas.alzaPrecio) alzas.push({ ingrediente: m.ingrediente, cambio });
    }
    ultimaCompra.set(k, m);
  }
  if (alzas.length) {
    alzas.sort((a, b) => b.cambio - a.cambio);
    lista.push(alerta('alza_precio', 3, {
      titulo: `${plural(alzas.length, 'compra', 'compras')} más cara por gramo que la anterior`,
      detalle: nombres(alzas.map((a) => `${nombreLegible(a.ingrediente)} +${cifraCorta(a.cambio * 100)} %`)),
      cantidad: alzas.length, destino: { modulo: 'almacen' }, accion: 'Ir a bodega',
    }));
  }

  return lista.sort((a, b) => a.prioridad - b.prioridad || b.cantidad - a.cantidad);
}
