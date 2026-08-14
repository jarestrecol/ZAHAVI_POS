/**
 * =============================================================================
 *  EDITOR DE RECETAS
 * =============================================================================
 *
 *  La misma ventana sirve para crear una receta nueva y para modificar una que
 *  ya existe. Lo unico que cambia es de donde sale el borrador de partida y el
 *  titulo de la ventana.
 *
 *  COMO ESTA REPARTIDA LA PANTALLA
 *  -------------------------------
 *
 *      IDENTIDAD      arriba, a todo el ancho: nombre y categoria
 *      INGREDIENTES   panel izquierdo: componentes, cada uno con sus lineas
 *      METODO         panel derecho: texto libre
 *
 *  Se edita sobre una COPIA, nunca sobre la receta original. Mientras la
 *  ventana esta abierta, el recetario no se entera de nada: solo al pulsar
 *  Guardar se valida el borrador entero y se entrega. Cancelar, cerrar o pulsar
 *  Escape dejan la receta exactamente como estaba, sin necesidad de deshacer
 *  nada.
 *
 *  QUE SE REPINTA Y CUANDO
 *  -----------------------
 *  Los componentes y sus lineas se redibujan solos cuando se anade o se quita
 *  alguno (`redrawComponents` y `redrawItems`). El resto de campos escribe
 *  directamente en el borrador segun se teclea, sin repintar: repintar mientras
 *  alguien escribe le movería el cursor.
 */

import { el, clear } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { CATEGORIES, UNITS, validateRecipe } from '../core/schema.js';
import { createWindow } from './window.js';

/** Id del datalist compartido por todos los campos de ingrediente. */
const CATALOG_ID = 'catalogo-ingredientes';

/** Id del datalist de unidades. */
const UNITS_ID = 'catalogo-unidades';

/**
 * Abre el editor sobre una copia del borrador. El original no se toca hasta guardar.
 *
 * @param {Object} options
 * @param {object} options.draft receta a editar
 * @param {boolean} options.isNew
 * @param {Array<{nombre: string, unidad: string}>} options.ingredientes catalogo
 * @param {(recipe: object) => void} options.onSave
 * @param {() => void} options.onCancel
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openEditor(options) {
  // Copia profunda: cancelar debe dejar la receta original intacta.
  const draft = JSON.parse(JSON.stringify(options.draft));
  const unitByIngredient = buildUnitLookup(options.ingredientes);

  const errorBox = el('p', { class: 'form-error', attrs: { role: 'alert' } });
  const componentsHost = el('div', { class: 'editor__components' });

  const redrawComponents = () => {
    clear(componentsHost);
    draft.componentes.forEach((component, index) => {
      componentsHost.appendChild(renderComponent(component, index));
    });
  };

  /* =======================================================================
   *  1. UN COMPONENTE (masa, relleno, cobertura...)
   * ==================================================================== */

  /**
   * Dibuja un componente entero: su nombre, la cabecera de columnas, sus
   * lineas de ingrediente y el boton de anadir una mas.
   *
   * El boton de quitar el componente solo aparece si hay mas de uno: una
   * receta sin ningun componente no tendria donde poner los ingredientes.
   *
   * @param {{nombre: string, items: Array}} component
   * @param {number} componentIndex posicion dentro del borrador
   * @returns {HTMLElement}
   */
  function renderComponent(component, componentIndex) {
    const itemsHost = el('div', { class: 'rows' });

    const redrawItems = () => {
      clear(itemsHost);
      component.items.forEach((item, itemIndex) => {
        itemsHost.appendChild(renderItemRow(item, componentIndex, itemIndex, component, redrawItems));
      });
    };
    redrawItems();

    return el('fieldset', { class: 'component-edit' }, [
      el('legend', { class: 'sr-only', text: `Componente ${componentIndex + 1}` }),
      el('div', { class: 'component-edit__head' }, [
        el('label', {
          class: 'sr-only',
          for: `comp-${componentIndex}`,
          text: 'Nombre del componente',
        }),
        el('input', {
          type: 'text',
          id: `comp-${componentIndex}`,
          class: 'field field--component',
          value: component.nombre,
          placeholder: 'Nombre del componente',
          on: {
            input: (event) => {
              component.nombre = event.target.value.toUpperCase();
            },
          },
        }),
        draft.componentes.length > 1
          ? el('button', {
              type: 'button',
              class: 'btn-icon',
              text: '×',
              attrs: { 'aria-label': `Quitar componente ${component.nombre || componentIndex + 1}` },
              on: {
                click: () => {
                  draft.componentes.splice(componentIndex, 1);
                  redrawComponents();
                  announce('Componente eliminado.');
                },
              },
            })
          : null,
      ]),
      el('div', { class: 'rows__head', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { text: 'ingrediente' }),
        el('span', { class: 'rows__num', text: 'cant.' }),
        el('span', { text: 'und' }),
        el('span'),
      ]),
      itemsHost,
      el('button', {
        type: 'button',
        class: 'btn-link',
        text: '+ ingrediente',
        on: {
          click: () => {
            component.items.push({ ingrediente: '', cantidad: '', unidad: 'GR' });
            redrawItems();
            focusLastIngredient(itemsHost);
          },
        },
      }),
    ]);
  }

  /* =======================================================================
   *  2. UNA LINEA DE INGREDIENTE
   * ==================================================================== */

  /**
   * Una fila del componente: ingrediente, cantidad, unidad y quitar.
   *
   * El nombre y la unidad se pasan a mayusculas segun se escriben, para que
   * las 121 recetas mantengan el mismo criterio que traian de origen y el
   * autocompletado encuentre coincidencias.
   *
   * @param {{ingrediente: string, cantidad: string|number, unidad: string}} item
   * @param {number} componentIndex
   * @param {number} itemIndex
   * @param {object} component componente al que pertenece la linea
   * @param {() => void} redrawItems repinta las lineas tras quitar una
   * @returns {HTMLElement}
   */
  function renderItemRow(item, componentIndex, itemIndex, component, redrawItems) {
    const rowId = `it-${componentIndex}-${itemIndex}`;

    const unitInput = el('input', {
      type: 'text',
      id: rowId + '-u',
      class: 'field',
      value: item.unidad,
      placeholder: 'gr',
      attrs: { list: UNITS_ID, 'aria-label': 'Unidad' },
      on: {
        input: (event) => {
          item.unidad = event.target.value.toUpperCase();
        },
      },
    });

    return el('div', { class: 'row' }, [
      el('input', {
        type: 'text',
        id: rowId + '-i',
        class: 'field',
        value: item.ingrediente,
        placeholder: 'Ingrediente',
        attrs: { list: CATALOG_ID, 'aria-label': 'Ingrediente' },
        on: {
          input: (event) => {
            item.ingrediente = event.target.value.toUpperCase();
          },
          // Al elegir un ingrediente conocido se propone su unidad habitual,
          // solo si la casilla de unidad sigue vacia.
          change: (event) => {
            const suggested = unitByIngredient.get(event.target.value.toUpperCase());
            if (suggested && unitInput.value.trim() === '') {
              unitInput.value = suggested;
              item.unidad = suggested;
            }
          },
        },
      }),
      el('input', {
        type: 'text',
        inputMode: 'decimal',
        id: rowId + '-c',
        class: 'field field--num',
        value: item.cantidad,
        placeholder: '0',
        attrs: { 'aria-label': 'Cantidad' },
        on: {
          input: (event) => {
            item.cantidad = event.target.value;
          },
        },
      }),
      unitInput,
      el('button', {
        type: 'button',
        class: 'btn-icon',
        text: '×',
        attrs: { 'aria-label': 'Quitar esta línea' },
        on: {
          click: () => {
            component.items.splice(itemIndex, 1);
            // Un componente nunca se queda sin ninguna fila: si se quita la
            // ultima, entra una vacia en su lugar. Dejarlo a cero mostraba un
            // componente con nombre y nada debajo, y la unica salida era
            // borrar el componente entero y volver a crearlo.
            if (component.items.length === 0) {
              component.items.push({ ingrediente: '', cantidad: '', unidad: 'GR' });
            }
            redrawItems();
          },
        },
      }),
    ]);
  }

  redrawComponents();

  /* =======================================================================
   *  3. LA VENTANA COMPLETA
   * ==================================================================== */

  const body = el('div', { class: 'editor' }, [
    el('div', { class: 'editor__identity' }, [
      el('div', { class: 'editor__name' }, [
        el('label', { class: 'label', for: 'recipe-name', text: 'nombre de la receta' }),
        el('input', {
          type: 'text',
          id: 'recipe-name',
          class: 'field field--title',
          value: draft.nombre,
          placeholder: 'Ej. Torta de banano x 2 und',
          attrs: { required: true, autocomplete: 'off' },
          on: {
            input: (event) => {
              draft.nombre = event.target.value;
            },
          },
        }),
      ]),
      el('div', null, [
        el('label', { class: 'label', for: 'recipe-category', text: 'categoría' }),
        el(
          'select',
          {
            id: 'recipe-category',
            class: 'field',
            on: {
              change: (event) => {
                draft.categoria = event.target.value;
              },
            },
          },
          categoryOptions(draft.categoria),
        ),
      ]),
    ]),
    el('div', { class: 'editor__panes' }, [
      el('section', { class: 'editor__pane' }, [
        el('div', { class: 'editor__pane-head' }, [
          el('h3', { class: 'section-label', text: 'Ingredientes' }),
          el('button', {
            type: 'button',
            class: 'btn btn--quiet',
            text: '+ Componente',
            on: {
              click: () => {
                draft.componentes.push({
                  nombre: 'NUEVO COMPONENTE',
                  items: [{ ingrediente: '', cantidad: '', unidad: 'GR' }],
                });
                redrawComponents();
                announce('Componente agregado.');
              },
            },
          }),
        ]),
        componentsHost,
      ]),
      el('section', { class: 'editor__pane' }, [
        el('label', { class: 'section-label', for: 'recipe-method', text: 'Método de preparación' }),
        el('textarea', {
          id: 'recipe-method',
          class: 'field field--method',
          rows: 20,
          value: draft.metodo || '',
          placeholder: 'Escribe aquí paso a paso el método de preparación…',
          on: {
            input: (event) => {
              draft.metodo = event.target.value;
            },
          },
        }),
      ]),
    ]),
    errorBox,
    buildDatalist(CATALOG_ID, options.ingredientes.map((i) => i.nombre)),
    buildDatalist(UNITS_ID, UNITS),
  ]);

  /**
   * Valida el borrador entero y, si esta correcto, lo entrega.
   *
   * La validacion ocurre aqui y no mientras se escribe: avisar campo por campo
   * mientras alguien teclea una cantidad a medias solo estorba. El error se
   * muestra dentro del formulario y se anuncia a los lectores de pantalla,
   * nunca en un `alert()` del navegador.
   */
  const save = () => {
    const result = validateRecipe(draft);
    if (!result.ok) {
      errorBox.textContent = result.message;
      announce(result.message, 'assertive');
      return;
    }
    errorBox.textContent = '';
    options.onSave(result.value);
  };

  return createWindow({
    title: options.isNew ? 'Nueva receta' : 'Editar receta',
    meta: 'código ' + draft.id,
    size: 'wide',
    dismissOnBackdrop: false,
    onClose: options.onCancel,
    body,
    footer: [
      el('p', { class: 'win__hint', text: 'Los cambios se guardan en este dispositivo.' }),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cancelar',
          on: { click: options.onCancel },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: 'Guardar receta',
          on: { click: save },
        }),
      ]),
    ],
  });
}

/* ===========================================================================
 *  4. AYUDANTES
 * ======================================================================== */

/**
 * Opciones del desplegable de categoria.
 *
 * Si la receta trae una categoria que no esta entre las tres canonicas (puede
 * pasar con datos antiguos), se anade al final en vez de descartarla: cambiar
 * la categoria de una receta tiene que ser una decision de quien edita, no un
 * efecto secundario de abrir el editor.
 *
 * @param {string} selected categoria actual de la receta
 * @returns {Array<HTMLElement>}
 */
function categoryOptions(selected) {
  const known = CATEGORIES.includes(selected) ? CATEGORIES : [...CATEGORIES, selected];
  return known.filter(Boolean).map((name) =>
    el('option', { value: name, text: name, selected: name === selected }),
  );
}

/**
 * Lista de sugerencias para un campo (`<datalist>`).
 *
 * Se usa para los 159 ingredientes del catalogo y para las unidades. A
 * diferencia de un `<select>`, deja escribir un valor que no este en la lista:
 * hace falta para poder dar de alta un ingrediente nuevo.
 *
 * @param {string} id identificador al que apunta el atributo `list` del campo
 * @param {Array<string>} values
 * @returns {HTMLElement}
 */
function buildDatalist(id, values) {
  return el(
    'datalist',
    { id },
    values.map((value) => el('option', { value })),
  );
}

/**
 * Indice de ingrediente a su unidad habitual.
 *
 * Sirve para proponer la unidad al elegir un ingrediente conocido y ahorrar
 * ese paso, que se repite en cada linea de cada receta.
 *
 * @param {Array<{nombre: string, unidad: string}>} ingredientes
 * @returns {Map<string, string>}
 */
function buildUnitLookup(ingredientes) {
  const map = new Map();
  for (const item of ingredientes) {
    if (item.nombre && item.unidad) map.set(item.nombre.toUpperCase(), item.unidad);
  }
  return map;
}

/**
 * Lleva el cursor a la fila recien anadida.
 *
 * Sin esto, tras pulsar "+ ingrediente" habia que ir a buscar el campo con el
 * raton o con el tabulador, y se anaden muchas seguidas.
 *
 * @param {HTMLElement} host contenedor de las filas del componente
 */
function focusLastIngredient(host) {
  const inputs = host.querySelectorAll('input[list="' + CATALOG_ID + '"]');
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
}
