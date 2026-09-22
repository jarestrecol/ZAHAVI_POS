/**
 * =============================================================================
 *  TARJETA DE INDICADOR (KPI) DEL RESUMEN
 * =============================================================================
 *
 *  Una sola pieza para todas las cifras del panel: la franja «Hoy» y las cuatro
 *  pestañas de análisis la comparten, para que «Rechazo» se lea igual en todas
 *  partes y un cambio de criterio (cómo se dice una variación, qué palabra lleva
 *  cada semáforo) se haga en un único sitio.
 *
 *  NUNCA SOLO COLOR. El estado frente a la meta lleva icono y palabra («Bien»,
 *  «Atención», «Fuera de meta»); la variación lleva flecha y texto («+12 %
 *  frente a los 30 días anteriores»). El color solo refuerza.
 *
 *  SIN DATO NO ES CERO. Un indicador con `valor: null` dice «Sin datos» en vez
 *  de pintar un 0 que el gerente leería como «no gastamos nada».
 *
 *  La tarjeta no decide si una cifra es de dinero: el núcleo ya quitó los
 *  indicadores de dinero para quien no puede verlos (`sinDinero` en
 *  core/bi/panel.js). Aquí no hay huecos ni textos «oculto».
 *
 *  Clases con prefijo `kpi` (documentado en assets/css/resumen.css).
 */

import { el, icon } from '../../lib/dom.js';
import { formatear, formatearVariacion } from '../graficas/comun.js';
import { chispa } from '../graficas/chispa.js';

/* Iconos propios del semáforo: la familia visual de iconos.js no los tiene y
   ese archivo no es de esta vista. Misma rejilla de 24 y trazo. */
export const ICONO_BIEN = ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8 12.5l2.7 2.7L16 10'];
export const ICONO_ATENCION = ['M12 3.5 2.5 20h19z', 'M12 10v4.5', 'M12 17.2v.3'];
export const ICONO_MAL = ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9 9l6 6', 'M15 9l-6 6'];

/** Palabra e icono de cada estado frente a la meta. */
export const ESTADOS_META = Object.freeze({
  bien: Object.freeze({ palabra: 'Bien', icono: ICONO_BIEN }),
  atencion: Object.freeze({ palabra: 'Atención', icono: ICONO_ATENCION }),
  mal: Object.freeze({ palabra: 'Fuera de meta', icono: ICONO_MAL }),
});

/**
 * Si una variación es buena o mala depende del indicador: que suba el gasto es
 * malo, que suba el rendimiento es bueno.
 *
 * @returns {'mejora'|'empeora'|'neutra'}
 */
function tendencia(variacion, sentido) {
  if (!Number.isFinite(variacion) || Math.abs(variacion) < 0.005 || sentido === 'neutral' || !sentido) return 'neutra';
  const sube = variacion > 0;
  return (sentido === 'subir') === sube ? 'mejora' : 'empeora';
}

const PUNTOS = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/**
 * Cómo se dice el cambio de un indicador.
 *
 * Un porcentaje se compara en PUNTOS, no en proporción: el rechazo que pasa
 * de 0,4 % a 1 % subió 0,6 puntos, y «+150 %» asustaba sin motivo. El resto
 * (pesos, tandas, días…) sigue en variación relativa.
 *
 * @returns {{ flecha: string, texto: string, cambio: number }|null}
 */
function cambioDe(indicador) {
  if (indicador.formato === 'porcentaje' && Number.isFinite(indicador.anterior) && Number.isFinite(indicador.valor)) {
    const diferencia = indicador.valor - indicador.anterior;
    const redondo = Math.round(diferencia * 10) / 10;
    if (redondo === 0) return { flecha: '→', texto: '0 pts', cambio: 0 };
    // «1 pt», no «1 pts»: la tarjeta la lee una persona, no un informe.
    const puntos = PUNTOS.format(Math.abs(redondo));
    return { flecha: redondo > 0 ? '↑' : '↓', texto: `${redondo > 0 ? '+' : '−'}${puntos} ${puntos === '1' ? 'pt' : 'pts'}`, cambio: redondo };
  }
  if (!Number.isFinite(indicador.variacion)) return null;
  const v = indicador.variacion;
  return { flecha: v > 0.0049 ? '↑' : v < -0.0049 ? '↓' : '→', texto: formatearVariacion(v), cambio: v };
}

function textoMeta(indicador) {
  if (!Number.isFinite(indicador.meta)) return null;
  const valor = formatear(indicador.meta, indicador.formato);
  if (indicador.sentido === 'subir') return `Meta: al menos ${valor}`;
  if (indicador.sentido === 'bajar') return `Meta: máximo ${valor}`;
  return `Meta: ${valor}`;
}

function chispaValida(valores) {
  return Array.isArray(valores) && valores.filter((v) => Number.isFinite(v)).length >= 2;
}

/**
 * Tarjeta de un indicador.
 *
 * @param {Object} indicador forma `Indicador` del contrato (§5)
 * @param {Object} [opciones]
 * @param {boolean} [opciones.compacta=false] versión pequeña, sin mini tendencia
 * @param {string|((indicador: Object) => string)} [opciones.comparadoCon]
 *   con qué se compara la variación: «los 30 días anteriores». Por defecto
 *   «el periodo anterior».
 * @param {number} [opciones.nivel=3] nivel del encabezado del nombre (2–4)
 * @returns {HTMLElement}
 */
export function tarjetaIndicador(indicador, { compacta = false, comparadoCon = 'el periodo anterior', nivel = 3 } = {}) {
  const sinDatos = !Number.isFinite(indicador.valor) || indicador.estado === 'sin_datos';
  const estado = ESTADOS_META[indicador.estado] || null;
  const cambio = sinDatos ? null : cambioDe(indicador);
  const trend = tendencia(cambio?.cambio, indicador.sentido);
  // Si el indicador trae su propia referencia (no el periodo anterior), manda esa.
  const comparacion = indicador.comparadoCon
    || (typeof comparadoCon === 'function' ? comparadoCon(indicador) : comparadoCon);
  const meta = textoMeta(indicador);
  const encabezado = `h${Math.min(4, Math.max(2, nivel))}`;

  // La flecha solo dice hacia dónde se movió; si eso es bueno o malo lo dice
  // el sello de estado (con icono y palabra). Una flecha roja junto a «Bien»
  // eran dos juicios opuestos en la misma tarjeta.
  const variacion = cambio
    ? el('p', { class: 'kpi__variacion', dataset: { tendencia: trend } }, [
      el('span', { class: 'kpi__flecha', attrs: { 'aria-hidden': 'true' }, text: cambio.flecha }),
      // «frente al promedio», no «frente a el promedio»: la contracción se arma aquí
      // porque cada indicador escribe su referencia sin saber cómo se enlaza.
      el('span', { text: `${cambio.texto} frente ${comparacion.startsWith('el ') ? `al ${comparacion.slice(3)}` : `a ${comparacion}`}` }),
    ])
    : null;

  return el('article', {
    class: compacta ? 'kpi kpi--compacta' : 'kpi',
    dataset: { id: indicador.id, estado: indicador.estado || 'sin_meta' },
  }, [
    el(encabezado, { class: 'kpi__nombre', text: indicador.nombre }),
    el('p', { class: sinDatos ? 'kpi__valor kpi__valor--vacio' : 'kpi__valor', text: sinDatos ? 'Sin datos' : formatear(indicador.valor, indicador.formato) }),
    // Sin dato, la base («Confirmado $0 + por confirmar $0») contradecía al
    // «Sin datos» de arriba: se calla. La explicación sigue en «¿Cómo se calcula?».
    indicador.base && !sinDatos ? el('p', { class: 'kpi__base', text: indicador.base }) : null,
    variacion,
    (estado || meta) ? el('div', { class: 'kpi__meta' }, [
      estado ? el('span', { class: 'kpi__estado', dataset: { estado: indicador.estado } }, [
        icon(estado.icono, { class: 'kpi__icono' }),
        el('span', { text: estado.palabra }),
      ]) : null,
      meta ? el('span', { class: 'kpi__objetivo', text: meta }) : null,
    ]) : null,
    !compacta && chispaValida(indicador.chispa)
      ? el('div', { class: 'kpi__chispa' }, [chispa({ valores: indicador.chispa, formato: indicador.formato, nombre: indicador.nombre })])
      : null,
    indicador.definicion ? el('details', { class: 'kpi__como' }, [
      el('summary', { text: '¿Cómo se calcula?' }),
      el('p', { text: indicador.definicion }),
      indicador.base ? el('p', { class: 'kpi__como-base', text: `Base de este dato: ${indicador.base}.` }) : null,
    ]) : null,
  ]);
}

/**
 * Fila de tarjetas. Se reacomoda sola (rejilla automática): 1 columna a 390 px,
 * 2–3 en tableta y hasta 4 en escritorio.
 *
 * @param {Array<Object>} indicadores
 * @param {Object} [opciones] las de `tarjetaIndicador`, más `etiqueta` para el
 *   nombre accesible de la lista
 * @returns {HTMLElement}
 */
export function filaIndicadores(indicadores, { etiqueta = 'Indicadores', ...opciones } = {}) {
  const lista = Array.isArray(indicadores) ? indicadores : [];
  if (!lista.length) {
    return el('p', { class: 'kpi-fila kpi-fila--vacia', text: 'Sin indicadores para este periodo.' });
  }
  return el('ul', { class: 'kpi-fila', attrs: { 'aria-label': etiqueta } },
    lista.map((indicador) => el('li', { class: 'kpi-fila__item' }, [tarjetaIndicador(indicador, opciones)])));
}
