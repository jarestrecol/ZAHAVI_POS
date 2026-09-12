/**
 * =============================================================================
 *  EXPORTACION A CSV
 * =============================================================================
 *
 *  Para sacar una tabla del recetario y abrirla en Excel. Lo pidio el usuario
 *  con un proposito concreto:
 *
 *      "poder imprimir la lista completa de los ingredientes para poder
 *       visualizarla o exportarla de alguna forma a excel, esto con el fin de
 *       poder alimentar una base de datos externa para poder luego darle un
 *       valor a estos ingredientes"
 *
 *  LAS DOS DECISIONES QUE DECIDEN SI ESTO SIRVE O NO
 *  ------------------------------------------------
 *  1. SEPARADOR `;`. Excel en español interpreta el separador segun la
 *     configuracion regional del sistema, y ahi el punto y coma es el separador
 *     de lista. Con coma, TODA la tabla entra en la columna A y hay que
 *     rescatarla a mano con el asistente de importacion.
 *
 *  2. BOM UTF-8 al principio. Sin el, Excel abre el archivo como ANSI y los
 *     acentos se parten: `AZÚCAR` sale `AZÃšCAR`. Este recetario esta lleno de
 *     acentos, asi que sin BOM la exportacion nace inservible.
 *
 *  Las dos son invisibles a ojo y las dos rompen el archivo en silencio. Por eso
 *  van aqui, en un solo sitio, y no en cada pantalla que exporte.
 *
 *  Este modulo vive en `lib/`: no conoce el recetario ni el almacen, solo
 *  convierte filas en texto y ofrece el archivo.
 */

/** Lo que hace que Excel lea el archivo como UTF-8. */
const BOM = '﻿';

/** Separador de lista del español. Ver la cabecera. */
const SEPARADOR = ';';

/**
 * Convierte filas en texto CSV.
 *
 * @param {Array<Array<string|number>>} filas
 * @param {Array<string>} [cabeceras]
 * @returns {string}
 */
export function aCSV(filas, cabeceras) {
  const lineas = [];
  if (cabeceras && cabeceras.length) lineas.push(cabeceras.map(celda).join(SEPARADOR));
  for (const fila of filas || []) lineas.push((fila || []).map(celda).join(SEPARADOR));
  // Fin de linea de Windows: es donde se va a abrir esto, y con `\n` a secas
  // algunas versiones de Excel juntan todo en una fila.
  return BOM + lineas.join('\r\n');
}

/**
 * Entrecomilla una celda cuando hace falta.
 *
 * Hace falta si lleva el separador, comillas o un salto de linea. Las comillas
 * de dentro se duplican, que es como el formato las escapa.
 *
 * @param {any} valor
 * @returns {string}
 */
function celda(valor) {
  const texto = valor === undefined || valor === null ? '' : String(valor);
  if (texto.includes(SEPARADOR) || texto.includes('"') || /[\r\n]/.test(texto)) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

/**
 * Ofrece el texto como un archivo para descargar.
 *
 * POR QUE `Blob` Y NO UNA `data:` URI
 * -----------------------------------
 * Una `data:` URI mete el archivo entero dentro de la direccion, y varios
 * navegadores cortan ahi por longitud. El catalogo son 159 ingredientes: hoy
 * cabria, pero el dia que se exporte el almacen con su historial no, y el fallo
 * seria un archivo truncado sin ningun aviso.
 *
 * La URL se revoca despues: cada una retiene el archivo en memoria hasta que se
 * suelta o se cierra la pestaña.
 *
 * @param {string} nombre nombre del archivo, con extension
 * @param {string} texto contenido ya en CSV
 */
export function descargarCSV(nombre, texto) {
  const blob = new Blob([texto], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  // Fuera de la vista pero DENTRO del documento: Firefox no dispara la descarga
  // de un enlace que no esta conectado al arbol.
  enlace.style.position = 'fixed';
  enlace.style.left = '-9999px';
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);

  // Se suelta en el siguiente turno: revocarla en el mismo cancela la descarga
  // en algunos navegadores, porque el archivo aun no se ha empezado a leer.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Un nombre de archivo con la fecha de hoy, para que no se pisen entre si.
 *
 * @param {string} base
 * @returns {string}
 */
export function nombreConFecha(base) {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}
