/** Transporte de operación central. No activado hasta acordar y probar las RPC. */
import { pedir, tokenVigente } from './sesion.js';
import { ok, err } from './storage.js';

const nombreValido = n => typeof n === 'string' && /^[a-z][a-z0-9_]{0,62}$/.test(n);
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
// El servidor redacta sus errores (`{code, message}`, contrato RPC): se muestran tal cual.
const mensajeDe = d => (objeto(d) && typeof d.message === 'string' && d.message.trim() ? d.message : null);

/** Las rutas las entrega el contrato SQL; no se permite escritura directa a tablas. */
export function crearOperacionRemota({ lectura, comando, solicitar = pedir, token = tokenVigente }) {
  if (!nombreValido(lectura) || !nombreValido(comando)) throw new Error('Contrato RPC inválido');

  async function llamar(nombre, body, escritura) {
    for (const renovar of [false, true]) {
      let sesion, respuesta;
      try {
        sesion = await token(renovar);
        if (!sesion.ok) return sesion;
        respuesta = await solicitar(`/rest/v1/rpc/${nombre}`, { method: 'POST', body, token: sesion.value });
      } catch { respuesta = err('red', 'No se pudo contactar al servidor.'); }
      if (!respuesta.ok) return escritura
        ? err('confirmacion_pendiente', 'No sabemos si el servidor confirmó. Consulta el estado o reintenta con la misma solicitud.')
        : err('sin_conexion', 'No se pudo consultar la operación. Reintenta cuando haya conexión.');
      const { status, datos } = respuesta.value;
      if (status === 401 && !renovar) continue;
      if (status === 401) return err('revocada', 'Vuelve a iniciar sesión.');
      if (status === 403) return err('sin_permiso', mensajeDe(datos) || 'Tu sesión no tiene permiso para esta operación.');
      if (status === 409) return err(datos?.code === 'solicitud_reutilizada' ? 'solicitud_reutilizada' : 'conflicto',
        mensajeDe(datos) || 'Los datos cambiaron. Actualiza antes de continuar.');
      if (status === 404) return err('no_existe', mensajeDe(datos) || 'Lo que se quería cambiar ya no existe.');
      // Validación: el servidor no hizo nada y dice por qué. No es un resultado incierto.
      if (status === 400 || status === 422) return err('invalida', mensajeDe(datos) || 'Revisa los datos e inténtalo de nuevo.');
      if (status >= 200 && status < 300 && objeto(datos) && datos.version === 1) return ok(datos);
      if (escritura && (status >= 500 || status >= 200 && status < 300)) {
        return err('confirmacion_pendiente', 'Verifica el estado de esta solicitud antes de confirmar otra vez.');
      }
      return err('servidor', 'El servidor no pudo completar la operación.');
    }
  }

  return Object.freeze({
    leer: (consulta) => objeto(consulta)
      ? llamar(lectura, { p_consulta: consulta }, false)
      : Promise.resolve(err('consulta', 'La consulta no es válida.')),
    // La identidad se crea una vez por intención de usuario y se conserva en los reintentos.
    ejecutar: (solicitud) => {
      if (!objeto(solicitud) || !uuid(solicitud.id) || !nombreValido(solicitud.accion)
        || !Number.isSafeInteger(solicitud.revision) || solicitud.revision < 0 || !objeto(solicitud.datos)) {
        return Promise.resolve(err('solicitud', 'Revisa la identidad, revisión y datos de la solicitud.'));
      }
      // Captura inmutable: una edición concurrente de la pantalla no cambia un reintento.
      let copia;
      try { copia = structuredClone(solicitud); } catch { return Promise.resolve(err('solicitud', 'La solicitud no es válida.')); }
      return llamar(comando, { p_solicitud: copia }, true);
    },
  });
}
