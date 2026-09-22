/**
 * =============================================================================
 *  METAS DEL RESUMEN
 * =============================================================================
 *
 *  Las cifras con las que el panel pinta cada indicador de bien, atencion o mal.
 *  Las fija gerencia; el resto las ve.
 *
 *  POR QUE EN ESTE EQUIPO. La operacion todavia vive en este navegador
 *  (`zahavi_almacen_v1`), asi que sus metas tambien: una meta guardada en otro
 *  sitio mediria datos que no ve. Se mudan con la operacion cuando se
 *  centralice.
 *
 *  LEER NUNCA FALLA. Un valor ilegible, fuera de rango o inventado a mano cae a
 *  la cifra base de esa meta, no bloquea el panel. Guardar, en cambio, SI valida
 *  y devuelve el error nombrando la meta: lo que se escribe es lo que se leera.
 *
 *  Es el unico modulo de `core/bi/` que toca almacenamiento.
 */

import { readJson, writeJson, ok, err } from '../storage.js';

export const CLAVE_METAS = 'zahavi_metas_v1';

/** Metas en su orden de presentacion. `tolerancia` en las mismas unidades que la meta. */
export const DEFINICION_METAS = Object.freeze([
  Object.freeze({ clave: 'presupuestoMensual', nombre: 'Presupuesto mensual de materia prima', formato: 'pesos', base: null, min: 0, max: 1e11,
    tolerancia: null, sentido: 'bajar', dinero: true,
    ayuda: 'Lo máximo que quieres gastar en materia prima en un mes. Déjalo vacío si no tienes presupuesto. Se avisa cuando la proyección del mes lo pasa, y con atención hasta un 10 % por encima.' }),
  Object.freeze({ clave: 'cumplimientoPlan', nombre: 'Cumplimiento mínimo del plan', formato: 'porcentaje', base: 90, min: 0, max: 100,
    tolerancia: 5, sentido: 'subir', dinero: false,
    ayuda: 'Qué parte de las tandas planeadas debe quedar confirmada. Por debajo, el panel lo marca.' }),
  Object.freeze({ clave: 'rendimientoMinimo', nombre: 'Rendimiento mínimo', formato: 'porcentaje', base: 95, min: 0, max: 200,
    tolerancia: 5, sentido: 'subir', dinero: false,
    ayuda: 'Unidades vendibles frente a las que la receta dice que salen. 95 % quiere decir que de 100 esperadas salen al menos 95 buenas.' }),
  Object.freeze({ clave: 'rechazoMaximo', nombre: 'Rechazo máximo', formato: 'porcentaje', base: 5, min: 0, max: 100,
    tolerancia: 2.5, sentido: 'bajar', dinero: false,
    ayuda: 'Qué parte de lo que sale del horno puede no servir para la venta.' }),
  Object.freeze({ clave: 'coberturaMinima', nombre: 'Cobertura mínima de bodega', formato: 'dias', base: 3, min: 0, max: 365,
    tolerancia: 1, sentido: 'subir', dinero: false,
    ayuda: 'Para cuántos días de consumo normal debe alcanzar cada ingrediente. Con menos, avisa para comprar.' }),
  Object.freeze({ clave: 'avisoVencimiento', nombre: 'Aviso de vencimiento', formato: 'dias', base: 7, min: 1, max: 90,
    tolerancia: null, sentido: null, dinero: false,
    ayuda: 'Con cuántos días de anticipación se avisa que un lote va a vencer.' }),
  Object.freeze({ clave: 'alzaPrecio', nombre: 'Alza de precio que alerta', formato: 'porcentaje', base: 10, min: 1, max: 500,
    tolerancia: null, sentido: null, dinero: true,
    ayuda: 'Si una compra sale este porcentaje más cara por gramo que la anterior del mismo ingrediente, se avisa.' }),
]);

export const METAS_BASE = Object.freeze(Object.fromEntries(DEFINICION_METAS.map((d) => [d.clave, d.base])));

/**
 * Margen de «atencion» de una meta: el de su definicion o, en el presupuesto,
 * el 10 % de la meta (pasarse un poco no es lo mismo que pasarse mucho).
 */
export function toleranciaDe(clave, meta) {
  const d = DEFINICION_METAS.find((x) => x.clave === clave);
  if (!d) return null;
  if (d.tolerancia !== null) return d.tolerancia;
  return clave === 'presupuestoMensual' && Number.isFinite(meta) ? meta * 0.1 : null;
}

const enRango = (d, v) => Number.isFinite(v) && v >= d.min && v <= d.max;

/** Metas completas a partir de cualquier cosa: lo que no sirve cae a la base. */
export function normalizarMetas(bruto) {
  const fuente = bruto && typeof bruto === 'object' ? bruto : {};
  return Object.fromEntries(DEFINICION_METAS.map((d) => {
    const v = Object.hasOwn(fuente, d.clave) ? fuente[d.clave] : undefined;
    if (v === null && d.base === null) return [d.clave, null];
    return [d.clave, enRango(d, v) ? v : d.base];
  }));
}

/**
 * Lee una cifra escrita por una persona: '12,5', '12.5', '2.500.000', '$ 2.500.000', '90 %'.
 * Devuelve undefined si no es una cifra. '' devuelve null.
 */
function leerCifra(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (valor === null) return null;
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.replace(/[\s$%]/g, '');
  if (limpio === '') return null;
  // Puntos de miles (2.500.000 o 2.500,5); si no, la coma es el decimal.
  const texto = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio) ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(texto)) return undefined;
  return Number(texto);
}

/**
 * Valida lo que llega del formulario. Una meta ausente conserva su base; una
 * escrita mal devuelve el error con su nombre.
 */
export function validarMetas(entrada) {
  if (!entrada || typeof entrada !== 'object') return err('meta_invalida', 'No llegaron las metas para guardar.');
  const metas = {};
  for (const d of DEFINICION_METAS) {
    if (!Object.hasOwn(entrada, d.clave) || entrada[d.clave] === undefined) {
      metas[d.clave] = d.base;
      continue;
    }
    const v = leerCifra(entrada[d.clave]);
    if (v === null) {
      if (d.base !== null) return err('meta_invalida', `${d.nombre}: escribe una cifra.`);
      metas[d.clave] = null;
      continue;
    }
    if (v === undefined) return err('meta_invalida', `${d.nombre}: escribe solo una cifra, por ejemplo ${d.formato === 'pesos' ? '2.500.000' : '12,5'}.`);
    if (!enRango(d, v)) {
      return err('meta_invalida', `${d.nombre}: debe estar entre ${d.min.toLocaleString('es-CO')} y ${d.max.toLocaleString('es-CO')}.`);
    }
    metas[d.clave] = v;
  }
  return ok(metas);
}

/** Metas guardadas en este equipo. Nunca falla: lo ilegible cae a las bases. */
export function leerMetas() {
  let guardado = null;
  try {
    guardado = readJson(CLAVE_METAS, null);
  } catch {
    // readJson ya atrapa el JSON roto; esto cubre un almacenamiento que lanza
    // al leer. Leer metas nunca debe tumbar el panel: se usan las bases.
    guardado = null;
  }
  const valido = guardado && typeof guardado === 'object' && guardado.version === 1;
  const autor = valido && guardado.autor && typeof guardado.autor.nombre === 'string'
    ? { id: typeof guardado.autor.id === 'string' ? guardado.autor.id : null, nombre: guardado.autor.nombre } : null;
  const actualizado = valido && typeof guardado.actualizado === 'string' && Number.isFinite(Date.parse(guardado.actualizado))
    ? guardado.actualizado : null;
  return { metas: normalizarMetas(valido ? guardado.metas : null), actualizado, autor };
}

/** Guarda metas ya validadas con quien las cambio. */
export function escribirMetas(metas, autor) {
  const validas = validarMetas(metas);
  if (!validas.ok) return validas;
  if (!autor || typeof autor.nombre !== 'string') return err('autor', 'Tu sesión no dice quién eres. Vuelve a entrar.');
  const registro = { version: 1, metas: validas.value, actualizado: new Date().toISOString(),
    autor: { id: typeof autor.id === 'string' ? autor.id : null, nombre: autor.nombre } };
  const escrito = writeJson(CLAVE_METAS, registro);
  return escrito.ok ? ok(registro) : escrito;
}
