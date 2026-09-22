/**
 * =============================================================================
 *  EQUIPO DE PRODUCCION (Supabase)
 * =============================================================================
 *
 *  Quien trabaja en cada area. Es lo unico de la produccion que ya vive en el
 *  servidor (`0011`): la lista sale de la vista `equipo_produccion`, que solo
 *  entrega id, nombre, codigo, rol y area a partir de jefe de obrador, y el area
 *  la cambia un administrador verificado en dos pasos. La base de datos lo
 *  exige; esta capa solo traduce las respuestas.
 */

import { pedir, tokenVigente } from './sesion.js';
import { CATEGORIES } from './schema.js';
import { ok, err } from './storage.js';

/**
 * GET/PATCH con el testigo de la sesion. Un 401 renueva una vez: el reloj del
 * aparato puede ir adelantado y el testigo haber vencido antes de lo previsto.
 */
async function conSesion(ruta, opciones = {}) {
  for (const forzar of [false, true]) {
    const token = await tokenVigente(forzar);
    if (!token.ok) return token;
    const r = await pedir(ruta, { ...opciones, token: token.value });
    if (!r.ok) return r;
    if (r.value.status === 401 && !forzar) continue;
    if (r.value.status === 401) return err('revocada', 'Tu sesión ya no es válida. Vuelve a entrar.');
    return r;
  }
  return err('servidor', 'No se pudo hablar con el servidor.');
}

const aPersona = (fila) => ({
  id: String(fila.id),
  nombre: String(fila.nombre || ''),
  // La vista del equipo no trae ni el codigo de acceso ni el rol (0012): quedan
  // vacios. Solo la lista de administracion, que lee `perfiles`, los tiene.
  codigo: fila.codigo_usuario ? String(fila.codigo_usuario) : '',
  rol: fila.rol ? String(fila.rol) : '',
  area: CATEGORIES.includes(fila.area) ? fila.area : null,
});

/**
 * Trabajadores activos de la sede que tienen area. Solo id, nombre y area.
 *
 * @returns {Promise<{ok: true, value: Array<{id, nombre, area}>} | {ok: false, code: string, message: string}>}
 */
export async function leerEquipo() {
  const r = await conSesion('/rest/v1/equipo_produccion?select=id,nombre,area&order=nombre.asc');
  if (!r.ok) return r;
  const { status, datos } = r.value;
  if (status !== 200 || !Array.isArray(datos)) {
    return err('servidor', 'No se pudo cargar el equipo. Inténtalo de nuevo en unos minutos.');
  }
  return ok(datos.map(aPersona));
}

/**
 * Todos los perfiles, para que administracion asigne areas.
 *
 * Por debajo de gerencia verificada la base de datos solo devuelve la fila
 * propia: se dice en vez de enseñar una lista de una persona.
 */
export async function leerPerfiles() {
  const r = await conSesion('/rest/v1/perfiles?select=id,nombre,codigo_usuario,rol,area,activo&order=nombre.asc');
  if (!r.ok) return r;
  const { status, datos } = r.value;
  if (status !== 200 || !Array.isArray(datos)) {
    return err('servidor', 'No se pudieron cargar los usuarios. Inténtalo de nuevo en unos minutos.');
  }
  return ok(datos.map((fila) => ({ ...aPersona(fila), activo: fila.activo === true })));
}

/**
 * Cambia el area de un perfil.
 *
 * La politica deja pasar solo a administracion con `aal2`; a los demas el
 * servidor les contesta 200 con CERO filas, no un error. Por eso se pide la
 * fila de vuelta y se comprueba que llego.
 *
 * @param {string} id
 * @param {string|null} area
 */
export async function fijarAreaDe(id, area) {
  if (area !== null && !CATEGORIES.includes(area)) return err('area', 'Elige un área válida.');
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return err('perfil', 'Ese usuario no es válido.');
  }
  const r = await conSesion(`/rest/v1/perfiles?id=eq.${encodeURIComponent(id)}&select=id,area`, {
    method: 'PATCH', body: { area }, prefer: 'return=representation',
  });
  if (!r.ok) return r;
  const { status, datos } = r.value;
  if (status === 403 || (status === 200 && Array.isArray(datos) && datos.length === 0)) {
    return err('sin_permiso', 'Solo administración, con la verificación en dos pasos, puede cambiar el área.');
  }
  if (status !== 200 || !Array.isArray(datos) || datos[0]?.area !== area) {
    return err('servidor', 'No se pudo guardar el área. Inténtalo de nuevo.');
  }
  return ok({ id, area });
}
