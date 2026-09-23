import { el } from '../../lib/dom.js';

/** Estado visible de una pantalla remota; la composición conecta los callbacks al controlador. */
export function crearEstadoConexion({ onActualizar, onReintentar }) {
  const mensaje = el('p', { attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
  const actualizar = el('button', { type: 'button', class: 'btn', text: 'Actualizar datos', on: { click: () => ejecutar(onActualizar) } });
  const reintentar = el('button', { type: 'button', class: 'btn', text: 'Comprobar confirmación', on: { click: () => ejecutar(onReintentar) } });
  const node = el('section', { class: 'prod-aviso', attrs: { 'aria-label': 'Conexión de producción' } }, [mensaje, actualizar, reintentar]);
  let estado = { fase: 'inicial' }, ocupado = false, fallo = false;
  function pintar() {
    const textos = {
      inicial: 'Consulta la producción guardada en el servidor.',
      cargando: 'Consultando producción…',
      lista: 'Datos consultados en el servidor. Actualiza para ver cambios de otros equipos.',
      guardando: 'Confirmando en el servidor. Espera antes de volver a enviar.',
      confirmacion_pendiente: 'La conexión se interrumpió. La producción podría estar confirmada. Comprueba esta misma solicitud antes de registrar otra.',
      conflicto: 'Otro equipo modificó la producción. Actualiza los datos y revisa las cantidades antes de confirmar.',
      error: 'No se pudo actualizar la producción. Consulta de nuevo antes de continuar.',
      cerrada: 'Sesión de producción cerrada.',
    };
    mensaje.textContent = (textos[estado.fase] || textos.error)
      + (fallo ? ' No se pudo completar la consulta. Inténtalo de nuevo.' : '');
    actualizar.hidden = !['inicial', 'lista', 'conflicto', 'error'].includes(estado.fase);
    reintentar.hidden = estado.fase !== 'confirmacion_pendiente';
    actualizar.disabled = reintentar.disabled = ocupado;
    node.setAttribute('aria-busy', String(ocupado || ['cargando', 'guardando'].includes(estado.fase)));
  }
  async function ejecutar(callback) {
    if (ocupado || typeof callback !== 'function') return;
    ocupado = true; fallo = false; pintar();
    try { await callback(); }
    catch { fallo = true; }
    finally { ocupado = false; pintar(); }
  }
  pintar();
  return { node, actualizar: nuevo => { estado = { fase: nuevo.fase }; fallo = false; pintar(); } };
}
