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

import { el } from '../lib/dom.js';
import { titleCase, splitName, formatQty } from '../lib/format.js';
import { navigate } from '../core/router.js';
import { setState } from '../core/store.js';
import { countItems } from '../core/search.js';

/** A partir de cuantos ingredientes conviene repartir en columnas. */
const TWO_COLUMNS_FROM = 9;
const THREE_COLUMNS_FROM = 24;

/** Unidades de volumen: se marcan aparte porque confundirlas con peso es el error clasico. */
const VOLUME_UNITS = new Set(['ML', 'L', 'CC']);

/**
 * @param {{recipe: object, canEdit: boolean}} params
 * @returns {HTMLElement}
 */
export function renderDetail(params) {
  const recipe = params.recipe;
  const { base, rinde } = splitName(recipe.nombre);
  const total = countItems(recipe);

  return el(
    'article',
    {
      class: 'sheet-view',
      id: 'contenido',
      attrs: { 'aria-labelledby': 'recipe-title', 'data-category': recipe.categoria },
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
        el('div', { class: 'sheet-head__actions no-print' }, [
          el('button', {
            type: 'button',
            class: 'btn btn--quiet sheet-head__back',
            text: '← Recetas',
            on: { click: () => navigate({ name: 'index', id: null }) },
          }),
          el('button', {
            type: 'button',
            class: 'btn btn--primary',
            text: 'Pesar',
            attrs: { 'aria-label': 'Abrir modo producción para pesar' },
            on: { click: () => setState({ production: recipe.id }) },
          }),
          el('button', {
            type: 'button',
            class: 'btn btn--quiet',
            text: 'Imprimir',
            on: { click: () => window.print() },
          }),
          params.canEdit
            ? el('button', {
                type: 'button',
                class: 'btn btn--quiet',
                text: 'Editar',
                on: { click: () => navigate({ name: 'edit', id: recipe.id }) },
              })
            : null,
          params.canEdit
            ? el('button', {
                type: 'button',
                class: 'btn btn--quiet btn--danger',
                text: 'Eliminar',
                on: { click: () => setState({ confirmDelete: recipe.id }) },
              })
            : null,
        ]),
      ]),

      // Ficha tecnica: los datos que deciden si esta receta sirve para el pedido.
      el('dl', { class: 'facts' }, [
        ...(rinde ? factItem('Rinde', rinde.toLowerCase(), 'facts__value--seal') : []),
        ...factItem('Componentes', String(recipe.componentes.length)),
        ...factItem('Ingredientes', String(total)),
      ]),

      renderIngredients(recipe, total),
      renderMethod(recipe, params.canEdit),
    ],
  );
}

function factItem(label, value, extraClass) {
  return [
    el('dt', { class: 'facts__label', text: label }),
    el('dd', { class: 'facts__value' + (extraClass ? ' ' + extraClass : ''), text: value }),
  ];
}

function renderIngredients(recipe, total) {
  const multiple = recipe.componentes.length > 1;
  const columns = total >= THREE_COLUMNS_FROM ? 3 : total >= TWO_COLUMNS_FROM ? 2 : 1;

  return el('section', { class: 'block' }, [
    el('h2', { class: 'block__title', text: 'Ingredientes' }),
    el(
      'div',
      { class: 'components components--cols-' + columns },
      recipe.componentes.map((component) =>
        el('section', { class: 'component' }, [
          multiple ? el('h3', { class: 'component__name', text: titleCase(component.nombre) }) : null,
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

  return el('li', { class: 'item' + (isVolume ? ' item--volume' : '') }, [
    el('span', { class: 'item__name', text: titleCase(item.ingrediente) }),
    el('span', { class: 'item__qty' }, [
      el('span', { class: 'item__number', text: formatQty(item.cantidad) }),
      el('span', { class: 'item__unit', text: unit.toLowerCase() }),
    ]),
  ]);
}

function renderMethod(recipe, canEdit) {
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
        ? el('button', {
            type: 'button',
            class: 'btn btn--quiet no-print',
            text: 'Escribir método',
            on: { click: () => navigate({ name: 'edit', id: recipe.id }) },
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
