/**
 * Casos de uso del equipo de produccion.
 *
 * La lista se guarda en memoria mientras dura la pagina: asignar diez recetas
 * no debe pedirla diez veces, y si la red se cae un momento se sigue pudiendo
 * asignar con la que ya se leyo. No se escribe en el aparato: son datos de
 * personas.
 *
 * LA LISTA ES DE QUIEN LA PIDIO. Se guarda con el id de la sesion y no se
 * entrega a otra: una lectura que llega despues de cerrar sesion no puede
 * quedar para el turno siguiente, que quiza no tiene permiso para verla.
 */

import { leerEquipo, leerPerfiles, fijarAreaDe } from '../core/equipo.js';
import { getState, notify } from '../core/store.js';
import { ok, err } from '../core/storage.js';

/** @type {{dueno: string, lista: Array<object>}|null} */
let enMemoria = null;

const duenoActual = () => getState().usuario?.id || '';

/** @param {{forzar?: boolean}} [opciones] */
export async function cargarEquipo({ forzar = false } = {}) {
  const dueno = duenoActual();
  if (!dueno) return err('sin_sesion', 'No hay una sesión abierta en este equipo.');
  if (!forzar && enMemoria?.dueno === dueno) return ok(enMemoria.lista);
  const r = await leerEquipo();
  // La sesion pudo cambiar mientras viajaba la peticion.
  if (duenoActual() !== dueno) return err('sesion_cambiada', 'La sesión cambió. Vuelve a abrir la pantalla.');
  if (r.ok) {
    enMemoria = { dueno, lista: r.value };
    return r;
  }
  // Sin red, la ultima lista de esta misma persona sirve. Con la sesion
  // revocada o el turno vencido, no.
  if (r.code === 'sin_conexion' && enMemoria?.dueno === dueno) return ok(enMemoria.lista);
  return r;
}

export function cargarPerfiles() {
  return leerPerfiles();
}

export async function cambiarArea(id, area) {
  const r = await fijarAreaDe(id, area);
  if (!r.ok) return r;
  enMemoria = null;
  notify('Área guardada.', 'success');
  return r;
}

/** Al cerrar sesion: otra persona no hereda la lista. */
export function olvidarEquipo() {
  enMemoria = null;
}
