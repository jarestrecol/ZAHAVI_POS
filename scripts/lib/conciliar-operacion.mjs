import { createHash } from 'node:crypto';
const canonico = v => Array.isArray(v) ? v.map(canonico) : v !== null && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
const huella = v => createHash('sha256').update(JSON.stringify(canonico(v))).digest('hex');
// Exigir texto decimal desde PostgreSQL: un Number puede haber perdido precisi?n antes de llegar aqu?.
function decimal(v) {
  if (typeof v !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/.test(v)) throw new Error('decimal_debe_ser_texto_exacto');
  let [entero, fraccion = ''] = v.split('.');
  const negativo = entero.startsWith('-');
  entero = entero.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '');
  fraccion = fraccion.replace(/0+$/, '');
  const cero = entero === '0' && !fraccion;
  return (negativo && !cero ? '-' : '') + entero + (fraccion ? '.' + fraccion : '');
}
const esquema = {
  lotes: { decimales: ['existencia', 'peso_compra', 'costo_compra'], datos: ['unidad', 'equivalencias'] },
  ejecuciones: { decimales: ['costo_total'], datos: ['costeo', 'formula'] },
  resultados: { decimales: ['vendible', 'rechazado'], datos: ['detalle'] },
};
function validar(copia) {
  if (!copia || copia.version !== 1 || !copia.proyecto || !copia.capturada || copia.completa !== true) throw new Error('captura_incompleta');
  const indices = {};
  for (const [grupo, campos] of Object.entries(esquema)) {
    if (!Array.isArray(copia[grupo])) throw new Error('coleccion_ausente');
    const mapa = new Map();
    for (const fila of copia[grupo]) {
      if (!fila || typeof fila.id !== 'string' || !fila.id.trim() || mapa.has(fila.id)) throw new Error('identidad_ausente_o_duplicada');
      for (const campo of campos.decimales) decimal(fila[campo]);
      for (const campo of campos.datos) if (fila[campo] === undefined || fila[campo] === null) throw new Error('campo_ausente');
      mapa.set(fila.id, fila);
    }
    indices[grupo] = mapa;
  }
  return indices;
}
/** Comparaci?n privada, sin escritura ni acceso a red. No valida una fuente contra s? misma. */
export function conciliarOperacion(antes, despues) {
  const a = validar(antes), b = validar(despues), diferencias = [];
  if (antes.proyecto !== despues.proyecto) throw new Error('proyectos_distintos_requieren_mapeo_aprobado');
  const agregar = (grupo, id, campo, tipo) => diferencias.push({ grupo, identidadHuella: huella([grupo, id]), campo, tipo });
  for (const [grupo, campos] of Object.entries(esquema)) {
    for (const [id, original] of a[grupo]) {
      const actual = b[grupo].get(id);
      if (!actual) { agregar(grupo, id, null, 'faltante'); continue; }
      for (const campo of campos.decimales) if (decimal(original[campo]) !== decimal(actual[campo])) agregar(grupo, id, campo, 'valor');
      for (const campo of campos.datos) if (huella(original[campo]) !== huella(actual[campo])) agregar(grupo, id, campo, 'contenido');
    }
    for (const id of b[grupo].keys()) if (!a[grupo].has(id)) agregar(grupo, id, null, 'nuevo');
  }
  return { version: 1, coincide: diferencias.length === 0, diferencias,
    conteos: Object.fromEntries(Object.keys(esquema).map(g => [g, { antes: a[g].size, despues: b[g].size }])),
    huellaAntes: huella(antes), huellaDespues: huella(despues), autorizaCorte: false };
}
