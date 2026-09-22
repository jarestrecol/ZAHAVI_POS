/**
 * Piezas compartidas por las vistas del calendario de produccion.
 *
 * Nada de aqui escribe datos: son formatos, botones y cabeceras.
 */

import { el, icon } from '../../lib/dom.js';
import { titleCase, formatMedida as formatQty, splitYield, normalize } from '../../lib/format.js';
import { ICON_VOLVER } from '../../lib/iconos.js';
import { CATEGORIES } from '../../core/schema.js';
import { fechaLarga } from '../../core/calendario.js';

/** Clave CSS de cada area: `PANADERÍA` -> `panaderia`. */
export function claseArea(area) {
  const clave = normalize(area || '').toLowerCase().replace(/[^a-z]/g, '');
  return ['panaderia', 'pasteleria', 'galletas'].includes(clave) ? clave : 'otros';
}

export const nombreArea = (area) => titleCase(area || 'Sin área');

/** Las tres areas, en el orden del catalogo. */
export const AREAS = CATEGORIES;

/** Un botón con icono opcional. */
export function botonAccion(texto, accion, { clase = 'btn btn--quiet', dibujo = null, etiqueta = null, ...resto } = {}) {
  return el('button', {
    type: 'button', class: clase, on: { click: accion },
    attrs: etiqueta ? { 'aria-label': etiqueta } : {}, ...resto,
  }, [dibujo ? icon(dibujo) : null, el('span', { text: texto })]);
}

/**
 * Cabecera de una vista dentro del modulo: volver al calendario, titulo y dia.
 *
 * @returns {{node: HTMLElement, titulo: HTMLElement}}
 */
export function cabeceraVista({ titulo, fecha, detalle = '', onVolver, acciones = [] }) {
  const h2 = el('h2', { class: 'prod-vista__titulo', text: titulo, attrs: { tabindex: '-1' } });
  const node = el('header', { class: 'prod-vista__cabecera' }, [
    botonAccion('Calendario', onVolver, { clase: 'btn btn--quiet prod-vista__volver', dibujo: ICON_VOLVER,
      etiqueta: 'Volver al calendario' }),
    el('div', { class: 'prod-vista__textos' }, [
      h2,
      el('p', { class: 'prod-vista__fecha', text: [fecha ? fechaLarga(fecha) : '', detalle].filter(Boolean).join(' · ') }),
    ]),
    acciones.length ? el('div', { class: 'prod-vista__acciones' }, acciones) : null,
  ]);
  return { node, titulo: h2 };
}

/**
 * Unidades que salen de un conjunto de recetas, agrupadas por su unidad.
 *
 * No se suman unidades distintas -30 und y 8 paq no son 38 de nada- ni se
 * inventa rendimiento a las recetas que no lo declaran: se cuentan aparte.
 */
export function unidadesDe(entradas) {
  const por = new Map();
  let sinRendimiento = 0;
  for (const { recipe, factor } of entradas) {
    const { cantidad, unidad } = splitYield(recipe.nombre);
    const base = Number(String(cantidad).replace(',', '.'));
    if (!cantidad || !Number.isFinite(base) || base <= 0) { sinRendimiento += 1; continue; }
    const clave = (unidad || 'und').toLowerCase();
    por.set(clave, (por.get(clave) || 0) + base * factor);
  }
  return { por, sinRendimiento };
}

export function textoUnidades(resumen) {
  const partes = [...resumen.por].map(([u, n]) => `${formatQty(Math.round(n * 100) / 100)} ${u}`);
  if (resumen.sinRendimiento) partes.push(`${resumen.sinRendimiento} sin rendimiento`);
  return partes.length ? partes.join(' · ') : '—';
}

export const tandas = (n) => `${formatQty(n)} ${n === 1 ? 'tanda' : 'tandas'}`;

/**
 * Estado de una receta, con texto: el color nunca es la unica señal.
 *
 * La marca ✓ de «Lista» va aparte y oculta al lector de pantalla, que ya oye
 * la palabra. Una receta con tandas nuevas sobre lo ya hecho es «parcial».
 */
export function insigniaEstado(estado, parcial = false) {
  const esParcial = parcial && estado !== 'lista';
  const texto = { pendiente: esParcial ? 'Faltan tandas' : 'Pendiente', en_preparacion: 'En preparación', lista: 'Lista' }[estado];
  return el('span', { class: `prod-estado prod-estado--${estado}${esParcial ? ' prod-estado--parcial' : ''}` }, [
    estado === 'lista' ? el('span', { class: 'prod-estado__marca', text: '✓', attrs: { 'aria-hidden': 'true' } }) : null,
    el('span', { text: texto }),
  ]);
}

/** Barra de avance con su lectura. */
export function avance(hechas, total, rotulo) {
  return el('div', { class: 'prod-avance' }, [
    el('progress', { max: Math.max(total, 1), value: Math.min(hechas, total), attrs: { 'aria-label': rotulo } }),
    el('span', { class: 'prod-avance__texto', text: `${hechas} de ${total} ${total === 1 ? 'lista' : 'listas'}` }),
  ]);
}

/**
 * Grupo de botones que se comporta como pestañas simples (aria-pressed).
 *
 * Cada opcion es `[clave, texto, claseExtra?, nombreAccesible?]`. El nombre
 * accesible sirve cuando el texto visible es una abreviatura («Panadería · 3»).
 */
export function selector({ etiqueta, opciones, valor, onCambio, clase = '' }) {
  const grupo = el('div', { class: `prod-selector ${clase}`.trim(), attrs: { role: 'group', 'aria-label': etiqueta } });
  for (const [clave, texto, extra, nombre] of opciones) {
    grupo.appendChild(el('button', {
      type: 'button', class: `prod-selector__opcion ${extra || ''}`.trim(),
      dataset: { opcion: clave },
      attrs: { 'aria-pressed': String(clave === valor), 'aria-label': nombre || null },
      on: { click: () => onCambio(clave) },
    }, [el('span', { text: texto })]));
  }
  return grupo;
}

/**
 * Un aviso de «no hay nada» con, si se da, la accion que lo resuelve.
 *
 * @param {{texto: string, clase?: string, accion?: Node|null}} o
 */
export function vacio({ texto, clase = '', accion = null }) {
  return el('div', { class: `prod-vacio ${clase}`.trim() }, [el('p', { class: 'prod-vacio__texto', text: texto }), accion]);
}

/**
 * Ejecuta una accion asincrona con el boton ocupado: desactivado y con
 * `aria-busy` mientras dura. Si el boton sigue en pantalla al terminar, se
 * reactiva (normalmente el repintado ya lo habra sustituido).
 *
 * @template T
 * @param {HTMLButtonElement} boton
 * @param {() => Promise<T>} trabajo
 * @returns {Promise<T>}
 */
export async function conEspera(boton, trabajo) {
  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  try {
    return await trabajo();
  } finally {
    if (boton.isConnected) {
      boton.disabled = false;
      boton.removeAttribute('aria-busy');
    }
  }
}

/** Cuanto dura a la vista la marca «Guardado ✓» junto a lo que se cambio. */
export const DURACION_MARCA_MS = 3000;

/**
 * Deja una marca breve («Guardado ✓») DENTRO del nodo que se acaba de cambiar,
 * para que la respuesta se vea donde se toco. Es solo visual: quien llama
 * anuncia el cambio con `announce`, asi que la marca no se lee dos veces.
 *
 * @param {Element|null} nodo la fila o tarjeta ya repintada
 * @param {string} [texto]
 */
export function marcarHecho(nodo, texto = 'Guardado ✓') {
  if (!nodo) return;
  nodo.querySelector(':scope > .prod-hecho')?.remove();
  // Dos cambios seguidos en la misma fila: el reloj del primero apagaria la
  // marca del segundo antes de tiempo.
  clearTimeout(relojes.get(nodo));
  const marca = el('span', { class: 'prod-hecho', text: texto, attrs: { 'aria-hidden': 'true' } });
  nodo.appendChild(marca);
  nodo.classList.add('prod-cambio');
  relojes.set(nodo, setTimeout(() => {
    marca.remove();
    nodo.classList.remove('prod-cambio');
    relojes.delete(nodo);
  }, DURACION_MARCA_MS));
}

/** Un reloj por nodo marcado, para que el anterior no apague al siguiente. */
const relojes = new WeakMap();

/** Ancho, en px, desde el que una vista de trabajo usa dos columnas. */
export const ANCHO_DOS_COLUMNAS = 960;

/**
 * Sigue el ancho de un nodo y avisa cuando cruza `ANCHO_DOS_COLUMNAS`.
 *
 * Las vistas que cambian de ESTRUCTURA segun el espacio (Proyectar: columna de
 * detalle o tarjeta desplegada) no pueden hacerlo solo con CSS. Antes de estar
 * en el documento el nodo mide 0: se estima con el ancho de la ventana y el
 * primer aviso del observador corrige.
 *
 * @param {Element} nodo
 * @param {(ancho: boolean) => void} alCambiar recibe `true` si caben dos columnas
 * @returns {() => boolean} lectura del estado actual
 */
export function vigilarAncho(nodo, alCambiar) {
  let ancho = (globalThis.innerWidth || 0) >= ANCHO_DOS_COLUMNAS + 240;
  if (typeof ResizeObserver !== 'function') return () => ancho;
  const observador = new ResizeObserver((entradas) => {
    // Retirado del documento, el nodo mide 0: no es un cambio de ancho.
    if (!nodo.isConnected) { observador.disconnect(); return; }
    const medida = entradas.at(-1).contentRect.width;
    if (!medida) return;
    const nuevo = medida >= ANCHO_DOS_COLUMNAS;
    if (nuevo === ancho) return;
    ancho = nuevo;
    alCambiar(ancho);
  });
  observador.observe(nodo);
  return () => ancho;
}
