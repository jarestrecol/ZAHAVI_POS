/**
 * =============================================================================
 *  CASO DE USO: EL PANEL DEL RESUMEN
 * =============================================================================
 *
 *  Une la sesion, la operacion de este equipo y las metas con el motor de
 *  indicadores (`core/bi/`). La vista solo recibe el panel ya armado.
 *
 *  PERMISOS AQUI Y NO EN LA VISTA. El operario no ve el panel, y el dinero es
 *  solo de gerencia y administracion. Las dos reglas se aplican al construir el
 *  panel: lo que no se puede ver no llega a la vista, asi que no hay nada que
 *  ocultar con CSS.
 *
 *  EL EJEMPLO SE PREPARA APARTE. `cargarPanel` es sincrona para que la vista
 *  repinte sin esperas al cambiar de pestaña o de periodo. El documento de
 *  ejemplo (90 dias simulados) se genera una vez con `prepararEjemplo()`,
 *  asincrona, que la vista llama ANTES de activar el modo ejemplo; el modulo
 *  que lo genera se importa solo entonces, asi que no pesa en la carga normal.
 *  El ejemplo nunca toca el almacenamiento.
 */

import { leerOperacion, hoyLocal, alMenos, rangoDe as rangoDeRol } from '../core/bitacora.js';
import { getState } from '../core/store.js';
import { ok, err } from '../core/storage.js';
import { hechosDeOperacion } from '../core/bi/hechos.js';
import { construirPanel } from '../core/bi/panel.js';
import { DEFINICION_METAS, leerMetas, validarMetas, escribirMetas } from '../core/bi/metas.js';
import { PERIODO_POR_DEFECTO } from '../core/bi/periodos.js';

/** Documento de ejemplo ya generado, con los hechos que salen de el. */
let ejemploListo = null;

/** Día, identidad y tamaño del recetario: editar una receta crea un arreglo nuevo. */
const mismaClave = (clave, hoy, recetas) => Boolean(clave) && clave.hoy === hoy
  && clave.recetas === recetas && clave.total === recetas.length;
const recetasActuales = () => getState().recetario?.recipes || [];
const verCostosDe = (usuario) => alMenos(usuario, 'gerencia');

/**
 * Genera (o reutiliza) los datos de ejemplo para hoy y el recetario cargado.
 *
 * @returns {Promise<{ok: true, value: {hoy: string, recetas: number}} | {ok: false, code: string, message: string}>}
 */
export async function prepararEjemplo() {
  const recetas = recetasActuales();
  const hoy = hoyLocal();
  if (mismaClave(ejemploListo?.clave, hoy, recetas)) return ok({ hoy, recetas: recetas.length });
  const clave = { hoy, recetas, total: recetas.length };
  let modulo;
  try {
    modulo = await import('../core/bi/ejemplo.js');
  } catch {
    return err('ejemplo_no_disponible', 'No se pudieron preparar los datos de ejemplo. Recarga la página e inténtalo de nuevo.');
  }
  const doc = modulo.operacionDeEjemplo(recetas, { hoy });
  if (!doc.ok) return doc;
  const hechos = hechosDeOperacion(doc.value, recetas, { hoy, origen: 'ejemplo' });
  if (!hechos.ok) return hechos;
  ejemploListo = { clave, hechos: hechos.value };
  return ok({ hoy, recetas: recetas.length });
}

/**
 * Panel del Resumen para quien tiene la sesion abierta.
 *
 * @param {{periodo?: string, ejemplo?: boolean}} [opciones]
 */
export function cargarPanel({ periodo = PERIODO_POR_DEFECTO, ejemplo = false } = {}) {
  const usuario = getState().usuario;
  if (!usuario || rangoDeRol(usuario) < 1) {
    return err('permiso', 'El resumen es del jefe de obrador en adelante. Tu producción de hoy está en Producción.');
  }
  const verCostos = verCostosDe(usuario);
  const recetas = recetasActuales();
  let hechos;
  if (ejemplo) {
    if (!mismaClave(ejemploListo?.clave, hoyLocal(), recetas)) {
      return err('ejemplo_no_listo', 'Los datos de ejemplo todavía no están listos. Vuelve a pulsar «Ver con datos de ejemplo».');
    }
    hechos = ejemploListo.hechos;
  } else {
    const doc = leerOperacion();
    if (!doc.ok) return doc;
    const r = hechosDeOperacion(doc.value, recetas, { origen: 'local' });
    if (!r.ok) return r;
    hechos = r.value;
  }
  return construirPanel(hechos, { periodo, metas: leerMetas().metas, verCostos });
}

/** Metas vigentes, las que esta persona puede ver y si puede cambiarlas. */
export function estadoMetas() {
  const usuario = getState().usuario;
  const verCostos = verCostosDe(usuario);
  const { metas, actualizado, autor } = leerMetas();
  const definicion = DEFINICION_METAS.filter((d) => verCostos || !d.dinero);
  const visibles = Object.fromEntries(definicion.map((d) => [d.clave, metas[d.clave]]));
  return { metas: visibles, definicion, actualizado, autor, puedeEditar: verCostos };
}

/**
 * Guarda las metas. Solo gerencia y administracion.
 *
 * @param {Object<string, string|number|null>} entrada lo escrito en el formulario
 */
export function guardarMetasResumen(entrada) {
  const usuario = getState().usuario;
  if (!usuario?.id) return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.');
  if (!alMenos(usuario, 'gerencia')) return err('permiso', 'Las metas las fija gerencia o administración.');
  // Lo que no llega en el formulario conserva lo guardado, no la base.
  const actuales = leerMetas().metas;
  const validas = validarMetas({ ...actuales, ...(entrada && typeof entrada === 'object' ? entrada : {}) });
  if (!validas.ok) return validas;
  const escrito = escribirMetas(validas.value, { id: usuario.id, nombre: usuario.nombre || usuario.codigo || 'Sin nombre' });
  return escrito.ok ? ok(escrito.value.metas) : escrito;
}
