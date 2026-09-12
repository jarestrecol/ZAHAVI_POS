/**
 * Las recetas de un ingrediente, repartidas por la unidad con que lo miden.
 *
 * Fija el paso que faltaba para poder unificar unidades antes del costeo: la
 * pantalla avisaba de que un ingrediente se mide de dos formas, pero no decia
 * en cuales recetas, asi que la unica manera de encontrarlas era abrirlas a
 * mano. Son 67 lineas repartidas en 47 de las 121 recetas.
 *
 * Se prueba en navegador y no solo en la capa de datos porque lo que aqui
 * importa es que la separacion SE VEA: agrupar bien y pintarlo como una lista
 * corrida seria no haber hecho nada.
 */

import { test, expect } from '@playwright/test';
import { entrar, abrirModulo } from './apoyo.js';

/** Abre el catalogo y despliega la fila de un ingrediente. */
async function abrirIngrediente(page, nombre) {
  await entrar(page);
  await abrirModulo(page, 'ingredientes');

  const buscador = page.getByPlaceholder(/buscar ingrediente/i);
  await expect(buscador).toBeVisible();
  await buscador.fill(nombre);

  const fila = page.locator('.ings__fila').first();
  await expect(fila).toBeVisible();
  await fila.click();
}

test('un ingrediente medido de dos formas separa sus recetas por unidad', async ({ page }) => {
  // Crema de leche: 39 lineas en gramos y 2 en mililitros. Es el caso claro,
  // con una minoria pequeña y facil de senalar.
  await abrirIngrediente(page, 'CREMA DE LECHE');

  const grupos = page.locator('.ings__grupo');
  await expect(grupos).toHaveCount(2);

  // La unidad minoritaria va PRIMERA: es la que hay que revisar, y ponerla
  // debajo de treinta y nueve filas obligaria a desplazarse para verla.
  await expect(grupos.first().locator('.ings__grupo-unidad')).toHaveText('ML');
  await expect(grupos.first().locator('.ings__grupo-cuenta')).toContainText('2');

  // Y las dos que se salen se nombran, que es el objetivo entero.
  const minoritario = grupos.first().locator('.ings__receta-btn');
  await expect(minoritario).toHaveCount(2);
  await expect(grupos.first()).toContainText(/Crema Pastelera/i);
});

test('desde ahi se llega a la receta que hay que corregir', async ({ page }) => {
  await abrirIngrediente(page, 'CREMA DE LECHE');

  // Pulsar una receta del grupo minoritario abre su ficha: es el gesto que
  // convierte la lista en algo accionable y no en un informe para mirar.
  await page.locator('.ings__grupo').first().locator('.ings__receta-btn').first().click();

  // El titulo de la FICHA, no el de la hoja de impresion: `.sheet__title`
  // tambien existe en el arbol de impresion, oculto, y resuelve antes.
  await expect(page.locator('.sheet-head__title')).toBeVisible();
  await expect(page.locator('.sheet-head__title')).toContainText(/Crema Pastelera|Salsa Inglesa/i);
});

test('un ingrediente de una sola unidad no se agrupa', async ({ page }) => {
  // Agrupar cuando no hay nada que separar seria ruido en 144 de los 159.
  await abrirIngrediente(page, 'AZÚCAR');

  await expect(page.locator('.ings__grupo')).toHaveCount(0);
  await expect(page.locator('.ings__recetas-lista')).toBeVisible();
});

test('una receta que mezcla dos unidades del mismo ingrediente sale en los dos grupos', async ({
  page,
}) => {
  // R048 lleva agua en gramos Y en mililitros, en componentes distintos. Es el
  // caso mas grave, porque la incoherencia esta dentro de una sola formula, y
  // por eso tiene que verse dos veces y no una.
  await abrirIngrediente(page, 'AGUA');

  const grupos = page.locator('.ings__grupo');
  await expect(grupos).toHaveCount(2);

  const kremschnitt = /Kremschnitt/i;
  await expect(grupos.nth(0)).toContainText(kremschnitt);
  await expect(grupos.nth(1)).toContainText(kremschnitt);
});
