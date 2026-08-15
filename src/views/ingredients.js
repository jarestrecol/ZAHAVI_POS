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
import { titleCase, splitName, formatQty } from '../lib/format.js';
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
          attrs: {
            'aria-expanded': String(estaAbierto),
            'aria-label': `${ingrediente.nombre}, en ${ingrediente.recetas} ${
              ingrediente.recetas === 1 ? 'receta' : 'recetas'
            }. Ver cuáles`,
          },
          on: {
            click: () => {
              abierto = estaAbierto ? null : ingrediente.nombre;
              dibujar();
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

  /** Las recetas que usan un ingrediente, desplegadas bajo su fila. */
  function renderRecetas(ingrediente) {
    return el(
      'ul',
      { class: 'ings__recetas-lista' },
      ingrediente.enRecetas.map((receta) =>
        el('li', null, [
          el('button', {
            type: 'button',
            class: 'btn-link',
            text: titleCase(splitName(receta.nombre).base),
            on: {
              click: () => {
                navigate({ name: 'detail', id: receta.id });
                options.onClose();
              },
            },
          }),
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
    title: 'Validador de ingredientes',
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

/** Una cifra del resumen de cabecera. */
function dato(valor, etiqueta) {
  return [
    el('div', { class: 'ings__dato' }, [
      el('span', { class: 'ings__dato-num', text: valor }),
      el('span', { class: 'ings__dato-label', text: etiqueta }),
    ]),
  ];
}
