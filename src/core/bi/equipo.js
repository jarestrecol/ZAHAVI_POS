/**
 * =============================================================================
 *  INDICADORES DEL EQUIPO
 * =============================================================================
 *
 *  Quien produjo que, cuanto tarda una receta desde que se empieza hasta que se
 *  confirma, y como van las tareas y felicitaciones del calendario.
 *
 *  La persona de una produccion es quien la confirmo (la sesion firmo la
 *  confirmacion). Las confirmaciones antiguas sin firma cuentan por el nombre
 *  del responsable escrito; no se inventa un id.
 *
 *  El tiempo es la MEDIANA, no el promedio: una receta que se quedo empezada
 *  toda la mañana no debe hacer parecer lento a todo el equipo.
 */

import { CATEGORIES } from '../schema.js';
import {
  crearIndicador, enRango, sumarCampo, porcentaje, dividir, mediana, areasDe, plural, cifraCorta, vaciarIndicadores,
} from './periodos.js';

const clavePersona = (p) => (p.id ? `id:${p.id}` : `nombre:${p.nombre}`);
const ABIERTAS = ['tarea', 'pendiente'];

export function seccionEquipo(hechos, { rango }) {
  const actual = hechos.producciones.filter((p) => enRango(p.fecha, rango));
  const previo = hechos.producciones.filter((p) => enRango(p.fecha, rango.anterior));
  const personasDe = (filas) => new Set(filas.map((p) => clavePersona(p.persona))).size;
  const tiempos = hechos.tiempos.filter((t) => enRango(t.fecha, rango));
  const tiemposPrevios = hechos.tiempos.filter((t) => enRango(t.fecha, rango.anterior));

  const recetasHoy = hechos.planeado.filter((p) => p.fecha === hechos.hoy);
  const asignadasHoy = recetasHoy.filter((p) => hechos.preparaciones
    .some((x) => x.fecha === p.fecha && x.recetaId === p.recetaId && x.asignado)).length;

  const abiertas = hechos.notas.filter((n) => ABIERTAS.includes(n.tipo) && !n.hecha && n.fecha <= hechos.hoy);
  const notasPeriodo = hechos.notas.filter((n) => enRango(n.fecha, rango));
  const felicitaciones = (r) => hechos.notas.filter((n) => n.tipo === 'felicitacion' && enRango(n.fecha, r)).length;

  const indicadores = [
    crearIndicador({ id: 'personas_activas', nombre: 'Personas que produjeron', valor: personasDe(actual), anterior: personasDe(previo),
      formato: 'numero', definicion: 'Personas distintas que confirmaron al menos una receta en el periodo.' }),
    crearIndicador({ id: 'recetas_por_persona', nombre: 'Recetas por persona', valor: dividir(actual.length, personasDe(actual)),
      anterior: dividir(previo.length, personasDe(previo)), formato: 'numero',
      base: plural(actual.length, 'receta confirmada', 'recetas confirmadas'),
      definicion: 'Recetas confirmadas en el periodo ÷ personas que confirmaron.' }),
    crearIndicador({ id: 'tiempo_preparacion', nombre: 'Tiempo de preparación', valor: mediana(tiempos.map((t) => t.minutos)),
      anterior: mediana(tiemposPrevios.map((t) => t.minutos)), formato: 'minutos', sentido: 'bajar',
      base: `${plural(tiempos.length, 'receta cronometrada', 'recetas cronometradas')}`,
      definicion: 'Mediana del tiempo entre «Empezar» y «Marcar lista» de cada receta. Solo cuentan las recetas que se empezaron en la aplicación; se descartan las de más de 24 horas.' }),
    crearIndicador({ id: 'asignadas', nombre: 'Recetas de hoy asignadas', valor: porcentaje(asignadasHoy, recetasHoy.length), formato: 'porcentaje',
      sentido: 'subir', base: `${cifraCorta(asignadasHoy)} de ${plural(recetasHoy.length, 'receta')} de hoy`,
      definicion: 'Recetas del plan de hoy que tienen a alguien asignado ÷ recetas del plan de hoy.' }),
    crearIndicador({ id: 'tareas_abiertas', nombre: 'Tareas y pendientes abiertos', valor: abiertas.length, formato: 'numero', sentido: 'bajar',
      definicion: 'Notas de tipo tarea o pendiente, con fecha de hoy o anterior, que nadie ha marcado como hechas.' }),
    crearIndicador({ id: 'felicitaciones', nombre: 'Felicitaciones', valor: felicitaciones(rango), anterior: felicitaciones(rango.anterior),
      formato: 'numero', sentido: 'subir', definicion: 'Felicitaciones escritas en el calendario con fecha dentro del periodo.' }),
  ];

  const personasMapa = new Map();
  for (const p of actual) {
    const k = clavePersona(p.persona);
    const fila = personasMapa.get(k) || { id: p.persona.id, nombre: p.persona.nombre, recetas: 0, tandas: 0, porArea: {}, costo: 0 };
    fila.recetas += 1;
    fila.tandas += p.tandas;
    fila.porArea[p.area] = (fila.porArea[p.area] || 0) + p.tandas;
    fila.costo += p.costo;
    personasMapa.set(k, fila);
  }
  const personas = [...personasMapa.values()].map((f) => {
    for (const a of CATEGORIES) f.porArea[a] = f.porArea[a] || 0;
    return f;
  }).sort((a, b) => b.tandas - a.tandas || a.nombre.localeCompare(b.nombre, 'es'));

  const porAreaTiempos = areasDe(hechos.producciones, hechos.tiempos).map((area) => {
    const min = tiempos.filter((t) => t.area === area).map((t) => t.minutos);
    return { area, mediana: mediana(min), promedio: dividir(sumarCampo(min), min.length), n: min.length };
  });

  const porTipo = { tarea: 0, pendiente: 0, recomendacion: 0, felicitacion: 0 };
  for (const n of notasPeriodo) if (Object.hasOwn(porTipo, n.tipo)) porTipo[n.tipo] += 1;
  const notas = {
    abiertas: notasPeriodo.filter((n) => ABIERTAS.includes(n.tipo) && !n.hecha).length,
    hechas: notasPeriodo.filter((n) => n.hecha).length,
    porTipo,
  };

  const sinHistoria = !hechos.producciones.length && !hechos.notas.length && !hechos.planeado.length;
  return { indicadores: sinHistoria ? vaciarIndicadores(indicadores) : indicadores, personas, tiempos: porAreaTiempos, notas };
}
