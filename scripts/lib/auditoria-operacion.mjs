/** Diagnóstico previo al importador. Solo lee; no certifica saldos ni autoría remota. */
import { createHash } from 'node:crypto';
import { factorGramos, equivalenciasValidas } from '../../src/core/conversiones.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texto = (v) => typeof v === 'string' && v.trim().length > 0;
const numero = (v) => Number.isFinite(v) && v >= 0;
const canonico = (v) => Array.isArray(v) ? v.map(canonico) : objeto(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
const grupos = ['lotes', 'planes', 'ejecuciones', 'eventos', 'notas', 'preparaciones', 'resultados'];
const vacio = () => ({ real_declarado: 0, demo: 0, mixto: 0, indeterminado: 0, servicio: 0 });
const marcaDemo = (l) => objeto(l?.demo) && texto(l.demo.catalogo);
const combinar = (tipos) => {
  const s = new Set(tipos);
  if (s.has('mixto') || (s.has('demo') && s.has('real_declarado'))) return 'mixto';
  if (s.has('indeterminado') || !s.size) return 'indeterminado';
  return s.has('demo') ? 'demo' : s.has('real_declarado') ? 'real_declarado' : 'servicio';
};

export function auditarOperacionLocal(crudo, origen) {
  if (typeof crudo !== 'string' || !texto(origen)) throw new Error('entrada_o_origen_invalido');
  if (Buffer.byteLength(crudo) > 64 * 1024 * 1024) throw new Error('respaldo_supera_64_mb');
  let d;
  try { d = JSON.parse(crudo.replace(/^\uFEFF/, '')); } catch { throw new Error('json_invalido'); }
  if (!objeto(d) || d.version !== 1 || !Array.isArray(d.lotes)) throw new Error('documento_operativo_invalido');
  // No aceptar una exportación de todo localStorage, tokens o credenciales anidadas.
  const cola = [[d, 0]];
  while (cola.length) {
    const [v, profundidad] = cola.pop();
    if (profundidad > 128) throw new Error('documento_demasiado_profundo');
    if (!v || typeof v !== 'object') continue;
    for (const [k, val] of Object.entries(v)) {
      if (/^(?:access_token|refresh_token|authorization|password|pin|secret|service_role|supabase_secret_key|zahavi_sesion_v\d+)$/i.test(k)) {
        throw new Error('documento_contiene_credenciales');
      }
      if (val && typeof val === 'object') cola.push([val, profundidad + 1]);
    }
  }
  const hallazgos = [];
  const anotar = (codigo, ubicacion, nivel = 'bloqueo') => hallazgos.push({ codigo, ubicacion, nivel });
  if (d.operacionVersion === undefined) anotar('formato_legacy_requiere_apertura', 'raiz', 'revision');
  else if (d.operacionVersion !== 1) anotar('version_no_soportada', 'raiz');
  if (d.operacionVersion === 1 && (!Number.isSafeInteger(d.secuencia) || d.secuencia < 0)) anotar('secuencia_invalida', 'raiz');
  const listas = {};
  for (const g of grupos) {
    if (d[g] === undefined && g !== 'lotes') {
      listas[g] = [];
      anotar('coleccion_ausente_no_inferir_vacia', g, 'revision');
    } else if (!Array.isArray(d[g])) { listas[g] = []; anotar('coleccion_invalida', g); }
    else listas[g] = d[g];
  }
  for (const g of grupos) {
    const usados = new Set();
    listas[g].forEach((v, i) => {
      const id = !objeto(v) ? null : g === 'planes' ? v.fecha : g === 'resultados'
        ? texto(v.produccionId) && texto(v.recetaId) ? `${v.produccionId}|${v.recetaId}` : null
        : g === 'preparaciones' ? texto(v.fecha) && texto(v.recetaId) ? `${v.fecha}|${v.recetaId}` : null : v.id;
      if (!texto(id)) anotar('registro_sin_identidad', `${g}[${i}]`);
      else if (usados.has(id)) anotar('identidad_duplicada', `${g}[${i}]`);
      usados.add(id);
    });
  }
  const lotes = new Map();
  const recordar = (l, evento = null) => {
    if (!objeto(l) || !texto(l.id) || !texto(l.ingrediente)) return;
    if (!lotes.has(l.id)) lotes.set(l.id, { demo: false, real: false });
    const r = lotes.get(l.id);
    if (marcaDemo(l) || evento === 'ejemplo') r.demo = true;
    if (evento === 'compra' && !marcaDemo(l)) r.real = true;
  };
  const tiposLote = new Set(['apertura', 'ejemplo', 'compra', 'ajuste', 'baja', 'consumo']);
  listas.eventos.forEach((e, i) => {
    if (!objeto(e)) return;
    if (tiposLote.has(e.tipo)) {
      recordar(e.antes); recordar(e.despues, e.tipo);
      if (!e.antes && !e.despues) anotar('evento_lote_sin_traza', `eventos[${i}]`);
      if (e.antes?.id && e.despues?.id && e.antes.id !== e.despues.id) anotar('evento_cambia_identidad_lote', `eventos[${i}]`);
    }
  });
  listas.lotes.forEach(l => recordar(l));
  const tipoLote = (id) => {
    const r = lotes.get(id);
    return !r ? 'indeterminado' : r.demo && r.real ? 'mixto' : r.demo ? 'demo' : r.real ? 'real_declarado' : 'indeterminado';
  };
  const clasificacionLotes = vacio();
  const saldosPorUnidad = Object.create(null);
  listas.lotes.forEach((l, i) => {
    const sitio = `lotes[${i}]`;
    if (!objeto(l)) return;
    clasificacionLotes[tipoLote(l.id)]++;
    if (!texto(l.ingrediente) || !texto(l.unidad)) anotar('lote_sin_ingrediente_o_unidad', sitio);
    if (!numero(l.pesoCompra) || l.pesoCompra <= 0 || !numero(l.existencia) || l.existencia > l.pesoCompra) anotar('saldo_invalido', sitio);
    if (!numero(l.costoCompra)) anotar('costo_ausente_o_invalido', sitio, 'revision');
    if (!equivalenciasValidas(l.equivalencias)) anotar('equivalencias_invalidas', sitio);
    const f = factorGramos(l.unidad, l.equivalencias);
    if (f === null) anotar('sin_equivalencia_gramos', sitio, 'revision');
    if (numero(l.existencia) && texto(l.unidad)) saldosPorUnidad[l.unidad] = (saldosPorUnidad[l.unidad] || 0) + l.existencia;
  });
  const ejecuciones = new Map(listas.ejecuciones.filter(objeto).map(e => [e.id, e]));
  const clasificacionEjecuciones = vacio();
  let costoHistoricoDeclarado = 0;
  listas.ejecuciones.forEach((e, i) => {
    if (!objeto(e)) return;
    const sitio = `ejecuciones[${i}]`, tipos = [];
    if (!Array.isArray(e.entradas) || !e.entradas.length) anotar('ejecucion_sin_formula', sitio);
    else e.entradas.forEach((en, j) => {
      if (!texto(en?.recipe?.id) || !Array.isArray(en.recipe.componentes) || !numero(en.factor) || en.factor === 0) anotar('formula_invalida', `${sitio}.entradas[${j}]`);
    });
    const lineas = e.costeo?.lineas;
    if (!Array.isArray(lineas) || !lineas.length) anotar('ejecucion_sin_costeo', sitio);
    let suma = 0, completo = true;
    for (const [j, l] of (Array.isArray(lineas) ? lineas : []).entries()) {
      if (!objeto(l)) { anotar('linea_invalida', `${sitio}.lineas[${j}]`); completo = false; continue; }
      if (!numero(l.costo)) { completo = false; anotar('costo_linea_incompleto', `${sitio}.lineas[${j}]`, 'revision'); }
      else suma += l.costo;
      if (l.servicio === true && l.costo === 0 && Array.isArray(l.origen) && !l.origen.length) { tipos.push('servicio'); continue; }
      if (!Array.isArray(l.origen) || !l.origen.length) { tipos.push('indeterminado'); anotar('consumo_sin_lote', `${sitio}.lineas[${j}]`); continue; }
      l.origen.forEach((o, k) => {
        if (!objeto(o) || !lotes.has(o.loteId)) anotar('lote_origen_no_encontrado', `${sitio}.lineas[${j}].origen[${k}]`);
        if (!numero(o?.cantidad) || o.cantidad <= 0 || !numero(o?.costo)) anotar('tramo_invalido', `${sitio}.lineas[${j}].origen[${k}]`);
        tipos.push(tipoLote(o?.loteId));
      });
    }
    if (!numero(e.costeo?.costoTotal)) anotar('costo_total_invalido', sitio);
    else {
      costoHistoricoDeclarado += e.costeo.costoTotal;
      if (completo && Math.abs(suma - e.costeo.costoTotal) > 0.000001) anotar('costo_total_no_cuadra', sitio);
    }
    const tipo = combinar(tipos);
    clasificacionEjecuciones[tipo]++;
    if (tipo === 'mixto' || tipo === 'indeterminado') anotar('procedencia_por_resolver', sitio, 'revision');
  });
  listas.eventos.forEach((e, i) => {
    if (objeto(e) && e.produccionId && !ejecuciones.has(e.produccionId)) anotar('evento_ejecucion_huerfana', `eventos[${i}]`);
  });
  listas.resultados.forEach((r, i) => {
    const e = ejecuciones.get(r?.produccionId);
    if (!e || !Array.isArray(e.entradas) || !e.entradas.some(en => en?.recipe?.id === r.recetaId)) anotar('resultado_huerfano', `resultados[${i}]`);
    if (!numero(r?.vendible) || !numero(r?.rechazado)) anotar('resultado_cantidad_invalida', `resultados[${i}]`);
  });
  listas.planes.forEach((p, i) => {
    if (!objeto(p) || !Array.isArray(p.entradas)) { anotar('plan_invalido', `planes[${i}]`); return; }
    p.entradas.forEach((en, j) => {
      if (!texto(en?.recipe?.id) || !numero(en?.factor) || en.factor <= 0) anotar('entrada_plan_invalida', `planes[${i}].entradas[${j}]`);
      if (en?.partidas !== undefined && (!Array.isArray(en.partidas) || en.partidas.some(n => !Number.isFinite(n) || n < 0.05 || n > 100))) {
        anotar('partidas_invalidas', `planes[${i}].entradas[${j}]`);
      }
    });
  });
  const indeterminados = clasificacionLotes.indeterminado + clasificacionLotes.mixto;
  if (!Number.isFinite(costoHistoricoDeclarado) || Object.values(saldosPorUnidad).some(n => !Number.isFinite(n))) throw new Error('totales_fuera_de_rango');
  const idsActuales = new Set(listas.lotes.map(l => l?.id));
  if (indeterminados) anotar('lotes_sin_procedencia_resuelta', 'lotes', 'revision');
  return {
    versionInforme: 1, origenHuella: sha(origen.trim()), archivoHuella: sha(crudo),
    contenidoHuella: sha(JSON.stringify(canonico(d))), bytes: Buffer.byteLength(crudo),
    conteos: Object.fromEntries(grupos.map(g => [g, listas[g].length])),
    lotesHistoricosRetirados: [...lotes.keys()].filter(id => !idsActuales.has(id)).length,
    clasificacion: { lotes: clasificacionLotes, ejecuciones: clasificacionEjecuciones },
    conciliacion: { saldosPorUnidad, costoHistoricoDeclarado, costoRecalculado: false },
    hallazgos, bloqueos: hallazgos.filter(h => h.nivel === 'bloqueo').length,
    revisiones: hallazgos.filter(h => h.nivel === 'revision').length,
    listoParaImportar: false,
    siguiente: 'Conciliar este diagnóstico con las fuentes reales y la auditoría remota. No autoriza importación ni borra datos.',
  };
}
