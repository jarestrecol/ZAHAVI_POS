/**
 * =============================================================================
 *  KIT DE GRAFICAS (BI-001): PIEZAS COMUNES
 * =============================================================================
 *
 *  Todo lo que comparten las graficas del panel de inteligencia de negocio:
 *  como se escribe una cifra, como se nombra un periodo, el techo del eje, el
 *  tono de cada area, la figura con su titulo, la leyenda, el mensaje de vacio
 *  y la lectura al pasar el puntero o recorrer con el teclado.
 *
 *  POR QUE A MANO Y NO CON UNA LIBRERIA
 *  La aplicacion se sirve sin empaquetar en desarrollo y en las pruebas, y una
 *  libreria de graficas pesaria mas que toda la pantalla de inicio. Lo que se
 *  necesita (lineas, columnas, barras, un calendario de calor) son rectangulos
 *  y trazados; se dibujan con `svg()` de `lib/dom.js`, sin `innerHTML`: los
 *  nombres de recetas y personas llegan como texto libre.
 *
 *  REGLAS DEL KIT (guia de visualizacion del proyecto)
 *  - Una sola escala Y por grafica. Nunca doble eje.
 *  - El texto va siempre en tinta (`--ink*`); el color de la serie lo lleva la
 *    marca que esta al lado, nunca las letras.
 *  - La lectura al pasar el puntero AYUDA, no encierra: cada cifra esta
 *    tambien en la tabla equivalente («Ver los datos en tabla»).
 *  - Ninguna funcion lee estado global: todo llega por parametros.
 */

import { el, svg } from '../../lib/dom.js';
import { pesos } from '../../lib/format.js';

// -----------------------------------------------------------------------------
//  Tonos
// -----------------------------------------------------------------------------

/** Tono de cada area; coincide con el orden de `CATEGORIES` del recetario. */
export const TONOS = Object.freeze({ 'PASTELERÍA': 'pasteleria', 'PANADERÍA': 'panaderia', GALLETAS: 'galletas' });

/** Tonos que entiende la hoja `graficas.css`. Cualquier otro cae en «otros». */
const TONOS_VALIDOS = new Set(['pasteleria', 'panaderia', 'galletas', 'total', 'otros', 'comparacion']);

/**
 * Tono de un area. Acepta el nombre tal como llega del recetario
 * ("PASTELERÍA") o escrito para leer ("Pastelería").
 *
 * @param {string} area
 * @returns {'pasteleria'|'panaderia'|'galletas'|'otros'}
 */
export function tonoDeArea(area) {
  return TONOS[String(area || '').trim().toUpperCase()] || 'otros';
}

/** Tono seguro para un atributo `data-tono`: lo desconocido es «otros». */
export function tonoSeguro(tono) {
  return TONOS_VALIDOS.has(tono) ? tono : 'otros';
}

// -----------------------------------------------------------------------------
//  Cifras
// -----------------------------------------------------------------------------

const CIFRA_1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const CIFRA_0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const MENOS = '−'; // signo menos tipografico: el guion se confunde con «sin dato»

const esNumero = (valor) => typeof valor === 'number' && Number.isFinite(valor);

/**
 * Numero abreviado: "1,2 M", "45 mil", "950".
 *
 * A mano y no con `notation: 'compact'`: con es-CO el navegador escribe "k"
 * en unas cifras y "K" en otras del mismo eje, y "mil millones" como "mil M".
 */
function numeroCorto(valor) {
  const abs = Math.abs(valor);
  if (abs >= 1e9) return `${CIFRA_1.format(valor / 1e9)} mil M`;
  if (abs >= 1e6) return `${CIFRA_1.format(valor / 1e6)} M`;
  if (abs >= 1e4) return `${CIFRA_0.format(valor / 1e3)} mil`;
  if (abs >= 1e3) return `${CIFRA_1.format(valor / 1e3)} mil`;
  return CIFRA_1.format(valor);
}

/** "1 h 20 min", "45 min", "2 h". Con `corto`: "1 h 20", "45 min". */
function duracion(minutos, corto) {
  const total = Math.round(Math.abs(minutos));
  const signo = minutos < 0 && total > 0 ? MENOS : '';
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) return `${signo}${resto} min`;
  if (resto === 0) return `${signo}${horas} h`;
  return corto ? `${signo}${horas} h ${resto}` : `${signo}${horas} h ${resto} min`;
}

/**
 * Una cifra escrita para leer, segun su formato.
 *
 * | formato     | normal          | corto (ejes, rotulos) |
 * |-------------|-----------------|-----------------------|
 * | pesos       | $1.234.567      | $1,2 M · $450 mil     |
 * | porcentaje  | 12,5 %          | 12,5 %                |
 * | dias        | 3,5 días · 1 día| 3,5 d                 |
 * | kg          | 12,4 kg         | 12,4 kg               |
 * | minutos     | 1 h 20 min      | 1 h 20                |
 * | tandas      | 12,5 tandas     | 12,5                  |
 * | unidades    | 240 und         | 240                   |
 * | numero      | 1.234,5         | 1,2 mil               |
 *
 * `null`, `undefined`, NaN o infinito se escriben «—»: un valor que no se
 * pudo calcular no es un cero.
 *
 * @param {number|null} valor
 * @param {string} formato
 * @param {{corto?: boolean}} [opciones]
 * @returns {string}
 */
export function formatear(valor, formato, { corto = false } = {}) {
  if (!esNumero(valor)) return '—';
  switch (formato) {
    case 'pesos': {
      const signo = valor < 0 && Math.round(Math.abs(valor)) > 0 ? MENOS : '';
      if (!corto) return signo + pesos(Math.abs(valor));
      return `${signo}$${numeroCorto(Math.abs(valor))}`;
    }
    case 'porcentaje':
      return `${CIFRA_1.format(valor)} %`;
    case 'dias': {
      if (corto) return `${CIFRA_1.format(valor)} d`;
      const texto = CIFRA_1.format(valor);
      return `${texto} ${texto === '1' ? 'día' : 'días'}`;
    }
    case 'kg':
      return `${CIFRA_1.format(valor)} kg`;
    case 'minutos':
      return duracion(valor, corto);
    case 'tandas': {
      if (corto) return numeroCorto(valor);
      const texto = CIFRA_1.format(valor);
      return `${texto} ${texto === '1' ? 'tanda' : 'tandas'}`;
    }
    case 'unidades':
      return corto ? numeroCorto(valor) : `${CIFRA_0.format(valor)} und`;
    case 'numero':
    default:
      return corto ? numeroCorto(valor) : CIFRA_1.format(valor);
  }
}

/**
 * Variacion frente al periodo anterior: "+12 %", "−3 %", "0 %" o "—".
 *
 * Llega como proporcion (0,12 = +12 %). Se redondea al entero; por debajo del
 * uno por ciento se deja un decimal para que "+0,4 %" no se lea como "0 %".
 *
 * @param {number|null} proporcion
 * @returns {string}
 */
export function formatearVariacion(proporcion) {
  if (!esNumero(proporcion)) return '—';
  const pct = proporcion * 100;
  const abs = Math.abs(pct);
  const texto = abs > 0 && abs < 1 ? CIFRA_1.format(abs) : CIFRA_0.format(abs);
  if (texto === '0') return '0 %';
  return `${pct > 0 ? '+' : MENOS}${texto} %`;
}

// -----------------------------------------------------------------------------
//  Periodos
// -----------------------------------------------------------------------------

/*
 * Meses y dias escritos a mano: `Intl` en espanol abrevia septiembre como
 * "sept." con punto, y el punto sobra en un eje estrecho. Asi el rotulo es el
 * mismo en todos los navegadores.
 */
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Lunes primero, como las semanas de la aplicacion. */
export const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Partes de una fecha `YYYY-MM-DD`, sin pasar por la zona horaria. */
export function partesDe(iso) {
  const [anio, mes, dia] = String(iso || '').split('-').map(Number);
  if (!anio || !mes || !dia) return null;
  // 0 = lunes. `Date.UTC` evita que la zona del equipo mueva el dia.
  const semana = (new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() + 6) % 7;
  return { anio, mes, dia, semana };
}

/**
 * Nombre de una cubeta de tiempo `{desde, hasta}`.
 *
 * | grano  | corto        | largo                              | eje      |
 * |--------|--------------|------------------------------------|----------|
 * | dia    | lun 21 sep   | lunes 21 sep 2026                  | 21 sep   |
 * | semana | 15 sep       | Semana del 15 al 21 sep 2026       | 15 sep   |
 * | mes    | sep 2026     | septiembre 2026                    | sep      |
 *
 * La semana usa el `hasta` real de la cubeta: la primera y la ultima pueden
 * ser parciales y el rotulo no debe prometer dias que no cuenta.
 *
 * @param {{desde: string, hasta?: string}} cubeta
 * @param {'dia'|'semana'|'mes'} grano
 * @param {{largo?: boolean, eje?: boolean}} [opciones] `eje`: la forma mas corta, para el eje X
 * @returns {string}
 */
export function rotuloCubeta(cubeta, grano, { largo = false, eje = false } = {}) {
  const d = partesDe(cubeta?.desde);
  if (!d) return String(cubeta?.desde ?? '');
  const mes = MESES[d.mes - 1];
  if (grano === 'mes') {
    if (largo) return `${MESES_LARGOS[d.mes - 1]} ${d.anio}`;
    return eje ? mes : `${mes} ${d.anio}`;
  }
  if (grano === 'semana') {
    if (!largo) return `${d.dia} ${mes}`;
    const h = partesDe(cubeta.hasta) || d;
    if (h.anio !== d.anio) return `Semana del ${d.dia} ${mes} ${d.anio} al ${h.dia} ${MESES[h.mes - 1]} ${h.anio}`;
    if (h.mes !== d.mes) return `Semana del ${d.dia} ${mes} al ${h.dia} ${MESES[h.mes - 1]} ${h.anio}`;
    if (h.dia === d.dia) return `Semana del ${d.dia} ${mes} ${d.anio}`;
    return `Semana del ${d.dia} al ${h.dia} ${mes} ${d.anio}`;
  }
  if (largo) return `${DIAS_LARGOS[d.semana]} ${d.dia} ${mes} ${d.anio}`;
  if (eje) return `${d.dia} ${mes}`;
  return `${DIAS_SEMANA[d.semana]} ${d.dia} ${mes}`;
}

/** Nombre del grano en plural, para los resumenes: "30 días", "12 semanas". */
export function cuantasCubetas(n, grano) {
  const [uno, varios] = grano === 'mes' ? ['mes', 'meses'] : grano === 'semana' ? ['semana', 'semanas'] : ['día', 'días'];
  return `${n} ${n === 1 ? uno : varios}`;
}

// -----------------------------------------------------------------------------
//  Escala
// -----------------------------------------------------------------------------

/**
 * Techo "redondo" del eje: 1, 2, 2,5 o 5 por una potencia de diez.
 *
 * Con el maximo exacto como techo, las rayas de la rejilla caerian en cifras
 * como $1.234.567 que nadie lee de un vistazo.
 *
 * @param {number} maximo
 * @returns {number}
 */
export function techoRedondo(maximo) {
  if (!(maximo > 0) || !Number.isFinite(maximo)) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  const escalon = [1, 2, 2.5, 5, 10].find((m) => m * potencia >= maximo * (1 - 1e-9));
  return escalon * potencia;
}

/**
 * Medidas del dibujo en unidades del `viewBox`.
 *
 * EL LIENZO MIDE LO QUE MIDE SU CAJA. El SVG escala con su caja conservando la
 * proporcion, asi que un lienzo de 720 unidades dentro de una tarjeta de 360
 * pixeles (un telefono, o una rejilla de tres columnas en escritorio) dejaria
 * el texto a la mitad: ilegible. Por eso cada grafica se dibuja con el ancho
 * REAL de su contenedor (`adaptarAlAncho`), una unidad por pixel, y el texto
 * sale al tamano de la hoja de estilo. Una caja estrecha (< 480 px) lleva
 * menos rotulos y ningun nombre al final de las lineas.
 *
 * Antes de conocer la caja (la figura aun no esta en el documento) se usa el
 * ancho de la ventana como aproximacion; al montarse se vuelve a dibujar.
 */
export function esEstrecho(anchoPx) {
  if (esNumero(anchoPx) && anchoPx > 0) return anchoPx < 480;
  return Boolean(globalThis.matchMedia?.('(max-width: 600px)').matches);
}

const ANCHO_MIN = 280;
const ANCHO_MAX = 1400;

export function medidasLienzo({ alto, rotulosDirectos = false, anchoPx = null } = {}) {
  const estrecho = esEstrecho(anchoPx);
  const base = estrecho
    ? { estrecho, ancho: 360, alto: 232, rotulos: 4, arriba: 14, derecha: 12, abajo: 30, izquierda: 50 }
    : { estrecho, ancho: 720, alto: 272, rotulos: 6, arriba: 16, derecha: 16, abajo: 32, izquierda: 64 };
  if (esNumero(anchoPx) && anchoPx > 0) {
    base.ancho = Math.round(Math.min(ANCHO_MAX, Math.max(ANCHO_MIN, anchoPx)));
    // Un rotulo del eje X cada ~110 px: "21 sep" y su aire.
    base.rotulos = Math.max(3, Math.min(8, Math.floor(base.ancho / 110)));
  }
  // El alto pedido se respeta dentro de un margen razonable; en telefono se
  // reduce en la misma proporcion que el ancho, para que no quede un palo.
  if (esNumero(alto) && alto > 0) base.alto = Math.round(Math.min(480, Math.max(160, estrecho ? alto * 0.85 : alto)));
  // Espacio a la derecha para el nombre de cada serie al final de su linea.
  if (rotulosDirectos && !estrecho) base.derecha = 96;
  return base;
}

/** Valores de un conjunto de puntos, sin nulos: para maximos y vacios. */
export function valoresDe(puntos, ids) {
  const salida = [];
  for (const p of puntos || []) {
    for (const id of ids) {
      const v = p?.valores?.[id];
      if (esNumero(v)) salida.push(v);
    }
  }
  return salida;
}

/** ¿Hay algo que dibujar? Sin datos o todo en cero es «vacio». */
export function hayDatos(valores) {
  return valores.some((v) => esNumero(v) && v !== 0);
}

export { esNumero };

// -----------------------------------------------------------------------------
//  Estados contra la meta
// -----------------------------------------------------------------------------

/** Icono + palabra: el estado nunca se dice solo con color. */
export const ESTADOS = Object.freeze({
  bien: { icono: '✓', palabra: 'Bien' },
  atencion: { icono: '!', palabra: 'Atención' },
  mal: { icono: '✕', palabra: 'Mal' },
  sin_meta: { icono: '–', palabra: 'Sin meta' },
  sin_datos: { icono: '–', palabra: 'Sin datos' },
});

/**
 * Insignia de estado: icono y palabra, con el color de estado detras.
 *
 * @param {'bien'|'atencion'|'mal'|'sin_meta'|'sin_datos'} estado
 * @returns {HTMLElement}
 */
export function insigniaEstado(estado) {
  const clave = ESTADOS[estado] ? estado : 'sin_datos';
  const { icono, palabra } = ESTADOS[clave];
  return el('span', { class: 'graf-estado', dataset: { estado: clave } }, [
    el('span', { class: 'graf-estado__icono', text: icono, attrs: { 'aria-hidden': 'true' } }),
    palabra,
  ]);
}

// -----------------------------------------------------------------------------
//  Figura, leyenda y vacio
// -----------------------------------------------------------------------------

/**
 * La caja de toda grafica: `<figure class="graf">` con su titulo visible.
 *
 * @param {{titulo?: string, subtitulo?: string, clase?: string}} opciones
 * @returns {HTMLElement}
 */
export function figura({ titulo, subtitulo, clase } = {}) {
  return el('figure', { class: clase ? `graf ${clase}` : 'graf' }, [
    el('figcaption', { class: 'graf__cabecera' }, [
      el('span', { class: 'graf__titulo', text: titulo || 'Gráfica' }),
      subtitulo ? el('span', { class: 'graf__subtitulo', text: subtitulo }) : null,
    ]),
  ]);
}

/**
 * Mensaje de vacio dentro de la figura. No se dibuja una linea en cero: un
 * periodo sin datos no es un periodo con cero, y la linea lo afirmaria.
 */
export function mensajeVacio(texto) {
  return el('p', { class: 'graf__vacio', attrs: { role: 'note' } }, [
    el('strong', { text: 'Sin datos para mostrar' }),
    el('span', { text: texto || 'Todavía no hay registros en este periodo, o todos están en cero.' }),
  ]);
}

/**
 * Leyenda: una muestra de la marca (linea, caja o linea punteada) junto al
 * nombre. La muestra imita a la marca de la grafica; el nombre va en tinta.
 *
 * @param {Array<{nombre: string, tono: string, forma?: 'linea'|'caja'|'punteada'}>} items
 * @returns {HTMLElement}
 */
export function leyenda(items) {
  return el('ul', { class: 'graf__leyenda', attrs: { 'aria-label': 'Leyenda' } }, items.map((item) =>
    el('li', { class: 'graf__leyenda-item' }, [
      el('span', {
        class: 'graf__muestra',
        dataset: { tono: tonoSeguro(item.tono), forma: item.forma || 'linea' },
        attrs: { 'aria-hidden': 'true' },
      }),
      item.nombre,
    ])));
}

// -----------------------------------------------------------------------------
//  Lectura: tooltip al pasar el puntero y recorrido con el teclado
// -----------------------------------------------------------------------------

/**
 * Hace legible una grafica punto por punto, con el puntero y con el teclado.
 *
 * DECISION DE TECLADO. El dibujo recibe foco (un solo punto de tabulacion por
 * grafica, no uno por marca: 30 columnas serian 30 paradas de Tab). Con el
 * foco dentro, las flechas recorren los datos y el tooltip muestra lo mismo
 * que al pasar el puntero; un aviso oculto lo dice al lector de pantalla SOLO
 * cuando se mueve con el teclado (con el puntero no, porque taparia lo que el
 * lector estuviera diciendo). La tabla sigue siendo el camino garantizado.
 *
 * @param {object} o
 * @param {HTMLElement} o.lienzo contenedor con `position: relative` del SVG y del tooltip
 * @param {SVGElement} o.dibujo el SVG
 * @param {number} o.total cuantos datos hay
 * @param {number} o.ancho ancho del viewBox
 * @param {number} o.alto alto del viewBox
 * @param {(vx: number, vy: number) => number|null} o.indiceEn dato bajo el puntero
 * @param {(i: number) => {x: number, y: number}} o.anclaDe donde se apoya el tooltip
 * @param {(i: number) => {titulo: string, filas: Array<{nombre: string, valor: string, tono?: string, forma?: string}>}} o.contenidoDe
 * @param {(i: number, activo: boolean) => void} [o.marcar] resaltar el dato en el dibujo
 * @param {(i: number, tecla: string) => number} [o.mover] navegacion propia (mapa de calor)
 * @param {number} [o.inicial] dato que se muestra al recibir el foco
 */
export function activarLectura(o) {
  const tooltip = el('div', { class: 'graf__tooltip', hidden: true, attrs: { 'aria-hidden': 'true' } });
  const anuncio = el('p', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
  o.lienzo.append(tooltip, anuncio);
  let actual = null;
  let porTeclado = false;

  /*
   * El tooltip se queda DENTRO del lienzo sin medir nada (una vista construye,
   * no mide: `scripts/verificar.mjs`). Va del lado del dato con mas sitio, y
   * su ancho maximo es justo ese sitio: asi cabe siempre, tambien en una caja
   * de telefono, y los nombres largos se parten por palabras. Como el lienzo
   * se dibuja a una unidad por pixel (`adaptarAlAncho`), las unidades del
   * dibujo ya son pixeles.
   *
   * `vertical: 'arriba'` lo coloca encima del ancla (filas de abajo del mapa
   * de calor, para no salirse por el pie).
   */
  const SEPARACION = 12;
  const ANCHO_TOOLTIP = 272; // 17rem
  const colocar = ({ x, y, vertical = 'abajo' }) => {
    const aLaDerecha = x <= o.ancho / 2;
    const sitio = aLaDerecha ? o.ancho - x - SEPARACION : x - SEPARACION;
    tooltip.style.maxWidth = `${Math.floor(Math.min(ANCHO_TOOLTIP, Math.max(120, sitio)))}px`;
    tooltip.dataset.lado = aLaDerecha ? 'derecha' : 'izquierda';
    tooltip.dataset.vertical = vertical === 'arriba' ? 'arriba' : 'abajo';
    tooltip.style.left = `${(x / o.ancho) * 100}%`;
    tooltip.style.top = `${(Math.min(Math.max(0, y), o.alto) / o.alto) * 100}%`;
  };

  const mostrar = (i, anunciar) => {
    if (i === null || i === undefined || i < 0 || i >= o.total) return;
    if (actual !== null && actual !== i) o.marcar?.(actual, false);
    actual = i;
    o.marcar?.(i, true);
    const { titulo, filas } = o.contenidoDe(i);
    tooltip.replaceChildren(
      el('p', { class: 'graf__tooltip-titulo', text: titulo }),
      ...filas.map((fila) => el('p', { class: 'graf__tooltip-fila' }, [
        fila.tono ? el('span', { class: 'graf__muestra', dataset: { tono: tonoSeguro(fila.tono), forma: fila.forma || 'linea' } }) : null,
        el('strong', { class: 'graf__tooltip-valor', text: fila.valor }),
        el('span', { class: 'graf__tooltip-nombre', text: fila.nombre }),
      ])),
    );
    tooltip.hidden = false;
    colocar(o.anclaDe(i));
    if (anunciar) anuncio.textContent = `${titulo}: ${filas.map((f) => `${f.nombre} ${f.valor}`).join(', ')}`;
  };
  const ocultar = () => {
    if (actual !== null) o.marcar?.(actual, false);
    actual = null;
    tooltip.hidden = true;
  };

  // Del puntero a las coordenadas del dibujo con la transformacion propia del
  // SVG (incluye el `viewBox` y cualquier escala). Se lee en el instante del
  // evento y no se guarda: no es memoria en el DOM.
  const puntoDe = (evento) => {
    const matriz = o.dibujo.getScreenCTM?.();
    if (!matriz) return null;
    const p = new DOMPoint(evento.clientX, evento.clientY).matrixTransform(matriz.inverse());
    return o.indiceEn(p.x, p.y);
  };
  o.dibujo.addEventListener('pointermove', (evento) => {
    porTeclado = false;
    const i = puntoDe(evento);
    if (i === null) { if (document.activeElement !== o.dibujo) ocultar(); return; }
    mostrar(i, false);
  });
  o.dibujo.addEventListener('pointerleave', () => { if (document.activeElement !== o.dibujo || !porTeclado) ocultar(); });

  o.dibujo.setAttribute('tabindex', '0');
  o.dibujo.addEventListener('focus', () => {
    porTeclado = true;
    mostrar(actual ?? o.inicial ?? o.total - 1, true);
  });
  o.dibujo.addEventListener('blur', ocultar);
  o.dibujo.addEventListener('keydown', (evento) => {
    const tecla = evento.key;
    if (tecla === 'Escape') { if (actual !== null) { ocultar(); evento.preventDefault(); evento.stopPropagation(); } return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(tecla)) return;
    evento.preventDefault();
    porTeclado = true;
    const desde = actual ?? o.inicial ?? o.total - 1;
    let destino;
    if (o.mover) destino = o.mover(desde, tecla);
    else if (tecla === 'Home') destino = 0;
    else if (tecla === 'End') destino = o.total - 1;
    else if (tecla === 'ArrowLeft' || tecla === 'ArrowDown') destino = desde - 1;
    else destino = desde + 1;
    mostrar(Math.min(o.total - 1, Math.max(0, destino)), true);
  });
  return { mostrar, ocultar, actual: () => actual, dibujo: o.dibujo };
}

/**
 * Dibuja una grafica al ancho REAL de su lienzo y la redibuja si cambia.
 *
 * `pintar(anchoPx)` llena el lienzo (vacio) y devuelve lo que devolvio
 * `activarLectura`. La primera vez `anchoPx` es null (la figura aun no esta en
 * el documento). Cuando la caja se mide, o cambia de ancho (girar la tableta,
 * abrir el menu), se vuelve a pintar; si el foco estaba en el dibujo, vuelve
 * al dibujo nuevo y al mismo dato, para que quien navega con el teclado no se
 * pierda. Un cambio solo de alto no redibuja: el alto lo decide el propio
 * dibujo y redibujar por el entraria en bucle.
 *
 * Cuando la figura sale del documento (la vista se repinta entera) el
 * observador se desconecta solo.
 *
 * @param {HTMLElement} lienzo
 * @param {(anchoPx: number|null) => {dibujo: Element, actual: () => number|null, mostrar: Function}|null} pintar
 */
export function adaptarAlAncho(lienzo, pintar) {
  let ancho = null;
  let lectura = null;
  const hacer = (nuevo) => {
    const conFoco = Boolean(lectura && document.activeElement === lectura.dibujo);
    const indice = lectura?.actual() ?? null;
    lienzo.replaceChildren();
    ancho = nuevo;
    lectura = pintar(nuevo) || null;
    if (conFoco && lectura) {
      lectura.dibujo.focus({ preventScroll: true });
      if (indice !== null) lectura.mostrar(indice, false);
    }
  };
  hacer(null);
  if (typeof ResizeObserver !== 'function') return;
  // Solo se suelta cuando la figura ESTUVO en el documento y salio: una vista
  // puede construirla antes de montarla.
  let montado = false;
  const observador = new ResizeObserver((entradas) => {
    const medido = Math.round(entradas[entradas.length - 1].contentRect.width);
    if (!lienzo.isConnected) { if (montado) observador.disconnect(); return; }
    montado = true;
    if (medido <= 0) return;
    const usado = ancho ?? -1;
    if (Math.abs(medido - usado) < 2) return;
    hacer(medido);
  });
  observador.observe(lienzo);
}

/** Pie de ayuda para el `aria-label` de toda grafica recorrible. */
export const AYUDA_TECLADO = 'Con el foco en la gráfica, las flechas recorren los valores. Todas las cifras están en la tabla.';

/** Eje X: que indices llevan rotulo. Pocos, y siempre el ultimo. */
export function indicesConRotulo(n, maximo) {
  if (n <= 0) return [];
  const salto = Math.max(1, Math.ceil(n / maximo));
  const salida = [];
  for (let i = 0; i < n; i += salto) {
    // El que le queda a menos de un salto del ultimo se omite para que los
    // dos rotulos no se monten.
    if (i !== n - 1 && n - 1 - i < salto && i !== 0) continue;
    salida.push(i);
  }
  if (salida[salida.length - 1] !== n - 1) {
    if (salida.length > 1 && n - 1 - salida[salida.length - 1] < salto) salida.pop();
    salida.push(n - 1);
  }
  return salida;
}

/**
 * Cuantos tramos lleva el eje segun el escalon del techo, para que cada raya
 * caiga en una cifra redonda: 1 y 5 se parten en cinco (0,2 y 1), 2 en cuatro
 * (0,5) y 2,5 en cinco (0,5). Partido siempre en cuatro, un techo de 2,5 dejaba
 * rayas en «$625 mil» y «$1,9 M», y uno de 50 en «37,5».
 *
 * @param {number} techo salida de `techoRedondo`
 * @returns {number}
 */
export function divisionesDe(techo) {
  if (!(techo > 0) || !Number.isFinite(techo)) return 4;
  const escalon = techo / 10 ** Math.floor(Math.log10(techo) + 1e-9);
  return Math.abs(escalon - 2) < 1e-6 ? 4 : 5;
}

/** Rejilla horizontal con sus rotulos, de cero al techo en tramos redondos. */
export function rejillaY(m, techo, formato, y) {
  const hijos = [];
  const tramos = divisionesDe(techo);
  for (let paso = 0; paso <= tramos; paso++) {
    const valor = (techo * paso) / tramos;
    hijos.push(svg('line', { class: paso === 0 ? 'graf__base' : 'graf__rejilla', x1: m.izquierda, x2: m.ancho - m.derecha, y1: y(valor), y2: y(valor) }));
    hijos.push(svg('text', { class: 'graf__eje', x: m.izquierda - 8, y: y(valor) + 4, 'text-anchor': 'end' },
      [formatear(valor, formato, { corto: true })]));
  }
  return hijos;
}

/** Linea de meta: raya discontinua (se lee como umbral) y su rotulo en tinta. */
export function lineaDeMeta(m, meta, formato, y) {
  if (!meta || !esNumero(meta.valor)) return [];
  const yy = y(meta.valor);
  return [
    svg('line', { class: 'graf__meta', x1: m.izquierda, x2: m.ancho - m.derecha, y1: yy, y2: yy }),
    svg('text', { class: 'graf__meta-rotulo', x: m.ancho - m.derecha, y: yy - 6, 'text-anchor': 'end' },
      [`${meta.nombre || 'Meta'}: ${formatear(meta.valor, formato, { corto: true })}`]),
  ];
}
