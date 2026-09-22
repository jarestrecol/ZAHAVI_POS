/**
 * =============================================================================
 *  PRODUCCION: CALENDARIO
 * =============================================================================
 *
 *  La pantalla de produccion es un calendario mensual (PROD-002). Todo sale
 *  de un dia:
 *
 *    barra del mes ──▶ ‹ mes › Hoy   ·   Mi producción · Equipo* · Historial
 *    calendario ──dia──▶ panel del dia ──▶ Producción del día (por area → Proyectar)
 *                                      ├─▶ Sacar producción · Materiales · Costos
 *                                      ├─▶ Registrar producción → área
 *                                      └─▶ Notas: Tarea / Pendiente / Recomendación / Felicitación
 *
 *  PROD-003 quito lo que hacia dudar: la segunda barra con «Día elegido» y las
 *  mismas tres acciones que ya estaban en el panel, la «×» que dejaba un hueco
 *  y el subtitulo que se repetia en cada vista. Las acciones del dia viven
 *  solo en el panel; las que no dependen del dia, en la barra del mes.
 *
 *  Siempre hay un dia elegido. En tableta y celular el panel queda debajo del
 *  calendario: al tocar un dia la pantalla baja hasta el. Con el teclado no,
 *  porque las flechas recorren la rejilla y cada paso la haria saltar.
 *
 *  QUIEN VE QUE
 *    - Operario: solo «Mi producción», lo que tiene asignado.
 *    - Jefe de obrador: el calendario y la producción, SIN costos.
 *    - Gerencia y administración: además, los costos; «Equipo», solo
 *      administración (la base de datos lo exige con `aal2`).
 *  La produccion sigue guardada en este equipo: estas reglas son de pantalla y
 *  del nucleo. Lo que protege el servidor es la lista del equipo y el area.
 *
 *  Escape: desde una vista vuelve al calendario; dentro del panel lleva el
 *  foco al dia en la rejilla; desde la rejilla sale del modulo
 *  (`views/pantalla.js`).
 */

import { el } from '../lib/dom.js';
import { ICON_EQUIPO, ICON_HISTORIAL, ICON_TAREA } from '../lib/iconos.js';
import { hoyLocal, fechaValida } from '../core/bitacora.js';
import { crearPantalla } from './pantalla.js';
import { renderHistorial } from './historial.js';
import { renderCalendario } from './produccion/calendario.js';
import { renderDia } from './produccion/dia.js';
import { crearRegistro } from './produccion/registrar.js';
import { crearMateriales } from './produccion/materiales.js';
import { crearCostos } from './produccion/costos.js';
import { crearProyeccion } from './produccion/proyectar.js';
import { crearEquipo } from './produccion/equipo.js';
import { crearVistaResultados } from './produccion/resultados.js';
import { esLoteDemo } from '../core/precios-demo.js';
import { AREAS, botonAccion, cabeceraVista } from './produccion/comun.js';

/**
 * @param {object} options
 * @param {Array<object>} options.recipes
 * @param {() => {ok: boolean, value?: object, message?: string}} options.leerDatos
 * @param {{id: string, nombre: string, codigo: string, rol: string}|null} options.usuario
 * @param {object} options.acciones casos de uso de `app/produccion.js` y `app/equipo.js`
 * @param {(hoja: object) => void} options.onPrint
 * @param {string|null} options.fechaInicial
 * @param {(fecha: string) => void} options.onFecha
 * @param {(() => void)|null} [options.onBodega] lleva a Bodega a registrar compras
 * @param {(panel: Element, referencia: Element) => void} [options.onLlevarALaVista] baja hasta el
 *   panel si quedo debajo del calendario (medir es de la composicion, no de la vista)
 */
export function openPlan(options) {
  const usuario = options.usuario;
  const rol = usuario?.rol || 'operario';
  const soloPropio = rol === 'operario';
  const puedeGestionar = !soloPropio;
  // El costo es de gerencia, como en la base de datos: el jefe de obrador
  // registra, asigna y produce, pero no ve precios (decisión del usuario,
  // 2026-09-17). Por eso no se deduce de `puedeGestionar`.
  const verCostos = rol === 'gerencia' || rol === 'admin';
  const esAdmin = rol === 'admin';
  const a = options.acciones;
  const hoy = hoyLocal();

  let fecha = fechaValida(options.fechaInicial) ? options.fechaInicial : hoy;
  let area = AREAS[0];
  let vista = null;
  let uiDia = { modo: null };

  const aviso = el('div', { class: 'prod-aviso', hidden: true, attrs: { role: 'alert' } });
  const avisoDemo = el('p', { class: 'prod-aviso', hidden: true,
    text: 'DEMO de Bodega activa: esta producción puede consumir lotes de prueba. Revisa los orígenes antes de confirmar; los precios y pesos demo no son datos reales.' });
  const zona = el('div', { class: 'prod-zona' });
  const persona = usuario ? { id: usuario.id, nombre: usuario.nombre || usuario.codigo,
    codigo: usuario.codigo || '', rol } : { id: '', nombre: '', codigo: '', rol };

  function leer() {
    const r = options.leerDatos();
    aviso.hidden = r.ok;
    aviso.textContent = r.ok ? '' : r.message;
    avisoDemo.hidden = !r.ok || !r.value.lotes.some(esLoteDemo);
    return r.ok ? r.value : null;
  }

  function elegirFecha(nueva) {
    fecha = nueva;
    options.onFecha?.(nueva);
  }

  // ---- Calendario y panel -----------------------------------------------------

  // Lo que no depende del dia: en la misma fila que el mes.
  const vistas = el('div', { class: 'prod-vistas', attrs: { role: 'group', 'aria-label': 'Otras vistas' } }, [
    botonAccion('Mi producción', () => abrir('mia'), { dibujo: ICON_TAREA }),
    esAdmin ? botonAccion('Equipo', () => abrir('equipo'), { dibujo: ICON_EQUIPO }) : null,
    botonAccion('Historial', () => abrir('historial'), { dibujo: ICON_HISTORIAL }),
  ].filter(Boolean));

  const calendario = soloPropio ? null : renderCalendario({
    hoy, seleccion: fecha, leerDatos: leer, acciones: vistas,
    onElegir: (nueva, { origen }) => {
      const cambio = nueva !== fecha;
      if (cambio) uiDia = { modo: null };
      elegirFecha(nueva);
      pintarPanel({ nuevo: cambio });
      if (origen !== 'teclado') llevarPanel();
    },
  });
  const panel = el('div', { class: 'prod-panel' });
  const calendarioNodo = soloPropio ? null : el('div', { class: 'prod-calendario prod-calendario--con-panel' }, [calendario.node, panel]);

  function pintarPanel({ nuevo = false } = {}) {
    const datos = leer();
    // La version del dia se toma AL PINTAR: si se leyera al pulsar, el cambio de
    // otra pestaña se pisaria en vez de rechazarse.
    const revisionDia = datos?.planes?.find((p) => p.fecha === fecha)?.revision || 0;
    panel.replaceChildren(renderDia({
      fecha, datos, ui: uiDia, verCostos, nuevo,
      onUi: aplicarUi,
      onArea: (elegida) => abrir('registrar', { area: elegida }),
      onVista: (nombre, extra) => abrir(nombre, extra),
      onGuardarNota: a.guardarNota,
      onEliminarNota: a.eliminarNota,
      onCargarEquipo: a.cargarEquipo ? cargarEquipoDelPanel : null,
      onEliminarProduccion: puedeGestionar
        ? ({ motivo }) => a.eliminarProduccion({ fecha, revision: revisionDia, motivo })
        : null,
    }));
  }

  /** Repinta el panel con otro estado de interfaz y devuelve el foco a donde diga. */
  function aplicarUi(siguiente) {
    const { enfocar, ...resto } = siguiente;
    uiDia = resto;
    pintarPanel();
    calendario.pintar();
    const destino = enfocar && (panel.querySelector(`#${CSS.escape(enfocar)}`) || panel.querySelector(`[data-foco="${CSS.escape(enfocar)}"]`));
    destino?.focus();
  }

  /**
   * El equipo solo se pide cuando alguien dirige una nota a una persona. El
   * panel se reconstruye entero en cada paso, asi que el foco viaja en `enfocar`:
   * sin eso caeria al `body` y el lector de pantalla se quedaria sin sitio.
   */
  async function cargarEquipoDelPanel({ forzar = false } = {}) {
    aplicarUi({ ...uiDia, equipo: { estado: 'cargando', lista: [], mensaje: '' }, enfocar: 'dia-nota-para' });
    let r;
    try {
      r = await a.cargarEquipo({ forzar });
    } catch (error) {
      r = { ok: false, message: error?.message || 'sin conexión' };
    }
    const equipo = r.ok
      ? { estado: 'listo', lista: r.value || [], mensaje: '' }
      : { estado: 'error', lista: [], mensaje: r.message || '' };
    const siguiente = equipo.estado === 'error' ? 'dia-equipo-reintentar'
      : equipo.lista.length ? 'dia-personas' : 'dia-nota-para';
    aplicarUi({ ...uiDia, equipo, enfocar: siguiente });
  }

  /** En una columna, baja hasta el panel del dia recien elegido. */
  function llevarPanel() {
    options.onLlevarALaVista?.(panel, calendario.node);
  }

  // ---- Vistas -------------------------------------------------------------------

  function crearVista(nombre, extra = {}) {
    const volver = soloPropio ? null : () => mostrarCalendario();
    if (nombre === 'registrar') {
      return crearRegistro({ fecha, area: extra.area || area, recetaId: extra.recetaId, recetas: options.recipes, leerDatos: leer,
        onFijar: a.fijarReceta, onVolver: volver, onArea: (nueva) => { area = nueva; } });
    }
    if (nombre === 'materiales') {
      return crearMateriales({ fecha, leerDatos: leer, onVolver: volver, onImprimir: options.onPrint,
        onBodega: verCostos ? options.onBodega : null,
        onRegistrar: () => mostrarCalendario({ ui: { modo: 'areas' }, enfocar: '.dia__accion--produccion' }) });
    }
    if (nombre === 'costos') {
      return crearCostos({ fecha, leerDatos: leer, onVolver: volver, onSembrarDemo: a.sembrarDemo, onBodega: options.onBodega || null });
    }
    if (nombre === 'resultados') return crearVistaResultados({ fecha, leerDatos: leer, autor: persona, verCostos,
      onGuardar: a.guardarResultado, onVolver: volver,
      onProducir: (elegida, recetaId) => abrir('proyectar', { area: elegida, recetaId }) });
    if (nombre === 'proyectar' || nombre === 'mia') {
      const propio = nombre === 'mia';
      return crearProyeccion({
        modo: propio ? 'propio' : 'jefe', fecha, area, recetaId: extra.recetaId, persona, leerDatos: leer, verCostos, puedeGestionar,
        cargarEquipo: propio ? null : a.cargarEquipo,
        onIniciar: a.iniciarPreparacion, onCancelar: a.cancelarPreparacion, onConfirmar: a.confirmarReceta,
        onGuardarResultado: a.guardarResultado,
        onAsignar: propio ? null : a.asignarReceta,
        onGuardarNota: propio ? a.guardarNota : null,
        onFecha: (nueva) => { elegirFecha(nueva); calendario?.elegir(nueva, { avisar: false }); },
        onArea: (nueva) => { area = nueva; },
        onRegistrar: propio ? null : (elegida, recetaId) => abrir('registrar', { area: elegida, recetaId }),
        onBodega: verCostos ? options.onBodega || null : null,
        onEquipo: esAdmin ? () => abrir('equipo') : null,
        onVolver: volver,
      });
    }
    if (nombre === 'equipo') return crearEquipo({ cargarPerfiles: a.cargarPerfiles, onCambiarArea: a.cambiarArea, onVolver: volver });
    if (nombre === 'historial') {
      const historial = renderHistorial({ leerDatos: options.leerDatos, tipo: 'produccion', verCostos });
      const { node: cabecera, titulo } = cabeceraVista({ titulo: 'Historial de producción', fecha: null,
          detalle: verCostos ? 'Planes, confirmaciones y costos registrados' : 'Planes, confirmaciones y resultados medidos', onVolver: volver });
      return { node: el('section', { class: 'prod-vista hist' }, [cabecera, historial.node]), enfocar: () => titulo.focus() };
    }
    return null;
  }

  function abrir(nombre, extra = {}) {
    if (nombre === 'equipo' && !esAdmin) return;
    if (extra.area) area = extra.area;
    const nueva = crearVista(nombre, extra);
    if (!nueva) return;
    vista = nombre;
    zona.replaceChildren(nueva.node);
    zona.closest('.pantalla__cuerpo')?.scrollTo?.({ top: 0 });
    nueva.enfocar();
  }

  /**
   * Vuelve al calendario con el dia elegido. Por defecto el panel queda limpio:
   * si recordara «Registrar producción» desplegado, el siguiente toque lo
   * cerraria en vez de abrirlo. Quien vuelve para registrar lo pide con `ui`.
   */
  function mostrarCalendario({ ui = { modo: null }, enfocar = null } = {}) {
    vista = null;
    uiDia = ui;
    calendario.elegir(fecha, { avisar: false });
    pintarPanel();
    zona.replaceChildren(calendarioNodo);
    if (enfocar) {
      const destino = panel.querySelector(enfocar);
      destino?.focus();
      if (destino) return;
    }
    calendario.enfocarDia(fecha);
  }

  function alPulsar(evento) {
    if (evento.key !== 'Escape' || soloPropio) return;
    // En un buscador con texto, Escape lo borra (lo hace el navegador) y nada mas.
    if (evento.target.matches('input[type="search"]') && evento.target.value) { evento.stopPropagation(); return; }
    if (vista) {
      evento.preventDefault(); evento.stopPropagation();
      mostrarCalendario();
    } else if (panel.contains(evento.target)) {
      // Desde el panel, al dia en la rejilla; un segundo Escape ya sale del modulo.
      evento.preventDefault(); evento.stopPropagation();
      if (uiDia.modo) { uiDia = { modo: null }; pintarPanel(); }
      calendario.enfocarDia(fecha);
    }
  }

  const cuerpo = el('div', { class: `calprod${soloPropio ? ' calprod--propio' : ''}`, on: { keydown: alPulsar } }, [aviso, avisoDemo, zona]);

  leer();
  if (soloPropio) {
    abrir('mia');
  } else {
    pintarPanel();
    zona.appendChild(calendarioNodo);
  }

  return crearPantalla({
    modulo: 'plan', subtitulo: 'producción', meta: '',
    cuerpo, onMenu: options.onMenu, onVolver: options.onVolver, onSalir: options.onSalir,
  });
}
