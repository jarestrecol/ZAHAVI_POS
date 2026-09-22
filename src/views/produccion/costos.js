/**
 * =============================================================================
 *  COSTOS DE LA PRODUCCION
 * =============================================================================
 *
 *  Separado de los materiales, a proposito. Dos cifras que no se mezclan:
 *
 *    - LO QUE FALTA POR PRODUCIR, estimado con la bodega de hoy por FEFO: cada
 *      gramo sale de un lote de compra concreto, con su precio.
 *    - LO YA CONFIRMADO, con el costo que quedo congelado al confirmar.
 *
 *  Por area se reparte el costo por cantidad usada (`core/ordenes.js`), y por
 *  ingrediente se enseña de que compras sale.
 *
 *  Solo consulta: descontar es confirmar una receta en «Sacar producción».
 */

import { el, clear } from '../../lib/dom.js';
import { announce } from '../../lib/a11y.js';
import { titleCase, pesos } from '../../lib/format.js';
import { consolidar } from '../../core/plan.js';
import { ordenesPorArea } from '../../core/ordenes.js';
import { costeoPendiente, pendientesDelPlan, proyectarPlanes } from '../../core/produccion.js';
import { semanaDe } from '../../core/bitacora.js';
import { fechaLarga } from '../../core/calendario.js';
import { renderCosteo } from '../costeo.js';
import { AREAS, botonAccion, cabeceraVista, claseArea, nombreArea, selector, tandas, vacio } from './comun.js';
import { textoSemana } from './materiales.js';
import { resultadoDe } from '../../core/resultados-produccion.js';
import { resumenResultado } from './resultados.js';

/**
 * @param {object} o
 * @param {string} o.fecha
 * @param {() => object|null} o.leerDatos
 * @param {() => void} o.onVolver
 * @param {() => Promise<object>} [o.onSembrarDemo] completa la bodega con lotes de ejemplo
 * @param {() => void} [o.onBodega] abre Bodega para cargar precios o existencias
 */
export function crearCostos(o) {
  let semana = false;
  const contenido = el('div', { class: 'cos__contenido' });
  const controles = el('div', { class: 'prod-controles' });
  const { node: cabecera, titulo } = cabeceraVista({ titulo: 'Costos', fecha: o.fecha, onVolver: o.onVolver });
  const textoFecha = cabecera.querySelector('.prod-vista__fecha');
  const node = el('section', { class: 'prod-vista cos' }, [cabecera, controles, contenido]);

  function cifra(valor, rotulo, detalle) {
    return el('div', { class: 'cos-cifra' }, [
      el('span', { class: 'cos-cifra__rotulo', text: rotulo }),
      el('strong', { class: 'cos-cifra__valor', text: valor }),
      detalle ? el('small', { class: 'cos-cifra__detalle', text: detalle }) : null,
    ]);
  }

  function confirmadoDe(datos, dias) {
    return datos.ejecuciones.filter((e) => dias.includes(e.fecha));
  }

  function porArea(datos, fecha) {
    const plan = datos.planes.find((p) => p.fecha === fecha);
    if (!plan) return [];
    const pendientes = ordenesPorArea(pendientesDelPlan(datos, plan), datos.lotes, fecha);
    const hechos = new Map();
    for (const ejecucion of confirmadoDe(datos, [fecha])) {
      for (const g of ordenesPorArea(ejecucion.entradas, [], fecha, ejecucion.costeo)) {
        for (const e of g.entradas) {
          const previo = hechos.get(e.recipe.id) || { recipe: e.recipe, factor: 0, costo: 0 };
          hechos.set(e.recipe.id, { ...previo, factor: previo.factor + e.factor, costo: previo.costo + e.costo });
        }
      }
    }
    // Siempre en el orden de las areas; una desconocida va al final.
    const presentes = new Set(plan.entradas.map((e) => e.recipe.categoria));
    const areas = [...AREAS.filter((a) => presentes.has(a)), ...[...presentes].filter((a) => !AREAS.includes(a))];
    return areas.map((area) => ({
      area,
      filas: plan.entradas.filter((e) => e.recipe.categoria === area).map((e) => {
        const pendiente = pendientes.find((g) => g.categoria === area)?.entradas.find((x) => x.recipe.id === e.recipe.id);
        const hecho = hechos.get(e.recipe.id);
        return { recipe: e.recipe, factor: e.factor, pendiente, hecho };
      }),
    }));
  }

  function tablaArea({ area, filas }) {
    const totalPendiente = filas.reduce((s, f) => s + (f.pendiente?.costo || 0), 0);
    const totalHecho = filas.reduce((s, f) => s + (f.hecho?.costo || 0), 0);
    return el('section', { class: `cos-area mat-area--${claseArea(area)}`, attrs: { 'aria-label': `Costos de ${nombreArea(area)}` } }, [
      el('h3', { text: nombreArea(area) }),
      el('table', { class: 'prod-tabla' }, [
        el('caption', { class: 'sr-only', text: `Costo por receta de ${nombreArea(area)}: estimado de lo que falta por producir y costo confirmado` }),
        el('thead', {}, [el('tr', {}, ['Receta', 'Tandas', 'Estimado', 'Confirmado']
          .map((t, i) => el('th', { scope: 'col', text: t, class: i ? 'prod-tabla__num' : '' })))]),
        // `data-rotulo`: en el celular cada fila es una ficha y la hoja de
        // estilo escribe el rotulo delante de cada cifra (el nombre no lo lleva).
        el('tbody', {}, filas.map((f) => el('tr', {}, [
          el('td', { text: titleCase(f.recipe.nombre) }),
          el('td', { class: 'prod-tabla__num', text: tandas(f.factor), dataset: { rotulo: 'Tandas' } }),
          el('td', { class: 'prod-tabla__num', dataset: { rotulo: 'Estimado' },
            text: f.pendiente ? `${pesos(f.pendiente.costo)}${f.pendiente.incompleto ? ' · incompleto' : ''}` : '—' }),
          el('td', { class: 'prod-tabla__num', text: f.hecho ? pesos(f.hecho.costo) : '—', dataset: { rotulo: 'Confirmado' } }),
        ]))),
        el('tfoot', {}, [el('tr', {}, [
          el('th', { scope: 'row', text: 'Total del área' }), el('td'),
          el('td', { class: 'prod-tabla__num', text: pesos(totalPendiente), dataset: { rotulo: 'Estimado' } }),
          el('td', { class: 'prod-tabla__num', text: pesos(totalHecho), dataset: { rotulo: 'Confirmado' } }),
        ])]),
      ]),
    ]);
  }

  function pintarDia(datos) {
    const costeo = costeoPendiente(datos, o.fecha);
    const confirmado = confirmadoDe(datos, [o.fecha]);
    const descontado = confirmado.reduce((s, e) => s + e.costeo.costoTotal, 0);
    contenido.appendChild(el('div', { class: 'cos-cifras' }, [
      cifra(pesos(costeo?.costoTotal || 0), 'Por producir (estimado)', costeo && (costeo.lineasConFaltante || costeo.lineasSinPrecio)
        ? `Incompleto: ${costeo.lineasConFaltante} ingredientes con faltante` : 'Con la bodega de hoy'),
      cifra(pesos(descontado), 'Ya confirmado', `${confirmado.length} ${confirmado.length === 1 ? 'confirmación' : 'confirmaciones'} · costo congelado`),
      cifra(pesos((costeo?.costoTotal || 0) + descontado), 'Total del día', 'Materia prima; sin mano de obra ni empaque'),
    ]));
    const areas = porArea(datos, o.fecha);
    if (!areas.length) {
      contenido.appendChild(vacio({ texto: 'No hay producción registrada este día.' }));
      return;
    }
    // Una linea sin compras cuenta a la vez como sin precio y con faltante:
    // se cuentan lineas, no la suma de los dos contadores.
    const incompletas = costeo ? costeo.lineas.filter((l) => l.estado !== 'ok' || l.origen.some((x) => x.sinPrecio)).length : 0;
    if (incompletas) {
      contenido.appendChild(el('div', { class: 'prod-aviso', attrs: { role: 'status' } }, [
        el('p', { text: `El costo sale incompleto: ${incompletas} ${incompletas === 1 ? 'ingrediente' : 'ingredientes'} sin precio, existencias o equivalencia en gramos.` }),
        o.onBodega ? botonAccion('Ir a Bodega', () => o.onBodega()) : null,
      ]));
      if (o.onSembrarDemo) contenido.appendChild(avisoEjemplo());
    }
    contenido.appendChild(el('div', { class: 'cos-areas' }, areas.map(tablaArea)));
    if (confirmado.length) contenido.appendChild(el('section', { class: 'rend', attrs: { 'aria-label': 'Rendimiento y costo por unidad' } }, [
      el('h3', { text: 'Rendimiento y costo por unidad vendible' }),
      ...confirmado.flatMap((e) => e.entradas.map((x) => el('details', { class: 'rend__registro' }, [
        el('summary', { text: `${titleCase(x.recipe.nombre)} · ${tandas(x.factor)} · ${e.responsable}` }),
        resumenResultado(e, resultadoDe(datos, e.id, x.recipe.id), true),
      ]))),
    ]));
    const plan = datos.planes.find((p) => p.fecha === o.fecha);
    const pendientes = pendientesDelPlan(datos, plan);
    // Detalle de auditoria, no lectura diaria: plegado.
    contenido.appendChild(el('details', { class: 'cos-ingredientes' }, [
      el('summary', { text: 'Por ingrediente: lo que falta por producir (lote a lote)' }),
      pendientes.length
        ? renderCosteo({ plan: consolidar(pendientes), lotes: datos.lotes, hoy: o.fecha, costeo,
          rotulo: 'estimado de lo que falta por producir, lote a lote (FEFO); excluye faltantes' })
        : vacio({ texto: 'Todo lo del día ya está confirmado.' }),
    ]));
    if (confirmado.length) {
      contenido.appendChild(el('details', { class: 'cos-confirmado' }, [
        el('summary', { text: `Por ingrediente: lo ya confirmado (${pesos(descontado)})` }),
        ...confirmado.map((e) => el('section', { class: 'cos-confirmado__item' }, [
          el('h4', { text: `${e.entradas.map((x) => titleCase(x.recipe.nombre)).join(', ')} · ${e.responsable}` }),
          renderCosteo({ plan: { lineas: [] }, lotes: datos.lotes, costeo: e.costeo, rotulo: 'costo congelado al confirmar' }),
        ])),
      ]));
    }
  }

  /** Solo para probar: los precios son inventados y no entran si hay compras reales. */
  function avisoEjemplo() {
    const estado = el('p', { class: 'cos-ejemplo__estado', attrs: { role: 'status' } });
    return el('div', { class: 'cos-ejemplo' }, [
      el('p', { text: 'Sin precios o existencias, esas recetas tampoco se pueden confirmar.' }),
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Completar la bodega con lotes de ejemplo', on: { click: async (evento) => {
        const boton = evento.currentTarget;
        boton.disabled = true;
        boton.setAttribute('aria-busy', 'true');
        const r = await o.onSembrarDemo();
        boton.removeAttribute('aria-busy');
        if (!r.ok) { boton.disabled = false; estado.textContent = r.message; return; }
        pintar();
        announce(`${r.value} lotes de ejemplo añadidos a la bodega.`);
        // El aviso desaparece si ya no faltan precios: el foco no puede irse con el.
        titulo.focus();
      } } }),
      el('small', { text: 'Solo para probar: los precios son inventados y no se cargan si la bodega ya tiene compras reales.' }),
      estado,
    ]);
  }

  function pintarSemana(datos) {
    const dias = semanaDe(o.fecha);
    const proyeccion = proyectarPlanes(datos, dias[0], dias[6]);
    const filas = dias.map((dia) => {
      const estimado = proyeccion.find((p) => p.fecha === dia)?.costeo;
      const confirmado = confirmadoDe(datos, [dia]).reduce((s, e) => s + e.costeo.costoTotal, 0);
      return { dia, estimado, confirmado };
    });
    const totalEstimado = filas.reduce((s, f) => s + (f.estimado?.costoTotal || 0), 0);
    const totalConfirmado = filas.reduce((s, f) => s + f.confirmado, 0);
    contenido.appendChild(el('div', { class: 'cos-cifras' }, [
      cifra(pesos(totalEstimado), 'Por producir (estimado)', 'Día a día: lo del lunes no se promete otra vez el martes'),
      cifra(pesos(totalConfirmado), 'Ya confirmado', 'Costo congelado'),
      cifra(pesos(totalEstimado + totalConfirmado), 'Total de la semana', 'Materia prima'),
    ]));
    contenido.appendChild(el('table', { class: 'prod-tabla cos-semana' }, [
      el('caption', { class: 'sr-only', text: 'Costo por día de la semana' }),
      el('thead', {}, [el('tr', {}, ['Día', 'Por producir (estimado)', 'Faltantes', 'Confirmado']
        .map((t, i) => el('th', { scope: 'col', text: t, class: i ? 'prod-tabla__num' : '' })))]),
      el('tbody', {}, filas.map((f) => el('tr', {}, [
        el('th', { scope: 'row', text: fechaLarga(f.dia, false) }),
        el('td', { class: 'prod-tabla__num', text: f.estimado ? pesos(f.estimado.costoTotal) : '—' }),
        el('td', { class: 'prod-tabla__num', text: f.estimado ? String(f.estimado.lineasConFaltante) : '—' }),
        el('td', { class: 'prod-tabla__num', text: f.confirmado ? pesos(f.confirmado) : '—' }),
      ]))),
    ]));
  }

  function pintar() {
    clear(controles);
    controles.appendChild(selector({ etiqueta: 'Periodo', valor: semana ? 'semana' : 'dia',
      opciones: [['dia', 'Este día'], ['semana', 'Toda la semana']],
      onCambio: (v) => { semana = v === 'semana'; pintar(); controles.querySelector('[aria-pressed="true"]')?.focus(); } }));
    const dias = semanaDe(o.fecha);
    textoFecha.textContent = semana ? textoSemana(dias) : fechaLarga(o.fecha);
    clear(contenido);
    const datos = o.leerDatos();
    if (!datos) {
      contenido.appendChild(el('div', { class: 'prod-aviso', attrs: { role: 'alert' } }, [
        el('p', { text: 'No se pudo leer la producción de este equipo.' }),
        botonAccion('Volver a intentar', () => { pintar(); titulo.focus(); }),
      ]));
      return;
    }
    if (semana) pintarSemana(datos); else pintarDia(datos);
  }

  pintar();
  return { node, pintar, enfocar: () => titulo.focus() };
}
