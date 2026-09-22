/**
 * =============================================================================
 *  PROYECTAR PRODUCCION · MI PRODUCCION
 * =============================================================================
 *
 *  El dia de trabajo, una receta cada vez:
 *
 *    1. Se elige el area (Pastelería, Panadería, Galletas). Cada pestaña dice
 *       cuantas recetas van listas de cuantas hay.
 *    2. Salen las recetas del dia como tarjetas, ordenadas por lo urgente: en
 *       preparacion, pendientes y listas. Por defecto solo «Por hacer».
 *    3. En cada tarjeta se elige quien la saca, sin abrir nada; si faltan por
 *       asignar, «Asignar las que faltan a» las reparte de una vez.
 *    4. Al abrir una receta se ven sus medidas ya multiplicadas y, al final,
 *       el paso siguiente: Empezar a producir, Marcar lista.
 *    5. Marcar lista pregunta antes y descuenta de bodega SOLO esa receta.
 *
 *  Con espacio (960 px o mas) la lista y el detalle van en dos columnas; con
 *  menos, la tarjeta abierta despliega su detalle dentro (acordeon).
 *
 *  «Mi producción» es la misma pantalla con otra lista: solo lo asignado a la
 *  persona de la sesion, de todas sus areas, sin reasignar ni ver costos.
 *
 *  Antes de preguntar se calcula el costo FEFO de lo pendiente y se envia con
 *  la confirmacion: si la bodega cambio entre tanto, el nucleo lo rechaza. Si
 *  falta algun ingrediente, se dice cual y no se deja marcar lista.
 */

import { el, clear } from '../../lib/dom.js';
import { announce } from '../../lib/a11y.js';
import { titleCase, formatMedida as formatQty, pesos } from '../../lib/format.js';
import { ICON_ANTERIOR, ICON_SIGUIENTE, ICON_PROYECTAR, ICON_LISTO, ICON_ALMACEN, ICON_MAS } from '../../lib/iconos.js';
import { rendimientoEscalado } from '../../core/scale.js';
import { materialesEnGramos } from '../../core/materiales-produccion.js';
import { recetasDelDia, asignadasA } from '../../core/preparacion.js';
import { notasDelDia, TIPOS_NOTA } from '../../core/notas.js';
import { costeoPendiente } from '../../core/produccion.js';
import { hoyLocal, sumarDias } from '../../core/bitacora.js';
import { crearResultados } from './resultados.js';
import { fechaLarga } from '../../core/calendario.js';
import {
  AREAS, avance, botonAccion, cabeceraVista, claseArea, conEspera, insigniaEstado, marcarHecho,
  nombreArea, selector, tandas, vacio, vigilarAncho,
} from './comun.js';

const FILTROS = [['por_hacer', 'Por hacer'], ['listas', 'Listas'], ['todas', 'Todas']];

/** Orden de las tarjetas: lo que esta en marcha primero, lo listo al final. */
const ORDEN_ESTADO = { en_preparacion: 0, pendiente: 1, lista: 2 };

/**
 * @param {object} o
 * @param {'jefe'|'propio'} o.modo
 * @param {string} o.fecha
 * @param {string} [o.area] area inicial (modo jefe)
 * @param {{id: string, nombre: string}} o.persona quien tiene la sesion
 * @param {() => object|null} o.leerDatos
 * @param {boolean} o.verCostos
 * @param {boolean} [o.puedeGestionar] puede registrar compras o cambiar tandas (por defecto, modo jefe)
 * @param {(o: {forzar?: boolean}) => Promise<object>} [o.cargarEquipo] lista de trabajadores (modo jefe)
 * @param {(s: object) => Promise<object>} o.onIniciar
 * @param {(s: object) => Promise<object>} o.onCancelar
 * @param {(s: object) => Promise<object>} o.onConfirmar
 * @param {(s: object) => Promise<object>} [o.onAsignar]
 * @param {(s: object) => Promise<object>} [o.onGuardarNota] marcar hecha una nota propia (modo propio)
 * @param {(fecha: string) => void} [o.onFecha]
 * @param {(area: string) => void} [o.onArea]
 * @param {(area: string) => void} [o.onRegistrar] abre Registrar en esa area (modo jefe)
 * @param {() => void} [o.onBodega] abre la bodega
 * @param {(() => void)|null} o.onVolver
 */
export function crearProyeccion(o) {
  const propio = o.modo === 'propio';
  const puedeGestionar = o.puedeGestionar ?? o.modo === 'jefe';
  const asignable = !propio && typeof o.onAsignar === 'function';
  let fecha = o.fecha;
  let area = o.area || AREAS[0];
  let filtro = 'por_hacer';
  // `undefined`: se elige sola al pintar. `null`: el usuario la cerro (acordeon).
  let elegida = o.recetaId;
  // Receta que esta preguntando «¿ya está lista?».
  let preguntando = null;
  const borradoresResultado = new Map();
  // Recetas confirmadas en esta visita: siguen a la vista aunque el filtro sea
  // «Por hacer», para que se vea el «Lista ✓» recien puesto.
  let retenidas = new Set();
  let equipo = { estado: 'sin_cargar', lista: [], mensaje: '' };
  let cargaEquipo = 0;

  const estado = el('p', { class: 'prod-estado-texto', attrs: { role: 'status' } });
  const controles = el('div', { class: 'proy__controles' });
  const aviso = el('div', { class: 'proy__aviso', attrs: { role: 'note' }, hidden: true });
  const lote = el('div', { class: 'proy__lote', hidden: true });
  const lista = el('div', { class: 'proy__lista' });
  // Sin `aria-live`: el detalle se reconstruye entero en cada repintado -filtro,
  // dia, asignacion, ancho- y leerlo de nuevo, tabla de medidas incluida, pisaria
  // el anuncio del cambio real. Al elegir una receta el foco ya va a su titulo.
  const detalleLateral = el('div', { class: 'proy__detalle' });
  const columnas = el('div', { class: 'proy__columnas' });
  const { node: cabecera, titulo } = cabeceraVista({
    titulo: propio ? 'Mi producción' : 'Sacar producción',
    fecha, detalle: propio ? o.persona.nombre : '',
    onVolver: o.onVolver || (() => {}),
  });
  if (!o.onVolver) cabecera.querySelector('.prod-vista__volver')?.remove();
  const textoFecha = cabecera.querySelector('.prod-vista__fecha');

  // Lo que le dejaron dicho a esta persona. Vive aqui porque el operario no
  // entra al calendario: en el panel del dia no lo veria nunca.
  const misNotas = propio ? el('div', { class: 'proy__notas', hidden: true }) : null;

  const node = el('section', { class: `prod-vista proy${propio ? ' proy--propio' : ''}` }, [
    cabecera, controles, estado, aviso, misNotas, lote, columnas,
  ].filter(Boolean));

  // Dos columnas o acordeon, segun el ancho real de la vista.
  const dosColumnas = vigilarAncho(node, () => {
    const foco = claveFoco();
    pintar();
    recuperarFoco(foco);
  });

  // ---- Datos ----------------------------------------------------------------

  function datos() { return o.leerDatos(); }

  /** Recetas del dia (del area o de la persona), en el orden del plan. */
  function recetas() {
    const d = datos();
    if (!d) return [];
    return propio ? asignadasA(d, o.persona.id, fecha) : recetasDelDia(d, fecha).filter((r) => r.recipe.categoria === area);
  }

  function ordenadas(todas) {
    return todas
      .map((r, i) => ({ r, i }))
      .sort((a, b) => (ORDEN_ESTADO[a.r.estado] - ORDEN_ESTADO[b.r.estado]) || (a.i - b.i))
      .map(({ r }) => r);
  }

  function visiblesDe(todas) {
    if (filtro === 'todas') return todas;
    if (filtro === 'listas') return todas.filter((r) => r.estado === 'lista');
    return todas.filter((r) => r.estado !== 'lista' || retenidas.has(r.recipe.id));
  }

  /** La ultima confirmacion de una receta ese dia, para decir quien y a que hora. */
  function ultimaConfirmacion(d, recetaId) {
    return d?.ejecuciones.filter((e) => e.fecha === fecha && e.entradas.some((x) => x.recipe.id === recetaId)).at(-1) || null;
  }

  function delAreaEnEquipo(categoria) {
    return equipo.lista.filter((p) => p.area === categoria);
  }

  /** La lista trae solo el nombre (0012): dos iguales se distinguen por el principio del id. */
  function rotulador(personas) {
    const repetidos = new Set(personas.map((p) => p.nombre).filter((n, i, todos) => todos.indexOf(n) !== i));
    return (p) => (repetidos.has(p.nombre) ? `${p.nombre} (${p.id.slice(0, 4)})` : p.nombre);
  }

  // `codigo` llega vacio desde la vista del equipo (0012), pero el nucleo exige el campo.
  const aTrabajador = (p) => (p ? { id: p.id, nombre: p.nombre, codigo: p.codigo ?? '', area: p.area } : null);

  async function asegurarEquipo(forzar = false) {
    if (!asignable || !o.cargarEquipo) return;
    if (!forzar && equipo.estado !== 'sin_cargar') return;
    const turno = ++cargaEquipo;
    equipo = { estado: 'cargando', lista: [], mensaje: '' };
    if (forzar) pintarConFoco();
    let r;
    try {
      r = await o.cargarEquipo({ forzar });
    } catch (error) {
      r = { ok: false, message: error?.message || 'sin conexión' };
    }
    // Otra carga posterior manda.
    if (turno !== cargaEquipo) return;
    equipo = r.ok ? { estado: 'listo', lista: r.value || [], mensaje: '' } : { estado: 'error', lista: [], mensaje: r.message || '' };
    if (!node.isConnected && !forzar) { pintar(); return; }
    const foco = claveFoco();
    pintar();
    if (forzar) {
      if (equipo.estado === 'error') enfocar('.proy__aviso [data-paso="reintentar"]');
      else enfocar('.proy-item__asignar select:not([disabled])', '.proy__lote select', titulo);
    } else {
      recuperarFoco(foco);
    }
  }

  // ---- Foco -----------------------------------------------------------------

  /** Primer elemento visible y enfocable de la lista de candidatos. */
  function enfocar(...candidatos) {
    for (const c of candidatos) {
      const destino = typeof c === 'string' ? node.querySelector(c) : c;
      if (destino && destino.isConnected && !destino.disabled && destino.getClientRects().length) {
        destino.focus();
        return destino;
      }
    }
    titulo.focus();
    return titulo;
  }

  /** Como volver a encontrar el elemento enfocado tras repintar. */
  function claveFoco() {
    const activo = document.activeElement;
    if (!activo || !node.contains(activo)) return null;
    if (activo.id) return `#${CSS.escape(activo.id)}`;
    const tarjeta = activo.closest('.proy-tarjeta');
    if (tarjeta) return `.proy-tarjeta[data-receta="${CSS.escape(tarjeta.dataset.receta)}"]`;
    if (activo.dataset.opcion) {
      const grupo = activo.closest('.prod-selector--areas') ? '.prod-selector--areas' : '.prod-selector--filtro';
      return `${grupo} [data-opcion="${CSS.escape(activo.dataset.opcion)}"]`;
    }
    if (activo.dataset.paso) return `[data-paso="${CSS.escape(activo.dataset.paso)}"]`;
    if (activo.closest('.proy-detalle')) return '.proy-detalle__titulo';
    return null;
  }

  function recuperarFoco(clave) {
    if (!clave) return;
    enfocar(clave, elegida ? `.proy-tarjeta[data-receta="${CSS.escape(elegida)}"]` : null);
  }

  function pintarConFoco() {
    const foco = claveFoco();
    pintar();
    recuperarFoco(foco);
  }

  const selectorTarjeta = (id) => `.proy-tarjeta[data-receta="${CSS.escape(id)}"]`;
  const selectorItem = (id) => `.proy-item[data-receta="${CSS.escape(id)}"]`;

  // ---- Lo que me dejaron dicho ------------------------------------------------

  /**
   * Las notas dirigidas a esta persona en este dia.
   *
   * Marcar hecha es lo unico que el operario puede hacer con una nota; el nucleo
   * lo comprueba tambien alli. Se reenvia la nota entera para no cambiarle el
   * destinatario al marcarla.
   */
  function pintarMisNotas(d) {
    if (!misNotas) return;
    const mias = d ? notasDelDia(d, fecha).filter((n) => n.persona?.id === o.persona.id) : [];
    misNotas.hidden = !mias.length;
    if (!mias.length) { clear(misNotas); return; }
    misNotas.replaceChildren(
      el('h3', { class: 'proy__notas-titulo', text: 'Para ti este día' }),
      el('ul', { class: 'proy__notas-lista' }, mias.map(notaPropia)),
    );
  }

  function notaPropia(n) {
    const t = TIPOS_NOTA[n.tipo];
    return el('li', { class: `proy-nota proy-nota--${n.tipo}${n.hecha ? ' proy-nota--hecha' : ''}` }, [
      el('p', { class: 'proy-nota__texto' }, [
        el('span', { class: 'proy-nota__tipo', text: t.nombre }),
        el('span', { text: n.texto }),
      ]),
      t.seCumple && o.onGuardarNota ? el('label', { class: 'proy-nota__hecha' }, [
        el('input', { type: 'checkbox', checked: n.hecha, dataset: { nota: n.id },
          attrs: { 'aria-label': `Marcar como hecha: ${n.texto}` },
          on: { change: async (evento) => {
            const marcado = evento.currentTarget.checked;
            const r = await o.onGuardarNota({ id: n.id, revision: n.revision, fecha: n.fecha, tipo: n.tipo,
              texto: n.texto, area: n.area, persona: n.persona, hecha: marcado });
            if (!avisar(r, marcado ? 'Marcada como hecha.' : 'Marcada como no hecha.')) {
              evento.currentTarget.checked = !marcado;
              return;
            }
            pintar();
            misNotas.querySelector(`[data-nota="${CSS.escape(n.id)}"]`)?.focus();
          } } }),
        el('span', { text: 'Hecha' }),
      ]) : null,
      el('p', { class: 'proy-nota__autor', text: `De ${n.autor.nombre}` }),
    ].filter(Boolean));
  }

  // ---- Avisos ---------------------------------------------------------------

  function avisar(resultado, textoBien) {
    const texto = resultado?.ok ? textoBien : (resultado?.message || 'No se pudo guardar el cambio.');
    estado.textContent = texto;
    announce(texto, resultado?.ok ? 'polite' : 'assertive');
    return Boolean(resultado?.ok);
  }

  // ---- Navegacion -----------------------------------------------------------

  function reiniciarSeleccion() {
    elegida = undefined;
    preguntando = null;
    retenidas = new Set();
  }

  function cambiarFecha(nueva, foco) {
    fecha = nueva;
    reiniciarSeleccion();
    o.onFecha?.(nueva);
    pintar();
    enfocar(foco, '.proy__dia [data-paso="hoy"]');
  }

  function cambiarFiltro(nuevo) {
    filtro = nuevo;
    elegida = undefined;
    preguntando = null;
    retenidas = new Set();
    pintar();
    enfocar(`.prod-selector--filtro [data-opcion="${nuevo}"]`);
  }

  // ---- Controles ------------------------------------------------------------

  function pintarControles(todasDelDia) {
    clear(controles);
    const hoy = hoyLocal();
    const botonDia = (texto, destino, paso, etiqueta, dibujo) => botonAccion(texto, () => cambiarFecha(destino, `.proy__dia [data-paso="${paso}"]`), {
      clase: `btn btn--quiet${dibujo ? ' proy__flecha' : ''}`, dibujo, etiqueta, dataset: { paso },
    });
    const dia = el('div', { class: 'proy__dia', attrs: { role: 'group', 'aria-label': 'Día' } }, [
      botonDia('', sumarDias(fecha, -1), 'anterior', 'Día anterior', ICON_ANTERIOR),
      el('button', {
        type: 'button', class: 'btn btn--quiet', dataset: { paso: 'hoy' },
        attrs: { 'aria-pressed': String(fecha === hoy) },
        on: { click: () => cambiarFecha(hoy, '.proy__dia [data-paso="hoy"]') },
      }, [el('span', { text: 'Hoy' })]),
      botonDia('', sumarDias(fecha, 1), 'siguiente', 'Día siguiente', ICON_SIGUIENTE),
    ]);
    const areas = propio ? null : selector({
      etiqueta: 'Área', valor: area, clase: 'prod-selector--areas',
      opciones: AREAS.map((a) => {
        const delArea = todasDelDia.filter((r) => r.recipe.categoria === a);
        const listas = delArea.filter((r) => r.estado === 'lista').length;
        return [a, `${nombreArea(a)} ${listas}/${delArea.length}`, `area-tab area-tab--${claseArea(a)}`,
          delArea.length ? `${nombreArea(a)}, ${listas} de ${delArea.length} listas` : `${nombreArea(a)}, sin recetas`];
      }),
      onCambio: (nueva) => {
        if (nueva !== area) {
          area = nueva;
          reiniciarSeleccion();
          o.onArea?.(nueva);
        }
        pintar();
        enfocar(`.prod-selector--areas [data-opcion="${CSS.escape(nueva)}"]`);
      },
    });
    const mostrar = selector({
      etiqueta: 'Mostrar', valor: filtro, clase: 'prod-selector--filtro', opciones: FILTROS,
      onCambio: cambiarFiltro,
    });
    controles.append(...[dia, areas, mostrar].filter(Boolean));
  }

  // ---- Aviso y asignacion en lote ---------------------------------------------

  function pintarAviso(todas) {
    clear(aviso);
    const partes = [];
    const hoy = hoyLocal();
    const sinConfirmar = todas.filter((r) => r.estado !== 'lista').length;
    if (fecha < hoy && sinConfirmar) {
      partes.push(el('p', { text: sinConfirmar === 1
        ? 'Este día ya pasó y queda 1 receta sin confirmar.'
        : `Este día ya pasó y quedan ${sinConfirmar} recetas sin confirmar.` }));
    }
    if (asignable && todas.length) {
      if (equipo.estado === 'error') {
        partes.push(el('p', {}, [
          el('span', { text: `No se pudo cargar el equipo: ${motivo(equipo.mensaje)}. La asignación actual se conserva. ` }),
          botonAccion('Volver a intentar', (evento) => conEspera(evento.currentTarget, () => asegurarEquipo(true)), {
            clase: 'btn btn--quiet', dataset: { paso: 'reintentar' },
          }),
        ]));
      } else if (equipo.estado === 'listo' && !delAreaEnEquipo(area).length) {
        partes.push(el('p', { text: `Nadie tiene el área ${nombreArea(area)}. Administración la asigna en Equipo.` }));
        if (o.onEquipo) partes.push(botonAccion('Configurar personas del área', o.onEquipo));
      }
    }
    aviso.append(...partes);
    aviso.hidden = !partes.length;
  }

  function pintarLote(todas) {
    clear(lote);
    lote.hidden = true;
    if (!asignable || equipo.estado !== 'listo') return;
    const faltan = todas.filter((r) => r.estado !== 'lista' && !r.preparacion?.asignado);
    const personas = delAreaEnEquipo(area);
    if (!faltan.length || !personas.length) return;
    const rotulo = rotulador(personas);
    const campo = el('select', { class: 'field', id: 'proy-lote' },
      personas.map((p) => el('option', { value: p.id, text: rotulo(p) })));
    const boton = botonAccion('Asignar', () => conEspera(boton, () => asignarEnLote(campo.value)), {
      clase: 'btn btn--quiet', dibujo: ICON_MAS, dataset: { paso: 'lote' },
    });
    lote.append(
      el('label', { for: 'proy-lote', text: 'Asignar las que faltan a' }),
      campo,
      boton,
    );
    lote.hidden = false;
  }

  /** Una receta a la vez, con la regla de siempre (`asignarRecetaEn`). */
  async function asignarEnLote(personaId) {
    const persona = delAreaEnEquipo(area).find((p) => p.id === personaId);
    if (!persona) return;
    const pendientes = recetas().filter((r) => r.estado !== 'lista' && !r.preparacion?.asignado);
    let hechas = 0;
    const fallos = [];
    for (const r of pendientes) {
      let res;
      try {
        res = await o.onAsignar({ fecha, recetaId: r.recipe.id, trabajador: aTrabajador(persona) });
      } catch (error) {
        res = { ok: false, message: error?.message || 'error inesperado' };
      }
      if (res?.ok) hechas += 1;
      else fallos.push(`${titleCase(r.recipe.nombre)}: ${res?.message || 'no se pudo asignar'}`);
    }
    const bien = `${hechas} ${hechas === 1 ? 'receta asignada' : 'recetas asignadas'} a ${persona.nombre}.`;
    const texto = fallos.length ? `${bien} No se pudo asignar ${fallos.join('; ')}` : bien;
    estado.textContent = texto;
    announce(texto, fallos.length ? 'assertive' : 'polite');
    pintar();
    for (const r of pendientes) {
      if (!fallos.some((f) => f.startsWith(`${titleCase(r.recipe.nombre)}:`))) marcarHecho(node.querySelector(selectorItem(r.recipe.id)));
    }
    enfocar('#proy-lote', '.proy-item__asignar select:not([disabled])', titulo);
  }

  // ---- Lista de tarjetas ------------------------------------------------------

  function pintarLista(todas, acordeon) {
    clear(lista);
    const orden = ordenadas(todas);
    const visibles = visiblesDe(orden);

    // Receta abierta: la que se eligio si sigue a la vista; si no, la primera en
    // preparacion y, si no hay, la primera pendiente.
    if (elegida && !visibles.some((r) => r.recipe.id === elegida)) elegida = undefined;
    if (elegida === undefined || (elegida === null && !acordeon)) {
      elegida = (visibles.find((r) => r.estado === 'en_preparacion')
        || visibles.find((r) => r.estado === 'pendiente')
        || (acordeon ? null : visibles[0]))?.recipe.id ?? (acordeon ? undefined : null);
    }
    if (preguntando && preguntando !== elegida) preguntando = null;

    if (!todas.length) {
      lista.appendChild(propio
        ? vacio({
          clase: 'proy__vacio',
          texto: 'No tienes recetas asignadas este día. Cuando te asignen una, aparece aquí.',
          accion: botonAccion('Ver el día siguiente', () => cambiarFecha(sumarDias(fecha, 1), '.proy__dia [data-paso="siguiente"]'), {
            clase: 'btn btn--quiet', dibujo: ICON_SIGUIENTE,
          }),
        })
        : vacio({
          clase: 'proy__vacio',
          texto: `No hay recetas de ${nombreArea(area)} este día.`,
          accion: o.onRegistrar
            ? botonAccion(`Registrar ${nombreArea(area)}`, () => o.onRegistrar(area), { clase: 'btn btn--primary', dibujo: ICON_MAS })
            : null,
        }));
      return;
    }

    const listas = todas.filter((r) => r.estado === 'lista').length;
    lista.appendChild(avance(listas, todas.length, propio ? 'Avance de tu producción' : `Avance de ${nombreArea(area)}`));

    if (!visibles.length) {
      lista.appendChild(filtro === 'listas'
        ? vacio({ clase: 'proy__vacio', texto: 'Todavía no hay recetas listas.' })
        : vacio({
          clase: 'proy__vacio',
          texto: propio ? '✓ Terminaste lo de este día.' : `✓ Todo listo en ${nombreArea(area)}.`,
          accion: botonAccion('Ver las listas', () => cambiarFiltro('listas'), { clase: 'btn btn--quiet', dibujo: ICON_LISTO }),
        }));
      return;
    }

    const d = datos();
    lista.appendChild(el('ul', { class: 'proy__tarjetas', attrs: { 'aria-label': 'Recetas del día' } },
      visibles.map((r) => item(r, d, acordeon))));
  }

  function item(r, d, acordeon) {
    const id = r.recipe.id;
    const nombre = titleCase(r.recipe.nombre);
    const abierta = id === elegida;
    const idDetalle = `proy-detalle-${id}`;
    const asignado = r.preparacion?.asignado || null;
    let datosTexto;
    if (r.estado === 'lista') {
      const ultima = ultimaConfirmacion(d, id);
      datosTexto = [tandas(r.factor), asignado ? `la sacó ${asignado.nombre}` : '', ultima ? hora(ultima.instante) : ''];
    } else {
      const rinde = rendimientoEscalado(r.recipe.nombre, r.pendiente);
      datosTexto = [
        `${tandas(r.pendiente)}${r.parcial ? ' extra' : ''} por hacer`,
        rinde ? `salen ${rinde}` : '',
        propio ? nombreArea(r.recipe.categoria) : asignable ? '' : (asignado ? asignado.nombre : 'Sin asignar'),
      ];
    }
    const tarjeta = el('button', {
      type: 'button',
      class: `proy-tarjeta proy-tarjeta--${r.estado} proy-tarjeta--${claseArea(r.recipe.categoria)}`,
      dataset: { receta: id },
      attrs: acordeon
        ? { 'aria-expanded': String(abierta), 'aria-controls': abierta ? idDetalle : null }
        : { 'aria-pressed': String(abierta) },
      on: { click: () => alPulsarTarjeta(id) },
    }, [
      el('span', { class: 'proy-tarjeta__nombre', text: nombre }),
      el('span', { class: 'proy-tarjeta__datos', text: datosTexto.filter(Boolean).join(' · ') }),
      insigniaEstado(r.estado, r.parcial),
    ]);
    return el('li', { class: `proy-item${abierta ? ' proy-item--abierta' : ''}`, dataset: { receta: id } }, [
      tarjeta,
      asignable && r.estado !== 'lista' ? campoAsignar(r, nombre) : null,
      acordeon && abierta
        ? el('div', { class: 'proy__detalle', id: idDetalle }, [detalleDe(r, d)])
        : null,
    ]);
  }

  function alPulsarTarjeta(id) {
    const acordeon = !dosColumnas();
    if (acordeon && id === elegida) {
      elegida = null;
      preguntando = null;
      pintar();
      enfocar(selectorTarjeta(id));
      return;
    }
    if (id !== elegida) preguntando = null;
    elegida = id;
    pintar();
    const h3 = enfocar('.proy-detalle__titulo');
    if (acordeon) h3.scrollIntoView?.({ block: 'nearest' });
  }

  /** «Quién la saca», dentro de la fila y fuera del boton de la tarjeta. */
  function campoAsignar(r, nombre) {
    const actual = r.preparacion?.asignado || null;
    const idCampo = `proy-asignar-${r.recipe.id}`;
    const etiqueta = el('label', { class: 'proy-item__asignar' }, [el('span', { text: 'Quién la saca' })]);
    const attrs = { 'aria-label': `Quién saca ${nombre}` };

    if (equipo.estado === 'sin_cargar' || equipo.estado === 'cargando') {
      // Mientras carga se ve lo que ya hay, sin dejar cambiarlo.
      etiqueta.appendChild(el('select', { class: 'field', id: idCampo, disabled: true, attrs: { ...attrs, 'aria-busy': 'true' } }, [
        el('option', { value: actual?.id || '', text: actual ? actual.nombre : 'Cargando personas…' }),
      ]));
      return etiqueta;
    }

    const delArea = delAreaEnEquipo(r.recipe.categoria);
    const rotulo = rotulador(delArea);
    const campo = el('select', { class: 'field', id: idCampo, disabled: equipo.estado === 'error' && !actual, attrs }, [
      el('option', { value: '', text: 'Sin asignar' }),
      ...delArea.map((p) => el('option', { value: p.id, text: rotulo(p) })),
      // Quien la tenia puede haber cambiado de area o no venir en la lista (sin red).
      actual && !delArea.some((p) => p.id === actual.id)
        ? el('option', { value: actual.id, text: `${actual.nombre} (asignado antes)` }) : null,
    ].filter(Boolean));
    campo.value = actual?.id || '';
    campo.addEventListener('change', async () => {
      const elegido = delArea.find((p) => p.id === campo.value) || null;
      // Solo se puede quitar o elegir a alguien del area; «asignado antes» no se reasigna.
      if (campo.value && !elegido) { campo.value = actual?.id || ''; return; }
      campo.disabled = true;
      let res;
      try {
        res = await o.onAsignar({ fecha, recetaId: r.recipe.id, trabajador: aTrabajador(elegido) });
      } catch (error) {
        res = { ok: false, message: error?.message || 'No se pudo guardar el cambio.' };
      }
      const bien = avisar(res, elegido ? `${nombre} asignada a ${elegido.nombre}.` : `${nombre} queda sin asignar.`);
      pintar();
      if (bien) marcarHecho(node.querySelector(selectorItem(r.recipe.id)));
      enfocar(`#${CSS.escape(idCampo)}`, selectorTarjeta(r.recipe.id));
    });
    etiqueta.appendChild(campo);
    return etiqueta;
  }

  // ---- Detalle ----------------------------------------------------------------

  function detalleDe(r, d) {
    const nombre = titleCase(r.recipe.nombre);
    const hoy = hoyLocal();
    const lista = r.estado === 'lista';
    const porHacer = lista ? r.factor : r.pendiente;
    const gramos = materialesEnGramos([{ recipe: r.recipe, factor: porHacer }], d?.lotes || [], fecha);
    const escalada = { componentes: [{ nombre: 'Materiales en gramos', items: gramos.lineas }] };
    const rinde = rendimientoEscalado(r.recipe.nombre, porHacer);
    const varios = escalada.componentes.length > 1;
    const acciones = lista ? accionLista(r, d) : fecha > hoy ? null : accionesPendientes(r, d, nombre);
    const resultados = d ? crearResultados({ datos: d, fecha, recetaId: r.recipe.id, autor: o.persona,
      verCostos: o.verCostos && !propio, onGuardar: o.onGuardarResultado, borradores: borradoresResultado }) : null;

    return el('div', { class: `proy-detalle proy-detalle--${claseArea(r.recipe.categoria)}` }, [
      el('div', { class: 'proy-detalle__cabecera' }, [
        el('h3', { class: 'proy-detalle__titulo', text: nombre, attrs: { tabindex: '-1' } }),
        insigniaEstado(r.estado, r.parcial),
      ]),
      el('p', { class: 'proy-detalle__resumen', text: [
        nombreArea(r.recipe.categoria),
        lista
          ? `${tandas(r.factor)} ${r.factor === 1 ? 'hecha' : 'hechas'}`
          : `${tandas(r.pendiente)} por hacer${r.parcial ? ` (ya se hicieron ${formatQty(r.producido)})` : ''}`,
        rinde ? `salen ${rinde}` : 'sin rendimiento declarado',
      ].join(' · ') }),
      propio && r.preparacion?.asignadoPor
        ? el('p', { class: 'proy-detalle__asignado', text: `Te la asignó ${r.preparacion.asignadoPor.nombre}.` })
        : null,
      !lista && fecha > hoy
        ? el('p', { class: 'proy-detalle__futuro', text: `Se empieza a producir el ${fechaLarga(fecha, false)}.` })
        : null,
      lista && acciones ? el('div', {}, acciones) : null,
      lista ? resultados : null,
      el('h4', { class: 'proy-detalle__subtitulo', text: `Medidas para ${tandas(porHacer)}` }),
      el('p', { class: 'proy-detalle__ayuda', text: 'Cantidades multiplicadas y sumadas en gramos con las equivalencias de Bodega. El recetario conserva sus medidas originales.' }),
      puedeGestionar && o.onRegistrar ? botonAccion('Editar tandas de esta receta', () => o.onRegistrar(r.recipe.categoria, r.recipe.id)) : null,
      ...escalada.componentes.map((c) => el('section', { class: 'proy-detalle__componente' }, [
        varios ? el('h5', { text: titleCase(c.nombre) }) : null,
        el('table', { class: 'prod-tabla' }, [
          el('caption', { class: 'sr-only', text: `Medidas de ${nombre}${varios ? ` · ${titleCase(c.nombre)}` : ''}` }),
          el('thead', {}, [el('tr', {}, ['Ingrediente', 'Cantidad', 'Unidad'].map((t) => el('th', {
            text: t, class: t === 'Cantidad' ? 'prod-tabla__num' : null, attrs: { scope: 'col' },
          })))]),
          el('tbody', {}, c.items.map((i) => el('tr', {}, [
            el('td', { text: `${titleCase(i.ingrediente)}${i.servicio ? ' · Agua de proceso, sin bodega' : ''}` }),
            el('td', { class: 'prod-tabla__num', text: i.cantidad === null ? 'Falta equivalencia' : formatQty(i.cantidad) }),
            el('td', { text: i.unidad }),
          ]))),
        ]),
      ])),
      r.recipe.metodo
        ? el('details', { class: 'proy-detalle__metodo' }, [el('summary', { text: 'Preparación' }), el('p', { text: r.recipe.metodo })])
        : null,
      !lista && acciones ? el('div', { class: 'proy-detalle__acciones' }, acciones) : null,
      lista ? null : resultados,
    ]);
  }

  function accionLista(r, d) {
    const ultima = ultimaConfirmacion(d, r.recipe.id);
    const asignado = r.preparacion?.asignado?.nombre;
    const partes = [
      asignado ? `la sacó ${asignado}` : '',
      ultima?.responsable ? `confirmada por ${ultima.responsable}` : '',
      ultima?.instante ? hora(ultima.instante) : '',
    ].filter(Boolean);
    return [el('p', { class: 'proy-detalle__lista' }, [
      el('strong', { text: 'Lista ✓' }),
      partes.length ? el('span', { text: ` · ${partes.join(' · ')}` }) : null,
    ])];
  }

  function accionesPendientes(r, d, nombre) {
    const id = r.recipe.id;
    if (r.estado === 'pendiente') {
      const empezar = botonAccion('Empezar a producir', () => conEspera(empezar, async () => {
        const res = await llamar(o.onIniciar, { fecha, recetaId: id });
        const bien = avisar(res, `${nombre} en preparación.`);
        pintar();
        if (bien) {
          // No repite el estado, que ya cambió en la tarjeta: dice que se guardó.
          marcarHecho(node.querySelector(selectorItem(id)), 'Empezada ✓');
          enfocar('.proy-detalle__confirmar', '.proy-detalle__acciones [data-paso="despues"]', '.proy-detalle__titulo');
        } else {
          enfocar('.proy-detalle__empezar', selectorTarjeta(id));
        }
      }), { clase: 'btn btn--primary proy-detalle__empezar', dibujo: ICON_PROYECTAR, etiqueta: `Empezar a producir: ${nombre}` });
      return [empezar];
    }

    // En preparacion: la cuenta de bodega y la revision se toman al pintar, que
    // es lo que la persona tiene delante al decidir.
    const costeo = d ? costeoPendiente(d, fecha, { recetaId: id }) : null;
    const revision = d?.planes.find((p) => p.fecha === fecha)?.revision;
    const faltan = costeo ? costeo.lineas.filter((l) => l.faltante > 0 || l.estado !== 'ok') : [];

    if (preguntando === id && costeo && !faltan.length) {
      const costo = o.verCostos && !propio ? ` (${pesos(costeo.costoTotal)})` : '';
      const si = botonAccion('Sí, descontar de bodega', () => conEspera(si, () => confirmar(r, nombre, { revision, costeo })), {
        clase: 'btn btn--primary proy-detalle__si', dibujo: ICON_LISTO,
      });
      return [el('div', { class: 'proy-detalle__pregunta', attrs: { role: 'group', 'aria-label': 'Confirmar preparación' } }, [
        el('p', { text: `¿${nombre} ya está lista?` }),
        el('p', { text: `Se descuentan de bodega los ingredientes de ${tandas(r.pendiente)}${costo}. No se puede deshacer.` }),
        si,
        botonAccion('Todavía no', () => {
          preguntando = null;
          pintar();
          enfocar('.proy-detalle__confirmar', '.proy-detalle__titulo');
        }, { clase: 'btn btn--quiet', dataset: { paso: 'todavia' } }),
      ])];
    }

    const nodos = [
      botonAccion('Marcar lista', () => {
        preguntando = id;
        pintar();
        enfocar('.proy-detalle__si', '.proy-detalle__titulo');
      }, {
        clase: 'btn btn--primary proy-detalle__confirmar', dibujo: ICON_LISTO,
        etiqueta: `Marcar lista: ${nombre}`, disabled: !costeo || faltan.length > 0,
      }),
    ];
    const despues = botonAccion('Dejar para después', () => conEspera(despues, async () => {
      const res = await llamar(o.onCancelar, { fecha, recetaId: id });
      const bien = avisar(res, `${nombre} vuelve a pendiente.`);
      if (bien) preguntando = null;
      pintar();
      if (bien) enfocar('.proy-detalle__empezar', selectorTarjeta(id));
      else enfocar('.proy-detalle__acciones [data-paso="despues"]', selectorTarjeta(id));
    }), { clase: 'btn btn--quiet', dataset: { paso: 'despues' }, etiqueta: `Dejar para después: ${nombre}` });
    nodos.push(despues);

    if (faltan.length) {
      nodos.push(el('div', { class: 'proy-detalle__faltan', attrs: { role: 'alert' } }, [
        el('p', { text: 'No se puede marcar lista: en bodega falta:' }),
        el('ul', {}, faltan.map((l) => el('li', { text: l.estado === 'sin_conversion'
          ? `${titleCase(l.ingrediente)}: ${l.motivo}` : l.estado === 'sin_precio' && !l.disponible
          ? `${titleCase(l.ingrediente)}: no hay compras disponibles`
          : `${titleCase(l.ingrediente)}: faltan ${formatQty(l.faltante)} ${l.unidad}` }))),
        puedeGestionar
          ? el('p', { text: 'Revisa compras y equivalencias en Bodega; si falta cantidad, puedes bajar las tandas.' })
          : el('p', { text: 'Avísale a tu jefe para revisar la bodega y las equivalencias.' }),
        puedeGestionar && o.onBodega
          ? botonAccion('Ir a Bodega', () => o.onBodega(), { clase: 'btn btn--quiet', dibujo: ICON_ALMACEN })
          : null,
        // La otra salida: sacar menos de lo que no alcanza.
        puedeGestionar && o.onRegistrar
          ? botonAccion('Cambiar tandas', () => o.onRegistrar(r.recipe.categoria, r.recipe.id), { clase: 'btn btn--quiet' })
          : null,
      ]));
    }
    return nodos;
  }

  async function confirmar(r, nombre, { revision, costeo }) {
    const id = r.recipe.id;
    const res = await llamar(o.onConfirmar, { fecha, recetaId: id, revision, costeo });
    preguntando = null;
    if (!res?.ok) {
      avisar(res);
      pintar();
      enfocar('.proy-detalle__confirmar', '.proy-detalle__acciones [data-paso="despues"]', '.proy-detalle__titulo');
      return;
    }
    retenidas.add(id);
    const quedan = recetas().filter((x) => x.estado !== 'lista');
    let texto = `${nombre} lista. Se descontó de bodega. Registra lo que salió en Resultado real.`;
    if (!quedan.length) texto += propio ? ' Terminaste lo de este día.' : ` ${nombreArea(area)}: todo listo.`;
    estado.textContent = texto;
    announce(texto, 'polite');
    pintar();
    marcarHecho(node.querySelector(selectorItem(id)), 'Lista ✓');
    const siguiente = ordenadas(quedan)[0];
    enfocar(siguiente ? selectorTarjeta(siguiente.recipe.id) : null, '.proy-detalle__titulo');
  }

  /** Un fallo inesperado del caso de uso se trata como cualquier otro error. */
  async function llamar(accion, solicitud) {
    try {
      return await accion(solicitud);
    } catch (error) {
      return { ok: false, message: error?.message || 'No se pudo guardar el cambio.' };
    }
  }

  // ---- Pintado ----------------------------------------------------------------

  function pintar() {
    const acordeon = !dosColumnas();
    const d = datos();
    const todasDelDia = d && !propio ? recetasDelDia(d, fecha) : [];
    const todas = recetas();

    textoFecha.textContent = [fechaLarga(fecha), propio ? o.persona.nombre : ''].filter(Boolean).join(' · ');
    node.dataset.area = propio ? '' : claseArea(area);
    node.classList.toggle('proy--acordeon', acordeon);

    pintarControles(todasDelDia);
    pintarMisNotas(d);
    pintarAviso(todas);
    pintarLote(todas);
    pintarLista(todas, acordeon);

    clear(columnas);
    columnas.appendChild(lista);
    clear(detalleLateral);
    if (!acordeon) {
      const r = elegida ? todas.find((x) => x.recipe.id === elegida) : null;
      if (r) detalleLateral.appendChild(detalleDe(r, d));
      columnas.appendChild(detalleLateral);
    }
  }

  pintar();
  queueMicrotask(() => asegurarEquipo());
  return { node, enfocar: () => titulo.focus() };
}

/** «Sin conexión.» → «sin conexión», para leerlo dentro de una frase. */
function motivo(mensaje) {
  const limpio = String(mensaje || 'error desconocido').trim().replace(/\.$/, '');
  return limpio.charAt(0).toLowerCase() + limpio.slice(1);
}

function hora(instante) {
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' }).format(new Date(instante));
}
