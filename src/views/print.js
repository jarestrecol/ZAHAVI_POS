/**
 * Hojas de impresion A4, independientes de la maqueta de pantalla.
 *
 * Se genera la hoja que corresponde a lo que hay abierto: la ficha de una receta
 * o el indice completo. El reparto en columnas lo hace CSS.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName, formatQty } from '../lib/format.js';
import { filterRecipes, sortRecipes, countItems } from '../core/search.js';
import { ALL_CATEGORIES } from '../core/router.js';

/** Orden de las categorias en el indice impreso. */
const PRINT_ORDER = ['PASTELERÍA', 'PANADERÍA', 'GALLETAS'];

/** Umbrales de ingredientes para repartir la ficha en 1, 2 o 3 columnas. */
const TWO_COLUMNS_FROM = 8;
const THREE_COLUMNS_FROM = 26;

/**
 * Ficha de una receta.
 *
 * @param {object} recipe
 * @returns {HTMLElement}
 */
export function renderRecipeSheet(recipe) {
  const { base, rinde } = splitName(recipe.nombre);
  const hasMethod = Boolean(recipe.metodo && recipe.metodo.trim());
  const total = countItems(recipe) + recipe.componentes.length * 1.5;
  const columns = total > THREE_COLUMNS_FROM ? 3 : total > TWO_COLUMNS_FROM ? 2 : 1;

  return el('div', { class: 'sheet' }, [
    el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__meta' }, [
        el('span', { text: 'Zahavi · Recetario' }),
        el('span', { text: (recipe.categoria || '—').toLowerCase() + '  ·  ' + recipe.id }),
      ]),
      el('h1', { class: 'sheet__title', text: titleCase(base) }),
      rinde ? el('p', { class: 'sheet__yield', text: 'Rinde ' + rinde.toLowerCase() }) : null,
    ]),
    el('hr', { class: 'sheet__rule' }),
    el('div', { class: 'sheet__body' + (hasMethod ? ' sheet__body--split' : '') }, [
      el(
        'section',
        {
          // El reparto en columnas va por clase: la politica de seguridad de la
          // pagina no permite atributos style en linea.
          class: 'sheet__ingredients' + (hasMethod ? '' : ' sheet__ingredients--cols-' + columns),
        },
        [
          el('h2', { class: 'sheet__section', text: 'Ingredientes' }),
          ...recipe.componentes.map((component) =>
            el('div', { class: 'sheet__component' }, [
              recipe.componentes.length > 1
                ? el('h3', { class: 'sheet__component-name', text: titleCase(component.nombre) })
                : null,
              ...component.items.map((item) =>
                el('div', { class: 'sheet__item' }, [
                  el('span', { class: 'sheet__item-name', text: titleCase(item.ingrediente) }),
                  el('span', { class: 'sheet__item-qty' }, [
                    formatQty(item.cantidad),
                    el('span', { class: 'sheet__item-unit', text: ' ' + (item.unidad || '').toLowerCase() }),
                  ]),
                ]),
              ),
            ]),
          ),
        ],
      ),
      hasMethod
        ? el('section', { class: 'sheet__method' }, [
            el('h2', { class: 'sheet__section', text: 'Método de preparación' }),
            el('div', { class: 'sheet__method-body', text: recipe.metodo }),
          ])
        : null,
    ]),
  ]);
}

/**
 * Indice completo agrupado por categoria.
 *
 * @param {{recipes: Array, query: string, category: string}} params
 * @returns {HTMLElement}
 */
export function renderIndexSheet(params) {
  const list = sortRecipes(filterRecipes(params.recipes, params));
  const groups = groupByCategory(list);
  const scope = params.category === ALL_CATEGORIES ? 'todas las categorías' : params.category.toLowerCase();
  const word = list.length === 1 ? 'receta' : 'recetas';

  return el('div', { class: 'sheet' }, [
    el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__meta' }, [
        el('span', { text: 'Zahavi · Recetario' }),
        el('span', { text: `${list.length} ${word}  ·  ${scope}` }),
      ]),
      el('h1', { class: 'sheet__title', text: 'Índice de recetas' }),
      params.query
        ? el('p', { class: 'sheet__yield', text: 'Búsqueda: “' + params.query.trim() + '”' })
        : null,
    ]),
    el('hr', { class: 'sheet__rule' }),
    list.length === 0
      ? el('p', { class: 'sheet__empty', text: 'No hay recetas que coincidan con el filtro actual.' })
      : el(
          'div',
          { class: 'sheet__index' },
          groups.map((group) =>
            el('div', { class: 'sheet__group' }, [
              el('h2', { class: 'sheet__group-name', text: group.category + ' · ' + group.items.length }),
              ...group.items.map((recipe) =>
                el('div', { class: 'sheet__index-row' }, [
                  el('span', { text: titleCase(splitName(recipe.nombre).base) }),
                  el('span', { class: 'sheet__index-id', text: recipe.id }),
                ]),
              ),
            ]),
          ),
        ),
  ]);
}

function groupByCategory(recipes) {
  const groups = [];
  for (const category of PRINT_ORDER) {
    const items = recipes.filter((recipe) => recipe.categoria === category);
    if (items.length) groups.push({ category, items });
  }
  const rest = recipes.filter((recipe) => !PRINT_ORDER.includes(recipe.categoria));
  if (rest.length) groups.push({ category: 'OTRAS', items: rest });
  return groups;
}
