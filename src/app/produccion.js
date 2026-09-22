import { transaccionOperacion, alMenos } from '../core/bitacora.js';
import { fijarRecetaEn, eliminarPlanEn } from '../core/produccion.js';
import { guardarResultadoEn } from '../core/resultados-produccion.js';
import { guardarNotaEn, eliminarNotaEn, nombreResponsable } from '../core/notas.js';
import {
  iniciarPreparacionEn, cancelarPreparacionEn, asignarRecetaEn, confirmarRecetaEn,
} from '../core/preparacion.js';
import { getState, setState, notify } from '../core/store.js';
import { ok, err } from '../core/storage.js';

/**
 * Quien tiene la sesion abierta, en la forma que guarda el historial.
 *
 * Es una identidad de este equipo: la sesion la verifico Supabase al entrar,
 * pero lo que se escribe aqui no lo firma el servidor.
 */
export function autorActual() {
  const u = getState().usuario;
  return u && u.id ? { id: u.id, nombre: u.nombre || u.codigo || 'Sin nombre', codigo: u.codigo || '', rol: u.rol } : null;
}

function conAutor(accion, { minimo = null, mensaje = 'Registrar producción es del jefe de obrador en adelante.' } = {}) {
  const autor = autorActual();
  if (!autor) return Promise.resolve(err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.'));
  if (minimo && !alMenos(autor, minimo)) return Promise.resolve(err('permiso', mensaje));
  return accion(autor);
}

/** Pone una receta en el dia con N tandas, o la quita con `factor` 0. Guarda al instante. */
export function fijarReceta({ fecha, revision, recetaId, factor, partidas, motivo }) {
  return conAutor((autor) => ejecutar((datos) => fijarRecetaEn(datos, {
    fecha, revision, recetaId, factor, partidas, responsable: nombreResponsable(autor),
    motivo: motivo || (factor ? 'Registro de producción' : 'Receta quitada de la producción'),
  }, getState().recetario.recipes), factor ? 'Producción guardada.' : 'Receta quitada del día.'), { minimo: 'obrador' });
}

/**
 * Elimina lo cargado en un dia.
 *
 * El nucleo solo deja si ese dia no tiene produccion confirmada, y exige
 * responsable y motivo: la eliminacion queda en el historial como un cambio mas.
 */
export function eliminarProduccion({ fecha, revision, motivo }) {
  return conAutor((autor) => ejecutar((datos) => eliminarPlanEn(datos, {
    fecha, revision, responsable: nombreResponsable(autor), motivo,
  }), 'Producción del día eliminada.'),
  { minimo: 'obrador', mensaje: 'Eliminar la producción es del jefe de obrador en adelante.' });
}

export function guardarNota(solicitud) {
  return conAutor((autor) => ejecutar((datos) => guardarNotaEn(datos, solicitud, autor),
    solicitud.id ? 'Nota actualizada.' : 'Nota guardada en el calendario.'));
}

export function eliminarNota(solicitud) {
  return conAutor((autor) => ejecutar((datos) => eliminarNotaEn(datos, solicitud, autor), 'Nota borrada.'));
}

export function iniciarPreparacion(solicitud) {
  return conAutor((autor) => ejecutar((datos) => iniciarPreparacionEn(datos, solicitud, autor), 'Receta en preparación.'));
}

export function cancelarPreparacion(solicitud) {
  return conAutor((autor) => ejecutar((datos) => cancelarPreparacionEn(datos, solicitud, autor), 'La receta vuelve a pendiente.'));
}

export function asignarReceta(solicitud) {
  return conAutor((autor) => ejecutar((datos) => asignarRecetaEn(datos, solicitud, autor),
    solicitud.trabajador ? `Asignada a ${solicitud.trabajador.nombre}.` : 'Receta sin asignar.'));
}

export function confirmarReceta(solicitud) {
  return conAutor((autor) => ejecutar((datos) => confirmarRecetaEn(datos, solicitud, autor),
    'Receta lista. Su materia prima se descontó de bodega.'));
}

export function guardarResultado(solicitud) {
  return conAutor((autor) => ejecutar((datos) => guardarResultadoEn(datos, solicitud, autor),
    'Resultado guardado. El consumo de bodega se conserva.'));
}

async function ejecutar(cambio, mensaje) {
  const r = await transaccionOperacion(cambio);
  if (!r.ok) return r;
  setState({ almacen: { lotes: r.value.datos.lotes } });
  notify(mensaje, 'success');
  return ok(r.value.resultado);
}
