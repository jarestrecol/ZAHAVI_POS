/**
 * =============================================================================
 *  RESUMEN · PESTAÑA «PRODUCCIÓN»
 * =============================================================================
 *
 *  Qué se produjo en el periodo, cuánto costó, cuándo y qué recetas pesan más.
 *  Recibe `panel.produccion` ya calculado por el núcleo (core/bi/produccion.js):
 *  aquí no se suma ni se recalcula nada, solo se elige la forma de mostrarlo.
 *
 *  SIN DINERO NO HAY HUECOS. Para el jefe de obrador el núcleo ya quitó el
 *  gasto, los costos y la serie de pesos (`sinDinero`). Esta vista no pinta un
 *  recuadro «oculto»: cambia la gráfica de gasto por la de tandas y deja fuera
 *  las columnas de costo. Por eso las decisiones miran si el dato LLEGÓ, no el
 *  rol: nunca se pinta dinero que no vino, aunque `verCostos` dijera que sí.
 *
 *  SIN DATOS NO ES CERO. Un bloque sin datos dice qué hacer para tenerlos, en
 *  vez de dibujar una línea plana que se leería como «no se gastó nada».
 *
 *  Las piezas comunes de las cuatro pestañas (bloque con título, vacío que dice
 *  qué hacer, rejilla y «frente a…») viven aquí y las importan las otras tres:
 *  así un cambio de criterio se hace una sola vez.
 *
 *  Clases con prefijo `analisis` (assets/css/resumen-analisis.css).
 */

import { el } from '../../lib/dom.js';
import { nombreLegible } from '../../core/bi/periodos.js';
import { formatear, tonoDeArea } from '../graficas/comun.js';
import { graficaLineas } from '../graficas/lineas.js';
import { graficaColumnas } from '../graficas/columnas.js';
import { graficaBarras } from '../graficas/barras.js';
import { mapaDeCalor } from '../graficas/calor.js';
import { tablaDeDatos } from '../graficas/tabla.js';
import { filaIndicadores } from './kpi.js';

/* ------------------------------------------------------------------------- */
/*  Piezas comunes de las cuatro pestañas                                     */
/* ------------------------------------------------------------------------- */

/** Con qué se compara cada periodo, en la voz de una tarjeta KPI. */
const ANTERIOR = Object.freeze({
  '7d': 'los 7 días anteriores',
  '30d': 'los 30 días anteriores',
  mes: 'el mismo tramo del mes anterior',
  '12s': 'las 12 semanas anteriores',
  '12m': 'los 12 meses anteriores',
});

/** «frente a …» para la variación de las tarjetas. */
export function textoComparadoCon(rango) {
  return ANTERIOR[rango?.clave] || 'el periodo anterior';
}

/** Lista segura: el núcleo puede quitar campos enteros (dinero) o no traerlos. */
export const comoLista = (valor) => (Array.isArray(valor) ? valor : []);

/** Número real y finito; todo lo demás es «sin dato». */
export const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * ¿La serie trae algo que dibujar? Todo en cero o en null es «sin datos»: una
 * línea plana inventada se leería como «no se gastó nada».
 */
export function serieConDatos(serie) {
  if (!serie || !Array.isArray(serie.puntos) || !serie.puntos.length) return false;
  return serie.puntos.some((p) => Object.values(p?.valores || {}).some((v) => esNumero(v) && v !== 0));
}

/**
 * Mensaje de vacío que dice qué falta y qué hacer para tenerlo.
 *
 * @param {string} texto lo que no hay
 * @param {string} [accion] qué hacer para que lo haya
 */
export function bloqueVacio(texto, accion) {
  return el('div', { class: 'analisis__vacio', attrs: { role: 'note' } }, [
    el('p', { class: 'analisis__vacio-texto', text: texto }),
    accion ? el('p', { class: 'analisis__vacio-accion', text: accion }) : null,
  ]);
}

/**
 * Un bloque de la pestaña: título corto, frase opcional que lo explica y el
 * contenido (una figura del kit, una tabla o un vacío).
 *
 * @param {Object} opciones
 * @param {string} opciones.id identificador estable (data-bloque), para pruebas y foco
 * @param {string} opciones.titulo
 * @param {string} [opciones.nota] una línea que explica cómo leerlo
 * @param {boolean} [opciones.ancho] ocupa toda la fila de la rejilla
 * @param {Array<Node|null>} contenido
 */
export function bloque({ id, titulo, nota = null, ancho = false }, contenido) {
  const idTitulo = `analisis-${id}`;
  return el('section', {
    class: ancho ? 'analisis__bloque analisis__bloque--ancho' : 'analisis__bloque',
    dataset: { bloque: id },
    attrs: { 'aria-labelledby': idTitulo },
  }, [
    el('h3', { class: 'analisis__titulo', attrs: { id: idTitulo }, text: titulo }),
    nota ? el('p', { class: 'analisis__nota', text: nota }) : null,
    ...contenido,
  ]);
}

/**
 * Raíz de una pestaña: la fila de indicadores arriba y la rejilla de bloques.
 * La rejilla es de una columna en el celular, dos en tableta y tres en
 * escritorio; los bloques de tendencia ocupan la fila entera.
 */
export function contenedorPestana(nombre, { indicadores, rango, etiqueta }, bloques) {
  const presentes = bloques.filter(Boolean);
  marcarFilas(presentes);
  return el('div', { class: 'analisis', dataset: { pestana: nombre } }, [
    filaIndicadores(comoLista(indicadores), { etiqueta, comparadoCon: textoComparadoCon(rango) }),
    el('div', { class: 'analisis__rejilla' }, presentes),
  ]);
}

/**
 * SIN HUECOS EN LA REJILLA. Los bloques estrechos van de a dos (tableta) o de
 * a tres (escritorio) entre los anchos. Cuando una tanda no llena su última
 * fila —porque el núcleo quitó los bloques de dinero al jefe de obrador, o
 * porque un bloque no vino—, quedaba una tarjeta sola con dos tercios de
 * blanco al lado. Aquí se marca cómo cierra cada tanda y la hoja de estilo
 * reparte el ancho que sobra:
 *
 *   data-fila2="sola"          la última de una tanda impar, en dos columnas
 *   data-fila3="sola" | "par"  lo que sobra al repartir de a tres
 *
 * @param {Array<HTMLElement>} bloques en su orden
 */
export function marcarFilas(bloques) {
  let tanda = [];
  const cerrar = () => {
    const n = tanda.length;
    if (n % 2 === 1) tanda[n - 1].dataset.fila2 = 'sola';
    if (n % 3 === 1) tanda[n - 1].dataset.fila3 = 'sola';
    if (n % 3 === 2) { tanda[n - 2].dataset.fila3 = 'par'; tanda[n - 1].dataset.fila3 = 'par'; }
    tanda = [];
  };
  for (const b of bloques) {
    if (b.classList?.contains('analisis__bloque--ancho')) cerrar();
    else if (b.classList?.contains('analisis__bloque')) tanda.push(b);
  }
  cerrar();
}

/**
 * Nombre como se lee: «Biscottis de Almendra y Chocolate Chips», «Azúcar
 * (Yemas)». Los datos vienen en mayúsculas sostenidas del Excel; lo que ya
 * llega escrito a mano («Lácteos La Pradera (ejemplo)») se respeta tal cual.
 */
export function legible(nombre, siFalta = '') {
  const texto = String(nombre ?? '').trim();
  if (!texto) return siFalta;
  return /\p{Ll}/u.test(texto) ? texto : nombreLegible(texto);
}

/** Nombre de un área como se lee: «Pastelería». */
export const nombreArea = (area) => legible(area, 'Sin área');

/** Nombre de una receta (o de un ingrediente) como se lee. */
export const nombreReceta = (nombre) => legible(nombre, 'Receta sin nombre');

/** Porcentaje ya expresado en 0–100 → «12,5 %»; sin dato → «—». */
export const porcentaje = (v) => (esNumero(v) ? formatear(v, 'porcentaje') : '—');

/* ------------------------------------------------------------------------- */
/*  Pestaña de producción                                                     */
/* ------------------------------------------------------------------------- */

const IR_A_PRODUCCION = 'Confirma recetas en Producción («Sacar producción») y aquí aparecerán.';

/**
 * Tendencia del periodo.
 *
 * Con dinero, dos bloques: el gasto TOTAL en línea contra el periodo anterior
 * (la pregunta del gerente: ¿gasto más o menos que antes?) y el reparto por
 * área en columnas apiladas. Las cinco líneas juntas (total, tres áreas y el
 * anterior) se cruzaban día a día y no se leía ninguna.
 *
 * Sin dinero: las tandas por área en columnas apiladas.
 */
function bloquesTendencia(seccion, verCostos) {
  if (verCostos && seccion.gasto) {
    const series = comoLista(seccion.gasto.series);
    const total = { ...seccion.gasto, series: series.filter((s) => s.tono === 'total') };
    const hayGasto = serieConDatos(seccion.gasto) && total.series.length > 0;
    const conAreas = series.some((s) => s.tono !== 'total');
    return [
      bloque({ id: 'gasto', titulo: 'Gasto en materia prima', nota: 'Costo congelado de lo confirmado: no cambia si luego sube un precio.', ancho: true }, [
        hayGasto
          ? graficaLineas({ titulo: 'Gasto total de materia prima', serie: total, comparacion: seccion.gastoAnterior || null })
          : bloqueVacio('No hay producción confirmada en este periodo.', IR_A_PRODUCCION),
      ]),
      hayGasto && conAreas ? bloque({ id: 'gasto-areas', titulo: 'Gasto por área', nota: 'Cada columna suma lo que gastó cada área.', ancho: true }, [
        graficaColumnas({ titulo: 'Gasto de materia prima por área', serie: seccion.gasto, apiladas: true }),
      ]) : null,
    ];
  }
  const contenido = serieConDatos(seccion.tandas)
    ? graficaColumnas({ titulo: 'Tandas confirmadas por área', serie: seccion.tandas, apiladas: true })
    : bloqueVacio('No hay producción confirmada en este periodo.', IR_A_PRODUCCION);
  return [bloque({ id: 'tandas', titulo: 'Tandas por área', nota: 'Cada columna suma lo que confirmó cada área.', ancho: true }, [contenido])];
}

/** Resumen corto de un día para el mapa de calor y su tabla. */
function detalleDia(dia, conDinero) {
  const partes = [formatear(dia.tandas || 0, 'tandas')];
  if (conDinero && esNumero(dia.costo)) partes.push(formatear(dia.costo, 'pesos'));
  return partes.join(' · ');
}

/**
 * Doce semanas en un mapa de calor: semanas en columnas, lunes a domingo en
 * filas, una sola tonalidad. Es la forma de ver de un vistazo el ritmo de la
 * semana y los huecos (un día sin producción queda en blanco).
 */
function bloqueCalor(seccion, verCostos) {
  const dias = comoLista(seccion.calor);
  const conDinero = verCostos && dias.some((d) => esNumero(d.costo));
  const hay = dias.some((d) => (conDinero ? d.costo : d.tandas) > 0);
  const contenido = hay
    ? mapaDeCalor({
      titulo: conDinero ? 'Gasto por día, últimas 12 semanas' : 'Tandas por día, últimas 12 semanas',
      dias: dias.map((d) => ({ fecha: d.fecha, valor: conDinero ? (d.costo ?? 0) : (d.tandas ?? 0), detalle: detalleDia(d, conDinero) })),
      formato: conDinero ? 'pesos' : 'tandas',
    })
    : bloqueVacio('No hay producción confirmada en las últimas 12 semanas.', IR_A_PRODUCCION);
  // Junto al promedio por día de la semana: responden lo mismo (el ritmo de la
  // semana). A todo el ancho, las doce columnas dejaban dos tercios en blanco.
  return bloque({ id: 'calor', titulo: 'Ritmo de las últimas 12 semanas', nota: 'Siempre 12 semanas, sin importar el periodo elegido. Más oscuro, más producción.' }, [contenido]);
}

/**
 * Promedio por día de la semana. Barras horizontales EN EL ORDEN DE LA SEMANA
 * (no ordenadas por valor): se lee «el sábado es el día fuerte» sin tener que
 * buscar dónde quedó cada día.
 */
function bloqueSemana(seccion, verCostos) {
  const semana = comoLista(seccion.semana).slice().sort((a, b) => a.dia - b.dia);
  const conDinero = verCostos && semana.some((d) => esNumero(d.costo));
  const formato = conDinero ? 'pesos' : 'tandas';
  const hay = semana.some((d) => (conDinero ? d.costo : d.tandas) > 0);
  const contenido = hay
    ? graficaBarras({
      titulo: conDinero ? 'Gasto promedio por día de la semana' : 'Tandas promedio por día de la semana',
      filas: semana.map((d) => ({
        id: `dia-${d.dia}`,
        nombre: d.nombre,
        valor: (conDinero ? d.costo : d.tandas) ?? 0,
        formato,
        detalle: conDinero ? formatear(d.tandas || 0, 'tandas') : null,
        dinero: conDinero,
      })),
      formato,
      maximoFilas: 7,
      nombreColumna: 'Día',
    })
    : bloqueVacio('Sin producción confirmada para promediar.', IR_A_PRODUCCION);
  return bloque({ id: 'semana', titulo: 'Promedio por día de la semana', nota: 'Solo cuenta los días en que hubo producción.' }, [contenido]);
}

/**
 * Las recetas que más pesan, con su curva de Pareto. Con dinero se ordena por
 * gasto; sin dinero, por tandas (el núcleo ya las entrega así ordenadas).
 */
function bloqueRanking(seccion, verCostos) {
  const recetas = comoLista(seccion.recetas);
  const conDinero = verCostos && recetas.some((r) => esNumero(r.costo));
  const formato = conDinero ? 'pesos' : 'tandas';
  if (!recetas.length) {
    return bloque({ id: 'ranking', titulo: 'Recetas que más pesan', ancho: true }, [bloqueVacio('Aún no hay recetas confirmadas en este periodo.', IR_A_PRODUCCION)]);
  }
  // La frase «el 20 % de las recetas explica el X %» la escribe el propio kit
  // con `pareto` (graficaBarras), sobre las mismas filas: repetirla aquí sería
  // decir lo mismo dos veces. La nota nombra la medida para que «del total» se
  // lea como «del gasto» o «de las tandas».
  // A todo el ancho: en un tercio de pantalla cada nombre ocupaba tres o
  // cuatro líneas y la tarjeta medía el doble que sus vecinas.
  return bloque({ id: 'ranking', titulo: 'Recetas que más pesan', nota: conDinero ? 'Ordenadas por gasto en materia prima.' : 'Ordenadas por tandas confirmadas.', ancho: true }, [
    graficaBarras({
      titulo: conDinero ? 'Gasto por receta' : 'Tandas por receta',
      filas: recetas.map((r) => ({
        id: r.recetaId,
        nombre: nombreReceta(r.receta),
        valor: (conDinero ? r.costo : r.tandas) ?? 0,
        formato,
        detalle: nombreArea(r.area),
        tono: tonoDeArea(r.area),
        dinero: conDinero,
      })),
      formato,
      maximoFilas: 8,
      pareto: true,
      nombreColumna: 'Receta',
    }),
  ]);
}

/**
 * Plan contra lo real por área: una barra de avance por área con la cifra
 * escrita («12 de 14 tandas»). Tres filas no piden una gráfica con ejes.
 */
function bloquePlanVsReal(seccion, meta) {
  const areas = comoLista(seccion.planVsReal);
  const conPlan = areas.filter((a) => a.planeadas > 0);
  if (!conPlan.length) {
    return bloque({ id: 'plan', titulo: 'Plan contra lo confirmado' }, [
      bloqueVacio('No hubo producción planeada hasta hoy en este periodo.', 'Programa recetas en el calendario de Producción para comparar el plan con lo confirmado.'),
    ]);
  }
  return bloque({
    id: 'plan',
    titulo: 'Plan contra lo confirmado',
    nota: esNumero(meta) ? `Tandas confirmadas de las planeadas hasta hoy. Meta: al menos ${formatear(meta, 'porcentaje')}.` : 'Tandas confirmadas de las planeadas hasta hoy.',
  }, [
    el('ul', { class: 'analisis__avances' }, areas.map((a) => {
      const pct = a.planeadas > 0 && esNumero(a.cumplimiento) ? a.cumplimiento : null;
      const bajo = esNumero(meta) && esNumero(pct) && pct < meta;
      return el('li', { class: 'analisis__avance', dataset: { area: tonoDeArea(a.area) } }, [
        el('div', { class: 'analisis__avance-cabeza' }, [
          el('span', { class: 'analisis__avance-nombre', text: nombreArea(a.area) }),
          el('span', {
            class: 'analisis__avance-cifra',
            text: a.planeadas > 0
              ? `${formatear(a.confirmadas || 0, 'numero')} de ${formatear(a.planeadas, 'tandas')} · ${porcentaje(pct)}`
              : 'Sin plan',
          }),
        ]),
        a.planeadas > 0 ? el('div', { class: 'analisis__pista', attrs: { 'aria-hidden': 'true' } }, [
          el('span', { class: 'analisis__relleno', style: { width: `${Math.min(100, Math.max(0, pct ?? 0))}%` } }),
          esNumero(meta) ? el('span', { class: 'analisis__marca-meta', style: { left: `${Math.min(100, Math.max(0, meta))}%` } }) : null,
        ]) : null,
        bajo ? el('p', { class: 'analisis__avance-aviso', text: 'Por debajo de la meta' }) : null,
      ]);
    })),
  ]);
}

/** Tabla completa de recetas; las columnas de dinero solo si el dato llegó. */
function bloqueTabla(seccion, verCostos) {
  const recetas = comoLista(seccion.recetas);
  if (!recetas.length) return null;
  const conCosto = verCostos && recetas.some((r) => esNumero(r.costo));
  const conCostoUnidad = verCostos && recetas.some((r) => esNumero(r.costoUnidad));
  const columnas = [
    { id: 'receta', nombre: 'Receta' },
    { id: 'area', nombre: 'Área' },
    { id: 'tandas', nombre: 'Tandas', formato: 'tandas' },
    { id: 'unidades', nombre: 'Unidades', formato: 'unidades' },
    conCosto ? { id: 'costo', nombre: 'Costo', formato: 'pesos' } : null,
    conCostoUnidad ? { id: 'costoUnidad', nombre: 'Costo por unidad', formato: 'pesos' } : null,
  ].filter(Boolean);
  const filas = recetas.map((r) => ({
    receta: nombreReceta(r.receta),
    area: nombreArea(r.area),
    tandas: r.tandas ?? null,
    unidades: r.unidades ?? null,
    ...(conCosto ? { costo: r.costo ?? null } : {}),
    ...(conCostoUnidad ? { costoUnidad: r.costoUnidad ?? null } : {}),
  }));
  return bloque({ id: 'tabla', titulo: 'Todas las recetas del periodo', nota: 'Unidades solo de recetas con rendimiento conocido.', ancho: true }, [
    tablaDeDatos({ titulo: `${recetas.length} ${recetas.length === 1 ? 'receta' : 'recetas'}`, columnas, filas }),
  ]);
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.seccion `panel.produccion`
 * @param {boolean} opciones.verCostos
 * @param {Object} opciones.rango `panel.rango`
 * @returns {HTMLElement}
 */
export function renderPestanaProduccion({ seccion, verCostos = false, rango } = {}) {
  const s = seccion || {};
  const metaPlan = comoLista(s.indicadores).find((i) => i.id === 'cumplimiento_plan')?.meta ?? null;
  return contenedorPestana('produccion', { indicadores: s.indicadores, rango, etiqueta: 'Indicadores de producción' }, [
    ...bloquesTendencia(s, verCostos),
    bloqueRanking(s, verCostos),
    // El ritmo de la semana en pareja (promedio y mapa de calor); el plan
    // contra lo real, tres barras, completa la fila en escritorio.
    bloqueSemana(s, verCostos),
    bloqueCalor(s, verCostos),
    bloquePlanVsReal(s, metaPlan),
    bloqueTabla(s, verCostos),
  ]);
}
