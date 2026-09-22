/**
 * =============================================================================
 *  INDICADORES DE PRODUCCION
 * =============================================================================
 *
 *  Cuanto se produjo, cuanto costo en materia prima y cuanto del plan se
 *  cumplio en el periodo elegido.
 *
 *  SOLO LO CONFIRMADO CUESTA. El gasto es el costo congelado de lo confirmado;
 *  lo planeado puede no producirse. Los periodos sin produccion valen cero en
 *  las series: sin el cero, la linea uniria dias con gasto y pareceria que hubo
 *  gasto en medio.
 *
 *  UNIDADES SIN MEZCLAR. Solo se suman las recetas que rinden en unidades
 *  (UND); 10 paquetes y 30 unidades no son 40 de nada.
 *
 *  EL RANKING SIN DINERO. Quien no ve costos ve el ranking por tandas; si se
 *  ordenara por costo y solo se quitara la cifra, el orden mismo revelaria que
 *  receta cuesta mas. `rankingDeRecetas` sirve a los dos.
 */

import { sumarDias } from '../bitacora.js';
import { toleranciaDe } from './metas.js';
import {
  cubetas, indiceDeCubetas, crearIndicador, enRango, sumarCampo, porcentaje, dividir, variacionEntre,
  areasDe, tonoDeArea, nombreDeArea, serieDeArea, plural, cifraCorta, vaciarIndicadores,
} from './periodos.js';

const NOMBRES_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** 0 = lunes ... 6 = domingo. */
export const diaDeSemana = (fecha) => (new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;

/** Tandas planeadas y confirmadas de los dias con plan dentro del rango, hasta hoy. */
export function cumplimientoDePlan(hechos, rango) {
  const hasta = rango.hasta < hechos.hoy ? rango.hasta : hechos.hoy;
  const confirmado = new Map();
  for (const p of hechos.producciones) {
    if (p.fecha < rango.desde || p.fecha > hasta) continue;
    const clave = `${p.fecha}|${p.recetaId}`;
    confirmado.set(clave, (confirmado.get(clave) || 0) + p.tandas);
  }
  const filas = [];
  for (const p of hechos.planeado) {
    if (p.fecha < rango.desde || p.fecha > hasta) continue;
    // Lo confirmado nunca pasa de lo planeado (el plan no deja quitar lo
    // producido); el tope protege la cifra de un dato raro.
    filas.push({ area: p.area, planeadas: p.tandas, confirmadas: Math.min(p.tandas, confirmado.get(`${p.fecha}|${p.recetaId}`) || 0) });
  }
  return filas;
}

/**
 * Ranking de recetas por costo o por tandas, con participacion y acumulado
 * (Pareto) de esa misma medida.
 *
 * @param {Array<object>} filas con `tandas`, `tandasAnterior` y, si hay costos, `costo`/`costoAnterior`
 * @param {'costo'|'tandas'} medida
 */
export function rankingDeRecetas(filas, medida) {
  const valor = (f) => (medida === 'costo' ? f.costo : f.tandas);
  const total = filas.reduce((s, f) => s + (valor(f) || 0), 0);
  const orden = [...filas].sort((a, b) => valor(b) - valor(a) || b.tandas - a.tandas || a.receta.localeCompare(b.receta, 'es'));
  let acumulado = 0;
  const recetas = orden.map((f) => {
    acumulado += valor(f) || 0;
    return { ...f,
      participacion: porcentaje(valor(f), total),
      acumulado: porcentaje(acumulado, total),
      variacion: medida === 'costo' ? variacionEntre(f.costo, f.costoAnterior) : variacionEntre(f.tandas, f.tandasAnterior) };
  });
  const top20 = Math.ceil(recetas.length * 0.2);
  return { recetas, pareto: { recetas: recetas.length, top20, porcentajeTop20: top20 ? recetas[top20 - 1].acumulado : null } };
}

/**
 * Seccion de produccion del panel.
 *
 * @param {object} hechos
 * @param {{rango: object, metas: object, verCostos: boolean}} contexto
 */
export function seccionProduccion(hechos, { rango, metas, verCostos }) {
  const actual = hechos.producciones.filter((p) => enRango(p.fecha, rango));
  const previo = hechos.producciones.filter((p) => enRango(p.fecha, rango.anterior));
  const areas = areasDe(hechos.producciones, hechos.planeado);
  const lista = cubetas(rango.desde, rango.hasta, rango.grano);
  const indice = indiceDeCubetas(lista);

  // --- Series por cubeta -------------------------------------------------------
  const vacio = () => lista.map((c) => ({ desde: c.desde, hasta: c.hasta, valores: {} }));
  const puntosGasto = vacio();
  const puntosTandas = vacio();
  for (const pt of puntosGasto) { pt.valores.total = 0; for (const a of areas) pt.valores[serieDeArea(a)] = 0; }
  for (const pt of puntosTandas) for (const a of areas) pt.valores[serieDeArea(a)] = 0;
  for (const p of actual) {
    const i = indice(p.fecha);
    if (i < 0) continue;
    puntosGasto[i].valores.total += p.costo;
    puntosGasto[i].valores[serieDeArea(p.area)] += p.costo;
    puntosTandas[i].valores[serieDeArea(p.area)] += p.tandas;
  }
  const seriesAreas = areas.map((a) => ({ id: serieDeArea(a), nombre: nombreDeArea(a), tono: tonoDeArea(a) }));
  const gasto = { id: 'gasto', nombre: 'Gasto de materia prima', formato: 'pesos', dinero: true, grano: rango.grano,
    series: [{ id: 'total', nombre: 'Total', tono: 'total' }, ...seriesAreas], puntos: puntosGasto, meta: null };
  const tandas = { id: 'tandas', nombre: 'Tandas confirmadas', formato: 'tandas', dinero: false, grano: rango.grano,
    series: seriesAreas, puntos: puntosTandas, meta: null };

  // Mismo numero de cubetas del periodo anterior, para la linea de comparacion.
  const listaPrevia = cubetas(rango.anterior.desde, rango.anterior.hasta, rango.grano);
  const indicePrevio = indiceDeCubetas(listaPrevia);
  const puntosPrevios = listaPrevia.map((c) => ({ desde: c.desde, hasta: c.hasta, valores: { anterior: 0 } }));
  for (const p of previo) {
    const i = indicePrevio(p.fecha);
    if (i >= 0) puntosPrevios[i].valores.anterior += p.costo;
  }
  const gastoAnterior = { id: 'gasto_anterior', nombre: 'Gasto del periodo anterior', formato: 'pesos', dinero: true,
    grano: rango.grano, series: [{ id: 'anterior', nombre: 'Periodo anterior', tono: 'comparacion' }], puntos: puntosPrevios, meta: null };

  // --- Indicadores -------------------------------------------------------------
  const diasCon = (filas) => new Set(filas.map((p) => p.fecha)).size;
  const gastoActual = sumarCampo(actual, 'costo');
  const gastoPrevio = sumarCampo(previo, 'costo');
  const enUnidades = (filas) => filas.filter((p) => p.unidadSalida === 'UND' && Number.isFinite(p.unidadesEsperadas));
  const recetasCon = new Set(enUnidades(actual).map((p) => p.recetaId)).size;
  const recetasTotal = new Set(actual.map((p) => p.recetaId));
  const cumplimiento = (r) => {
    const filas = cumplimientoDePlan(hechos, r);
    return { planeadas: sumarCampo(filas, 'planeadas'), confirmadas: sumarCampo(filas, 'confirmadas'), filas };
  };
  const cumpleActual = cumplimiento(rango);
  const cumplePrevio = cumplimiento(rango.anterior);
  const chispaDe = (campo) => puntosGasto.map((pt, i) => (campo === 'gasto' ? pt.valores.total
    : Object.values(puntosTandas[i].valores).reduce((s, v) => s + v, 0)));

  const indicadores = [
    crearIndicador({ id: 'gasto', nombre: 'Gasto en materia prima', valor: gastoActual, anterior: gastoPrevio, formato: 'pesos',
      dinero: true, base: `${plural(actual.length, 'receta confirmada', 'recetas confirmadas')}`,
      definicion: 'Suma del costo de materia prima de las recetas confirmadas en el periodo, con los precios congelados al confirmar cada una.',
      chispa: chispaDe('gasto') }),
    crearIndicador({ id: 'tandas', nombre: 'Tandas producidas', valor: sumarCampo(actual, 'tandas'), anterior: sumarCampo(previo, 'tandas'), formato: 'tandas',
      base: `${plural(diasCon(actual), 'día', 'días')} con producción`,
      definicion: 'Suma de las tandas confirmadas en el periodo. Lo planeado sin confirmar no cuenta.',
      chispa: chispaDe('tandas') }),
    crearIndicador({ id: 'unidades', nombre: 'Unidades producidas', valor: enUnidades(actual).length ? sumarCampo(enUnidades(actual), 'unidadesEsperadas') : null,
      anterior: enUnidades(previo).length ? sumarCampo(enUnidades(previo), 'unidadesEsperadas') : null, formato: 'unidades',
      base: `De ${cifraCorta(recetasCon)} de ${plural(recetasTotal.size, 'receta')}: solo las que dicen en el nombre cuántas unidades rinden`,
      definicion: 'Unidades que dice el nombre de cada receta (por ejemplo «X 24 UND») multiplicadas por las tandas confirmadas. Las recetas que rinden en paquetes, porciones o sin rendimiento escrito no se suman.' }),
    crearIndicador({ id: 'recetas_distintas', nombre: 'Recetas distintas', valor: recetasTotal.size,
      anterior: new Set(previo.map((p) => p.recetaId)).size, formato: 'numero',
      base: `En ${plural(diasCon(actual), 'día con producción', 'días con producción')}`,
      definicion: 'Cuántas recetas diferentes se confirmaron al menos una vez en el periodo.' }),
    crearIndicador({ id: 'dias_con_produccion', nombre: 'Días con producción', valor: diasCon(actual), anterior: diasCon(previo), formato: 'numero',
      base: `De ${plural(rango.dias, 'día', 'días')} del periodo`,
      definicion: 'Días del periodo con al menos una receta confirmada.' }),
    crearIndicador({ id: 'cumplimiento_plan', nombre: 'Cumplimiento del plan', valor: porcentaje(cumpleActual.confirmadas, cumpleActual.planeadas),
      anterior: porcentaje(cumplePrevio.confirmadas, cumplePrevio.planeadas), formato: 'porcentaje', sentido: 'subir',
      meta: metas.cumplimientoPlan, tolerancia: toleranciaDe('cumplimientoPlan', metas.cumplimientoPlan),
      base: `${cifraCorta(cumpleActual.confirmadas, 1)} de ${cifraCorta(cumpleActual.planeadas, 1)} tandas planeadas`,
      definicion: 'Tandas confirmadas en días con plan ÷ tandas planeadas de esos días, hasta hoy. Lo de hoy que falta por confirmar baja la cifra hasta que se confirme.' }),
    crearIndicador({ id: 'costo_por_dia', nombre: 'Gasto por día de producción', valor: dividir(gastoActual, diasCon(actual)),
      anterior: dividir(gastoPrevio, diasCon(previo)), formato: 'pesos', dinero: true,
      definicion: 'Gasto en materia prima del periodo ÷ días con producción confirmada.' }),
  ];

  // --- Calor de 12 semanas y promedio por dia de semana -----------------------
  const desdeCalor = sumarDias(hechos.hoy, -83);
  const porDia = new Map();
  for (const p of hechos.producciones) {
    if (p.fecha < desdeCalor || p.fecha > hechos.hoy) continue;
    const d = porDia.get(p.fecha) || { tandas: 0, costo: 0 };
    d.tandas += p.tandas;
    d.costo += p.costo;
    porDia.set(p.fecha, d);
  }
  const calor = [];
  for (let f = desdeCalor; f <= hechos.hoy; f = sumarDias(f, 1)) {
    const d = porDia.get(f) || { tandas: 0, costo: 0 };
    calor.push({ fecha: f, tandas: d.tandas, costo: d.costo });
  }

  const diasPeriodo = new Map();
  for (const p of actual) {
    const d = diasPeriodo.get(p.fecha) || { tandas: 0, costo: 0 };
    d.tandas += p.tandas;
    d.costo += p.costo;
    diasPeriodo.set(p.fecha, d);
  }
  const semana = NOMBRES_DIA.map((nombre, dia) => {
    const dias = [...diasPeriodo].filter(([f]) => diaDeSemana(f) === dia).map(([, v]) => v);
    return { dia, nombre, dias: dias.length, tandas: dividir(sumarCampo(dias, 'tandas'), dias.length), costo: dividir(sumarCampo(dias, 'costo'), dias.length) };
  });

  // --- Ranking de recetas ------------------------------------------------------
  const agrupar = (filas) => {
    const mapa = new Map();
    for (const p of filas) {
      const r = mapa.get(p.recetaId) || { recetaId: p.recetaId, receta: p.receta, area: p.area, tandas: 0, costo: 0, unidades: 0, conUnidades: true };
      r.tandas += p.tandas;
      r.costo += p.costo;
      if (p.unidadSalida === 'UND' && Number.isFinite(p.unidadesEsperadas)) r.unidades += p.unidadesEsperadas;
      else r.conUnidades = false;
      mapa.set(p.recetaId, r);
    }
    return mapa;
  };
  const antes = agrupar(previo);
  const filas = [...agrupar(actual).values()].map((r) => {
    const unidades = r.conUnidades ? r.unidades : null;
    return { recetaId: r.recetaId, receta: r.receta, area: r.area, tandas: r.tandas, unidades, costo: r.costo,
      costoUnidad: dividir(r.costo, unidades), tandasAnterior: antes.get(r.recetaId)?.tandas ?? 0,
      costoAnterior: antes.get(r.recetaId)?.costo ?? 0 };
  });
  const ranking = rankingDeRecetas(filas, verCostos ? 'costo' : 'tandas');
  const recetas = ranking.recetas.map(({ costoAnterior, ...f }) => f);

  // --- Plan contra real por area -----------------------------------------------
  const planVsReal = areas.map((area) => {
    const delArea = cumpleActual.filas.filter((f) => f.area === area);
    const planeadas = sumarCampo(delArea, 'planeadas');
    const confirmadas = sumarCampo(delArea, 'confirmadas');
    return { area, planeadas, confirmadas, cumplimiento: porcentaje(confirmadas, planeadas) };
  });

  const sinHistoria = !hechos.producciones.length && !hechos.planeado.length;
  return { indicadores: sinHistoria ? vaciarIndicadores(indicadores) : indicadores, gasto, gastoAnterior, tandas, calor, semana, recetas, pareto: ranking.pareto, planVsReal };
}
