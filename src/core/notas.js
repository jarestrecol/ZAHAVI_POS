/**
 * =============================================================================
 *  NOTAS DEL CALENDARIO
 * =============================================================================
 *
 *  Tareas, pendientes, recomendaciones y felicitaciones, cada una en su dia.
 *  Viven en el mismo documento de operacion que los planes (`core/bitacora.js`)
 *  para que una sola escritura con cerrojo las guarde y el historial las cuente.
 *
 *  Tareas y pendientes se pueden marcar como hechos; recomendaciones y
 *  felicitaciones no, porque no son algo que se termine.
 *
 *  El autor es la persona de la sesion. Es una identidad declarada en este
 *  equipo, no una firma verificada por el servidor (ver `docs/seguridad.md`).
 *  Las escribe el jefe de obrador en adelante. Si alguien cambia la nota de
 *  otra persona, la nota lo dice (`cambiadaPor`): si no, una recomendacion
 *  editada seguiria firmada por quien no la escribio asi.
 */

const persona = (p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo });
const SIN_PERMISO = 'Las notas del calendario las escribe el jefe de obrador en adelante.';

import {
  copiar, registrarEvento, fechaValida, nuevoId, notaValida, personaValida, alMenos,
  TIPOS_DE_NOTA, LARGO_MAXIMO_NOTA,
} from './bitacora.js';
import { CATEGORIES } from './schema.js';
import { ok, err } from './storage.js';

export { TIPOS_DE_NOTA, LARGO_MAXIMO_NOTA };

/** Nombre visible y si se puede marcar como hecha. El orden es el del panel. */
export const TIPOS_NOTA = Object.freeze({
  tarea: { nombre: 'Tarea', plural: 'Tareas', seCumple: true },
  pendiente: { nombre: 'Pendiente', plural: 'Pendientes', seCumple: true },
  recomendacion: { nombre: 'Recomendación', plural: 'Recomendaciones', seCumple: false },
  felicitacion: { nombre: 'Felicitación', plural: 'Felicitaciones', seCumple: false },
});

/** «Nombre (CODIGO)»: lo que el historial guarda como responsable. */
export function nombreResponsable(persona) {
  return persona.codigo ? `${persona.nombre} (${persona.codigo})` : persona.nombre;
}

/**
 * Crea o cambia una nota.
 *
 * Sin `id` crea; con `id` cambia la existente, siempre que `revision` sea la
 * que se leyo (otra pestaña pudo cambiarla entre tanto).
 *
 * @param {object} datos documento de operacion
 * @param {{id?: string, revision?: number, fecha: string, tipo: string, texto: string, area?: string|null, hecha?: boolean}} solicitud
 * @param {{id: string, nombre: string, codigo: string}} autor
 */
export function guardarNotaEn(datos, solicitud, autor) {
  if (!personaValida(autor)) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar para registrar notas.');
  const { id, revision, fecha, tipo } = solicitud;
  const texto = String(solicitud.texto ?? '').trim().replace(/\s+/g, ' ');
  const area = solicitud.area || null;
  const destinatario = solicitud.persona || null;
  if (!fechaValida(fecha)) return err('fecha', 'Elige un día válido.');
  if (!TIPOS_DE_NOTA.includes(tipo)) return err('tipo', 'Elige qué quieres registrar: tarea, pendiente, recomendación o felicitación.');
  if (!texto) return err('texto', 'Escribe el texto de la nota.');
  if (texto.length > LARGO_MAXIMO_NOTA) return err('texto', `La nota no puede pasar de ${LARGO_MAXIMO_NOTA} caracteres.`);
  if (area !== null && !CATEGORIES.includes(area)) return err('area', 'Elige un área válida o déjala para todo el equipo.');
  if (destinatario !== null && !personaValida(destinatario)) return err('persona', 'Elige una persona del equipo o deja la nota para el área.');
  if (destinatario !== null && area !== null) return err('para', 'Una nota es para un área o para una persona, no para las dos.');
  const hecha = TIPOS_NOTA[tipo].seCumple ? Boolean(solicitud.hecha) : false;
  const ahora = new Date().toISOString();

  let antes = null;
  let nota;
  if (id) {
    antes = datos.notas.find((n) => n.id === id) || null;
    if (!antes) return err('no_existe', 'Esa nota ya no existe. Puede que la hayan borrado en otra pestaña.');
    if (antes.revision !== revision) return err('conflicto', 'Esta nota cambió en otra pestaña. Vuelve a abrir el día.');
    nota = { ...antes, fecha, tipo, texto, area, persona: destinatario, hecha, revision: antes.revision + 1, actualizada: ahora,
      cambiadaPor: antes.autor.id === autor.id ? null : persona(autor) };
  } else {
    nota = { id: nuevoId(), fecha, tipo, texto, area, persona: destinatario, hecha, revision: 1, creada: ahora, actualizada: ahora,
      autor: persona(autor), cambiadaPor: null };
  }
  const permiso = puedeGuardar(autor, antes, nota);
  if (!permiso.ok) return permiso;
  if (!notaValida(nota)) return err('nota', 'La nota no es válida. Revisa el texto y vuelve a intentarlo.');
  datos.notas = [...datos.notas.filter((n) => n.id !== nota.id), nota];
  registrarEvento(datos, 'nota_guardada', { fecha, responsable: nombreResponsable(autor), autorId: autor.id,
    motivo: antes ? 'Cambio de nota' : 'Nota nueva', antes, despues: nota });
  return ok(copiar(nota));
}

/**
 * Quien puede guardar este cambio.
 *
 * Escribir notas es del jefe de obrador en adelante. La UNICA excepcion: quien
 * tiene la nota asignada puede marcarla hecha, y solo eso. Sin ella, la tarea
 * que el operario ve en «Mi produccion» no la podria cerrar el mismo.
 */
function puedeGuardar(autor, antes, despues) {
  if (alMenos(autor, 'obrador')) return ok(true);
  if (!antes || antes.persona?.id !== autor.id) return err('permiso', SIN_PERMISO);
  const intacto = antes.fecha === despues.fecha && antes.tipo === despues.tipo
    && antes.texto === despues.texto && antes.area === despues.area
    && (antes.persona?.id ?? null) === (despues.persona?.id ?? null);
  if (!intacto) return err('permiso', 'De la nota que te asignaron solo puedes marcar si ya está hecha.');
  return ok(true);
}

/** Borra una nota. El historial conserva lo que decia y quien la borro. */
export function eliminarNotaEn(datos, { id, revision }, autor) {
  if (!personaValida(autor)) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar para borrar notas.');
  if (!alMenos(autor, 'obrador')) return err('permiso', SIN_PERMISO);
  const antes = datos.notas.find((n) => n.id === id);
  if (!antes) return err('no_existe', 'Esa nota ya no existe.');
  if (antes.revision !== revision) return err('conflicto', 'Esta nota cambió en otra pestaña. Vuelve a abrir el día.');
  datos.notas = datos.notas.filter((n) => n.id !== id);
  registrarEvento(datos, 'nota_eliminada', { fecha: antes.fecha, responsable: nombreResponsable(autor), autorId: autor.id,
    motivo: 'Nota borrada', antes, despues: null });
  return ok({ id, fecha: antes.fecha });
}

/** Notas de un dia: por tipo, en el orden del panel, y luego por creacion. */
export function notasDelDia(datos, fecha) {
  const orden = Object.keys(TIPOS_NOTA);
  return (datos.notas || []).filter((n) => n.fecha === fecha)
    .sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo) || a.creada.localeCompare(b.creada));
}
