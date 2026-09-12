/**
 * =============================================================================
 *  CARCASA DE PANTALLA COMPLETA
 * =============================================================================
 *
 *  Lo que `views/window.js` es para un diálogo, esto es para un módulo: barra
 *  superior propia, avisos de contexto, cuerpo con desplazamiento y pie de
 *  acciones. La diferencia no es de estilo.
 *
 *  POR QUE EL PLAN, LOS INGREDIENTES Y EL ALMACEN DEJARON DE SER VENTANAS
 *  ---------------------------------------------------------------------
 *  Eran recuadros flotando encima del recetario, con el listado de recetas
 *  asomando por los bordes. Eso decia, sin querer, que el recetario es la
 *  aplicacion y que lo demas son cosas que se consultan un momento y se
 *  cierran. Cuando esos «momentos» son dar de alta una compra, cuadrar una
 *  bodega o costear una produccion, el recuadro estorba dos veces: deja menos
 *  sitio del que la tarea necesita, y sugiere una jerarquia que ya no existe.
 *
 *  Y habia un coste medible: una ventana modal reserva margenes a los cuatro
 *  lados, asi que en la tableta del obrador la tabla del almacen se quedaba con
 *  unos 1.100 px de los 1.280 de la pantalla para siete columnas.
 *
 *  LO QUE SE CONSERVA DE LA VENTANA, PORQUE HACIA FALTA
 *  ---------------------------------------------------
 *  - Escape sale del modulo. Quien navega con teclado espera que funcione, y
 *    funcionaba.
 *  - El cuerpo se desplaza por DENTRO y la barra se queda fija. Es la misma
 *    regla que sostiene el ajuste movil: el documento no se desplaza nunca.
 *
 *  LO QUE NO SE CONSERVA, A PROPOSITO
 *  ----------------------------------
 *  - No hay foco atrapado. Atrapar el foco es correcto en un dialogo, que es una
 *    interrupcion sobre algo que sigue debajo; aqui no hay nada debajo, y
 *    atraparlo impediria llegar a la barra del navegador con el teclado.
 *  - No hay boton de cerrar con una equis. Se sale por «Menú», que es el mismo
 *    sitio en los cuatro modulos.
 */

import { el, replaceChildren } from '../lib/dom.js';
import { renderBarra } from './header.js';
import { ICON_VOLVER } from '../lib/iconos.js';

/**
 * @param {Object} options
 * @param {string} options.modulo clave del modulo, para el CSS (`almacen`…)
 * @param {string} options.subtitulo lo que se lee junto a la marca
 * @param {string} [options.meta] una linea que explica de que va la pantalla
 * @param {Node} options.cuerpo
 * @param {Array<Node>} [options.pie]
 * @param {Array<object>} [options.acciones] botones propios de la barra
 * @param {() => void} options.onMenu
 * @param {(() => void)|null} [options.onVolver] a la ficha de la que se vino
 * @param {() => void} options.onSalir a donde lleva Escape
 * @returns {{node: HTMLElement, pintarAvisos: (nodos: Array<Node>) => void,
 *            close: () => void}}
 */
export function crearPantalla(options) {
  /*
   * Los avisos de contexto van en un nodo VACIO que rellena quien pinta.
   *
   * La pantalla de un modulo no se reconstruye mientras esta abierta -si no, el
   * formulario a medio rellenar y la busqueda se perderian-, pero «sin conexión»
   * y «cambios sin publicar» SI cambian mientras tanto. Dejar el hueco y
   * rellenarlo desde fuera es lo que permite que el aviso sea cierto sin tirar
   * la pantalla entera.
   */
  const avisos = el('div', { class: 'pantalla__avisos' });

  const node = el(
    'div',
    {
      class: 'pantalla',
      dataset: { modulo: options.modulo },
      // Para poder recibir el foco al montarse, mas abajo. Sin `tabindex` un
      // `div` no lo acepta y la llamada a `focus()` no hace nada.
      attrs: { tabindex: '-1' },
    },
    [
      renderBarra({
        subtitulo: options.subtitulo,
        onMenu: options.onMenu,
        /*
         * VOLVER A LA RECETA TIENE QUE SER UN BOTON, NO SOLO ESCAPE.
         *
         * El plan y el catalogo se consultan a media lectura de una formula, y
         * el sistema ya guarda cual era (`?r=R001` en la direccion) para poder
         * devolver a ella. Eso funcionaba porque las tres eran ventanas y toda
         * ventana traia su «Cerrar»; al convertirlas en pantallas ese boton se
         * fue con la ventana y la vuelta quedo solo en Escape. En la tableta de
         * pared del obrador no hay teclado: la receta se habria quedado
         * literalmente sin camino de vuelta.
         *
         * Solo aparece cuando se vino de una ficha. Entrando desde el menu no
         * hay nada detras, y una flecha de volver que lleva a un listado que
         * nunca se estuvo mirando promete algo que no es.
         */
        acciones: [
          options.onVolver
            ? {
                label: 'Volver a la receta',
                icon: ICON_VOLVER,
                variant: 'btn--dark-ghost',
                onClick: options.onVolver,
              }
            : null,
          ...(options.acciones || []),
        ],
      }),

      avisos,

      el('div', { class: 'pantalla__cuerpo' }, [
        options.meta
          ? el('p', { class: 'pantalla__meta', text: options.meta })
          : null,
        options.cuerpo,
      ]),

      options.pie && options.pie.length
        ? el('div', { class: 'pantalla__pie' }, options.pie)
        : null,
    ],
  );

  /**
   * Escape sale del modulo.
   *
   * Se escucha en la propia pantalla y no en el documento para no pisar a quien
   * este mas adentro: un desplegable de sugerencias tambien usa Escape para
   * cerrarse, y detiene la propagacion. Si esto estuviera en el documento, la
   * primera pulsacion cerraria las dos cosas.
   */
  function alPulsar(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    options.onSalir();
  }

  node.addEventListener('keydown', alPulsar);

  return {
    node,
    /** Sustituye los avisos por los que toquen ahora. @param {Array<Node>} nodos */
    pintarAvisos: (nodos) => replaceChildren(avisos, nodos),

    /**
     * Recoge el foco. Lo llama quien monta la pantalla, JUSTO DESPUES de
     * insertarla en el documento.
     *
     * POR QUE HACE FALTA
     * ------------------
     * A un módulo se llega pulsando su tarjeta en el menú, y ese pulsado
     * destruye la tarjeta: el repintado se lleva el menú entero. El foco cae al
     * `body`, y como quien escucha Escape es esta pantalla y no el documento
     * —ver el comentario de `alPulsar`—, no le llegaba ni una tecla: se entraba
     * al almacén y ya no había forma de salir sin ratón. Es la regla 26, que
     * aquí aparece por tercera vez.
     *
     * POR QUE NO EN UN `requestAnimationFrame`
     * ----------------------------------------
     * Porque entre insertar el árbol y el cuadro siguiente cabe una pulsación,
     * y esa pulsación se pierde. Es la regla 16: devolver el foco tiene que ser
     * síncrono, en la misma tarea que inserta el árbol. La condición de la
     * regla 19 —que el nodo esté ya en el documento— la cumple quien llama, que
     * es justamente por eso quien lo hace.
     *
     * Se enfoca el contenedor y no el primer botón: un botón enfocado se lleva
     * la barra espaciadora y el Intro, y desde el contenedor el primer Tab
     * entra igualmente en la barra.
     */
    enfocar: () => {
      if (!node.isConnected) return;
      // Si ya hay algo enfocado dentro -una vista que coloca el foco en su
      // propio campo- es suyo y no se le quita.
      if (document.activeElement && node.contains(document.activeElement)) return;
      node.focus();
    },
    close: () => {
      node.removeEventListener('keydown', alPulsar);
      node.remove();
    },
  };
}
