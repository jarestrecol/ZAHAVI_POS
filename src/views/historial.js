import { el, clear } from '../lib/dom.js';
import { pesos, formatMedida as formatQty } from '../lib/format.js';
import { aCSV, descargarCSV } from '../lib/csv.js';
import { hoyLocal, periodoDe } from '../core/bitacora.js';
import { enPeriodo, seguimientoProductos, fechaEvento } from '../core/seguimiento.js';
import { valorUnitario } from '../core/almacen.js';
import { fechaLarga } from '../core/calendario.js';
import { resultadoDe, indicadoresResultado } from '../core/resultados-produccion.js';
import { resumenResultado } from './produccion/resultados.js';

/** «Jueves 24 de septiembre de 2026»: la fecha como se dice, no como se guarda. */
const fechaLegible = (fecha) => {
  const texto = fechaLarga(fecha).replace(',', '');
  return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
};

const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function renderHistorial({ leerDatos, tipo, verCostos = false }) {
  const bodega = tipo === 'bodega';
  const fecha = el('input', { type: 'date', class: 'field', value: hoyLocal(), attrs: { 'aria-label': 'Fecha de consulta del historial' } });
  const periodo = el('select', { class: 'field', attrs: { 'aria-label': 'Periodo del historial' } },
    [['dia', 'Día'], ['dos_dias', 'Dos días'], ['semana', 'Semana'], ['mes', 'Mes'], ['trimestre', 'Trimestre'], ['semestre', 'Semestre'], ['año', 'Año']]
      .map(([value, etiqueta]) => el('option', { value, text: etiqueta, selected: value === 'mes' })));
  const buscar = el('input', { type: 'search', class: 'field', placeholder: bodega ? 'Buscar producto…' : 'Buscar receta…',
    attrs: { 'aria-label': bodega ? 'Buscar producto en historial' : 'Buscar receta en historial' } });
  const resultado = el('div', { class: 'historial__resultado' });
  const aviso = el('p', { class: 'historial__nota', attrs: { role: 'status' } });
  let filasCSV = [];
  // En producción la vista que lo contiene ya lleva el título, y se vuelve a
  // crear cada vez que se abre: los filtros la actualizan solos, así que el
  // título y «Actualizar historial» sobran. Bodega los conserva.
  const node = el('section', { class: 'historial' }, [
    bodega ? el('div', { class: 'section-heading' }, [el('div', {}, [
      el('h2', { text: 'Historial de productos' }),
      el('p', { text: 'Precios, proveedores, compras y consumo por ingrediente y unidad.' }),
    ])]) : null,
    el('div', { class: 'historial__filtros' }, [fecha, periodo, buscar,
      bodega ? el('button', { type: 'button', class: 'btn btn--quiet', text: 'Actualizar historial', on: { click: actualizar } }) : null,
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Exportar historial CSV', on: { click: () => descargarCSV(`historial-${tipo}-${fecha.value}.csv`, aCSV(filasCSV)) } }),
    ]), aviso, resultado,
  ]);
  for (const input of [fecha, periodo]) input.addEventListener('change', actualizar);
  buscar.addEventListener('input', actualizar);
  actualizar();
  return { node, actualizar };

  function actualizar() {
    const r = leerDatos();
    clear(resultado);
    if (!r.ok) { aviso.textContent = r.message; return; }
    if (!fecha.value) { aviso.textContent = 'Elige una fecha para consultar.'; return; }
    const rango = periodoDe(fecha.value, periodo.value);
    const textoRango = bodega ? `${rango.desde} al ${rango.hasta}`
      : rango.desde === rango.hasta ? fechaLegible(rango.desde) : `Del ${fechaLegible(rango.desde)} al ${fechaLegible(rango.hasta)}`;
    aviso.textContent = `${textoRango} · Historial guardado en este equipo.`;
    if (bodega) pintarBodega(r.value, rango); else pintarProduccion(r.value, rango);
  }

  function pintarProduccion(datos, rango) {
    const aguja = buscar.value.trim().toLocaleLowerCase('es');
    const coincide = (e) => !aguja || e.entradas.some((x) => x.recipe.nombre.toLocaleLowerCase('es').includes(aguja));
    const planes = datos.planes.filter((p) => enPeriodo(p.fecha, rango) && coincide(p));
    const ejecuciones = datos.ejecuciones.filter((p) => enPeriodo(p.fecha, rango) && coincide(p));
    // Un plan eliminado sigue siendo historia: sin esto, su día desaparecería
    // de la consulta como si nunca se hubiera programado.
    const eliminados = datos.eventos.filter((e) => e.tipo === 'plan_eliminado' && enPeriodo(e.fecha, rango) && coincide(e.antes));
    const costo = ejecuciones.reduce((s, e) => s + e.costeo.costoTotal, 0);
    resultado.appendChild(el('p', { class: 'historial__resumen', text: `${cuenta(planes.length, 'día planeado', 'días planeados')} · ${cuenta(ejecuciones.length, 'producción aprobada', 'producciones aprobadas')}${verCostos ? ` · ${pesos(costo)} de materia prima registrada` : ''}` }));
    filasCSV = [['Fecha', 'Registro', 'Responsable', 'Recetas y tandas', 'Costo materia prima COP', 'Motivo', 'Registrado en',
      'Medida de salida', 'Cantidad esperada', 'Cantidad vendible', 'Cantidad rechazada', 'Pérdida preparación g', 'Pérdida cocción g',
      'Costo previsto por medida COP', 'Costo real por medida vendible COP', 'Versión resultado']];
    const dias = [...new Set([...planes, ...ejecuciones, ...eliminados].map((e) => e.fecha))].sort().reverse();
    if (!dias.length) resultado.appendChild(el('p', { text: 'No hay planes ni producción registrada en este periodo.' }));
    for (const dia of dias) {
      const plan = planes.find((p) => p.fecha === dia);
      const hechas = ejecuciones.filter((e) => e.fecha === dia);
      const revisiones = datos.eventos.filter((e) => ['plan_guardado', 'plan_ajustado', 'plan_eliminado'].includes(e.tipo) && e.fecha === dia);
      if (plan) filasCSV.push([dia, `Plan v${plan.revision}`, plan.responsable, nombres(plan.entradas), '', plan.motivo, plan.actualizado]);
      for (const e of eliminados.filter((x) => x.fecha === dia)) {
        filasCSV.push([dia, `Plan v${e.antes.revision} eliminado`, e.responsable, nombres(e.antes.entradas), '', e.motivo, e.instante]);
      }
      resultado.appendChild(el('details', { class: 'historial__registro' }, [
        el('summary', { text: `${fechaLegible(dia)} · ${plan ? cuenta(plan.entradas.length, 'receta planeada', 'recetas planeadas') : eliminados.some((e) => e.fecha === dia) ? 'Plan eliminado' : 'Sin plan'} · ${cuenta(hechas.length, 'aprobación', 'aprobaciones')}${verCostos ? ` · ${pesos(hechas.reduce((s, e) => s + e.costeo.costoTotal, 0))}` : ''}` }),
        plan ? el('p', { text: `Plan v${plan.revision}: ${nombres(plan.entradas)}.` }) : null,
        verCostos && plan?.estimado ? el('p', { text: `Estimación de las tandas pendientes al guardar: ${pesos(plan.estimado.costoTotal)} cubiertos · ${plan.estimado.lineasConFaltante} ingredientes con faltante. El costo aprobado se detalla abajo.` }) : null,
        ...hechas.map((e) => {
          filasCSV.push([dia, e.id, e.responsable, nombres(e.entradas), e.costeo.costoTotal, e.motivo, e.instante]);
          const resultados = e.entradas.map((x) => {
            const r = resultadoDe(datos, e.id, x.recipe.id);
            if (r) {
              const i = indicadoresResultado(e, r);
              // Fila de medición: el costo total queda solo en la aprobación para no duplicarlo al sumar el CSV.
              filasCSV.push([dia, `Resultado ${e.id}`, r.autor.nombre, x.recipe.nombre, '', r.motivo, r.actualizado,
                r.unidad, r.esperado ?? '', r.vendible, r.rechazado, r.mermaPreparacionGr ?? '', r.mermaCoccionGr ?? '',
                i.costoPrevisto ?? '', i.costoReal ?? '', r.revision]);
            }
            const cambios = datos.eventos.filter((v) => v.tipo === 'resultado_guardado' && v.produccionId === e.id && v.recetaId === x.recipe.id);
            return el('section', { class: 'rend' }, [
              el('h4', { text: `Resultado real · ${x.recipe.nombre}` }), resumenResultado(e, r, verCostos),
              cambios.length ? el('details', {}, [el('summary', { text: `${cambios.length} registros de resultado` }),
                ...cambios.map((v) => el('div', { class: 'rend__registro' }, [
                  el('p', { text: `${v.instante} · ${v.antes ? `Corrección de versión ${v.antes.revision}` : 'Primera medición'}` }),
                  resumenResultado(e, v.despues, verCostos),
                ])),
              ]) : null,
            ]);
          });
          return el('article', { class: 'historial__detalle' }, [
            el('h3', { text: `${verCostos ? `${pesos(e.costeo.costoTotal)} · ` : ''}${e.responsable}` }),
            el('p', { text: `${nombres(e.entradas)}. ${e.motivo}` }),
            el('p', { text: `Registro ${e.id} · ${e.instante} · plan v${e.planRevision}` }),
            ...resultados,
            el('ul', {}, e.costeo.lineas.map((l) => el('li', { text: `${l.ingrediente}: ${formatQty(l.consumo)} ${l.unidad}${verCostos ? ` · ${pesos(l.costo)}` : ''} · ${l.origen.map((o) => `${o.loteId}: ${formatQty(o.cantidad)} ${o.unidad || l.unidad}${o.gramosPorUnidad === undefined ? '' : ` (1 ${o.unidad} = ${formatQty(o.gramosPorUnidad)} g)`}${verCostos ? ` (${pesos(o.costo)})` : ''}`).join(', ')}` }))),
            el('details', {}, [el('summary', { text: 'Ver fórmulas usadas' }), ...e.entradas.map((x) => el('div', {}, [
              el('h4', { text: x.recipe.nombre }),
              el('ul', {}, (x.recipe.componentes || []).flatMap((c) => c.items.map((i) => el('li', { text: `${i.ingrediente}: ${i.cantidad} ${i.unidad} en fórmula base` })))),
            ]))]),
          ]);
        }),
        el('details', {}, [el('summary', { text: cuenta(revisiones.length, 'cambio del plan', 'cambios del plan') }),
          ...revisiones.map((e) => el('p', { text: e.tipo === 'plan_eliminado'
            ? `Eliminado (era v${e.antes.revision}) · ${e.instante} · ${e.responsable} · ${e.motivo} · tenía ${nombres(e.antes.entradas)}`
            : e.tipo === 'plan_ajustado'
              ? `v${e.revision} · ${e.instante} · ${e.responsable} · ${e.receta}: ${e.tandasAntes ?? 0} → ${e.tandasDespues ?? 0} tandas`
              : `v${e.despues.revision} · ${e.instante} · ${e.responsable} · ${e.motivo} · ${nombres(e.despues.entradas)}` })),
        ]),
      ]));
    }
    filasCSV = filasCSV.map((fila) => [...fila, ...Array(Math.max(0, filasCSV[0].length - fila.length)).fill('')]);
    if (!verCostos) filasCSV = filasCSV.map((fila) => fila.filter((_, i) => ![4, 13, 14].includes(i)));
  }

  function pintarBodega(datos, rango) {
    const aguja = buscar.value.trim().toLocaleLowerCase('es');
    const productos = seguimientoProductos(datos, rango).filter((p) => p.ingrediente.toLocaleLowerCase('es').includes(aguja));
    filasCSV = [['Ingrediente', 'Unidad', 'Fecha registro', 'Tipo', 'Lote', 'Saldo anterior', 'Saldo nuevo', 'Precio anterior por unidad', 'Precio nuevo por unidad', 'Proveedor anterior', 'Proveedor nuevo', 'Responsable', 'Motivo']];
    resultado.appendChild(el('p', { class: 'historial__nota', text: 'La cobertura es una estimación con el consumo registrado en el periodo y el stock utilizable actual. No incluye compras futuras. Los saldos anteriores a la apertura no están disponibles.' }));
    if (!productos.length) resultado.appendChild(el('p', { text: 'No hay productos con historial para esta búsqueda.' }));
    for (const p of productos) {
      resultado.appendChild(el('details', { class: 'historial__registro' }, [
        el('summary', { text: `${p.ingrediente} · ${p.unidad} · ${p.compras.length} compras · ${formatQty(p.consumido)} consumidos · ${p.movimientos.length} movimientos` }),
        el('p', { class: 'historial__resumen', text: `${verCostos ? `Compras: ${pesos(p.gasto)} · ` : ''}Saldo al corte registrado: ${p.saldoCierre === null ? 'sin registro' : `${formatQty(p.saldoCierre)} ${p.unidad}`} · Disponible hoy: ${formatQty(p.disponible)} ${p.unidad}` }),
        el('p', { text: `Uso en ${p.diasConsumo} días · Intervalo entre compras: ${p.intervalo === null ? 'se necesitan al menos dos fechas de compra' : `${formatQty(p.intervalo)} días`} · Cobertura estimada: ${p.cobertura === null ? 'sin consumo suficiente para calcular' : `${formatQty(p.cobertura)} días, con ${p.diasObservados} días observados`}.` }),
        ...[...p.movimientos].reverse().map((e) => {
          const a = e.antes, d = e.despues, lote = d || a;
          filasCSV.push([p.ingrediente, p.unidad, e.instante, e.tipo, lote.id, a?.existencia ?? 0, d?.existencia ?? 0,
            a ? valorUnitario(a) : '', d ? valorUnitario(d) : '', a?.proveedor || '', d?.proveedor || '', e.responsable, e.motivo]);
          return el('article', { class: 'historial__detalle' }, [
            el('h3', { text: `${fechaEvento(e)} · ${e.tipo} · ${lote.id}` }),
            el('p', { text: `Existencia: ${formatQty(a?.existencia || 0)} → ${formatQty(d?.existencia || 0)} ${p.unidad}${verCostos ? ` · Precio por ${p.unidad}: ${a ? formatQty(valorUnitario(a)) : '—'} → ${d ? formatQty(valorUnitario(d)) : '—'} COP` : ''}` }),
            el('p', { text: `Proveedor: ${a?.proveedor || 'sin registrar'} → ${d?.proveedor || 'sin registrar'} · Compra: ${lote.fechaCompra || 'sin fecha declarada'}` }),
            ...(verCostos ? e.alertas || [] : []).map((mensaje) => el('p', { class: 'historial__alerta', text: mensaje })),
            el('p', { text: `${e.responsable} · ${e.motivo} · ${e.instante}${e.produccionId ? ` · Producción ${e.produccionId}` : ''}` }),
          ]);
        }),
      ]));
    }
    if (!verCostos) filasCSV = filasCSV.map(fila => fila.filter((_, i) => ![7, 8].includes(i)));
  }
}

function nombres(entradas) {
  return entradas.map((e) => `${e.recipe.nombre} × ${formatQty(e.factor)}`).join('; ');
}
