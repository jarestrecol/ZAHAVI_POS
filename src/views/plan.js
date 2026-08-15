/**
 * =============================================================================
 *  PLAN DE PRODUCCION DEL DIA
 * =============================================================================
 *
 *  Dos mitades en una sola ventana:
 *
 *      IZQUIERDA   que se produce hoy: se buscan recetas y se dice cuanto de
 *                  cada una
 *      DERECHA     la lista consolidada que sale de eso, lista para pesar,
 *                  comprar o imprimir
 *
 *  Todo ocurre en memoria: el plan no se guarda en ningun sitio y se pierde al
 *  cerrar la ventana. Es deliberado para esta primera version. Guardarlo
 *  significaria decidir donde vive, si se comparte entre sedes y que pasa
 *  cuando dos personas planean el mismo dia, y ninguna de esas preguntas tiene
 *  todavia respuesta del negocio.
 *
 *  La ventana se gestiona sola, sin pasar por el repintado general: mantiene su
 *  propia seleccion y solo redibuja las dos listas cuando algo cambia. Asi
 *  escribir en el buscador no reconstruye la aplicacion entera por detras.
 */

import { el, clear, replaceChildren } from '../lib/dom.js';
import { titleCase, splitName, formatQty, normalize } from '../lib/format.js';
import { rendimientoBase } from '../core/scale.js';
import { consolidar, tieneVariasUnidades } from '../core/plan.js';
import { createWindow } from './window.js';

/** Cuantas recetas se sugieren al escribir en el buscador. */
const MAX_SUGERENCIAS = 8;

/**
 * @param {{recipes: Array, onClose: () => void, onPrint: (plan: object) => void}} options
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openPlan(options) {
  /**
   * Lo elegido para hoy: id de receta -> cuantas tandas.
   * @type {Map<string, number>}
   */
  const seleccion = new Map();

  const buscador = el('input', {
    type: 'search',
    id: 'plan-buscar',
    class: 'field',
    placeholder: 'Buscar receta para añadir…',
    autocomplete: 'off',
    on: { input: () => dibujarSugerencias() },
  });

  const sugerencias = el('ul', { class: 'plan__sugerencias' });
  const elegidas = el('ul', { class: 'plan__elegidas' });
  const resultado = el('div', { class: 'plan__resultado' });

  /* ---------------------------------------------------------------------
   *  Sugerencias del buscador
   * ------------------------------------------------------------------ */

  function dibujarSugerencias() {
    const texto = normalize(buscador.value).trim();
    clear(sugerencias);

    if (texto === '') return;

    const encontradas = options.recipes
      .filter((r) => normalize(r.nombre).includes(texto) && !seleccion.has(r.id))
      .slice(0, MAX_SUGERENCIAS);

    if (encontradas.length === 0) {
      sugerencias.appendChild(
        el('li', { class: 'plan__vacio', text: 'Ninguna receta coincide.' }),
      );
      return;
    }

    for (const receta of encontradas) {
      const { base } = splitName(receta.nombre);
      sugerencias.appendChild(
        el('li', null, [
          el('button', {
            type: 'button',
            class: 'plan__sugerencia',
            attrs: { 'data-category': receta.categoria },
            on: {
              click: () => {
                seleccion.set(receta.id, 1);
                buscador.value = '';
                dibujarSugerencias();
                dibujarTodo();
                buscador.focus();
              },
            },
          }, [
            el('span', { class: 'plan__sugerencia-dot', attrs: { 'aria-hidden': 'true' } }),
            el('span', { text: titleCase(base) }),
          ]),
        ]),
      );
    }
  }

  /* ---------------------------------------------------------------------
   *  Recetas elegidas
   * ------------------------------------------------------------------ */

  function dibujarElegidas() {
    clear(elegidas);

    if (seleccion.size === 0) {
      elegidas.appendChild(
        el('li', {
          class: 'plan__vacio',
          text: 'Todavía no has elegido ninguna receta para hoy.',
        }),
      );
      return;
    }

    for (const [id, tandas] of seleccion) {
      const receta = options.recipes.find((r) => r.id === id);
      if (!receta) continue;

      const { base } = splitName(receta.nombre);
      const rinde = rendimientoBase(receta.nombre);

      elegidas.appendChild(
        el('li', { class: 'plan__elegida', attrs: { 'data-category': receta.categoria } }, [
          el('div', { class: 'plan__elegida-main' }, [
            el('p', { class: 'plan__elegida-nombre', text: titleCase(base) }),
            // Si la receta declara su rendimiento, se dice cuanto sale en
            // total: es el dato que de verdad interesa al planear.
            rinde !== null
              ? el('p', {
                  class: 'plan__elegida-rinde',
                  text: `${formatQty(rinde * tandas)} en total`,
                })
              : null,
          ]),

          el('div', { class: 'plan__tandas' }, [
            el('label', { class: 'sr-only', for: 'tandas-' + id, text: 'Tandas de ' + titleCase(base) }),
            el('input', {
              type: 'number',
              id: 'tandas-' + id,
              class: 'field field--num plan__tandas-input',
              value: String(tandas),
              min: '0',
              step: 'any',
              on: {
                change: (event) => {
                  const valor = parseFloat(String(event.target.value).replace(',', '.'));
                  if (!Number.isFinite(valor) || valor <= 0) seleccion.delete(id);
                  else seleccion.set(id, valor);
                  dibujarTodo();
                },
              },
            }),
            el('span', { class: 'plan__tandas-label', text: tandas === 1 ? 'tanda' : 'tandas' }),
          ]),

          el('button', {
            type: 'button',
            class: 'btn-icon',
            text: '×',
            attrs: { 'aria-label': 'Quitar ' + titleCase(base) + ' del plan' },
            on: {
              click: () => {
                seleccion.delete(id);
                dibujarTodo();
              },
            },
          }),
        ]),
      );
    }
  }

  /* ---------------------------------------------------------------------
   *  Lista consolidada
   * ------------------------------------------------------------------ */

  /** Arma el plan a partir de lo elegido. */
  function planActual() {
    const entradas = [];
    for (const [id, factor] of seleccion) {
      const recipe = options.recipes.find((r) => r.id === id);
      if (recipe) entradas.push({ recipe, factor });
    }
    return consolidar(entradas);
  }

  function dibujarResultado() {
    clear(resultado);

    if (seleccion.size === 0) {
      resultado.appendChild(
        el('p', {
          class: 'plan__vacio',
          text: 'Aquí aparecerá todo lo que hay que pesar, con cada ingrediente sumado una sola vez.',
        }),
      );
      return;
    }

    const plan = planActual();

    resultado.appendChild(
      el('p', { class: 'plan__resumen' }, [
        el('strong', { text: String(plan.totalLineas) }),
        plan.totalLineas === 1 ? ' ingrediente' : ' ingredientes',
        ` para ${plan.recetas.length} ${plan.recetas.length === 1 ? 'receta' : 'recetas'}.`,
      ]),
    );

    // Aviso de ingredientes que aparecen con dos unidades. No es un error:
    // puede ser legitimo, pero hay que verlo antes de ir a comprar.
    if (plan.conflictos > 0) {
      resultado.appendChild(
        el('p', {
          class: 'plan__aviso',
          text:
            plan.conflictos === 1
              ? 'Un ingrediente aparece con dos unidades distintas y va en dos líneas: no se pueden sumar.'
              : `${plan.conflictos} ingredientes aparecen con unidades distintas y van en líneas separadas: no se pueden sumar.`,
        }),
      );
    }

    resultado.appendChild(
      el(
        'ul',
        { class: 'plan__lista' },
        plan.lineas.map((linea) =>
          el(
            'li',
            {
              class: 'plan__linea' + (tieneVariasUnidades(plan.lineas, linea.ingrediente) ? ' plan__linea--doble' : ''),
              attrs: { title: 'En: ' + linea.recetas.join(', ') },
            },
            [
              el('span', { class: 'plan__linea-nombre', text: titleCase(linea.ingrediente) }),
              el('span', { class: 'plan__linea-qty' }, [
                el('span', { class: 'plan__linea-num', text: formatQty(linea.cantidad) }),
                el('span', { class: 'plan__linea-unidad', text: linea.unidad.toLowerCase() }),
              ]),
            ],
          ),
        ),
      ),
    );
  }

  function dibujarTodo() {
    dibujarElegidas();
    dibujarResultado();
    actualizarPie();
  }

  /* ---------------------------------------------------------------------
   *  Ventana
   * ------------------------------------------------------------------ */

  const botonImprimir = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: 'Imprimir la lista',
    disabled: true,
    on: { click: () => options.onPrint(planActual()) },
  });

  function actualizarPie() {
    botonImprimir.disabled = seleccion.size === 0;
  }

  const body = el('div', { class: 'plan' }, [
    el('section', { class: 'plan__pane' }, [
      el('h3', { class: 'section-label', text: 'Qué se produce hoy' }),
      el('label', { class: 'sr-only', for: 'plan-buscar', text: 'Buscar receta para añadir' }),
      buscador,
      sugerencias,
      elegidas,
    ]),

    el('section', { class: 'plan__pane plan__pane--resultado' }, [
      el('h3', { class: 'section-label', text: 'Todo lo que hay que pesar' }),
      resultado,
    ]),
  ]);

  dibujarTodo();

  return createWindow({
    title: 'Plan de producción',
    meta: 'no se guarda: se pierde al cerrar',
    size: 'wide',
    onClose: options.onClose,
    body,
    footer: [
      el('p', { class: 'win__hint', text: 'Los ingredientes de unidades distintas nunca se suman entre sí.' }),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cerrar',
          on: { click: options.onClose },
        }),
        botonImprimir,
      ]),
    ],
  });
}
