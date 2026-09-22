import { el } from '../../lib/dom.js';
import { formatMedida, pesos } from '../../lib/format.js';
import { announce } from '../../lib/a11y.js';
import { UNIDADES_RESULTADO, resultadoDe, rendimientoPrevisto, indicadoresResultado, puedeRegistrarResultado } from '../../core/resultados-produccion.js';
import { recetasDelDia } from '../../core/preparacion.js';
import { titleCase } from '../../lib/format.js';
import { botonAccion, cabeceraVista } from './comun.js';

const medida = (n, unidad) => n === null ? 'Sin registrar' : `${formatMedida(n)} ${unidad}`;
const porcentaje = (n) => n === null ? 'Sin base de comparación' : `${formatMedida(n)} %`;

/** Ficha de lectura común para producción, costos e historial. */
export function resumenResultado(ejecucion, resultado, verCostos = false) {
  if (!resultado) return el('p', { class: 'rend__pendiente', text: 'Resultado real pendiente de registrar.' });
  const r = resultado, i = indicadoresResultado(ejecucion, r);
  const cifras = [
    ['Esperado', medida(r.esperado, r.unidad)], ['Obtenido total', medida(i.obtenido, r.unidad)],
    ['Vendible', medida(r.vendible, r.unidad)], ['Rechazado', medida(r.rechazado, r.unidad)],
    ['Cumplimiento vendible', porcentaje(i.cumplimiento)], ['Rechazo sobre lo obtenido', porcentaje(i.rechazoPorcentaje)],
    ['Pérdida en preparación', medida(r.mermaPreparacionGr, 'g')], ['Pérdida en cocción', medida(r.mermaCoccionGr, 'g')],
  ];
  if (verCostos) cifras.push(['Materia prima consumida', pesos(i.costo)],
    [`Costo previsto por ${r.unidad}`, i.costoPrevisto === null ? 'Sin rendimiento esperado' : `${formatMedida(i.costoPrevisto)} COP`],
    [`Costo real por ${r.unidad} vendible`, i.costoReal === null ? 'Sin unidades vendibles' : `${formatMedida(i.costoReal)} COP`],
    ['Variación del costo por rendimiento', porcentaje(i.variacionCosto)]);
  return el('div', { class: 'rend__resumen' }, [
    el('dl', { class: 'rend__cifras' }, cifras.map(([rotulo, valor]) => el('div', {}, [el('dt', { text: rotulo }), el('dd', { text: valor })]))),
    r.vendible === 0 ? el('p', { text: verCostos ? `Sin producto vendible: ${pesos(i.costo)} de materia prima consumida sin recuperación en esta producción.` : 'Esta producción no dejó producto vendible.' }) : null,
    el('p', { text: `${r.autor.nombre} · versión ${r.revision} · ${r.motivo}` }),
    verCostos ? el('small', { text: 'Costo de materia prima; no incluye mano de obra, energía ni empaque. La variación compara el mismo costo consumido con el rendimiento esperado y el real.' }) : null,
  ]);
}

/** Resultados separados por confirmación: una producción extra no pisa la anterior. */
export function crearResultados({ datos, fecha, recetaId, autor, verCostos, onGuardar, borradores = new Map() }) {
  const ejecuciones = datos.ejecuciones.filter((e) => e.fecha === fecha && e.entradas.some((x) => x.recipe.id === recetaId));
  if (!ejecuciones.length) return null;
  return el('section', { class: 'rend', attrs: { 'aria-label': 'Resultado real de producción' } }, [
    el('h4', { text: 'Resultado real' }),
    el('p', { text: 'Registra lo que salió de cada confirmación. El consumo de bodega ya está registrado.' }),
    ...ejecuciones.map((ejecucion, indice) => {
      let actual = resultadoDe(datos, ejecucion.id, recetaId);
      const entrada = ejecucion.entradas.find((e) => e.recipe.id === recetaId);
      const previsto = rendimientoPrevisto(entrada);
      const panel = el('article', { class: 'rend__registro', dataset: { produccion: ejecucion.id } });
      const aviso = el('p', { attrs: { role: 'status' } });
      function pintar() {
        const titulo = el('h5', { text: `Confirmación ${indice + 1} · ${formatMedida(entrada.factor)} tandas`, attrs: { tabindex: '-1' } });
        panel.replaceChildren(titulo, resumenResultado(ejecucion, actual, verCostos), aviso);
        if (!onGuardar || !puedeRegistrarResultado(autor, ejecucion, actual)) return titulo;
        const clave = `${ejecucion.id}|${recetaId}|${actual?.revision || 0}`;
        const draft = borradores.get(clave) || { unidad: actual?.unidad || previsto.unidad || 'UND',
          esperado: actual?.esperado ?? previsto.cantidad ?? '', vendible: actual?.vendible ?? '', rechazado: actual?.rechazado ?? 0,
          mermaPreparacionGr: actual?.mermaPreparacionGr ?? '', mermaCoccionGr: actual?.mermaCoccionGr ?? '', motivo: '', abierto: !actual };
        borradores.set(clave, draft);
        const campo = (nombre, rotulo, { disabled = false, opcional = false } = {}) => el('label', { class: 'rend__campo' }, [
          el('span', { text: rotulo }), el('input', { class: 'field', type: 'number', value: String(draft[nombre]), disabled,
            required: !opcional, min: '0', max: '1000000000000', step: 'any', name: nombre,
            attrs: { inputmode: 'decimal' }, on: { input: (e) => { draft[nombre] = e.target.value; } } }),
        ]);
        const unidad = el('select', { class: 'field', disabled: Boolean(previsto.unidad), name: 'unidad',
          on: { change: (e) => { draft.unidad = e.target.value; } } },
        UNIDADES_RESULTADO.map((u) => el('option', { value: u, text: u, selected: u === draft.unidad })));
        const error = el('p', { class: 'rend__error', attrs: { role: 'alert' } });
        const obtenido = el('output', { text: `Cantidad obtenida: ${formatMedida(Number(draft.vendible || 0) + Number(draft.rechazado || 0))} ${draft.unidad}` });
        const guardar = el('button', { type: 'submit', class: 'btn btn--primary', text: actual ? 'Guardar corrección' : 'Guardar resultado' });
        const campos = el('fieldset', { class: 'rend__campos' }, [
          el('legend', { text: 'Medidas del producto terminado' }),
          el('label', { class: 'rend__campo' }, [el('span', { text: 'Medida de salida' }), unidad]),
          campo('esperado', 'Cantidad esperada', { disabled: Boolean(previsto.unidad), opcional: true }),
          campo('vendible', 'Cantidad vendible'), campo('rechazado', 'Cantidad rechazada'),
          obtenido,
          el('p', { class: 'rend__ayuda', text: 'Vendible y rechazada usan la misma medida de salida. Lo obtenido es la suma de ambas. La cantidad esperada corresponde a esta confirmación.' }),
          campo('mermaPreparacionGr', 'Pérdida en preparación (g)', { opcional: true }),
          campo('mermaCoccionGr', 'Pérdida en cocción (g)', { opcional: true }),
          el('p', { class: 'rend__ayuda', text: 'Los gramos son mediciones separadas: deja vacío si no pesaste la pérdida. No incluyas aquí el producto rechazado ni repitas una pérdida en ambas etapas.' }),
          el('label', { class: 'rend__campo rend__ayuda' }, [el('span', { text: actual ? 'Motivo de la corrección' : 'Motivo de pérdidas o diferencias' }),
            el('textarea', { class: 'field', value: draft.motivo, maxLength: 500, rows: 2, required: Boolean(actual),
              on: { input: (e) => { draft.motivo = e.target.value; } } })]),
          guardar,
        ]);
        const form = el('form', {}, [campos, error]);
        form.addEventListener('input', () => {
          error.textContent = '';
          obtenido.textContent = `Cantidad obtenida: ${formatMedida(Number(draft.vendible || 0) + Number(draft.rechazado || 0))} ${draft.unidad}`;
        });
        form.addEventListener('submit', async (evento) => {
          evento.preventDefault();
          if (campos.disabled) return;
          campos.disabled = true;
          error.textContent = '';
          let res;
          try { res = await onGuardar({ ...draft, produccionId: ejecucion.id, recetaId, revision: actual?.revision || 0 }); }
          catch { res = { ok: false, message: 'No se pudo guardar. Tus medidas siguen en el formulario.' }; }
          campos.disabled = false;
          if (!res?.ok) { error.textContent = res?.message || 'No se pudo guardar.'; announce(error.textContent, 'assertive'); return; }
          actual = res.value;
          borradores.delete(clave);
          aviso.textContent = 'Resultado guardado. No se descontó inventario adicional.';
          pintar().focus();
          announce(aviso.textContent);
        });
        const detalle = el('details', { open: draft.abierto }, [
          el('summary', { text: actual ? 'Corregir resultado' : 'Registrar resultado real' }),
          !previsto.unidad ? el('p', { text: 'Elige la medida de salida y, si la conoces, la cantidad esperada para esta confirmación. La receta original se conserva.' }) : null,
          form,
        ]);
        detalle.addEventListener('toggle', () => { draft.abierto = detalle.open; });
        panel.appendChild(detalle);
        return titulo;
      }
      pintar();
      return panel;
    }),
  ]);
}

/** Puerta directa del día: muestra también lo esperado antes de la confirmación. */
export function crearVistaResultados(o) {
  const { node: cabecera, titulo } = cabeceraVista({ titulo: 'Resultados de producción', fecha: o.fecha, onVolver: o.onVolver });
  const datos = o.leerDatos();
  const recetas = datos ? recetasDelDia(datos, o.fecha) : [];
  const node = el('section', { class: 'prod-vista resultados-dia' }, [cabecera,
    el('p', { text: 'Cantidad esperada, obtenida, vendible y rechazada; pérdidas en preparación y cocción. Cada confirmación conserva su propio resultado.' }),
    ...recetas.map((r) => {
      const previsto = rendimientoPrevisto({ recipe: r.recipe, factor: r.pendiente || r.factor });
      return el('article', { class: 'rend__registro' }, [
        el('h3', { text: titleCase(r.recipe.nombre) }),
        r.pendiente > 0 ? el('div', { class: 'rend__pendiente' }, [
          el('p', { text: `Por confirmar: ${formatMedida(r.pendiente)} tandas. Cantidad esperada: ${previsto.cantidad === null ? 'sin rendimiento declarado' : `${formatMedida(previsto.cantidad)} ${previsto.unidad}`}.` }),
          el('p', { text: 'Obtenida, vendible, rechazada y pérdidas: pendientes de medir. Confirma el consumo de esta receta para registrar su resultado real.' }),
          botonAccion('Revisar y confirmar esta receta', () => o.onProducir(r.recipe.categoria, r.recipe.id)),
        ]) : null,
        crearResultados({ datos, fecha: o.fecha, recetaId: r.recipe.id, autor: o.autor, verCostos: o.verCostos, onGuardar: o.onGuardar }),
      ]);
    }),
  ]);
  return { node, enfocar: () => titulo.focus() };
}
