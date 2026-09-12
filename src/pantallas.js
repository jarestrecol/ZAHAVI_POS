/**
 * =============================================================================
 *  PANTALLAS DE MODULO
 * =============================================================================
 *
 *  Monta como máximo una pantalla completa de módulo —producción, ingredientes o
 *  almacén— y decide cuál mirando la ruta.
 *
 *  ES EL HERMANO DE `dialogs.js`, Y LA DIFERENCIA IMPORTA
 *  -----------------------------------------------------
 *  Un diálogo es una interrupción sobre algo que sigue estando debajo: atrapa el
 *  foco, oscurece el fondo y se cierra. Una pantalla de módulo NO es eso: es a
 *  dónde has ido. No hay nada debajo a lo que volver salvo el menú.
 *
 *  Estos tres eran diálogos y ahora no lo son. Lo que se conserva de aquel
 *  diseño es la única parte que había que conservar: **no reconstruir la
 *  pantalla si es la misma que ya está puesta.**
 *
 *  POR QUE ESO NO ES UNA OPTIMIZACION
 *  ----------------------------------
 *  Las tres guardan por dentro cosas que la persona está haciendo: la selección
 *  de recetas del plan, la búsqueda y el orden del catálogo, el formulario de
 *  alta del almacén a medio rellenar. `paint()` se ejecuta ante cualquier cambio
 *  de estado, y varios ocurren justo mientras se trabaja aquí: guardar un lote
 *  deja un aviso, vuelve la conexión, termina una publicación automática.
 *  Reconstruir en cada uno de esos borraría lo que se estuviera escribiendo.
 *
 *  POR QUE CUELGAN DE `document.body` Y NO DE `#app`
 *  ------------------------------------------------
 *  Porque `paint()` vacía `#app` entero en cada repintado, y sacar un nodo del
 *  documento le quita el foco a lo que lo tuviera dentro. Colgando del `body`,
 *  como ya hacían los diálogos, la pantalla sobrevive intacta: el cursor se
 *  queda donde estaba y el teclado del teléfono no parpadea.
 *
 *  LO UNICO QUE SI SE ACTUALIZA EN CADA REPINTADO SON LOS AVISOS
 *  ------------------------------------------------------------
 *  «Sin conexión» y «cambios sin publicar» cambian mientras la pantalla está
 *  abierta, y tienen que decir la verdad. Se sustituyen en su propio hueco
 *  (`pintarAvisos`) sin tocar el resto: es la misma técnica con la que el
 *  buscador del listado conserva el foco entre repintados.
 */

import { trasPintar } from './lib/paint.js';
import { setState, recetario, almacen } from './core/store.js';
import { getRoute, navigate } from './core/router.js';
import { guardarLote, eliminarLote, sembrarDemo, descontarProduccion } from './app/almacen.js';
import { openPlan } from './views/plan.js';
import { openIngredients } from './views/ingredients.js';
import { openAlmacen } from './views/almacen.js';

/** La pantalla montada ahora mismo, o null. */
let abierta = null;

/** Clave de la pantalla montada, para saber si hay que reconstruirla. */
let claveAbierta = null;

/**
 * ¿Hay una pantalla de módulo delante?
 *
 * Lo consultan los atajos de teclado: con un módulo completo abierto, las
 * flechas y las letras pertenecen a ese módulo y no al listado de recetas, que
 * ni siquiera está en pantalla.
 *
 * @returns {boolean}
 */
export function hayPantallaDeModulo() {
  return abierta !== null;
}

/**
 * Retira la pantalla que hubiera, sin mirar la ruta.
 *
 * Lo llama el arranque cuando nadie ha iniciado sesión: si alguien cierra sesión
 * con el almacén abierto, esa pantalla no puede quedarse encima de la pantalla
 * de entrada enseñando lo que hay comprado.
 */
export function cerrarPantallas() {
  if (!abierta) return;
  abierta.close();
  abierta = null;
  claveAbierta = null;
}

/**
 * Vuelve al recetario, a la receta que estuviera abierta detrás si la había.
 *
 * Escrito una vez porque lo usan las tres pantallas: tres copias de la misma
 * decisión son tres sitios donde corregirla el día que cambie.
 */
function salirAlRecetario() {
  const id = getRoute().id;
  navigate({ modulo: 'recetario', name: id ? 'detail' : 'index', id: id || null });
}

/** Al menú, que es de donde cuelgan los módulos. */
function irAlMenu() {
  navigate({ modulo: 'inicio', name: 'index', id: null });
}

/**
 * El botón de volver a la ficha, o `null` si no se vino de ninguna.
 *
 * La receta de fondo viaja en la dirección (`#/plan?r=R001`), así que esto no
 * es un recuerdo que haya que mantener: lo dice la propia ruta y sobrevive a
 * una recarga.
 *
 * @returns {(() => void)|null}
 */
function vueltaALaFicha() {
  return getRoute().id ? salirAlRecetario : null;
}

/**
 * A dónde lleva Escape.
 *
 * Al mismo sitio al que lleva el botón que se esté viendo, y esa simetría es lo
 * que se está arreglando: con una ficha detrás, a la ficha; sin nada detrás, al
 * menú, que es de donde se entró. Antes llevaba siempre al listado de recetas,
 * o sea a un sitio en el que no se había estado.
 */
function salir() {
  if (getRoute().id) salirAlRecetario();
  else irAlMenu();
}

/**
 * Las pantallas, una por módulo.
 *
 * La clave es fija en las tres a propósito: son ellas las que llevan por dentro
 * lo que la persona está haciendo, así que no deben reconstruirse por nada que
 * pase fuera.
 */
const PANTALLAS = [
  { modulo: 'plan', clave: () => 'plan', monta: (state) => montarPlan(state) },
  { modulo: 'ingredientes', clave: () => 'ingredientes', monta: (state) => montarIngredientes(state) },
  { modulo: 'almacen', clave: () => 'almacen', monta: () => montarAlmacen() },
];

/**
 * Monta la pantalla que toque, o retira la que hubiera.
 *
 * @param {object} state
 * @param {object} route
 * @param {Array<Node>} avisos avisos de contexto ya construidos
 * @returns {HTMLElement|null} la pantalla montada, si la hay
 */
export function renderPantallas(state, route, avisos) {
  const entrada = PANTALLAS.find((p) => p.modulo === route.modulo);
  const clave = entrada ? entrada.clave(state) : null;

  // Ya está puesta la que toca: no se toca nada salvo los avisos.
  if (clave !== null && clave === claveAbierta) {
    abierta.pintarAvisos(avisos);
    return abierta.node;
  }

  cerrarPantallas();
  if (!entrada) return null;

  abierta = entrada.monta(state);
  if (!abierta) return null;

  claveAbierta = clave;
  document.body.appendChild(abierta.node);
  abierta.pintarAvisos(avisos);
  /*
   * El foco entra AQUI, en la misma tarea que acaba de insertar la pantalla.
   *
   * Se hace desde fuera y no desde `crearPantalla` porque la condición es tener
   * el nodo ya en el documento (regla 19) y quien lo mete es esta línea de
   * arriba. Hacerlo desde dentro obligaría a esperar al cuadro siguiente, y
   * entre medias cabe una pulsación de Escape que se perdería (regla 16).
   */
  abierta.enfocar();
  return abierta.node;
}

/**
 * Plan de producción del día.
 *
 * Al pedir imprimir se guarda el plan en el estado y se sale: la hoja se genera
 * en `renderPrint` y `window.print()` se llama después del repintado, para que
 * el navegador encuentre la hoja ya montada. Sin esa espera se imprimiría lo que
 * hubiera antes.
 *
 * Esa espera es `trasPintar`, y no un `requestAnimationFrame`: el cuadro llega
 * antes que el pintado cuando hay una View Transition por medio. El trabajo se
 * apunta antes de `setState` porque sin transiciones el repintado ocurre dentro
 * de esa misma llamada.
 */
function montarPlan(state) {
  return openPlan({
    recipes: state.recetario.recipes,
    // El almacén viaja al plan para poder costear la producción. Se pasa como
    // FUNCIÓN y no como lista: la pantalla no se reconstruye mientras está
    // abierta, así que una lista capturada al montarla se quedaría congelada y
    // seguiría costeando contra las existencias de hace media hora.
    leerLotes: () => almacen().lotes,
    onDescontar: descontarProduccion,
    onMenu: irAlMenu,
    onVolver: vueltaALaFicha(),
    onSalir: salir,
    onPrint: (plan) => {
      trasPintar(() => {
        window.print();
        // El plan deja de estar pendiente en cuanto se manda a imprimir: si se
        // quedara, la siguiente impresión sacaría el plan en vez de la receta
        // que se estuviera viendo.
        setState({ recetario: { planPrint: null } });
      });
      setState({ recetario: { planPrint: plan } });
      salirAlRecetario();
    },
  });
}

/**
 * Catálogo de ingredientes.
 *
 * Solo lee el recetario: no cambia nada ni guarda nada.
 */
function montarIngredientes(state) {
  return openIngredients({
    recipes: state.recetario.recipes,
    onMenu: irAlMenu,
    onVolver: vueltaALaFicha(),
    onSalir: salir,
    // Mismo camino que el plan: se guarda el catálogo en el estado, se sale, y
    // `window.print()` espera al repintado con `trasPintar`. Sin esa espera se
    // imprimiría lo que hubiera antes, que es un defecto que este proyecto ya
    // tuvo con el plan.
    onPrint: (catalogo) => {
      trasPintar(() => {
        window.print();
        setState({ recetario: { ingredientesPrint: null } });
      });
      setState({ recetario: { ingredientesPrint: catalogo } });
      salirAlRecetario();
    },
  });
}

/**
 * Almacén: lo que hay comprado, a qué precio y cuándo vence.
 *
 * `leerLotes` se pasa como FUNCIÓN y no como lista ya resuelta. La pantalla no
 * se reconstruye mientras está abierta, así que una lista capturada al montarla
 * se quedaría congelada en el momento de abrir y seguiría enseñando el almacén
 * de antes después de dar de alta un lote.
 *
 * El catálogo de ingredientes del recetario viaja hasta aquí porque es lo que
 * hace que el cruce con el plan del día funcione: el almacén y las recetas se
 * casan por nombre y unidad, y elegir de la lista es lo que garantiza que
 * coincidan.
 */
function montarAlmacen() {
  return openAlmacen({
    leerLotes: () => almacen().lotes,
    ingredientes: recetario().ingredientes,
    onGuardar: guardarLote,
    onEliminar: eliminarLote,
    onSembrarDemo: sembrarDemo,
    onMenu: irAlMenu,
    onVolver: vueltaALaFicha(),
    onSalir: salir,
  });
}
