/**
 * LO QUE SALE POR LA IMPRESORA
 *
 * La hoja que se lleva al obrador es el unico sitio donde un error no se puede
 * corregir sobre la marcha: quien la tiene en la mano no ve la pantalla. Aqui
 * se comprueba que lo impreso es lo que se estaba mirando.
 *
 * El plan del dia llego a imprimir la ficha de la receta abierta: se daba por
 * hecho que la pantalla se repinta antes de volver de `setState`, y con las
 * transiciones de vista el pintado va despues.
 *
 * Fija que se imprima lo que se esta mirando: el plan cuando es el plan, y la
 * ficha escalada con sus cifras ya multiplicadas.
 */

import { test, expect } from '@playwright/test';
import {
  entrar,
  interceptarImpresion,
  hojaImpresa,
  abrirModulo,
  RECETA,
  filtro,
  cuantasEn,
} from './apoyo.js';

/** Registra berlinas hoy desde el calendario y abre sus materiales. */
async function materialesConBerlinas(page) {
  await abrirModulo(page, 'plan');
  await page.getByRole('button', { name: 'Registrar producción', exact: true }).click();
  await page.locator('.dia .area-btn--panaderia').click();
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('berlinas');
  await page.getByRole('button', { name: /^Añadir Berlinas/ }).click();
  await expect(page.locator('.reg__fila')).toHaveCount(1);
  await page.getByRole('button', { name: 'Volver al calendario' }).click();
  await page.getByRole('button', { name: 'Materiales', exact: true }).first().click();
}

test('los materiales del dia imprimen el plan, no la receta abierta', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  await interceptarImpresion(page);

  await materialesConBerlinas(page);
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();

  const hoja = await hojaImpresa(page);
  expect(hoja, 'no se monto ninguna hoja').not.toBeNull();
  expect(hoja.texto).toContain('Producción del día');
  expect(hoja.texto).toContain('Solo materiales');
  expect(hoja.texto).not.toContain('Costo estimado');
  expect(hoja.texto).toContain('Berlinas');
  expect(hoja.texto).not.toContain('Cheescake');
});

test('imprimir conserva la vista y no deja una hoja pendiente al volver a la ficha', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  await interceptarImpresion(page);

  await materialesConBerlinas(page);
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  await expect(page.locator('.pantalla')).toHaveCount(1);
  await expect(page.locator('.mat-area')).toHaveCount(1);
  await page.getByRole('button', { name: 'Volver a la receta' }).click();

  // Un plan que se quedara pendiente saldria en la siguiente impresion, cuando
  // ya nadie lo espera.
  await expect(page.locator('#print-root .sheet__title')).toHaveText('Cheescake Frio - Sin Azucar');
});

test('la ficha escalada se imprime escalada', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  await page.getByRole('button', { name: 'Multiplicar la tanda por 3' }).click();

  const hoja = page.locator('#print-root .sheet');
  await expect(hoja.locator('.sheet__yield')).toHaveText('Rinde 3 und');
  await expect(hoja.locator('.sheet__scaled')).toContainText('TANDA ×3');
  // 300 gr de la formula, 900 en la hoja: la regla vive en el nucleo, no en la
  // pantalla, y por eso llega al papel.
  await expect(hoja).toContainText('900 gr');
});

test('sin receta abierta se imprime el indice, con el filtro puesto', async ({ page }) => {
  await entrar(page);
  await page.getByRole('button', { name: filtro('GALLETAS') }).click();

  const hoja = page.locator('#print-root .sheet');
  await expect(hoja.locator('.sheet__title')).toHaveText('Índice de recetas');
  await expect(hoja).toContainText(`${cuantasEn('GALLETAS')} recetas`);
  await expect(hoja).toContainText('galletas');
});
