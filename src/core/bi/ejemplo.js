/**
 * =============================================================================
 *  OPERACION DE EJEMPLO PARA EL PANEL DE RESUMEN
 * =============================================================================
 *
 *  El gerente tiene que poder ver el panel funcionando antes de que la
 *  panaderia acumule historia real. Este modulo fabrica, EN MEMORIA, un
 *  documento con la misma forma que `leerOperacion()` que simula varias semanas
 *  de trabajo: bodega, programacion, preparacion receta a receta, resultados,
 *  compras de reposicion, bajas y notas.
 *
 *  POR QUE SE EJECUTA EL NUCLEO REAL EN VEZ DE ESCRIBIR LOS DATOS A MANO. Los
 *  costos FEFO, los consumos por lote, las trazas y las validaciones son
 *  justamente lo que el panel resume. Escritos a mano mentirian en cuanto
 *  cambiara una regla del nucleo; ejecutando `guardarPlanEn`,
 *  `confirmarRecetaEn`, `aprobarPlanEn`, `guardarResultadoEn`, `guardarNotaEn`,
 *  etc. sobre un documento en memoria, el ejemplo dice lo mismo que diria la
 *  operacion de verdad, y si una regla lo rechaza, el ejemplo falla en vez de
 *  enseñar cifras imposibles.
 *
 *  EL RELOJ. El nucleo sella cada cambio con la hora REAL (`new Date()`). Tras
 *  cada llamada se recorre SOLO lo recien creado y cada instante posterior al
 *  comienzo de la generacion se reescribe a la hora simulada de ese dia en
 *  Bogota (UTC-5). Ningun instante simulado puede confundirse con uno real: los
 *  simulados son siempre anteriores al comienzo (los de hoy se recortan a un
 *  minuto antes de ahora). Al final se comprueba el documento entero.
 *
 *  DETERMINISTA. Todo el azar sale de un generador con semilla (mulberry32) y
 *  los identificadores aleatorios del nucleo (`crypto.randomUUID`) se renumeran
 *  en orden de aparicion. Con la misma semilla y el mismo `hoy` pasado, el JSON
 *  es identico. (Con `hoy` = hoy real, lo de hoy se recorta a la hora actual y
 *  por eso depende de cuando se genere.)
 *
 *  NUNCA TOCA EL ALMACENAMIENTO: no llama a `leerOperacion` ni a
 *  `transaccionOperacion`, ni a nada de `storage.js` salvo `ok`/`err`. Es solo
 *  para pantalla, y la pantalla avisa de que es un ejemplo.
 *
 *  DECISIONES DE DATOS (ficticias, no calibran nada real):
 *   - La apertura sale de `lotesDemo(inicio, recetas)` con una parte ya usada
 *     (25-60 %), para que la reposicion empiece en las primeras semanas.
 *   - Los vencimientos de la apertura se llevan mas alla de hoy, salvo el lote
 *     vencido a proposito de `lotesDemo` y unos pocos elegidos para darse de
 *     baja: sin eso, ciento y pico perecederos vencerian a la vez y el panel
 *     solo hablaria de eso.
 *   - La reposicion va por punto de reorden (menos de 5 dias de consumo medio)
 *     y compra para 25-40 dias. Antes de confirmar se comprueba el costo; si
 *     faltara algo se compra antes, porque todo lo confirmado debe tener costo
 *     completo. Asi los lotes no crecen sin control y el costeo sigue rapido.
 */

import { hoyLocal, fechaValida, sumarDias, copiar, registrarEvento } from '../bitacora.js';
import { guardarPlanEn, fijarRecetaEn, costeoPendiente, aprobarPlanEn } from '../produccion.js';
import {
  iniciarPreparacionEn, cancelarPreparacionEn, asignarRecetaEn, confirmarRecetaEn,
} from '../preparacion.js';
import { guardarResultadoEn, rendimientoPrevisto } from '../resultados-produccion.js';
import { guardarNotaEn, nombreResponsable } from '../notas.js';
import { lotesDemo, normalizarLote, validarLote, valorUnitario, claveDe, estadoVencimiento } from '../almacen.js';
import { costearPlan } from '../costeo.js';
import { consolidar } from '../plan.js';
import { factorGramos } from '../conversiones.js';
import { CATEGORIES } from '../schema.js';
import { ok, err } from '../storage.js';

export const DIAS_MAXIMOS_EJEMPLO = 366;

/** Cinco personas ficticias. El nombre dice «(ejemplo)» para que nadie las crea reales. */
const JEFE = { id: 'ejemplo-persona-1', nombre: 'Marta Gómez (ejemplo)', codigo: 'EJMARTA', rol: 'obrador', area: 'PANADERÍA' };
export const PERSONAS_EJEMPLO = Object.freeze([
  JEFE,
  { id: 'ejemplo-persona-2', nombre: 'Luis Pérez (ejemplo)', codigo: 'EJLUIS', rol: 'operario', area: 'PANADERÍA' },
  { id: 'ejemplo-persona-3', nombre: 'Ana Ruiz (ejemplo)', codigo: 'EJANA', rol: 'operario', area: 'PASTELERÍA' },
  { id: 'ejemplo-persona-4', nombre: 'Camila Rojas (ejemplo)', codigo: 'EJCAMILA', rol: 'operario', area: 'PASTELERÍA' },
  { id: 'ejemplo-persona-5', nombre: 'Jorge Díaz (ejemplo)', codigo: 'EJJORGE', rol: 'operario', area: 'GALLETAS' },
].map((p) => Object.freeze(p)));

/** Proveedor ficticio por familia; gana la primera coincidencia. */
const PROVEEDORES = [
  [/HUEVO|YEMAS|CLARAS/, 'Avícola El Rosal (ejemplo)'],
  [/CHOCOLATE|CACAO|COCOA|NUTELLA|CHOCOLYNE|GANACHE/, 'Chocolatería Andina (ejemplo)'],
  [/LECHE|MANTEQUILLA|MARGARINA|CREMA|QUESO|YOGURT|AREQUIPE|BUTTER/, 'Lácteos La Pradera (ejemplo)'],
  [/HARINA|MAICENA|ALMID|F[ÉE]CULA|AVENA|TRIGO|CEBADA|ARROZ|MEZCLA|SALVADO/, 'Molinos del Valle (ejemplo)'],
  [/FRESA|MORA|PI[ÑN]A|GUAYABA|BANANO|UCHUVA|LIM[ÓO]N|NARANJA|FRUT|MANZANA|ZANAHORIA|TOMATE|ESPINACA/, 'Frutas del Campo (ejemplo)'],
];
const PROVEEDOR_GENERAL = 'Distribuidora Central (ejemplo)';
const proveedorDe = (ingrediente) => PROVEEDORES.find(([patron]) => patron.test(ingrediente))?.[1] || PROVEEDOR_GENERAL;

/** De a cuanto se compra cada unidad (las mismas presentaciones de `lotesDemo`). */
const PASO_COMPRA = { GR: 1000, ML: 1000, MG: 1000, UND: 30, CM: 3000, KG: 1, LT: 1 };

const NOTAS = {
  tarea: ['Limpiar y desinfectar la amasadora al cierre', 'Revisar la temperatura de la cámara de frío',
    'Etiquetar las masas que quedan en refrigeración', 'Pesar y dejar listas las premezclas de mañana',
    'Hacer el conteo rápido de empaques', 'Engrasar y ordenar los moldes de torta'],
  pendiente: ['Confirmar con el proveedor el pedido de harina del viernes', 'Llamar al técnico por el horno 2',
    'Reponer papel de hornear en la estación', 'Revisar fechas de vencimiento de los lácteos',
    'Cambiar el empaque de la nevera de pastelería'],
  recomendacion: ['Bajar 5 °C el horno para las galletas de mantequilla', 'Dejar reposar la masa de brioche 10 minutos más',
    'Usar primero la mantequilla que vence antes', 'Tamizar el cacao para que no queden grumos',
    'Medir la humedad de la masa antes de formar'],
  felicitacion: ['Excelente trabajo con la producción de hoy', 'Cero rechazos en la tanda de la mañana, ¡bien hecho!',
    'Gracias por cubrir el turno del sábado', 'Muy buena presentación de las tortas', 'Se nota el orden en la estación'],
};
const MOTIVOS_RECHAZO = ['Piezas quemadas en el borde del horno', 'Forma irregular al formar', 'Se quebraron al desmoldar',
  'Crecimiento desparejo en la fermentación', 'Golpes al empacar'];

/** Error de una regla del nucleo que el ejemplo esperaba cumplir. Se convierte en `err`. */
class FalloEjemplo extends Error {
  constructor(contexto, r) { super(`${contexto}: ${r.message}`); this.codigo = r.code; }
}
const exigir = (r, contexto) => { if (!r.ok) throw new FalloEjemplo(contexto, r); return r.value; };

/** Generador pseudoaleatorio de 32 bits con semilla (mulberry32). */
function generador(semilla) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (min, max) => min + siguiente() * (max - min);
  const entero = (min, max) => Math.floor(entre(min, max + 1));
  const elegir = (lista) => lista[Math.floor(siguiente() * lista.length)];
  const prob = (p) => siguiente() < p;
  return { siguiente, entre, entero, elegir, prob };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const redondear3 = (n) => Math.round(n * 1000) / 1000;

/** Día de la semana (0 = lunes … 6 = domingo) de un día `YYYY-MM-DD`. */
const diaSemana = (fecha) => (new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;

/** Medianoche de Bogotá (UTC-5, sin horario de verano) de un día, en milisegundos. */
const medianoche = (fecha) => Date.parse(fecha + 'T05:00:00.000Z');

/** Gramos de las lineas pesables de una receta escalada; lo demás no se suma. */
function masaGramos(recipe, factor) {
  let total = 0;
  for (const l of consolidar([{ recipe, factor }]).lineas) {
    const f = ['GR', 'KG', 'MG', 'ML'].includes(l.unidad) ? factorGramos(l.unidad, { ML: 1 }) : null;
    if (f !== null) total += l.cantidad * f;
  }
  return total;
}

/**
 * Documento de operación de ejemplo, con la forma de `leerOperacion()`.
 *
 * @param {Array<object>} recetas recetario actual (no se modifica)
 * @param {{hoy?: string, dias?: number, semilla?: number}} [opciones]
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function operacionDeEjemplo(recetas, { hoy = hoyLocal(), dias = 90, semilla = 20260921 } = {}) {
  if (!Array.isArray(recetas) || !recetas.length) {
    return err('sin_recetas', 'No hay recetas para armar el ejemplo. Carga el recetario y vuelve a intentarlo.');
  }
  if (!Number.isSafeInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_EJEMPLO) {
    return err('dias_invalidos', `El ejemplo cubre de 1 a ${DIAS_MAXIMOS_EJEMPLO} días.`);
  }
  if (!fechaValida(hoy)) return err('fecha_invalida', 'La fecha de referencia del ejemplo no es un día válido.');
  // El nucleo no deja confirmar dias futuros: un ejemplo "desde el futuro"
  // saldria sin producción y engañaria más que ayudaria.
  if (hoy > hoyLocal()) return err('fecha_futura', 'El ejemplo solo se puede armar hasta el día de hoy.');
  if (!Number.isFinite(semilla)) return err('semilla_invalida', 'La semilla del ejemplo debe ser un número.');
  try {
    return ok(generar(recetas, hoy, dias, semilla));
  } catch (e) {
    // Solo se traducen los rechazos del nucleo (reglas que el ejemplo no
    // cumplió, p. ej. un recetario con unidades que no se pueden costear). Un
    // fallo de programación se propaga para que se vea.
    if (e instanceof FalloEjemplo) {
      return err('ejemplo_fallido', `No se pudo armar el ejemplo con este recetario (${e.message}).`);
    }
    throw e;
  }
}

function generar(recetas, hoy, dias, semilla) {
  const azar = generador(semilla);
  const inicioReal = Date.now();
  const limiteReal = inicioReal - 60_000;
  const umbral = new Date(inicioReal).toISOString();
  const inicio = sumarDias(hoy, -(dias - 1));
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: [], planes: [], ejecuciones: [], eventos: [],
    notas: [], preparaciones: [], resultados: [] };

  // --- Reloj simulado ------------------------------------------------------
  let fechaActual = inicio;
  let ultimoMs = 0;
  /** Instante de un minuto del dia simulado; siempre creciente y nunca futuro. */
  const instante = (minutos) => {
    const base = medianoche(fechaActual);
    let ms = base + Math.round(minutos * 60_000) + azar.entero(0, 59_000);
    ms = Math.min(ms, limiteReal, base + 86_399_000);
    ms = Math.max(ms, ultimoMs + 1, base);
    ultimoMs = ms;
    return new Date(ms).toISOString();
  };
  /** Reescribe al instante simulado todo sello real dentro de `valor`. */
  const sellar = (valor, iso) => {
    if (Array.isArray(valor)) {
      for (let i = 0; i < valor.length; i++) {
        if (typeof valor[i] === 'string') { if (esReal(valor[i])) valor[i] = iso; } else if (valor[i] && typeof valor[i] === 'object') sellar(valor[i], iso);
      }
    } else if (valor && typeof valor === 'object') {
      for (const k of Object.keys(valor)) {
        const v = valor[k];
        if (typeof v === 'string') { if (esReal(v)) valor[k] = iso; } else if (v && typeof v === 'object') sellar(v, iso);
      }
    }
  };
  // Mismo formato ISO en UTC: el orden de texto es el orden temporal.
  const esReal = (s) => s.length === 24 && s >= umbral && ISO.test(s);

  /**
   * Ejecuta una operación del núcleo a la hora simulada y sella lo que creó.
   * Cada llamada cuenta como una escritura (`secuencia`), igual que en la app.
   */
  const ejecutar = (minutos, fn) => {
    const iso = instante(minutos);
    const eventos = datos.eventos.length, ejecuciones = datos.ejecuciones.length;
    const notas = datos.notas.length, resultados = datos.resultados.length;
    const r = fn();
    if (!r.ok) return r;
    for (let i = eventos; i < datos.eventos.length; i++) sellar(datos.eventos[i], iso);
    for (let i = ejecuciones; i < datos.ejecuciones.length; i++) sellar(datos.ejecuciones[i], iso);
    // Notas y resultados cambiados se reinsertan al final.
    for (let i = Math.max(0, notas - 1); i < datos.notas.length; i++) sellar(datos.notas[i], iso);
    for (let i = Math.max(0, resultados - 1); i < datos.resultados.length; i++) sellar(datos.resultados[i], iso);
    // El plan nuevo solo lleva su propio sello (`actualizado`); las recetas
    // congeladas y el costo estimado no tienen instantes.
    const plan = datos.planes.find((p) => p.fecha === fechaActual);
    if (plan && esReal(plan.actualizado)) plan.actualizado = iso;
    // Las preparaciones del día simulado son siempre el final de la lista: las
    // de días anteriores ya no cambian y cada cambio se reinserta al final.
    for (let i = datos.preparaciones.length - 1; i >= 0 && datos.preparaciones[i].fecha === fechaActual; i--) sellar(datos.preparaciones[i], iso);
    // Lo que devuelve el núcleo es una copia o algo ya sellado arriba. La
    // compra, que crea su lote aquí, lo sella ella misma.
    datos.secuencia += 1;
    datos.revision = iso;
    return r;
  };

  /*
   * Lotes de trabajo. El costeo FEFO del núcleo recorre TODOS los lotes por
   * cada línea, y los agotados se quedan en la bodega (como en la app): con 90
   * días, generar el ejemplo tardaba varios segundos. Durante la simulación
   * `datos.lotes` lleva solo lo que puede cambiar el costeo del día:
   *   - de los ingredientes de las recetas programadas ese día, los lotes con
   *     existencia y, si el ingrediente no tiene ninguno utilizable con
   *     existencia, TODOS sus lotes (de ellos salen la equivalencia y el estado
   *     `sin_existencia` frente a `sin_precio`);
   *   - todo lote vencido con existencia, que `costearPlan` cuenta en
   *     `lotesVencidosIgnorados` sea del ingrediente que sea.
   * Con esa regla `costearPlan` devuelve exactamente lo mismo que con la lista
   * completa, porque cada línea solo mira los lotes de su ingrediente. Al final
   * se devuelve la lista completa, en orden de registro. Se recalcula al
   * empezar el día, al programarlo y tras cada confirmación (lo único que agota
   * lotes); una compra o una baja actualizan las dos listas a la vez.
   */
  const todos = [];
  let clavesDelDia = new Set();
  const claves = new WeakMap();
  const claveLote = (l) => { let k = claves.get(l); if (k === undefined) { k = claveDe(l.ingrediente, ''); claves.set(l, k); } return k; };
  const vencido = (l) => Boolean(l.vencimiento) && l.vencimiento < fechaActual;
  function recortar() {
    const conSaldo = new Set();
    for (const l of todos) {
      if (l.existencia > 0 && !(l.fechaCompra && l.fechaCompra > fechaActual) && !vencido(l) && clavesDelDia.has(claveLote(l))) conSaldo.add(claveLote(l));
    }
    datos.lotes = todos.filter((l) => (l.existencia > 0 && vencido(l))
      || (clavesDelDia.has(claveLote(l)) && (l.existencia > 0 || !conSaldo.has(claveLote(l)))));
  }

  // --- Apertura de bodega ----------------------------------------------------
  const apertura = lotesDemo(inicio, recetas);
  const originalVence = new Map(apertura.map((l) => [l.id, l.vencimiento]));
  // Recetas que se pueden costear con la bodega de ejemplo: una receta con una
  // unidad sin equivalencia no se podría confirmar nunca, y no se programa.
  const costeables = recetas.filter((r) => CATEGORIES.includes(r?.categoria)).filter((r) => {
    const c = costearPlan(consolidar([{ recipe: r, factor: 1 }]).lineas, apertura, inicio);
    return c.lineas.length > 0 && !c.lineasSinConversion && !c.lineasSinPrecio;
  });
  if (!costeables.length) throw new FalloEjemplo('recetario', { code: 'sin_costeables', message: 'ninguna receta se puede costear' });
  const porArea = Object.fromEntries(CATEGORIES.map((a) => [a, costeables.filter((r) => r.categoria === a)
    .map((recipe) => ({ recipe, peso: 0.2 + azar.siguiente() ** 2 * 3 }))]));
  const areasActivas = CATEGORIES.filter((a) => porArea[a].length);

  // Saldo inicial: una parte de cada lote de ejemplo ya se usó (25-60 %).
  const vencidoDeEjemplo = new Set(apertura.filter((l) => estadoVencimiento(l, inicio) === 'vencido' && l.existencia > 0).map((l) => l.id));
  const inicial = apertura.map((bruto) => normalizarLote({
    ...bruto,
    proveedor: proveedorDe(bruto.ingrediente),
    fechaCompra: sumarDias(inicio, -azar.entero(3, 25)),
    existencia: Math.round(bruto.pesoCompra * azar.entre(0.25, 0.6) * 1000) / 1000,
  }));

  // Lotes que se dejarán vencer para darlos de baja: el vencido de `lotesDemo`
  // y unos pocos cuyo ingrediente se usa tan poco que su saldo NO se acaba en
  // el periodo. Con FEFO, un lote de un ingrediente frecuente que vence antes
  // se gasta primero y llegaría vacío a su vencimiento: no habría nada que dar
  // de baja. La demanda diaria se estima con los mismos pesos que eligen las
  // recetas (unas 8 al día, 1,9 tandas de media).
  const objetivoBajas = azar.entero(2, 4);
  const demanda = new Map();
  const cuotaDiaria = { 'PANADERÍA': 3.4, 'PASTELERÍA': 3.4, GALLETAS: 1.7 };
  for (const area of areasActivas) {
    const total = porArea[area].reduce((s, x) => s + x.peso, 0);
    for (const { recipe, peso } of porArea[area]) {
      for (const l of consolidar([{ recipe, factor: 1.9 }]).lineas) {
        const g = factorGramos(l.unidad, { ML: 1, UND: 1, CM: 1, TANDA: 1 });
        const k = claveDe(l.ingrediente, '');
        if (g !== null) demanda.set(k, (demanda.get(k) || 0) + l.cantidad * g * cuotaDiaria[area] * peso / total);
      }
    }
  }
  const lotesPorClave = new Map();
  for (const l of inicial) lotesPorClave.set(claveDe(l.ingrediente, ''), (lotesPorClave.get(claveDe(l.ingrediente, '')) || 0) + 1);
  const diasDeSaldo = (l) => l.existencia * (factorGramos(l.unidad, l.equivalencias) || 0) / (demanda.get(claveDe(l.ingrediente, '')) || 1e-9);
  const candidatos = inicial.filter((l) => !vencidoDeEjemplo.has(l.id) && l.existencia > 0
    && lotesPorClave.get(claveDe(l.ingrediente, '')) === 1 && diasDeSaldo(l) > dias * 2)
    .sort((x, y) => diasDeSaldo(y) - diasDeSaldo(x) || x.id.localeCompare(y.id)).slice(0, 12);
  const paraBaja = new Set(vencidoDeEjemplo);
  // Uno de más por si alguno se gasta igual: las bajas se detienen al llegar al objetivo.
  while (paraBaja.size < objetivoBajas + 1 && candidatos.length) paraBaja.add(candidatos.splice(azar.entero(0, candidatos.length - 1), 1)[0].id);

  const perfiles = new Map();
  for (let i = 0; i < inicial.length; i++) {
    const lote = inicial[i];
    if (paraBaja.has(lote.id) && !vencidoDeEjemplo.has(lote.id)) {
      const ultimo = Math.max(1, dias - 6);
      lote.vencimiento = sumarDias(inicio, azar.entero(Math.min(10, ultimo), ultimo));
    } else if (!vencidoDeEjemplo.has(lote.id)) {
      lote.vencimiento = [lote.vencimiento, sumarDias(hoy, azar.entero(8, 160))].sort()[1];
    }
    todos.push(lote);
    const clave = claveDe(lote.ingrediente, '');
    const vida = Math.max(20, Math.round((Date.parse(originalVence.get(apertura[i].id)) - Date.parse(inicio)) / 86_400_000));
    const previo = perfiles.get(clave);
    // Referencia de compra: la presentacion en gramos si la hay.
    if (!previo || (previo.lote.unidad !== 'GR' && lote.unidad === 'GR')) {
      perfiles.set(clave, { clave, lote, vida, precio: valorUnitario(lote),
        deriva: azar.entre(0.003, 0.015), alza: 1, compras: 0, consumo: new Map() });
    }
  }
  let consecutivoLote = todos.length;
  datos.lotes = [...todos];
  ejecutar(300, () => {
    for (const lote of datos.lotes) {
      registrarEvento(datos, 'apertura', { responsable: nombreResponsable(JEFE),
        motivo: 'Saldo inicial de la bodega (ejemplo)', antes: null, despues: lote });
    }
    return ok(null);
  });
  // `registrado` de la apertura también es un sello real de `normalizarLote`.
  for (const lote of todos) sellar(lote, datos.eventos[0].instante);

  // --- Bodega: consumo, compras y bajas ---------------------------------------
  let alzas = 0;
  const objetivoAlzas = azar.entero(2, 3);
  let bajas = 0;

  const perfilDe = (ingrediente) => perfiles.get(claveDe(ingrediente, ''));
  const gramosDe = (lote) => factorGramos(lote.unidad, lote.equivalencias);
  const consumoMedio = (perfil, indice) => {
    const desde = Math.max(0, indice - 14);
    let total = 0;
    for (let i = desde; i < indice; i++) total += perfil.consumo.get(i) || 0;
    return indice - desde > 0 ? total / (indice - desde) : 0;
  };
  /** Gramos utilizables por ingrediente ese día (sin vencidos ni compras futuras), en una pasada. */
  const coberturas = (fecha) => {
    const gramos = new Map();
    for (const l of todos) {
      if (l.existencia <= 0 || (l.fechaCompra && l.fechaCompra > fecha) || estadoVencimiento(l, fecha) === 'vencido') continue;
      const k = claveDe(l.ingrediente, '');
      gramos.set(k, (gramos.get(k) || 0) + l.existencia * (gramosDe(l) || 0));
    }
    return gramos;
  };

  /** Registra una compra como lo hace Bodega (`app/almacen.js`, `guardarLote`). */
  const comprar = (perfil, gramos, indice, minutos, motivo) => {
    const ref = perfil.lote;
    const paso = PASO_COMPRA[ref.unidad] || 1;
    const cantidad = Math.max(paso, Math.ceil(gramos / (gramosDe(ref) || 1) / paso) * paso);
    perfil.compras += 1;
    // Dos o tres alzas marcadas en ingredientes que se compran seguido, en su
    // segunda compra o después: así hay una compra anterior contra la cual se
    // nota el salto.
    if (perfil.alza === 1 && perfil.compras >= 2 && alzas < objetivoAlzas && indice >= 20 && azar.prob(0.35)) {
      perfil.alza = azar.entre(1.16, 1.25);
      alzas += 1;
    }
    const unitario = perfil.precio * (1 + perfil.deriva) ** (indice / 30) * perfil.alza * azar.entre(0.99, 1.01);
    const vida = Math.max(perfil.vida, Math.round(cantidad * (gramosDe(ref) || 1) / Math.max(1, consumoMedio(perfil, indice)) * 2) + 14);
    consecutivoLote += 1;
    const bruto = {
      id: 'L' + String(consecutivoLote).padStart(3, '0'), ingrediente: ref.ingrediente, marca: ref.marca,
      proveedor: proveedorDe(ref.ingrediente), fechaCompra: fechaActual, presentacion: ref.presentacion,
      pesoCompra: cantidad, unidad: ref.unidad, equivalencias: copiar(ref.equivalencias || {}),
      costoCompra: Math.max(100, Math.round(unitario * cantidad / 100) * 100),
      lote: 'EJ-C' + String(consecutivoLote).padStart(4, '0'),
      vencimiento: sumarDias(fechaActual, Math.min(vida, 400)), existencia: cantidad,
    };
    const lote = exigir(validarLote(bruto), `compra de ${ref.ingrediente}`);
    ejecutar(minutos, () => {
      lote.registrado = new Date().toISOString();
      let ultimo = null;
      for (let i = datos.eventos.length - 1; i >= 0 && !ultimo; i--) {
        const e = datos.eventos[i];
        if ((e.tipo === 'compra' || e.tipo === 'apertura') && claveDe(e.despues.ingrediente, e.despues.unidad) === claveDe(lote.ingrediente, lote.unidad)) ultimo = e.despues;
      }
      const alertas = [];
      if (ultimo) {
        const precio = valorUnitario(lote), previo = valorUnitario(ultimo);
        if (precio !== previo) alertas.push(`Precio por ${lote.unidad}: ${previo} → ${precio}${previo > 0 ? ` (${((precio / previo - 1) * 100).toFixed(1)}%)` : ''}.`);
        if (lote.proveedor !== ultimo.proveedor) alertas.push(`Proveedor: ${ultimo.proveedor || 'sin registrar'} → ${lote.proveedor || 'sin registrar'}.`);
      }
      todos.push(lote);
      datos.lotes.push(lote);
      registrarEvento(datos, 'compra', { responsable: nombreResponsable(JEFE), motivo, antes: null, despues: lote, alertas });
      return ok(lote);
    });
    lote.registrado = datos.eventos[datos.eventos.length - 1].instante;
  };

  /** Si lo pendiente no se puede costear completo, se compra antes de confirmar. */
  const costeoCompleto = (seleccion, indice, minutos) => {
    for (let intento = 0; intento < 3; intento++) {
      const costeo = costeoPendiente(datos, fechaActual, seleccion);
      if (!costeo) throw new FalloEjemplo('costeo', { code: 'sin_plan', message: 'el día no tiene plan' });
      if (costeo.lineasSinConversion) throw new FalloEjemplo('costeo', { code: 'sin_conversion', message: 'hay líneas sin equivalencia' });
      const faltan = costeo.lineas.filter((l) => l.faltante > 0 || l.estado === 'sin_precio');
      if (!faltan.length) return costeo;
      for (const linea of faltan) {
        const perfil = perfilDe(linea.ingrediente);
        if (!perfil) throw new FalloEjemplo('costeo', { code: 'sin_lote', message: `${linea.ingrediente} no tiene lote de referencia` });
        comprar(perfil, (linea.faltante || 0) + consumoMedio(perfil, indice) * 20, indice, minutos - 5, 'Compra urgente para completar la producción');
      }
    }
    throw new FalloEjemplo('costeo', { code: 'faltantes', message: 'no se pudo completar la bodega' });
  };

  const anotarConsumo = (ejecucion, indice) => {
    for (const linea of ejecucion.costeo.lineas) {
      const perfil = perfilDe(linea.ingrediente);
      if (perfil && linea.consumo > 0) perfil.consumo.set(indice, (perfil.consumo.get(indice) || 0) + linea.consumo);
    }
  };

  const mañana = (indice) => {
    // Bajas por vencimiento de los lotes elegidos.
    for (const lote of [...todos]) {
      if (bajas >= objetivoBajas || !paraBaja.has(lote.id) || lote.existencia <= 0) continue;
      if (estadoVencimiento(lote, fechaActual) !== 'vencido') continue;
      ejecutar(320, () => {
        const antes = lote;
        todos.splice(todos.indexOf(lote), 1);
        datos.lotes = datos.lotes.filter((l) => l !== lote);
        registrarEvento(datos, 'baja', { responsable: nombreResponsable(JEFE), motivo: 'Vencido: se descarta', antes, despues: null });
        return ok(lote.id);
      });
      bajas += 1;
    }
    // Reposición por punto de reorden, solo de lo que se consume.
    const disponible = coberturas(fechaActual);
    for (const perfil of perfiles.values()) {
      const medio = consumoMedio(perfil, indice);
      if (medio <= 0 || (disponible.get(perfil.clave) || 0) >= medio * 5) continue;
      comprar(perfil, medio * azar.entero(25, 40), indice, 330 + azar.entero(0, 40), 'Reposición de bodega');
    }
  };

  // --- Programación ------------------------------------------------------------
  const cuantasRecetas = (fecha) => {
    const d = diaSemana(fecha);
    if (d === 6) return azar.prob(0.55) ? 0 : azar.entero(2, 4);
    return [[6, 8], [6, 8], [7, 10], [8, 10], [11, 14], [12, 14]][d].reduce((min, max) => azar.entero(min, max));
  };
  const elegirRecetas = (n) => {
    const cuota = { 'PANADERÍA': 0.4, 'PASTELERÍA': 0.4, GALLETAS: 0.2 };
    const elegidas = [];
    const tomar = (area) => {
      const libres = porArea[area].filter((x) => !elegidas.includes(x.recipe));
      if (!libres.length) return false;
      let r = azar.siguiente() * libres.reduce((s, x) => s + x.peso, 0);
      const x = libres.find((y) => (r -= y.peso) <= 0) || libres[libres.length - 1];
      elegidas.push(x.recipe);
      return true;
    };
    if (n >= 3) for (const a of areasActivas) tomar(a);
    let intentos = 0;
    while (elegidas.length < n && intentos++ < n * 10) {
      let r = azar.siguiente();
      const area = areasActivas.find((a) => (r -= cuota[a] / areasActivas.reduce((s, b) => s + cuota[b], 0)) <= 0) || areasActivas[0];
      tomar(area);
    }
    return elegidas;
  };
  const tandasPara = (fecha) => {
    const base = azar.elegir([1, 1, 1, 1.5, 2, 2, 3]);
    return [4, 5].includes(diaSemana(fecha)) ? Math.round(base * 1.5 * 2) / 2 : base;
  };
  const trabajadores = (area) => PERSONAS_EJEMPLO.filter((p) => p.area === area);
  const revisionDe = () => datos.planes.find((p) => p.fecha === fechaActual).revision;

  // --- Agenda del día -----------------------------------------------------------
  // Lo que pasa en un día se agenda por minuto y se ejecuta en orden de hora,
  // para que el historial quede en orden cronológico aunque se genere por área.
  // Cada acción recibe su minuto y lo pasa a `ejecutar`.
  let acciones = [];
  const accion = (minutos, fn) => acciones.push({ minutos, orden: acciones.length, fn });

  // --- Resultados y notas ------------------------------------------------------
  const registrarResultado = (ejecucion, entrada, autor, minutos) => {
    const previsto = rendimientoPrevisto(entrada);
    const masa = masaGramos(entrada.recipe, entrada.factor);
    const solicitud = { produccionId: ejecucion.id, recetaId: entrada.recipe.id, revision: 0,
      mermaPreparacionGr: null, mermaCoccionGr: null };
    const motivos = [];
    if (previsto.cantidad !== null) {
      const obtenido = Math.max(1, Math.round(previsto.cantidad * azar.entre(0.94, 1.03)));
      const rechazo = azar.prob(0.35) ? 0 : azar.entre(0, 0.12);
      solicitud.rechazado = Math.floor(obtenido * rechazo);
      solicitud.vendible = obtenido - solicitud.rechazado;
      if (solicitud.rechazado > 0) motivos.push(azar.elegir(MOTIVOS_RECHAZO));
      else if (Math.abs(obtenido - previsto.cantidad) > 1e-8) motivos.push('Rindió distinto a lo previsto al formar');
    } else {
      if (masa <= 0) return;
      // Preparación sin rendimiento declarado: se pesa lo que salió.
      solicitud.unidad = 'GR';
      solicitud.vendible = Math.round(masa * azar.entre(0.9, 0.98));
      solicitud.rechazado = 0;
    }
    if (masa > 0 && azar.prob(0.25)) { solicitud.mermaPreparacionGr = Math.round(masa * azar.entre(0.005, 0.02)); motivos.push('Masa pegada en mesa y utensilios'); }
    if (masa > 0 && azar.prob(0.2)) { solicitud.mermaCoccionGr = Math.round(masa * azar.entre(0.01, 0.04)); motivos.push('Pérdida de humedad en el horno'); }
    solicitud.motivo = motivos.join('. ');
    const hecho = exigir(ejecutar(minutos, () => guardarResultadoEn(datos, solicitud, autor)), `resultado de ${entrada.recipe.nombre}`);
    // De vez en cuando el jefe corrige el conteo al empacar.
    if (hecho.vendible >= 4 && azar.prob(0.05)) {
      const vendible = hecho.vendible - azar.entero(1, 3);
      accion(minutos + 40, (m) => exigir(ejecutar(m, () => guardarResultadoEn(datos, { ...solicitud, revision: hecho.revision,
        unidad: hecho.unidad, esperado: hecho.esperado, vendible, rechazado: hecho.rechazado,
        motivo: 'Corrección del conteo al empacar' }, JEFE)), 'corrección de resultado'));
    }
  };

  let notasCreadas = 0;
  const TIPOS = ['tarea', 'pendiente', 'recomendacion', 'felicitacion'];
  const crearNota = (indice, reciente, minutos) => {
    // Las cuatro primeras cubren los cuatro tipos; luego, al azar con pesos.
    const tipo = notasCreadas < TIPOS.length ? TIPOS[notasCreadas]
      : azar.elegir(['tarea', 'tarea', 'tarea', 'pendiente', 'pendiente', 'recomendacion', 'felicitacion']);
    notasCreadas += 1;
    const destino = azar.siguiente();
    const operario = azar.elegir(PERSONAS_EJEMPLO.slice(1));
    let area = null, persona = null;
    if (tipo === 'felicitacion') { if (destino < 0.8) persona = operario; else area = operario.area; }
    else if (tipo === 'recomendacion') area = azar.elegir(areasActivas);
    else if (destino < 0.3) persona = operario;
    else if (destino < 0.8) area = azar.elegir(areasActivas);
    const nota = exigir(ejecutar(minutos, () => guardarNotaEn(datos, { fecha: fechaActual, tipo, texto: azar.elegir(NOTAS[tipo]),
      area, persona: persona && { id: persona.id, nombre: persona.nombre, codigo: persona.codigo } }, JEFE)), 'nota');
    if ((tipo === 'tarea' || tipo === 'pendiente') && azar.prob(reciente ? 0.3 : 0.85)) {
      const quien = persona || JEFE;
      accion(minutos + azar.entero(60, 300), (m) => exigir(ejecutar(m, () => guardarNotaEn(datos, {
        id: nota.id, revision: nota.revision, fecha: nota.fecha, tipo: nota.tipo, texto: nota.texto,
        area: nota.area, persona: nota.persona, hecha: true }, quien)), 'marcar nota'));
    }
  };

  // --- Días simulados ----------------------------------------------------------
  for (let indice = 0; indice < dias; indice++) {
    fechaActual = sumarDias(inicio, indice);
    ultimoMs = Math.max(ultimoMs, medianoche(fechaActual) - 1);
    clavesDelDia = new Set();
    recortar();
    const esHoy = fechaActual === hoy;
    const reciente = !esHoy && fechaActual >= sumarDias(hoy, -3);
    mañana(indice);

    // Hoy siempre tiene algo en marcha, aunque sea domingo: es lo primero que
    // mira el panel («Hoy»).
    const elegidas = elegirRecetas(esHoy ? Math.max(3, cuantasRecetas(fechaActual)) : cuantasRecetas(fechaActual));
    acciones = [];
    clavesDelDia = new Set(elegidas.flatMap((r) => r.componentes.flatMap((c) => c.items.map((i) => claveDe(i.ingrediente, '')))));
    recortar();
    if (elegidas.length) {
      exigir(ejecutar(340 + azar.entero(0, 20), () => guardarPlanEn(datos, {
        fecha: fechaActual, revision: 0, responsable: nombreResponsable(JEFE), motivo: 'Programación del día',
        entradas: elegidas.map((recipe) => ({ id: recipe.id, factor: tandasPara(fechaActual) })),
      }, recetas)), 'plan del día');

      // Un día de cada ocho, un área se cierra de una vez (aprobación por área).
      const areaEnBloque = !esHoy && !reciente && azar.prob(0.12) ? azar.elegir(areasActivas) : null;
      const reloj = new Map(PERSONAS_EJEMPLO.map((p) => [p.id, 345 + azar.entero(0, 30)]));
      for (const [posicion, recipe] of elegidas.entries()) {
        // Hoy, las tres primeras cubren los tres estados a medias: una lista,
        // una en preparación y una pendiente sin asignar. El resto, al azar.
        const fija = esHoy && posicion < 3 ? ['lista', 'preparacion', 'sin_asignar'][posicion] : null;
        const factor = datos.planes.find((p) => p.fecha === fechaActual).entradas.find((e) => e.recipe.id === recipe.id).factor;
        const enBloque = recipe.categoria === areaEnBloque;
        const probConfirmar = esHoy ? 0.4 : reciente ? 0.78 : 0.96;
        const confirma = fija ? fija === 'lista' : enBloque || azar.prob(probConfirmar);
        const empieza = fija ? fija !== 'sin_asignar' : confirma || azar.prob(esHoy ? 0.4 : 0.3);
        const asignada = fija ? fija !== 'sin_asignar' : enBloque ? azar.prob(0.5) : esHoy ? azar.prob(0.7) : azar.prob(0.94);
        const trabajador = asignada ? azar.elegir(trabajadores(recipe.categoria)) : null;
        const quien = trabajador || JEFE;
        if (trabajador) {
          accion(355 + azar.entero(0, 25), (m) => exigir(ejecutar(m, () => asignarRecetaEn(datos,
            { fecha: fechaActual, recetaId: recipe.id, trabajador }, JEFE)), 'asignar'));
        }
        if (enBloque || !empieza) continue;
        const desde = Math.max(reloj.get(quien.id), 390);
        const duracion = 30 + 25 * factor + azar.entero(0, 40);
        const cancela = azar.prob(0.03);
        accion(desde, (m) => exigir(ejecutar(m, () => iniciarPreparacionEn(datos, { fecha: fechaActual, recetaId: recipe.id }, quien)), 'empezar'));
        if (cancela) {
          accion(desde + 8, (m) => exigir(ejecutar(m, () => cancelarPreparacionEn(datos, { fecha: fechaActual, recetaId: recipe.id }, quien)), 'dejar'));
          accion(desde + 25, (m) => exigir(ejecutar(m, () => iniciarPreparacionEn(datos, { fecha: fechaActual, recetaId: recipe.id }, quien)), 'reempezar'));
        }
        const fin = desde + (cancela ? 25 : 0) + duracion;
        reloj.set(quien.id, fin + azar.entero(5, 15));
        if (!confirma) continue;
        const confirmar = (m) => {
          const costeo = costeoCompleto({ recetaId: recipe.id }, indice, m);
          const ejecucion = exigir(ejecutar(m, () => confirmarRecetaEn(datos,
            { fecha: fechaActual, revision: revisionDe(), recetaId: recipe.id, costeo }, quien)), `confirmar ${recipe.nombre}`);
          anotarConsumo(ejecucion, indice);
          recortar();
          return ejecucion;
        };
        accion(fin, (m) => {
          const ejecucion = confirmar(m);
          const entrada = ejecucion.entradas[0];
          if (azar.prob(0.9)) accion(fin + azar.entero(10, 45), (m) => registrarResultado(ejecucion, entrada, quien, m));
          // Producción adicional sobre lo ya hecho, sobre todo al final de semana.
          if (!esHoy && [4, 5].includes(diaSemana(fechaActual)) && azar.prob(0.12)) {
            const extra = azar.elegir([0.5, 1]);
            const pedido = fin + azar.entero(60, 150);
            accion(pedido, (m) => {
              exigir(ejecutar(m, () => fijarRecetaEn(datos, { fecha: fechaActual, revision: revisionDe(), recetaId: recipe.id,
                factor: redondear3(entrada.factor + extra), responsable: nombreResponsable(JEFE), motivo: 'Pedido adicional del mostrador' }, recetas)), 'adicional');
              accion(pedido + 45, (m) => {
                const otra = confirmar(m);
                if (azar.prob(0.6)) accion(pedido + 70, (m) => registrarResultado(otra, otra.entradas[0], quien, m));
              });
            });
          }
        });
      }
      if (areaEnBloque) {
        accion(900 + azar.entero(0, 60), (m) => {
          const costeo = costeoCompleto({ area: areaEnBloque }, indice, m);
          const ejecucion = exigir(ejecutar(m, () => {
            const r = aprobarPlanEn(datos, { fecha: fechaActual, revision: revisionDe(),
              responsable: nombreResponsable(JEFE), motivo: 'Cierre del área', costeo, area: areaEnBloque });
            // La misma identidad que deja `confirmarRecetaEn`: sin `autor`, la
            // jefa aparecería como otra persona («nombre (código)» del texto
            // `responsable`) en los indicadores por persona.
            if (r.ok) r.value.autor = { id: JEFE.id, nombre: JEFE.nombre, codigo: JEFE.codigo };
            return r;
          }), 'cierre de área');
          anotarConsumo(ejecucion, indice);
          recortar();
          for (const entrada of ejecucion.entradas) if (azar.prob(0.85)) accion(990, (m) => registrarResultado(ejecucion, entrada, JEFE, m));
        });
      }
    }
    const cuantasNotas = azar.prob(0.45) ? 1 + Number(azar.prob(0.3)) : 0;
    for (let n = 0; n < cuantasNotas; n++) accion(360 + azar.entero(0, 500), (m) => crearNota(indice, reciente || esHoy, m));

    // Se ejecuta en orden de hora; lo que una acción añade entra en su turno.
    const hechas = new Set();
    while (hechas.size < acciones.length) {
      const siguiente = acciones.filter((a) => !hechas.has(a)).sort((a, b) => a.minutos - b.minutos || a.orden - b.orden)[0];
      hechas.add(siguiente);
      siguiente.fn(siguiente.minutos);
    }
  }

  // --- Cierre ------------------------------------------------------------------
  // Ningun sello real puede quedar: si quedara, es un fallo de este modulo.
  datos.lotes = todos;
  const texto = JSON.stringify(datos);
  let restante = 0;
  for (const [, iso] of texto.matchAll(/"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)"/g)) if (iso >= umbral) restante += 1;
  if (restante) throw new Error(`operacionDeEjemplo: quedaron ${restante} instantes reales sin reescribir.`);
  const ids = new Map();
  const doc = JSON.parse(texto.replace(UUID, (id) => {
    if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`);
    return ids.get(id);
  }));
  doc.ejemplo = { semilla, dias, desde: inicio, hasta: hoy };
  return doc;
}
