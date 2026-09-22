/**
 * =============================================================================
 *  PANEL DEL DIA
 * =============================================================================
 *
 *  Lo que se hace con el dia elegido en el calendario, en el orden en que se
 *  mira (PROD-003):
 *
 *    1. Como va: «Producción del día», una fila por area con su avance. Cada
 *       fila abre Proyectar en esa area; un area sin recetas es solo texto.
 *    2. Que se hace: Sacar producción · Materiales · Costos, y
 *       Registrar producción → tres botones, uno por area.
 *    3. Notas: Tarea, Pendiente, Recomendación o Felicitación y su lista, con
 *       marcar hecha, editar y borrar.
 *
 *  UN SOLO BOTON PRINCIPAL. Si el dia tiene recetas y ya llego, lo que toca es
 *  producir (Proyectar); si no, planear (Registrar). Dos naranjas a la vez era
 *  lo que hacia dudar «¿cual uso?».
 *
 *  Un dia pasado con recetas sin confirmar lo dice arriba: la bodega no se
 *  desconto y el costo del periodo sale corto hasta que alguien lo revise.
 *
 *  No hay «cerrar»: siempre hay un dia elegido. Cada accion guarda al instante
 *  y el autor es la persona de la sesion.
 *
 *  El estado de la interfaz (que formulario esta abierto) vive en `ui`, que
 *  pasa quien pinta: el panel se reconstruye tras cada cambio y no debe
 *  olvidar lo que la persona estaba haciendo.
 */

import { el, icon } from '../../lib/dom.js';
import { announce } from '../../lib/a11y.js';
import {
  ICON_TAREA, ICON_PENDIENTE, ICON_RECOMENDACION, ICON_FELICITACION, ICON_PLAN,
  ICON_EDITAR, ICON_ELIMINAR, ICON_PROYECTAR, ICON_MATERIALES, ICON_COSTOS,
} from '../../lib/iconos.js';
import { hoyLocal } from '../../core/bitacora.js';
import { festivo, fechaLarga } from '../../core/calendario.js';
import { resumenDelDia } from '../../core/preparacion.js';
import { TIPOS_NOTA, LARGO_MAXIMO_NOTA } from '../../core/notas.js';
import { AREAS, botonAccion, claseArea, nombreArea, selector, vacio } from './comun.js';

const ICONO_NOTA = {
  tarea: ICON_TAREA, pendiente: ICON_PENDIENTE, recomendacion: ICON_RECOMENDACION, felicitacion: ICON_FELICITACION,
};

/** Como se nombra cada tipo en el formulario: el genero cambia el articulo. */
const FORMULARIO_NOTA = {
  tarea: { nueva: 'Nueva tarea', pregunta: '¿Qué hay que hacer?' },
  pendiente: { nueva: 'Nuevo pendiente', pregunta: '¿Qué quedó pendiente?' },
  recomendacion: { nueva: 'Nueva recomendación', pregunta: '¿Qué recomiendas?' },
  felicitacion: { nueva: 'Nueva felicitación', pregunta: '¿A quién y por qué?' },
};

const RESUMEN_VACIO = Object.freeze({ recetas: 0, listas: 0, porArea: [], notas: [] });

/**
 * Los motivos de siempre, de un toque. El nucleo exige motivo para eliminar y
 * en una tableta escribirlo cada vez acaba en «xx»: estos dejan el historial
 * legible. «Otro…» abre el campo para lo que no esta en la lista.
 */
const MOTIVOS_BORRADO = ['Se cargó por error', 'Cambió el plan', 'Hoy no se produce'];
const OTRO_MOTIVO = 'Otro…';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * @param {object} o
 * @param {string} o.fecha
 * @param {object|null} o.datos
 * @param {{modo: null|'areas'|'nota', tipo?: string, nota?: object, borrar?: string, aviso?: string,
 *   borrador?: {texto: string, area: string, persona?: object|null, eligiendo?: boolean},
 *   equipo?: {estado: string, lista: object[], mensaje: string},
 *   eliminar?: {motivo: string, otro: string}|null, abrir?: boolean, error?: string}} o.ui estado de la
 *   interfaz. `aviso` es un error que tiene que verse despues de repintar; `borrador`, lo escrito a
 *   medias; `error`, lo que falta en el formulario; `equipo`, la lista pedida al pulsar
 *   «Una persona…»; `eliminar`, la confirmacion de borrado abierta.
 * @param {boolean} [o.nuevo] el dia acaba de cambiar (para la entrada del panel)
 * @param {(ui: object) => void} o.onUi pide repintar con otro estado de interfaz
 * @param {(area: string) => void} o.onArea abre el registro de un area
 * @param {(vista: string, extra?: object) => void} o.onVista abre Proyectar, Materiales o Costos para este dia
 * @param {(solicitud: object) => Promise<object>} o.onGuardarNota
 * @param {(solicitud: object) => Promise<object>} o.onEliminarNota
 * @param {((o?: {forzar?: boolean}) => Promise<void>)} [o.onCargarEquipo] pide la lista del equipo
 *   para dirigir una nota a una persona. Solo se llama al pulsar «Una persona…».
 * @param {((solicitud: {motivo: string}) => Promise<object>)} [o.onEliminarProduccion] elimina el
 *   plan del dia. Sin ella no se ofrece: es del jefe de obrador en adelante.
 * @param {boolean} o.verCostos
 */
export function renderDia(o) {
  const { fecha, datos, ui } = o;
  const hoy = hoyLocal();
  const nombreFestivo = festivo(fecha);
  const resumen = datos ? resumenDelDia(datos, fecha) : RESUMEN_VACIO;
  const sinConfirmar = fecha < hoy ? resumen.recetas - resumen.listas : 0;
  // Se mira la misma senal que mira el nucleo al eliminar: si hay produccion
  // confirmada, el dia no se borra y su costo se queda en el historial.
  const yaProducido = Boolean(datos?.ejecuciones?.some((e) => e.fecha === fecha));
  // Con recetas y el dia ya llegado, lo principal es producir; si no, planear.
  const producir = resumen.recetas > 0 && fecha <= hoy;

  // El panel se reconstruye despues de cada accion: un error que se escribiera
  // en el `estado` de antes se perderia con el. Viaja en `ui.aviso`.
  const estado = el('p', { class: `dia__estado${ui.aviso ? ' dia__estado--error' : ''}`, attrs: { role: 'status' }, text: ui.aviso || '' });
  const fallo = (r, siguiente) => {
    announce(r.message, 'assertive');
    o.onUi({ ...siguiente, aviso: r.message });
  };

  const etiqueta = fecha === hoy ? 'Hoy' : fecha < hoy ? 'Ya pasó' : 'Aún no llega';

  return el('aside', { class: `dia${o.nuevo ? ' dia--nuevo' : ''}`, attrs: { 'aria-labelledby': 'dia-titulo' } }, [
    el('header', { class: 'dia__cabecera' }, [
      el('h2', { class: 'dia__titulo', id: 'dia-titulo', text: fechaLarga(fecha), attrs: { tabindex: '-1' } }),
      el('p', { class: 'dia__etiqueta', text: etiqueta }),
      nombreFestivo ? el('p', { class: 'dia__festivo', text: `Festivo: ${nombreFestivo}` }) : null,
    ]),
    estado,
    sinConfirmar ? atrasado() : null,
    produccion(),
    notas(),
  ]);

  function atrasado() {
    return el('div', { class: 'dia__atrasado', attrs: { role: 'note' } }, [
      el('p', { text: `⚠ ${plural(sinConfirmar, 'receta quedó', 'recetas quedaron')} sin confirmar: la bodega no se ha descontado.` }),
      botonAccion('Revisar lo que falta', () => o.onVista('proyectar', { area: primeraAtrasada() })),
    ]);
  }

  /** El area de la primera receta pendiente, para abrir Proyectar justo ahi. */
  function primeraAtrasada() {
    return resumen.porArea.find((a) => a.listas < a.total)?.area;
  }

  function produccion() {
    const bloque = el('section', { class: 'dia__bloque dia__bloque--produccion', attrs: { 'aria-labelledby': 'dia-produccion' } }, [
      el('h3', { class: 'dia__subtitulo', id: 'dia-produccion', text: 'Producción del día' }),
    ]);
    if (!resumen.recetas) {
      bloque.appendChild(vacio({ clase: 'dia__vacio', texto: 'Nada registrado todavía. Elige un área en «Registrar producción» para empezar.' }));
    } else {
      bloque.appendChild(el('ul', { class: 'dia__lista dia__lista--areas' }, AREAS.map((area) => el('li', {}, [filaArea(area)]))));
      bloque.appendChild(el('div', { class: 'dia__atajos' }, [
        botonAccion('Sacar producción', () => o.onVista('proyectar'), {
          clase: `btn ${producir ? 'btn--primary' : 'btn--quiet'} dia__proyectar`, dibujo: ICON_PROYECTAR,
        }),
        botonAccion('Materiales', () => o.onVista('materiales'), { dibujo: ICON_MATERIALES }),
        botonAccion('Resultados', () => o.onVista('resultados')),
        o.verCostos ? botonAccion('Costos', () => o.onVista('costos'), { dibujo: ICON_COSTOS }) : null,
      ].filter(Boolean)));
    }
    // El repintado se lleva el boton pulsado: el foco vuelve al mismo boton ya
    // pintado, para que el lector oiga su `aria-expanded` nuevo.
    bloque.appendChild(botonAccion('Registrar producción', () => o.onUi({ modo: ui.modo === 'areas' ? null : 'areas', enfocar: 'dia-registrar' }), {
      clase: `btn ${producir ? 'btn--quiet' : 'btn--primary'} dia__accion dia__accion--produccion`, dibujo: ICON_PLAN,
      attrs: { 'aria-expanded': String(ui.modo === 'areas') }, dataset: { foco: 'dia-registrar' },
    }));
    if (ui.modo === 'areas') bloque.appendChild(areas());
    if (resumen.recetas && o.onEliminarProduccion) bloque.appendChild(borrado());
    return bloque;
  }

  /**
   * Eliminar lo cargado en el dia.
   *
   * Con produccion confirmada NO se ofrece el boton: el nucleo lo rechazaria y
   * un boton que falla es peor que no tenerlo. En su lugar se dice que solo se
   * pueden quitar las recetas que falten, con el atajo a Registrar.
   */
  function borrado() {
    if (yaProducido) {
      return el('p', { class: 'dia__borrado-no' }, [
        el('span', { text: 'Este día ya tiene producción confirmada: no se puede eliminar. Quita solo las recetas que falten.' }),
        botonAccion('Quitar recetas', () => o.onUi({ modo: 'areas', enfocar: 'dia-registrar' }), { clase: 'btn btn--quiet' }),
      ]);
    }
    if (!ui.eliminar) {
      return el('div', { class: 'dia__borrado' }, [
        botonAccion('Eliminar la producción del día', () => o.onUi({ ...ui, eliminar: { motivo: '', otro: '' }, enfocar: 'dia-eliminar-si' }),
          { clase: 'btn btn--quiet dia__borrar', dibujo: ICON_ELIMINAR, dataset: { foco: 'dia-eliminar' } }),
      ]);
    }
    return confirmacionBorrado();
  }

  /**
   * La confirmacion se pinta sola, sin pasar por `onUi`: asi elegir el motivo no
   * reconstruye el panel entero ni borra lo que se escribio en «Otro…».
   */
  function confirmacionBorrado() {
    const caja = el('div', { class: 'dia__eliminar', attrs: { role: 'group', 'aria-label': 'Eliminar la producción del día' } });
    const cuenta = plural(resumen.recetas, 'receta', 'recetas');
    const motivoFinal = () => (ui.eliminar.motivo === OTRO_MOTIVO ? String(ui.eliminar.otro || '').trim() : ui.eliminar.motivo);

    const pintar = () => {
      const otro = el('input', { type: 'text', class: 'field dia__eliminar-otro', id: 'dia-eliminar-otro',
        value: ui.eliminar.otro || '', maxLength: 120,
        attrs: { 'aria-label': 'Escribe el motivo de la eliminación', placeholder: 'Escribe el motivo' },
        on: { input: () => { ui.eliminar.otro = otro.value; confirmar.disabled = !motivoFinal(); } } });
      const confirmar = el('button', { type: 'button', class: 'btn btn--danger', text: 'Sí, eliminar',
        disabled: !motivoFinal(), dataset: { foco: 'dia-eliminar-si' },
        on: { click: async (e) => {
          e.currentTarget.disabled = true;
          const r = await o.onEliminarProduccion({ motivo: motivoFinal() });
          if (!r.ok) { fallo(r, { ...ui, eliminar: null, enfocar: 'dia-titulo' }); return; }
          announce('Producción del día eliminada.');
          o.onUi({ modo: null, enfocar: 'dia-titulo' });
        } } });
      caja.replaceChildren(
        el('p', { class: 'dia__eliminar-pregunta',
          text: `¿Eliminar toda la producción de este día? Se ${resumen.recetas === 1 ? 'va' : 'van'} ${cuenta}.` }),
        selector({
          etiqueta: 'Motivo', valor: ui.eliminar.motivo,
          opciones: [...MOTIVOS_BORRADO, OTRO_MOTIVO].map((m) => [m, m]),
          onCambio: (valor) => {
            ui.eliminar.motivo = valor;
            pintar();
            (caja.querySelector('#dia-eliminar-otro') && valor === OTRO_MOTIVO
              ? caja.querySelector('#dia-eliminar-otro')
              : caja.querySelector('[aria-pressed="true"]'))?.focus();
          },
        }),
        ui.eliminar.motivo === OTRO_MOTIVO ? otro : null,
        el('p', { class: 'dia__eliminar-nota', text: 'Queda en el historial con tu nombre y el motivo. No se puede deshacer.' }),
        el('div', { class: 'dia__eliminar-botones' }, [
          confirmar,
          el('button', { type: 'button', class: 'btn btn--quiet', text: 'Cancelar',
            on: { click: () => o.onUi({ ...ui, eliminar: null, enfocar: 'dia-eliminar' }) } }),
        ]),
      );
    };
    pintar();
    return caja;
  }

  function filaArea(area) {
    const r = resumen.porArea.find((a) => a.area === area);
    const clase = `dia__area dia__area--${claseArea(area)}`;
    if (!r) {
      return el('div', { class: `${clase} dia__area--vacia` }, [
        el('span', { class: 'dia__area-nombre', text: nombreArea(area) }),
        el('span', { class: 'dia__area-cuenta', text: 'Sin recetas' }),
      ]);
    }
    const completa = r.listas === r.total;
    const cuenta = `${r.listas} de ${r.total} ${r.total === 1 ? 'lista' : 'listas'}${completa ? ' ✓' : ''}${r.enCurso ? ` · ${r.enCurso} en preparación` : ''}`;
    return el('button', {
      type: 'button', class: clase,
      attrs: { 'aria-label': `${nombreArea(area)}: ${r.listas} de ${r.total} ${r.total === 1 ? 'lista' : 'listas'}${r.enCurso ? `, ${r.enCurso} en preparación` : ''}. Abrir para sacar la producción` },
      on: { click: () => o.onVista('proyectar', { area }) },
    }, [
      el('span', { class: 'dia__area-nombre', text: nombreArea(area) }),
      el('span', { class: 'dia__area-cuenta', text: cuenta }),
      el('span', { class: 'dia__area-avance', style: { '--avance': `${Math.round((r.listas / r.total) * 100)}%` }, attrs: { 'aria-hidden': 'true' } }),
    ]);
  }

  function areas() {
    return el('div', { class: 'dia__areas', attrs: { role: 'group', 'aria-label': 'Elige el área para registrar' } }, AREAS.map((area) => {
      const r = resumen.porArea.find((a) => a.area === area);
      return el('button', {
        type: 'button', class: `area-btn area-btn--${claseArea(area)}`,
        on: { click: () => o.onArea(area) },
      }, [
        el('span', { class: 'area-btn__nombre', text: nombreArea(area) }),
        el('span', { class: 'area-btn__cuenta', text: r ? plural(r.total, 'receta', 'recetas') : 'Sin recetas' }),
      ]);
    }));
  }

  function notas() {
    const acciones = el('div', { class: 'dia__acciones', attrs: { role: 'group', 'aria-label': 'Nueva nota' } },
      Object.entries(TIPOS_NOTA).map(([tipo, t]) => {
        const abierto = ui.modo === 'nota' && !ui.nota && ui.tipo === tipo;
        return botonAccion(t.nombre, () => o.onUi(abierto
          // `aria-pressed` promete alternar: pulsarlo otra vez cierra.
          ? { modo: null, enfocar: `nota-${tipo}` }
          // Reabrir el mismo formulario no puede borrar lo que se estaba escribiendo.
          : { ...ui, modo: 'nota', tipo, nota: null, abrir: true, error: '', enfocar: null }), {
          clase: `btn btn--quiet dia__accion dia__accion--${tipo}`, dibujo: ICONO_NOTA[tipo],
          attrs: { 'aria-pressed': String(abierto) }, dataset: { foco: `nota-${tipo}` },
        });
      }));
    const bloque = el('section', { class: 'dia__bloque dia__bloque--notas', attrs: { 'aria-labelledby': 'dia-notas' } }, [
      el('h3', { class: 'dia__subtitulo', id: 'dia-notas', text: 'Notas' }),
      acciones,
      ui.modo === 'nota' ? formularioNota() : null,
    ]);
    if (!resumen.notas.length) {
      bloque.appendChild(el('p', { class: 'dia__vacio-notas', text: 'Sin notas este día.' }));
      return bloque;
    }
    bloque.appendChild(el('ul', { class: 'dia__lista dia__lista--notas' }, resumen.notas.map(nota)));
    return bloque;
  }

  function formularioNota() {
    const editando = ui.nota || null;
    const tipo = editando ? editando.tipo : ui.tipo;
    const textos = FORMULARIO_NOTA[tipo];
    // Lo escrito a medias sobrevive si otra accion del panel lo repinta.
    ui.borrador = ui.borrador || { texto: editando ? editando.texto : '', area: editando?.area || '',
      persona: editando?.persona || null, eligiendo: Boolean(editando?.persona) };
    const texto = el('textarea', { class: 'field dia__texto', id: 'dia-nota-texto', rows: 3,
      maxLength: LARGO_MAXIMO_NOTA, value: ui.borrador.texto,
      attrs: { 'aria-describedby': ui.error ? 'dia-nota-error' : null, 'aria-invalid': ui.error ? 'true' : null },
      on: { input: () => { ui.borrador.texto = texto.value; } } });
    const cuenta = el('small', { class: 'dia__cuenta', attrs: { 'aria-hidden': 'true' } });
    const contar = () => { cuenta.textContent = `${texto.value.length} / ${LARGO_MAXIMO_NOTA}`; };
    texto.addEventListener('input', contar);
    contar();

    // «Para» con botones: un toque en vez de abrir una lista. La ultima opcion
    // abre el equipo, que solo se pide al servidor cuando alguien la pulsa: casi
    // todas las notas son para el equipo o para un area.
    const para = el('div', { class: 'dia__para' });
    const pintarPara = () => {
      const destino = ui.borrador.persona || ui.borrador.eligiendo ? 'persona' : ui.borrador.area;
      para.replaceChildren(selector({
        etiqueta: 'Para', valor: destino,
        opciones: [['', 'Todo el equipo'], ...AREAS.map((a) => [a, nombreArea(a)]),
          ...(o.onCargarEquipo ? [['persona', 'Una persona…']] : [])],
        onCambio: (valor) => {
          if (valor === 'persona') {
            // Un area y una persona a la vez no existe: el nucleo lo rechaza.
            ui.borrador.area = '';
            ui.borrador.eligiendo = true;
            if (!ui.equipo || ui.equipo.estado === 'sin_cargar') { o.onCargarEquipo(); return; }
          } else {
            ui.borrador.area = valor;
            ui.borrador.persona = null;
            ui.borrador.eligiendo = false;
          }
          pintarPara();
          para.querySelector('[aria-pressed="true"]')?.focus();
        },
      }));
      // Mientras se pide el equipo, el panel se repinta: el foco vuelve aqui, al
      // boton que se acaba de pulsar, y no al campo del texto.
      const opcion = para.querySelector('[data-opcion="persona"]');
      if (opcion) opcion.dataset.foco = 'dia-nota-para';
      if (ui.borrador.eligiendo) para.appendChild(personas());
    };
    pintarPara();

    /** El equipo, solo cuando se pide. Mismos estados que la pantalla «Equipo». */
    function personas() {
      const equipo = ui.equipo || { estado: 'cargando', lista: [], mensaje: '' };
      const caja = el('div', { class: 'dia__personas', attrs: { role: 'group', 'aria-label': 'Para quién es la nota' } });
      if (equipo.estado === 'cargando' || equipo.estado === 'sin_cargar') {
        caja.appendChild(el('p', { class: 'dia__equipo', attrs: { role: 'status' }, text: 'Cargando el equipo…' }));
        return caja;
      }
      if (equipo.estado === 'error') {
        caja.appendChild(el('p', { class: 'dia__equipo dia__equipo--error', text: `No se pudo cargar el equipo: ${equipo.mensaje}` }));
        caja.appendChild(el('button', { type: 'button', class: 'btn btn--quiet', text: 'Volver a intentar',
          dataset: { foco: 'dia-equipo-reintentar' }, on: { click: () => o.onCargarEquipo({ forzar: true }) } }));
        return caja;
      }
      if (!equipo.lista.length) {
        caja.appendChild(el('p', { class: 'dia__equipo', text: 'Nadie del equipo tiene área asignada todavía.' }));
        return caja;
      }
      equipo.lista.forEach((p, i) => {
        const elegida = ui.borrador.persona?.id === p.id;
        caja.appendChild(el('button', {
          type: 'button', class: 'dia__persona', text: p.nombre,
          attrs: { 'aria-pressed': String(elegida), 'aria-label': `Para ${p.nombre}${p.area ? `, ${nombreArea(p.area)}` : ''}` },
          dataset: i === 0 ? { persona: p.id, foco: 'dia-personas' } : { persona: p.id },
          on: { click: () => {
            ui.borrador.persona = elegida ? null : { id: p.id, nombre: p.nombre, codigo: p.codigo ?? '' };
            pintarPara();
            para.querySelector(`[data-persona="${CSS.escape(p.id)}"]`)?.focus();
          } },
        }));
      });
      return caja;
    }

    const nombreTipo = TIPOS_NOTA[tipo].nombre.toLowerCase();
    const guardar = el('button', { type: 'submit', class: 'btn btn--primary', text: editando ? 'Guardar cambios' : `Guardar ${nombreTipo}` });
    const formulario = el('form', { class: `dia__formulario dia__formulario--${tipo}`,
      attrs: { 'aria-label': editando ? `Editar ${nombreTipo}` : textos.nueva, novalidate: true },
      on: { submit: async (evento) => {
        evento.preventDefault();
        // Se valida al pulsar y se dice junto al campo: un boton desactivado no explica nada.
        if (!texto.value.trim()) {
          o.onUi({ ...ui, error: 'Escribe la nota antes de guardar.', enfocar: 'dia-nota-texto' });
          return;
        }
        guardar.disabled = true;
        const r = await o.onGuardarNota({
          ...(editando ? { id: editando.id, revision: editando.revision, hecha: editando.hecha } : {}),
          fecha, tipo, texto: texto.value,
          area: ui.borrador.persona ? null : ui.borrador.area || null,
          persona: ui.borrador.persona || null,
        });
        if (!r.ok) { fallo(r, { ...ui, error: '', enfocar: 'dia-nota-texto' }); return; }
        announce(editando ? 'Nota actualizada.' : `${TIPOS_NOTA[tipo].nombre} guardada.`);
        o.onUi({ modo: null, enfocar: `nota-${r.value.id}` });
      } } }, [
      el('p', { class: 'dia__formulario-titulo' }, [icon(ICONO_NOTA[tipo]),
        el('span', { text: editando ? `Editar ${nombreTipo}` : textos.nueva })]),
      el('label', { for: 'dia-nota-texto', class: 'dia__campo' }, [el('span', { text: textos.pregunta }), texto, cuenta]),
      ui.error ? el('p', { class: 'dia__error', id: 'dia-nota-error', text: ui.error }) : null,
      para,
      el('div', { class: 'dia__botones' }, [
        guardar,
        el('button', { type: 'button', class: 'btn btn--quiet', text: 'Cancelar', on: { click: () => o.onUi({ modo: null, enfocar: 'dia-titulo' }) } }),
      ]),
    ]);
    // El foco entra en el texto SOLO al abrir el formulario: si el repintado lo
    // provoca otra accion (marcar hecha, borrar), el foco es de esa accion.
    if (ui.abrir) {
      ui.abrir = false;
      queueMicrotask(() => { if (formulario.isConnected) texto.focus(); });
    }
    return formulario;
  }

  function nota(n) {
    const t = TIPOS_NOTA[n.tipo];
    const confirmando = ui.borrar === n.id;
    const item = el('li', { class: `nota nota--${n.tipo}${n.hecha ? ' nota--hecha' : ''}`, id: `nota-${n.id}`, attrs: { tabindex: '-1' } }, [
      el('div', { class: 'nota__cabecera' }, [
        el('span', { class: 'nota__tipo' }, [icon(ICONO_NOTA[n.tipo]), el('span', { text: t.nombre })]),
        n.area ? el('span', { class: `nota__area nota__area--${claseArea(n.area)}`, text: nombreArea(n.area) }) : null,
        n.persona ? el('span', { class: 'nota__persona', text: `Para: ${n.persona.nombre}` }) : null,
      ]),
      el('p', { class: 'nota__texto', text: n.texto }),
      el('p', { class: 'nota__autor', text: [n.autor.nombre, n.cambiadaPor ? `cambiada por ${n.cambiadaPor.nombre}` : '',
        n.hecha ? 'hecha' : ''].filter(Boolean).join(' · ') }),
      el('div', { class: 'nota__acciones' }, confirmando ? [
        el('span', { class: 'nota__pregunta', text: '¿Borrar esta nota? No se puede recuperar.' }),
        el('button', { type: 'button', class: 'btn btn--danger', text: 'Sí, borrar', on: { click: async (e) => {
          e.currentTarget.disabled = true;
          const r = await o.onEliminarNota({ id: n.id, revision: n.revision });
          if (!r.ok) { fallo(r, { ...ui, borrar: null, enfocar: `nota-${n.id}` }); return; }
          announce('Nota borrada.');
          o.onUi({ modo: null, enfocar: 'dia-titulo' });
        } } }),
        el('button', { type: 'button', class: 'btn btn--quiet', text: 'No', on: { click: () => o.onUi({ ...ui, borrar: null, enfocar: `nota-${n.id}` }) } }),
      ] : [
        t.seCumple ? el('label', { class: 'nota__hecha' }, [
          el('input', { type: 'checkbox', checked: n.hecha, attrs: { 'aria-label': `Marcar como hecha: ${n.texto}` },
            on: { change: async (e) => {
              const marcado = e.currentTarget.checked;
              // Se reenvia la nota entera: si se omitiera `persona`, marcarla
              // hecha la devolveria a todo el equipo.
              const r = await o.onGuardarNota({ id: n.id, revision: n.revision, fecha: n.fecha, tipo: n.tipo,
                texto: n.texto, area: n.area, persona: n.persona || null, hecha: marcado });
              if (!r.ok) { fallo(r, { ...ui, enfocar: `hecha-${n.id}` }); return; }
              announce(marcado ? 'Marcada como hecha.' : 'Marcada como no hecha.');
              o.onUi({ ...ui, aviso: '', enfocar: `hecha-${n.id}` });
            } }, dataset: { foco: `hecha-${n.id}` } }),
          el('span', { text: 'Hecha' }),
        ]) : null,
        el('button', { type: 'button', class: 'btn btn--quiet nota__boton', attrs: { 'aria-label': `Editar: ${n.texto}` },
          on: { click: () => o.onUi({ modo: 'nota', nota: n, abrir: true }) } }, [icon(ICON_EDITAR)]),
        el('button', { type: 'button', class: 'btn btn--quiet nota__boton', attrs: { 'aria-label': `Borrar: ${n.texto}` },
          on: { click: () => o.onUi({ ...ui, borrar: n.id, enfocar: `borrar-${n.id}` }) } }, [icon(ICON_ELIMINAR)]),
      ].filter(Boolean)),
    ]);
    if (confirmando) item.querySelector('.btn--danger').dataset.foco = `borrar-${n.id}`;
    return item;
  }
}
