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
 *      IDENTIDAD      arriba, a todo el ancho: nombre, rendimiento y categoria
 *      INGREDIENTES   panel izquierdo: componentes, cada uno con sus lineas
 *      METODO         panel derecho: texto libre
 *
 *  EL RENDIMIENTO NO SE TECLEA DENTRO DEL NOMBRE
 *  ---------------------------------------------
 *  El dato llego del Excel escrito dentro del nombre ("ALMOJABANA X 15 UND"), y
 *  ahi se sigue almacenando. Pero PEDIRLO asi obligaba a acordarse de la
 *  formula exacta al crear cada receta, y de ese descuido salen los 13 nombres
 *  que hoy llevan `x` minuscula o "2UND" sin espacio. Peor: el escalado y el
 *  plan del dia leen esa cifra para saber cuanto rinde una tanda, asi que un
 *  nombre mal escrito deja a la receta sin rendimiento y sin que nadie se
 *  entere.
 *
 *  Aqui son tres controles: nombre, cantidad (campo numerico) y unidad (lista).
 *  Al abrir se separan con `splitYield` y al guardar se vuelven a juntar con
 *  `composeName`. La regla que protege los datos ya publicados: si nadie toco
 *  el rendimiento, el nombre se guarda BYTE A BYTE como estaba, sin pasar por
 *  la forma canonica. Reescribirlo cambiaria la identidad con la que la receta
 *  aparece en el plan, en el catalogo de ingredientes y en las busquedas.
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
import { splitYield, composeName, yieldUnitList } from '../lib/format.js';
import { CATEGORIES, UNITS, validateRecipe } from '../core/schema.js';
import { createWindow } from './window.js';

/** Id del datalist compartido por todos los campos de ingrediente. */
const CATALOG_ID = 'catalogo-ingredientes';

/** Id del datalist de unidades. */
const UNITS_ID = 'catalogo-unidades';

/**
 * Unidades de rendimiento que ofrece la lista.
 *
 * Salen de las 121 recetas reales: 73 en UND, 5 en CAJAS y 8 sin unidad. PAQ. y
 * PORCIONES estan porque el separador de nombres ya las reconoce, asi que una
 * receta escrita con ellas se sigue leyendo bien.
 */
const UNIDADES_RINDE = ['UND', 'PAQ.', 'CAJAS', 'PORCIONES'];

/**
 * Como se ESCRIBE cada unidad de rendimiento en la lista.
 *
 * El valor guardado sigue siendo la abreviatura de siempre; esto es solo lo que
 * se lee. La aplicacion maneja dos cosas distintas que se llamaban igual:
 *
 *     UNIDAD DEL INGREDIENTE   cuanto se pesa: GR, ML, UND, MG, CM
 *     UNIDAD DEL RENDIMIENTO   que sale de la receta: unidades, cajas...
 *
 * Las dos aparecen en la misma pantalla del editor y las dos ofrecian "und",
 * asi que no habia forma de saber cual era cual. Escribir la palabra entera
 * aqui las separa sin tocar el dato.
 */
const NOMBRE_UNIDAD_RINDE = Object.freeze({
  UND: 'unidades',
  'PAQ.': 'paquetes',
  CAJAS: 'cajas',
  PORCIONES: 'porciones',
});

/** Id de la aclaracion que acompaña al campo del nombre. */
const HINT_ID = 'recipe-name-hint';

/**
 * Detecta un rendimiento ESCONDIDO dentro del nombre, que el separador no supo
 * extraer porque no esta al final.
 *
 * Son 15 de las 121, como `TORTA ... X 1 UND ( SIN AZUCAR )` o `TORTA SUIZA x 2
 * GRANDES O 4 PEQUEÑAS`. En esas, el editor deja el nombre entero en el campo
 * de nombre y el de rinde vacio, asi que rellenar el rinde produciria un
 * "... X 1 UND ( SIN AZUCAR ) X 1 UND" con el rendimiento por duplicado. Es
 * exactamente donde el formulario nuevo invita a equivocarse, asi que se avisa.
 */
const RINDE_ESCONDIDO = /[Xx]\s*\d/;

/**
 * Texto de apoyo bajo el campo del nombre.
 *
 * @param {string} nombreOriginal
 * @param {{cantidad: string}} partes
 * @returns {string}
 */
function pistaNombre(nombreOriginal, partes) {
  if (partes.cantidad === '' && RINDE_ESCONDIDO.test(nombreOriginal)) {
    return 'Ojo: este nombre parece llevar el rendimiento dentro. Quítalo del nombre y escríbelo en «rinde», o quedará repetido.';
  }
  return 'Solo el nombre. Cuánto sale de la receta va en los campos de al lado.';
}

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

  /**
   * El nombre tal y como estaba al abrir, y sus tres partes editables.
   *
   * `nombreOriginal` es la referencia que permite devolverlo intacto cuando
   * nadie tocó el rendimiento.
   */
  const nombreOriginal = draft.nombre || '';
  const partes = splitYield(nombreOriginal);

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
        el('span', { text: 'medida' }),
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

  /**
   * ¿Las tres partes siguen siendo las que se leyeron al abrir la ventana?
   *
   * Se compara parte por parte y no el nombre entero: comparar los nombres
   * exigiria componer primero, que es justamente lo que hay que evitar.
   *
   * @returns {boolean}
   */
  function rindeSinCambios() {
    const original = splitYield(nombreOriginal);
    return (
      String(partes.base).trim() === original.base.trim() &&
      String(partes.cantidad).trim() === original.cantidad.trim() &&
      String(partes.unidad).trim() === original.unidad.trim()
    );
  }

  const body = el('div', { class: 'editor' }, [
    el('div', { class: 'editor__identity' }, [
      el('div', { class: 'editor__name' }, [
        el('label', { class: 'label', for: 'recipe-name', text: 'nombre de la receta' }),
        el('input', {
          type: 'text',
          id: 'recipe-name',
          class: 'field field--title',
          value: partes.base,
          placeholder: 'Ej. Torta de banano',
          attrs: { required: true, autocomplete: 'off', 'aria-describedby': HINT_ID },
          on: {
            input: (event) => {
              partes.base = event.target.value;
            },
          },
        }),
        // `id` mas `aria-describedby` en el campo: sin eso la aclaracion la ve
        // quien mira la pantalla y no la oye quien usa lector de pantalla, y es
        // justo la instruccion que evita volver a meter el rendimiento dentro
        // del nombre.
        el('p', {
          class: 'field-hint',
          id: HINT_ID,
          text: pistaNombre(nombreOriginal, partes),
        }),
      ]),

      // Rendimiento en dos controles. La cantidad es `type="number"`, asi que
      // no admite letras ni el separador equivocado; la unidad se elige, no se
      // escribe. Es lo que garantiza que la cifra que lee el escalado sea
      // siempre un numero.
      //
      // Van dentro de un `fieldset`: por separado, "rinde" y "unidad" son dos
      // etiquetas de una palabra, y quien tabula directo al desplegable oye
      // "unidad" sin saber de que. La leyenda los une en una sola pregunta.
      el('fieldset', { class: 'editor__rinde' }, [
        el('legend', { class: 'sr-only', text: 'Rendimiento de la receta' }),
        el('div', { class: 'editor__rinde-cantidad' }, [
          el('label', { class: 'label', for: 'recipe-yield-qty', text: 'rinde' }),
          el('input', {
            type: 'number',
            id: 'recipe-yield-qty',
            class: 'field field--num',
            value: partes.cantidad,
            min: '0',
            step: 'any',
            placeholder: '—',
            attrs: { autocomplete: 'off' },
            on: {
              input: (event) => {
                partes.cantidad = event.target.value;
              },
            },
          }),
        ]),
        el('div', { class: 'editor__rinde-unidad' }, [
          // "rinde en" y no "unidad".
          //
          // En esta misma pantalla, cada renglon de ingrediente tiene ya su
          // propia columna de unidad, y las dos listas ofrecian "und": con las
          // dos etiquetas llamadas igual no habia forma de saber cual era cual.
          // Llevar la palabra "rinde" dentro de la etiqueta lo resuelve sin
          // alargarla: "unidad del rinde" mide 138px en versalitas y la columna
          // de tableta son 128, asi que se partia en dos lineas y hundia el
          // campo respecto a los de al lado.
          el('label', { class: 'label', for: 'recipe-yield-unit', text: 'rinde en' }),
          el(
            'select',
            {
              id: 'recipe-yield-unit',
              class: 'field',
              on: {
                change: (event) => {
                  partes.unidad = event.target.value;
                },
              },
            },
            yieldUnitOptions(partes.unidad),
          ),
        ]),
      ]),

      el('div', { class: 'editor__categoria' }, [
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
    // El nombre almacenado se arma aqui, en el ultimo momento, a partir de las
    // tres partes. Si ninguna cambio respecto a como se abrio la ventana, se
    // devuelve el original SIN TOCAR: 13 de las 121 recetas usan `x` minuscula
    // o "2UND" sin espacio, y componer la forma canonica las reescribiria por
    // el simple hecho de haber abierto el editor a mirar.
    draft.nombre = rindeSinCambios() ? nombreOriginal : composeName(partes.base, partes.cantidad, partes.unidad);

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
 * Opciones de la unidad de rendimiento.
 *
 * Si la receta trae una unidad que no esta en la lista, se añade como opcion
 * propia en vez de descartarla. Hoy pasa con una sola receta, `BAGUEL NORMAL X
 * 32 UND O 8 PAQ.`, cuyo rendimiento es doble. Sin esta linea, abrir esa receta
 * y guardarla le borraria la mitad del rendimiento en silencio.
 *
 * @param {string} selected unidad actual, cadena vacia si no declara ninguna
 * @returns {Array<HTMLElement>}
 */
function yieldUnitOptions(selected) {
  const actual = String(selected || '').trim();
  const conocidas = yieldUnitList(UNIDADES_RINDE, actual);

  return [
    el('option', { value: '', text: 'sin unidad', selected: actual === '' }),
    ...conocidas.map((unidad) =>
      el('option', {
        value: unidad,
        // Se muestra la palabra completa aunque se GUARDE la abreviatura. Es lo
        // que quita la ambiguedad: "15 unidades" se lee solo, mientras que
        // "15 und" obligaba a adivinar si ese "und" era lo que rinde la receta
        // o la medida de un ingrediente, porque la misma abreviatura aparece en
        // las dos cosas y en la misma pantalla.
        text: NOMBRE_UNIDAD_RINDE[unidad] || unidad.toLowerCase(),
        selected: unidad === actual,
      }),
    ),
  ];
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
