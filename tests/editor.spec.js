/**
 * EL EDITOR NO DEJA GUARDAR UNA RECETA A MEDIAS
 *
 * Antes bastaba con el nombre del ingrediente: se podia guardar "AZUCAR" sin
 * cantidad y sin unidad. Ese ingrediente envenena todo lo que toca -escalar la
 * tanda, consolidar la compra del dia, el Modo Pesar junto a la bascula, y la
 * hoja que se lleva al obrador-, y no da error en ninguno de esos sitios: sale
 * el nombre y ninguna cifra.
 *
 * Se comprueba tambien DONDE se ve el aviso. El mensaje existia pero estaba al
 * final del formulario, detras del metodo de preparacion: se pulsaba Guardar, no
 * se guardaba, y en pantalla no pasaba nada.
 */

import { test, expect } from '@playwright/test';
import { entrar } from './apoyo.js';

/**
 * Abre el editor con una receta a medio rellenar.
 *
 * Sin recetario compartido a proposito: asi no aparece la puerta de la clave de
 * edicion, que tiene sus propias pruebas y aqui solo seria ruido.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{cantidad?: string, unidad?: string}} campos
 */
async function abrirEditorCon(page, campos) {
  await page.route('**/api/recipes', (route) => route.fulfill({ status: 404, body: '' }));
  await entrar(page);

  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-CAMPOS');
  await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-AZUCAR');

  if (campos.cantidad !== undefined) {
    await page.locator('#it-0-0-c').fill(campos.cantidad);
  }
  if (campos.unidad !== undefined) {
    await page.locator('#it-0-0-u').fill(campos.unidad);
  }

  await page.getByRole('button', { name: 'Guardar' }).click();
}

test('sin cantidad no guarda, y lo dice donde se esta mirando', async ({ page }) => {
  await abrirEditorCon(page, {});

  const aviso = page.locator('.form-error');
  await expect(aviso).toContainText('Falta la cantidad');

  // Y dice CUAL ingrediente: con catorce lineas en pantalla, "falta una
  // cantidad" obliga a buscarla a ojo.
  await expect(aviso).toContainText('QA-TEST-AZUCAR');

  // El aviso esta en el pie, a la vista, no al final del formulario.
  await expect(page.locator('.win__footer .form-error')).toBeVisible();

  // Y el editor sigue abierto con lo escrito dentro.
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toHaveValue('QA-TEST-CAMPOS');
});

test('sin unidad tampoco guarda', async ({ page }) => {
  await abrirEditorCon(page, { cantidad: '100', unidad: '' });

  await expect(page.locator('.form-error')).toContainText('Falta la unidad');
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toBeVisible();
});

test('una cantidad que no es un numero no guarda', async ({ page }) => {
  await abrirEditorCon(page, { cantidad: 'un poco' });

  await expect(page.locator('.form-error')).toContainText('tiene que ser un número');
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toBeVisible();
});

test('una cantidad de cero no guarda', async ({ page }) => {
  await abrirEditorCon(page, { cantidad: '0' });

  await expect(page.locator('.form-error')).toContainText('mayor que cero');
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toBeVisible();
});

test('con los tres campos completos si guarda', async ({ page }) => {
  await abrirEditorCon(page, { cantidad: '100' });

  // El editor se cierra y la receta queda en el listado.
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toHaveCount(0);
  await expect(page.locator('.sheet__title')).toContainText('Qa-Test-Campos');
});
