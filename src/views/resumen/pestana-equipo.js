/**
 * =============================================================================
 *  RESUMEN · PESTAÑA «EQUIPO»
 * =============================================================================
 *
 *  Quién produjo qué, cuánto tarda cada área en preparar y cómo van las notas
 *  del equipo. Recibe `panel.equipo` ya calculado por el núcleo.
 *
 *  BARRAS APILADAS HORIZONTALES POR PERSONA. La pregunta es doble: cuánto sacó
 *  cada quien (largo de la barra) y en qué área (tramos). Horizontal porque los
 *  nombres son largos y se leen enteros a la izquierda; cada tramo lleva el
 *  color de su área, la leyenda lo nombra y la cifra por área queda escrita en
 *  la tabla y en el nombre accesible de la fila: nunca solo color.
 *
 *  El kit de gráficas no tiene barras apiladas por categoría (sus columnas son
 *  por periodo), así que esta pieza se dibuja aquí con HTML y CSS.
 */

import { el } from '../../lib/dom.js';
import { CATEGORIES } from '../../core/schema.js';
import { formatear, tonoDeArea } from '../graficas/comun.js';
import { graficaBarras } from '../graficas/barras.js';
import { tablaDeDatos } from '../graficas/tabla.js';
import { bloque, bloqueVacio, contenedorPestana, comoLista, esNumero, nombreArea, legible } from './pestana-produccion.js';

const MAXIMO_PERSONAS = 12;

function leyendaAreas() {
  return el('ul', { class: 'analisis__leyenda', attrs: { 'aria-label': 'Colores por área' } }, CATEGORIES.map((area) =>
    el('li', { class: 'analisis__leyenda-item', dataset: { area: tonoDeArea(area) } }, [
      el('span', { class: 'analisis__punto', attrs: { 'aria-hidden': 'true' } }),
      nombreArea(area),
    ])));
}

function bloquePersonas(seccion, verCostos) {
  const personas = comoLista(seccion.personas).filter((p) => p.tandas > 0 || p.recetas > 0);
  if (!personas.length) {
    return bloque({ id: 'eq-personas', titulo: 'Producción por persona', ancho: true }, [
      bloqueVacio('Nadie ha confirmado producción en este periodo.', 'Cada receta confirmada en Producción queda a nombre de quien la marca lista.'),
    ]);
  }
  const visibles = personas.slice(0, MAXIMO_PERSONAS);
  const techo = Math.max(...visibles.map((p) => p.tandas || 0), 0) || 1;
  const conCosto = verCostos && personas.some((p) => esNumero(p.costo));
  return bloque({ id: 'eq-personas', titulo: 'Producción por persona', nota: 'Tandas confirmadas en el periodo, repartidas por área.', ancho: true }, [
    leyendaAreas(),
    el('ul', { class: 'analisis__apiladas' }, visibles.map((p) => {
      const porArea = p.porArea || {};
      const tramos = CATEGORIES.filter((a) => porArea[a] > 0);
      const desglose = tramos.map((a) => `${nombreArea(a)} ${formatear(porArea[a], 'tandas')}`).join(', ');
      return el('li', { class: 'analisis__apilada' }, [
        el('div', { class: 'analisis__avance-cabeza' }, [
          el('span', { class: 'analisis__avance-nombre', text: p.nombre || 'Sin nombre' }),
          el('span', {
            class: 'analisis__avance-cifra',
            text: `${formatear(p.tandas || 0, 'tandas')} · ${p.recetas || 0} ${p.recetas === 1 ? 'receta' : 'recetas'}`,
          }),
        ]),
        el('div', { class: 'analisis__pista analisis__pista--apilada', attrs: { role: 'img', 'aria-label': desglose ? `${p.nombre}: ${desglose}` : `${p.nombre}: sin tandas` } },
          tramos.map((a) => el('span', {
            class: 'analisis__tramo',
            dataset: { area: tonoDeArea(a) },
            style: { width: `${(porArea[a] / techo) * 100}%` },
          }))),
      ]);
    })),
    personas.length > visibles.length
      ? el('p', { class: 'analisis__nota', text: `Se muestran las ${visibles.length} personas con más tandas; la tabla tiene a las ${personas.length}.` })
      : null,
    tablaDeDatos({
      titulo: 'Producción por persona',
      columnas: [
        { id: 'nombre', nombre: 'Persona' },
        { id: 'recetas', nombre: 'Recetas', formato: 'numero' },
        { id: 'tandas', nombre: 'Tandas', formato: 'tandas' },
        ...CATEGORIES.map((a) => ({ id: tonoDeArea(a), nombre: nombreArea(a), formato: 'tandas' })),
        conCosto ? { id: 'costo', nombre: 'Costo', formato: 'pesos' } : null,
      ].filter(Boolean),
      filas: personas.map((p) => ({
        nombre: legible(p.nombre, 'Sin nombre'),
        recetas: p.recetas ?? 0,
        tandas: p.tandas ?? 0,
        ...Object.fromEntries(CATEGORIES.map((a) => [tonoDeArea(a), p.porArea?.[a] ?? 0])),
        ...(conCosto ? { costo: p.costo ?? null } : {}),
      })),
    }),
  ]);
}

/**
 * Tiempo de preparación: la MEDIANA, no el promedio, porque una receta que se
 * dejó empezada toda la tarde estira el promedio y no dice cuánto se tarda de
 * verdad. Al lado, cuántas mediciones la sostienen.
 */
function bloqueTiempos(seccion) {
  const tiempos = comoLista(seccion.tiempos).filter((t) => t.n > 0 && esNumero(t.mediana));
  const contenido = tiempos.length
    ? graficaBarras({
      titulo: 'Mediana del tiempo de preparación por área',
      filas: tiempos.map((t) => ({
        id: `tiempo-${tonoDeArea(t.area)}`,
        nombre: nombreArea(t.area),
        valor: t.mediana,
        formato: 'minutos',
        detalle: `${t.n} ${t.n === 1 ? 'medición' : 'mediciones'}${esNumero(t.promedio) ? ` · promedio ${formatear(t.promedio, 'minutos')}` : ''}`,
        tono: tonoDeArea(t.area),
        dinero: false,
      })),
      formato: 'minutos',
      maximoFilas: 3,
      nombreColumna: 'Área',
    })
    : bloqueVacio('Sin tiempos de preparación en este periodo.', 'Pulsa «Empezar a producir» al comenzar una receta y «Marcar lista» al terminar: el tiempo entre los dos se mide solo.');
  return bloque({ id: 'eq-tiempos', titulo: 'Tiempo de preparación', nota: 'Desde «Empezar» hasta «Marcar lista». Mediana: la mitad tarda menos.' }, [contenido]);
}

const TIPOS = Object.freeze([
  ['tarea', 'Tareas'],
  ['pendiente', 'Pendientes'],
  ['recomendacion', 'Recomendaciones'],
  ['felicitacion', 'Felicitaciones'],
]);

function bloqueNotas(seccion) {
  const notas = seccion.notas || {};
  const porTipo = notas.porTipo || {};
  const total = TIPOS.reduce((s, [clave]) => s + (porTipo[clave] || 0), 0);
  if (!total && !notas.abiertas && !notas.hechas) {
    return bloque({ id: 'eq-notas', titulo: 'Notas del equipo' }, [
      bloqueVacio('Sin notas en este periodo.', 'Deja tareas, pendientes, recomendaciones o felicitaciones desde el día en Producción.'),
    ]);
  }
  const cifra = (etiqueta, valor, tono) => el('div', { class: 'analisis__dato', dataset: tono ? { tono } : {} }, [
    el('dt', { text: etiqueta }),
    el('dd', { text: formatear(valor || 0, 'numero') }),
  ]);
  return bloque({ id: 'eq-notas', titulo: 'Notas del equipo', nota: 'Abiertas: tareas y pendientes sin marcar hechos.' }, [
    el('dl', { class: 'analisis__datos' }, [
      cifra('Abiertas', notas.abiertas, notas.abiertas > 0 ? 'atencion' : null),
      cifra('Hechas', notas.hechas),
    ]),
    el('dl', { class: 'analisis__datos analisis__datos--suaves', attrs: { 'aria-label': 'Notas por tipo' } },
      TIPOS.map(([clave, nombre]) => cifra(nombre, porTipo[clave], clave === 'felicitacion' && porTipo[clave] > 0 ? 'bien' : null))),
  ]);
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.seccion `panel.equipo`
 * @param {boolean} opciones.verCostos
 * @param {Object} opciones.rango `panel.rango`
 * @returns {HTMLElement}
 */
export function renderPestanaEquipo({ seccion, verCostos = false, rango } = {}) {
  const s = seccion || {};
  return contenedorPestana('equipo', { indicadores: s.indicadores, rango, etiqueta: 'Indicadores del equipo' }, [
    bloquePersonas(s, verCostos),
    bloqueTiempos(s),
    bloqueNotas(s),
  ]);
}
