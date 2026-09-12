/**
 * =============================================================================
 *  ICONOS DEL SISTEMA
 * =============================================================================
 *
 *  Cada icono es una lista de trazados sobre un lienzo de 24x24, con el mismo
 *  grosor de linea, para que se lean como una familia y no como un surtido.
 *
 *  POR QUE VIVEN AQUI Y NO EN LA VISTA QUE LOS DIBUJA
 *  --------------------------------------------------
 *  Estaban dentro de `views/header.js` mientras la barra era el unico sitio con
 *  iconos. Con el menu de modulos son dos las pantallas que enseñan el mismo
 *  icono para la misma cosa -el saco de los ingredientes, la caja del almacen-,
 *  y dos copias de un trazado son dos dibujos que el dia que alguien retoque uno
 *  dejan de ser el mismo simbolo. Que el almacen se vea distinto segun por donde
 *  se entre no es un detalle estetico: es que parecen dos sitios.
 *
 *  Son datos, no comportamiento: este archivo no importa nada, ni siquiera del
 *  propio proyecto.
 */

/** Calendario: el plan del dia. */
export const ICON_PLAN = [
  'M8 2v4', 'M16 2v4', 'M3 10h18',
  'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
];

/** Saco con etiqueta: el catalogo de ingredientes. */
export const ICON_INGREDIENTES = [
  'M6 2h12l2 6a8 8 0 0 1-8 14 8 8 0 0 1-8-14z',
  'M9 2v3', 'M15 2v3', 'M8 12h8',
];

/** Mas dentro de un documento: receta nueva. */
export const ICON_NUEVA = [
  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  'M14 2v6h6', 'M12 11v6', 'M9 14h6',
];

/** Caja de almacen: la bodega. */
export const ICON_ALMACEN = [
  'M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'M3 8l2.2-4.2A1.5 1.5 0 0 1 6.5 3h11a1.5 1.5 0 0 1 1.3.8L21 8',
  'M12 3v5',
  'M9 13h6',
];

/** Engranaje: ajustes. */
export const ICON_AJUSTES = [
  'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
];

/** Libro abierto: el recetario. */
export const ICON_RECETARIO = [
  'M12 7v13',
  'M3 5h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5',
  'M3 5v13h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5V5',
];

/**
 * Flecha a la izquierda: volver a la receta que se estaba leyendo.
 *
 * Solo se dibuja cuando se entro al modulo DESDE una ficha, asi que la flecha
 * dice la verdad: hay un sitio concreto del que se vino y al que se vuelve.
 */
export const ICON_VOLVER = [
  'M19 12H5', 'M12 19l-7-7 7-7',
];

/** Cuadricula: el menu de modulos. */
export const ICON_MENU = [
  'M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z',
];
