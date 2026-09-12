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

test('el plan del dia imprime el plan, no la receta abierta', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  await interceptarImpresion(page);

  await abrirModulo(page, 'plan');
  await page.getByRole('searchbox', { name: 'Buscar receta para añadir' }).fill('berlinas');
  await page.getByRole('button', { name: /^Berlinas/ }).click();
  await page.getByRole('button', { name: 'Imprimir la lista' }).click();

  const hoja = await hojaImpresa(page);
  expect(hoja, 'no se monto ninguna hoja').not.toBeNull();
  expect(hoja.titulo).toBe('Producción del día');
  expect(hoja.texto).toContain('Berlinas');
  expect(hoja.texto).not.toContain('Cheescake');
});

test('y despues vuelve la ficha, para el siguiente Ctrl+P', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  await interceptarImpresion(page);

  await abrirModulo(page, 'plan');
  await page.getByRole('searchbox', { name: 'Buscar receta para añadir' }).fill('berlinas');
  await page.getByRole('button', { name: /^Berlinas/ }).click();
  await page.getByRole('button', { name: 'Imprimir la lista' }).click();
  // Imprimir sale del modulo: la hoja se monta ya en el recetario.
  await expect(page.locator('.pantalla')).toHaveCount(0);

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
