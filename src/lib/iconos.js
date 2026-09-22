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
  'M4 4h16v16H4z', 'M4 10h16', 'M10 10v10', 'M14 14h2', 'M14 17h2',
];

/** Mas dentro de un documento: receta nueva. */
export const ICON_NUEVA = [
  'M12 5v14', 'M5 12h14',
];

/** Caja de almacen: la bodega. */
export const ICON_ALMACEN = [
  'M3 9l9-5 9 5v11H3z', 'M8 20V11h8v9', 'M8 15h8',
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

/** Avance: siguiente paso del modo de producción. */
export const ICON_AVANZAR = ['M5 12h14', 'M12 5l7 7-7 7'];

/** Cuadricula: el menu de modulos. */
export const ICON_MENU = [
  'M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z',
];

/** Cierre: se usa en ventanas, filas y selecciones removibles. */
export const ICON_CERRAR = ['M6 6l12 12', 'M18 6 6 18'];

/** Lupa: buscar una formula sin depender de un glifo de fuente. */
export const ICON_BUSCAR = ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4.35-4.35'];

/** Balanza: accion principal del obrador. */
export const ICON_PESAR = [
  'M12 4v16', 'M8 20h8', 'M4 8h16',
  'M4 8 1.5 13.5a3 3 0 0 0 5 0L4 8z', 'M20 8l-2.5 5.5a3 3 0 0 0 5 0L20 8z',
];

/** Impresora, lapiz y papelera: acciones de la ficha. */
export const ICON_IMPRIMIR = [
  'M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
  'M6 14h12v7H6z',
];
export const ICON_EDITAR = ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'];
export const ICON_ELIMINAR = ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6'];

/* ---- Calendario de producción (PROD-002) ------------------------------------ */
export const ICON_ANTERIOR = ['M15 18l-6-6 6-6'];
export const ICON_SIGUIENTE = ['M9 18l6-6-6-6'];
export const ICON_CALENDARIO = ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M4 10h16', 'M8 2v4', 'M16 2v4'];
export const ICON_TAREA = ['M9 11l3 3 8-8', 'M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'];
export const ICON_PENDIENTE = ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'];
export const ICON_RECOMENDACION = ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'];
export const ICON_FELICITACION = ['M12 3l2.7 5.5 6 .9-4.4 4.3 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.4l6-.9z'];
export const ICON_MATERIALES = ['M21 8l-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'];
export const ICON_COSTOS = ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5', 'M12 6v2', 'M12 16v2'];
export const ICON_PROYECTAR = ['M5 4l14 8-14 8z'];
export const ICON_EQUIPO = ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1', 'M16 3.1a4 4 0 0 1 0 7.8', 'M22 21v-1a6 6 0 0 0-4-5.6'];
export const ICON_HISTORIAL = ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v5l3 2'];
export const ICON_LISTO = ['M5 12l5 5L20 7'];
export const ICON_MAS = ['M12 5v14', 'M5 12h14'];
