/** Equivalencias de peso neto propias del ingrediente, guardadas con la compra. */
const ALIAS = Object.freeze({ G: 'GR', GRAMO: 'GR', GRAMOS: 'GR', KILOGRAMO: 'KG', KILOGRAMOS: 'KG',
  L: 'LT', LITRO: 'LT', LITROS: 'LT', MILILITRO: 'ML', MILILITROS: 'ML',
  UN: 'UND', UNIDAD: 'UND', UNIDADES: 'UND', TANDAS: 'TANDA' });
export const UNIDADES_COMPRA = Object.freeze(['GR', 'KG', 'MG', 'LT', 'ML', 'UND', 'TANDA', 'CM']);
export const MEDIDAS_EQUIVALENCIA = Object.freeze(['ML', 'UND', 'TANDA', 'CM']);
/** Agua de proceso, no incluye mezclas como AGUA / LECHE. */
export function esAguaDeProceso(nombre) {
  return /^AGUA(?:\s*\(\s*(?:CALIENTE|FRIA|TIBIA)\s*\))?$/.test(String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase());
}
export function unidadCanonica(unidad) {
  const u = String(unidad || '').trim().toUpperCase();
  return Object.hasOwn(ALIAS, u) ? ALIAS[u] : u;
}
export function factorGramos(unidad, equivalencias = {}) {
  const u = unidadCanonica(unidad);
  if (u === 'GR') return 1;
  if (u === 'KG') return 1000;
  if (u === 'MG') return 0.001;
  const factor = equivalencias?.[u === 'LT' ? 'ML' : u];
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) return null;
  const resultado = factor * (u === 'LT' ? 1000 : 1);
  return Number.isFinite(resultado) ? resultado : null;
}
export function equivalenciasValidas(valor) {
  return valor === undefined || (valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    && Object.entries(valor).every(([u, n]) => MEDIDAS_EQUIVALENCIA.includes(u)
      && typeof n === 'number' && Number.isFinite(n) && n > 0));
}
export function normalizarEquivalencias(valor) {
  return Object.fromEntries(MEDIDAS_EQUIVALENCIA.filter((u) => valor?.[u] !== undefined && valor[u] !== '')
    .map((u) => [u, Number(String(valor[u]).trim().replace(',', '.'))]));
}
