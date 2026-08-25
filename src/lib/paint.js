/**
 * Cola de trabajos que esperan al repintado REAL de la pantalla.
 *
 * POR QUE HACE FALTA
 * ------------------
 * Existe porque imprimir el plan del dia sacaba la ficha de la receta abierta.
 * El codigo guardaba el plan en el estado y llamaba a `window.print()` dentro de
 * un `requestAnimationFrame`, dando por hecho que para entonces la hoja del plan
 * ya estaria montada. Con la View Transitions API no lo esta: `paint()` corre
 * DESPUES de que `setState` haya vuelto, asi que el cuadro de animacion llega
 * antes que la pantalla nueva. Y encima el plan se borraba del estado justo
 * despues, de modo que la hoja correcta no llegaba a existir en ningun momento.
 *
 * La regla que sale de ahi es general: quien necesite el DOM ya cambiado
 * -imprimir, medir- no puede usar `requestAnimationFrame`, tiene que apuntarse
 * aqui y esperar a que el pintado de verdad haya ocurrido.
 *
 * Vive en `lib/` porque no sabe nada de recetas ni de pantallas: es fontaneria
 * del ciclo de pintado y sirve igual a cualquier modulo que llegue despues.
 */

/** @type {Array<() => void>} */
const pendientes = [];

/**
 * Apunta un trabajo para cuando la pantalla refleje el estado nuevo.
 *
 * SE APUNTA ANTES del cambio de estado que lo provoca: si el navegador no usa
 * transiciones, el repintado ocurre dentro de `setState` y apuntarlo despues ya
 * seria tarde.
 *
 * @param {() => void} trabajo
 */
export function trasPintar(trabajo) {
  pendientes.push(trabajo);
}

/**
 * Ejecuta y vacia lo que estuviera esperando al repintado.
 *
 * La llama el pintado, una vez, cuando la pantalla ya esta puesta.
 */
export function drenarTrasPintar() {
  const trabajos = pendientes.splice(0);
  for (const trabajo of trabajos) trabajo();
}
