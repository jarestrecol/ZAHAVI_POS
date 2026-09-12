/**
 * =============================================================================
 *  EL MENU DE MODULOS Y EL ENRUTADO POR MODULO
 * =============================================================================
 *
 *  Lo que se fija aqui no es que el menu se vea bonito: es que la reorganizacion
 *  de las direcciones no haya roto nada de lo que la panaderia ya usaba.
 *
 *  Dos de estas pruebas cubren defectos que de verdad se introdujeron al hacer
 *  el cambio y que ninguna revision vio:
 *
 *    - pulsar una receta desde el catalogo de Ingredientes llevaba al listado en
 *      vez de a la ficha, porque se navegaba y acto seguido se cerraba la
 *      ventana, y el cierre leia la ruta vieja y pisaba el destino;
 *    - los enlaces del listado heredaban el modulo abierto, asi que con el plan
 *      delante apuntaban a `#/plan?r=...`.
 *
 *  Y una cubre algo que NO puede romperse nunca: los enlaces `#/receta/R001` que
 *  el equipo tiene pegados en conversaciones y guardados en la pantalla de
 *  inicio de sus telefonos.
 */

import { test, expect } from '@playwright/test';
import { entrar, abrirModulo } from './apoyo.js';

const RECETA = 'R001';

/* ===========================================================================
 *  1. A DONDE SE ENTRA
 * ======================================================================== */

test('al entrar se llega al menú, no al listado de recetas', async ({ page }) => {
  await entrar(page, '#/');

  await expect(page.locator('.inicio')).toBeVisible();
  // Lo que ANTES pasaba: caer directamente en el recetario.
  await expect(page.locator('nav[aria-label="Listado de recetas"]')).toHaveCount(0);
});

test('el menú enseña una cifra real de cada módulo, no solo el nombre', async ({ page }) => {
  await entrar(page, '#/');

  const recetario = page.locator('.modulo[data-tono="recetario"]');
  // La cifra sale del recetario cargado. No se compara contra un numero escrito
  // aqui: lo que importa es que sea una cantidad y no un texto fijo.
  await expect(recetario.locator('.modulo__dato')).toHaveText(/^\d+ fórmulas$/);

  await expect(page.locator('.modulo[data-tono="ingredientes"] .modulo__dato')).toHaveText(
    /^\d+ en el catálogo$/,
  );
});

test('cada tarjeta lleva a su módulo', async ({ page }) => {
  await entrar(page, '#/');

  await page.locator('.modulo[data-tono="recetario"]').click();
  await expect(page.locator('nav[aria-label="Listado de recetas"]')).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe('#/recetario');

  await page.goto('/index.html#/');
  await page.locator('.modulo[data-tono="almacen"]').click();
  expect(await page.evaluate(() => window.location.hash)).toBe('#/almacen');
});

/* ===========================================================================
 *  2. LOS ENLACES REPARTIDOS SIGUEN VALIENDO
 * ======================================================================== */

test('un enlace antiguo `#/receta/R001` sigue abriendo la receta', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);

  // Se abre la ficha, no el menu ni el listado.
  await expect(page.locator('.sheet-head__title')).toBeVisible();
});

test('una dirección que no se entiende lleva al menú y no rompe el arranque', async ({ page }) => {
  // Un porcentaje incompleto hace que `decodeURIComponent` lance. Antes de que
  // se protegiera, un enlace asi impedia arrancar la aplicacion entera.
  //
  // Se cambia el hash a mano porque `entrar` espera a la carcasa de un modulo y
  // esta direccion no abre ninguno: cae en el menu, que es justo lo que hay que
  // comprobar.
  await entrar(page, '#/');
  await page.evaluate(() => { window.location.hash = '#/receta/%E0%A4%A'; });

  await expect(page.locator('.inicio')).toBeVisible();
  await expect(page.locator('.fallo')).toHaveCount(0);
});

/* ===========================================================================
 *  3. IR Y VOLVER ENTRE MODULOS
 * ======================================================================== */

test('el botón Menú vuelve al inicio desde el recetario', async ({ page }) => {
  await entrar(page, '#/recetario');

  await page.getByRole('button', { name: 'Menú' }).click();

  await expect(page.locator('.inicio')).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe('#/');
});

test('la receta que se está leyendo sobrevive al paso por el menú', async ({ page }) => {
  /*
   * ES EL CAMINO MAS USADO DEL DIA, Y EL QUE MAS FACIL ERA ROMPER.
   *
   * Se esta leyendo una formula, hace falta mirar cuanto hay en bodega, y hay
   * que volver a la misma formula. Mientras el almacen se abria desde un boton
   * de la barra del recetario, el fondo se heredaba en un solo salto. Ahora son
   * dos saltos -receta, menu, modulo- y basta con que el menu deje caer la
   * receta para que volver signifique buscarla otra vez entre 122.
   */
  await entrar(page, `#/receta/${RECETA}`);
  const titulo = await page.locator('.sheet-head__title').textContent();

  await page.getByRole('button', { name: 'Menú', exact: true }).click();
  // Se espera al menu antes de mirar nada: el hash cambia antes que la pantalla
  // -el repintado va detras de la transicion de vista- y medir en medio es
  // medir una pantalla a medio cambiar.
  await expect(page.locator('.inicio')).toBeVisible();

  // El menu la lleva consigo: es lo que hace que la tarjeta del almacen apunte
  // a `#/almacen?r=...` y no a `#/almacen` a secas.
  expect(await page.evaluate(() => window.location.hash)).toContain(`r=${RECETA}`);

  await abrirModulo(page, 'almacen');
  expect(await page.evaluate(() => window.location.hash)).toContain(`r=${RECETA}`);

  await page.getByRole('button', { name: 'Volver a la receta' }).click();
  await expect(page.locator('.sheet-head__title')).toHaveText(titulo);
});

test('entrando a un módulo desde el menú no se promete una vuelta que no existe', async ({ page }) => {
  // Sin receta detras no hay a donde volver, y una flecha de volver que llevara
  // al listado prometeria un sitio en el que no se ha estado.
  await entrar(page, '#/almacen');

  await expect(page.getByRole('button', { name: 'Volver a la receta' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menú', exact: true })).toBeVisible();
});

/* ===========================================================================
 *  4. EL MENU AVISA DE LO QUE HAY QUE MIRAR HOY
 * ======================================================================== */

test('el menú avisa de los lotes vencidos del almacén', async ({ page }) => {
  await entrar(page, '#/almacen');

  // Los lotes de ejemplo incluyen alguno vencido a proposito: es lo que permite
  // ver el aviso sin inventar datos en la prueba.
  await page.getByRole('button', { name: /cargar lotes de ejemplo/i }).click();
  await expect(page.locator('.almacen__fila').first()).toBeVisible();

  await page.evaluate(() => { window.location.hash = '#/'; });

  const aviso = page.locator('.modulo[data-tono="almacen"] .modulo__aviso');
  await expect(aviso).toBeVisible();
  // Con palabra y no solo con color: es la regla del obrador a contraluz.
  await expect(aviso).toHaveText(/lote/i);
});
