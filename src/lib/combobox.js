/**
 * =============================================================================
 *  LISTA DE SUGERENCIAS DENTRO DE LA PAGINA
 * =============================================================================
 *
 *  POR QUE EXISTE
 *  --------------
 *  El editor ofrecia los ingredientes que ya estan en el recetario con un
 *  `<datalist>` nativo. En el escritorio funciona; en el telefono NO SE VE, y
 *  lo reporto el obrador con estas palabras:
 *
 *      "al registrar una receta tambien me menciona los ingredientes en la
 *       barra superior de teclado, deberia de alguna otra forma permitir ver el
 *       ingrediente mas amigable dado que se delimita este tamano dependiendo
 *       de la configuracion de letra del celular, no se pueden ver los
 *       ingredientes al intentar llenar el formulario"
 *
 *  Y tiene razon en el diagnostico: el navegador del movil no pinta el
 *  `<datalist>` como una lista sobre la pagina, sino como sugerencias DENTRO DE
 *  LA BARRA DEL TECLADO. Esa barra la dibuja el sistema, su alto depende del
 *  tamano de letra que cada persona tenga configurado en el aparato, y cuando
 *  ese tamano es grande las sugerencias no caben y no se llegan a ver. No hay
 *  CSS que lo arregle: esa barra no pertenece a la pagina.
 *
 *  La unica salida es no usar `<datalist>` y pintar la lista nosotros, dentro
 *  del documento, donde si manda el CSS de la aplicacion.
 *
 *  LO QUE SE GANA DE PASO
 *  ----------------------
 *  Un `<datalist>` no puede decir nada mas que el nombre. Aqui cada fila puede
 *  ensenar tambien LA UNIDAD con la que se mide ese ingrediente, que es
 *  informacion que el obrador necesita a la vista: `CLAUDE.md` §13 documenta
 *  que 15 ingredientes se miden hoy de dos o tres formas distintas y que eso es
 *  lo que bloquea el costeo. Ver "HARINA · GR" al elegirlo ayuda a no crear la
 *  cuarta variante sin darse cuenta.
 *
 *  ESTE MODULO NO SABE QUE EXISTE UNA RECETA.
 *  Recibe una lista de opciones y avisa de cual se eligio. Vive en `lib/` y no
 *  importa de `core/`, `app/` ni `views/`, que es la frontera que comprueba
 *  `scripts/verificar.mjs`.
 */

import { el, clear } from './dom.js';
import { normalize } from './format.js';

/** Cuantas sugerencias se construyen como mucho. El CSS ensena 8 y desplaza. */
const MAXIMO = 40;

/** Contador para dar identificadores unicos a cada lista y a sus filas. */
let secuencia = 0;

/**
 * Engancha una lista de sugerencias a un campo de texto.
 *
 * @param {Object} options
 * @param {HTMLInputElement} options.input campo al que acompana
 * @param {HTMLElement} options.contenedor caja `position: relative` que la aloja
 * @param {Array<{nombre: string, unidad?: string}>} options.opciones catalogo
 * @param {(opcion: {nombre: string, unidad?: string}) => void} options.onElegir
 * @returns {{destruir: () => void, actualizar: (opciones: Array) => void}}
 */
export function comboboxIngrediente(options) {
  const input = options.input;
  const contenedor = options.contenedor;
  let opciones = options.opciones || [];

  const id = 'combo-' + ++secuencia;
  const lista = el('ul', {
    class: 'combo__lista',
    id,
    attrs: { role: 'listbox', 'aria-label': 'Ingredientes que ya existen' },
  });
  lista.hidden = true;
  contenedor.appendChild(lista);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-autocomplete', 'list');
  // Sin esto el navegador ofrece ADEMAS su propio historial en la barra del
  // teclado, que es justo lo que se viene a quitar.
  input.setAttribute('autocomplete', 'off');

  /** Filas construidas ahora mismo, con la opcion que representa cada una. */
  let filas = [];
  /** Indice de la fila resaltada, o -1 si no hay ninguna. */
  let activo = -1;

  /* =========================================================================
   *  ABRIR, CERRAR Y RESALTAR
   * ====================================================================== */

  function abierta() {
    return !lista.hidden;
  }

  function cerrar() {
    if (!abierta()) return;
    lista.hidden = true;
    lista.classList.remove('combo__lista--arriba');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activo = -1;
  }

  /**
   * Decide si la lista se abre hacia abajo o hacia arriba.
   *
   * En un telefono, con el campo en la mitad inferior de la pantalla, el
   * teclado del sistema ocupa lo que hay debajo: una lista que se abre hacia
   * abajo queda tapada y volvemos al defecto que este modulo viene a corregir.
   *
   * Se mide contra `visualViewport` cuando existe, que es lo unico que sabe
   * cuanto espacio deja el teclado; `innerHeight` no baja al abrirse.
   */
  function colocar() {
    const caja = input.getBoundingClientRect();
    const alto = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const debajo = alto - caja.bottom;
    const encima = caja.top;
    // Se abre hacia arriba solo si de verdad cabe mejor: en una pantalla muy
    // baja las dos opciones son malas y abajo es la que la persona espera.
    lista.classList.toggle('combo__lista--arriba', debajo < 160 && encima > debajo);
  }

  function resaltar(indice) {
    if (filas[activo]) {
      filas[activo].nodo.classList.remove('is-active');
      filas[activo].nodo.setAttribute('aria-selected', 'false');
    }
    activo = indice;
    const fila = filas[activo];
    if (!fila) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    fila.nodo.classList.add('is-active');
    fila.nodo.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', fila.nodo.id);
    // `nearest` y no `center`: mover la lista entera en cada flecha marea.
    fila.nodo.scrollIntoView({ block: 'nearest' });
  }

  /* =========================================================================
   *  FILTRAR Y PINTAR
   * ====================================================================== */

  /**
   * Ordena las coincidencias poniendo delante las que EMPIEZAN por lo escrito.
   *
   * Buscar por "contiene" y no solo por prefijo es necesario aqui: quien busca
   * `CHOCOLATE 70%` escribe "70", y quien busca `ESENCIA DE VAINILLA` escribe
   * "vainilla". Pero si las coincidencias por el medio se mezclaran con las del
   * principio, escribir "HARINA" dejaria `HARINA DE ALMENDRAS` por encima de
   * `HARINA`, que es lo que casi siempre se quiere.
   *
   * @param {string} escrito
   * @returns {Array<{opcion: object, desde: number}>}
   */
  function coincidencias(escrito) {
    const aguja = normalize(escrito).trim();
    if (aguja === '') return [];

    const empiezan = [];
    const contienen = [];

    for (const opcion of opciones) {
      const nombre = String(opcion.nombre || '');
      if (!nombre) continue;
      const donde = normalize(nombre).indexOf(aguja);
      if (donde === 0) empiezan.push({ opcion, desde: 0 });
      else if (donde > 0) contienen.push({ opcion, desde: donde });
    }

    const porNombre = (a, b) => String(a.opcion.nombre).localeCompare(String(b.opcion.nombre), 'es');
    empiezan.sort(porNombre);
    contienen.sort(porNombre);

    return [...empiezan, ...contienen].slice(0, MAXIMO);
  }

  /**
   * Construye una fila con el tramo coincidente resaltado.
   *
   * El resaltado se hace partiendo el nombre ORIGINAL por los mismos indices
   * que dio la busqueda sobre el nombre normalizado. Vale porque `normalize`
   * solo quita marcas de acento y sube a mayusculas, y ninguna de las dos cosas
   * cambia cuantos caracteres hay: "AZÚCAR" y "AZUCAR" miden igual.
   */
  function construirFila(entrada, indice, largoAguja) {
    const nombre = String(entrada.opcion.nombre);
    const antes = nombre.slice(0, entrada.desde);
    const medio = nombre.slice(entrada.desde, entrada.desde + largoAguja);
    const despues = nombre.slice(entrada.desde + largoAguja);

    const nodo = el(
      'li',
      {
        class: 'combo__opcion',
        id: id + '-o' + indice,
        attrs: { role: 'option', 'aria-selected': 'false' },
      },
      [
        el('span', { class: 'combo__nombre' }, [
          antes,
          el('b', { class: 'combo__match', text: medio }),
          despues,
        ]),
        entrada.opcion.unidad
          ? el('span', { class: 'combo__unidad', text: String(entrada.opcion.unidad) })
          : null,
      ],
    );

    // `pointerdown` y no `click`: para cuando llega el `click` el campo ya
    // perdio el foco y el teclado del telefono ha empezado a cerrarse. Aqui se
    // cancela esa perdida antes de que ocurra.
    nodo.addEventListener('pointerdown', (evento) => {
      evento.preventDefault();
      elegir(entrada.opcion);
    });

    return nodo;
  }

  function pintar(escrito) {
    const aguja = normalize(escrito).trim();
    const encontradas = coincidencias(escrito);

    clear(lista);
    filas = [];
    activo = -1;

    if (opciones.length === 0 || aguja === '') {
      cerrar();
      return;
    }

    if (encontradas.length === 0) {
      // La lista NO se cierra al no encontrar nada, y es a proposito: es la
      // mejor ocasion para decir que el campo admite texto libre y que lo
      // escrito se dara de alta. El `<datalist>` nunca pudo decir esto.
      lista.appendChild(
        el('li', {
          class: 'combo__vacio',
          // Sin `role="option"`: no se puede elegir, y anunciarla como opcion
          // haria que el lector de pantalla ofreciera algo que no responde.
          attrs: { role: 'presentation' },
          text: `Ningún ingrediente se llama así. Al guardar se dará de alta «${escrito.trim()}» como ingrediente nuevo.`,
        }),
      );
    } else {
      encontradas.forEach((entrada, indice) => {
        const nodo = construirFila(entrada, indice, aguja.length);
        filas.push({ nodo, opcion: entrada.opcion });
        lista.appendChild(nodo);
      });
    }

    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    colocar();
  }

  /* =========================================================================
   *  ELEGIR
   * ====================================================================== */

  function elegir(opcion) {
    if (typeof options.onElegir === 'function') options.onElegir(opcion);
    cerrar();
    // El foco vuelve AL MOMENTO, en esta misma tarea. Es la regla 16 del
    // proyecto: devolverlo en el cuadro de animacion siguiente basta en un
    // ordenador y no basta en un telefono, porque entre medias cabe un
    // fotograma y en ese fotograma el sistema empieza a cerrar el teclado.
    input.focus();
  }

  /* =========================================================================
   *  OYENTES
   * ====================================================================== */

  const alEscribir = () => pintar(input.value);

  const alEnfocar = () => {
    // Al enfocar un campo VACIO no se abre nada. Tras "+ ingrediente" el foco
    // cae solo en la fila nueva, y abrir ahi un panel en cada fila anadida
    // taparia la anterior justo cuando se estan metiendo varias seguidas.
    if (input.value.trim() !== '') pintar(input.value);
  };

  const alPerderFoco = () => {
    // Elegir con el dedo no pasa por aqui: el `pointerdown` de la fila cancela
    // la perdida de foco antes de que se produzca.
    cerrar();
  };

  const alTeclear = (evento) => {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      if (!abierta()) {
        pintar(input.value);
        if (filas.length) resaltar(0);
        return;
      }
      if (filas.length) resaltar(activo + 1 >= filas.length ? 0 : activo + 1);
      return;
    }

    if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (!abierta() || !filas.length) return;
      resaltar(activo <= 0 ? filas.length - 1 : activo - 1);
      return;
    }

    if (evento.key === 'Enter') {
      if (abierta() && filas[activo]) {
        // Solo se traga el Intro cuando hay algo resaltado. Sin resaltar, el
        // Intro pertenece al formulario y no a esta lista.
        evento.preventDefault();
        elegir(filas[activo].opcion);
      }
      return;
    }

    if (evento.key === 'Escape') {
      if (!abierta()) return;
      // ESTO ES LO MAS IMPORTANTE DEL ARCHIVO.
      //
      // Sin `stopPropagation`, el Escape sigue subiendo hasta la ventana modal
      // y CIERRA EL EDITOR ENTERO, con la receta a medio escribir dentro. Con
      // la lista abierta, Escape pertenece a la lista; con la lista cerrada,
      // sigue cerrando el editor como siempre.
      evento.stopPropagation();
      evento.preventDefault();
      cerrar();
      return;
    }

    if (evento.key === 'Tab') {
      // Se cierra SIN elegir: autocompletar al tabular sorprende justo cuando
      // lo escrito es un ingrediente nuevo, que es el caso que hay que
      // proteger. El Tab sigue su camino.
      cerrar();
    }
  };

  input.addEventListener('input', alEscribir);
  input.addEventListener('focus', alEnfocar);
  input.addEventListener('blur', alPerderFoco);
  input.addEventListener('keydown', alTeclear);

  return {
    /**
     * Suelta todos los oyentes y quita la lista.
     *
     * Hay que llamarlo ANTES de destruir la fila que contiene el campo. Las
     * filas de ingrediente se reconstruyen enteras al anadir o quitar una
     * (`redrawItems` hace `clear`), y sin esto quedarian oyentes colgando de
     * nodos que ya no estan en el documento.
     */
    destruir() {
      input.removeEventListener('input', alEscribir);
      input.removeEventListener('focus', alEnfocar);
      input.removeEventListener('blur', alPerderFoco);
      input.removeEventListener('keydown', alTeclear);
      input.removeAttribute('role');
      input.removeAttribute('aria-expanded');
      input.removeAttribute('aria-controls');
      input.removeAttribute('aria-autocomplete');
      input.removeAttribute('aria-activedescendant');
      if (lista.parentNode) lista.parentNode.removeChild(lista);
      filas = [];
    },

    /**
     * Cambia el catalogo sin rehacer el enganche.
     *
     * @param {Array<{nombre: string, unidad?: string}>} siguientes
     */
    actualizar(siguientes) {
      opciones = siguientes || [];
      if (abierta()) pintar(input.value);
    },
  };
}
