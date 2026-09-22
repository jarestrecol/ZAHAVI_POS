/**
 * =============================================================================
 *  CALENDARIO MENSUAL
 * =============================================================================
 *
 *  La rejilla del mes, de lunes a domingo, como un calendario de pared: cada
 *  dia enseña su festivo, una ficha por area con su avance («Panadería 1/3») y
 *  las notas del dia. Pulsar un dia lo elige; lo que se hace con el dia vive en
 *  el panel (`dia.js`).
 *
 *  LO QUE DICE UNA CELDA (PROD-003)
 *    - Area: «Panadería 1/3» con relleno de avance; «✓» si todo esta listo y
 *      «!» si el dia ya paso con recetas sin confirmar (la bodega no se
 *      desconto). Nunca solo color.
 *    - Notas: una por una si caben con las areas en `FICHAS_VISIBLES`; si no,
 *      una sola ficha «✎ N notas». Ya no hay «+N más» que esconda un area.
 *    - En el celular no caben fichas: la celda dice la cifra de recetas, la
 *      marca (✓ o !) y un punto si hay notas (`.cal__resumen`).
 *
 *  TECLADO: flechas mueven el dia (arriba/abajo, una semana), Inicio y Fin van
 *  al lunes y al domingo, Re Pág y Av Pág cambian de mes. Solo el dia elegido
 *  esta en el recorrido del tabulador (tabindex movil), como pide el patron de
 *  rejilla: si no, cruzar el mes costaria 42 tabulaciones.
 *
 *  Solo lee. Los datos llegan en cada pintado por `leerDatos`.
 */

import { el, clear } from '../../lib/dom.js';
import {
  semanasDelMes, festivo, nombreMes, fechaLarga, mesDe, sumarMeses, DIAS_SEMANA, esFinDeSemana,
} from '../../core/calendario.js';
import { sumarDias, semanaDe } from '../../core/bitacora.js';
import { resumenDelDia } from '../../core/preparacion.js';
import { TIPOS_NOTA } from '../../core/notas.js';
import { claseArea, nombreArea } from './comun.js';

/** Fichas que caben en una celda de escritorio sin crecer. */
const FICHAS_VISIBLES = 3;

const RESUMEN_VACIO = Object.freeze({ recetas: 0, listas: 0, porArea: [], notas: [] });

/**
 * @param {object} options
 * @param {string} options.hoy
 * @param {string} options.seleccion dia elegido al empezar
 * @param {() => object|null} options.leerDatos documento de operacion, o null
 * @param {(fecha: string, como: {origen: 'clic'|'teclado'|'hoy'}) => void} options.onElegir
 * @param {Node} [options.acciones] botones que van a la derecha de la barra del mes
 */
export function renderCalendario(options) {
  let seleccion = options.seleccion;
  let mes = mesDe(seleccion);
  const tituloId = 'cal-titulo';
  const titulo = el('h2', { class: 'cal__mes', id: tituloId, attrs: { 'aria-live': 'polite' } });
  const rejilla = el('div', { class: 'cal', attrs: { role: 'grid', 'aria-labelledby': tituloId, 'aria-readonly': 'true' } });

  /**
   * Elige un dia. Avisa SIEMPRE, tambien si ya estaba elegido: pulsar el dia de
   * nuevo es como se vuelve a abrir su panel despues de cerrarlo.
   */
  function elegir(fecha, { enfocar = false, avisar = true, origen = 'clic' } = {}) {
    seleccion = fecha;
    const nuevoMes = mesDe(fecha);
    if (nuevoMes.anio !== mes.anio || nuevoMes.mes !== mes.mes) mes = nuevoMes;
    pintar();
    if (enfocar) enfocarDia(fecha);
    if (avisar) options.onElegir(fecha, { origen });
  }

  function cambiarMes(cantidad) {
    mes = sumarMeses(mes.anio, mes.mes, cantidad);
    pintar();
  }

  function enfocarDia(fecha, { sinDesplazar = false } = {}) {
    rejilla.querySelector(`[data-fecha="${fecha}"] .cal__dia`)?.focus({ preventScroll: sinDesplazar });
  }

  function alPulsarTecla(evento, fecha) {
    const lunes = semanaDe(fecha)[0];
    const destino = {
      ArrowLeft: () => sumarDias(fecha, -1),
      ArrowRight: () => sumarDias(fecha, 1),
      ArrowUp: () => sumarDias(fecha, -7),
      ArrowDown: () => sumarDias(fecha, 7),
      Home: () => lunes,
      End: () => sumarDias(lunes, 6),
      PageUp: () => mismoDiaOtroMes(fecha, -1),
      PageDown: () => mismoDiaOtroMes(fecha, 1),
    }[evento.key];
    if (!destino) return;
    evento.preventDefault();
    elegir(destino(), { enfocar: true, origen: 'teclado' });
  }

  /** Recetas del dia que quedaron sin confirmar, si el dia ya paso. */
  function atrasadas(fecha, resumen) {
    return fecha < options.hoy ? resumen.recetas - resumen.listas : 0;
  }

  function fichasDe(fecha, resumen) {
    const pasado = fecha < options.hoy;
    const fichas = resumen.porArea.map((area) => {
      const completa = area.listas === area.total;
      const atrasada = pasado && !completa;
      const marca = completa ? ' ✓' : atrasada ? ' !' : '';
      return el('li', {
        class: `cal-ficha cal-ficha--area cal-ficha--${claseArea(area.area)}${completa ? ' cal-ficha--lista' : ''}${atrasada ? ' cal-ficha--atrasada' : ''}`,
        style: { '--avance': `${Math.round((area.listas / area.total) * 100)}%` },
        // El nombre y la cuenta van aparte para que, si la celda es estrecha, lo
        // que ceda sea el nombre del area y nunca la cifra ni su marca.
      }, [
        el('span', { class: 'cal-ficha__texto', text: `${nombreArea(area.area)} ` }),
        el('span', { class: 'cal-ficha__cuenta', text: `${area.listas}/${area.total}${marca}` }),
      ]);
    });
    const { notas } = resumen;
    if (fichas.length + notas.length <= FICHAS_VISIBLES) {
      for (const nota of notas) {
        fichas.push(el('li', { class: `cal-ficha cal-ficha--${nota.tipo}${nota.hecha ? ' cal-ficha--hecha' : ''}` }, [
          el('span', { class: 'cal-ficha__texto', text: `${TIPOS_NOTA[nota.tipo].nombre}: ${nota.texto}` }),
        ]));
      }
    } else if (notas.length) {
      fichas.push(el('li', { class: 'cal-ficha cal-ficha--notas' }, [
        el('span', { class: 'cal-ficha__texto', text: `✎ ${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}` }),
      ]));
    }
    return fichas;
  }

  /** Lo que la celda dice en el celular: cifra, marca y punto de notas. */
  function resumenCorto(fecha, resumen) {
    const marca = resumen.recetas && resumen.listas === resumen.recetas ? '✓' : atrasadas(fecha, resumen) ? '!' : '';
    return [
      resumen.recetas ? el('span', { class: 'cal__cuenta', text: String(resumen.recetas) }) : null,
      marca ? el('span', { class: 'cal__marca', text: marca }) : null,
      resumen.notas.length ? el('span', { class: 'cal__punto', text: '•' }) : null,
    ];
  }

  /** Lo que el lector de pantalla dice del dia: fecha, festivo y contenido. */
  function etiquetaDe(fecha, nombreFestivo, resumen) {
    const partes = [fechaLarga(fecha)];
    if (fecha === options.hoy) partes.push('hoy');
    if (nombreFestivo) partes.push(`festivo: ${nombreFestivo}`);
    if (resumen.recetas) partes.push(`${resumen.recetas} ${resumen.recetas === 1 ? 'receta' : 'recetas'}, ${resumen.listas} ${resumen.listas === 1 ? 'lista' : 'listas'}`);
    const sinConfirmar = atrasadas(fecha, resumen);
    if (sinConfirmar) partes.push(`${sinConfirmar} sin confirmar`);
    if (resumen.notas.length) partes.push(`${resumen.notas.length} ${resumen.notas.length === 1 ? 'nota' : 'notas'}`);
    return partes.join(', ');
  }

  function pintar() {
    const datos = options.leerDatos();
    titulo.textContent = nombreMes(mes.anio, mes.mes);
    clear(rejilla);
    rejilla.appendChild(el('div', { class: 'cal__fila cal__fila--cabecera', attrs: { role: 'row' } },
      DIAS_SEMANA.map((d) => el('div', { class: 'cal__dia-semana', text: d, attrs: { role: 'columnheader' } }))));
    const semanas = semanasDelMes(mes.anio, mes.mes);
    // El dia con tabulador: el elegido si esta a la vista, si no el primero del mes.
    const visibles = semanas.flat().map((d) => d.fecha);
    const conTab = visibles.includes(seleccion) ? seleccion : semanas.flat().find((d) => d.delMes).fecha;
    for (const semana of semanas) {
      rejilla.appendChild(el('div', { class: 'cal__fila', attrs: { role: 'row' } }, semana.map(({ fecha, delMes }) => {
        const nombreFestivo = festivo(fecha);
        const resumen = datos ? resumenDelDia(datos, fecha) : RESUMEN_VACIO;
        const clases = ['cal__celda',
          delMes ? '' : 'cal__celda--fuera',
          fecha === options.hoy ? 'cal__celda--hoy' : '',
          fecha < options.hoy ? 'cal__celda--pasado' : '',
          nombreFestivo ? 'cal__celda--festivo' : '',
          esFinDeSemana(fecha) ? 'cal__celda--finde' : '',
          atrasadas(fecha, resumen) ? 'cal__celda--atrasada' : '',
          fecha === seleccion ? 'cal__celda--elegida' : ''].filter(Boolean).join(' ');
        return el('div', {
          class: clases, dataset: { fecha },
          attrs: { role: 'gridcell', 'aria-selected': String(fecha === seleccion) },
          on: { click: (evento) => { if (!evento.target.closest('.cal__dia')) elegir(fecha, { enfocar: true }); } },
        }, [
          el('div', { class: 'cal__cabeza' }, [
            el('button', {
              type: 'button', class: 'cal__dia',
              attrs: {
                tabindex: fecha === conTab ? '0' : '-1',
                'aria-label': etiquetaDe(fecha, nombreFestivo, resumen),
                'aria-current': fecha === options.hoy ? 'date' : null,
              },
              // El repintado retira el boton pulsado: el foco pasa al mismo dia ya pintado.
              on: { click: () => elegir(fecha, { enfocar: true }), keydown: (evento) => alPulsarTecla(evento, fecha) },
            }, [el('span', { class: 'cal__numero', text: String(Number(fecha.slice(8))) })]),
            nombreFestivo ? el('span', { class: 'cal__festivo', text: nombreFestivo, attrs: { 'aria-hidden': 'true' } }) : null,
          ]),
          el('ul', { class: 'cal__fichas', attrs: { 'aria-hidden': 'true' } }, fichasDe(fecha, resumen)),
          el('div', { class: 'cal__resumen', attrs: { 'aria-hidden': 'true' } }, resumenCorto(fecha, resumen)),
        ]);
      })));
    }
  }

  const node = el('section', { class: 'cal-mes', attrs: { 'aria-label': 'Calendario de producción' } }, [
    el('div', { class: 'cal-mes__barra' }, [
      el('button', { type: 'button', class: 'btn btn--quiet cal-mes__nav', text: '‹',
        attrs: { 'aria-label': 'Mes anterior' }, on: { click: () => cambiarMes(-1) } }),
      titulo,
      el('button', { type: 'button', class: 'btn btn--quiet cal-mes__nav', text: '›',
        attrs: { 'aria-label': 'Mes siguiente' }, on: { click: () => cambiarMes(1) } }),
      el('button', { type: 'button', class: 'btn btn--quiet cal-mes__hoy', text: 'Hoy',
        on: { click: () => elegir(options.hoy, { enfocar: true, origen: 'hoy' }) } }),
      options.acciones || null,
    ]),
    rejilla,
  ]);

  pintar();
  return { node, pintar, elegir, enfocarDia };
}

/** El mismo numero de dia en otro mes, o el ultimo dia si no existe (31 → 30). */
function mismoDiaOtroMes(fecha, cantidad) {
  const { anio, mes } = mesDe(fecha);
  const destino = sumarMeses(anio, mes, cantidad);
  const ultimo = new Date(Date.UTC(destino.anio, destino.mes, 0)).getUTCDate();
  const dia = Math.min(Number(fecha.slice(8)), ultimo);
  return `${destino.anio}-${String(destino.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
