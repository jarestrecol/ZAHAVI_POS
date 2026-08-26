/**
 * =============================================================================
 *  AJUSTES
 * =============================================================================
 *
 *  Dos bloques, en este orden:
 *
 *      1. ESTADO Y PUBLICACION
 *         Cuantas recetas hay, que version esta publicada y si este equipo tiene
 *         cambios que las demas sedes todavia no ven. Desde aqui se publica.
 *
 *      2. LA CLAVE DE ESTE EQUIPO
 *         Cambiarla, y saber que alcanza solo a este aparato.
 *
 *      3. TAMAÑO DEL TEXTO
 *         Cuanto se agranda o se achica el texto de las recetas EN ESTE
 *         APARATO. Ni viaja a las demas sedes ni toca el resto de la pantalla.
 *
 *  CADA BLOQUE VIVE EN SU PROPIO ARCHIVO, en `views/settings/`. Este solo
 *  decide el ORDEN y monta la ventana. El archivo llego a 543 lineas con seis
 *  bloques que no tienen nada que ver entre si, y es al que TODO modulo nuevo
 *  va a querer anadirle una fila: costeo su bloque, inventario el suyo. Partido
 *  por bloque, anadir uno es un archivo nuevo y un renglon aqui.
 *
 *  LO QUE NO ESTA, Y POR QUE
 *  -------------------------
 *  No hay descarga del recetario ni carga de archivos. Sacar una copia completa
 *  de las formulas a un archivo suelto es justo lo que no debe poder hacerse
 *  desde el mostrador. La copia de seguridad de verdad es el historial del
 *  repositorio: cada publicacion queda guardada ahi y se puede recuperar
 *  cualquier version anterior.
 */

import { el } from '../lib/dom.js';
import { APP_VERSION } from '../core/version.js';
import { createWindow } from './window.js';
import { renderStatusBlock } from './settings/estado.js';
import { renderDiagnosisBlock } from './settings/diagnostico.js';
import { renderPasswordBlock } from './settings/clave.js';
import { renderTextSizeBlock } from './settings/texto.js';

/**
 * @param {Object} options
 * @param {number} options.recipeCount cuantas recetas hay
 * @param {number} options.withMethod cuantas tienen metodo escrito
 * @param {string} options.revision version publicada en uso
 * @param {object} options.changes resumen de cambios sin publicar
 * @param {boolean} options.canPublish si este sitio tiene publicacion compartida
 * @param {boolean} options.needsReload si hay que recargar antes de publicar
 * @param {string} options.editKey clave de edicion guardada en la sesion
 * @param {{state: string, readAt: Date|null}} options.server diagnostico del servidor
 * @param {{motivo: string, texto: string, pendiente: boolean}} options.sync publicacion automatica
 * @param {string} options.escalaTexto tamano de texto elegido en este aparato
 * @param {(clave: string) => void} options.onEscalaTexto
 * @param {(password: string) => Promise<object>} options.onPublish
 * @param {() => void} options.onDiscard
 * @param {() => void} options.onSalir cierra la sesion de este equipo
 * @param {() => void} options.onClose
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openSettings(options) {
  const body = el('div', { class: 'settings' }, [
    // ORDEN POR LO QUE TRAE A LA GENTE AQUI.
    //
    // Primero lo que se mira -que hay y que falta por salir-, luego lo unico que
    // se rellena, y el diagnostico al final. Estaba en medio, con lo accionable
    // detras de todo: en celular la seccion de la clave mide 604 px sobre un
    // area visible de 623, asi que habia que bajar hasta el fondo para llegar a
    // ella. El diagnostico al final es ademas donde lo pone cualquier panel de
    // sistema y donde se va a buscar cuando a uno le dicen que lo mire.
    renderStatusBlock(options),
    renderPasswordBlock(),
    renderTextSizeBlock(options),
    renderDiagnosisBlock(options),
  ]);

  return createWindow({
    title: 'Ajustes',
    // La version, en la barra de titulo de Ajustes: es la primera pregunta
    // cuando alguien llama diciendo que su pantalla no se parece a la de la
    // otra sede, y asi se lee sin abrir nada.
    meta: `zahavi · recetario v${APP_VERSION}`,
    size: 'narrow',
    onClose: options.onClose,
    body,
    footer: [
      // Aqui decia "Sesion abierta en este equipo", que solo constataba que se
      // esta mirando la aplicacion. El mismo hueco trabaja en las otras dos
      // ventanas: la de publicar avisa de lo que pasa si no se publica, y la de
      // la clave dice que consultar no la necesita. Vacio es mas honesto que
      // relleno, asi que se deja el hueco para cuando haya algo que decir.
      el('div', { class: 'win__actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cerrar sesión',
          on: {
            // La sesion es de este dispositivo: cerrarla no toca ni las
            // recetas ni los cambios sin publicar, solo saca a la persona hasta
            // que alguien vuelva a entrar con la clave. Que limpiar exactamente
            // lo decide `app/commands.js`, en un solo sitio.
            click: options.onSalir,
          },
        }),
        // Cerrar va en el tratamiento apagado, no en el de tinta. Era el boton
        // con MAS peso visual de la ventana y no hace nada que no hagan ya la
        // equis de la barra, Escape y el clic fuera. Segun el propio sistema de
        // diseño, el relleno de tinta es "el avance dentro de un flujo", y
        // descartar no lo es.
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cerrar',
          on: { click: options.onClose },
        }),
      ]),
    ],
  });
}
