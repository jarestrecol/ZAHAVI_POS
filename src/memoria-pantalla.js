/**
 * =============================================================================
 *  MEMORIA DEL CICLO DE PINTADO
 * =============================================================================
 *
 *  Lo que la pantalla tiene que recordar de un repintado al siguiente, y que NO
 *  puede vivir en el DOM.
 *
 *  POR QUE EXISTE ESTE ARCHIVO
 *  ---------------------------
 *  Tres defectos reportados por el obrador en la misma semana resultaron ser el
 *  mismo: el cursor del buscador, la altura del listado y la receta marcada se
 *  guardaban en el propio DOM, en una arquitectura que lo destruye entero en
 *  cada cambio. Los tres se cayeron en celular y tableta, donde la barra lateral
 *  se oculta con `display: none` y un elemento sin caja MIENTE: leerle
 *  `scrollTop` devuelve 0 y escribirselo no hace nada.
 *
 *  Estaba resuelto pero disperso, en variables sueltas de `main.js` que nadie
 *  reconocia como un grupo. Con nombre propio, quien llegue con el modulo de
 *  costeo y necesite recordar algo entre repintados sabe donde ponerlo, y la
 *  frontera "el DOM no es un almacen" de `verificar.mjs` tiene un sitio al que
 *  apuntar.
 *
 *  DOS REGLAS PARA TODO LO QUE ENTRE AQUI
 *  --------------------------------------
 *    1. El dato vive en una VARIABLE, no en el DOM. Sobrevive a que su nodo
 *       desaparezca de la pantalla, que es justo lo que hace falta.
 *    2. Ni se anota ni se restaura cuando el nodo no tiene caja. Sin esa guarda,
 *       cada repintado escribiria un 0 encima de lo recordado.
 *
 *  Nada de esto se guarda en disco y todo se pierde al recargar, que es lo
 *  correcto: al dia siguiente nadie sigue mirando la receta de ayer.
 *
 *  Vive en la capa de composicion, con `dialogs.js` y `shortcuts.js`: sabe que
 *  existe una pantalla, asi que no es `core/`; y no construye ninguna, asi que
 *  tampoco es una vista.
 */

/**
 * POR DONDE IBA EL LISTADO, Y DE QUE LISTADO.
 *
 * El repintado reconstruye la lista entera, y un elemento recien creado no
 * tiene memoria de su desplazamiento. Antes esto se resolvia leyendo el
 * `scrollTop` del nodo viejo justo antes de destruirlo y escribiendolo en el
 * nuevo, todo dentro del mismo pintado. En escritorio funciona, porque el
 * listado no se va nunca de la pantalla.
 *
 * EN CELULAR Y TABLETA NO FUNCIONABA, y es lo que reporto el obrador: abrir una
 * receta y volver dejaba la lista arriba del todo, con lo que despues de cada
 * consulta habia que volver a bajar hasta donde uno estaba. La causa es que ahi
 * no caben las dos cosas a la vez y `.app[data-view='detail'] .sidebar` pone la
 * lista en `display: none` (responsive.css). Un elemento sin caja no se
 * desplaza: escribirle `scrollTop` no hace nada, y leerselo devuelve 0. Asi
 * que al abrir la receta la posicion no llegaba a guardarse en ninguna parte, y
 * el primer repintado dentro de la ficha la sustituia por ese 0.
 *
 * De ahi las dos reglas de aqui abajo:
 *
 *   1. La posicion vive EN UNA VARIABLE, no en el DOM. Sobrevive a que la lista
 *      desaparezca de la pantalla, que es justo lo que hace falta.
 *   2. Ni se anota ni se restaura cuando la lista no tiene caja. Sin esa
 *      guarda, cada repintado con la ficha abierta escribiria un 0 encima de lo
 *      recordado, que es exactamente el defecto.
 *
 * @type {{clave: string, top: number}}
 */
let listaScroll = { clave: '', top: 0 };

/**
 * La ultima receta que se abrio, para dejarla marcada en el listado.
 *
 * POR QUE HACE FALTA
 * ------------------
 * En escritorio el listado y la ficha se ven a la vez, asi que la fila de la
 * receta abierta se pinta sola: hay una receta en la ruta y ya esta. En celular
 * y tableta no caben las dos, y al volver de la receta la ruta es el indice: no
 * hay ninguna abierta, ninguna fila queda marcada, y despues de cada consulta
 * hay que acordarse de cual se acababa de mirar en una columna de 121 filas
 * iguales.
 *
 * Vive aqui al lado de `listaScroll` y por el mismo motivo: es memoria de
 * pantalla del ciclo de pintado, no un dato del recetario. No se guarda en
 * ningun sitio y se pierde al recargar, que es lo correcto: al dia siguiente
 * nadie sigue mirando la receta de ayer.
 *
 * Si la receta se elimina, su codigo deja de aparecer en el listado y la marca
 * se cae sola: no hay que limpiarla.
 *
 * @type {string|null}
 */
let ultimaRecetaVista = null;

/**
 * La clave del listado QUE HAY PUESTO EN LA PANTALLA ahora mismo.
 *
 * Hace falta porque `paint()` ya trabaja con la ruta NUEVA mientras el DOM
 * todavia muestra la lista ANTERIOR: al anotar la posicion, la ruta dice
 * "galletas" y lo que se esta midiendo sigue siendo la lista completa. Sin esta
 * variable, cambiar de categoria guardaba la altura de la lista vieja con la
 * etiqueta de la nueva, y la lista de galletas se abria a media altura.
 *
 * @type {string}
 */
let claveEnPantalla = '';

/**
 * La identidad del listado: la categoria filtrada y la busqueda.
 *
 * Dos filtros distintos son DOS LISTAS distintas, y devolver a la altura 900 de
 * la anterior es caer en cualquier sitio. Con la clave por delante, cambiar de
 * categoria o de busqueda empieza arriba -que es lo correcto para una lista que
 * no se habia visto- y volver de una receta conserva el sitio, que es lo que se
 * pidio.
 *
 * @param {object} route
 * @returns {string}
 */
export function claveDelListado(route) {
  // Se serializa en vez de pegar los dos textos con un separador: cualquier
  // separador que se eligiera podria aparecer dentro de una busqueda y hacer
  // que dos listados distintos compartieran clave.
  return JSON.stringify([route.category, route.query]);
}

/**
 * Anota por donde va el listado, si es que se puede saber.
 *
 * `clientHeight` vale 0 cuando la lista esta oculta, y ese es el unico caso que
 * hay que dejar pasar de largo. Leer 0 de una lista sin caja y darlo por bueno
 * es lo que borraba la posicion.
 *
 * @param {HTMLElement} raiz el contenedor de la aplicacion
 */
export function recordarScrollDelListado(raiz) {
  const lista = raiz.querySelector('.sidebar__list');
  if (!lista || lista.clientHeight === 0) return;
  listaScroll = { clave: claveEnPantalla, top: lista.scrollTop };
}

/**
 * Devuelve el listado a donde estaba, si sigue siendo el mismo listado.
 *
 * @param {HTMLElement} raiz el contenedor de la aplicacion
 * @param {string} clave
 */
export function restaurarScrollDelListado(raiz, clave) {
  // Se apunta SIEMPRE, tambien con la lista oculta: en celular la ficha se
  // pinta sin listado y aun asi pertenece al mismo filtro, asi que al volver
  // tiene que reconocerse.
  claveEnPantalla = clave;

  const lista = raiz.querySelector('.sidebar__list');
  if (!lista || lista.clientHeight === 0) return;

  // Solo se recuerda UNA posicion, la ultima. Guardar una por filtro obligaria
  // a un mapa que crece con cada busqueda tecleada, y no compra nada: lo que se
  // pidio es que volver de una receta no mueva la lista, no que cada filtro
  // recuerde su altura de hace media hora.
  lista.scrollTop = listaScroll.clave === clave ? listaScroll.top : 0;
}

/**
 * Anota que se acaba de abrir una receta.
 *
 * @param {string} id
 */
export function recordarRecetaVista(id) {
  ultimaRecetaVista = id;
}

/**
 * Que receta hay que marcar en el listado.
 *
 * Con una abierta manda la abierta; sin ninguna, la ultima que se estuvo
 * mirando, que es lo que hace falta en celular y tableta al volver de la ficha.
 *
 * @param {object|null} abierta la receta de la ruta, si hay alguna
 * @returns {string|null}
 */
export function recetaMarcada(abierta) {
  return abierta ? abierta.id : ultimaRecetaVista;
}
