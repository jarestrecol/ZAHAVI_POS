import { createHash } from 'node:crypto';
import { auditarOperacionLocal } from './auditoria-operacion.mjs';

const sha = v => createHash('sha256').update(v).digest('hex');
const canonico = v => Array.isArray(v) ? v.map(canonico) : v !== null && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
const huella = v => sha(JSON.stringify(canonico(v)));
const demo = l => typeof l?.demo?.catalogo === 'string' && l.demo.catalogo.trim();
const grupos = ['lotes', 'planes', 'ejecuciones', 'eventos', 'notas', 'preparaciones', 'resultados'];
const mezclar = clases => {
  const s = new Set(clases);
  if (s.has('mixto') || s.has('real_declarado') && s.has('demo')) return 'mixto';
  if (s.has('indeterminado') || !s.size) return 'indeterminado';
  return s.has('demo') ? 'demo' : s.has('real_declarado') ? 'real_declarado' : 'servicio';
};

/** Manifiesto PRIVADO: contiene datos originales; no guardar en repositorio ni servidor web. */
export function prepararImportacion(crudo, origen) {
  const auditoria = auditarOperacionLocal(crudo, origen);
  if (auditoria.bloqueos) throw new Error('resolver_bloqueos_de_auditoria');
  const datos = JSON.parse(crudo.replace(/^\uFEFF/, ''));
  const lotes = new Map(), ejecuciones = new Map();
  function recordar(l, tipo) {
    if (!l?.id || !l.ingrediente) return;
    if (!lotes.has(l.id)) lotes.set(l.id, { real: false, demo: false });
    const r = lotes.get(l.id);
    r.demo ||= Boolean(demo(l) || tipo === 'ejemplo');
    r.real ||= tipo === 'compra' && !demo(l);
  }
  for (const e of datos.eventos || []) {
    if (['apertura', 'ejemplo', 'compra', 'ajuste', 'baja', 'consumo'].includes(e.tipo)) {
      recordar(e.antes); recordar(e.despues, e.tipo);
    }
  }
  for (const l of datos.lotes) recordar(l);
  const claseLote = id => {
    const l = lotes.get(id);
    return !l ? 'indeterminado' : l.real && l.demo ? 'mixto' : l.demo ? 'demo' : l.real ? 'real_declarado' : 'indeterminado';
  };
  for (const e of datos.ejecuciones || []) {
    const origenes = e.costeo.lineas.flatMap(l => l.origen || []).map(o => o.loteId);
    ejecuciones.set(e.id, { lotes: origenes, clase: mezclar(origenes.length
      ? origenes.map(claseLote) : e.costeo.lineas.map(l => l.servicio && l.costo === 0 ? 'servicio' : 'indeterminado')) });
  }
  // Una mezcla afecta también los saldos de los lotes reales consumidos y sus
  // otras ejecuciones. Cuarentena transitiva, sin recalcular ni devolver stock.
  const lotesRevisar = new Set([...lotes.keys()].filter(id => ['mixto', 'indeterminado'].includes(claseLote(id))));
  const ejecucionesRevisar = new Set();
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const [id, e] of ejecuciones) {
      if (['mixto', 'indeterminado'].includes(e.clase) || e.lotes.some(l => lotesRevisar.has(l))) {
        if (!ejecucionesRevisar.has(id)) { ejecucionesRevisar.add(id); cambio = true; }
        for (const l of e.lotes) if (!lotesRevisar.has(l)) { lotesRevisar.add(l); cambio = true; }
      }
    }
  }
  const filas = [];
  for (const entidad of grupos) for (const registro of datos[entidad] || []) {
    const id = entidad === 'planes' ? registro.fecha : entidad === 'preparaciones'
      ? JSON.stringify([registro.fecha, registro.recetaId]) : entidad === 'resultados'
        ? JSON.stringify([registro.produccionId, registro.recetaId]) : registro.id;
    let clase = 'indeterminado', revisar = true;
    if (entidad === 'lotes') { clase = claseLote(id); revisar = lotesRevisar.has(id); }
    if (entidad === 'ejecuciones') { clase = ejecuciones.get(id).clase; revisar = ejecucionesRevisar.has(id); }
    if (entidad === 'resultados' || entidad === 'eventos') {
      const e = ejecuciones.get(registro.produccionId);
      if (e) { clase = e.clase; revisar = ejecucionesRevisar.has(registro.produccionId); }
      else if (entidad === 'eventos' && ['apertura', 'ejemplo', 'compra', 'ajuste', 'baja', 'consumo'].includes(registro.tipo)) {
        const lote = registro.despues?.id || registro.antes?.id;
        clase = claseLote(lote); revisar = lotesRevisar.has(lote);
      }
    }
    filas.push({ clave: huella([auditoria.origenHuella, entidad, id]), entidad, idOrigen: id,
      huella: huella(registro), clase, destino: revisar || ['mixto', 'indeterminado', 'servicio'].includes(clase)
        ? 'revision' : clase === 'demo' ? 'demo' : 'real_por_confirmar', registro });
  }
  return { version: 1, origenHuella: auditoria.origenHuella, contenidoHuella: auditoria.contenidoHuella,
    archivoHuella: auditoria.archivoHuella, filas, auditoria,
    listoParaImportar: false, escrituras: 0,
    conteos: Object.fromEntries(['revision', 'demo', 'real_por_confirmar'].map(d => [d, filas.filter(f => f.destino === d).length])) };
}

/** Ensayo de correspondencias en memoria, NO importación PostgreSQL ni conciliación contable. */
export function ensayarCorrespondencias(manifiestos) {
  const contenidos = new Map(), filas = new Map(), conflictos = [];
  let repetidas = 0, copias = 0;
  for (const m of manifiestos) {
    const anterior = contenidos.get(m.contenidoHuella);
    if (anterior && anterior !== m.origenHuella) {
      copias++; conflictos.push({ codigo: 'copia_en_otro_origen', contenidoHuella: m.contenidoHuella }); continue;
    }
    contenidos.set(m.contenidoHuella, m.origenHuella);
    for (const f of m.filas) {
      const previa = filas.get(f.clave);
      if (!previa) filas.set(f.clave, structuredClone(f));
      else if (previa.huella === f.huella) {
        repetidas++;
        if (previa.clase !== f.clase || previa.destino !== f.destino) conflictos.push({ codigo: 'clasificacion_divergente', clave: f.clave });
      } else conflictos.push({ codigo: 'registro_divergente', clave: f.clave });
    }
  }
  return { filas: [...filas.values()], repetidas, copias, conflictos, escrituras: 0, listoParaImportar: false };
}
