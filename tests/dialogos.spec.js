/**
 * EL TECLADO DENTRO DE LAS VENTANAS
 *
 * El Modo Pesar se usa con la bascula delante y las manos ocupadas: su teclado
 * no es una comodidad, es la forma prevista de manejarlo. Durante un tiempo no
 * funciono, porque el foco se quedaba fuera del panel y las teclas no llegaban
 * a quien las escucha. Con raton no se notaba y ninguna prueba lo alcanzaba.
 *
 * Cubre los puntos 28, 29, 30, 93a, 94 y 95 de QA.md.
 */

import { test, expect } from '@playwright/test';
import { entrar, RECETA } from './apoyo.js';

test.describe('Modo Pesar', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page, `#/receta/${RECETA}`);
    await page.getByRole('button', { name: 'Abrir modo producción para pesar' }).click();
    // El panel pide el foco en el cuadro siguiente, ya montado. Esperarlo aqui
    // es lo que hace que las teclas de cada prueba lleguen a su destino.
    await expect(page.locator('[role=dialog]')).toBeFocused();
  });

  test('el foco entra en el panel al abrirlo', async ({ page }) => {
    // No basta con que la ventana este abierta: si el foco se queda en <body>,
    // el panel no recibe ni una tecla.
    await expect(page.locator('[role=dialog]')).toBeFocused();
  });

  test('la barra espaciadora da por pesado y avanza', async ({ page }) => {
    const paso = page.locator('[role=dialog] [role=status]');
    await expect(paso).toHaveText('1 de 14');

    // Sin pulsar Tab antes: quien esta pesando no va a tabular primero.
    await page.keyboard.press('Space');
    await expect(paso).toHaveText('2 de 14');
  });

  test('las flechas mueven adelante y atras', async ({ page }) => {
    const paso = page.locator('[role=dialog] [role=status]');
    await page.keyboard.press('ArrowRight');
    await expect(paso).toHaveText('2 de 14');
    await page.keyboard.press('ArrowLeft');
    await expect(paso).toHaveText('1 de 14');
  });

  test('Escape sale y devuelve el foco al boton que abrio', async ({ page }) => {
    await page.keyboard.press('Escape');
    await expect(page.locator('[role=dialog]')).toHaveCount(0);

    // El repintado reconstruye la ficha entera, asi que el boton ya no es el
    // mismo nodo: hay que reencontrarlo, no basta con guardarse una referencia.
    await expect(page.getByRole('button', { name: 'Abrir modo producción para pesar' })).toBeFocused();
  });

  test('Intro sobre un boton hace lo del boton, no lo del panel', async ({ page }) => {
    // La guarda que separa la semantica del boton de la del panel: sin ella,
    // Intro sobre "Salir" daba el ingrediente por pesado en vez de cerrar.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Salir' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[role=dialog]')).toHaveCount(0);
  });

  test('el foco no se escapa por detras', async ({ page }) => {
    const dialogo = page.locator('[role=dialog]');

    // Hacia atras desde el panel recien abierto: al ultimo control, no fuera.
    await page.keyboard.press('Shift+Tab');
    await expect(dialogo.getByRole('button', { name: 'Pesado · siguiente' })).toBeFocused();

    // Y dando la vuelta entera, el foco sigue dentro.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    const dentro = await page.evaluate(() =>
      document.querySelector('[role=dialog]').contains(document.activeElement),
    );
    expect(dentro).toBe(true);
  });
});

test.describe('Las demas ventanas', () => {
  for (const ventana of ['Plan del día', 'Ingredientes', 'Ajustes']) {
    test(`${ventana}: el foco entra, Escape cierra y vuelve al boton`, async ({ page }) => {
      await entrar(page);
      await page.getByRole('button', { name: ventana, exact: true }).click();

      await expect(page.locator('[role=dialog]')).toBeFocused();

      await page.keyboard.press('Escape');
      await expect(page.locator('[role=dialog]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: ventana, exact: true })).toBeFocused();
    });
  }

  test('el editor se cierra con Escape sin guardar nada', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Nueva receta' }).click();
    await expect(page.locator('[role=dialog]')).toBeFocused();

    await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-DESCARTADA');
    await page.keyboard.press('Escape');

    await expect(page.locator('[role=dialog]')).toHaveCount(0);
    await expect(page.locator('nav [role=status]')).toHaveText('121 recetas');
  });
});
