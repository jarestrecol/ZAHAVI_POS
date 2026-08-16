/**
 * =============================================================================
 *  VALIDADOR DE INGREDIENTES
 * =============================================================================
 *
 *  La lista de todos los ingredientes distintos que se usan en el recetario,
 *  con cuantas recetas los llevan y cuanto se gasta de cada uno.
 *
 *  Responde a preguntas que hasta ahora obligaban a abrir las recetas una por
 *  una:
 *
 *      ¿Cuantos productos distintos manejo de verdad?
 *      ¿Cuales son los que mas peso tienen en la produccion?
 *      ¿En que recetas entra este ingrediente?
 *      ¿Cuales se usan en una sola receta?
 *
 *  Es tambien la antesala del costeo: el total por unidad que se muestra aqui
 *  es justo la cifra que habra que multiplicar por el precio de cada producto.
 *
 *  Solo lee: no cambia ninguna receta ni guarda nada.
 */

import { el, clear } from '../lib/dom.js';
import { titleCase, splitName, formatQty, yieldLabel } from '../lib/format.js';
import { navigate } from '../core/router.js';
import {
  catalogoIngredientes,
  filtrarIngredientes,
  ordenarPorNombre,
  ordenarPorUso,
  resumenCatalogo,
} from '../core/ingredients.js';
import { createWindow } from './window.js';

/**
 * @param {{recipes: Array, onClose: () => void}} options
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openIngredients(options) {
  const catalogo = catalogoIngredientes(options.recipes);
  const cuenta = resumenCatalogo(catalogo);

  /** Orden vigente: por uso o alfabetico. */
  let orden = 'uso';

  /** Ingrediente cuyas recetas estan desplegadas, o null. */
  let abierto = null;

  const buscador = el('input', {
    type: 'search',
    id: 'ing-buscar',
    class: 'field',
    placeholder: 'Buscar ingrediente…',
    autocomplete: 'off',
    on: { input: () => dibujar() },
  });

  const lista = el('ul', { class: 'ings__lista' });
  const contador = el('p', { class: 'ings__contador', attrs: { role: 'status' } });

  const botonUso = el('button', {
    type: 'button',
    class: 'ings__orden-btn',
    text: 'Más usados',
    attrs: { 'aria-pressed': 'true' },
    on: { click: () => cambiarOrden('uso') },
  });

  const botonAZ = el('button', {
    type: 'button',
    class: 'ings__orden-btn',
    text: 'A–Z',
    attrs: { 'aria-pressed': 'false' },
    on: { click: () => cambiarOrden('nombre') },
  });

  function cambiarOrden(nuevo) {
    orden = nuevo;
    botonUso.setAttribute('aria-pressed', String(nuevo === 'uso'));
    botonAZ.setAttribute('aria-pressed', String(nuevo === 'nombre'));
    dibujar();
  }

  /* ---------------------------------------------------------------------
   *  Pintado de la lista
   * ------------------------------------------------------------------ */

  function dibujar() {
    const filtrados = filtrarIngredientes(catalogo, buscador.value);
    const ordenados = orden === 'uso' ? ordenarPorUso(filtrados) : ordenarPorNombre(filtrados);

    contador.textContent =
      ordenados.length === catalogo.length
        ? `${catalogo.length} ingredientes distintos`
        : `${ordenados.length} de ${catalogo.length}`;

    clear(lista);

    if (ordenados.length === 0) {
      lista.appendChild(
        el('li', { class: 'ings__vacio', text: 'Ningún ingrediente coincide con la búsqueda.' }),
      );
      return;
    }

    for (const ingrediente of ordenados) lista.appendChild(renderIngrediente(ingrediente));
  }

  /**
   * Una fila del catalogo.
   *
   * @param {object} ingrediente
   * @returns {HTMLElement}
   */
  function renderIngrediente(ingrediente) {
    const estaAbierto = abierto === ingrediente.nombre;
    const variasUnidades = ingrediente.totales.length > 1;

    return el('li', { class: 'ings__item' + (variasUnidades ? ' ings__item--unidades' : '') }, [
      // Toda la fila es UN SOLO boton con tres columnas por dentro: nombre,
      // total y recetas. Antes el nombre y el recuento iban dentro del boton y
      // los totales en un parrafo aparte, asi que cada bloque se alineaba por
      // su cuenta y la lista se veia torcida al recorrerla en vertical. Con una
      // sola rejilla, las tres columnas quedan a plomo en las 159 filas.
      el(
        'button',
        {
          type: 'button',
          class: 'ings__fila',
          dataset: { nombre: ingrediente.nombre },
          attrs: {
            'aria-expanded': String(estaAbierto),
            // El `aria-label` SUSTITUYE al contenido del boton, asi que tiene
            // que decir las tres columnas. Antes se dejaba fuera el total por
            // unidad, que es justo la cifra que da sentido a esta pantalla y la
            // que sostiene el costeo: quien usa lector de pantalla oia el
            // nombre y el recuento, y la columna del medio no existia.
            'aria-label': `${ingrediente.nombre}, ${totalesTexto(ingrediente)}, en ${ingrediente.recetas} ${
              ingrediente.recetas === 1 ? 'receta' : 'recetas'
            }. ${estaAbierto ? 'Ocultar' : 'Ver'} cuáles`,
          },
          on: {
            click: () => {
              abierto = estaAbierto ? null : ingrediente.nombre;
              dibujar();
              enfocarFila(ingrediente.nombre);
            },
          },
        },
        [
          el('span', { class: 'ings__nombre', text: titleCase(ingrediente.nombre) }),

          // Total gastado, con una cifra por unidad. Nunca se suman entre si.
          el(
            'span',
            { class: 'ings__totales' },
            ingrediente.totales.map((t) =>
              el('span', { class: 'ings__total' }, [
                el('span', { class: 'ings__total-num', text: formatQty(t.total) }),
                el('span', { class: 'ings__total-unidad', text: t.unidad.toLowerCase() }),
              ]),
            ),
          ),

          // Cuantas recetas lo llevan: es la medida de su peso real en la
          // produccion, mas util que el numero de lineas.
          el('span', { class: 'ings__recetas' }, [
            el('span', { class: 'ings__recetas-num', text: String(ingrediente.recetas) }),
            el('span', {
              class: 'ings__recetas-label',
              text: ingrediente.recetas === 1 ? 'receta' : 'recetas',
            }),
          ]),
        ],
      ),

      // Marca de que este ingrediente se mide de dos formas distintas. Hoy es
      // informacion; para el costeo sera una decision obligatoria, porque no
      // se puede poner un precio sin saber a que unidad corresponde.
      variasUnidades
        ? el('p', {
            class: 'ings__aviso',
            text: `Se mide de ${ingrediente.totales.length} formas distintas. Para ponerle precio habrá que unificar la unidad.`,
          })
        : null,

      estaAbierto ? renderRecetas(ingrediente) : null,
    ]);
  }

  /**
   * Devuelve el foco a la fila que se acaba de desplegar.
   *
   * Redibujar la lista destruye el boton pulsado. Sin esto el foco cae al
   * principio del documento y quien navega con teclado pierde el sitio entre
   * 159 filas justo despues de abrir una.
   *
   * @param {string} nombre
   */
  function enfocarFila(nombre) {
    for (const boton of lista.querySelectorAll('.ings__fila')) {
      if (boton.dataset.nombre === nombre) {
        boton.focus();
        return;
      }
    }
  }

  /**
   * Las recetas que usan un ingrediente, desplegadas bajo su fila.
   *
   * Cada entrada ocupa una fila de altura fija y una sola linea de texto. Antes
   * eran enlaces de alto libre repartidos en columnas: los nombres largos
   * pasaban a dos lineas, esa fila de la rejilla crecia, y el texto de las
   * entradas cortas quedaba centrado a media altura respecto a sus vecinas. El
   * resultado se leia torcido justo donde hace falta recorrer la lista deprisa.
   *
   * El nombre completo sigue siendo el contenido del boton, asi que el recorte
   * es solo visual: los lectores de pantalla lo anuncian entero.
   */
  function renderRecetas(ingrediente) {
    return el(
      'ul',
      { class: 'ings__recetas-lista' },
      ingrediente.enRecetas.map((receta) =>
        el('li', { class: 'ings__receta' }, [
          el('button', {
            type: 'button',
            class: 'ings__receta-btn',
            attrs: { 'data-category': receta.categoria },
            on: {
              click: () => {
                navigate({ name: 'detail', id: receta.id });
                options.onClose();
              },
            },
          }, [
            el('span', { class: 'ings__receta-dot', attrs: { 'aria-hidden': 'true' } }),
            el('span', {
              class: 'ings__receta-nombre',
              text: titleCase(splitName(receta.nombre).base),
            }),
            // El rendimiento distingue las que comparten nombre base. Sin el,
            // un ingrediente que entre en las cuatro Sacher Torte muestra
            // cuatro filas identicas y no hay forma de elegir.
            yieldLabel(receta.nombre)
              ? el('span', { class: 'ings__receta-rinde', text: yieldLabel(receta.nombre) })
              : null,
          ]),
        ]),
      ),
    );
  }

  dibujar();

  /* ---------------------------------------------------------------------
   *  Ventana
   * ------------------------------------------------------------------ */

  const body = el('div', { class: 'ings' }, [
    el('div', { class: 'ings__resumen' }, [
      ...dato(String(cuenta.distintos), 'distintos'),
      ...dato(String(cuenta.lineas), 'líneas'),
      ...dato(String(cuenta.enUnaSolaReceta), 'en una sola receta'),
      ...dato(String(cuenta.conVariasUnidades), 'con varias unidades'),
    ]),

    el('div', { class: 'ings__controles' }, [
      el('div', { class: 'ings__buscar' }, [
        el('label', { class: 'sr-only', for: 'ing-buscar', text: 'Buscar ingrediente' }),
        buscador,
      ]),
      el('div', { class: 'ings__orden', attrs: { role: 'group', 'aria-label': 'Ordenar' } }, [
        botonUso,
        botonAZ,
      ]),
    ]),

    contador,

    // Encabezado de columnas: comparte la misma rejilla que las filas, asi que
    // cada rotulo cae justo encima de su columna. Es lo que convierte una lista
    // de 159 lineas en algo que se lee como tabla.
    el('div', { class: 'ings__encabezado', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { text: 'Ingrediente' }),
      el('span', { text: 'Total' }),
      el('span', { text: 'Recetas' }),
    ]),

    lista,
  ]);

  return createWindow({
    title: 'Ingredientes',
    meta: `${cuenta.distintos} distintos en ${cuenta.lineas} líneas`,
    size: 'wide',
    onClose: options.onClose,
    body,
    footer: [
      el('p', {
        class: 'win__hint',
        text: 'Los totales de cada unidad no se suman entre sí. Base para el costeo por receta.',
      }),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: 'Cerrar',
          on: { click: options.onClose },
        }),
      ]),
    ],
  });
}

/**
 * Los totales de un ingrediente, en texto corrido para leerse en voz alta.
 *
 * Nunca los suma entre si, igual que la pantalla: "4.500 gr, 12 und" son dos
 * cifras distintas de la misma compra.
 *
 * @param {object} ingrediente
 * @returns {string}
 */
function totalesTexto(ingrediente) {
  if (!ingrediente.totales.length) return 'sin cantidad';
  return ingrediente.totales
    .map((t) => `${formatQty(t.total)} ${t.unidad.toLowerCase()}`)
    .join(', ');
}

/** Una cifra del resumen de cabecera. */
function dato(valor, etiqueta) {
  return [
    el('div', { class: 'ings__dato' }, [
      el('span', { class: 'ings__dato-num', text: valor }),
      el('span', { class: 'ings__dato-label', text: etiqueta }),
    ]),
  ];
}
