import { readJsonState, writeJson, ok, err } from './storage.js';
import { normalizarLote } from './almacen.js';
import { equivalenciasValidas } from './conversiones.js';

// Un solo documento: existencias, aprobaciones e historial se confirman juntos.
// Compatible con la bodega anterior. No publica datos comerciales con recetas.
export const CLAVE_OPERACION = 'zahavi_almacen_v1';
export const copiar = (valor) => JSON.parse(JSON.stringify(valor));
export const nuevoId = () => globalThis.crypto.randomUUID();

export function hoyLocal(instante = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instante);
  const dato = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${dato('year')}-${dato('month')}-${dato('day')}`;
}

export function fechaValida(fecha) {
  return typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
    && Number.isFinite(Date.parse(fecha)) && new Date(fecha).toISOString().slice(0, 10) === fecha;
}

export function sumarDias(fecha, cantidad) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + cantidad);
  return d.toISOString().slice(0, 10);
}

export function semanaDe(fecha) {
  const inicio = sumarDias(fecha, -((new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
}

export function periodoDe(fecha, periodo) {
  if (periodo === 'dia') return { desde: fecha, hasta: fecha };
  if (periodo === 'dos_dias') return { desde: sumarDias(fecha, -1), hasta: fecha };
  if (periodo === 'semana') {
    const dias = semanaDe(fecha);
    return { desde: dias[0], hasta: dias[6] };
  }
  const meses = { mes: 1, trimestre: 3, semestre: 6, año: 12 }[periodo] || 1;
  const anio = Number(fecha.slice(0, 4));
  const mes = Math.floor((Number(fecha.slice(5, 7)) - 1) / meses) * meses;
  return {
    desde: new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10),
    hasta: new Date(Date.UTC(anio, mes + meses, 0)).toISOString().slice(0, 10),
  };
}

export function leerOperacion() {
  try {
    const r = readJsonState(CLAVE_OPERACION);
    if (r.state === 'empty') return ok({ version: 1, operacionVersion: 1, secuencia: 0, lotes: [], planes: [], ejecuciones: [], eventos: [], notas: [], preparaciones: [] });
    if (r.state !== 'ok' || !r.value || r.value.version !== 1 || !Array.isArray(r.value.lotes)) {
      return err('copia_invalida', 'No se puede leer la bodega. Se conserva la copia original; no se permiten cambios.');
    }
    const d = r.value;
    if (d.operacionVersion !== undefined && (d.operacionVersion !== 1
      || !Number.isSafeInteger(d.secuencia) || !Array.isArray(d.planes)
      || !Array.isArray(d.ejecuciones) || !Array.isArray(d.eventos))) {
      return err('version_invalida', 'El historial tiene un formato incompatible. No se sobrescribió ningún dato.');
    }
    if (d.operacionVersion === 1) {
      // Notas y preparaciones llegaron despues (PROD-002): un historial que no
      // las tiene es valido y las recibe vacias. Si existen y no son listas,
      // el documento esta dañado y se bloquea como cualquier otro.
      if (d.notas === undefined) d.notas = [];
      if (d.preparaciones === undefined) d.preparaciones = [];
      if (d.resultados === undefined) d.resultados = [];
      if (!estructuraValida(d)) return err('historial_invalido', 'Hay registros incompletos en el historial. Se conserva la copia original y se bloquean los cambios.');
      return ok(d);
    }
    // El saldo previo se registra como apertura, nunca como compras inventadas.
    const instante = new Date().toISOString();
    const lotes = d.lotes.map(normalizarLote);
    if (!lotes.every(loteValido) || new Set(lotes.map((l) => l.id)).size !== lotes.length) return err('lotes_invalidos', 'La bodega anterior contiene lotes incompletos o repetidos. No se sobrescribió la copia.');
    return ok({ ...d, operacionVersion: 1, secuencia: 0, lotes, planes: [], ejecuciones: [], notas: [], preparaciones: [],
      eventos: lotes.map((lote) => ({ id: `apertura-${lote.id}`, tipo: 'apertura', instante,
        responsable: 'Migración local', motivo: 'Saldo inicial; historial anterior no disponible', antes: null, despues: lote })) });
  } catch {
    return err('lectura_fallida', 'El navegador no permite leer la bodega. No se guardó ningún cambio.');
  }
}

const textoPresente = (v) => typeof v === 'string' && v.trim().length > 0;
const numeroPosible = (v) => Number.isFinite(v) && v >= 0;
const instanteValido = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const loteValido = (l) => l && textoPresente(l.id) && textoPresente(l.ingrediente) && textoPresente(l.unidad)
  && equivalenciasValidas(l.equivalencias)
  && numeroPosible(l.pesoCompra) && l.pesoCompra > 0 && numeroPosible(l.costoCompra)
  && numeroPosible(l.existencia) && l.existencia <= l.pesoCompra;
const entradasValidas = (entradas) => Array.isArray(entradas) && entradas.every((e) => e?.recipe
  && (e.partidas === undefined || (Array.isArray(e.partidas) && e.partidas.length <= 2000 && e.partidas.every((n) => Number.isFinite(n) && n >= 0.05 && n <= 100)))
  && textoPresente(e.recipe.id) && textoPresente(e.recipe.nombre) && Number.isFinite(e.factor) && e.factor > 0
  && Array.isArray(e.recipe.componentes) && e.recipe.componentes.every((c) => Array.isArray(c?.items)
    && c.items.every((i) => i && typeof i.ingrediente === 'string' && typeof i.unidad === 'string')));
const planValido = (p) => p && fechaValida(p.fecha) && Number.isSafeInteger(p.revision) && p.revision > 0 && entradasValidas(p.entradas);

/** Areas de produccion. Copia de `CATEGORIES` para no importar el esquema aqui. */
const AREAS = ['PASTELERÍA', 'PANADERÍA', 'GALLETAS'];
export const TIPOS_DE_NOTA = Object.freeze(['tarea', 'pendiente', 'recomendacion', 'felicitacion']);
export const LARGO_MAXIMO_NOTA = 280;

/** Quien hizo algo, tal como lo dice la sesion: id, nombre y codigo. */
export const personaValida = (p) => Boolean(p) && textoPresente(p.id) && textoPresente(p.nombre)
  && typeof p.codigo === 'string';

/** Orden de los roles, el mismo de `0001_base.sql`. Sin rol, el mas bajo. */
const ORDEN_ROLES = ['operario', 'obrador', 'gerencia', 'admin'];
export const rangoDe = (persona) => Math.max(0, ORDEN_ROLES.indexOf(persona?.rol));
export const alMenos = (persona, rol) => rangoDe(persona) >= ORDEN_ROLES.indexOf(rol);

/** Un trabajador asignable: una persona con su area de produccion. */
export const trabajadorValido = (t) => personaValida(t) && AREAS.includes(t.area);

export function notaValida(n) {
  return Boolean(n) && textoPresente(n.id) && fechaValida(n.fecha) && TIPOS_DE_NOTA.includes(n.tipo)
    && textoPresente(n.texto) && n.texto.length <= LARGO_MAXIMO_NOTA
    && (n.area === null || AREAS.includes(n.area)) && typeof n.hecha === 'boolean'
    // Una nota es para todo el equipo, para un area o para una persona: nunca
    // para dos destinos a la vez. Las notas guardadas antes de que existiera
    // `persona` no traen el campo y siguen siendo validas.
    && (n.persona === undefined || n.persona === null || (personaValida(n.persona) && n.area === null))
    && Number.isSafeInteger(n.revision) && n.revision > 0
    && instanteValido(n.creada) && instanteValido(n.actualizada) && personaValida(n.autor)
    && (n.cambiadaPor === undefined || n.cambiadaPor === null || personaValida(n.cambiadaPor));
}

export function preparacionValida(p) {
  return Boolean(p) && fechaValida(p.fecha) && textoPresente(p.recetaId)
    && (p.iniciada === null || instanteValido(p.iniciada))
    && (p.iniciada === null ? p.iniciadaPor === null : personaValida(p.iniciadaPor))
    && (p.asignado === null || trabajadorValido(p.asignado))
    && (p.asignado === null ? p.asignadoPor === null : personaValida(p.asignadoPor))
    && instanteValido(p.actualizada);
}

export function resultadoValido(r) {
  const cantidad = (v) => numeroPosible(v) && v <= 1e12;
  return Boolean(r) && textoPresente(r.produccionId) && textoPresente(r.recetaId)
    && Number.isSafeInteger(r.revision) && r.revision > 0
    && ['UND', 'PORC', 'PAQ', 'CAJA', 'GR', 'KG', 'ML', 'LT'].includes(r.unidad)
    && (r.esperado === null || (cantidad(r.esperado) && r.esperado > 0))
    && cantidad(r.vendible) && cantidad(r.rechazado) && cantidad(r.vendible + r.rechazado)
    && [r.mermaPreparacionGr, r.mermaCoccionGr].every((v) => v === null || cantidad(v))
    && textoPresente(r.motivo) && r.motivo.length <= 500 && instanteValido(r.actualizado) && personaValida(r.autor);
}

function estructuraValida(d) {
  const unicos = (lista, campo) => new Set(lista.map((x) => x[campo])).size === lista.length;
  if (!Array.isArray(d.notas) || !Array.isArray(d.preparaciones)) return false;
  return d.lotes.every(loteValido) && unicos(d.lotes, 'id')
    && Array.isArray(d.resultados) && d.resultados.every((r) => resultadoValido(r)
      && d.ejecuciones.some((e) => e.id === r.produccionId && e.entradas?.some((x) => x.recipe.id === r.recetaId)))
    && new Set(d.resultados.map((r) => `${r.produccionId}|${r.recetaId}`)).size === d.resultados.length
    && d.notas.every(notaValida) && unicos(d.notas, 'id')
    && d.preparaciones.every(preparacionValida)
    && new Set(d.preparaciones.map((p) => `${p.fecha}|${p.recetaId}`)).size === d.preparaciones.length
    && d.planes.every(planValido) && unicos(d.planes, 'fecha')
    && d.ejecuciones.every((e) => e && textoPresente(e.id) && fechaValida(e.fecha) && instanteValido(e.instante)
      && textoPresente(e.responsable) && entradasValidas(e.entradas) && numeroPosible(e.costeo?.costoTotal)
      && Array.isArray(e.costeo.lineas) && e.costeo.lineas.every((l) => l && typeof l.ingrediente === 'string'
        && numeroPosible(l.consumo) && numeroPosible(l.costo) && Array.isArray(l.origen)))
    && unicos(d.ejecuciones, 'id') && d.eventos.every((e) => {
      if (!e || !textoPresente(e.id) || !instanteValido(e.instante) || !textoPresente(e.responsable)) return false;
      if (e.tipo === 'plan_guardado') return planValido(e.despues) && (!e.antes || planValido(e.antes));
      if (e.tipo === 'plan_eliminado') return fechaValida(e.fecha) && planValido(e.antes) && !e.despues;
      if (e.tipo === 'produccion_aprobada') return fechaValida(e.fecha) && textoPresente(e.produccionId);
      if (e.tipo === 'resultado_guardado') return fechaValida(e.fecha) && resultadoValido(e.despues)
        && e.produccionId === e.despues.produccionId && e.recetaId === e.despues.recetaId
        && (!e.antes || (resultadoValido(e.antes) && e.antes.produccionId === e.produccionId
          && e.antes.recetaId === e.recetaId && e.antes.revision + 1 === e.despues.revision));
      if (e.tipo === 'plan_ajustado') {
        const tandas = (v) => v === null || (Number.isFinite(v) && v > 0);
        return fechaValida(e.fecha) && textoPresente(e.recetaId) && Number.isSafeInteger(e.revision)
          && tandas(e.tandasAntes) && tandas(e.tandasDespues);
      }
      if (e.tipo === 'nota_guardada') return fechaValida(e.fecha) && notaValida(e.despues) && (!e.antes || notaValida(e.antes));
      if (e.tipo === 'nota_eliminada') return fechaValida(e.fecha) && notaValida(e.antes) && !e.despues;
      if (['preparacion_iniciada', 'preparacion_cancelada', 'receta_asignada'].includes(e.tipo)) {
        return fechaValida(e.fecha) && textoPresente(e.recetaId) && preparacionValida(e.despues)
          && (!e.antes || preparacionValida(e.antes));
      }
      return ['apertura', 'ejemplo', 'compra', 'ajuste', 'baja', 'consumo'].includes(e.tipo)
        && (e.antes || e.despues) && (!e.antes || loteValido(e.antes)) && (!e.despues || loteValido(e.despues));
    }) && unicos(d.eventos, 'id');
}

export function registrarEvento(datos, tipo, detalle) {
  datos.eventos.push({ id: nuevoId(), tipo, instante: new Date().toISOString(), ...copiar(detalle) });
}

/** Web Locks serializa todas las escrituras de esta versión entre pestañas. */
export async function transaccionOperacion(cambio) {
  if (!globalThis.navigator?.locks) return err('sin_bloqueo', 'Para guardar con seguridad, abre la aplicación por HTTPS en un navegador actualizado.');
  try {
    return await navigator.locks.request('zahavi-operacion', () => {
      const leido = leerOperacion();
      if (!leido.ok) return leido;
      const datos = copiar(leido.value);
      const resultado = cambio(datos);
      if (!resultado.ok) return resultado;
      datos.secuencia += 1;
      datos.revision = new Date().toISOString();
      const escrito = writeJson(CLAVE_OPERACION, datos);
      return escrito.ok ? ok({ resultado: resultado.value, datos }) : escrito;
    });
  } catch {
    return err('operacion_fallida', 'No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.');
  }
}
