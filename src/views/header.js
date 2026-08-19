/**
 * Barra superior: marca y acciones.
 *
 * El buscador ya no vive aqui: se movio al listado, justo debajo de los
 * filtros de categoria (ver `views/sidebar.js`). Buscar y filtrar son la misma
 * tarea, acotar el listado, asi que sus dos controles van juntos y encima de
 * lo que afectan, en vez de repartidos en dos zonas distintas de la pantalla.
 */

import { el, svg } from '../lib/dom.js';

/*
 * Iconos de la barra. Mismo lienzo de 24x24 y mismo grosor que los de la ficha
 * (`views/detail.js`), para que se lean como una familia.
 *
 * En celular la barra se queda SOLO con los iconos: cuatro botones con texto
 * mas la marca miden unos 430px y no caben en una pantalla de 360, y como
 * `.topbar__actions` no cede ancho, lo que sobraba se salia por el borde. De
 * ahi venia el texto perdido en los bordes de Android. El nombre no se pierde:
 * va en `aria-label` y en `title`.
 */

/** Calendario: el plan del dia. */
const ICON_PLAN = [
  'M8 2v4', 'M16 2v4', 'M3 10h18',
  'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
];

/** Saco con etiqueta: el catalogo de ingredientes. */
const ICON_INGREDIENTES = [
  'M6 2h12l2 6a8 8 0 0 1-8 14 8 8 0 0 1-8-14z',
  'M9 2v3', 'M15 2v3', 'M8 12h8',
];

/** Mas dentro de un documento: receta nueva. */
const ICON_NUEVA = [
  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  'M14 2v6h6', 'M12 11v6', 'M9 14h6',
];

/** Engranaje: ajustes. */
const ICON_AJUSTES = [
  'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
];

/**
 * @param {Object} options
 * @param {boolean} options.canEdit
 * @param {() => void} options.onNewRecipe
 * @param {() => void} options.onPlan
 * @param {() => void} options.onIngredients
 * @param {() => void} options.onSettings
 * @returns {HTMLElement}
 */
export function renderHeader(options) {
  return el('header', { class: 'topbar no-print' }, [
    // La marca en la barra va en tipografia, no como imagen: el logo completo
    // es un bloque naranja con su propio fondo, y sobre la barra oscura quedaba
    // como un recorte pegado encima. El logo entero se reserva para la entrada y
    // la bienvenida, donde si funciona como pieza de marca.
    el('a', { class: 'topbar__brand', href: '#/', attrs: { 'aria-label': 'Zahavi, recetario' } }, [
      el('span', { class: 'topbar__wordmark', text: 'ZAHAVI' }),
      el('span', { class: 'topbar__dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'topbar__sub', text: 'recetario' }),
    ]),

    // Empuja las acciones al extremo derecho, ahora que el buscador ya no
    // ocupa el centro de la barra.
    el('span', { class: 'topbar__spacer' }),

    el('div', { class: 'topbar__actions' }, [
      // Planear el dia y consultar los ingredientes son tareas de jornada, no
      // de receta: por eso viven en la barra y no dentro de una ficha.
      accionBarra({
        label: 'Plan del día',
        icon: ICON_PLAN,
        variant: 'btn--dark-ghost',
        onClick: options.onPlan,
      }),

      // "Ingredientes" y no "Validador": el boton dice a donde se va, no que
      // hace el modulo por dentro. Quien busca en que recetas entra la harina
      // no piensa "voy a validar".
      accionBarra({
        label: 'Ingredientes',
        icon: ICON_INGREDIENTES,
        variant: 'btn--dark-ghost',
        onClick: options.onIngredients,
      }),

      options.canEdit
        ? accionBarra({
            label: 'Nueva receta',
            icon: ICON_NUEVA,
            variant: 'btn--accent',
            onClick: options.onNewRecipe,
          })
        : null,
      // Ajustes va SOLO como engranaje, en las tres versiones.
      //
      // Detras de este boton estan publicar, descartar cambios y administrar
      // usuarios: lo mas destructivo de la aplicacion. Con la palabra al lado
      // pesaba igual que "Plan del dia" o "Ingredientes", que son consulta pura
      // y se usan a diario, e invitaba a entrar a curiosear. El engranaje es la
      // convencion que todo el mundo reconoce para "configuracion", se sigue
      // alcanzando en un toque, y deja de competir por la atencion.
      //
      // El nombre no se pierde: va en `aria-label` y en el `title`, asi que lo
      // anuncia el lector de pantalla y aparece al dejar el cursor encima.
      accionBarra({
        label: 'Ajustes',
        icon: ICON_AJUSTES,
        variant: 'btn--dark-ghost btn--solo-icono',
        soloIcono: true,
        onClick: options.onSettings,
      }),
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
 * @param {{label: string, icon: Array<string>, variant: string, soloIcono?: boolean, onClick: () => void}} options
 * @returns {HTMLElement}
 */
function accionBarra(options) {
  return el(
    'button',
    {
      type: 'button',
      class: 'btn ' + options.variant,
      attrs: { 'aria-label': options.label, title: options.label },
      on: { click: options.onClick },
    },
    [
      svg(
        'svg',
        { class: 'btn__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
        options.icon.map((d) => svg('path', { d })),
      ),
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
        aislado + ' ',
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
    const detalle = options.sync && options.sync.texto ? ' ' + options.sync.texto : '';
    badges.push(
      el('p', { class: 'context-badge no-print' }, [
        `${cuenta} sin publicar en este equipo.${detalle} `,
        el('button', {
          type: 'button',
          class: 'context-badge__action',
          text: 'Publicar',
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
