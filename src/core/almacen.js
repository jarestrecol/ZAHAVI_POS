/**
 * =============================================================================
 *  ALMACEN (BODEGA)
 * =============================================================================
 *
 *  Lo que hay comprado, a que precio y cuando vence. Es el modulo que convierte
 *  el recetario en algo que puede responder "cuanto cuesta producir esto".
 *
 *  DONDE VIVEN LOS DATOS, Y POR QUE NO EN `data/recipes.json`
 *  ---------------------------------------------------------
 *  En `localStorage`, en este aparato. NO se publican.
 *
 *  No es una simplificacion ni una fase intermedia: es la decision que la
 *  seccion 13 de `CLAUDE.md` ("Antes de la Fase 2") exigia tomar ANTES de que
 *  existieran los costes. El recetario se sirve sin ningun control de lectura
 *  -`curl` a `/data/recipes.json` devuelve las 122 formulas sin clave, y es
 *  deliberado-, pero los precios de proveedor y los margenes no admiten ese
 *  trato. Publicarlos por el mismo camino que las recetas los haria publicos
 *  para quien tenga el enlace, y migrarlo DESPUES de haberlo publicado es mucho
 *  mas caro que decidirlo ahora.
 *
 *  Hay ademas una razon tecnica que apunta al mismo sitio: `api/recipes.js`
 *  tiene `FILE_PATH` constante y un `sha` global, asi que dos personas editando
 *  modulos distintos se rechazarian entre si con un 409.
 *
 *  Consecuencia honesta, que hay que decirle al obrador: **el almacen de cada
 *  aparato es suyo.** Lo que se registre en la tableta del obrador no lo ve la
 *  casa de produccion. Cuando eso deje de bastar, la salida esta escrita en la
 *  seccion 5 de `CLAUDE.md`: un mapa de `dataset` en la API, con lectura
 *  autenticada para este conjunto de datos.
 *
 *  LA REGLA QUE MAS DINERO PROTEGE
 *  -------------------------------
 *  Las compras conservan su unidad. El costeo convierte a gramos con las
 *  equivalencias explícitas del ingrediente; nunca inventa densidad ni peso
 *  de una unidad. Los lotes anteriores sin equivalencias se pueden consultar,
 *  pero deben completarse antes de confirmar nuevos consumos que las necesiten.
 *
 *  `CLAUDE.md` seccion 13 documenta que 15 ingredientes se miden hoy de dos o
 *  tres formas distintas, y que separar "es la misma cosa medida de dos formas"
 *  de "esta receta esta mal escrita" exige conocer la formula. Eso lo decide la
 *  panaderia, no este archivo.
 *
 *  Funciones puras salvo las dos que tocan el almacen local. No conoce el DOM.
 */

import { readJsonState, writeJson, ok, err } from './storage.js';
import { consolidar } from './plan.js';
import { factorGramos, normalizarEquivalencias, equivalenciasValidas } from './conversiones.js';

/** Donde se guarda. Lleva version por si algun dia cambia la forma. */
const CLAVE = 'zahavi_almacen_v1';

/** Version del esquema guardado. */
const VERSION = 1;

/**
 * A cuantos dias de la fecha se considera que un lote "vence pronto".
 *
 * Va aqui, con nombre, y no escrito a mano en los tres sitios que lo necesitan
 * (el resumen, el color de la fila y el aviso del plan). Un mes es el plazo con
 * el que todavia da tiempo a colocar el producto en produccion.
 */
export const DIAS_PROXIMO = 30;

/** Presentaciones de compra que se ofrecen. Es texto libre: la lista solo sugiere. */
export const PRESENTACIONES = Object.freeze([
  'BULTO',
  'CAJA',
  'BOLSA',
  'PANAL',
  'TARRO',
  'FRASCO',
  'GARRAFA',
  'PAQUETE',
  'UNIDAD',
]);

/**
 * Un lote en blanco.
 *
 * @param {string} id
 * @returns {object}
 */
export function loteVacio(id) {
  return {
    id,
    ingrediente: '',
    marca: '',
    proveedor: '',
    fechaCompra: '',
    presentacion: '',
    pesoCompra: '',
    unidad: 'GR',
    equivalencias: {},
    costoCompra: '',
    lote: '',
    vencimiento: '',
    existencia: '',
    registrado: new Date().toISOString(),
  };
}

/**
 * Reconstruye un lote con una lista blanca de campos.
 *
 * Repara en vez de rechazar, igual que `core/schema.js` y por el mismo motivo:
 * esta es la capa del cliente, y el obrador tiene que poder abrir la pantalla
 * aunque un dato venga raro. Quien rechaza es el servidor, y aqui no hay.
 *
 * @param {any} bruto
 * @returns {object}
 */
export function normalizarLote(bruto) {
  const fuente = bruto && typeof bruto === 'object' ? bruto : {};
  const unidad = texto(fuente.unidad).toUpperCase() || 'GR';
  const peso = numero(fuente.pesoCompra);

  return {
    id: texto(fuente.id),
    ingrediente: texto(fuente.ingrediente).toUpperCase(),
    marca: texto(fuente.marca),
    proveedor: texto(fuente.proveedor),
    fechaCompra: fecha(fuente.fechaCompra),
    presentacion: texto(fuente.presentacion).toUpperCase(),
    pesoCompra: peso,
    unidad,
    ...(fuente.equivalencias === undefined ? {} : { equivalencias: normalizarEquivalencias(fuente.equivalencias) }),
    costoCompra: numero(fuente.costoCompra),
    lote: texto(fuente.lote),
    vencimiento: fecha(fuente.vencimiento),
    // La existencia nunca puede ser mayor que lo comprado ni negativa: son las
    // dos formas en que una cuenta mal hecha se vuelve invisible.
    existencia: Math.min(Math.max(numero(fuente.existencia), 0), peso),
    registrado: texto(fuente.registrado) || new Date().toISOString(),
    ...(fuente.demo?.catalogo === 'colombia-2026-09-22' ? { demo: { ...fuente.demo } } : {}),
  };
}

/**
 * Comprueba un lote antes de guardarlo.
 *
 * Devuelve el contrato del proyecto: `{ok:true, value}` o
 * `{ok:false, code, message}` con el mensaje ya redactado para la persona.
 *
 * @param {object} lote
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function validarLote(lote) {
  if (!(Number(String(lote.pesoCompra ?? '').replace(',', '.')) > 0)) {
    return err('sin_peso', 'El peso de compra tiene que ser mayor que cero.');
  }
  for (const campo of ['pesoCompra', 'costoCompra', 'existencia']) {
    const valor = String(lote[campo] ?? '').trim().replace(',', '.');
    if (valor === '' || !Number.isFinite(Number(valor)) || Number(valor) < 0) {
      return err('numero_invalido', 'Completa peso, costo y existencia con números válidos, sin separadores de miles ni valores negativos.');
    }
  }
  if (Number(String(lote.existencia).replace(',', '.')) > Number(String(lote.pesoCompra).replace(',', '.'))) {
    return err('existencia_invalida', 'La existencia no puede superar la cantidad comprada. Registra las compras nuevas en otro lote.');
  }
  for (const campo of ['vencimiento', 'fechaCompra']) {
    if (lote[campo] && (!/^\d{4}-\d{2}-\d{2}$/.test(lote[campo]) || !Number.isFinite(Date.parse(lote[campo]))
      || new Date(lote[campo]).toISOString().slice(0, 10) !== lote[campo])) return err('fecha_invalida', 'Revisa las fechas de compra y vencimiento.');
  }
  if (!String(lote.unidad || '').trim()) return err('sin_unidad', 'Indica la unidad del lote.');
  if (lote.equivalencias !== undefined && (!lote.equivalencias || typeof lote.equivalencias !== 'object'
    || Array.isArray(lote.equivalencias) || Object.keys(lote.equivalencias).some((u) => !['ML', 'UND', 'TANDA', 'CM'].includes(u)))) {
    return err('equivalencia_invalida', 'Revisa las medidas de las equivalencias del ingrediente.');
  }
  const limpio = normalizarLote(lote);
  if (!equivalenciasValidas(limpio.equivalencias)) {
    return err('equivalencia_invalida', 'Cada equivalencia debe ser un peso neto en gramos mayor que cero.');
  }
  const factor = factorGramos(limpio.unidad, limpio.equivalencias);
  if (factor === null) return err('sin_conversion', 'Indica la equivalencia en gramos de la unidad de compra. Para litros, registra los gramos de 1 ml.');
  if (!Number.isFinite(limpio.pesoCompra * factor)) return err('equivalencia_invalida', 'La cantidad convertida a gramos es demasiado grande.');

  if (limpio.ingrediente === '') {
    return err('sin_ingrediente', 'Escribe de qué ingrediente es este lote.');
  }
  if (limpio.unidad === '') {
    return err('sin_unidad', 'Falta la unidad con la que se mide este ingrediente.');
  }
  if (!(limpio.pesoCompra > 0)) {
    return err(
      'sin_peso',
      'El peso de compra tiene que ser mayor que cero: es lo que se divide para sacar el valor por unidad.',
    );
  }
  if (!(limpio.costoCompra >= 0)) {
    return err('sin_costo', 'El costo de compra no puede ser negativo.');
  }
  if (limpio.vencimiento !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(limpio.vencimiento)) {
    return err('fecha_rara', 'La fecha de vencimiento tiene que ser un día del calendario.');
  }

  return ok(limpio);
}

/**
 * Lee el almacen de este aparato.
 *
 * NO PUEDE FALLAR, igual que `hydrate()` en `core/repository.js` y por la misma
 * razon: el obrador tiene que poder abrir la pantalla pase lo que pase. Lo peor
 * que ocurre es empezar con el almacen vacio.
 *
 * Lo que devuelve en `warning` no es un error: es de donde salieron los datos y
 * que salio raro por el camino.
 *
 * @returns {{lotes: Array<object>, warning: string}}
 */
export function leerAlmacen() {
  const leido = readJsonState(CLAVE);

  if (leido.state === 'empty') return { lotes: [], warning: '' };

  if (leido.state === 'corrupt') {
    // No se sobrescribe lo que no se pudo leer: se avisa y se sigue con el
    // almacen vacio. Quien quiera rescatarlo todavia lo tiene en el navegador.
    return {
      lotes: [],
      warning:
        'La copia del almacén de este equipo no se pudo leer y se empezó de cero. No se ha borrado nada.',
    };
  }

  const datos = leido.value;
  const crudos = datos && Array.isArray(datos.lotes) ? datos.lotes : [];
  const lotes = crudos.map(normalizarLote).filter((l) => l.id && l.ingrediente);

  const perdidos = crudos.length - lotes.length;
  return {
    lotes,
    warning:
      perdidos > 0
        ? `Se descartaron ${perdidos} registros del almacén porque les faltaban datos básicos.`
        : '',
  };
}

/**
 * Guarda el almacen entero.
 *
 * @param {Array<object>} lotes
 * @returns {{ok: true, value: any} | {ok: false, code: string, message: string}}
 */
export function guardarLotes(lotes) {
  const anterior = readJsonState(CLAVE);
  if (anterior.state === 'corrupt' || anterior.value?.operacionVersion) {
    return err('historial_protegido', 'La bodega tiene historial. Usa las operaciones auditadas para registrar cambios.');
  }
  return writeJson(CLAVE, {
    version: VERSION,
    revision: new Date().toISOString(),
    lotes: (lotes || []).map(normalizarLote),
  });
}

/**
 * Siguiente codigo libre. Nunca reutiliza uno dado de baja.
 *
 * Se mira el MAXIMO usado y no cuantos hay: con `lotes.length + 1`, borrar el
 * ultimo y crear otro devolveria un codigo que ya estuvo en uso, y el historial
 * de consumos dejaria de poder atribuirse.
 *
 * @param {Array<object>} lotes
 * @returns {string}
 */
export function siguienteId(lotes) {
  let mayor = 0;
  for (const lote of lotes || []) {
    // Solo codigos de lote: el historial tambien guarda notas y otros
    // registros con identificadores propios, y `98955bd6-…` no es el lote 98955.
    const codigo = /^L(\d+)$/.exec(String(lote?.id ?? ''));
    if (!codigo) continue;
    const n = parseInt(codigo[1], 10);
    if (Number.isFinite(n) && n > mayor) mayor = n;
  }
  return 'L' + String(mayor + 1).padStart(3, '0');
}

/**
 * Cuanto cuesta UNA unidad de medida de ese lote.
 *
 * Es lo que el usuario pidio ver: "valor unitario por unidad de peso". No se
 * guarda nunca, se calcula al leer: guardarlo seria la misma cifra en dos
 * sitios, y el dia que alguien corrigiera el costo la copia mentiria.
 *
 * @param {object} lote
 * @returns {number|null} null si no se puede dividir
 */
export function valorUnitario(lote) {
  if (!lote) return null;
  const peso = numero(lote.pesoCompra);
  const costo = numero(lote.costoCompra);
  if (!(peso > 0)) return null;
  return costo / peso;
}

/**
 * Existencia total por ingrediente Y UNIDAD.
 *
 * La clave lleva la unidad dentro a proposito: es lo que impide sumar gramos
 * con unidades. Dos entradas para el mismo ingrediente en dos unidades es el
 * resultado correcto, no un fallo.
 *
 * @param {Array<object>} lotes
 * @returns {Map<string, {ingrediente: string, unidad: string, total: number, lotes: Array<object>}>}
 */
export function existenciaPorIngrediente(lotes) {
  const mapa = new Map();
  for (const lote of lotes || []) {
    const clave = claveDe(lote.ingrediente, lote.unidad);
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        ingrediente: lote.ingrediente,
        unidad: lote.unidad,
        total: 0,
        lotes: [],
      });
    }
    const entrada = mapa.get(clave);
    entrada.total += numero(lote.existencia);
    entrada.lotes.push(lote);
  }
  return mapa;
}

/**
 * Clave con la que se cruzan almacen y recetas.
 *
 * Se normaliza a mayusculas y sin espacios de sobra, pero NO se quitan los
 * acentos: los nombres del recetario ya vienen en mayusculas con tilde
 * (`AZÚCAR`) y el almacen se escribe copiando de ahi. Quitar acentos aqui y no
 * alli haria que las dos claves no se encontraran.
 *
 * @param {string} ingrediente
 * @param {string} unidad
 * @returns {string}
 */
export function claveDe(ingrediente, unidad) {
  return (
    String(ingrediente || '').trim().toUpperCase().replace(/\s+/g, ' ') +
    '|' +
    String(unidad || '').trim().toUpperCase()
  );
}

/**
 * Ordena los lotes por el que vence antes (FEFO: first expired, first out).
 *
 * Es lo correcto en un almacen de alimentos: lo que caduca primero se usa
 * primero. Los que no declaran fecha van AL FINAL, no al principio: sin fecha no
 * hay urgencia conocida, y adelantarlos consumiria antes lo que no corre prisa
 * dejando caducar lo que si.
 *
 * @param {Array<object>} lotes
 * @returns {Array<object>} copia ordenada
 */
export function lotesOrdenadosFEFO(lotes) {
  return [...(lotes || [])].sort((a, b) => {
    const fa = a.vencimiento || '';
    const fb = b.vencimiento || '';
    if (fa === '' && fb === '') return String(a.id).localeCompare(String(b.id));
    if (fa === '') return 1;
    if (fb === '') return -1;
    if (fa !== fb) return fa < fb ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * En que situacion esta un lote respecto a su fecha.
 *
 * @param {object} lote
 * @param {Date|string} [hoy]
 * @returns {'vencido'|'proximo'|'ok'|'sin_fecha'}
 */
export function estadoVencimiento(lote, hoy) {
  if (!lote || !lote.vencimiento) return 'sin_fecha';
  const dia = diaDe(hoy);
  if (lote.vencimiento < dia) return 'vencido';

  const limite = new Date(dia + 'T00:00:00Z');
  limite.setUTCDate(limite.getUTCDate() + DIAS_PROXIMO);
  return lote.vencimiento <= limite.toISOString().slice(0, 10) ? 'proximo' : 'ok';
}

/**
 * Cifras de cabecera de la pantalla.
 *
 * `valorTotal` cuenta lo que queda EN EXISTENCIA, no lo que se compro: es el
 * dinero que hay ahora mismo en la bodega, que es la pregunta que se hace quien
 * abre esta pantalla.
 *
 * @param {Array<object>} lotes
 * @param {Date|string} [hoy]
 * @returns {{lotes: number, ingredientes: number, valorTotal: number, vencidos: number, proximos: number, sinExistencia: number}}
 */
export function resumenAlmacen(lotes, hoy) {
  const lista = lotes || [];
  const ingredientes = new Set();
  let valorTotal = 0;
  let vencidos = 0;
  let proximos = 0;
  let sinExistencia = 0;

  for (const lote of lista) {
    ingredientes.add(claveDe(lote.ingrediente, lote.unidad));
    const unitario = valorUnitario(lote);
    if (unitario !== null) valorTotal += unitario * numero(lote.existencia);

    const estado = estadoVencimiento(lote, hoy);
    if (estado === 'vencido') vencidos += 1;
    else if (estado === 'proximo') proximos += 1;

    if (!(numero(lote.existencia) > 0)) sinExistencia += 1;
  }

  return {
    lotes: lista.length,
    ingredientes: ingredientes.size,
    valorTotal: Math.round(valorTotal),
    vencidos,
    proximos,
    sinExistencia,
  };
}

/**
 * Lotes de ejemplo para poder ver la pantalla funcionando desde el primer dia.
 *
 * SON DE EJEMPLO Y HAY QUE DECIRLO: se siembran solo si el almacen esta vacio y
 * la pantalla lo anuncia. Los precios son verosimiles pero inventados.
 *
 * Dos decisiones que no son de adorno:
 *
 *   - Los ingredientes y sus unidades salen de las 122 recetas REALES, leidas
 *     del propio recetario. Con nombres inventados el cruce con el plan del dia
 *     saldria vacio y pareceria que el modulo no funciona, cuando lo que
 *     fallaria es el ejemplo.
 *   - Las fechas se calculan RELATIVAS A HOY. Escritas a mano, el ejemplo se
 *     volveria todo "vencido" en unos meses y el estado dejaria de enseñarse.
 *
 * CON EL RECETARIO, EL EJEMPLO CUBRE TODO. Los 16 lotes escritos a mano solo
 * tocan 16 de los 176 pares ingrediente-unidad del catalogo, asi que casi
 * cualquier plan salia "incompleto" y no se podia probar ni el costo ni la
 * confirmacion. Si se pasan las recetas, se añade un lote por cada par que
 * falte -agua incluida- y reposicion donde lo escrito a mano no alcanza para
 * `TANDAS_DEMO` tandas de todo. Sin recetas se devuelven solo los 16: es lo
 * que usan las pruebas que miran lotes concretos.
 *
 * Una linea SIN PRECIO se sigue pudiendo ver: basta con dar de baja un lote.
 *
 * @param {Date|string} [hoy]
 * @param {Array<object>} [recetas] recetario actual
 * @returns {Array<object>}
 */
export function lotesDemo(hoy, recetas = []) {
  const base = diaDe(hoy);
  const enDias = (dias) => {
    const d = new Date(base + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  const crudos = [
    ['HARINA DE TRIGO', 'TRES CASTILLOS', 'BULTO', 25000, 'GR', 120000, 'H-2291', 180, 25000],
    ['AZÚCAR', 'INCAUCA', 'BULTO', 50000, 'GR', 190000, 'A-1180', 365, 42000],
    ['SAL', 'REFISAL', 'BOLSA', 1000, 'GR', 2800, 'S-0442', 540, 1000],
    ['HUEVOS', 'SANTA REYES', 'PANAL', 30, 'UND', 18000, 'HV-77', 18, 30],
    ['MANTEQUILLA', 'COLANTA', 'CAJA', 5000, 'GR', 95000, 'M-5521', 60, 3200],
    ['POLVO DE HORNEAR', 'ROYAL', 'TARRO', 1000, 'GR', 14000, 'P-0912', 300, 900],
    ['CREMA DE LECHE', 'ALPINA', 'CAJA', 1000, 'GR', 12500, 'CL-3390', 12, 1000],
    ['ESENCIA DE VAINILLA', 'LEVAPAN', 'FRASCO', 500, 'GR', 22000, 'EV-118', 400, 460],
    // Vencido a proposito: el estado tiene que verse sin tener que fabricarlo.
    ['CHOCOLATE 70%', 'LUKER', 'CAJA', 5000, 'GR', 210000, 'CH-0071', -9, 1500],
    ['CHOCOLATE 70%', 'LUKER', 'CAJA', 5000, 'GR', 225000, 'CH-0102', 240, 5000],
    ['LECHE', 'ALQUERÍA', 'BOLSA', 1000, 'GR', 4200, 'LE-8890', 9, 6000],
    ['ACEITE VEGETAL', 'GOURMET', 'GARRAFA', 20000, 'GR', 168000, 'AC-2010', 210, 14500],
    ['ALMENDRAS', 'DEL CASTILLO', 'BOLSA', 1000, 'GR', 48000, 'AL-5570', 150, 800],
    ['ANTIMOHO', 'LEVAPAN', 'BOLSA', 1000, 'GR', 31000, 'AM-0330', 420, 950],
    ['SPLENDA', 'SPLENDA', 'CAJA', 1000, 'GR', 62000, 'SP-1204', 500, 1000],
    ['YEMAS DE HUEVO', 'SANTA REYES', 'PANAL', 30, 'UND', 20000, 'YH-44', 15, 24],
  ];

  const escritos = crudos.map((fila, indice) =>
    normalizarLote({
      id: 'L' + String(indice + 1).padStart(3, '0'),
      ingrediente: fila[0],
      marca: fila[1],
      presentacion: fila[2],
      pesoCompra: fila[3],
      unidad: fila[4],
      // Factores ficticios exclusivos de la demostración, nunca para compras reales.
      equivalencias: { ML: 1, UND: 1, TANDA: 1, CM: 1 },
      costoCompra: fila[5],
      lote: fila[6],
      vencimiento: enDias(fila[7]),
      existencia: fila[8],
      registrado: new Date().toISOString(),
    }),
  );
  if (!Array.isArray(recetas) || !recetas.length) return escritos;

  // La demanda sale de consolidar el catalogo entero, que es la misma cuenta
  // que hara el plan: asi cada lote lleva exactamente el nombre y la unidad
  // que el costeo va a buscar, y no una variante que no cruce.
  const demanda = consolidar(recetas.map((recipe) => ({ recipe, factor: 1 }))).lineas;
  const lotes = [...escritos];
  for (const linea of demanda) {
    const clave = claveDe(linea.ingrediente, linea.unidad);
    const propios = escritos.filter((l) => claveDe(l.ingrediente, l.unidad) === clave);
    const vigente = propios
      .filter((l) => estadoVencimiento(l, base) !== 'vencido')
      .reduce((suma, l) => suma + numero(l.existencia), 0);
    const objetivo = linea.cantidad * TANDAS_DEMO;
    if (vigente >= objetivo) continue;

    const familia = familiaDemo(linea.ingrediente);
    const unidad = linea.unidad.toUpperCase();
    const { presentacion, paso } = PRESENTACION_DEMO[unidad] || PRESENTACION_DEMO.UND;
    const cantidad = Math.max(paso, Math.ceil((objetivo - vigente) / paso) * paso);
    // Si ya hay un lote escrito, la reposicion copia su precio: el mismo
    // producto no cambia de precio por ser de ejemplo.
    const referencia = propios[propios.length - 1];
    const precio = referencia ? valorUnitario(referencia) : precioDemo(familia, unidad);
    lotes.push(normalizarLote({
      id: 'L' + String(lotes.length + 1).padStart(3, '0'),
      ingrediente: linea.ingrediente,
      marca: referencia ? referencia.marca : 'EJEMPLO',
      proveedor: 'Proveedor de ejemplo',
      presentacion: referencia ? referencia.presentacion : presentacion,
      pesoCompra: cantidad,
      unidad,
      costoCompra: Math.max(100, Math.round((precio * cantidad) / 100) * 100),
      equivalencias: { ML: 1, UND: 1, TANDA: 1, CM: 1 },
      lote: 'EJ-' + String(lotes.length + 1).padStart(3, '0'),
      vencimiento: enDias(familia.vida),
      existencia: cantidad,
      registrado: new Date().toISOString(),
    }));
  }
  return lotes;
}

/**
 * Tandas de CADA receta del catalogo que el ejemplo tiene que poder cubrir.
 *
 * Con cinco se prueba una semana corta, o varias tandas de lo mismo, sin que el
 * costeo tropiece con faltantes que nadie compro. Va con nombre para que la
 * prueba lo lea de aqui en vez de copiar la cifra.
 */
export const TANDAS_DEMO = 5;

/** Como se compra cada unidad en el ejemplo, y de a cuanto. */
const PRESENTACION_DEMO = {
  GR: { presentacion: 'BOLSA', paso: 1000 },
  ML: { presentacion: 'GARRAFA', paso: 1000 },
  MG: { presentacion: 'FRASCO', paso: 1000 },
  UND: { presentacion: 'PAQUETE', paso: 30 },
  CM: { presentacion: 'UNIDAD', paso: 3000 },
};

/**
 * Precio de ejemplo por familia de ingrediente, en COP.
 *
 * `porMil` es el precio de 1.000 GR o 1.000 ML; `porUnidad`, el de una UND o un
 * CM; `vida`, los dias hasta el vencimiento. Van por familia y no uno por
 * ingrediente: son 160 nombres y el ejemplo solo tiene que ser verosimil.
 *
 * Gana la PRIMERA coincidencia, asi que lo concreto va antes que lo general:
 * "LECHE CONDENSADA" antes que "LECHE", "LICOR DE CACAO" antes que el chocolate.
 *
 * Los perecederos viven mas de `DIAS_PROXIMO` a proposito: los avisos de
 * "vence pronto" del ejemplo son los de los lotes escritos a mano, y no ciento
 * y pico que taparian los que importan.
 *
 * Dos lineas del recetario vienen en UND con cifras de gramos (mantequilla
 * 2.950 UND y harina 3.000 UND). No se corrigen aqui -eso lo decide la
 * panaderia-; su familia lleva un `porUnidad` del orden del gramo para que un
 * dato mal escrito no infle el total del ejemplo.
 */
const FAMILIAS_DEMO = [
  { patron: /PAPEL/, porMil: 0, porUnidad: 15, vida: 720 },
  { patron: /AGUA|HIELO/, porMil: 400, porUnidad: 1, vida: 365 },
  { patron: /LICOR|WHISKEY|VINO|TRIPLE SECO/, porMil: 55000, porUnidad: 55, vida: 720 },
  { patron: /CANELA|CLAVOS|ANIS|CARDAMOMO|JENGIBRE|NUEZ MOSCADA|PIMIENTA|ESPECIAS|AMAPOLA/, porMil: 60000, porUnidad: 60, vida: 365 },
  { patron: /VAINILLA|ESENCIA|ESCENCIA|COLOR|TINTURA/, porMil: 38000, porUnidad: 38, vida: 540 },
  { patron: /EMULSIFICANTE|ANTIMOHO|GELATINA|CR[ÉE]MOR|BICARBONATO|POLVO DE HORNEAR|MALTO|POLI DEXTROSA|OTENTI|DUBOR|TEGRAL|GLUCOSA/, porMil: 26000, porUnidad: 26, vida: 400 },
  { patron: /S?PLENDA/, porMil: 62000, porUnidad: 62, vida: 500 },
  { patron: /LEVADURA|MASA MADRE|POOLISH/, porMil: 14000, porUnidad: 14, vida: 45 },
  { patron: /CAF[ÉE]/, porMil: 42000, porUnidad: 42, vida: 180 },
  { patron: /CHOCOLATE|CACAO|COCOA|CHOCOLYNE|NUTELLA|GANACHE/, porMil: 46000, porUnidad: 46, vida: 240 },
  { patron: /MANTEQUILLA|MARGARINA|MANTECA|BUTTER/, porMil: 21000, porUnidad: 21, vida: 90 },
  { patron: /QUESO|CREMA AGRIA|YOGURT/, porMil: 24000, porUnidad: 24, vida: 45 },
  { patron: /LECHE CONDENSADA|AREQUIPE|LECHE EN POLVO/, porMil: 19000, porUnidad: 19, vida: 240 },
  { patron: /CREMA/, porMil: 14000, porUnidad: 14, vida: 45 },
  { patron: /LECHE/, porMil: 4500, porUnidad: 5, vida: 45 },
  { patron: /HUEVO|YEMAS|CLARAS/, porMil: 13000, porUnidad: 650, vida: 45 },
  { patron: /POLLO|TOCINETA/, porMil: 28000, porUnidad: 28, vida: 45 },
  { patron: /CHAMPI|TOMATE|ESPINACA|CILANTRO|ZANAHORIA/, porMil: 9000, porUnidad: 9, vida: 45 },
  // El azucar antes que los frutos secos: "AZÚCAR ( ALMENDRAS )" es azucar.
  { patron: /AZ[ÚU]CAR|PANELA|MELASA|MIEL/, porMil: 4200, porUnidad: 4, vida: 365 },
  { patron: /ALMENDRA|NOGAL|NUEZ|PASAS|DATILES|ARANDANOS|CRAMBERRIES|CEREZAS|CIRUELAS|COCO|SEMILLA|CHIA|LINAZA|AJONJOLI|GIRASOL|CONFITADA|CONFITURA|BOCADILLO/, porMil: 32000, porUnidad: 32, vida: 240 },
  { patron: /FRESA|MORA|PI[ÑN]A|GUAYABA|GUAN[ÁA]BANA|BANANO|BREVA|UCHUVA|AGRAZ|LIM[ÓO]N|NARANJA|FRUTOS ROJOS|FRUTA|MANZANA|RALLADURA|ALM[ÍI]BAR/, porMil: 8000, porUnidad: 700, vida: 45 },
  { patron: /HARINA|MAICENA|ALMID[ÓO]N|F[ÉE]CULA|ARROZ|AVENA|MEZCLA|MIGAS|GALLETA|BIZCOCHUELO|ALMOJ[ÁA]BANA|TRIGO|CEBADA/, porMil: 5200, porUnidad: 5, vida: 180 },
  { patron: /ACEITE/, porMil: 8400, porUnidad: 8, vida: 210 },
  { patron: /SAL\b/, porMil: 2800, porUnidad: 3, vida: 540 },
  { patron: /VINAGRE|JUGO/, porMil: 6000, porUnidad: 6, vida: 180 },
];

/** Lo que no encaja en ninguna familia: un precio medio, no un cero. */
const FAMILIA_GENERAL = { porMil: 15000, porUnidad: 1000, vida: 180 };

function familiaDemo(ingrediente) {
  const nombre = String(ingrediente || '').toUpperCase();
  return FAMILIAS_DEMO.find((f) => f.patron.test(nombre)) || FAMILIA_GENERAL;
}

/** Precio de UNA unidad de medida, en la unidad que pide la receta. */
function precioDemo(familia, unidad) {
  if (unidad === 'GR' || unidad === 'ML') return familia.porMil / 1000;
  if (unidad === 'MG') return familia.porMil / 1000000;
  return familia.porUnidad;
}

/* ===========================================================================
 *  AYUDAS
 * ======================================================================== */

function texto(valor) {
  return String(valor === undefined || valor === null ? '' : valor).trim();
}

/**
 * Lee una cantidad admitiendo la coma decimal, que es como se escribe aqui.
 *
 * @param {any} valor
 * @returns {number} 0 si no se puede leer
 */
function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const leido = Number(String(valor === undefined || valor === null ? '' : valor).replace(',', '.'));
  return Number.isFinite(leido) ? leido : 0;
}

function fecha(valor) {
  const t = texto(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

/**
 * El dia de hoy en `YYYY-MM-DD`, admitiendo que se lo pasen ya hecho.
 *
 * Se compara en texto y no con objetos `Date` porque las fechas del almacen son
 * DIAS, no instantes: comparar instantes arrastra la hora y la zona horaria, y
 * un lote que vence hoy se leeria como vencido o no segun la hora a la que se
 * abra la pantalla.
 */
function diaDe(hoy) {
  if (typeof hoy === 'string' && /^\d{4}-\d{2}-\d{2}/.test(hoy)) return hoy.slice(0, 10);
  const d = hoy instanceof Date ? hoy : new Date();
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const valor = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}
