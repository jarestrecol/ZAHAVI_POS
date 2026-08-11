/**
 * Detalle de receta: ingredientes a la izquierda, metodo a la derecha.
 *
 * El tamano de letra lo resuelve CSS con `clamp()` y unidades de contenedor. Si
 * una receta muy larga no cabe, su columna se desplaza; antes se re-renderizaba
 * hasta siete veces intentando encogerla.
 */

import { el } from '../lib/dom.js';
import { titleCase, splitName, formatQty } from '../lib/format.js';
import { navigate } from '../core/router.js';
import { setState } from '../core/store.js';

/**
 * @param {{recipe: object}} params
 * @returns {HTMLElement}
 */
export function renderDetail(params) {
  const recipe = params.recipe;
  const { base, rinde } = splitName(recipe.nombre);

  return el('article', { class: 'page page--detail', attrs: { 'aria-labelledby': 'recipe-title' } }, [
    el('header', { class: 'recipe-head' }, [
      el('div', { class: 'recipe-head__text' }, [
        el('p', {
          class: 'eyebrow',
          text: (recipe.categoria || '—').toLowerCase() + '  ·  ' + recipe.id,
        }),
        el('h2', { class: 'recipe-title', id: 'recipe-title' }, [
          titleCase(base),
          // El espacio evita que un lector de pantalla lea "Granderinde 1 und".
          rinde ? ' ' : null,
          rinde ? el('span', { class: 'recipe-title__yield', text: 'rinde ' + rinde.toLowerCase() }) : null,
        ]),
      ]),
      el('div', { class: 'recipe-head__actions no-print' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Imprimir',
          on: { click: () => window.print() },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          text: 'Editar',
          on: { click: () => navigate({ name: 'edit', id: recipe.id }) },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--ghost btn--danger',
          text: 'Eliminar',
          on: { click: () => setState({ confirmDelete: recipe.id }) },
        }),
      ]),
    ]),
    el('div', { class: 'spread' }, [renderIngredients(recipe), renderMethod(recipe)]),
  ]);
}

function renderIngredients(recipe) {
  const multiple = recipe.componentes.length > 1;

  return el('section', { class: 'spread__page spread__page--left' }, [
    el('h3', { class: 'section-label', text: 'Ingredientes' }),
    el(
      'div',
      { class: 'ingredients' + (multiple ? '' : ' ingredients--single') },
      recipe.componentes.map((component) =>
        el('div', { class: 'component' }, [
          multiple ? el('h4', { class: 'component__name', text: titleCase(component.nombre) }) : null,
          el(
            'ul',
            { class: 'component__items' },
            component.items.map((item) =>
              el('li', { class: 'item' }, [
                el('span', { class: 'item__name', text: titleCase(item.ingrediente) }),
                el('span', { class: 'item__leader', attrs: { 'aria-hidden': 'true' } }),
                el('span', { class: 'item__qty' }, [
                  formatQty(item.cantidad),
                  el('span', { class: 'item__unit', text: ' ' + (item.unidad || '').toLowerCase() }),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    ),
  ]);
}

function renderMethod(recipe) {
  const hasMethod = Boolean(recipe.metodo && recipe.metodo.trim());

  return el('section', { class: 'spread__page spread__page--right' }, [
    el('h3', { class: 'section-label', text: 'Método de preparación' }),
    hasMethod
      ? // white-space: pre-wrap conserva los saltos de linea sin construir marcado.
        el('div', { class: 'method', text: recipe.metodo })
      : el('p', { class: 'method method--empty' }, [
          'Página en blanco. Usa ',
          el('em', { text: 'Editar' }),
          ' para escribir el método de preparación de esta receta.',
        ]),
  ]);
}
