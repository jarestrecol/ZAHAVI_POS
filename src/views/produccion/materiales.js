/**
 * =============================================================================
 *  MATERIALES POR AREA
 * =============================================================================
 *
 *  Lo que hay que sacar de bodega para producir, por area o en total. SOLO
 *  materiales: ni costos ni existencias. Del dia elegido o de su semana, y de
 *  todo lo programado o solo de lo que falta por producir.
 *
 *  Convierte con las equivalencias de Bodega y suma cada ingrediente en gramos.
 *  Una equivalencia ausente queda explícita, nunca se presenta como cero.
 *
 *  Imprimir imprime lo que se ve: por area (una hoja por area) o el total
 *  (una sola hoja «Total»). Ninguna de las dos lleva dinero.
 */

import { el, clear } from '../../lib/dom.js';
import { titleCase, formatMedida as formatQty } from '../../lib/format.js';
import { ICON_IMPRIMIR } from '../../lib/iconos.js';
import { materialesEnGramos } from '../../core/materiales-produccion.js';
import { pendientesDelPlan } from '../../core/produccion.js';
import { semanaDe } from '../../core/bitacora.js';
import { fechaLarga } from '../../core/calendario.js';
import { AREAS, botonAccion, cabeceraVista, claseArea, nombreArea, selector, tandas, textoUnidades, unidadesDe, vacio } from './comun.js';

/** Recetas del alcance, sumando la misma receta de varios dias. */
export function entradasDelAlcance(datos, fecha, { semana = false, soloPendiente = false } = {}) {
  const dias = semana ? semanaDe(fecha) : [fecha];
  const entradas = [];
  for (const plan of datos.planes.filter((p) => dias.includes(p.fecha))) {
    for (const e of soloPendiente ? pendientesDelPlan(datos, plan) : plan.entradas) {
      entradas.push(e);
    }
  }
  return { dias, entradas };
}

const parteFecha = (fecha, opciones) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', ...opciones }).format(new Date(fecha + 'T12:00:00Z'));

/**
 * «Semana del lunes 14 al domingo 20 de septiembre». Si la semana cruza de
 * mes se nombran los dos, y si cruza de año, tambien los años.
 *
 * @param {string[]} dias los siete dias de `semanaDe`
 */
export function textoSemana(dias) {
  const desde = dias[0];
  const hasta = dias[dias.length - 1];
  const otroAnio = desde.slice(0, 4) !== hasta.slice(0, 4);
  const dia = (f) => `${parteFecha(f, { weekday: 'long' })} ${Number(f.slice(8, 10))}`;
  const mes = (f) => `de ${parteFecha(f, { month: 'long' })}${otroAnio ? ` de ${f.slice(0, 4)}` : ''}`;
  const inicio = desde.slice(0, 7) === hasta.slice(0, 7) ? dia(desde) : `${dia(desde)} ${mes(desde)}`;
  return `Semana del ${inicio} al ${dia(hasta)} ${mes(hasta)}`;
}

const plural = (n, uno, varios) => `${formatQty(n)} ${n === 1 ? uno : varios}`;

const NOTA_UNIDADES = 'Hay ingredientes sin equivalencia: completa los gramos por medida en Bodega. Su total en gramos aún no se puede calcular.';

/**
 * @param {object} o
 * @param {string} o.fecha
 * @param {() => object|null} o.leerDatos
 * @param {() => void} o.onVolver
 * @param {(hoja: object) => void} o.onImprimir
 * @param {() => void} [o.onRegistrar] vuelve al dia con «Registrar producción» abierto
 */
export function crearMateriales(o) {
  const consolidar = (entradas) => materialesEnGramos(entradas, o.leerDatos()?.lotes || [], o.fecha);
  let semana = false;
  let soloPendiente = false;
  let ver = 'area';
  const contenido = el('div', { class: 'mat__contenido' });
  const controles = el('div', { class: 'prod-controles' });
  const imprimir = botonAccion('Imprimir', () => imprimirHoja(), { clase: 'btn btn--primary', dibujo: ICON_IMPRIMIR });
  const { node: cabecera, titulo } = cabeceraVista({ titulo: 'Materiales', fecha: o.fecha, onVolver: o.onVolver, acciones: [imprimir] });
  const textoFecha = cabecera.querySelector('.prod-vista__fecha');
  const node = el('section', { class: 'prod-vista mat' }, [cabecera, controles, contenido]);

  /** `null` si no se pudieron leer los datos del equipo. */
  function alcance() {
    const datos = o.leerDatos();
    return datos ? entradasDelAlcance(datos, o.fecha, { semana, soloPendiente }) : null;
  }

  const porNombre = (a, b) => a.recipe.nombre.localeCompare(b.recipe.nombre, 'es');

  /** Areas en el orden de siempre; un area desconocida va al final. */
  function grupos(entradas) {
    const areas = [...AREAS, ...new Set(entradas.map((e) => e.recipe.categoria).filter((c) => !AREAS.includes(c)))];
    return areas.map((categoria) => {
      const delArea = entradas.filter((e) => e.recipe.categoria === categoria).sort(porNombre);
      return { categoria, entradas: delArea.map((e) => ({ ...e, materiales: consolidar([e]) })), plan: consolidar(delArea), costo: 0, incompleto: false };
    }).filter((g) => g.entradas.length);
  }

  function tabla(plan, rotulo) {
    return el('table', { class: 'prod-tabla mat__tabla' }, [
      el('caption', { class: 'sr-only', text: rotulo }),
      el('thead', {}, [el('tr', {}, ['Ingrediente', 'Cantidad', 'Unidad'].map((t) =>
        el('th', { scope: 'col', text: t, class: t === 'Cantidad' ? 'prod-tabla__num' : '' })))]),
      el('tbody', {}, plan.lineas.map((l) => {
        const nombre = titleCase(l.ingrediente);
        const dos = l.cantidad === null;
        return el('tr', { class: dos ? 'mat__fila--unidades' : '' }, [
          el('td', {}, [el('span', { text: nombre }), l.servicio ? el('small', { text: ' · Agua de proceso, sin bodega' }) : null,
            dos ? el('small', { text: ` · ${l.motivo}` }) : null]),
          el('td', { class: 'prod-tabla__num', text: dos ? 'Falta equivalencia' : formatQty(l.cantidad) }),
          el('td', { text: l.unidad }),
        ]);
      })),
    ]);
  }

  const notaUnidades = (plan) => (plan.conflictos ? el('p', { class: 'mat__nota', text: NOTA_UNIDADES }) : null);

  function tarjetaArea(g) {
    const n = g.entradas.length;
    return el('section', {
      class: `mat-area mat-area--${claseArea(g.categoria)}`, attrs: { 'aria-label': `Materiales de ${nombreArea(g.categoria)}` },
    }, [
      el('header', { class: 'mat-area__cabecera' }, [
        el('h3', { text: nombreArea(g.categoria) }),
        el('p', { text: `${plural(n, 'receta', 'recetas')} · sale ${textoUnidades(unidadesDe(g.entradas))}` }),
      ]),
      el('details', { class: 'mat-area__detalle' }, [
        el('summary', { text: `Recetas (${n})` }),
        el('ul', { class: 'mat-area__recetas' }, g.entradas.map((e) => el('li', { text: `${titleCase(e.recipe.nombre)} · ${tandas(e.factor)}` }))),
      ]),
      tabla(g.plan, `Materiales de ${nombreArea(g.categoria)}`),
      notaUnidades(g.plan),
    ]);
  }

  function tarjetaTotal(entradas) {
    const total = consolidar(entradas);
    return el('section', { class: 'mat-total', attrs: { 'aria-label': 'Total de todas las áreas' } }, [
      el('h3', { text: `Materiales en gramos · ${plural(total.totalLineas, 'ingrediente', 'ingredientes')}` }),
      tabla(total, 'Total de materiales de todas las áreas'),
      notaUnidades(total),
    ]);
  }

  function permitirImprimir(si) {
    imprimir.disabled = !si;
    if (si) imprimir.removeAttribute('aria-label');
    else imprimir.setAttribute('aria-label', 'Imprimir (no hay nada que imprimir)');
  }

  function vacioDelAlcance() {
    const periodo = semana ? 'esta semana' : 'este día';
    if (soloPendiente) return vacio({ texto: `✓ No falta nada por producir ${periodo}.` });
    const accion = o.onRegistrar
      ? botonAccion('Registrar producción', () => o.onRegistrar(), { clase: 'btn btn--primary' })
      : null;
    return vacio({ texto: `No hay producción registrada ${periodo}.`, accion });
  }

  /** Cada grupo de botones devuelve el foco a su opcion elegida tras repintar. */
  function opcion(etiqueta, clase, valor, opciones, alElegir) {
    return selector({ etiqueta, clase, valor, opciones, onCambio: (v) => {
      alElegir(v);
      pintar();
      controles.querySelector(`[aria-label="${etiqueta}"] [aria-pressed="true"]`)?.focus();
    } });
  }

  function pintar() {
    clear(controles);
    controles.append(
      opcion('Periodo', '', semana ? 'semana' : 'dia',
        [['dia', 'Este día'], ['semana', 'Toda la semana']], (v) => { semana = v === 'semana'; }),
      opcion('Qué incluir', 'prod-selector--incluir', soloPendiente ? 'pendiente' : 'todo',
        [['todo', 'Todo lo programado'], ['pendiente', 'Solo lo que falta']], (v) => { soloPendiente = v === 'pendiente'; }),
      opcion('Ver', 'mat__ver', ver,
        [['area', 'Por área'], ['total', 'Total']], (v) => { ver = v; }),
    );
    const dias = semana ? semanaDe(o.fecha) : [o.fecha];
    textoFecha.textContent = semana ? textoSemana(dias) : fechaLarga(o.fecha);
    clear(contenido);
    const leido = alcance();
    if (!leido) {
      permitirImprimir(false);
      contenido.appendChild(el('div', { class: 'prod-aviso', attrs: { role: 'alert' } }, [
        el('p', { text: 'No se pudo leer la producción de este equipo.' }),
        botonAccion('Volver a intentar', () => { pintar(); titulo.focus(); }),
      ]));
      return;
    }
    const lista = grupos(leido.entradas);
    permitirImprimir(lista.length > 0);
    if (!lista.length) {
      contenido.appendChild(vacioDelAlcance());
      return;
    }
    contenido.appendChild(ver === 'total'
      ? tarjetaTotal(lista.flatMap((g) => g.entradas))
      : el('div', { class: 'mat__areas' }, lista.map(tarjetaArea)));
    if (o.onBodega) contenido.appendChild(botonAccion('Revisar equivalencias en Bodega', o.onBodega));
  }

  function imprimirHoja() {
    const leido = alcance();
    if (!leido) return;
    const { dias, entradas } = leido;
    const lista = grupos(entradas);
    if (!lista.length) return;
    const total = ver === 'total';
    const ordenadas = lista.flatMap((g) => g.entradas);
    const hojas = total
      ? [{ categoria: 'Total', entradas: ordenadas, plan: consolidar(ordenadas), costo: 0, incompleto: false }]
      : lista;
    o.onImprimir({
      ...consolidar(ordenadas), fecha: o.fecha, grupos: hojas, sinCostos: true, soloMateriales: true,
      alcance: [
        semana ? textoSemana(dias) : fechaLarga(o.fecha),
        total ? 'total de todas las áreas' : 'por área',
        soloPendiente ? 'solo lo que falta por producir' : 'todo lo programado',
      ].join(' · '),
      revision: o.leerDatos()?.planes.find((p) => p.fecha === o.fecha)?.revision || 0,
      borrador: false, responsable: '',
    });
  }

  pintar();
  return { node, pintar, enfocar: () => titulo.focus() };
}
