/**
 * Hojas de impresion A4, independientes de la maqueta de pantalla.
 *
 * Se genera la hoja que corresponde a lo que hay abierto: la ficha de una receta
 * o el indice completo. El reparto en columnas lo hace CSS.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName, formatQty } from '../lib/format.js';
import { filterRecipes, sortRecipes, countItems } from '../core/search.js';
import { rendimientoEscalado } from '../core/scale.js';
import { ALL_CATEGORIES } from '../core/router.js';

/** Orden de las categorias en el indice impreso. */
const PRINT_ORDER = ['PASTELERÍA', 'PANADERÍA', 'GALLETAS'];

/** Umbrales de ingredientes para repartir la ficha en 1, 2 o 3 columnas. */
const TWO_COLUMNS_FROM = 8;
const THREE_COLUMNS_FROM = 26;

/**
 * Ficha de una receta.
 *
 * La receta llega YA escalada; `factor` solo sirve para avisarlo en el papel.
 * Ese aviso es importante: una hoja impresa sale del sistema y se queda en el
 * obrador sin nada alrededor que indique que no son las cantidades de la
 * formula. Si no lo dijera, alguien la usaria meses despues creyendo que si.
 *
 * @param {object} recipe receta ya escalada
 * @param {number} [factor] multiplicador aplicado
 * @returns {HTMLElement}
 */
export function renderRecipeSheet(recipe, factor = 1) {
  const { base, rinde } = splitName(recipe.nombre);
  const hasMethod = Boolean(recipe.metodo && recipe.metodo.trim());
  const total = countItems(recipe) + recipe.componentes.length * 1.5;
  const columns = total > THREE_COLUMNS_FROM ? 3 : total > TWO_COLUMNS_FROM ? 2 : 1;
  const escalada = factor !== 1;

  return el('div', { class: 'sheet' }, [
    el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__meta' }, [
        el('span', { text: 'Zahavi · Recetario' }),
        el('span', { text: (recipe.categoria || '—').toLowerCase() + '  ·  ' + recipe.id }),
      ]),
      el('h1', { class: 'sheet__title', text: titleCase(base) }),
      // El rendimiento SE ESCALA con la tanda. Antes se copiaba del nombre tal
      // cual, asi que con la tanda al triple el papel decia "Rinde 2 und" con
      // las cantidades ya multiplicadas debajo: la unica cifra falsa de una
      // hoja que se lleva al obrador para seguirla al pie de la letra.
      rinde ? el('p', { class: 'sheet__yield', text: 'Rinde ' + rendimientoEscalado(recipe.nombre, factor) }) : null,
      escalada
        ? el('p', {
            class: 'sheet__scaled',
            text: `TANDA ×${String(factor).replace('.', ',')} — cantidades multiplicadas, no son las de la fórmula original`,
          })
        : null,
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

/**
 * Hoja del plan de produccion del dia.
 *
 * Dos partes: que se produce (con cuantas tandas de cada receta) y la lista
 * consolidada de todo lo que hay que pesar. La primera parte importa tanto
 * como la segunda: sin ella, quien reciba el papel no sabe de donde salen esas
 * cantidades ni puede comprobarlas.
 *
 * @param {object} plan el resultado de `core/plan.js`
 * @returns {HTMLElement}
 */
export function renderPlanSheet(plan) {
  const fecha = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });

  return el('div', { class: 'sheet' }, [
    el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__meta' }, [
        el('span', { text: 'Zahavi · Plan de producción' }),
        el('span', { text: fecha }),
      ]),
      el('h1', { class: 'sheet__title', text: 'Producción del día' }),
      el('p', {
        class: 'sheet__yield',
        text: `${plan.recetas.length} ${plan.recetas.length === 1 ? 'receta' : 'recetas'} · ${plan.totalLineas} ${plan.totalLineas === 1 ? 'ingrediente' : 'ingredientes'}`,
      }),
    ]),
    el('hr', { class: 'sheet__rule' }),

    el('section', { class: 'sheet__component' }, [
      el('h2', { class: 'sheet__section', text: 'Qué se produce' }),
      ...plan.recetas.map((receta) =>
        el('div', { class: 'sheet__item' }, [
          el('span', { class: 'sheet__item-name', text: titleCase(splitName(receta.nombre).base) }),
          el('span', { class: 'sheet__item-qty' }, [
            String(receta.factor).replace('.', ','),
            el('span', { class: 'sheet__item-unit', text: receta.factor === 1 ? ' tanda' : ' tandas' }),
          ]),
        ]),
      ),
    ]),

    el('section', { class: 'sheet__component' }, [
      el('h2', { class: 'sheet__section', text: 'Todo lo que hay que pesar' }),
      ...plan.lineas.map((linea) =>
        el('div', { class: 'sheet__item' }, [
          el('span', { class: 'sheet__item-name', text: titleCase(linea.ingrediente) }),
          el('span', { class: 'sheet__item-qty' }, [
            formatQty(linea.cantidad),
            el('span', { class: 'sheet__item-unit', text: ' ' + linea.unidad.toLowerCase() }),
          ]),
        ]),
      ),
    ]),

    // Se dice en el papel, no solo en pantalla: la hoja se lleva al obrador y
    // ahi ya no hay nada que lo explique.
    plan.conflictos > 0
      ? el('p', {
          class: 'sheet__empty',
          text: 'Hay ingredientes que aparecen con unidades distintas y van en líneas separadas: no se pueden sumar entre sí.',
        })
      : null,
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

/**
 * Hoja del catalogo de ingredientes.
 *
 * Existe porque la lista se usa FUERA de la pantalla: para ir al proveedor, para
 * repartir el trabajo de reunir precios y para revisar a mano los ingredientes
 * que se miden de dos formas distintas.
 *
 * Cada ingrediente lleva sus totales POR UNIDAD, nunca sumados entre si: es la
 * misma regla que en pantalla y en el plan, y en papel importa mas todavia
 * porque nadie va a poder preguntar.
 *
 * @param {Array<object>} catalogo
 * @returns {HTMLElement}
 */
export function renderIngredientsSheet(catalogo) {
  const fecha = new Date().toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' });
  const lista = catalogo || [];
  const conVarias = lista.filter((i) => i.totales.length > 1).length;

  return el('div', { class: 'sheet' }, [
    el('header', { class: 'sheet__head' }, [
      el('div', { class: 'sheet__meta' }, [
        el('span', { text: 'Zahavi \u00b7 Ingredientes' }),
        el('span', { text: fecha }),
      ]),
      el('h1', { class: 'sheet__title', text: 'Cat\u00e1logo de ingredientes' }),
      el('p', {
        class: 'sheet__yield',
        text: `${lista.length} ingredientes distintos`,
      }),
    ]),
    el('hr', { class: 'sheet__rule' }),

    el('section', { class: 'sheet__component' }, [
      el('h2', { class: 'sheet__section', text: 'Lo que se usa, y cu\u00e1nto' }),
      ...lista.map((ingrediente) =>
        el('div', { class: 'sheet__item' }, [
          el('span', { class: 'sheet__item-name', text: titleCase(ingrediente.nombre) }),
          el('span', { class: 'sheet__item-qty' }, [
            ingrediente.totales.map((t) => `${formatQty(t.total)} ${t.unidad.toLowerCase()}`).join(' / '),
          ]),
        ]),
      ),
    ]),

    // El aviso viaja con el papel: la hoja se lleva al proveedor y alli ya no
    // hay nada que lo explique.
    conVarias > 0
      ? el('p', {
          class: 'sheet__empty',
          text: `${conVarias} ingredientes se miden de m\u00e1s de una forma y aparecen con dos cifras separadas por barra: no se pueden sumar entre s\u00ed.`,
        })
      : null,
  ]);
}
