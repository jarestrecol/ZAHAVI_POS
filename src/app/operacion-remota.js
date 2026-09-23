import { ok, err } from '../core/storage.js';
import { fechaValida } from '../core/bitacora.js';

/** Adaptación explícita de las tres acciones principales de la pantalla al contrato RPC propuesto. */
export function crearAccionesProduccionRemota(control) {
  const texto = n => typeof n === 'string' && n.trim().length > 0;
  const revisionValida = n => Number.isSafeInteger(n) && n >= 0;
  const fallo = mensaje => Promise.resolve(err('solicitud', mensaje));
  return Object.freeze({
    fijarReceta: (s) => {
      if (!s || !fechaValida(s.fecha) || !texto(s.recetaId) || !revisionValida(s.revision)
        || !Number.isFinite(s.factor) || s.factor < 0
        || s.partidas !== undefined && (!Array.isArray(s.partidas) || s.partidas.some(n => !Number.isFinite(n) || n < 0.05 || n > 100))) {
        return fallo('Revisa la fecha, receta y tandas de producción.');
      }
      return control.guardar({ accion: 'fijar_receta', revision: s.revision,
        datos: { fecha: s.fecha, recetaId: s.recetaId, factor: s.factor,
          ...(s.partidas !== undefined ? { partidas: [...s.partidas] } : {}), motivo: s.motivo || 'Registro de producción' } });
    },
    confirmarReceta: (s) => {
      if (!s || !fechaValida(s.fecha) || !texto(s.recetaId) || !revisionValida(s.revision) || !texto(s.cotizacionId)) {
        return fallo('Consulta los materiales del servidor antes de confirmar esta receta.');
      }
      // No enviar precios, lotes elegidos ni autor del navegador. El servidor verifica
      // su cotización contra el stock vigente y confirma/descuenta atómicamente.
      return control.guardar({ accion: 'confirmar_receta', revision: s.revision,
        datos: { fecha: s.fecha, recetaId: s.recetaId, cotizacionId: s.cotizacionId } });
    },
    guardarResultado: (s) => {
      if (!s || !texto(s.produccionId) || !texto(s.recetaId) || !revisionValida(s.revision)) {
        return fallo('Actualiza el resultado antes de guardarlo.');
      }
      const datos = {};
      for (const k of ['produccionId', 'recetaId', 'unidad', 'esperado', 'vendible', 'rechazado', 'mermaPreparacionGr', 'mermaCoccionGr', 'motivo']) {
        if (s[k] !== undefined) datos[k] = s[k];
      }
      return control.guardar({ accion: 'guardar_resultado', revision: s.revision, datos });
    },
  });
}

/** Estado en memoria de una pantalla remota. No es un almacén ni una cola sin conexión. */
export function crearControlOperacion({ remoto, nuevaId = () => crypto.randomUUID(), alCambiar = () => {} }) {
  let generacion = 0, cerrado = false, consulta = null, pendiente = null, enviando = false;
  let estado = { fase: 'inicial', datos: null, error: null, solicitudId: null };
  const copiar = v => structuredClone(v);
  const informar = cambio => {
    estado = { ...estado, ...cambio };
    alCambiar(copiar(estado));
  };
  const vigente = id => !cerrado && id === generacion;
  const bloqueado = () => err('pendiente', 'Resuelve la confirmación pendiente antes de cambiar la operación.');

  async function cargar(filtro) {
    if (cerrado) return err('cerrado', 'La pantalla ya está cerrada.');
    if (pendiente || enviando) return bloqueado();
    consulta = copiar(filtro);
    const id = ++generacion;
    informar({ fase: 'cargando', datos: null, error: null });
    let r;
    try { r = await remoto.leer(copiar(consulta)); }
    catch { r = err('sin_conexion', 'No se pudo consultar la operación.'); }
    if (!vigente(id)) return err('descartado', 'La consulta fue reemplazada.');
    informar(r.ok ? { fase: 'lista', datos: copiar(r.value), error: null }
      : { fase: 'error', datos: null, error: r });
    return r;
  }

  async function enviar() {
    const id = generacion;
    enviando = true;
    informar({ fase: 'guardando', error: null, solicitudId: pendiente.id });
    let r;
    try { r = await remoto.ejecutar(copiar(pendiente)); }
    catch { r = err('confirmacion_pendiente', 'No se pudo comprobar la confirmación.'); }
    if (!vigente(id)) return err('descartado', 'La pantalla ya no está activa.');
    enviando = false;
    if (!r.ok && r.code === 'confirmacion_pendiente') {
      informar({ fase: 'confirmacion_pendiente', datos: null, error: r });
      return r;
    }
    pendiente = null;
    informar({ solicitudId: null });
    if (!r.ok) {
      informar({ fase: r.code === 'conflicto' ? 'conflicto' : 'error', datos: null, error: r });
      return r;
    }
    // La respuesta de escritura no reemplaza la lectura filtrada por permisos.
    const actualizado = await cargar(consulta);
    return ok({ confirmacion: r.value, actualizado: actualizado.ok });
  }

  return Object.freeze({
    estado: () => copiar(estado),
    cargar,
    guardar: ({ accion, revision, datos }) => {
      if (cerrado) return Promise.resolve(err('cerrado', 'La pantalla ya está cerrada.'));
      if (pendiente || enviando) return Promise.resolve(bloqueado());
      if (estado.fase !== 'lista') return Promise.resolve(err('sin_datos', 'Actualiza la operación antes de guardar.'));
      pendiente = { id: nuevaId(), accion, revision, datos: copiar(datos) };
      return enviar();
    },
    reintentar: () => {
      if (cerrado) return Promise.resolve(err('cerrado', 'La pantalla ya está cerrada.'));
      if (!pendiente || enviando) return Promise.resolve(err('sin_reintento', 'No hay una confirmación disponible para reintentar.'));
      return enviar();
    },
    // Una confirmación incierta no se pierde al navegar: la pantalla debe resolverla primero.
    cerrar: () => {
      if (pendiente || enviando) return bloqueado();
      cerrado = true; generacion++; consulta = null;
      informar({ fase: 'cerrada', datos: null, error: null, solicitudId: null });
      return ok(null);
    },
  });
}
