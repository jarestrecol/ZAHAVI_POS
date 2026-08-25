/**
 * CELULAR Y TABLETA
 *
 * Cuatro de los seis defectos de la ultima revision solo existian aqui: una
 * barra que se creia flotante y estaba atrapada bajo la cabecera, un listado
 * que se iba de lado, dos botones montados uno encima del otro y un control
 * que no habia forma de pulsar. En escritorio no se veia ninguno.
 *
 * Fija lo que solo se rompe en un telefono: acciones al alcance del pulgar,
 * nada solapado a 320 px y los cinco factores de la tanda alcanzables.
 */

import { test, expect } from '@playwright/test';
import { entrar, desbordeHorizontal, RECETA } from './apoyo.js';

test.describe('Celular', () => {
  test('las acciones de la receta llegan abajo, al pulgar', async ({ page }) => {
    await entrar(page, `#/receta/${RECETA}`);

    const barra = page.locator('.sheet-head__actions');
    const medidas = await barra.evaluate((el) => ({
      posicion: getComputedStyle(el).position,
      alFondo: Math.round(window.innerHeight - el.getBoundingClientRect().bottom),
    }));

    expect(medidas.posicion).toBe('fixed');
    // Pegada al borde inferior. Cuando la cabecera la atrapaba, esta distancia
    // eran 660px: la barra flotaba, pero arriba del todo.
    expect(medidas.alFondo).toBeLessThan(24);
  });

  test('el contenido no queda tapado por esa barra', async ({ page }) => {
    await entrar(page, `#/receta/${RECETA}`);
    const aire = await page
      .locator('.sheet-view')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    expect(aire).toBeGreaterThan(60);
  });

  test('a 320 px ningun boton se monta sobre otro', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await entrar(page, `#/receta/${RECETA}`);

    const botones = await page.locator('.btn--action').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const etiqueta = el.querySelector('.btn__label');
        const re = etiqueta ? etiqueta.getBoundingClientRect() : null;
        return {
          nombre: el.getAttribute('aria-label'),
          izq: r.left,
          der: r.right,
          etiquetaDer: re && re.width ? re.right : r.right,
        };
      }),
    );

    for (let i = 1; i < botones.length; i += 1) {
      const previo = botones[i - 1];
      expect(previo.der, `${previo.nombre} invade a ${botones[i].nombre}`).toBeLessThanOrEqual(botones[i].izq + 1);
      expect(previo.etiquetaDer, `la etiqueta de ${previo.nombre} se sale`).toBeLessThanOrEqual(previo.der + 1);
    }

    expect(await desbordeHorizontal(page)).toBe(0);
  });

  test('a 320 px se pueden pulsar los cinco factores de la tanda', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await entrar(page, `#/receta/${RECETA}`);

    // El segmento va en `overflow: hidden`: lo que no entra no se alcanza de
    // ninguna manera, ni desplazando ni tabulando.
    const ancho = await page.evaluate(() => document.documentElement.clientWidth);
    const factores = await page.locator('.scaler__btn').evaluateAll((els) =>
      els.map((el) => ({ texto: el.textContent.trim(), der: el.getBoundingClientRect().right })),
    );
    expect(factores).toHaveLength(5);
    for (const factor of factores) {
      expect(factor.der, `${factor.texto} queda fuera de la pantalla`).toBeLessThanOrEqual(ancho + 1);
    }

    // Y el ultimo multiplica de verdad.
    await page.getByRole('button', { name: 'Multiplicar la tanda por 4' }).click();
    await expect(page.locator('.facts')).toContainText('4 und');
  });

  test('las ventanas suben desde el borde inferior', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Plan del día', exact: true }).click();

    const hoja = await page.locator('[role=dialog]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        alFondo: Math.round(window.innerHeight - r.bottom),
        ocupaElAncho: r.width >= document.documentElement.clientWidth - 2,
      };
    });
    expect(hoja.alFondo).toBeLessThanOrEqual(1);
    expect(hoja.ocupaElAncho).toBe(true);
  });
});
