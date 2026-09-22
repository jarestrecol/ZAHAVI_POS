/**
 * =============================================================================
 *  AJUSTES · TU SESION
 * =============================================================================
 *
 *  Quien esta dentro, con que rol y en que sede. Sustituye al cambio de la
 *  clave del equipo, que ya no existe: cada persona entra con su codigo y su
 *  PIN, y el PIN lo restablece el administrador, no cada uno desde su aparato.
 */

import { el } from '../../lib/dom.js';
import { ROLES } from '../../core/sesion.js';

/**
 * @param {{usuario: {nombre: string, codigo: string, rol: string, sede: {nombre: string}|null}|null,
 *   turnoHasta: number}} options
 * @returns {HTMLElement|null}
 */
export function renderSesionBlock(options) {
  const usuario = options.usuario;
  if (!usuario) return null;

  const datos = [
    ['Nombre', usuario.nombre],
    ['Código', usuario.codigo || 'sin código asignado'],
    ['Rol', ROLES[usuario.rol] || usuario.rol],
    ['Sede', usuario.sede ? usuario.sede.nombre : 'sin sede asignada'],
  ];

  // EL TURNO SE DICE ANTES DE QUE TERMINE. La sesion se cierra sola a las 6
  // horas, y enterarse al quedarse fuera en mitad de una tanda es peor que
  // saberlo aqui; ademas explica por que la aplicacion pide entrar otra vez.
  if (Number.isFinite(options.turnoHasta) && options.turnoHasta > 0) {
    datos.push([
      'Tu turno termina',
      new Date(options.turnoHasta).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    ]);
  }

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Tu sesión' }),
    el(
      'dl',
      { class: 'settings__sesion' },
      datos.flatMap(([etiqueta, valor]) => [el('dt', { text: etiqueta }), el('dd', { text: valor })]),
    ),
    el('p', {
      class: 'settings__help',
      text: 'Lo que registres queda a tu nombre. La sesión se cierra sola al terminar el turno. Para cambiar el PIN o el rol, habla con el administrador. Si dejas el equipo, cierra la sesión.',
    }),
  ]);
}
