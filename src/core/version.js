/**
 * Version del recetario, escrita en un solo sitio.
 *
 * QUE SIGNIFICA EL NUMERO
 * -----------------------
 * El primer numero es la FASE de la hoja de ruta, no un capricho de semver:
 *
 *   1.0   consulta, edicion y publicacion de formulas
 *   1.5   escalado de tandas, plan del dia y catalogo de ingredientes
 *   2.x   costeo por receta y margen
 *   3.x   inventario y ordenes de produccion
 *
 * Se lee asi porque el recetario crece por modulos, no por versiones sueltas:
 * quien vea "v1.5.0" en la pantalla sabe que modulos tiene delante sin abrir
 * ninguna documentacion. El tercer numero sube con cada correccion publicada.
 *
 * POR QUE NO SE LEE DE package.json
 * ---------------------------------
 * El navegador tendria que pedirlo por red, y este recetario abre sin conexion.
 * Se declara aqui como constante y `scripts/verificar.mjs` comprueba en cada
 * verificacion que package.json dice exactamente lo mismo: si alguna vez se
 * separan, la verificacion falla antes de publicar.
 */
export const APP_VERSION = '1.5.0';

/** Fase de la hoja de ruta que corresponde a esta version. */
export const APP_FASE = 'Fase 1';
