/**
 * =============================================================================
 *  LA BARRA SUPERIOR, UNA PARA TODOS LOS MODULOS
 * =============================================================================
 *
 *  Antes esta barra era la del recetario y llevaba dentro los botones de los
 *  otros tres modulos: Plan del dia, Ingredientes y Almacen. Eso tenia sentido
 *  cuando eran ventanas que se abrian ENCIMA del recetario. Desde que cada uno
 *  es una pantalla completa por derecho propio, tener sus botones dentro de otro
 *  modulo decia lo contrario de lo que el sistema es: que el recetario es la
 *  aplicacion y los demas son accesorios suyos.
 *
 *  Ahora la barra es una sola pieza y cada modulo la llama con lo suyo:
 *
 *      subtitulo   que modulo se esta mirando  (ZAHAVI · almacén)
 *      acciones    lo que ESE modulo deja hacer, y nada mas
 *      Menú        siempre, y siempre en el mismo sitio
 *
 *  De donde se sale y a donde se vuelve no cambia segun donde estes: el boton
 *  de Menú esta en la misma posicion en los cuatro modulos. Eso es lo que
 *  convierte cuatro pantallas en un sistema.
 *
 *  AJUSTES YA NO ESTA AQUI. Vive en el menu, que es de donde cuelga todo lo
 *  demas. Detras de Ajustes estan publicar, descartar cambios y la clave del
 *  equipo: lo mas destructivo que hay, y no tiene por que estar a un toque desde
 *  la pantalla en la que se pesa.
 *
 *  El buscador tampoco vive aqui: se movio al listado, justo debajo de los
 *  filtros de categoria (ver `views/sidebar.js`). Buscar y filtrar son la misma
 *  tarea -acotar el listado-, asi que sus dos controles van juntos y encima de
 *  lo que afectan.
 */

import { el, icon } from '../lib/dom.js';
import { APP_VERSION } from '../core/version.js';
import { ICON_MENU } from '../lib/iconos.js';

/*
 * Los trazados de los iconos viven en `lib/iconos.js` desde que el menu de
 * modulos enseña los mismos simbolos. Tenerlos aqui dentro significaba que el
 * saco de los ingredientes se dibujaba dos veces, y dos dibujos del mismo
 * simbolo se separan en cuanto alguien retoca uno.
 *
 * En celular la barra se queda SOLO con los iconos: los botones con texto mas la
 * marca no caben en una pantalla de 360, y como `.topbar__actions` no cede
 * ancho, lo que sobraba se salia por el borde. De ahi venia el texto perdido en
 * los bordes de Android. El nombre no se pierde: va en `aria-label` y en
 * `title`.
 */

/**
 * @typedef {{label: string, icon: Array<string>, variant?: string,
 *            soloIcono?: boolean, onClick: () => void}} AccionDeBarra
 */

/**
 * La barra superior de un modulo.
 *
 * @param {Object} options
 * @param {string} options.subtitulo el nombre del modulo: `recetario`, `almacén`…
 * @param {() => void} options.onMenu
 * @param {Array<AccionDeBarra|null>} [options.acciones]
 * @returns {HTMLElement}
 */
export function renderBarra(options) {
  const acciones = (options.acciones || []).filter(Boolean);

  return el('header', { class: 'topbar no-print' }, [
    // La marca en la barra va en tipografia, no como imagen: el logo completo
    // es un bloque naranja con su propio fondo, y sobre la barra oscura quedaba
    // como un recorte pegado encima. El logo entero se reserva para el menu y
    // la entrada, donde si funciona como pieza de marca.
    //
    // Lleva al menu, y se dice en el nombre accesible: un enlace que se llama
    // "Zahavi, recetario" y lleva a otro sitio es una promesa rota para quien no
    // ve la pantalla.
    el(
      'a',
      {
        class: 'topbar__brand',
        href: '#/',
        attrs: { 'aria-label': 'Zahavi. Ir al menú de módulos' },
      },
      [
        el('span', { class: 'topbar__marca' }, [
          el('span', { class: 'topbar__wordmark', text: 'ZAHAVI' }),
          el('span', { class: 'topbar__dot', attrs: { 'aria-hidden': 'true' } }),
          // El nombre del modulo, que es lo unico que cambia de una pantalla a
          // otra. Sirve tambien para contestar por telefono "¿dónde estás?".
          el('span', { class: 'topbar__sub', text: options.subtitulo }),
        ]),

        // La version, debajo y en letra pequeña. Esta en la barra porque es lo
        // que se ve desde cualquier pantalla, no solo al entrar: cuando una sede
        // dice que algo no le aparece, la primera pregunta es si las dos miran
        // lo mismo, y asi se contesta sin salir de donde se este.
        el('span', { class: 'topbar__version', text: `v${APP_VERSION}` }),
      ],
    ),

    // Empuja las acciones al extremo derecho.
    el('span', { class: 'topbar__spacer' }),

    el('div', { class: 'topbar__actions' }, [
      // Volver al menu, SIEMPRE el primero de la derecha y siempre igual. El
      // logotipo tambien lleva, pero eso solo lo encuentra quien ya sabe que es
      // pulsable; este lo dice.
      accionBarra({
        label: 'Menú',
        icon: ICON_MENU,
        variant: 'btn--dark-ghost btn--solo-icono',
        soloIcono: true,
        onClick: options.onMenu,
      }),

      ...acciones.map(accionBarra),
    ]),
  ]);
}

/**
 * Un boton de la barra superior: icono, etiqueta y nombre accesible.
 *
 * La etiqueta va en un `span` propio para que el corte de celular pueda
 * ocultarla y dejar solo el icono. El nombre NO depende de ese texto: viaja
 * siempre en `aria-label`, asi que ocultarlo no deja el boton sin nombre. El
 * `title` da la misma pista con el cursor encima en escritorio.
 *
 * @param {AccionDeBarra} options
 * @returns {HTMLElement}
 */
function accionBarra(options) {
  return el(
    'button',
    {
      type: 'button',
      class: 'btn ' + (options.variant || 'btn--dark-ghost'),
      attrs: { 'aria-label': options.label, title: options.label },
      on: { click: options.onClick },
    },
    [
      icon(options.icon, { class: 'btn__icon' }),
      options.soloIcono ? null : el('span', { class: 'btn__label', text: options.label }),
    ],
  );
}

/**
 * Avisos de contexto: falta de conexion, recetario compartido caido y cambios
 * sin publicar.
 *
 * EL AVISO DE AISLAMIENTO
 * -----------------------
 * El tercero es el que evita el fallo mas caro de todos: trabajar semanas
 * creyendo que lo que se guarda llega a la otra sede cuando el sitio no tiene
 * publicacion configurada. Antes eso solo se sabia abriendo Ajustes, asi que
 * nadie lo sabia. No se muestra con el archivo abierto desde el disco, donde
 * no haber servidor es lo normal y no un fallo.
 *
 * @param {Object} options
 * @param {{dirty: boolean, total: number}} options.changes
 * @param {boolean} options.online
 * @param {{state: string}} options.server diagnostico del recetario compartido
 * @param {{motivo: string, texto: string}} options.sync estado de la publicacion automatica
 * @param {() => void} options.onOpenSettings
 * @returns {Array<HTMLElement>}
 */
export function renderBadges(options) {
  const badges = [];

  if (!options.online) {
    badges.push(
      el('p', {
        class: 'context-badge context-badge--offline no-print',
        attrs: { role: 'status' },
        text: 'Sin conexión. Puedes seguir consultando y editando: los cambios se guardan en este equipo.',
      }),
    );
  }

  const aislado = mensajeDeAislamiento(options);
  if (aislado) {
    badges.push(
      el('p', { class: 'context-badge context-badge--warn no-print', attrs: { role: 'status' } }, [
        el('span', { class: 'context-badge__text', text: aislado }),
        el('button', {
          type: 'button',
          class: 'context-badge__action',
          text: 'Ver estado',
          on: { click: options.onOpenSettings },
        }),
      ]),
    );
  }

  if (options.changes.dirty) {
    const cuenta = options.changes.total === 1 ? '1 cambio' : `${options.changes.total} cambios`;

    // El conflicto de versiones se anuncia desde que se carga, no desde el
    // primer intento de publicar: es una situacion del recetario, no del
    // automatismo, y es la unica en la que publicar puede borrar el trabajo de
    // la otra sede. Por eso va en rojo y lo dice antes que la cuenta.
    const enConflicto = Boolean(options.changes.conflict);
    const detalle = enConflicto
      ? ' Otra sede publicó una versión nueva mientras tanto: hay que decidir en Ajustes cuál se conserva.'
      : options.sync && options.sync.texto
        ? ' ' + options.sync.texto
        : '';

    badges.push(
      el('p', { class: 'context-badge no-print' + (enConflicto ? ' context-badge--warn' : '') }, [
        `${cuenta} sin publicar en este equipo.${detalle} `,
        el('button', {
          type: 'button',
          class: 'context-badge__action',
          text: enConflicto ? 'Revisar' : 'Publicar',
          on: { click: options.onOpenSettings },
        }),
      ]),
    );
  }

  return badges;
}

/**
 * Texto del aviso de aislamiento, o cadena vacia si no hay nada que avisar.
 *
 * @param {object} options los mismos que `renderBadges`
 * @returns {string}
 */
function mensajeDeAislamiento(options) {
  // Sin conexion ya hay un aviso propio, y decir ademas que el servidor no
  // responde seria repetir lo mismo con otras palabras.
  if (!options.online) return '';
  if (window.location.protocol === 'file:') return '';

  const estado = options.server ? options.server.state : 'desconocido';
  if (estado === 'sin_api') {
    return 'Este equipo no está conectado al recetario compartido: lo que guardes se queda aquí.';
  }
  if (estado === 'error') {
    return 'El recetario compartido no responde: lo que guardes se queda en este equipo.';
  }
  return '';
}
