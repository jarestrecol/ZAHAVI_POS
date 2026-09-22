/**
 * =============================================================================
 *  LA FRANJA «HOY» DEL RESUMEN
 * =============================================================================
 *
 *  Lo que un gerente mira al llegar: como va la produccion de hoy, cuanto va a
 *  costar el dia, como va el mes contra el presupuesto y si algo del
 *  rendimiento o de la bodega se esta saliendo de la meta.
 *
 *  EL COSTO DE HOY ES REAL + ESTIMADO. Lo confirmado lleva su costo congelado;
 *  lo que falta se estima con la bodega de ahora (FEFO), igual que la pantalla
 *  de produccion. Se compara con el promedio de los ultimos cuatro dias de la
 *  misma semana que tuvieron produccion: un sabado no se compara con un lunes.
 *
 *  EL PRESUPUESTO SE JUZGA POR LA PROYECCION. A dia 5 cualquier mes esta «por
 *  debajo» del presupuesto; lo que importa es a donde llega si sigue a este
 *  ritmo: gasto del mes ÷ dias transcurridos × dias del mes.
 *
 *  Independiente del periodo elegido: hoy es hoy.
 */

import { sumarDias } from '../bitacora.js';
import { consolidar } from '../plan.js';
import { costearPlan } from '../costeo.js';
import { pesos } from '../../lib/format.js';
import { toleranciaDe } from './metas.js';
import { agregarResultados } from './rendimiento.js';
import { valorActual, valoresAlCierre, coberturaDe, coberturaBaja } from './bodega.js';
import { diaDeSemana } from './produccion.js';
import {
  rangoDe, finDeMes, crearIndicador, sumarCampo, porcentaje, diasEntre, estadoContraMeta, areasDe, plural, cifraCorta, enRango, vaciarIndicadores,
  coberturaBajaResumen, nombreLegible,
} from './periodos.js';

const SEMANAS_ATRAS = 26;

/** Estado de las recetas de hoy: planeadas, listas y en preparacion. */
export function recetasDeHoy(hechos) {
  const pendientes = new Map(hechos.pendientes.filter((p) => p.fecha === hechos.hoy).map((p) => [p.recetaId, p]));
  const preparaciones = new Map(hechos.preparaciones.filter((p) => p.fecha === hechos.hoy).map((p) => [p.recetaId, p]));
  return hechos.planeado.filter((p) => p.fecha === hechos.hoy).map((p) => {
    const pendiente = pendientes.get(p.recetaId);
    const prep = preparaciones.get(p.recetaId);
    const lista = !pendiente;
    return { ...p, lista, pendiente: pendiente?.tandas || 0, enPreparacion: !lista && Boolean(prep?.iniciada),
      asignado: prep?.asignado || null };
  });
}

/** Costo estimado FEFO de lo que falta confirmar en unas fechas, con la bodega de ahora. */
export function estimadoPendiente(hechos, fechas, fechaCosteo) {
  const entradas = hechos.pendientes.filter((p) => fechas.includes(p.fecha)).map((p) => ({ recipe: p.recipe, factor: p.tandas }));
  if (!entradas.length) return null;
  return costearPlan(consolidar(entradas).lineas, hechos.lotes, fechaCosteo);
}

export function resumenDeHoy(hechos, { metas }) {
  const hoy = hechos.hoy;
  const recetas = recetasDeHoy(hechos);
  const listas = recetas.filter((r) => r.lista).length;
  const enPreparacion = recetas.filter((r) => r.enPreparacion).length;
  const sinAsignar = recetas.filter((r) => !r.lista && !r.asignado).length;

  // --- Costo de hoy -------------------------------------------------------------
  const costoDia = (fecha) => sumarCampo(hechos.producciones.filter((p) => p.fecha === fecha), 'costo');
  const confirmadoHoy = costoDia(hoy);
  const estimado = estimadoPendiente(hechos, [hoy], hoy);
  const estimadoHoy = estimado ? estimado.costoTotal : 0;
  const conProduccion = new Set(hechos.producciones.map((p) => p.fecha));
  const mismosDias = [];
  for (let s = 1; s <= SEMANAS_ATRAS && mismosDias.length < 4; s++) {
    const f = sumarDias(hoy, -7 * s);
    if (conProduccion.has(f)) mismosDias.push(costoDia(f));
  }
  const nombreDia = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'][diaDeSemana(hoy)];
  const baseCosto = `Confirmado ${pesos(confirmadoHoy)} + por confirmar ${pesos(estimadoHoy)}`
    + (estimado?.lineasSinPrecio || estimado?.lineasConFaltante ? ' (estimado incompleto: faltan precios o existencias)' : '');

  // --- Presupuesto del mes -------------------------------------------------------
  const mes = rangoDe('mes', hoy).value;
  const gastoMes = sumarCampo(hechos.producciones.filter((p) => enRango(p.fecha, mes)), 'costo');
  const gastoMesPrevio = sumarCampo(hechos.producciones.filter((p) => enRango(p.fecha, mes.anterior)), 'costo');
  const diasDelMes = diasEntre(mes.desde, finDeMes(hoy));
  const proyeccion = (gastoMes / mes.dias) * diasDelMes;
  const presupuesto = metas.presupuestoMensual;

  // --- Rendimiento de 7 dias -------------------------------------------------------
  const siete = rangoDe('7d', hoy).value;
  const r7 = agregarResultados(hechos.resultados.filter((r) => enRango(r.fecha, siete)));
  const r7previo = agregarResultados(hechos.resultados.filter((r) => enRango(r.fecha, siete.anterior)));

  // --- Bodega ------------------------------------------------------------------
  const [valorHace7] = valoresAlCierre(hechos.movimientos, [sumarDias(hoy, -7)]);
  const cobertura = coberturaDe(hechos, metas);
  const bajas = coberturaBaja(cobertura, metas);

  const indicadores = [
    crearIndicador({ id: 'avance_hoy', nombre: 'Avance de hoy', valor: porcentaje(listas, recetas.length), formato: 'porcentaje', sentido: 'subir',
      base: `${cifraCorta(listas)} de ${plural(recetas.length, 'receta')} listas`,
      definicion: 'Recetas del plan de hoy ya confirmadas por completo ÷ recetas del plan de hoy.' }),
    crearIndicador({ id: 'en_preparacion', nombre: 'En preparación', valor: recetas.length ? enPreparacion : null, formato: 'numero',
      base: `${cifraCorta(sinAsignar)} sin asignar`,
      definicion: 'Recetas de hoy que alguien empezó y todavía no marcó como listas. «Sin asignar» son las recetas de hoy que faltan y no tienen a nadie asignado.' }),
    crearIndicador({ id: 'costo_hoy', nombre: 'Costo de hoy', valor: recetas.length || confirmadoHoy ? confirmadoHoy + estimadoHoy : null,
      anterior: mismosDias.length ? sumarCampo(mismosDias) / mismosDias.length : null, formato: 'pesos', dinero: true, base: baseCosto,
      definicion: `Costo congelado de lo confirmado hoy + costo estimado de lo que falta con la bodega de ahora. Se compara con el promedio de los últimos cuatro ${nombreDia} con producción.` }),
    crearIndicador({ id: 'presupuesto_mes', nombre: 'Gasto del mes', valor: gastoMes, anterior: gastoMesPrevio, formato: 'pesos', dinero: true,
      sentido: 'bajar', meta: presupuesto,
      estado: estadoContraMeta(proyeccion, presupuesto, 'bajar', toleranciaDe('presupuestoMensual', presupuesto)),
      base: `Proyección a fin de mes: ${pesos(proyeccion)}`,
      definicion: 'Gasto en materia prima de lo confirmado desde el día 1. El semáforo compara con el presupuesto la proyección a fin de mes (gasto del mes ÷ días transcurridos × días del mes). Se compara con los mismos días del mes anterior.' }),
    crearIndicador({ id: 'rendimiento_7d', nombre: 'Rendimiento (7 días)', valor: r7.cumplimiento, anterior: r7previo.cumplimiento, formato: 'porcentaje',
      sentido: 'subir', meta: metas.rendimientoMinimo, tolerancia: toleranciaDe('rendimientoMinimo'),
      base: plural(r7.conEsperado, 'resultado medido', 'resultados medidos'),
      definicion: 'Vendibles ÷ lo que la receta dice que sale, de cada resultado registrado en los últimos 7 días, promediado pesando cada resultado por su costo de materia prima. No se suman unidades, gramos y paquetes entre sí.' }),
    crearIndicador({ id: 'rechazo_7d', nombre: 'Rechazo (7 días)', valor: r7.rechazo, anterior: r7previo.rechazo, formato: 'porcentaje',
      sentido: 'bajar', meta: metas.rechazoMaximo, tolerancia: toleranciaDe('rechazoMaximo'),
      base: plural(r7.medidos, 'resultado medido', 'resultados medidos'),
      definicion: 'Rechazadas ÷ obtenidas de cada resultado registrado en los últimos 7 días, promediado pesando cada resultado por su costo de materia prima. No se suman unidades, gramos y paquetes entre sí.' }),
    crearIndicador({ id: 'valor_bodega', nombre: 'Valor en bodega', valor: valorActual(hechos), anterior: valorHace7, formato: 'pesos', dinero: true,
      definicion: 'Existencia de cada lote × su precio de compra. Se compara con el valor de hace 7 días.' }),
    crearIndicador({ id: 'cobertura_baja', nombre: 'Ingredientes por acabarse', formato: 'numero', sentido: 'bajar',
      ...coberturaBajaResumen(bajas.length, cobertura.length, metas.coberturaMinima),
      // Con pocos, la base los nombra: es lo que el gerente va a ir a comprar.
      ...(bajas.length && bajas.length <= 3 ? { base: bajas.map((c) => nombreLegible(c.ingrediente)).join(', ') } : {}),
      definicion: `Ingredientes que alcanzan para menos de ${plural(metas.coberturaMinima, 'día', 'días')} según el consumo de los últimos 28 días.` }),
  ];

  const areas = areasDe(recetas).map((area) => {
    const delArea = recetas.filter((r) => r.area === area);
    return {
      area, recetas: delArea.length, listas: delArea.filter((r) => r.lista).length,
      enPreparacion: delArea.filter((r) => r.enPreparacion).length, pendientes: delArea.filter((r) => !r.lista).length,
      tandas: sumarCampo(delArea, 'tandas'),
      tandasListas: delArea.reduce((s, r) => s + Math.max(0, Math.round((r.tandas - r.pendiente) * 1000) / 1000), 0),
    };
  });

  const sinHistoria = !hechos.producciones.length && !hechos.planeado.length && !hechos.lotes.length && !hechos.movimientos.length;
  return { indicadores: sinHistoria ? vaciarIndicadores(indicadores) : indicadores, areas };
}
