/**
 * =============================================================================
 *  EL MENU: LA PANTALLA A LA QUE SE ENTRA
 * =============================================================================
 *
 *  Antes, entrar al sistema era entrar al recetario. Funcionaba cuando el
 *  recetario era todo lo que habia; con almacen, costeo y lo que viene detras,
 *  significaba que tres de los cuatro modulos estaban escondidos detras de un
 *  boton de una barra, dentro de otro modulo. Quien no supiera que existen no
 *  los encontraba.
 *
 *  NO ES UNA LISTA DE ENLACES, Y ESA ES LA DIFERENCIA
 *  --------------------------------------------------
 *  Cada modulo enseña UNA cifra suya, de verdad, calculada al pintar: cuantas
 *  formulas hay, cuantos ingredientes, cuantos lotes y cuantos estan por
 *  vencer. Un menu que solo tiene nombres obliga a entrar en los cuatro sitios
 *  para saber si pasa algo; con la cifra delante, la pantalla ya contesta la
 *  pregunta con la que uno llega por la mañana.
 *
 *  Y por eso el almacen puede avisar desde aqui: si hay un lote vencido, se ve
 *  antes de entrar. Es el unico aviso que no se puede dar mas tarde sin coste,
 *  porque mas tarde ya se amasó con ello.
 *
 *  REGLA DE LA CAPA: esta vista LEE de `core/` -son transformaciones de lectura,
 *  sin efectos- y no escribe nada. Todo lo que hace al pulsar sale de los
 *  callbacks que recibe.
 */

import { el, svg } from '../lib/dom.js';
import { buildHash } from '../core/router.js';
import { catalogoIngredientes, resumenCatalogo } from '../core/ingredients.js';
import { resumenAlmacen } from '../core/almacen.js';
import {
  ICON_RECETARIO,
  ICON_PLAN,
  ICON_INGREDIENTES,
  ICON_ALMACEN,
  ICON_AJUSTES,
} from '../lib/iconos.js';

/**
 * @param {Object} options
 * @param {Array} options.recipes
 * @param {Array} options.lotes
 * @param {string|null} [options.recetaDeFondo] la ficha desde la que se vino
 * @param {() => void} options.onSettings
 * @returns {HTMLElement}
 */
export function renderInicio(options) {
  const recipes = options.recipes || [];
  const catalogo = resumenCatalogo(catalogoIngredientes(recipes));
  const bodega = resumenAlmacen(options.lotes || []);

  /*
   * La receta de la que se venia viaja a los tres modulos de consulta.
   *
   * Es lo que hace que, despues de mirar la bodega, se pueda volver a la
   * formula que se estaba leyendo en vez de buscarla otra vez. La tarjeta del
   * recetario NO la lleva a proposito: lleva al listado, que es lo que su
   * nombre promete; sorprender ahi seria peor que ahorrar un toque.
   */
  const fondo = options.recetaDeFondo || null;

  return el('main', { class: 'inicio' }, [
    el('div', { class: 'inicio__cabecera' }, [
      el('img', {
        class: 'inicio__logo',
        src: './assets/logo-zahavi.png',
        alt: 'Zahavi, panadería, repostería y café',
        width: 254,
        height: 78,
      }),
      el('p', {
        class: 'inicio__lema',
        text: 'ZAHAVI POS · sistema de producción. Elige por dónde empezar.',
      }),
    ]),

    el('nav', { class: 'inicio__modulos', attrs: { 'aria-label': 'Módulos del sistema' } }, [
      tarjeta({
        nombre: 'Recetario',
        icono: ICON_RECETARIO,
        tono: 'recetario',
        // La cifra sale del recetario cargado, no de una constante: el dia que
        // la panaderia publique la 123 esta pantalla lo dice sola.
        dato: `${recipes.length} fórmulas`,
        pie: 'Consultar, escalar la tanda, pesar e imprimir',
        href: buildHash({ modulo: 'recetario', name: 'index', id: null }),
      }),

      tarjeta({
        nombre: 'Plan del día',
        icono: ICON_PLAN,
        tono: 'plan',
        dato: 'Cuánto pesar de cada cosa',
        pie: 'Junta varias recetas y suma los ingredientes',
        href: buildHash({ modulo: 'plan', id: fondo }),
      }),

      tarjeta({
        nombre: 'Ingredientes',
        icono: ICON_INGREDIENTES,
        tono: 'ingredientes',
        dato: `${catalogo.distintos} en el catálogo`,
        pie: `En qué recetas entra cada uno · ${catalogo.conVariasUnidades} con más de una unidad`,
        href: buildHash({ modulo: 'ingredientes', id: fondo }),
      }),

      tarjeta({
        nombre: 'Almacén',
        icono: ICON_ALMACEN,
        tono: 'almacen',
        dato: bodega.lotes ? `${bodega.lotes} lotes` : 'Sin lotes todavía',
        pie: 'Compras, existencias y costo de la producción',
        href: buildHash({ modulo: 'almacen', id: fondo }),
        // El aviso va con PALABRA y no solo con color, igual que en la propia
        // pantalla del almacen: a contraluz en el obrador, el color solo no se
        // distingue.
        aviso: avisoDeBodega(bodega),
      }),
    ]),

    el('div', { class: 'inicio__pie' }, [
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn--quiet',
          /*
           * El `aria-label` no es redundante con el texto: es lo que permite
           * DEVOLVERLE EL FOCO al cerrar la ventana.
           *
           * Los dialogos se montan dentro del repintado, asi que para cuando
           * uno se cierra el boton que lo abrio ya es otro nodo. `lib/a11y.js`
           * reconoce al reemplazo por `id` o por `aria-label`, y sin ninguno de
           * los dos devuelve el foco al principio de la pagina. El boton de
           * Ajustes de la barra lo tenia; este, al nacer en el menu, no.
           *
           * Nombra la unica pieza visible -el texto-, asi que cumple la regla
           * 18: el icono va `aria-hidden`.
           */
          attrs: { 'aria-label': 'Ajustes' },
          on: { click: options.onSettings },
        },
        [
          svg(
            'svg',
            { class: 'btn__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
            ICON_AJUSTES.map((d) => svg('path', { d })),
          ),
          el('span', { class: 'btn__label', text: 'Ajustes' }),
        ],
      ),
    ]),
  ]);
}

/**
 * El aviso de la tarjeta del almacen, o null si no hay nada que decir.
 *
 * Lo vencido manda sobre lo que esta por vencer: si hay las dos cosas, lo que
 * hay que hacer hoy es sacar lo vencido.
 *
 * Los dos NO se pintan igual, y no es un capricho: la pantalla del almacen ya
 * distingue `vencido` (rojo) de `proximo` (ambar) con sus propios tokens, y un
 * aviso que aqui se viera igual para las dos cosas obligaria a entrar para
 * saber cual de las dos es.
 *
 * @param {{vencidos: number, proximos: number}} bodega
 * @returns {{texto: string, estado: string}|null}
 */
function avisoDeBodega(bodega) {
  if (bodega.vencidos > 0) {
    return {
      texto: bodega.vencidos === 1 ? '1 lote vencido' : `${bodega.vencidos} lotes vencidos`,
      estado: 'vencido',
    };
  }
  if (bodega.proximos > 0) {
    return {
      texto: bodega.proximos === 1 ? '1 lote vence pronto' : `${bodega.proximos} lotes vencen pronto`,
      estado: 'proximo',
    };
  }
  return null;
}

/**
 * Una tarjeta de modulo.
 *
 * Va en un enlace y no en un boton porque lleva a una direccion: asi se puede
 * abrir en otra pestaña, copiar y compartir, y el navegador la trata como lo
 * que es. Los botones se reservan para lo que no tiene direccion, como Ajustes.
 *
 * @param {{nombre: string, icono: Array<string>, tono: string, dato: string,
 *          pie: string, href: string,
 *          aviso?: {texto: string, estado: string}|null}} options
 * @returns {HTMLElement}
 */
function tarjeta(options) {
  // El nombre accesible se arma a mano y entero. Un `aria-label` SUSTITUYE al
  // contenido en vez de complementarlo (regla 18), asi que si no nombrara las
  // tres piezas visibles, quien navegue con lector de pantalla oiria menos de
  // lo que hay escrito.
  const nombreCompleto = [
    options.nombre,
    options.dato,
    options.aviso ? options.aviso.texto : '',
    options.pie,
  ]
    .filter(Boolean)
    .join('. ');

  return el(
    'a',
    {
      class: 'modulo',
      href: options.href,
      dataset: { tono: options.tono },
      attrs: { 'aria-label': nombreCompleto },
    },
    [
      el('span', { class: 'modulo__icono', attrs: { 'aria-hidden': 'true' } }, [
        svg(
          'svg',
          { viewBox: '0 0 24 24', focusable: 'false' },
          options.icono.map((d) => svg('path', { d })),
        ),
      ]),

      el('span', { class: 'modulo__texto' }, [
        el('span', { class: 'modulo__nombre', text: options.nombre }),
        // La tipografia de cifras SOLO cuando el dato empieza por una cifra.
        // `Plan del día` no tiene ninguna que enseñar, y su frase salia en
        // monoespaciada como si lo fuera: se leia como un dato tecnico en vez
        // de como lo que es, una explicacion.
        el('span', {
          class: 'modulo__dato' + (/^\d/.test(options.dato) ? ' modulo__dato--cifra' : ''),
          text: options.dato,
        }),
        el('span', { class: 'modulo__pie', text: options.pie }),
      ]),

      options.aviso
        ? el('span', {
            class: 'modulo__aviso modulo__aviso--' + options.aviso.estado,
            text: options.aviso.texto,
          })
        : null,
    ],
  );
}
