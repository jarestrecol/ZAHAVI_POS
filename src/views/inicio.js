/**
 * =============================================================================
 *  ENTRADA DEL INICIO («Resumen»)
 * =============================================================================
 *
 *  Decide qué ve cada persona al entrar:
 *
 *    - el operario: una tarjeta que lo lleva a su producción de hoy y los
 *      accesos a los módulos. No ve el panel de gestión (ni cifras de costo).
 *    - jefe de obrador, gerencia y administración: el panel del resumen
 *      (`resumen/panel.js`). Qué cifras de dinero ve cada uno lo decide el caso
 *      de uso, no esta vista.
 *
 *  La raíz sigue siendo `<main class="inicio">` con la navegación del sistema:
 *  el resto de la aplicación y las pruebas cuentan con ella.
 */

import { el, icon } from '../lib/dom.js';
import { buildHash } from '../core/router.js';
import { resumenOperacion } from '../core/operacion.js';
import { ICON_AVANZAR, ICON_PLAN } from '../lib/iconos.js';
import { renderNavigation } from './navigation.js';
import { renderResumen } from './resumen/panel.js';

/** Roles que ven el panel de gestión. El operario (o una sesión sin rol) no. */
const VEN_EL_PANEL = new Set(['obrador', 'gerencia', 'admin']);

export function renderInicio(options) {
  const recipes = options.recipes || [];
  const lotes = options.lotes || [];
  const r = resumenOperacion(recipes, lotes);
  const ruta = (modulo) => buildHash({ modulo, name: 'index', id: modulo === 'recetario' ? null : options.recetaDeFondo || null });
  const aviso = r.bodega.vencidos ? `${r.bodega.vencidos} lotes vencidos` : r.bodega.proximos ? `${r.bodega.proximos} lotes vencen pronto` : null;

  const modulos = el('nav', { class: 'inicio__modulos resumen__modulos', attrs: { 'aria-label': 'Módulos del sistema' } }, [
    modulo('Recetario', `${recipes.length} fórmulas`, 'recetario'),
    modulo('Producción', 'Calendario y costeo', 'plan'),
    modulo('Ingredientes', `${r.catalogo.distintos} en el catálogo`, 'ingredientes'),
    modulo('Bodega', `${r.bodega.lotes} lotes registrados`, 'almacen', aviso),
  ]);

  const contenido = VEN_EL_PANEL.has(options.usuario?.rol)
    ? renderResumen({
      usuario: options.usuario,
      cargarPanel: options.cargarPanel,
      estadoMetas: options.estadoMetas,
      onGuardarMetas: options.onGuardarMetas,
      prepararEjemplo: options.prepararEjemplo,
      hrefDe: options.hrefDe,
      modulos,
    })
    : renderOperario(options.usuario, ruta('plan'), modulos);

  return el('main', { class: 'inicio' }, [renderNavigation('inicio', options.onSettings), contenido]);

  function modulo(nombre, dato, clave, avisoModulo) {
    return el('a', { class: 'modulo', href: ruta(clave), dataset: { tono: clave } }, [
      el('div', { class: 'modulo__texto' }, [el('span', { class: 'modulo__nombre', text: nombre }), el('span', { class: 'modulo__dato', text: dato })]),
      avisoModulo ? el('span', { class: 'modulo__aviso', text: avisoModulo }) : null,
      icon(ICON_AVANZAR, { class: 'modulo__arrow' }),
    ]);
  }
}

/** Lo que ve el operario: su producción de hoy, a un toque. */
function renderOperario(usuario, hrefProduccion, modulos) {
  const nombre = usuario?.nombre ? usuario.nombre.split(/\s+/)[0] : null;
  return el('div', { class: 'dashboard resumen resumen--operario' }, [
    el('header', { class: 'resumen__cabecera' }, [
      el('div', { class: 'resumen__titulos' }, [
        el('p', { class: 'eyebrow', text: 'ZAHAVI / OPERACIONES' }),
        el('h1', { class: 'resumen__titulo', text: nombre ? `Hola, ${nombre}` : 'Hola' }),
      ]),
    ]),
    el('section', { class: 'resumen__seccion resumen-operario', attrs: { 'aria-labelledby': 'resumen-operario-titulo' } }, [
      icon(ICON_PLAN, { class: 'resumen-operario__icono' }),
      el('div', { class: 'resumen-operario__texto' }, [
        el('h2', { id: 'resumen-operario-titulo', class: 'resumen__titulo-seccion', text: 'Tu producción de hoy' }),
        el('p', { text: 'Lo que te asignaron para hoy, receta por receta, está en Producción.' }),
      ]),
      el('a', { class: 'btn btn--accent resumen-operario__ir', href: hrefProduccion }, [
        el('span', { text: 'Ir a mi producción' }), icon(ICON_AVANZAR, { class: 'btn__icon' }),
      ]),
    ]),
    el('footer', { class: 'resumen__pie' }, [
      el('h2', { class: 'resumen__pie-titulo', text: 'Módulos' }),
      modulos,
    ]),
  ]);
}
