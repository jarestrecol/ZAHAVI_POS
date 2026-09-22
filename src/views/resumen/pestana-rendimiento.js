/**
 * =============================================================================
 *  RESUMEN · PESTAÑA «RENDIMIENTO Y MERMA»
 * =============================================================================
 *
 *  Cuánto salió de lo que se esperaba, cuánto se rechazó y qué recetas pierden
 *  más. Recibe `panel.rendimiento` ya calculado por el núcleo.
 *
 *  DOS GRÁFICAS Y NO UNA CON DOS EJES. El cumplimiento ronda el 95 % y el
 *  rechazo el 5 %: en una sola escala el rechazo queda aplastado contra el
 *  suelo, y con dos escalas la gráfica inventa una relación que no existe
 *  (guía de visualización, «dual-axis»). Cada una lleva su meta.
 *
 *  POCAS MEDICIONES, DICHO EN VOZ ALTA. Estas cifras solo cuentan las
 *  confirmaciones con resultado registrado. Si son pocas, un aviso lo dice con
 *  el número exacto antes que cualquier gráfica: un 0 % de rechazo sobre dos
 *  mediciones no es lo mismo que sobre doscientas.
 */

import { el } from '../../lib/dom.js';
import { formatear, tonoDeArea } from '../graficas/comun.js';
import { graficaLineas } from '../graficas/lineas.js';
import { graficaBarras } from '../graficas/barras.js';
import { tablaDeDatos } from '../graficas/tabla.js';
import {
  bloque, bloqueVacio, contenedorPestana, comoLista, esNumero, serieConDatos, nombreArea, nombreReceta, porcentaje,
} from './pestana-produccion.js';

const REGISTRA = 'Registra el resultado real (vendibles y rechazados) al confirmar cada receta en Producción.';

/** Por debajo de esta proporción de confirmaciones medidas se avisa. */
const MEDIDAS_SUFICIENTES = 60;

/** Totales de medición a partir de las áreas: «6 de 25». */
function medicion(seccion) {
  const areas = comoLista(seccion.porArea);
  const medidas = areas.reduce((s, a) => s + (a.medidas || 0), 0);
  const producciones = areas.reduce((s, a) => s + (a.producciones || 0), 0);
  const indicador = comoLista(seccion.indicadores).find((i) => i.id === 'medidas');
  const pct = esNumero(indicador?.valor) ? indicador.valor : producciones > 0 ? (medidas / producciones) * 100 : null;
  return { medidas, producciones, pct };
}

function avisoMedicion({ medidas, producciones, pct }) {
  if (!(producciones > 0) || !esNumero(pct) || pct >= MEDIDAS_SUFICIENTES) return null;
  const frase = medidas === 0
    ? `Ninguna de las ${producciones} confirmaciones del periodo tiene resultado registrado.`
    : `Solo ${medidas} de ${producciones} ${producciones === 1 ? 'confirmación tiene' : 'confirmaciones tienen'} resultado registrado.`;
  return el('div', { class: 'analisis__aviso', attrs: { role: 'note' }, dataset: { bloque: 'rend-aviso' } }, [
    el('p', { class: 'analisis__aviso-titulo', text: frase }),
    el('p', { class: 'analisis__aviso-texto', text: `Estas cifras se basan en pocas mediciones. ${REGISTRA}` }),
  ]);
}

/**
 * Parte la tendencia en una serie por gráfica, conservando la forma `Serie`.
 * La meta de cada una sale de su indicador, que es donde el núcleo la pone.
 */
function serieSola(tendencia, serie, meta) {
  return {
    ...tendencia,
    id: `${tendencia.id}-${serie.id}`,
    nombre: serie.nombre,
    series: [{ ...serie, tono: 'total' }],
    puntos: comoLista(tendencia.puntos).map((p) => ({ desde: p.desde, hasta: p.hasta, valores: { [serie.id]: p.valores?.[serie.id] ?? null } })),
    meta: esNumero(meta) ? { valor: meta, nombre: 'Meta' } : null,
  };
}

function bloquesTendencia(seccion) {
  const tendencia = seccion.tendencia;
  const series = comoLista(tendencia?.series);
  const indicadores = comoLista(seccion.indicadores);
  const metaDe = (id) => indicadores.find((i) => i.id === id)?.meta ?? null;
  const buscar = (patron) => series.find((s) => patron.test(`${s.id} ${s.nombre}`));
  const piezas = [
    { serie: buscar(/cumplimiento|rendimiento/i), id: 'rend-cumplimiento', titulo: 'Cumplimiento del rendimiento', nota: 'Vendibles sobre lo esperado, en %. Más alto es mejor.', meta: metaDe('cumplimiento_rendimiento') },
    { serie: buscar(/rechazo/i), id: 'rend-rechazo', titulo: 'Rechazo', nota: 'Rechazado sobre lo obtenido, en %. Más bajo es mejor.', meta: metaDe('rechazo') },
  ];
  return piezas.map(({ serie, id, titulo, nota, meta }) => {
    const sola = serie ? serieSola(tendencia, serie, meta) : null;
    const contenido = sola && serieConDatos(sola)
      ? graficaLineas({ titulo: `${titulo} por ${tendencia.grano === 'mes' ? 'mes' : tendencia.grano === 'semana' ? 'semana' : 'día'}`, serie: sola })
      : bloqueVacio('Sin resultados registrados en este periodo.', REGISTRA);
    // A todo el ancho: el kit dibuja en un lienzo fijo que se encoge con su
    // caja, y en un tercio de pantalla los rótulos quedarían ilegibles.
    return bloque({ id, titulo, nota, ancho: true }, [contenido]);
  });
}

function bloqueRanking(seccion) {
  const conRechazo = comoLista(seccion.porReceta)
    .filter((r) => r.rechazado > 0 && esNumero(r.rechazoPct))
    .sort((a, b) => b.rechazoPct - a.rechazoPct || b.rechazado - a.rechazado);
  const medidas = comoLista(seccion.porReceta).length;
  const contenido = conRechazo.length
    ? graficaBarras({
      titulo: 'Rechazo por receta',
      filas: conRechazo.map((r) => ({
        id: `${r.recetaId}|${r.unidad || ''}`,
        nombre: nombreReceta(r.receta),
        valor: r.rechazoPct,
        formato: 'porcentaje',
        detalle: `${formatear(r.rechazado, 'numero')} de ${formatear(r.obtenido, 'numero')} · ${nombreArea(r.area)}`,
        tono: tonoDeArea(r.area),
        dinero: false,
      })),
      formato: 'porcentaje',
      maximoFilas: 10,
      nombreColumna: 'Receta',
    })
    : medidas
      ? bloqueVacio('Ninguna receta medida tuvo rechazo en este periodo.')
      : bloqueVacio('Sin resultados registrados en este periodo.', REGISTRA);
  return bloque({ id: 'rend-ranking', titulo: 'Recetas con más rechazo', nota: 'Porcentaje rechazado; al lado, cuántas de cuántas.' }, [contenido]);
}

/** Tres áreas y tres cifras: una tabla visible se lee mejor que una gráfica. */
function bloqueAreas(seccion) {
  const areas = comoLista(seccion.porArea);
  if (!areas.some((a) => a.producciones > 0)) {
    return bloque({ id: 'rend-areas', titulo: 'Por área' }, [bloqueVacio('Sin producción confirmada en este periodo.', 'Confirma recetas en Producción y registra su resultado.')]);
  }
  return bloque({ id: 'rend-areas', titulo: 'Por área' }, [
    el('div', { class: 'analisis__tabla-marco' }, [
      el('table', { class: 'analisis__tabla' }, [
        el('caption', { class: 'sr-only', text: 'Rendimiento y rechazo por área' }),
        el('thead', {}, [el('tr', {}, [
          el('th', { attrs: { scope: 'col' }, text: 'Área' }),
          el('th', { class: 'analisis__num', attrs: { scope: 'col' }, text: 'Cumplimiento' }),
          el('th', { class: 'analisis__num', attrs: { scope: 'col' }, text: 'Rechazo' }),
          el('th', { class: 'analisis__num', attrs: { scope: 'col' }, text: 'Medidas' }),
        ])]),
        el('tbody', {}, areas.map((a) => el('tr', { dataset: { area: tonoDeArea(a.area) } }, [
          el('th', { attrs: { scope: 'row' } }, [el('span', { class: 'analisis__punto', attrs: { 'aria-hidden': 'true' } }), nombreArea(a.area)]),
          el('td', { class: 'analisis__num', text: porcentaje(a.cumplimientoPct) }),
          el('td', { class: 'analisis__num', text: porcentaje(a.rechazoPct) }),
          el('td', { class: 'analisis__num', text: a.producciones > 0 ? `${a.medidas || 0} de ${a.producciones}` : '—' }),
        ]))),
      ]),
    ]),
  ]);
}

function bloqueTabla(seccion, verCostos) {
  const recetas = comoLista(seccion.porReceta);
  if (!recetas.length) return null;
  const conReal = verCostos && recetas.some((r) => esNumero(r.costoReal));
  const conPrevisto = verCostos && recetas.some((r) => esNumero(r.costoPrevisto));
  const columnas = [
    { id: 'receta', nombre: 'Receta' },
    { id: 'area', nombre: 'Área' },
    { id: 'obtenido', nombre: 'Obtenido', formato: 'numero' },
    { id: 'vendible', nombre: 'Vendible', formato: 'numero' },
    { id: 'rechazado', nombre: 'Rechazado', formato: 'numero' },
    { id: 'rechazoPct', nombre: 'Rechazo', formato: 'porcentaje' },
    { id: 'cumplimientoPct', nombre: 'Cumplimiento', formato: 'porcentaje' },
    conReal ? { id: 'costoReal', nombre: 'Costo real por unidad', formato: 'pesos' } : null,
    conPrevisto ? { id: 'costoPrevisto', nombre: 'Costo previsto por unidad', formato: 'pesos' } : null,
  ].filter(Boolean);
  const filas = recetas.map((r) => ({
    receta: nombreReceta(r.receta),
    area: nombreArea(r.area),
    obtenido: r.obtenido ?? null,
    vendible: r.vendible ?? null,
    rechazado: r.rechazado ?? null,
    rechazoPct: r.rechazoPct ?? null,
    cumplimientoPct: r.cumplimientoPct ?? null,
    ...(conReal ? { costoReal: r.costoReal ?? null } : {}),
    ...(conPrevisto ? { costoPrevisto: r.costoPrevisto ?? null } : {}),
  }));
  return bloque({ id: 'rend-tabla', titulo: 'Resultado por receta', nota: 'Solo recetas con resultado registrado.', ancho: true }, [
    tablaDeDatos({ titulo: `${recetas.length} ${recetas.length === 1 ? 'receta medida' : 'recetas medidas'}`, columnas, filas }),
  ]);
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.seccion `panel.rendimiento`
 * @param {boolean} opciones.verCostos
 * @param {Object} opciones.rango `panel.rango`
 * @returns {HTMLElement}
 */
export function renderPestanaRendimiento({ seccion, verCostos = false, rango } = {}) {
  const s = seccion || {};
  const m = medicion(s);
  const raiz = contenedorPestana('rendimiento', { indicadores: s.indicadores, rango, etiqueta: 'Indicadores de rendimiento y merma' }, [
    ...bloquesTendencia(s),
    bloqueRanking(s),
    bloqueAreas(s),
    bloqueTabla(s, verCostos),
  ]);
  // El aviso va antes que las cifras: se lee primero lo que las relativiza.
  const aviso = avisoMedicion(m);
  if (aviso) raiz.prepend(aviso);
  return raiz;
}
