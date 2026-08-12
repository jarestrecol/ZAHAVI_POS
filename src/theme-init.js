/**
 * Aplica el tema guardado antes de que llegue el CSS.
 *
 * Va como script clasico (no modulo) al principio de <head>, antes de las
 * hojas de estilo: el navegador lo ejecuta y bloquea el resto del analizado
 * hasta terminar, asi que `data-theme` ya esta puesto en <html> cuando el CSS
 * se aplica. Sin esto, quien haya elegido oscuro veria un destello blanco en
 * cada carga mientras `src/core/theme.js` (que si es un modulo y tarda mas en
 * arrancar) llega a leer lo mismo.
 *
 * Repite a proposito la misma clave y la misma logica que ese modulo: son dos
 * mecanismos de entrada distintos para el mismo dato, no dos fuentes de
 * verdad. Si cambia la clave de almacenamiento en uno, hay que cambiarla en
 * el otro.
 */
(function () {
  try {
    var saved = window.localStorage.getItem('zahavi.tema');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (error) {
    /* almacenamiento no disponible: se sigue la preferencia del sistema */
  }
})();
