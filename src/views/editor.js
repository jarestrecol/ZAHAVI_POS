/**
 * =============================================================================
 *  EDITOR DE RECETAS
 * =============================================================================
 *
 *  La misma ventana sirve para crear una receta nueva y para modificar una que
 *  ya existe. Lo unico que cambia es de donde sale el borrador de partida y el
 *  titulo de la ventana.
 *
 *  COMO ESTA REPARTIDA LA PANTALLA
 *  -------------------------------
 *
 *      IDENTIDAD      arriba, a todo el ancho: nombre, rendimiento y categoria
 *      INGREDIENTES   panel izquierdo: componentes, cada uno con sus lineas
 *      METODO         panel derecho: texto libre
 *
 *  EL RENDIMIENTO NO SE TECLEA DENTRO DEL NOMBRE
 *  ---------------------------------------------
 *  El dato llego del Excel escrito dentro del nombre ("ALMOJABANA X 15 UND"), y
 *  ahi se sigue almacenando. Pero PEDIRLO asi obligaba a acordarse de la
 *  formula exacta al crear cada receta, y de ese descuido salen los 13 nombres
 *  que hoy llevan `x` minuscula o "2UND" sin espacio. Peor: el escalado y el
 *  plan del dia leen esa cifra para saber cuanto rinde una tanda, asi que un
 *  nombre mal escrito deja a la receta sin rendimiento y sin que nadie se
 *  entere.
 *
 *  Aqui son tres controles: nombre, cantidad (campo numerico) y unidad (lista).
 *  Al abrir se separan con `splitYield` y al guardar se vuelven a juntar con
 *  `composeName`. La regla que protege los datos ya publicados: si nadie toco
 *  el rendimiento, el nombre se guarda BYTE A BYTE como estaba, sin pasar por
 *  la forma canonica. Reescribirlo cambiaria la identidad con la que la receta
 *  aparece en el plan, en el catalogo de ingredientes y en las busquedas.
 *
 *  Se edita sobre una COPIA, nunca sobre la receta original. Mientras la
 *  ventana esta abierta, el recetario no se entera de nada: solo al pulsar
 *  Guardar se valida el borrador entero y se entrega. Cancelar, cerrar o pulsar
 *  Escape dejan la receta exactamente como estaba, sin necesidad de deshacer
 *  nada.
 *
 *  QUE SE REPINTA Y CUANDO
 *  -----------------------
 *  Los componentes y sus lineas se redibujan solos cuando se anade o se quita
 *  alguno (`redrawComponents` y `redrawItems`). El resto de campos escribe
 *  directamente en el borrador segun se teclea, sin repintar: repintar mientras
 *  alguien escribe le movería el cursor.
 */

import { el, clear, desplazarAlFinal } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { comboboxIngrediente } from '../lib/combobox.js';
import { dictadoDisponible, crearDictado } from '../lib/dictado.js';
import { splitYield, composeName, yieldUnitList } from '../lib/format.js';
import { CATEGORIES, UNITS, validateRecipe } from '../core/schema.js';
import { createWindow } from './window.js';

/*
 * Ya no hay `<datalist>`.
 *
 * Las sugerencias de ingrediente y de unidad las pinta `lib/combobox.js` DENTRO
 * de la pagina. El motivo esta entero en la cabecera de ese archivo, y en corto
 * es este: el navegador del telefono no dibuja un `<datalist>` sobre la pagina
 * sino dentro de la barra del teclado, cuyo alto depende del tamano de letra
 * que cada persona tenga configurado en el aparato. Con letra grande, las
 * sugerencias no caben y NO SE VEN. Lo reporto el obrador.
 */

/**
 * Unidades de rendimiento que ofrece la lista.
 *
 * Salen de las 121 recetas reales: 73 en UND, 5 en CAJAS y 8 sin unidad. PAQ. y
 * PORCIONES estan porque el separador de nombres ya las reconoce, asi que una
 * receta escrita con ellas se sigue leyendo bien.
 */
const UNIDADES_RINDE = ['UND', 'PAQ.', 'CAJAS', 'PORCIONES'];

/** Id de la aclaracion que acompaña al campo del nombre. */
const HINT_ID = 'recipe-name-hint';

/**
 * Detecta un rendimiento ESCONDIDO dentro del nombre, que el separador no supo
 * extraer porque no esta al final.
 *
 * Son 15 de las 121, como `TORTA ... X 1 UND ( SIN AZUCAR )` o `TORTA SUIZA x 2
 * GRANDES O 4 PEQUEÑAS`. En esas, el editor deja el nombre entero en el campo
 * de nombre y el de rinde vacio, asi que rellenar el rinde produciria un
 * "... X 1 UND ( SIN AZUCAR ) X 1 UND" con el rendimiento por duplicado. Es
 * exactamente donde el formulario nuevo invita a equivocarse, asi que se avisa.
 */
const RINDE_ESCONDIDO = /[Xx]\s*\d/;

/**
 * Texto de apoyo bajo el campo del nombre.
 *
 * @param {string} nombreOriginal
 * @param {{cantidad: string}} partes
 * @returns {string}
 */
function pistaNombre(nombreOriginal, partes) {
  if (partes.cantidad === '' && RINDE_ESCONDIDO.test(nombreOriginal)) {
    return 'Ojo: este nombre parece llevar el rendimiento dentro. Quítalo del nombre y escríbelo en «rinde», o quedará repetido.';
  }
  return 'Solo el nombre. El rendimiento va en los campos de al lado.';
}

/**
 * Abre el editor sobre una copia del borrador. El original no se toca hasta guardar.
 *
 * @param {Object} options
 * @param {object} options.draft receta a editar
 * @param {boolean} options.isNew
 * @param {Array<{nombre: string, unidad: string}>} options.ingredientes catalogo
 * @param {(recipe: object) => void} options.onSave
 * @param {() => void} options.onCancel
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openEditor(options) {
  // Copia profunda: cancelar debe dejar la receta original intacta.
  const draft = JSON.parse(JSON.stringify(options.draft));
  const unitByIngredient = buildUnitLookup(options.ingredientes);

  /**
   * El nombre tal y como estaba al abrir, y sus tres partes editables.
   *
   * `nombreOriginal` es la referencia que permite devolverlo intacto cuando
   * nadie tocó el rendimiento.
   */
  const nombreOriginal = draft.nombre || '';
  const partes = splitYield(nombreOriginal);

  const errorBox = el('p', { class: 'form-error', attrs: { role: 'alert' } });
  const componentsHost = el('div', { class: 'editor__components' });

  /*
   * LAS LISTAS DE SUGERENCIAS VIVAS AHORA MISMO.
   *
   * Se apuntan FUERA del DOM, en este array, porque `redrawItems` y
   * `redrawComponents` hacen `clear()` sin avisar a nadie: sin este registro
   * quedarian oyentes colgando de campos que ya no estan en el documento, uno
   * por cada linea anadida o quitada, durante toda la edicion.
   *
   * Es la regla 16 del proyecto aplicada a algo que no es el foco: lo que hay
   * que recordar de un nodo no se le pregunta al nodo justo antes de destruirlo.
   */
  const combos = [];

  /** Apunta una lista recien creada junto al campo al que acompana. */
  function registrarCombo(input, combo) {
    combos.push({ input, combo });
  }

  /** Suelta las listas de todos los campos que haya dentro de `host`. */
  function soltarCombosDe(host) {
    for (let i = combos.length - 1; i >= 0; i -= 1) {
      if (host.contains(combos[i].input)) {
        combos[i].combo.destruir();
        combos.splice(i, 1);
      }
    }
  }

  const redrawComponents = () => {
    soltarCombosDe(componentsHost);
    clear(componentsHost);
    draft.componentes.forEach((component, index) => {
      componentsHost.appendChild(renderComponent(component, index));
    });
  };

  /* =======================================================================
   *  1. UN COMPONENTE (masa, relleno, cobertura...)
   * ==================================================================== */

  /**
   * Dibuja un componente entero: su nombre, la cabecera de columnas, sus
   * lineas de ingrediente y el boton de anadir una mas.
   *
   * El boton de quitar el componente solo aparece si hay mas de uno: una
   * receta sin ningun componente no tendria donde poner los ingredientes.
   *
   * @param {{nombre: string, items: Array}} component
   * @param {number} componentIndex posicion dentro del borrador
   * @returns {HTMLElement}
   */
  function renderComponent(component, componentIndex) {
    const itemsHost = el('div', { class: 'rows' });

    const redrawItems = () => {
      soltarCombosDe(itemsHost);
      clear(itemsHost);
      component.items.forEach((item, itemIndex) => {
        itemsHost.appendChild(renderItemRow(item, componentIndex, itemIndex, component, redrawItems));
      });
    };
    redrawItems();

    return el('fieldset', { class: 'component-edit' }, [
      el('legend', { class: 'sr-only', text: `Componente ${componentIndex + 1}` }),
      el('div', { class: 'component-edit__head' }, [
        el('label', {
          class: 'sr-only',
          for: `comp-${componentIndex}`,
          text: 'Nombre del componente',
        }),
        el('input', {
          type: 'text',
          id: `comp-${componentIndex}`,
          class: 'field field--component',
          value: component.nombre,
          placeholder: 'Nombre del componente',
          on: {
            input: (event) => {
              component.nombre = event.target.value.toUpperCase();
            },
          },
        }),
        draft.componentes.length > 1
          ? el('button', {
              type: 'button',
              class: 'btn-icon',
              text: '×',
              attrs: { 'aria-label': `Quitar componente ${component.nombre || componentIndex + 1}` },
              on: {
                click: () => {
                  draft.componentes.splice(componentIndex, 1);
                  redrawComponents();
                  announce('Componente eliminado.');
                },
              },
            })
          : null,
      ]),
      el('div', { class: 'rows__head', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { text: 'ingrediente' }),
        el('span', { class: 'rows__num', text: 'cant.' }),
        el('span', { text: 'und' }),
        el('span'),
      ]),
      itemsHost,
      el('button', {
        type: 'button',
        class: 'btn-link',
        text: '+ ingrediente',
        on: {
          click: () => {
            component.items.push({ ingrediente: '', cantidad: '', unidad: 'GR' });
            redrawItems();
            focusLastIngredient(itemsHost);
          },
        },
      }),
    ]);
  }

  /* =======================================================================
   *  2. UNA LINEA DE INGREDIENTE
   * ==================================================================== */

  /**
   * Una fila del componente: ingrediente, cantidad, unidad y quitar.
   *
   * El nombre y la unidad se pasan a mayusculas segun se escriben, para que
   * las 121 recetas mantengan el mismo criterio que traian de origen y el
   * autocompletado encuentre coincidencias.
   *
   * @param {{ingrediente: string, cantidad: string|number, unidad: string}} item
   * @param {number} componentIndex
   * @param {number} itemIndex
   * @param {object} component componente al que pertenece la linea
   * @param {() => void} redrawItems repinta las lineas tras quitar una
   * @returns {HTMLElement}
   */
  function renderItemRow(item, componentIndex, itemIndex, component, redrawItems) {
    const rowId = `it-${componentIndex}-${itemIndex}`;

    const unitInput = el('input', {
      type: 'text',
      id: rowId + '-u',
      class: 'field',
      value: item.unidad,
      placeholder: 'gr',
      dataset: { campo: 'unidad' },
      attrs: { 'aria-label': 'Unidad' },
      on: {
        input: (event) => {
          item.unidad = event.target.value.toUpperCase();
        },
      },
    });

    /**
     * Propone la unidad habitual del ingrediente, sin pisar lo ya escrito.
     *
     * Solo rellena si la casilla esta vacia: quien ya puso una unidad a mano
     * sabe por que, y corregirsela seria decidir por el obrador sobre algo que
     * `CLAUDE.md` §13 declara que es una decision del negocio.
     */
    const proponerUnidad = (nombre) => {
      const sugerida = unitByIngredient.get(String(nombre || '').toUpperCase());
      if (sugerida && unitInput.value.trim() === '') {
        unitInput.value = sugerida;
        item.unidad = sugerida;
      }
    };

    const ingInput = el('input', {
      type: 'text',
      id: rowId + '-i',
      class: 'field',
      value: item.ingrediente,
      placeholder: 'Ingrediente',
      // El foco tras "+ ingrediente" se busca por este `data-*`. Antes se
      // buscaba por `input[list=...]`, y al quitar el datalist ese selector
      // habria dejado de encontrar nada EN SILENCIO: el boton seguiria
      // anadiendo la fila y el cursor ya no iria a ella.
      dataset: { campo: 'ingrediente' },
      attrs: { 'aria-label': 'Ingrediente' },
      on: {
        input: (event) => {
          item.ingrediente = event.target.value.toUpperCase();
        },
        // Escribir el nombre entero a mano y salir del campo tambien propone la
        // unidad. Elegir de la lista pasa por `onElegir`, aqui abajo.
        change: (event) => proponerUnidad(event.target.value),
      },
    });

    // Cada campo va dentro de su propia caja `position: relative`: es de donde
    // cuelga la lista de sugerencias. Sin ella la lista se posicionaria contra
    // el dialogo entero, que ademas lleva `backdrop-filter` (regla 21).
    const cajaIngrediente = el('div', { class: 'combo' }, [ingInput]);
    const cajaUnidad = el('div', { class: 'combo' }, [unitInput]);

    registrarCombo(
      ingInput,
      comboboxIngrediente({
        input: ingInput,
        contenedor: cajaIngrediente,
        opciones: options.ingredientes,
        onElegir: (opcion) => {
          ingInput.value = String(opcion.nombre).toUpperCase();
          item.ingrediente = ingInput.value;
          proponerUnidad(opcion.nombre);
        },
      }),
    );

    // La unidad usa la MISMA lista y no un `<select>`, a proposito. Un
    // desplegable cerrado impediria escribir una unidad que no este en las
    // cinco canonicas, y eso es quitar una capacidad que hoy existe: no es una
    // decision que corresponda tomar de paso mientras se arregla otra cosa.
    registrarCombo(
      unitInput,
      comboboxIngrediente({
        input: unitInput,
        contenedor: cajaUnidad,
        opciones: UNITS.map((unidad) => ({ nombre: unidad })),
        onElegir: (opcion) => {
          unitInput.value = String(opcion.nombre).toUpperCase();
          item.unidad = unitInput.value;
        },
      }),
    );

    return el('div', { class: 'row' }, [
      cajaIngrediente,
      el('input', {
        type: 'text',
        inputMode: 'decimal',
        id: rowId + '-c',
        class: 'field field--num',
        value: item.cantidad,
        placeholder: '0',
        attrs: { 'aria-label': 'Cantidad' },
        on: {
          input: (event) => {
            item.cantidad = event.target.value;
          },
        },
      }),
      cajaUnidad,
      el('button', {
        type: 'button',
        class: 'btn-icon',
        text: '×',
        attrs: { 'aria-label': 'Quitar esta línea' },
        on: {
          click: () => {
            component.items.splice(itemIndex, 1);
            // Un componente nunca se queda sin ninguna fila: si se quita la
            // ultima, entra una vacia en su lugar. Dejarlo a cero mostraba un
            // componente con nombre y nada debajo, y la unica salida era
            // borrar el componente entero y volver a crearlo.
            if (component.items.length === 0) {
              component.items.push({ ingrediente: '', cantidad: '', unidad: 'GR' });
            }
            redrawItems();
          },
        },
      }),
    ]);
  }

  redrawComponents();

  /* =======================================================================
   *  3. EL METODO, QUE ADEMAS SE PUEDE DICTAR
   * ==================================================================== */

  /**
   * El panel derecho: el texto del metodo y, si el navegador sabe, el dictado.
   *
   * POR QUE ESTO IMPORTA MAS DE LO QUE PARECE
   * -----------------------------------------
   * Las 122 recetas tienen el metodo VACIO (`CLAUDE.md` seccion 13) y esta
   * anotado como trabajo de contenido pendiente. La razon real es que en el
   * obrador no hay tiempo de teclear media pagina con las manos en la masa.
   * Esto es lo que lo desbloquea.
   *
   * LA DECISION QUE SOSTIENE TODO LO DEMAS
   * --------------------------------------
   * Lo PROVISIONAL no entra en el textarea. Va en una linea aparte debajo, y
   * solo se vuelca cuando el reconocedor lo da por bueno. Un `<textarea>` no
   * admite formato dentro, asi que no habria forma de distinguir lo confirmado
   * de lo que aun puede cambiar: mezclarlos es exactamente como esta API acaba
   * escribiendo cada palabra dos veces. Con lo provisional fuera, el textarea
   * contiene SIEMPRE texto confirmado y se puede seguir editando a mano
   * mientras se dicta, sin pelearse con el reconocedor.
   *
   * @returns {HTMLElement}
   */
  function construirPanelMetodo() {
    const metodo = el('textarea', {
      id: 'recipe-method',
      class: 'field field--method',
      rows: 20,
      value: draft.metodo || '',
      placeholder: dictadoDisponible()
        ? 'Escribe el método paso a paso, o pulsa Dictar y cuéntalo en voz alta.'
        : 'Escribe aquí paso a paso el método de preparación…',
      on: {
        input: (event) => {
          draft.metodo = event.target.value;
          // Escribir a mano da por cerrada la posibilidad de deshacer el
          // borrado: lo que hay ahora ya no es lo que se borro.
          olvidarBorrado();
          refrescarBorrar();
        },
      },
    });

    const etiqueta = el('label', {
      class: 'section-label',
      for: 'recipe-method',
      text: 'Método de preparación',
    });

    // Sin soporte NO se pinta el boton, ni un hueco, ni una explicacion: el
    // panel se ve exactamente como antes. Un control muerto invita a tocarlo y
    // a preguntarse que pasa.
    if (!dictadoDisponible()) {
      return el('section', { class: 'editor__pane' }, [etiqueta, metodo]);
    }

    /*
     * Lo que habia antes de "Borrar todo".
     *
     * Va aqui, en una variable, y no leyendose del propio textarea cuando haga
     * falta: para entonces ya se habria borrado. Es la regla 16.
     */
    let borrado = null;

    /** Palabras que habia al empezar, para poder decir cuantas entraron. */
    let palabrasAlEmpezar = 0;

    const parcial = el('p', { class: 'dictado__parcial' });
    parcial.hidden = true;

    const estado = el('p', { class: 'dictado__estado', attrs: { role: 'status' } });
    estado.hidden = true;

    const deshacer = el('div', { class: 'dictado__deshacer' }, [
      el('span', { text: 'Método borrado. ' }),
      el('button', {
        type: 'button',
        class: 'btn-link',
        text: 'Deshacer',
        on: {
          click: () => {
            if (borrado === null) return;
            metodo.value = borrado;
            draft.metodo = borrado;
            olvidarBorrado();
            refrescarBorrar();
            metodo.focus();
            announce('Método restaurado.');
          },
        },
      }),
    ]);
    deshacer.hidden = true;

    const confirmar = el('div', { class: 'dictado__confirmar' }, [
      el('span', { text: '¿Borrar todo el método? Se puede deshacer.' }),
      el('button', {
        type: 'button',
        class: 'btn btn--danger',
        text: 'Borrar todo',
        on: {
          click: () => {
            borrado = metodo.value;
            metodo.value = '';
            draft.metodo = '';
            confirmar.hidden = true;
            deshacer.hidden = false;
            refrescarBorrar();
            metodo.focus();
            announce('Método borrado. Se puede deshacer.', 'assertive');
          },
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        text: 'Conservar lo escrito',
        on: {
          click: () => {
            confirmar.hidden = true;
            metodo.focus();
          },
        },
      }),
    ]);
    confirmar.hidden = true;

    const botonBorrar = el('button', {
      type: 'button',
      class: 'btn btn--quiet',
      text: 'Borrar todo',
      on: {
        click: () => {
          // Se pregunta AQUI DENTRO y no con un `confirm()` del navegador ni
          // con otro dialogo encima: el editor ya es una ventana modal, y
          // apilar otra para una pregunta de una linea desorienta.
          confirmar.hidden = false;
          deshacer.hidden = true;
        },
      },
    });

    /** El boton de borrar no se ofrece si no hay nada que borrar. */
    function refrescarBorrar() {
      const vacio = metodo.value.trim() === '';
      botonBorrar.disabled = vacio;
      if (vacio) confirmar.hidden = true;
    }

    function olvidarBorrado() {
      borrado = null;
      deshacer.hidden = true;
    }

    /**
     * Vuelca al textarea un tramo que el reconocedor ya dio por bueno.
     *
     * Se anade AL FINAL y no en la posicion del cursor: mientras se dicta nadie
     * esta tecleando, y que el texto aparezca a mitad de una frase que se
     * corrigio hace dos minutos es justo lo que nadie espera.
     */
    function escribirConfirmado(texto) {
      if (!texto) return;
      const actual = metodo.value;
      const separador = actual === '' || /\s$/.test(actual) ? '' : ' ';
      metodo.value = actual + separador + texto;
      draft.metodo = metodo.value;
      // El campo se queda ensenando el final: sin esto, lo que se acaba de
      // dictar se escribe fuera de la parte visible y parece que no pasa nada.
      desplazarAlFinal(metodo);
      olvidarBorrado();
      refrescarBorrar();
    }

    function mostrarEstado(texto, variante) {
      estado.classList.remove('dictado__estado--escuchando', 'dictado__estado--error');
      clear(estado);
      if (!texto) {
        estado.hidden = true;
        return;
      }
      if (variante) estado.classList.add('dictado__estado--' + variante);
      if (variante === 'escuchando') {
        estado.appendChild(el('span', { class: 'dictado__punto', attrs: { 'aria-hidden': 'true' } }));
      }
      estado.appendChild(el('span', { text: texto }));
      estado.hidden = false;
    }

    const contarPalabras = (texto) => (texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length);

    const dictado = crearDictado({
      onTexto: escribirConfirmado,
      onParcial: (texto) => {
        parcial.textContent = texto;
        parcial.hidden = texto === '';
      },
      onEstado: (fase) => {
        if (fase === 'pidiendo') {
          botonDictar.disabled = true;
          botonDictar.textContent = 'Pidiendo permiso…';
          return;
        }
        if (fase === 'escuchando') {
          botonDictar.disabled = false;
          botonDictar.textContent = 'Detener';
          botonDictar.setAttribute('aria-label', 'Detener el dictado');
          mostrarEstado('Escuchando… Habla con calma.', 'escuchando');
          return;
        }
        // Detenido.
        botonDictar.disabled = false;
        botonDictar.textContent = 'Dictar';
        botonDictar.setAttribute('aria-label', 'Dictar el método por voz');
        parcial.hidden = true;
        parcial.textContent = '';
        // Un error ya dejo su propio mensaje puesto: no se pisa.
        if (!estado.classList.contains('dictado__estado--error')) mostrarEstado('');
        const entraron = contarPalabras(metodo.value) - palabrasAlEmpezar;
        if (entraron > 0) announce('Dictado detenido. ' + entraron + ' palabras escritas.');
        // El foco vuelve al texto, al final, que es donde se va a corregir.
        metodo.focus();
        metodo.setSelectionRange(metodo.value.length, metodo.value.length);
      },
      onError: (mensaje) => {
        mostrarEstado(mensaje, 'error');
        announce(mensaje, 'assertive');
      },
    });

    const botonDictar = el('button', {
      type: 'button',
      class: 'btn btn--quiet',
      text: 'Dictar',
      attrs: { 'aria-label': 'Dictar el método por voz' },
      on: {
        click: () => {
          if (dictado.activo()) {
            dictado.detener();
            return;
          }
          palabrasAlEmpezar = contarPalabras(metodo.value);
          mostrarEstado('');
          // EL TECLADO SE QUITA DE EN MEDIO.
          //
          // Si el foco se queda en el textarea, el teclado del sistema sigue
          // abierto tapando media pantalla y quien dicta no ve crecer su propio
          // texto. Al detener se devuelve el foco, unas lineas mas arriba.
          metodo.blur();
          dictado.iniciar();
          announce('Escuchando. Habla ahora.');
        },
      },
    });

    refrescarBorrar();

    return el('section', { class: 'editor__pane' }, [
      el('div', { class: 'editor__pane-head' }, [
        etiqueta,
        el('div', { class: 'dictado' }, [botonDictar, botonBorrar]),
      ]),
      metodo,
      parcial,
      estado,
      confirmar,
      deshacer,
      // PERMANENTE, y no solo al activar el dictado. Quien va a hablarle al
      // telefono tiene derecho a saber esto ANTES, no despues.
      el('p', {
        class: 'field-hint',
        text: 'El dictado necesita conexión: el navegador envía tu voz a un servicio externo para convertirla en texto.',
      }),
    ]);
  }

  /* =======================================================================
   *  4. LA VENTANA COMPLETA
   * ==================================================================== */

  /**
   * ¿Las tres partes siguen siendo las que se leyeron al abrir la ventana?
   *
   * Se compara parte por parte y no el nombre entero: comparar los nombres
   * exigiria componer primero, que es justamente lo que hay que evitar.
   *
   * @returns {boolean}
   */
  function rindeSinCambios() {
    const original = splitYield(nombreOriginal);
    return (
      String(partes.base).trim() === original.base.trim() &&
      String(partes.cantidad).trim() === original.cantidad.trim() &&
      String(partes.unidad).trim() === original.unidad.trim()
    );
  }

  const body = el('div', { class: 'editor' }, [
    el('div', { class: 'editor__identity' }, [
      el('div', { class: 'editor__name' }, [
        el('label', { class: 'label', for: 'recipe-name', text: 'nombre de la receta' }),
        el('input', {
          type: 'text',
          id: 'recipe-name',
          class: 'field field--title',
          value: partes.base,
          placeholder: 'Ej. Torta de banano',
          attrs: { required: true, autocomplete: 'off', 'aria-describedby': HINT_ID },
          on: {
            input: (event) => {
              partes.base = event.target.value;
            },
          },
        }),
        // `id` mas `aria-describedby` en el campo: sin eso la aclaracion la ve
        // quien mira la pantalla y no la oye quien usa lector de pantalla, y es
        // justo la instruccion que evita volver a meter el rendimiento dentro
        // del nombre.
        el('p', {
          class: 'field-hint',
          id: HINT_ID,
          text: pistaNombre(nombreOriginal, partes),
        }),
      ]),

      // Rendimiento en dos controles. La cantidad es `type="number"`, asi que
      // no admite letras ni el separador equivocado; la unidad se elige, no se
      // escribe. Es lo que garantiza que la cifra que lee el escalado sea
      // siempre un numero.
      //
      // Van dentro de un `fieldset`: por separado, "rinde" y "unidad" son dos
      // etiquetas de una palabra, y quien tabula directo al desplegable oye
      // "unidad" sin saber de que. La leyenda los une en una sola pregunta.
      el('fieldset', { class: 'editor__rinde' }, [
        el('legend', { class: 'sr-only', text: 'Rendimiento de la receta' }),
        el('div', { class: 'editor__rinde-cantidad' }, [
          el('label', { class: 'label', for: 'recipe-yield-qty', text: 'rinde' }),
          el('input', {
            type: 'number',
            id: 'recipe-yield-qty',
            class: 'field field--num',
            value: partes.cantidad,
            min: '0',
            step: 'any',
            placeholder: '—',
            attrs: { autocomplete: 'off' },
            on: {
              input: (event) => {
                partes.cantidad = event.target.value;
              },
            },
          }),
        ]),
        el('div', { class: 'editor__rinde-unidad' }, [
          el('label', { class: 'label', for: 'recipe-yield-unit', text: 'unidad' }),
          el(
            'select',
            {
              id: 'recipe-yield-unit',
              class: 'field',
              on: {
                change: (event) => {
                  partes.unidad = event.target.value;
                },
              },
            },
            yieldUnitOptions(partes.unidad),
          ),
        ]),
      ]),

      el('div', { class: 'editor__categoria' }, [
        el('label', { class: 'label', for: 'recipe-category', text: 'categoría' }),
        el(
          'select',
          {
            id: 'recipe-category',
            class: 'field',
            on: {
              change: (event) => {
                draft.categoria = event.target.value;
              },
            },
          },
          categoryOptions(draft.categoria),
        ),
      ]),
    ]),
    el('div', { class: 'editor__panes' }, [
      el('section', { class: 'editor__pane' }, [
        el('div', { class: 'editor__pane-head' }, [
          el('h3', { class: 'section-label', text: 'Ingredientes' }),
          el('button', {
            type: 'button',
            class: 'btn btn--quiet',
            text: '+ Componente',
            on: {
              click: () => {
                draft.componentes.push({
                  nombre: 'NUEVO COMPONENTE',
                  items: [{ ingrediente: '', cantidad: '', unidad: 'GR' }],
                });
                redrawComponents();
                announce('Componente agregado.');
              },
            },
          }),
        ]),
        componentsHost,
      ]),
      construirPanelMetodo(),
    ]),
  ]);

  /**
   * Valida el borrador entero y, si esta correcto, lo entrega.
   *
   * La validacion ocurre aqui y no mientras se escribe: avisar campo por campo
   * mientras alguien teclea una cantidad a medias solo estorba. El error se
   * muestra dentro del formulario y se anuncia a los lectores de pantalla,
   * nunca en un `alert()` del navegador.
   */
  const save = () => {
    // El nombre almacenado se arma aqui, en el ultimo momento, a partir de las
    // tres partes. Si ninguna cambio respecto a como se abrio la ventana, se
    // devuelve el original SIN TOCAR: 13 de las 121 recetas usan `x` minuscula
    // o "2UND" sin espacio, y componer la forma canonica las reescribiria por
    // el simple hecho de haber abierto el editor a mirar.
    draft.nombre = rindeSinCambios() ? nombreOriginal : composeName(partes.base, partes.cantidad, partes.unidad);

    const result = validateRecipe(draft);
    if (!result.ok) {
      errorBox.textContent = result.message;
      announce(result.message, 'assertive');
      return;
    }
    errorBox.textContent = '';
    options.onSave(result.value);
  };

  return createWindow({
    title: options.isNew ? 'Nueva receta' : 'Editar receta',
    meta: 'código ' + draft.id,
    size: 'wide',
    dismissOnBackdrop: false,
    onClose: options.onCancel,
    body,
    footer: [
      // EL ERROR VA EN EL PIE, junto al boton que lo provoca.
      //
      // Estaba al final del formulario, despues del metodo de preparacion, que
      // ocupa toda la mitad derecha: quedaba fuera de la vista. Se pulsaba
      // Guardar, no se guardaba, y en pantalla no pasaba nada. El motivo estaba
      // escrito, pero en un sitio donde nadie mira.
      errorBox,
      el('p', { class: 'win__hint', text: 'Los cambios se guardan en este dispositivo.' }),
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cancelar',
          on: { click: options.onCancel },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          text: 'Guardar receta',
          on: { click: save },
        }),
      ]),
    ],
  });
}

/* ===========================================================================
 *  4. AYUDANTES
 * ======================================================================== */

/**
 * Opciones del desplegable de categoria.
 *
 * Si la receta trae una categoria que no esta entre las tres canonicas (puede
 * pasar con datos antiguos), se anade al final en vez de descartarla: cambiar
 * la categoria de una receta tiene que ser una decision de quien edita, no un
 * efecto secundario de abrir el editor.
 *
 * @param {string} selected categoria actual de la receta
 * @returns {Array<HTMLElement>}
 */
function categoryOptions(selected) {
  const known = CATEGORIES.includes(selected) ? CATEGORIES : [...CATEGORIES, selected];
  return known.filter(Boolean).map((name) =>
    el('option', { value: name, text: name, selected: name === selected }),
  );
}

/**
 * Opciones de la unidad de rendimiento.
 *
 * Si la receta trae una unidad que no esta en la lista, se añade como opcion
 * propia en vez de descartarla. Hoy pasa con una sola receta, `BAGUEL NORMAL X
 * 32 UND O 8 PAQ.`, cuyo rendimiento es doble. Sin esta linea, abrir esa receta
 * y guardarla le borraria la mitad del rendimiento en silencio.
 *
 * @param {string} selected unidad actual, cadena vacia si no declara ninguna
 * @returns {Array<HTMLElement>}
 */
function yieldUnitOptions(selected) {
  const actual = String(selected || '').trim();
  const conocidas = yieldUnitList(UNIDADES_RINDE, actual);

  return [
    el('option', { value: '', text: 'sin unidad', selected: actual === '' }),
    ...conocidas.map((unidad) =>
      el('option', { value: unidad, text: unidad.toLowerCase(), selected: unidad === actual }),
    ),
  ];
}

/**
 * Indice de ingrediente a su unidad habitual.
 *
 * Sirve para proponer la unidad al elegir un ingrediente conocido y ahorrar
 * ese paso, que se repite en cada linea de cada receta.
 *
 * @param {Array<{nombre: string, unidad: string}>} ingredientes
 * @returns {Map<string, string>}
 */
function buildUnitLookup(ingredientes) {
  const map = new Map();
  for (const item of ingredientes) {
    if (item.nombre && item.unidad) map.set(item.nombre.toUpperCase(), item.unidad);
  }
  return map;
}

/**
 * Lleva el cursor a la fila recien anadida.
 *
 * Sin esto, tras pulsar "+ ingrediente" habia que ir a buscar el campo con el
 * raton o con el tabulador, y se anaden muchas seguidas.
 *
 * @param {HTMLElement} host contenedor de las filas del componente
 */
function focusLastIngredient(host) {
  const inputs = host.querySelectorAll('input[data-campo="ingrediente"]');
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
}
