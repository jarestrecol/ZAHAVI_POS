import { consolidar } from './plan.js';
import { costearPlan } from './costeo.js';
import { CATEGORIES } from './schema.js';

/** Valora el conjunto una vez por FEFO y reparte el costo por cantidad usada.
 * No promete el mismo stock a cada área. Admite costos históricos congelados. */
export function ordenesPorArea(entradas, lotes, fecha, registrado = null) {
  const plan = consolidar(entradas);
  const costeo = registrado || costearPlan(plan.lineas, lotes, fecha);
  const costos = new Map(entradas.map((e) => [e.recipe.id, 0]));
  const incompletas = new Set();
  for (const linea of plan.lineas) {
    const valor = costeo.lineas.find((l) => l.ingrediente === linea.ingrediente && (l.unidadReceta ?? l.unidad) === linea.unidad);
    let acumulado = 0, repartido = 0;
    for (const origen of linea.recetas) {
      acumulado += origen.cantidad;
      const hasta = Math.round((valor?.costo || 0) * acumulado / linea.cantidad);
      costos.set(origen.id, (costos.get(origen.id) || 0) + hasta - repartido);
      repartido = hasta;
      if (!valor || valor.faltante > 0 || valor.estado !== 'ok') incompletas.add(origen.id);
    }
  }
  const categorias = [...CATEGORIES, ...new Set(entradas.map((e) => e.recipe.categoria).filter((c) => !CATEGORIES.includes(c)))];
  return categorias.map((categoria) => {
    const recetas = entradas.filter((e) => e.recipe.categoria === categoria).map((e) => ({
      ...e, costo: costos.get(e.recipe.id) || 0, incompleto: incompletas.has(e.recipe.id),
    }));
    return { categoria, entradas: recetas, plan: consolidar(recetas),
      costo: recetas.reduce((s, e) => s + e.costo, 0), incompleto: recetas.some((e) => e.incompleto) };
  }).filter((g) => g.entradas.length);
}
