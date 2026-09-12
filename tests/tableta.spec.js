/**
 * CELULAR Y TABLETA
 *
 * Cuatro de los seis defectos de la ultima revision solo existian aqui: una
 * barra que se creia flotante y estaba atrapada bajo la cabecera, un listado
 * que se iba de lado, dos botones montados uno encima del otro y un control
 * que no habia forma de pulsar. En escritorio no se veia ninguno.
 *
 * Fija lo que solo se rompe en una tableta: el listado en dos columnas, sin
 * desplazamiento lateral.
 */

import { test, expect } from '@playwright/test';
import {
  entrar,
  desbordeHorizontal,
  RECETA,
  abrirRecetaDesde,
  alturaDelListado,
  TOTAL_RECETAS,
} from './apoyo.js';

test.describe('Tableta', () => {
  test('el listado se reparte en dos columnas y no se va de lado', async ({ page }) => {
    await entrar(page);

    const reparto = await page.evaluate(() => {
      const lista = document.querySelector('.sidebar__list');
      const columnas = new Set(
        [...document.querySelectorAll('nav a[href*="/receta/"]')].map((a) =>
          Math.round(a.getBoundingClientRect().left),
        ),
      );
      return {
        columnas: columnas.size,
        recetas: document.querySelectorAll('nav a[href*="/receta/"]').length,
        desplazamientoLateral: lista.scrollWidth - lista.clientWidth,
      };
    });

    expect(reparto.recetas).toBe(TOTAL_RECETAS);
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

test.describe('Tableta', () => {
  /*
   * VOLVER DE UNA RECETA NO PUEDE MANDAR EL LISTADO ARRIBA.
   *
   * Mismo defecto que en celular y por la misma causa -aqui tampoco caben las
   * dos cosas, asi que la lista se oculta y un elemento sin caja no se
   * desplaza-, pero se comprueba tambien aqui porque el listado de la tableta
   * no es el mismo: va en DOS COLUMNAS, asi que la misma altura corresponde a
   * otras recetas y a otro alto total.
   */
  test('volver de una receta deja el listado donde estaba', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('.sidebar__list')).toBeVisible();

    const { altura } = await abrirRecetaDesde(page, 900);
    expect(altura).toBeGreaterThan(0);
    await expect(page.locator('.sheet-view')).toBeVisible();

    await page.getByRole('button', { name: 'Volver al listado de recetas' }).click();
    await expect(page.locator('.sidebar__list')).toBeVisible();

    await expect.poll(() => alturaDelListado(page)).toBe(altura);
  });
});

test.describe('Tableta', () => {
  /*
   * Y LA DEJA MARCADA.
   *
   * Conservar el sitio no basta: en una columna de 121 filas iguales, volver a
   * la altura correcta sigue dejando la pregunta de cual de las que se ven era
   * la que se acababa de consultar. Aqui la ficha ocupa la pantalla entera, asi
   * que al volver no hay ninguna receta abierta y, sin memoria, no quedaba ni
   * rastro.
   */
  test('volver de una receta la deja marcada en el listado', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('.sidebar__list')).toBeVisible();

    const { id } = await abrirRecetaDesde(page, 900);
    await expect(page.locator('.sheet-view')).toBeVisible();

    await page.getByRole('button', { name: 'Volver al listado de recetas' }).click();
    await expect(page.locator('.sidebar__list')).toBeVisible();

    const fila = page.locator(`.recipe-link[data-id="${id}"]`);
    await expect(fila).toHaveClass(/is-active/);

    // Una y nada mas que una.
    await expect(page.locator('.recipe-link.is-active')).toHaveCount(1);

    // Ya no esta abierta, asi que no se anuncia como el elemento actual: en su
    // lugar lleva la nota que solo oye quien usa lector de pantalla.
    await expect(fila).not.toHaveAttribute('aria-current', 'true');
    await expect(fila).toContainText('la última que abriste');
  });
});
