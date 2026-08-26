/**
 * =============================================================================
 *  PREFERENCIAS DE ESTE APARATO
 * =============================================================================
 *
 *  Lo que cada equipo decide para si mismo y no viaja a las demas sedes. Hoy
 *  hay una sola: el tamano del texto de las recetas.
 *
 *  POR QUE NO ESTA EN `data/recipes.json`
 *  --------------------------------------
 *  Porque no es un dato del recetario. La tableta de pared del obrador se lee
 *  a un brazo de distancia y el telefono que alguien saca del bolsillo se lee a
 *  treinta centimetros: el tamano que le sirve a uno le estorba al otro. Que
 *  esto se publicara significaria que ajustar la pantalla de la panaderia
 *  cambia la de la casa de produccion, que es exactamente lo contrario de lo
 *  que se pide.
 *
 *  POR QUE UNA CLAVE Y NO UN NUMERO
 *  --------------------------------
 *  Aqui se guarda `'pequeno'`, no `0.8`. Las cifras viven en `tokens.css`
 *  (regla 3) y este modulo solo elige entre nombres que el CSS ya conoce. Asi
 *  un valor corrupto en el almacen local -o inventado a mano- no puede colar un
 *  tamano arbitrario: si no esta en la lista, se cae al de siempre.
 */

import { readText, writeText, ok, err } from './storage.js';

/** Donde se guarda. Lleva version por si algun dia cambia la forma. */
const CLAVE = 'zahavi_escala_texto_v1';

/**
 * Las opciones, en el orden en que se muestran: de la mas pequena a la mas
 * grande. Cada `clave` tiene su pareja en `tokens.css`
 * (`:root[data-escala='pequeno']` y compania).
 *
 * No hay porcentajes en las etiquetas a proposito. El numero real esta en el
 * CSS, y escribirlo tambien aqui seria la misma cifra en dos sitios: el dia que
 * se afine el CSS, la etiqueta mentiria sin que nadie se diera cuenta. Quien
 * quiera ver el tamano lo tiene delante, en la muestra viva de Ajustes.
 */
export const ESCALAS = Object.freeze([
  Object.freeze({ clave: 'pequeno', nombre: 'Pequeño' }),
  Object.freeze({ clave: 'mediano', nombre: 'Mediano' }),
  Object.freeze({ clave: 'normal', nombre: 'Normal' }),
  Object.freeze({ clave: 'grande', nombre: 'Grande' }),
]);

/** El de siempre: el tamano con el que se diseno la ficha. */
export const ESCALA_POR_DEFECTO = 'normal';

/**
 * Deja pasar solo una de las claves conocidas.
 *
 * @param {any} valor
 * @returns {string} una clave valida, siempre
 */
export function normalizarEscala(valor) {
  return ESCALAS.some((escala) => escala.clave === valor) ? valor : ESCALA_POR_DEFECTO;
}

/**
 * Escala guardada en este aparato.
 *
 * NO PUEDE FALLAR, igual que `hydrate` en el repositorio y por la misma razon:
 * el obrador tiene que poder abrir la aplicacion pase lo que pase, y un almacen
 * local vaciado o corrompido no es motivo para dejar a nadie sin recetas. Lo
 * peor que ocurre es volver al tamano de siempre.
 *
 * @returns {string} clave de escala
 */
export function leerEscalaTexto() {
  return normalizarEscala(readText(CLAVE));
}

/**
 * Guarda la escala elegida.
 *
 * @param {string} valor clave de escala
 * @returns {{ok: true, value: string} | {ok: false, code: string, message: string}}
 */
export function guardarEscalaTexto(valor) {
  const escala = normalizarEscala(valor);
  const escrito = writeText(CLAVE, escala);

  // El almacen local puede estar lleno o bloqueado (navegacion privada en
  // algunos navegadores). No es grave -la escala se aplica igual en esta
  // sesion- pero se dice, porque de otro modo la persona la volveria a poner
  // cada manana sin entender por que no se queda.
  if (!escrito.ok) {
    return err(
      'escala_no_guardada',
      'El tamaño se aplicó, pero este equipo no pudo recordarlo para la próxima vez.',
    );
  }

  return ok(escala);
}
