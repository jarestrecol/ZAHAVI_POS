/**
 * =============================================================================
 *  INDICADORES DE RENDIMIENTO
 * =============================================================================
 *
 *  Cuanto de lo que la receta promete sale de verdad del horno y cuanto se
 *  pierde. Se mide solo sobre los resultados REGISTRADOS: una confirmacion sin
 *  medir no se supone perfecta; se cuenta aparte en «medidas».
 *
 *  Todo lo que se divide lleva su base: 0 esperadas o 0 obtenidas dejan el
 *  indicador en «sin datos», nunca en infinito ni en cero inventado.
 *
 *  El costo por unidad es el costo congelado de la confirmacion ÷ unidades: el
 *  real divide por las vendibles, el previsto por las que dice la receta.
 */

import { pesos } from '../../lib/format.js';
import { toleranciaDe } from './metas.js';
import {
  cubetas, indiceDeCubetas, crearIndicador, enRango, sumarCampo, porcentaje, dividir, areasDe, plural, cifraCorta, vaciarIndicadores,
} from './periodos.js';

/**
 * Promedio de un porcentaje por resultado, ponderado por el costo de materia
 * prima de cada resultado. Si ALGUNO no tiene costo (lotes sin precio al
 * confirmar), promedio simple: ponderar dejaría a esos resultados con peso cero
 * y la cifra saldría de unos pocos mientras la base dice «10 medidos». Nunca se suman cantidades de medidas distintas: 10.000 GR de masa y
 * 20 UND de pan no son 10.020 de nada, pero «2 % de rechazo» y «10 % de
 * rechazo» si se pueden promediar.
 */
function promedioPonderado(resultados, porcentajeDe) {
  const medidos = resultados.map((r) => ({ r, pct: porcentajeDe(r) })).filter((x) => x.pct !== null);
  if (!medidos.length) return null;
  if (medidos.every((x) => x.r.costo > 0)) {
    const pesos = medidos.reduce((s, x) => s + x.r.costo, 0);
    return medidos.reduce((s, x) => s + x.r.costo * x.pct, 0) / pesos;
  }
  return medidos.reduce((s, x) => s + x.pct, 0) / medidos.length;
}

const cumplimientoDe = (r) => (r.esperado > 0 ? (r.vendible / r.esperado) * 100 : null);
const rechazoDe = (r) => (r.vendible + r.rechazado > 0 ? (r.rechazado / (r.vendible + r.rechazado)) * 100 : null);

/**
 * Cifras agregadas de un grupo de resultados.
 *
 * Los porcentajes (rendimiento y rechazo) son promedios ponderados por el costo
 * de cada resultado, asi que un grupo puede mezclar medidas. Las cantidades
 * (vendible, rechazado, obtenido) solo tienen sentido dentro de UNA medida: si
 * el grupo mezcla, `unidad` es null y no deben mostrarse como un total. El costo
 * por unidad se calcula en una sola medida: UND si la hay; si no, la de mas costo.
 */
export function agregarResultados(resultados) {
  const unidades = [...new Set(resultados.map((r) => r.unidad))];
  const conEsperado = resultados.filter((r) => r.esperado > 0);
  const vendible = sumarCampo(resultados, 'vendible');
  const rechazado = sumarCampo(resultados, 'rechazado');
  const conMerma = resultados.filter((r) => r.mermaPreparacionGr !== null || r.mermaCoccionGr !== null);
  const mermaGr = conMerma.reduce((s, r) => s + (r.mermaPreparacionGr || 0) + (r.mermaCoccionGr || 0), 0);
  // Costo real y previsto sobre el MISMO grupo (con esperado y con vendibles)
  // y en una sola medida, para que la diferencia hable del rendimiento.
  const comparables = conEsperado.filter((r) => r.vendible > 0);
  const costoPorUnidad = new Map();
  for (const r of comparables) costoPorUnidad.set(r.unidad, (costoPorUnidad.get(r.unidad) || 0) + r.costo);
  const unidadCosto = costoPorUnidad.has('UND') ? 'UND'
    : [...costoPorUnidad].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const enUnidad = comparables.filter((r) => r.unidad === unidadCosto);
  const costoComparable = sumarCampo(enUnidad, 'costo');
  const costoRechazo = resultados.reduce((s, r) => {
    const obt = r.vendible + r.rechazado;
    return s + (obt > 0 ? r.rechazado * (r.costo / obt) : 0);
  }, 0);
  return {
    medidos: resultados.length, conEsperado: conEsperado.length, conMerma: conMerma.length,
    comparables: enUnidad.length, unidadCosto,
    unidad: unidades.length === 1 ? unidades[0] : null,
    vendible, rechazado, obtenido: vendible + rechazado,
    cumplimiento: promedioPonderado(resultados, cumplimientoDe),
    rechazo: promedioPonderado(resultados, rechazoDe),
    mermaKg: conMerma.length ? mermaGr / 1000 : null,
    costoReal: dividir(costoComparable, sumarCampo(enUnidad, 'vendible')),
    costoPrevisto: dividir(costoComparable, sumarCampo(enUnidad, 'esperado')),
    costoRechazo: resultados.length ? costoRechazo : null,
  };
}

export function seccionRendimiento(hechos, { rango, metas }) {
  const actual = hechos.resultados.filter((r) => enRango(r.fecha, rango));
  const previo = hechos.resultados.filter((r) => enRango(r.fecha, rango.anterior));
  const a = agregarResultados(actual);
  const b = agregarResultados(previo);
  const producciones = hechos.producciones.filter((p) => enRango(p.fecha, rango));
  const produccionesPrevias = hechos.producciones.filter((p) => enRango(p.fecha, rango.anterior));

  const lista = cubetas(rango.desde, rango.hasta, rango.grano);
  const indice = indiceDeCubetas(lista);
  const grupos = lista.map(() => []);
  for (const r of actual) {
    const i = indice(r.fecha);
    if (i >= 0) grupos[i].push(r);
  }
  const porCubeta = grupos.map(agregarResultados);
  const tendencia = { id: 'tendencia_rendimiento', nombre: 'Rendimiento y rechazo', formato: 'porcentaje', dinero: false,
    grano: rango.grano, series: [
      { id: 'cumplimiento', nombre: 'Rendimiento', tono: 'total' },
      { id: 'rechazo', nombre: 'Rechazo', tono: 'uno' },
    ],
    puntos: lista.map((c, i) => ({ desde: c.desde, hasta: c.hasta,
      valores: { cumplimiento: porCubeta[i].cumplimiento, rechazo: porCubeta[i].rechazo } })),
    meta: null };

  const indicadores = [
    crearIndicador({ id: 'cumplimiento_rendimiento', nombre: 'Rendimiento', valor: a.cumplimiento, anterior: b.cumplimiento,
      formato: 'porcentaje', sentido: 'subir', meta: metas.rendimientoMinimo, tolerancia: toleranciaDe('rendimientoMinimo'),
      base: `${plural(a.conEsperado, 'resultado medido', 'resultados medidos')} de recetas con rendimiento conocido`,
      definicion: 'Para cada resultado registrado: vendibles ÷ lo que la receta dice que sale. Luego se promedia, pesando cada resultado por su costo de materia prima (si alguno no tiene costo, todos pesan igual). Así no se suman unidades, gramos y paquetes entre sí. Solo cuentan las recetas que declaran su rendimiento.',
      chispa: porCubeta.map((x) => x.cumplimiento) }),
    crearIndicador({ id: 'rechazo', nombre: 'Rechazo', valor: a.rechazo, anterior: b.rechazo, formato: 'porcentaje', sentido: 'bajar',
      meta: metas.rechazoMaximo, tolerancia: toleranciaDe('rechazoMaximo'),
      base: plural(a.medidos, 'resultado medido', 'resultados medidos'),
      definicion: 'Para cada resultado registrado: rechazadas ÷ obtenidas (vendibles + rechazadas), en su propia medida. Luego se promedia, pesando cada resultado por su costo de materia prima (si alguno no tiene costo, todos pesan igual). Así no se suman unidades, gramos y paquetes entre sí.',
      chispa: porCubeta.map((x) => x.rechazo) }),
    crearIndicador({ id: 'merma_kg', nombre: 'Merma medida', valor: a.mermaKg, anterior: b.mermaKg, formato: 'kg', sentido: 'bajar',
      base: `${plural(a.conMerma, 'resultado', 'resultados')} con merma pesada`,
      definicion: 'Suma de lo que se pesó como pérdida en preparación y en cocción, en kilos. Solo cuentan los resultados donde se pesó la merma.' }),
    crearIndicador({ id: 'costo_unidad_real', nombre: 'Costo real por unidad', valor: a.costoReal, anterior: a.costoPrevisto,
      formato: 'pesos', sentido: 'bajar', dinero: true, comparadoCon: 'el costo previsto por la receta',
      base: a.costoPrevisto === null ? null
        : `Por ${a.unidadCosto}, en ${plural(a.comparables, 'resultado', 'resultados')}. Previsto por la receta: ${pesos(a.costoPrevisto)}`,
      definicion: 'Costo de materia prima de lo medido ÷ vendibles, en una sola medida (UND si la hay; si no, la de más costo). Se compara con el costo previsto (mismo costo ÷ unidades que la receta dice que salen): la variación es cuánto encarece cada unidad lo que no salió.' }),
    crearIndicador({ id: 'costo_rechazo', nombre: 'Costo de lo rechazado', valor: a.costoRechazo, anterior: b.costoRechazo,
      formato: 'pesos', sentido: 'bajar', dinero: true,
      definicion: 'Para cada resultado: unidades rechazadas × (costo de la receta ÷ unidades obtenidas). Es la materia prima que se fue en lo que no se vende.' }),
    crearIndicador({ id: 'medidas', nombre: 'Producciones medidas', valor: porcentaje(a.medidos, producciones.length),
      anterior: porcentaje(b.medidos, produccionesPrevias.length), formato: 'porcentaje', sentido: 'subir',
      base: `${cifraCorta(a.medidos)} de ${plural(producciones.length, 'confirmación', 'confirmaciones')} medidas`,
      definicion: 'Recetas confirmadas en el periodo que tienen su resultado registrado (vendibles y rechazadas) ÷ recetas confirmadas.' }),
  ];

  const porRecetaMapa = new Map();
  // Por receta Y medida: una receta sin rendimiento escrito puede medirse un dia
  // en UND y otro en GR, y sus cantidades no se suman.
  for (const r of actual) {
    const k = `${r.recetaId}|${r.unidad}`;
    if (!porRecetaMapa.has(k)) porRecetaMapa.set(k, { recetaId: r.recetaId, receta: r.receta, area: r.area, unidad: r.unidad, filas: [] });
    porRecetaMapa.get(k).filas.push(r);
  }
  const porReceta = [...porRecetaMapa.values()].map((g) => {
    const x = agregarResultados(g.filas);
    return { recetaId: g.recetaId, receta: g.receta, area: g.area, unidad: g.unidad, obtenido: x.obtenido, vendible: x.vendible, rechazado: x.rechazado,
      rechazoPct: x.rechazo, cumplimientoPct: x.cumplimiento, costoReal: x.costoReal, costoPrevisto: x.costoPrevisto };
  }).sort((p, q) => (q.rechazoPct ?? -1) - (p.rechazoPct ?? -1) || q.obtenido - p.obtenido || p.receta.localeCompare(q.receta, 'es'));

  const porArea = areasDe(hechos.producciones).map((area) => {
    const x = agregarResultados(actual.filter((r) => r.area === area));
    return { area, rechazoPct: x.rechazo, cumplimientoPct: x.cumplimiento, medidas: x.medidos,
      producciones: producciones.filter((p) => p.area === area).length };
  });

  return { indicadores: hechos.producciones.length ? indicadores : vaciarIndicadores(indicadores), tendencia, porReceta, porArea };
}
