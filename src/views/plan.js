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
 *
 *  CADA CIFRA SE PUEDE ABRIR
 *  -------------------------
 *  Una linea consolidada dice "harina, 4.500 GR" y esconde de donde sale. Cada
 *  linea se despliega y muestra que receta pone cuanto, igual que una fila del
 *  validador de ingredientes. Antes eso vivia en un atributo `title`, que no
 *  llega por teclado, no llega en pantalla tactil y los lectores de pantalla
 *  tratan de forma desigual: era informacion escrita pero no entregada.
 */

import { el, clear } from '../lib/dom.js';
import { titleCase, splitName, formatQty, normalize, yieldLabel } from '../lib/format.js';
import { announce } from '../lib/a11y.js';
import { rendimientoBase, normalizarFactor, FACTOR_MIN, FACTOR_MAX } from '../core/scale.js';
import { consolidar, tieneVariasUnidades, ingredientesConVariasUnidades } from '../core/plan.js';
import { renderCosteo } from './costeo.js';
import { crearPantalla } from './pantalla.js';

/** Cuantas recetas se sugieren al escribir en el buscador. */
const MAX_SUGERENCIAS = 8;

/**
 * Tanda minima y salto que ofrecen las flechas del contador.
 *
 * Media tanda es una cantidad real de obrador; un cuarto ya no se pesa bien.
 * Los dos valores van juntos a proposito: asi todo lo que ofrecen las flechas
 * es un valor con sentido. Escribir a mano algo menor sigue valiendo mientras
 * el nucleo lo respete, y el limite duro de verdad es el suyo (`FACTOR_MIN` y
 * `FACTOR_MAX`), no este.
 */
const TANDA_MIN = 0.5;
const TANDA_PASO = 0.5;

/** Cuantos ingredientes se nombran en el aviso antes de resumir el resto. */
const MAX_NOMBRES_AVISO = 4;

/** Cuanto permanece en pantalla una nota antes de retirarse sola. */
const NOTA_MS = 6000;

/**
 * @param {{recipes: Array, onMenu: () => void, onSalir: () => void,
 *          onPrint: (plan: object) => void}} options
 * @returns {{node: HTMLElement, pintarAvisos: (nodos: Array<Node>) => void, close: () => void}}
 */
export function openPlan(options) {
  /**
   * Lo elegido para hoy: id de receta -> cuantas tandas.
   * @type {Map<string, number>}
   */
  const seleccion = new Map();

  /** Linea consolidada con el desglose abierto, o null. */
  let abierto = null;

  const buscador = el('input', {
    type: 'search',
    id: 'plan-buscar',
    class: 'field',
    placeholder: 'Buscar receta para añadir…',
    autocomplete: 'off',
    on: { input: () => dibujarSugerencias() },
  });

  // Cuantas recetas ofrece el buscador. Es `role="status"` porque escribir en
  // un campo y que aparezcan ocho opciones debajo es un cambio que solo se ve:
  // sin esto, quien usa lector de pantalla no sabe si hubo resultados.
  const contadorSugerencias = el('p', {
    class: 'plan__contador',
    attrs: { role: 'status' },
  });

  const sugerencias = el('ul', { class: 'plan__sugerencias' });
  const elegidas = el('ul', { class: 'plan__elegidas' });
  const resultado = el('div', { class: 'plan__resultado' });

  // Nota de correccion, VISIBLE. Cuando el plan rechaza o ajusta un numero, lo
  // dice en pantalla y no solo al lector de pantalla: quien teclea "0" y ve el
  // valor volver atras sin explicacion asume que la aplicacion falla. Al ser
  // `role="status"` el mismo nodo sirve para las dos cosas y el mensaje no se
  // duplica.
  const nota = el('p', { class: 'plan__nota', attrs: { role: 'status' } });
  let notaTimer = null;

  /**
   * Explica en pantalla una correccion que acaba de hacer el plan.
   *
   * @param {string} texto
   */
  function avisar(texto) {
    nota.textContent = texto;
    clearTimeout(notaTimer);
    notaTimer = setTimeout(() => {
      nota.textContent = '';
    }, NOTA_MS);
  }

  /* ---------------------------------------------------------------------
   *  Sugerencias del buscador
   * ------------------------------------------------------------------ */

  function dibujarSugerencias() {
    const texto = normalize(buscador.value).trim();
    clear(sugerencias);

    // Con el campo vacio el contador se vacia tambien. Un `role="status"` sin
    // texto no anuncia nada, que es justo lo que se quiere al limpiar el
    // buscador despues de añadir una receta: ya se anuncio el alta.
    if (texto === '') {
      contadorSugerencias.textContent = '';
      return;
    }

    const encontradas = options.recipes
      .filter((r) => normalize(r.nombre).includes(texto) && !seleccion.has(r.id))
      .slice(0, MAX_SUGERENCIAS);

    if (encontradas.length === 0) {
      contadorSugerencias.textContent = 'Ninguna receta coincide';
      sugerencias.appendChild(
        el('li', { class: 'plan__vacio', text: 'Ninguna receta coincide.' }),
      );
      return;
    }

    contadorSugerencias.textContent =
      encontradas.length === 1 ? '1 receta coincide' : `${encontradas.length} recetas coinciden`;

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
                announce(`${titleCase(base)} añadida al plan.`);
                buscador.focus();
              },
            },
          }, [
            el('span', { class: 'plan__sugerencia-dot', attrs: { 'aria-hidden': 'true' } }),
            el('span', { text: titleCase(base) }),
            // Distingue las que comparten nombre base: buscar "sacher" ofrecia
            // cuatro sugerencias identicas entre las que no habia forma de
            // elegir la tanda correcta.
            yieldLabel(receta.nombre)
              ? el('span', { class: 'plan__sugerencia-rinde', text: yieldLabel(receta.nombre) })
              : null,
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
      elegidas.appendChild(renderElegida(receta, tandas));
    }
  }

  /**
   * Una receta elegida, con su contador de tandas.
   *
   * La fila se actualiza SOBRE SI MISMA cuando cambia el numero de tandas, en
   * vez de reconstruir la lista entera. Reconstruirla destruia el campo que
   * tenia el foco: con el raton eso rompia las flechas del contador, porque
   * cada pulsacion se llevaba por delante el control que se estaba pulsando.
   *
   * @param {object} receta
   * @param {number} tandas
   * @returns {HTMLElement}
   */
  function renderElegida(receta, tandas) {
    const id = receta.id;
    const { base } = splitName(receta.nombre);
    const nombreLegible = titleCase(base);
    const rinde = rendimientoBase(receta.nombre);

    // Si la receta declara su rendimiento, se dice cuanto sale en total: es el
    // dato que de verdad interesa al planear.
    const rindeNode = rinde !== null ? el('p', { class: 'plan__elegida-rinde' }) : null;
    const labelNode = el('span', { class: 'plan__tandas-label' });

    const campo = el('input', {
      type: 'number',
      id: 'tandas-' + id,
      class: 'field field--num plan__tandas-input',
      value: String(tandas),
      min: String(TANDA_MIN),
      max: String(FACTOR_MAX),
      step: String(TANDA_PASO),
      on: {
        // Mientras se escribe solo se atiende lo que ya es un numero valido y
        // dentro de rango: asi la lista consolidada sigue el tecleo sin
        // pelearse con los estados intermedios ("", "0", "1.", "50" camino de
        // "500") que toda escritura atraviesa. Lo demas se decide al salir.
        input: (event) => {
          const valor = leerTandas(event.target.value);
          if (valor === null || valor !== normalizarFactor(valor)) return;
          aplicar(valor);
        },
        // Al salir del campo ya no hay estado intermedio que valga: lo que
        // quede tiene que ser un numero que el nucleo respete tal cual.
        change: (event) => {
          const valor = leerTandas(event.target.value);

          if (valor === null) {
            // Vaciar el campo o escribir cero NO borra la receta del plan.
            // Antes si, y era un borrado silencioso y sin deshacer provocado
            // por un gesto que casi siempre es un error de tecleo. Para quitar
            // ya esta el boton de al lado, que ademas se puede pensar.
            event.target.value = String(seleccion.get(id) ?? tandas);
            avisar('Para quitar una receta del plan, usa el botón de quitar.');
            return;
          }

          // El nucleo recorta los factores imposibles EN SILENCIO. Si se
          // dejara pasar, esta mitad de la ventana diria "500 tandas" mientras
          // la otra consolida 100, y la cifra que se imprime seria la segunda.
          // Se recorta aqui, a la vista, y se dice por que.
          const ajustado = normalizarFactor(valor);
          if (ajustado !== valor) {
            event.target.value = String(ajustado);
            avisar(`El plan trabaja entre ${formatQty(FACTOR_MIN)} y ${formatQty(FACTOR_MAX)} tandas.`);
          }

          aplicar(ajustado);
        },
      },
    });

    /** Lleva el nuevo numero de tandas al estado y a la parte visible. */
    function aplicar(valor) {
      seleccion.set(id, valor);
      pintar(valor);
      dibujarResultado();
    }

    function pintar(valor) {
      if (rindeNode) rindeNode.textContent = `${formatQty(rinde * valor)} en total`;
      labelNode.textContent = valor === 1 ? 'tanda' : 'tandas';
    }

    pintar(tandas);

    return el('li', { class: 'plan__elegida', attrs: { 'data-category': receta.categoria } }, [
      el('div', { class: 'plan__elegida-main' }, [
        el('p', { class: 'plan__elegida-nombre' }, [
          nombreLegible,
          yieldLabel(receta.nombre)
            ? el('span', { class: 'plan__elegida-rinde-base', text: ' ' + yieldLabel(receta.nombre) })
            : null,
        ]),
        rindeNode,
      ]),

      el('div', { class: 'plan__tandas' }, [
        el('label', { class: 'sr-only', for: 'tandas-' + id, text: 'Tandas de ' + nombreLegible }),
        campo,
        labelNode,
      ]),

      el('button', {
        type: 'button',
        class: 'btn-icon',
        text: '×',
        attrs: { 'aria-label': 'Quitar ' + nombreLegible + ' del plan' },
        on: {
          click: () => {
            seleccion.delete(id);
            dibujarTodo();
            announce(`${nombreLegible} quitada del plan.`);
            // El boton que se acaba de pulsar ya no existe: sin esto el foco
            // vuelve al principio del documento.
            buscador.focus();
          },
        },
      }),
    ]);
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
    // puede ser legitimo, pero hay que verlo antes de ir a comprar. Se nombran
    // uno por uno: contarlos obligaba a buscarlos a ojo entre cuarenta lineas.
    const conflictivos = ingredientesConVariasUnidades(plan.lineas);
    if (conflictivos.length > 0) {
      resultado.appendChild(
        el('p', {
          class: 'plan__aviso',
          text:
            conflictivos.length === 1
              ? `${titleCase(conflictivos[0])} aparece con dos unidades distintas y va en dos líneas: no se pueden sumar.`
              : `${enumerar(conflictivos)} aparecen con unidades distintas y van en líneas separadas: no se pueden sumar.`,
        }),
      );
    }

    // Encabezado de columnas: comparte la rejilla de las filas, asi que cada
    // rotulo cae justo encima de su columna. Va oculto a los lectores porque
    // cada fila ya se anuncia entera con su propio `aria-label`.
    resultado.appendChild(
      el('div', { class: 'plan__encabezado', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { text: 'Ingrediente' }),
        el('span', { text: 'Total' }),
      ]),
    );

    resultado.appendChild(
      el('ul', { class: 'plan__lista' }, plan.lineas.map((linea) => renderLinea(plan, linea))),
    );

    // EL COSTO, DEBAJO DE LO QUE HAY QUE PESAR Y NO EN OTRA PANTALLA.
    //
    // Va aqui porque las dos preguntas se hacen a la vez y sobre lo mismo: al
    // armar el plan del dia, "cuanto hay que pesar" y "cuanto me cuesta" son la
    // misma consulta. Separarlas obligaria a rehacer la seleccion en otro sitio.
    //
    // Se pinta solo si quien monto la ventana paso el almacen: el plan del dia
    // sigue funcionando igual sin el modulo de bodega.
    if (typeof options.leerLotes === 'function') {
      resultado.appendChild(
        renderCosteo({
          plan,
          lotes: options.leerLotes(),
          onDescontar: options.onDescontar,
        }),
      );
    }
  }

  /**
   * Una linea consolidada, desplegable para ver de que recetas sale.
   *
   * @param {object} plan
   * @param {object} linea
   * @returns {HTMLElement}
   */
  function renderLinea(plan, linea) {
    const clave = claveLinea(linea);
    const estaAbierto = abierto === clave;
    const doble = tieneVariasUnidades(plan.lineas, linea.ingrediente);
    const nombreLegible = titleCase(linea.ingrediente);
    const unidad = linea.unidad.toLowerCase();
    const cuantas = linea.recetas.length;

    return el('li', { class: 'plan__linea' + (doble ? ' plan__linea--doble' : '') }, [
      el(
        'button',
        {
          type: 'button',
          class: 'plan__fila',
          dataset: { clave },
          attrs: {
            'aria-expanded': String(estaAbierto),
            'aria-label': `${nombreLegible}, ${formatQty(linea.cantidad)} ${unidad}, de ${cuantas} ${
              cuantas === 1 ? 'receta' : 'recetas'
            }. ${estaAbierto ? 'Ocultar' : 'Ver'} el desglose`,
          },
          on: {
            click: () => {
              abierto = estaAbierto ? null : clave;
              dibujarResultado();
              enfocarLinea(clave);
            },
          },
        },
        [
          el('span', { class: 'plan__linea-nombre', text: nombreLegible }),
          el('span', { class: 'plan__linea-qty' }, [
            el('span', { class: 'plan__linea-num', text: formatQty(linea.cantidad) }),
            el('span', { class: 'plan__linea-unidad', text: unidad }),
          ]),
        ],
      ),

      estaAbierto
        ? el(
            'ul',
            { class: 'plan__origen' },
            linea.recetas.map((origen) =>
              el('li', { class: 'plan__origen-item' }, [
                el('span', { class: 'plan__origen-nombre' }, [
                  titleCase(splitName(origen.nombre).base),
                  // Sin el rendimiento, un desglose con dos Pan Brioche mostraba
                  // dos filas de igual nombre y cifras distintas: parecia un
                  // error de la consolidacion cuando era el dato correcto.
                  yieldLabel(origen.nombre)
                    ? el('span', { class: 'plan__origen-rinde', text: ' ' + yieldLabel(origen.nombre) })
                    : null,
                ]),
                el('span', { class: 'plan__origen-qty' }, [
                  el('span', { class: 'plan__origen-num', text: formatQty(origen.cantidad) }),
                  el('span', { class: 'plan__origen-unidad', text: unidad }),
                ]),
              ]),
            ),
          )
        : null,
    ]);
  }

  /**
   * Devuelve el foco a la fila que se acaba de desplegar.
   *
   * Redibujar la lista destruye el boton pulsado. Sin esto el foco cae al
   * principio del documento y quien navega con teclado pierde el sitio justo
   * despues de abrir un desglose.
   *
   * @param {string} clave
   */
  function enfocarLinea(clave) {
    for (const boton of resultado.querySelectorAll('.plan__fila')) {
      if (boton.dataset.clave === clave) {
        boton.focus();
        return;
      }
    }
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
      contadorSugerencias,
      sugerencias,
      elegidas,
      nota,
    ]),

    el('section', { class: 'plan__pane plan__pane--resultado' }, [
      el('h3', { class: 'section-label', text: 'Todo lo que hay que pesar' }),
      resultado,
    ]),
  ]);

  dibujarTodo();

  return crearPantalla({
    modulo: 'plan',
    subtitulo: 'producción',
    meta: 'Lo que se arme aquí no se guarda: es la cuenta de hoy y se pierde al salir.',
    cuerpo: body,
    onMenu: options.onMenu,
    onVolver: options.onVolver,
    onSalir: options.onSalir,
    // Ya no hay boton de «Cerrar»: se sale por «Menú», que esta en la barra y en
    // el mismo sitio en los cuatro modulos. Un segundo control para lo mismo, en
    // otra esquina, es lo que hace que nadie sepa cual es el camino.
    pie: [
      el('p', {
        class: 'pantalla__nota',
        text: 'Los ingredientes de unidades distintas nunca se suman entre sí.',
      }),
      el('div', { class: 'pantalla__acciones' }, [botonImprimir]),
    ],
  });
}

/**
 * Identifica una linea consolidada. Lleva la unidad porque un mismo ingrediente
 * en dos unidades son dos lineas distintas, y cada una se despliega por su lado.
 *
 * @param {object} linea
 * @returns {string}
 */
function claveLinea(linea) {
  return normalize(linea.ingrediente) + '|' + linea.unidad;
}

/**
 * Lee el numero de tandas escrito a mano.
 *
 * @param {string} raw
 * @returns {number|null} null cuando no es un numero de tandas utilizable
 */
function leerTandas(raw) {
  const valor = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

/**
 * Enumera nombres en una frase legible, resumiendo la cola cuando son muchos.
 *
 * @param {Array<string>} nombres
 * @returns {string}
 */
function enumerar(nombres) {
  const legibles = nombres.map((nombre) => titleCase(nombre));

  if (legibles.length === 0) return '';
  if (legibles.length === 1) return legibles[0];

  if (legibles.length > MAX_NOMBRES_AVISO) {
    const resto = legibles.length - MAX_NOMBRES_AVISO;
    return `${legibles.slice(0, MAX_NOMBRES_AVISO).join(', ')} y ${resto} más`;
  }

  return legibles.slice(0, -1).join(', ') + ' y ' + legibles[legibles.length - 1];
}
