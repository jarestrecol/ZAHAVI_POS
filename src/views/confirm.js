/**
 * =============================================================================
 *  CONFIRMACION DE BORRADO
 * =============================================================================
 *
 *  Eliminar una receta es la unica accion del sistema que destruye trabajo y no
 *  se puede deshacer desde la propia aplicacion. Por eso no basta con un "estas
 *  seguro" que se acepta sin leer.
 *
 *  SON TRES PASOS, NO CUATRO AVISOS IGUALES
 *  ----------------------------------------
 *  Encadenar cuatro ventanas identicas no hace que nadie lea: entrena a pulsar
 *  "aceptar" cuatro veces seguidas sin mirar. Lo que de verdad obliga a parar es
 *  que cada paso pida algo distinto y que el ultimo exija escribir a mano.
 *
 *      Paso 1   Que se va a borrar, con su nombre, codigo y cuanto contiene.
 *      Paso 2   Que consecuencias tiene, incluida la de las demas sedes.
 *      Paso 3   Escribir el nombre de la receta para poder pulsar Eliminar.
 *
 *  El boton de eliminar del ultimo paso empieza deshabilitado y solo se activa
 *  cuando lo escrito coincide. Nadie llega ahi por inercia.
 */

import { el, clear } from '../lib/dom.js';
import { titleCase, splitName } from '../lib/format.js';
import { announce } from '../lib/a11y.js';
import { countItems } from '../core/search.js';
import { createWindow } from './window.js';

/** Cuantos pasos hay que recorrer antes de poder eliminar. */
const TOTAL_STEPS = 3;

/**
 * @param {{recipe: object, onConfirm: () => void, onCancel: () => void}} options
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openConfirmDelete(options) {
  const recipe = options.recipe;
  const { base } = splitName(recipe.nombre);
  const nombreLimpio = titleCase(base);

  /** Paso en el que esta la persona, de 1 a 3. */
  let step = 1;

  const body = el('div', { class: 'confirm' });
  const footer = el('div', { class: 'win__actions' });
  const progress = el('p', { class: 'confirm__progress', attrs: { role: 'status' } });

  /**
   * Vuelve a pintar el paso actual.
   *
   * Cada paso reemplaza el contenido entero del cuerpo y del pie, para que no
   * quede nada del anterior en pantalla.
   */
  function draw() {
    clear(body);
    clear(footer);
    progress.textContent = `Paso ${step} de ${TOTAL_STEPS}`;

    if (step === 1) drawStepWhat();
    else if (step === 2) drawStepConsequences();
    else drawStepType();
  }

  // ---------------------------------------------------------------------
  //  PASO 1: que se va a borrar
  // ---------------------------------------------------------------------
  function drawStepWhat() {
    body.appendChild(
      el('div', null, [
        el('p', { class: 'confirm__lead', text: 'Vas a eliminar esta receta:' }),

        // Ficha de lo que se pierde, para que se vea que no es otra receta.
        el('div', { class: 'confirm__card' }, [
          el('p', { class: 'confirm__card-name', text: nombreLimpio }),
          el('p', { class: 'confirm__card-meta' }, [
            el('span', { text: recipe.id }),
            el('span', { text: (recipe.categoria || '').toLowerCase() }),
            el('span', {
              text: `${recipe.componentes.length} componente${recipe.componentes.length === 1 ? '' : 's'}`,
            }),
            el('span', { text: `${countItems(recipe)} ingredientes` }),
          ]),
        ]),

        el('p', {
          class: 'confirm__text',
          text: 'Comprueba que es la receta correcta antes de continuar.',
        }),
      ]),
    );

    footer.appendChild(
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        text: 'Cancelar',
        on: { click: options.onCancel },
      }),
    );
    footer.appendChild(
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        text: 'Sí, es esta receta',
        on: {
          click: () => {
            step = 2;
            draw();
          },
        },
      }),
    );
  }

  // ---------------------------------------------------------------------
  //  PASO 2: que consecuencias tiene
  // ---------------------------------------------------------------------
  function drawStepConsequences() {
    body.appendChild(
      el('div', null, [
        el('p', { class: 'confirm__lead', text: 'Esto es lo que va a pasar:' }),

        el('ul', { class: 'confirm__list' }, [
          el('li', { text: 'La receta desaparece del recetario de este equipo.' }),
          el('li', { text: 'Se pierden sus ingredientes, sus cantidades y su método.' }),
          el('li', { text: 'No hay forma de deshacerlo desde el recetario.' }),
          el('li', {
            text: 'Si publicas después, también desaparecerá para la panadería y la casa de producción.',
          }),
        ]),

        el('p', {
          class: 'confirm__text',
          text: 'Si solo quieres dejar de usarla por temporada, es mejor no borrarla.',
        }),
      ]),
    );

    footer.appendChild(
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        text: 'Volver',
        on: {
          click: () => {
            step = 1;
            draw();
          },
        },
      }),
    );
    footer.appendChild(
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        text: 'Entiendo, continuar',
        on: {
          click: () => {
            step = 3;
            draw();
          },
        },
      }),
    );
  }

  // ---------------------------------------------------------------------
  //  PASO 3: escribir el nombre
  // ---------------------------------------------------------------------
  function drawStepType() {
    const input = el('input', {
      type: 'text',
      id: 'confirm-name',
      class: 'field',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      placeholder: nombreLimpio,
    });

    const deleteButton = el('button', {
      type: 'button',
      class: 'btn btn--destructive',
      text: 'Eliminar definitivamente',
      disabled: true,
      on: {
        click: () => {
          if (!coincide(input.value)) return;
          options.onConfirm();
        },
      },
    });

    // El boton solo se activa cuando lo escrito coincide con el nombre. Se
    // comparan sin acentos ni mayusculas: se trata de comprobar que la persona
    // lo ha leido, no de examinarla de ortografia.
    input.addEventListener('input', () => {
      const valido = coincide(input.value);
      deleteButton.disabled = !valido;
      if (valido) announce('Ya puedes eliminar la receta.');
    });

    body.appendChild(
      el('div', null, [
        el('p', { class: 'confirm__lead', text: 'Último paso.' }),
        el('p', { class: 'confirm__text' }, [
          'Para confirmar, escribe el nombre de la receta: ',
          el('strong', { text: nombreLimpio }),
        ]),
        el('label', { class: 'sr-only', for: 'confirm-name', text: 'Nombre de la receta' }),
        input,
        el('p', {
          class: 'confirm__hint',
          text: 'El botón de eliminar se activa cuando el nombre coincide.',
        }),
      ]),
    );

    footer.appendChild(
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        text: 'Volver',
        on: {
          click: () => {
            step = 2;
            draw();
          },
        },
      }),
    );
    footer.appendChild(deleteButton);

    window.requestAnimationFrame(() => {
      if (input.isConnected) input.focus();
    });
  }

  /**
   * Compara lo escrito con el nombre de la receta, sin distinguir acentos,
   * mayusculas ni espacios de sobra.
   *
   * @param {string} written
   * @returns {boolean}
   */
  function coincide(written) {
    const normaliza = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ');
    return normaliza(written) === normaliza(nombreLimpio) && normaliza(written) !== '';
  }

  draw();

  return createWindow({
    title: 'Eliminar receta',
    meta: recipe.id,
    size: 'narrow',
    // Un clic fuera no debe cerrar algo que se esta leyendo con atencion.
    dismissOnBackdrop: false,
    onClose: options.onCancel,
    body,
    footer: [progress, footer],
  });
}
