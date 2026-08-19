/**
 * Ficha de receta.
 *
 * El orden de la pantalla sigue el orden del trabajo: primero se pesa todo,
 * despues se ejecuta. Por eso los ingredientes ocupan el ancho completo y el
 * metodo va debajo, en lugar de repartir la pantalla en dos mitades donde la
 * columna util queda estrecha y la otra vacia.
 *
 * La cantidad es el elemento mayor de cada linea: quien pesa ya sabe que
 * ingrediente sigue, lo que necesita reconocer de un vistazo es la cifra.
 */

import { el, svg } from '../lib/dom.js';
import { titleCase, splitName, splitYield, formatQty } from '../lib/format.js';
import { navigate } from '../core/router.js';
import { setState } from '../core/store.js';
import { countItems } from '../core/search.js';
import {
  FACTORES,
  FACTOR_ORIGINAL,
  escalarReceta,
  esEscalable,
  normalizarFactor,
  rendimientoBase,
  rendimientoEscalado,
  tieneMedidasFijas,
} from '../core/scale.js';

/** Unidades de volumen: se marcan aparte porque confundirlas con peso es el error clasico. */
const VOLUME_UNITS = new Set(['ML', 'L', 'CC']);

/** Cuantos colores de estacion hay. El recetario nunca pasa de cuatro componentes. */
const ESTACIONES = 4;

/**
 * Que color de estacion le toca a un componente por su posicion.
 *
 * Da la vuelta si algun dia hubiera mas de cuatro: repetir un color es peor que
 * quedarse sin ninguno, pero no debe romper.
 *
 * @param {number} indice
 * @returns {string} "1" a "4"
 */
function estacion(indice) {
  return String((indice % ESTACIONES) + 1);
}

/*
 * -----------------------------------------------------------------------------
 *  ICONOS DE LAS ACCIONES
 * -----------------------------------------------------------------------------
 *
 *  Dibujados a mano como trazos SVG, no traidos de ninguna libreria: son cuatro
 *  y bajar una dependencia entera para esto rompeia la regla de cero paquetes
 *  del proyecto.
 *
 *  Van SIEMPRE acompanados de su texto, nunca solos. Un icono sin etiqueta se
 *  interpreta mal, y en un obrador nadie tiene tiempo de descifrar simbolos: el
 *  icono ayuda a localizar el boton de un vistazo, la palabra dice que hace.
 *
 *  Todos comparten el mismo lienzo de 24x24 y el mismo grosor de trazo, para
 *  que se vean como una familia y no como cuatro dibujos sueltos.
 */

/** Flecha a la izquierda: volver al listado. */
const ICON_VOLVER = ['M19 12H5', 'M12 19l-7-7 7-7'];

/** Balanza: pesar. */
const ICON_PESAR = ['M12 4v16', 'M8 20h8', 'M4 8h16', 'M4 8l-2.5 5.5a3 3 0 0 0 5 0z', 'M20 8l2.5 5.5a3 3 0 0 1-5 0z'];

/** Impresora: imprimir. */
const ICON_IMPRIMIR = ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'];

/** Lapiz: editar. */
const ICON_EDITAR = ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'];

/** Papelera: eliminar. */
const ICON_ELIMINAR = ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6'];

/**
 * Construye el icono de un boton a partir de sus trazos.
 *
 * Queda oculto a los lectores de pantalla: el texto del boton, que va al lado,
 * ya dice lo mismo, y anunciarlo dos veces solo estorba.
 *
 * @param {Array<string>} paths lista de atributos `d`
 * @returns {SVGElement}
 */
function icon(paths) {
  return svg(
    'svg',
    { class: 'btn__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    paths.map((d) => svg('path', { d })),
  );
}

/**
 * Boton de la barra de acciones de la receta: icono + texto.
 *
 * @param {{label: string, icon: Array<string>, variant: string, onClick: () => void, ariaLabel?: string}} options
 * @returns {HTMLElement}
 */
function actionButton(options) {
  return el(
    'button',
    {
      type: 'button',
      class: 'btn ' + options.variant,
      attrs: options.ariaLabel ? { 'aria-label': options.ariaLabel } : null,
      on: { click: options.onClick },
    },
    // La etiqueta lleva clase propia porque en la barra flotante del celular
    // las acciones secundarias se quedan solo con el icono: sin un gancho para
    // ocultarla, los cinco botones se reparten el ancho y el texto no cabe.
    [icon(options.icon), el('span', { class: 'btn__label', text: options.label })],
  );
}

/**
 * @param {{recipe: object, canEdit: boolean, factor: number}} params
 * @returns {HTMLElement}
 */
export function renderDetail(params) {
  const original = params.recipe;
  const factor = normalizarFactor(params.factor);

  // Todo lo que se pinta debajo usa la version escalada. Con factor 1 es el
  // mismo objeto, sin copiar: es el caso mas frecuente con diferencia.
  const recipe = escalarReceta(original, factor);

  const { base, rinde } = splitName(original.nombre);
  const total = countItems(original);

  return el(
    'article',
    {
      class: 'sheet-view',
      id: 'contenido',
      attrs: { 'aria-labelledby': 'recipe-title', 'data-category': original.categoria },
    },
    [
      el('header', { class: 'sheet-head' }, [
        el('div', { class: 'sheet-head__main' }, [
          el('p', { class: 'sheet-head__eyebrow' }, [
            el('span', { class: 'sheet-head__code', text: recipe.id }),
            el('span', { class: 'sheet-head__cat', text: (recipe.categoria || '').toLowerCase() }),
          ]),
          el('h1', { class: 'sheet-head__title', id: 'recipe-title', text: titleCase(base) }),
        ]),
        /*
         * Barra de acciones, ordenada por frecuencia de uso y por riesgo:
         *
         *     Pesar        lo que mas se pulsa en el obrador, va destacado
         *     Imprimir     habitual, discreto
         *     Editar       ocasional, discreto
         *     ---------    separador
         *     Eliminar     destructivo, apartado del resto a proposito
         *
         * El separador antes de Eliminar no es decorativo: evita que el dedo
         * o el raton lo alcancen por inercia despues de pulsar Editar, que es
         * su vecino natural.
         */
        el('div', { class: 'sheet-head__actions no-print' }, [
          // Volver al listado. Va en la estructura oscura, la misma del listado
          // al que devuelve, y no en blanco como las acciones. Antes era un
          // boton discreto mas entre otros cuatro: en la barra flotante del
          // celular, donde los cinco se reparten el ancho a partes iguales, no
          // habia forma de localizar de un vistazo cual era la salida.
          actionButton({
            label: 'Recetas',
            icon: ICON_VOLVER,
            variant: 'btn--back btn--action sheet-head__back',
            ariaLabel: 'Volver al listado de recetas',
            onClick: () => navigate({ name: 'index', id: null }),
          }),

          // Pesar es la accion estrella de la ficha: la que se pulsa cada vez
          // que arranca una tanda, y la unica de la barra con relleno de marca.
          actionButton({
            label: 'Pesar',
            icon: ICON_PESAR,
            variant: 'btn--accent btn--action',
            ariaLabel: 'Abrir modo producción para pesar',
            onClick: () => setState({ production: recipe.id }),
          }),

          actionButton({
            label: 'Imprimir',
            icon: ICON_IMPRIMIR,
            variant: 'btn--quiet btn--action btn--print',
            ariaLabel: 'Imprimir la receta',
            onClick: () => window.print(),
          }),

          params.canEdit
            ? actionButton({
                label: 'Editar',
                icon: ICON_EDITAR,
                variant: 'btn--quiet btn--action btn--edit',
                ariaLabel: 'Editar la receta',
                onClick: () => navigate({ name: 'edit', id: recipe.id }),
              })
            : null,

          params.canEdit
            ? el('span', { class: 'sheet-head__sep', attrs: { 'aria-hidden': 'true' } })
            : null,

          params.canEdit
            ? actionButton({
                label: 'Eliminar',
                icon: ICON_ELIMINAR,
                variant: 'btn--quiet btn--danger btn--action',
                ariaLabel: 'Eliminar la receta',
                onClick: () => setState({ confirmDelete: recipe.id }),
              })
            : null,
        ]),
      ]),

      // Ficha tecnica: los datos que deciden si esta receta sirve para el pedido.
      el('dl', { class: 'facts' }, [
        rinde ? factItem('Rinde', rendimientoTexto(original, factor), 'facts__value--seal') : null,
        factItem('Componentes', String(recipe.componentes.length)),
        factItem('Ingredientes', String(total)),
      ]),

      renderScaler(original, factor),
      renderIngredients(recipe),
      renderMethod(recipe, params.canEdit, original.id),
    ],
  );
}

/**
 * Texto del rendimiento, ya escalado si hay factor.
 *
 * Con factor 1 se muestra tal cual viene en el nombre. Con otro factor se
 * calcula el rendimiento resultante, que es el dato que de verdad interesa:
 * "voy a sacar 24 unidades", no "estoy multiplicando por tres".
 *
 * @param {object} recipe receta original, sin escalar
 * @param {number} factor
 * @returns {string}
 */
function rendimientoTexto(recipe, factor) {
  // La regla vive en `core/scale.js`. Estaba escrita aqui dentro, y por eso la
  // hoja impresa no la aplicaba: con la tanda escalada la pantalla decia una
  // cifra y el papel otra.
  return rendimientoEscalado(recipe.nombre, factor);
}

/**
 * Control para producir mas o menos cantidad de la que dice la formula.
 *
 * Dos formas de pedirlo, porque hay dos maneras de pensarlo en el obrador:
 *
 *    MULTIPLICADOR   "el doble de lo normal"      -> sirve para las 121
 *    CANTIDAD        "necesito 24 unidades"       -> solo si el nombre declara
 *                                                    el rendimiento (87 de 121)
 *
 * No guarda nada: al cambiar de receta vuelve al original. Ver `core/scale.js`.
 *
 * @param {object} recipe receta original, sin escalar
 * @param {number} factor factor vigente
 * @returns {HTMLElement}
 */
function renderScaler(recipe, factor) {
  const base = rendimientoBase(recipe.nombre);
  const activo = factor !== FACTOR_ORIGINAL;

  const botones = FACTORES.map((valor) =>
    el('button', {
      type: 'button',
      class: 'scaler__btn',
      text: valor === FACTOR_ORIGINAL ? 'Original' : '×' + String(valor).replace('.', ','),
      attrs: {
        'aria-pressed': String(valor === factor),
        'aria-label':
          valor === FACTOR_ORIGINAL
            ? 'Cantidades originales de la receta'
            : `Multiplicar la tanda por ${String(valor).replace('.', ',')}`,
      },
      on: { click: () => setState({ factor: valor }) },
    }),
  );

  // Campo para pedir una cantidad concreta. Solo tiene sentido si se sabe
  // cuanto rinde la receta original: sin esa referencia no hay forma de
  // calcular el factor.
  // La unidad de lo que rinde la receta, para ponerla junto al cuadro. Sin
  // ella, "Calcular [24]" no dice 24 de que: puede ser unidades, cajas o
  // porciones segun la receta, y esa cifra es la que decide la tanda entera.
  const unidadRinde = splitYield(recipe.nombre).unidad.toLowerCase();

  const campo = base === null
    ? null
    : el('div', { class: 'scaler__custom' }, [
        el('label', { class: 'scaler__custom-label', for: 'scaler-cantidad', text: 'Calcular' }),
        el('input', {
          type: 'number',
          id: 'scaler-cantidad',
          class: 'field field--num scaler__input',
          value: formatQty(base * factor).replace(',', '.'),
          min: '0',
          step: 'any',
          // `aria-describedby` y no `aria-hidden` en la unidad: el nombre
          // accesible de este campo lo da su `label`, y ese label dice solo
          // "Calcular". Sin esto, un lector de pantalla anuncia "Calcular, 24"
          // sin decir 24 de que, que es justo la ambiguedad que la unidad vino
          // a resolver: se arreglaba para quien ve la pantalla y no para quien
          // no la ve.
          attrs: { inputMode: 'decimal', 'aria-describedby': unidadRinde ? 'scaler-unidad' : null },
          on: {
            change: (event) => {
              const pedido = parseFloat(String(event.target.value).replace(',', '.'));
              if (!Number.isFinite(pedido) || pedido <= 0) {
                setState({ factor: FACTOR_ORIGINAL });
                return;
              }
              setState({ factor: normalizarFactor(pedido / base) });
            },
          },
        }),
        // La unidad de lo que rinde, pegada al cuadro y ENLAZADA al campo.
        unidadRinde
          ? el('span', { class: 'scaler__custom-unidad', id: 'scaler-unidad', text: unidadRinde })
          : null,
      ]);

  return el('section', { class: 'scaler no-print', attrs: { 'aria-label': 'Cantidades de la tanda' } }, [
    el('div', { class: 'scaler__row' }, [
      el('span', { class: 'scaler__label', text: 'Cantidades' }),
      el('div', { class: 'scaler__group', attrs: { role: 'group', 'aria-label': 'Multiplicador' } }, botones),
      campo,
    ]),

    // Aviso permanente mientras el factor no sea el original: nadie debe
    // imprimir o pesar una tanda escalada creyendo que son las cantidades de
    // la formula.
    activo
      ? el('p', { class: 'scaler__aviso', attrs: { role: 'status' } }, [
          el('strong', { text: `Cantidades ×${String(factor).replace('.', ',')}.` }),
          ' No es la fórmula original; nada de esto queda guardado.',
        ])
      : null,

    // Las medidas de molde y tiempo no se multiplican, y conviene decirlo
    // antes de que alguien lo note delante del horno.
    activo && tieneMedidasFijas(recipe)
      ? el('p', {
          class: 'scaler__aviso scaler__aviso--fijas',
          text: 'Las medidas de molde y los tiempos no se multiplican: revísalos a mano.',
        })
      : null,
  ]);
}

/**
 * Un dato de la ficha tecnica: etiqueta arriba, valor debajo.
 *
 * Cada pareja va envuelta en su propio contenedor. Sueltas dentro del `<dl>`
 * se colocaban todas en una misma fila corrida ("Rinde | x8 | Componentes | 2 |
 * ...") y no se veia que valor pertenecia a que etiqueta. Agrupar `dt` y `dd`
 * dentro de un `div` es HTML valido y es justo para lo que existe esa regla.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} [extraClass] modificador opcional para el valor
 * @returns {HTMLElement}
 */
function factItem(label, value, extraClass) {
  return el('div', { class: 'facts__item' }, [
    el('dt', { class: 'facts__label', text: label }),
    el('dd', { class: 'facts__value' + (extraClass ? ' ' + extraClass : ''), text: value }),
  ]);
}

function renderIngredients(recipe) {
  const multiple = recipe.componentes.length > 1;

  return el('section', { class: 'block' }, [
    el('h2', { class: 'block__title', text: 'Ingredientes' }),
    el(
      'div',
      { class: 'components' },
      // Cada componente es una ESTACION del trabajo: primero la masa, despues
      // el relleno, despues la cobertura. Por eso va numerado y con color
      // propio, y no todos con el color de la categoria: con dos componentes
      // seguidos pintados igual, no habia forma de ver donde acababa uno y
      // empezaba el siguiente al recorrer la lista de pie.
      //
      // El numero no es decoracion: los componentes SI son una secuencia, y
      // saber que vas por la segunda de tres es informacion de trabajo.
      recipe.componentes.map((component, indice) =>
        el('section', { class: 'component', attrs: { 'data-comp': estacion(indice) } }, [
          multiple
            ? el('h3', { class: 'component__name' }, [
                el('span', { class: 'component__num', text: String(indice + 1) }),
                el('span', { class: 'component__label', text: titleCase(component.nombre) }),
                el('span', {
                  class: 'component__count',
                  text: `${component.items.length} ${component.items.length === 1 ? 'ingrediente' : 'ingredientes'}`,
                }),
              ])
            : null,
          el(
            'ul',
            { class: 'items' },
            component.items.map((item) => renderItem(item)),
          ),
        ]),
      ),
    ),
  ]);
}

function renderItem(item) {
  const unit = (item.unidad || '').toUpperCase();
  const isVolume = VOLUME_UNITS.has(unit);

  // Medida de molde o de tiempo: no se multiplica al escalar la tanda, y se
  // marca para que se vea por que su cifra no cambio con las demas.
  const esFija = !esEscalable(unit);

  return el(
    'li',
    {
      class: 'item' + (isVolume ? ' item--volume' : '') + (esFija ? ' item--fija' : ''),
      attrs: esFija ? { title: 'Medida fija: no cambia al escalar la tanda' } : null,
    },
    [
      el('span', { class: 'item__name', text: titleCase(item.ingrediente) }),
      el('span', { class: 'item__qty' }, [
        el('span', { class: 'item__number', text: formatQty(item.cantidad) }),
        el('span', { class: 'item__unit', text: unit.toLowerCase() }),
      ]),
    ],
  );
}

function renderMethod(recipe, canEdit, recipeId) {
  const hasMethod = Boolean(recipe.metodo && recipe.metodo.trim());

  if (hasMethod) {
    return el('section', { class: 'block' }, [
      el('h2', { class: 'block__title', text: 'Método de preparación' }),
      // white-space: pre-wrap conserva los saltos de linea sin construir marcado.
      el('div', { class: 'method', text: recipe.metodo }),
    ]);
  }

  return el('section', { class: 'block' }, [
    el('h2', { class: 'block__title', text: 'Método de preparación' }),
    el('div', { class: 'method-empty' }, [
      el('p', { class: 'method-empty__text', text: 'Aún no hay método para esta receta.' }),
      canEdit
        ? actionButton({
            label: 'Escribir método',
            icon: ICON_EDITAR,
            variant: 'btn--quiet btn--edit no-print',
            onClick: () => navigate({ name: 'edit', id: recipeId }),
          })
        : null,
    ]),
  ]);
}

/**
 * Panel inicial, cuando todavia no se abrio ninguna receta.
 *
 * @param {{count: number, withMethod: number}} params
 * @returns {HTMLElement}
 */
export function renderPlaceholder(params) {
  return el('div', { class: 'welcome', id: 'contenido' }, [
    el('div', { class: 'welcome__inner' }, [
      el('img', {
        class: 'welcome__logo',
        src: './assets/logo-zahavi.png',
        alt: 'Zahavi, panadería, repostería y café',
        width: 254,
        height: 78,
      }),
      el('h1', { class: 'welcome__title', text: 'Recetario de producción' }),
      el('p', { class: 'welcome__lead', text: 'Elige una receta del listado o busca por nombre o ingrediente.' }),
      el('dl', { class: 'welcome__stats' }, [
        ...stat('Recetas', String(params.count)),
        ...stat('Categorías', String(params.categories)),
        ...stat('Ingredientes', String(params.ingredients)),
        ...stat('Con método', `${params.withMethod} de ${params.count}`),
      ]),
      el('p', { class: 'welcome__hint' }, [
        'Pulsa ',
        el('kbd', { text: '/' }),
        ' para buscar, ',
        el('kbd', { text: '↑' }),
        el('kbd', { text: '↓' }),
        ' para recorrer el listado.',
      ]),
    ]),
  ]);
}

function stat(label, value) {
  return [
    el('div', { class: 'welcome__stat' }, [
      el('dt', { text: label }),
      el('dd', { text: value }),
    ]),
  ];
}

/**
 * Se pidio una receta que no esta en este recetario.
 *
 * Se muestra el codigo pedido a proposito: es lo unico que permite entender que
 * paso. Con "R118" delante, quien comparte el enlace sabe que la receta se
 * elimino o se renumero; sin el, el enlace solo parece roto.
 *
 * @param {{id: string, onBack: () => void}} params
 * @returns {HTMLElement}
 */
export function renderNotFound(params) {
  return el('div', { class: 'welcome welcome--missing', id: 'contenido' }, [
    el('div', { class: 'welcome__inner' }, [
      el('p', { class: 'welcome__code', text: params.id || 'sin código' }),
      el('h1', { class: 'welcome__title', text: 'Esta receta no está aquí' }),
      el('p', {
        class: 'welcome__lead',
        text: 'Puede que se haya eliminado, que el código haya cambiado, o que este equipo todavía no tenga la última versión publicada.',
      }),
      el('div', { class: 'welcome__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: 'Volver al listado',
          on: { click: params.onBack },
        }),
      ]),
    ]),
  ]);
}
