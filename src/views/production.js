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

/** Cuantos colores de estacion hay. Igual que en la ficha (`views/detail.js`). */
const ESTACIONES = 4;

/**
 * @param {{recipe: object, factor?: number, onClose: () => void}} options
 *   `recipe` llega YA escalada; `factor` solo sirve para avisarlo en pantalla.
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openProduction(options) {
  const recipe = options.recipe;
  const factor = options.factor || 1;
  const { base } = splitName(recipe.nombre);

  /**
   * Lista plana de lineas, conservando a que componente pertenece cada una y
   * que numero de estacion le toca.
   *
   * La estacion viaja con cada paso porque es lo que permite avisar del cambio:
   * pesar es una sucesion de cifras muy parecidas entre si, y pasar de la masa
   * al relleno sin enterarse es echar a perder la tanda.
   */
  const steps = recipe.componentes.flatMap((component, indice) =>
    component.items.map((item) => ({
      component: component.nombre,
      estacion: String((indice % ESTACIONES) + 1),
      indice,
      item,
    })),
  );

  /** Cuantos componentes tiene la receta, para decir "2 de 3". */
  const totalComponentes = recipe.componentes.length;

  const done = new Set();
  let index = 0;

  const body = el('div', { class: 'prod__body' });
  const progress = el('p', { class: 'prod__progress', attrs: { role: 'status' } });
  const bar = el('span', { class: 'prod__bar-fill' });

  /**
   * Botones del pie.
   *
   * Se declaran aqui, y no dentro del panel, porque `draw` los toca: cuando ya
   * no queda nada que pesar, el de avanzar SE QUITA. Dejarlo puesto y sin
   * efecto en la pantalla de "Todo pesado" era ofrecer una accion que no hace
   * nada, justo cuando la unica que queda es volver atras o salir.
   */
  const btnAnterior = el('button', {
    type: 'button',
    class: 'btn btn--quiet btn--xl',
    text: '← Anterior',
    on: { click: () => go(-1) },
  });

  const btnSiguiente = el('button', {
    type: 'button',
    class: 'btn btn--primary btn--xl prod__next',
    text: 'Siguiente',
    on: { click: markAndAdvance },
  });

  const foot = el('footer', { class: 'prod__foot' }, [btnAnterior, btnSiguiente]);

  // Lo que viene despues, siempre a la vista. Es lo que convierte la pantalla
  // en una lista de trabajo y no en una sucesion de sorpresas: quien pesa puede
  // ir acercando el siguiente producto mientras termina con el actual.
  const siguiente = el('p', { class: 'prod__siguiente' });

  function dibujarSiguiente() {
    clear(siguiente);
    const proximo = steps[index + 1];
    if (!proximo) {
      // En el ultimo paso se dice que es el ultimo, en vez de dejar el hueco
      // vacio: saber que no queda nada mas tambien es informacion.
      siguiente.appendChild(el('span', { class: 'prod__siguiente-fin', text: 'Es el último' }));
      return;
    }
    siguiente.appendChild(el('span', { class: 'prod__siguiente-label', text: 'Después' }));
    siguiente.appendChild(
      el('span', { class: 'prod__siguiente-nombre', text: titleCase(proximo.item.ingrediente) }),
    );
    siguiente.appendChild(
      el('span', {
        class: 'prod__siguiente-qty',
        text: `${formatQty(proximo.item.cantidad)} ${(proximo.item.unidad || '').toLowerCase()}`,
      }),
    );
  }

  function draw() {
    const step = steps[index];
    clear(body);

    if (!step) {
      const salir = el('button', {
        type: 'button',
        class: 'btn btn--accent btn--xl',
        text: 'Salir',
        on: { click: options.onClose },
      });

      body.appendChild(
        el('div', { class: 'prod__done' }, [
          el('span', { class: 'prod__done-mark', attrs: { 'aria-hidden': 'true' }, text: '✓' }),
          el('p', { class: 'prod__done-title', text: 'Todo pesado' }),
          el('p', { text: `${steps.length} ingredientes de ${titleCase(base)}.` }),
          salir,
        ]),
      );
      progress.textContent = 'Completado';
      bar.style.width = '100%';
      clear(siguiente);

      // Se retira el boton de avanzar: ya no hay nada delante. Queda
      // "← Anterior", que sigue sirviendo para volver sobre lo pesado.
      //
      // Si el foco estaba justo en ese boton -que es lo normal, porque es el
      // que se acaba de pulsar- hay que llevarlo a algun sitio: un elemento
      // que desaparece deja el foco en el `body`, y desde ahi el teclado deja
      // de responder dentro del panel.
      const teniaElFoco = document.activeElement === btnSiguiente;
      btnSiguiente.remove();
      if (teniaElFoco) salir.focus();
      return;
    }

    // Se vuelve a poner al retroceder desde la pantalla final.
    if (!btnSiguiente.isConnected) foot.appendChild(btnSiguiente);

    const isDone = done.has(index);

    body.appendChild(
      el('div', {
        class: 'prod__step' + (isDone ? ' is-done' : ''),
        attrs: { 'data-comp': step.estacion },
      }, [
        el('div', { class: 'prod__meta' }, [
          // De que estacion es este paso. Lleva el numero, el nombre y cuantas
          // hay en total, y el color de la estacion tiñe ademas el marco del
          // paso: pasar de la masa al relleno se ve antes de leerlo.
          totalComponentes > 1
            ? el('span', { class: 'prod__component' }, [
                el('span', { class: 'prod__component-num', text: `${step.indice + 1}/${totalComponentes}` }),
                el('span', { text: titleCase(step.component) }),
              ])
            : null,
          // Marca de "ya pesado" al volver sobre un paso hecho. Antes solo
          // habia un tachado sobre la cifra, que es la peor pieza para
          // tacharla: la cifra es justo lo que hay que poder leer.
          isDone ? el('span', { class: 'prod__hecho', text: '✓ Pesado' }) : null,
        ]),
        el('p', { class: 'prod__name', text: titleCase(step.item.ingrediente) }),
        el('p', { class: 'prod__qty' }, [
          el('span', { class: 'prod__number', text: formatQty(step.item.cantidad) }),
          el('span', { class: 'prod__unit', text: (step.item.unidad || '').toLowerCase() }),
        ]),
      ]),
    );

    progress.textContent = `${index + 1} de ${steps.length}`;
    bar.style.width = ((index + 1) / steps.length) * 100 + '%';
    dibujarSiguiente();
  }

  /**
   * Describe un paso para leerlo en voz alta.
   *
   * @param {{item: object}} paso
   * @returns {string}
   */
  function describir(paso) {
    return `${titleCase(paso.item.ingrediente)}, ${formatQty(paso.item.cantidad)} ${(paso.item.unidad || '').toLowerCase()}`;
  }

  /**
   * @param {number} delta
   * @param {string} [prefijo] lo que se diga antes del paso nuevo
   */
  function go(delta, prefijo = '') {
    const next = index + delta;
    if (next < 0 || next > steps.length) return;

    // El cambio de componente se anuncia ademas de verse. Es el unico momento
    // del pesaje en que hay que parar y cambiar de recipiente, y quien navega
    // con lector de pantalla no tiene el color del marco para avisarle.
    const antes = steps[index];
    const despues = steps[next];
    const cambioDeComponente =
      totalComponentes > 1 && despues && antes && despues.indice !== antes.indice;

    index = next;
    draw();

    // Moverse cambia el ingrediente y la cifra, y ninguno de los dos vive en
    // una region viva: sin esto, quien navega con lector de pantalla solo oia
    // "3 de 15" y tenia que salir a rebuscar QUE hay que pesar. Es justo lo
    // contrario de la promesa de esta pantalla.
    //
    // Va en UN solo anuncio, con la confirmacion del paso anterior delante
    // cuando la hay: la region viva es unica y un segundo mensaje borra el
    // primero antes de que termine de leerse.
    const paso = steps[index];
    const texto = paso ? describir(paso) : 'Todo pesado.';
    const aviso = cambioDeComponente
      ? `Empieza ${titleCase(despues.component)}, ${despues.indice + 1} de ${totalComponentes}.`
      : '';

    announce([prefijo, aviso, texto].filter(Boolean).join(' '));
  }

  function markAndAdvance() {
    if (index >= steps.length) return;
    done.add(index);
    const step = steps[index];
    go(1, `${titleCase(step.item.ingrediente)} pesado.`);
  }

  const handleKey = (event) => {
    // Un boton enfocado se activa con su propia semantica, no con la del
    // panel. Sin esta guarda, `preventDefault()` cancelaba la activacion
    // nativa del boton que tenia el foco: pulsar Intro sobre "Salir" daba el
    // ingrediente por pesado en vez de cerrar, "← Anterior" avanzaba en lugar
    // de retroceder, y el "Salir" de la pantalla final se quedaba muerto. Con
    // raton no se notaba nada, porque el clic no pasa por aqui.
    const enBoton = event.target instanceof HTMLElement && event.target.closest('button');

    if (event.key === ' ' || event.key === 'Enter') {
      if (enBoton) return;
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
          el('p', { class: 'prod__eyebrow' }, [
            recipe.id,
            // Aviso siempre visible mientras se pesa: aqui se sigue la cifra
            // al pie de la letra, y hay que saber que no es la de la formula.
            factor !== 1
              ? el('span', { class: 'prod__factor', text: `TANDA ×${String(factor).replace('.', ',')}` })
              : null,
          ]),
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
      siguiente,
      foot,
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
