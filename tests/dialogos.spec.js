/**
 * EL TECLADO DENTRO DE LAS VENTANAS
 *
 * El Modo Pesar se usa con la bascula delante y las manos ocupadas: su teclado
 * no es una comodidad, es la forma prevista de manejarlo. Durante un tiempo no
 * funciono, porque el foco se quedaba fuera del panel y las teclas no llegaban
 * a quien las escucha. Con raton no se notaba y ninguna prueba lo alcanzaba.
 *
 * Fija que el foco entre en cada ventana y que el teclado del Modo Pesar
 * responda de inmediato, sin pulsar Tab antes.
 */

import { test, expect } from '@playwright/test';
import { entrar, abrirModulo, abrirAjustes, RECETA, TOTAL_RECETAS } from './apoyo.js';

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

  test('al terminar desaparece Siguiente y queda Anterior', async ({ page }) => {
    const dialogo = page.locator('[role=dialog]');
    const siguiente = dialogo.getByRole('button', { name: 'Siguiente' });

    await expect(siguiente).toBeVisible();

    // Los catorce pasos de la receta, uno por pulsacion.
    for (let i = 0; i < 14; i += 1) await page.keyboard.press('Space');

    await expect(dialogo.locator('.prod__done-title')).toHaveText('Todo pesado');

    // Ya no hay nada delante: ofrecer "Siguiente" seria ofrecer una accion que
    // no hace nada.
    await expect(siguiente).toHaveCount(0);
    await expect(dialogo.getByRole('button', { name: 'Anterior' })).toBeVisible();

    // Y vuelve al retroceder, porque desde ahi si hay un paso delante.
    await page.getByRole('button', { name: 'Anterior' }).click();
    await expect(dialogo.getByRole('button', { name: 'Siguiente' })).toBeVisible();
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
    await expect(dialogo.getByRole('button', { name: 'Siguiente' })).toBeFocused();

    // Y dando la vuelta entera, el foco sigue dentro.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    const dentro = await page.evaluate(() =>
      document.querySelector('[role=dialog]').contains(document.activeElement),
    );
    expect(dentro).toBe(true);
  });
});

test.describe('Ajustes, que sigue siendo una ventana', () => {
  /*
   * Aqui habia un bucle sobre «Plan del día», «Ingredientes» y «Ajustes».
   * Los dos primeros dejaron de ser ventanas: son pantallas completas, y a una
   * pantalla completa no se le puede pedir lo que se le pide a un dialogo. Un
   * dialogo atrapa el foco porque hay algo debajo a lo que no se debe llegar; en
   * una pantalla no hay nada debajo, y atraparlo impediria llegar con el teclado
   * a la barra del navegador. Lo que si se les sigue exigiendo -que Escape
   * salga, y a donde- esta justo debajo.
   */
  test('Ajustes: el foco entra, Escape cierra y vuelve al boton', async ({ page }) => {
    await entrar(page);
    await abrirAjustes(page);

    await expect(page.locator('[role=dialog]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('[role=dialog]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajustes' })).toBeFocused();
  });
});

test.describe('Las pantallas de modulo', () => {
  for (const modulo of ['plan', 'ingredientes', 'almacen']) {
    test(`${modulo}: Escape vuelve al menu, que es de donde se vino`, async ({ page }) => {
      await entrar(page);
      await abrirModulo(page, modulo);

      await page.keyboard.press('Escape');

      await expect(page.locator('.pantalla')).toHaveCount(0);
      await expect(page.locator('.inicio')).toBeVisible();
    });

    test(`${modulo}: abierto desde una receta, se vuelve A ESA receta`, async ({ page }) => {
      await entrar(page, `#/receta/${RECETA}`);
      const titulo = await page.locator('.sheet-head__title').textContent();

      await abrirModulo(page, modulo);
      // La receta de fondo viaja en la direccion y sobrevive al salto por el
      // menu: es lo que evita tener que buscarla otra vez entre 122.
      expect(await page.evaluate(() => window.location.hash)).toContain(`r=${RECETA}`);

      await page.getByRole('button', { name: 'Volver a la receta' }).click();

      await expect(page.locator('.sheet-head__title')).toHaveText(titulo);
    });
  }

});

test.describe('El editor', () => {
  test('se cierra con Escape sin guardar nada', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Nueva receta' }).click();
    await expect(page.locator('[role=dialog]')).toBeFocused();

    await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-DESCARTADA');
    await page.keyboard.press('Escape');

    await expect(page.locator('[role=dialog]')).toHaveCount(0);
    await expect(page.locator('nav [role=status]')).toHaveText(`${TOTAL_RECETAS} recetas`);
  });
});
