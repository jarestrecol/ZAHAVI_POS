/**
 * CELULAR Y TABLETA
 *
 * Cuatro de los seis defectos de la ultima revision solo existian aqui: una
 * barra que se creia flotante y estaba atrapada bajo la cabecera, un listado
 * que se iba de lado, dos botones montados uno encima del otro y un control
 * que no habia forma de pulsar. En escritorio no se veia ninguno.
 *
 * Cubre los puntos 84, 84a, 86, 89a, 89h, 89h2 y 89k de QA.md.
 */

import { test, expect } from '@playwright/test';
import { entrar, desbordeHorizontal, RECETA } from './apoyo.js';

test.describe('Tableta', () => {
  test('el listado se reparte en dos columnas y no se va de lado', async ({ page }) => {
    await entrar(page);

    const reparto = await page.evaluate(() => {
      const lista = document.querySelector('.sidebar__list');
      const columnas = new Set(
        [...document.querySelectorAll('nav a[href*="#/receta/"]')].map((a) =>
          Math.round(a.getBoundingClientRect().left),
        ),
      );
      return {
        columnas: columnas.size,
        recetas: document.querySelectorAll('nav a[href*="#/receta/"]').length,
        desplazamientoLateral: lista.scrollWidth - lista.clientWidth,
      };
    });

    expect(reparto.recetas).toBe(121);
    expect(reparto.columnas).toBe(2);
    // Con `columns` en un contenedor de altura limitada, esto llego a ser 3.200.
    expect(reparto.desplazamientoLateral).toBe(0);
  });

  test('la letra inicial titula las dos columnas', async ({ page }) => {
    await entrar(page);
    const anchos = await page.locator('.sidebar__letter').evaluateAll((els) =>
      els.slice(0, 3).map((el) => el.getBoundingClientRect().width),
    );
    const anchoLista = await page
      .locator('.sidebar__list')
      .evaluate((el) => el.clientWidth);
    for (const ancho of anchos) expect(ancho).toBeGreaterThan(anchoLista * 0.8);
  });

  test('cada componente ocupa el ancho, sin huecos al lado', async ({ page }) => {
    await entrar(page, `#/receta/${RECETA}`);

    // Apilados, no repartidos en columnas: dos tablas de distinta longitud una
    // al lado de la otra dejaban un hueco muerto bajo la corta.
    const columnas = await page.locator('.components h3').evaluateAll((els) =>
      new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size,
    );
    expect(columnas).toBe(1);

    const anchos = await page.locator('.component').evaluateAll((els) => {
      const contenedor = document.querySelector('.components').getBoundingClientRect().width;
      return els.map((el) => el.getBoundingClientRect().width / contenedor);
    });
    for (const proporcion of anchos) expect(proporcion).toBeGreaterThan(0.98);

    expect(await desbordeHorizontal(page)).toBe(0);
  });
});
