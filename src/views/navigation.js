import { el, icon } from '../lib/dom.js';
import { buildHash, getRoute } from '../core/router.js';
import { ICON_MENU, ICON_RECETARIO, ICON_PLAN, ICON_INGREDIENTES, ICON_ALMACEN, ICON_AJUSTES } from '../lib/iconos.js';

const MODULOS = [
  ['inicio', 'Resumen', ICON_MENU],
  ['recetario', 'Recetario', ICON_RECETARIO],
  ['plan', 'Producción', ICON_PLAN],
  ['ingredientes', 'Ingredientes', ICON_INGREDIENTES],
  ['almacen', 'Bodega', ICON_ALMACEN],
];

/** Navegación compartida sobre las direcciones existentes. */
export function renderNavigation(activo, onSettings) {
  const fondo = getRoute().id || null;
  return el('aside', { class: 'system-nav no-print' }, [
    el('a', { class: 'system-nav__brand', href: '#/', attrs: { 'aria-label': 'Zahavi, inicio' } }, [
      el('span', { class: 'system-nav__monogram', text: 'Z' }),
      el('span', { class: 'system-nav__identity' }, [
        el('strong', { text: 'ZAHAVI' }), el('small', { text: 'CAFÉ · PANADERÍA' }),
      ]),
    ]),
    el('p', { class: 'system-nav__caption', text: 'ESPACIO DE TRABAJO' }),
    el('nav', { class: 'system-nav__links', attrs: { 'aria-label': 'Navegación principal' } },
      MODULOS.map(([modulo, nombre, dibujo]) => el('a', {
        class: 'system-nav__link', href: buildHash({ modulo, name: 'index', id: modulo === 'recetario' ? null : fondo }),
        attrs: { 'aria-current': activo === modulo ? 'page' : null },
      }, [icon(dibujo), el('span', { text: nombre })])),
    ),
    el('div', { class: 'system-nav__footer' }, [
      onSettings ? el('button', {
        type: 'button', class: 'system-nav__settings', attrs: { 'aria-label': 'Ajustes' }, on: { click: onSettings },
      }, [icon(ICON_AJUSTES), el('span', { text: 'Ajustes del sistema' })]) : null,
      el('span', { class: 'system-nav__seal', text: 'Hecho para el oficio.' }),
      el('span', { class: 'system-nav__edition', text: 'ZAHAVI / OPERACIONES' }),
    ]),
  ]);
}

export function pageHeading(titulo, descripcion, acciones = []) {
  return el('div', { class: 'page-heading' }, [
    el('div', {}, [el('p', { class: 'eyebrow', text: 'ZAHAVI / OPERACIONES' }), el('h1', { text: titulo }),
      el('p', { class: 'page-heading__description', text: descripcion })]),
    acciones.length ? el('div', { class: 'page-heading__actions' }, acciones) : null,
  ]);
}

export function metric(valor, rotulo, detalle, extra = '') {
  return el('div', { class: 'metric ' + extra }, [
    el('p', { class: 'metric__label', text: rotulo }),
    el('p', { class: 'metric__value', text: String(valor) }),
    el('p', { class: 'metric__detail', text: detalle }),
  ]);
}
