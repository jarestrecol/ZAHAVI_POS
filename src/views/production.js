/**
 * Modo produccion: la pantalla mientras se pesa.
 *
 * Es el momento critico del oficio y merece su propia vista. Se usa de pie,
 * junto a la bascula, a un brazo de distancia y con las manos ocupadas, asi que
 * aqui todo sube de escalon: una linea a la vez, cifra enorme, avance con la
 * barra espaciadora para no tener que tocar la pantalla con las manos sucias.
 *
 * No modifica la receta. Lo pesado se lleva solo en memoria y se pierde al
 * salir, que es justo lo que se espera de una lista de control de una tanda.
 */

import { el, clear } from '../lib/dom.js';
import { titleCase, splitName, formatQty } from '../lib/format.js';
import { trapFocus, announce } from '../lib/a11y.js';

/**
 * @param {{recipe: object, onClose: () => void}} options
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openProduction(options) {
  const recipe = options.recipe;
  const { base } = splitName(recipe.nombre);

  /** Lista plana de lineas, conservando a que componente pertenece cada una. */
  const steps = recipe.componentes.flatMap((component) =>
    component.items.map((item) => ({ component: component.nombre, item })),
  );

  const done = new Set();
  let index = 0;

  const body = el('div', { class: 'prod__body' });
  const progress = el('p', { class: 'prod__progress', attrs: { role: 'status' } });
  const bar = el('span', { class: 'prod__bar-fill' });

  function draw() {
    const step = steps[index];
    clear(body);

    if (!step) {
      body.appendChild(
        el('div', { class: 'prod__done' }, [
          el('p', { class: 'prod__done-title', text: 'Todo pesado' }),
          el('p', { text: `${steps.length} ingredientes de ${titleCase(base)}.` }),
          el('button', {
            type: 'button',
            class: 'btn btn--primary btn--xl',
            text: 'Salir',
            on: { click: options.onClose },
          }),
        ]),
      );
      progress.textContent = 'Completado';
      bar.style.width = '100%';
      return;
    }

    const isDone = done.has(index);

    body.appendChild(
      el('div', { class: 'prod__step' + (isDone ? ' is-done' : '') }, [
        recipe.componentes.length > 1
          ? el('p', { class: 'prod__component', text: titleCase(step.component) })
          : null,
        el('p', { class: 'prod__name', text: titleCase(step.item.ingrediente) }),
        el('p', { class: 'prod__qty' }, [
          el('span', { class: 'prod__number', text: formatQty(step.item.cantidad) }),
          el('span', { class: 'prod__unit', text: (step.item.unidad || '').toLowerCase() }),
        ]),
      ]),
    );

    progress.textContent = `${index + 1} de ${steps.length}`;
    bar.style.width = ((index + 1) / steps.length) * 100 + '%';
  }

  function go(delta) {
    const next = index + delta;
    if (next < 0 || next > steps.length) return;
    index = next;
    draw();
  }

  function markAndAdvance() {
    if (index >= steps.length) return;
    done.add(index);
    const step = steps[index];
    announce(`${titleCase(step.item.ingrediente)} pesado.`);
    go(1);
  }

  const handleKey = (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      markAndAdvance();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      go(1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      go(-1);
    }
  };

  const panel = el(
    'div',
    {
      class: 'prod',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Modo producción: ' + base },
      on: { keydown: handleKey },
    },
    [
      el('header', { class: 'prod__head' }, [
        el('div', { class: 'prod__titles' }, [
          el('p', { class: 'prod__eyebrow', text: recipe.id }),
          el('h2', { class: 'prod__title', text: titleCase(base) }),
        ]),
        progress,
        el('button', {
          type: 'button',
          class: 'prod__close',
          text: 'Salir',
          on: { click: options.onClose },
        }),
      ]),
      el('div', { class: 'prod__bar' }, [bar]),
      body,
      el('footer', { class: 'prod__foot' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet btn--xl',
          text: '← Anterior',
          on: { click: () => go(-1) },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--primary btn--xl prod__next',
          text: 'Pesado · siguiente',
          on: { click: markAndAdvance },
        }),
      ]),
      el('p', {
        class: 'prod__hint',
        text: 'Barra espaciadora para dar por pesado y avanzar. Flechas para moverte. Escape para salir.',
      }),
    ],
  );

  draw();

  const release = trapFocus(panel, { onEscape: options.onClose });
  document.body.classList.add('is-modal-open');

  return {
    node: panel,
    close: () => {
      release();
      document.body.classList.remove('is-modal-open');
      panel.remove();
    },
  };
}
