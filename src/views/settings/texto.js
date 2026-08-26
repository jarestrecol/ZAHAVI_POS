/**
 * =============================================================================
 *  AJUSTES · TAMAÑO DEL TEXTO
 * =============================================================================
 *
 *  Cuanto se agranda o se achica el texto de las recetas EN ESTE APARATO. Ni
 *  viaja a las demas sedes ni toca el resto de la pantalla.
 */

import { el } from '../../lib/dom.js';
import { ESCALAS } from '../../core/preferencias.js';

/* ===========================================================================
 *  3. TAMAÑO DEL TEXTO
 * ======================================================================== */

/**
 * Cuanto se agranda o se achica el texto de las recetas.
 *
 * QUE ALCANZA Y QUE NO
 * --------------------
 * Solo la ficha de receta. La barra de arriba, el listado, los dialogos y las
 * hojas impresas se quedan como estan, y los objetivos tactiles tampoco se
 * mueven: los botones miden 44 px por una altura minima en `rem`, no por el
 * tamano de su letra, asi que achicar el texto no achica lo que hay que tocar
 * con las manos ocupadas.
 *
 * POR QUE EL GRUPO SE ACTUALIZA SOBRE SI MISMO
 * -------------------------------------------
 * Ajustes NO se reconstruye al cambiar la escala: su clave de dialogo, en
 * `dialogs.js`, no la incluye a proposito. Reconstruirlo llevaria el foco fuera
 * del boton que se acaba de pulsar, y elegir un tamano es justo el momento en
 * que uno quiere probar los cuatro seguidos. Asi que aqui se hace lo mismo que
 * el campo de tandas del plan: cambiar el propio DOM en el sitio.
 *
 * @param {object} options
 * @returns {HTMLElement}
 */
export function renderTextSizeBlock(options) {
  const botones = ESCALAS.map((escala) =>
    el('button', {
      type: 'button',
      class: 'escala__btn',
      text: escala.nombre,
      dataset: { escala: escala.clave },
      attrs: { 'aria-pressed': String(escala.clave === options.escalaTexto) },
      on: { click: () => elegir(escala.clave) },
    }),
  );

  function elegir(clave) {
    options.onEscalaTexto(clave);
    for (const boton of botones) {
      boton.setAttribute('aria-pressed', String(boton.dataset.escala === clave));
    }
  }

  return el('section', { class: 'settings__row' }, [
    el('h3', { class: 'section-label', text: 'Tamaño del texto' }),

    el(
      'div',
      { class: 'escala', attrs: { role: 'group', 'aria-label': 'Tamaño del texto de las recetas' } },
      botones,
    ),

    // MUESTRA VIVA, y no un porcentaje escrito.
    //
    // Es una linea de ingrediente de verdad, con la misma tipografia y los
    // mismos tamanos que la ficha, y cambia en cuanto se pulsa un boton. Decir
    // "80 %" obligaria a cerrar Ajustes, abrir una receta y volver; y ademas
    // seria la misma cifra escrita en dos sitios, porque el numero real vive en
    // `tokens.css`.
    //
    // Va oculta al lector de pantalla: no aporta nada a quien no la ve, y los
    // botones ya dicen cual esta elegido.
    el('div', { class: 'escala__muestra', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { class: 'escala__muestra-nombre', text: 'Harina' }),
      el('span', { class: 'escala__muestra-cifra', text: '1.000 GR' }),
    ]),

    el('p', {
      class: 'settings__help',
      text: 'Cambia solo el texto de las recetas, y solo en este equipo. La barra de arriba, el listado y las hojas impresas no se mueven.',
    }),
  ]);
}
