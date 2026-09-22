import { estadoVencimiento, lotesOrdenadosFEFO, resumenAlmacen, valorUnitario, claveDe } from './almacen.js';
import { catalogoIngredientes, resumenCatalogo } from './ingredients.js';

/** Indicadores derivados: no modifican registros ni representan ventas. */
export function resumenOperacion(recipes = [], lotes = [], hoy) {
  const catalogo = catalogoIngredientes(recipes);
  const categorias = new Map();
  for (const receta of recipes) {
    const nombre = receta.categoria || 'OTROS';
    categorias.set(nombre, (categorias.get(nombre) || 0) + 1);
  }
  const activos = lotes.filter((l) => l.existencia > 0);
  const revisar = lotesOrdenadosFEFO(activos.filter((l) => ['vencido', 'proximo'].includes(estadoVencimiento(l, hoy))));
  return {
    bodega: resumenAlmacen(lotes, hoy), catalogo: resumenCatalogo(catalogo),
    categorias: [...categorias].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
    revisar,
    valorEnRiesgo: revisar.reduce((suma, lote) => suma + (valorUnitario(lote) || 0) * lote.existencia, 0),
    sinFecha: activos.filter((l) => !l.vencimiento).length,
    sinMetodo: recipes.filter((r) => !(r.metodo || '').trim()).length,
  };
}

/** Misma clave nombre/unidad empleada por el costeo; excluye lotes vencidos. */
export function stockPorUnidad(lotes = [], hoy) {
  const stock = new Map();
  for (const lote of lotes) {
    if (!(lote.existencia > 0) || estadoVencimiento(lote, hoy) === 'vencido') continue;
    const clave = claveDe(lote.ingrediente, lote.unidad);
    stock.set(clave, (stock.get(clave) || 0) + Number(lote.existencia));
  }
  return stock;
}
