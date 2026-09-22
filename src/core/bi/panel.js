/**
 * =============================================================================
 *  PANEL DEL RESUMEN
 * =============================================================================
 *
 *  Arma el panel completo a partir de los hechos: la franja de hoy, lo que
 *  necesita atencion y las cuatro pestañas (produccion, rendimiento, bodega y
 *  equipo), mas una ficha de calidad de los datos.
 *
 *  EL DINERO SE QUITA EN UN SOLO SITIO. Sin permiso de costos, todo el panel
 *  pasa por `sinDinero()`, que retira cada indicador, serie, fila y campo de
 *  dinero. Una sola funcion para que un indicador nuevo no pueda olvidarse de
 *  ocultarse en una de varias pantallas: lo que no esta en el panel no se
 *  puede enseñar. Tambien reordena el ranking de recetas por tandas, porque el
 *  orden por costo delataria que receta cuesta mas aunque se borrara la cifra.
 *
 *  Funcion pura: recibe hechos y metas, devuelve el panel.
 */

import { ok, err } from '../storage.js';
import { rangoDe, PERIODO_POR_DEFECTO, enRango } from './periodos.js';
import { normalizarMetas } from './metas.js';
import { seccionProduccion, rankingDeRecetas } from './produccion.js';
import { seccionRendimiento } from './rendimiento.js';
import { seccionBodega } from './bodega.js';
import { seccionEquipo } from './equipo.js';
import { resumenDeHoy } from './hoy.js';
import { alertasDe } from './alertas.js';

const LISTAS_DE_HECHOS = ['producciones', 'planeado', 'pendientes', 'resultados', 'preparaciones', 'tiempos',
  'lotes', 'movimientos', 'notas', 'consumoGramos'];

/** Ficha de lo que falta en los datos para que las cifras sean completas. */
function calidadDe(hechos, rango) {
  const producciones = hechos.producciones.filter((p) => enRango(p.fecha, rango));
  const medidas = new Set(hechos.resultados.map((r) => `${r.produccionId}|${r.recetaId}`));
  const conExistencia = hechos.lotes.filter((l) => l.existencia > 0);
  return {
    produccionesMedidas: producciones.filter((p) => medidas.has(p.id)).length,
    produccionesTotales: producciones.length,
    recetasSinRendimiento: new Set(producciones.filter((p) => p.unidadesEsperadas === null).map((p) => p.recetaId)).size,
    lotesSinVencimiento: conExistencia.filter((l) => !l.vencimiento).length,
    lotesSinEquivalencia: conExistencia.filter((l) => l.gramosPorUnidad === null).length,
    comprasSinProveedor: hechos.movimientos.filter((m) => m.tipo === 'compra' && enRango(m.fecha, rango) && !m.proveedor.trim()).length,
  };
}

/**
 * Panel completo.
 *
 * @param {object} hechos salida de `hechosDeOperacion`
 * @param {{periodo?: string, metas?: object, verCostos?: boolean}} opciones
 *   (el contrato admite `ahora`; hoy nada depende de la hora, solo del dia de `hechos.hoy`)
 */
export function construirPanel(hechos, { periodo = PERIODO_POR_DEFECTO, metas, verCostos = false } = {}) {
  if (!hechos || !LISTAS_DE_HECHOS.every((k) => Array.isArray(hechos[k]))) return err('datos', 'No se pudo leer la operación para armar el resumen.');
  const r = rangoDe(periodo, hechos.hoy);
  if (!r.ok) return r;
  const rango = r.value;
  const contexto = { rango, metas: normalizarMetas(metas), verCostos: verCostos === true };
  const panel = {
    origen: hechos.origen, hoy: hechos.hoy, rango, verCostos: contexto.verCostos,
    hoyResumen: resumenDeHoy(hechos, contexto),
    atencion: alertasDe(hechos, contexto),
    produccion: seccionProduccion(hechos, contexto),
    rendimiento: seccionRendimiento(hechos, contexto),
    bodega: seccionBodega(hechos, contexto),
    equipo: seccionEquipo(hechos, contexto),
    calidad: calidadDe(hechos, rango),
  };
  return ok(contexto.verCostos ? panel : sinDinero(panel));
}

const sinCampos = (fila, campos) => {
  const copia = { ...fila };
  for (const c of campos) delete copia[c];
  return copia;
};
const sinIndicadoresDeDinero = (lista) => lista.filter((i) => !i.dinero);

/**
 * El panel sin dinero: para quien no tiene permiso de ver costos.
 *
 * No muta el panel recibido.
 */
export function sinDinero(panel) {
  const { produccion, rendimiento, bodega, equipo } = panel;
  const ranking = rankingDeRecetas(produccion.recetas.map((f) => sinCampos(f, ['costo', 'costoUnidad', 'participacion', 'acumulado', 'variacion'])), 'tandas');
  const { gasto, gastoAnterior, ...restoProduccion } = produccion;
  const { valor, comprasVsConsumo, proveedores, canasta, ...restoBodega } = bodega;
  return {
    ...panel,
    verCostos: false,
    hoyResumen: { ...panel.hoyResumen, indicadores: sinIndicadoresDeDinero(panel.hoyResumen.indicadores) },
    atencion: panel.atencion.filter((a) => a.tipo !== 'alza_precio').map((a) => ({ ...a, dinero: null })),
    produccion: {
      ...restoProduccion,
      indicadores: sinIndicadoresDeDinero(produccion.indicadores),
      calor: produccion.calor.map((d) => sinCampos(d, ['costo'])),
      semana: produccion.semana.map((d) => sinCampos(d, ['costo'])),
      recetas: ranking.recetas,
      pareto: ranking.pareto,
    },
    rendimiento: {
      ...rendimiento,
      indicadores: sinIndicadoresDeDinero(rendimiento.indicadores),
      porReceta: rendimiento.porReceta.map((f) => sinCampos(f, ['costoReal', 'costoPrevisto'])),
    },
    bodega: {
      ...restoBodega,
      indicadores: sinIndicadoresDeDinero(bodega.indicadores),
      vencimientos: bodega.vencimientos.map((v) => sinCampos(v, ['valor'])),
    },
    equipo: {
      ...equipo,
      indicadores: sinIndicadoresDeDinero(equipo.indicadores),
      personas: equipo.personas.map((p) => sinCampos(p, ['costo'])),
    },
  };
}
