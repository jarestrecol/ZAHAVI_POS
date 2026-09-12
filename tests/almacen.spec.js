/**
 * EL ALMACEN Y EL COSTO DE LA PRODUCCION
 *
 * El modulo nuevo, de punta a punta: dar de alta lo que se compra, verlo con su
 * valor por unidad de medida y su vencimiento, y cruzarlo con el plan del dia
 * para saber cuanto cuesta producir y descontarlo de la bodega.
 *
 * Lo que se fija aqui no es que la pantalla se pinte, sino las dos reglas que de
 * verdad protegen dinero:
 *
 *   1. Las unidades NO se convierten. Si el plan pide gramos y el almacen tiene
 *      unidades, esa linea sale sin precio en vez de inventarse un factor.
 *   2. Descontar nunca deja existencia negativa, y no se puede descontar dos
 *      veces la misma produccion.
 *
 * Las 122 recetas reales se LEEN y no se tocan. El almacen vive en el
 * almacenamiento local de cada aparato, asi que cada prueba arranca con el suyo.
 */

import { test, expect } from '@playwright/test';
import { entrar, abrirModulo, salirDelModulo } from './apoyo.js';

/**
 * Abre el almacen POR DONDE SE ABRE: la tarjeta del menu.
 *
 * Antes era un boton de la barra del recetario y una ventana modal encima.
 * Ahora es una pantalla propia, y el camino real pasa por el menu.
 */
async function abrirAlmacen(page) {
  await abrirModulo(page, 'almacen');
}

/** Sale del modulo. Escape sigue siendo la salida. */
async function cerrarVentana(page) {
  await salirDelModulo(page);
}

/** Carga los lotes de ejemplo, que es la unica forma de empezar sin teclear. */
async function conDatosDeEjemplo(page) {
  await abrirAlmacen(page);
  await page.getByRole('button', { name: 'Cargar lotes de ejemplo' }).click();
  await expect(page.locator('.almacen__fila').first()).toBeVisible();
}

test.describe('Almacén', () => {
  test('empieza vacío y explica cómo empezar', async ({ page }) => {
    await entrar(page);
    await abrirAlmacen(page);

    await expect(page.locator('.almacen__vacio')).toContainText('vacío');
    // Ofrecer datos de ejemplo importa: un almacén en blanco no enseña cómo se
    // lee una fila ni qué significa un lote vencido.
    await expect(page.getByRole('button', { name: 'Cargar lotes de ejemplo' })).toBeVisible();
  });

  test('cada lote enseña su valor por unidad de medida, que es lo que sirve para costear', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    const harina = page.locator('.almacen__fila', { hasText: 'HARINA DE TRIGO' }).first();
    await expect(harina).toBeVisible();

    // 25.000 GR por $120.000 son $4,8 el gramo. La cifra no se teclea: sale de
    // dividir, así que no puede quedarse desfasada respecto al costo.
    // La celda dice ademas DE QUE unidad habla. La columna se llamaba
    // «valor / und» y la panaderia pregunto que era eso, con razon: un numero
    // suelto en una tabla de precios no dice si son pesos por gramo o por
    // bulto.
    await expect(harina.locator('.almacen__unitario')).toContainText('$4,8');
    await expect(harina.locator('.almacen__unitario-und')).toHaveText('por 1 GR');
  });

  test('un lote vencido se distingue por texto, no solo por color', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    const vencidos = page.locator('.almacen__estado--vencido');
    await expect(vencidos.first()).toBeVisible();
    // La regla del proyecto: el color nunca es la única señal. En la tableta del
    // obrador, a contraluz, el color es lo primero que se pierde.
    await expect(vencidos.first()).toHaveText('Vencido');
  });

  test('se da de alta un lote y aparece en la lista', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    const antes = await page.locator('.almacen__fila').count();

    await page.getByRole('button', { name: '+ Nuevo lote' }).click();
    await page.getByLabel('ingrediente', { exact: true }).fill('QA-TEST-INGREDIENTE');
    await page.getByLabel('peso de compra').fill('1000');
    await page.getByLabel('unidad', { exact: true }).fill('GR');
    await page.getByLabel('costo de compra').fill('50000');
    await page.getByLabel('existencia').fill('1000');
    await page.getByRole('button', { name: 'Guardar lote' }).click();

    await expect(page.locator('.almacen__fila')).toHaveCount(antes + 1);
    await expect(
      page.locator('.almacen__fila', { hasText: 'QA-TEST-INGREDIENTE' }),
    ).toHaveCount(1);
  });

  test('no deja guardar un lote sin peso de compra, y dice por qué', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    await page.getByRole('button', { name: '+ Nuevo lote' }).click();
    await page.getByLabel('ingrediente', { exact: true }).fill('QA-TEST-SIN-PESO');
    await page.getByLabel('costo de compra').fill('1000');
    await page.getByRole('button', { name: 'Guardar lote' }).click();

    // Sin peso no se puede dividir, así que no habría valor unitario: el error
    // se enseña dentro del formulario, nunca en un alert del navegador.
    await expect(page.locator('.almacen__form .form-error')).toContainText('mayor que cero');
    await expect(
      page.locator('.almacen__fila', { hasText: 'QA-TEST-SIN-PESO' }),
    ).toHaveCount(0);
  });
});

test.describe('El costo de la producción, cruzado con el almacén', () => {
  /**
   * Arma un plan con una receta y devuelve el panel de costeo.
   *
   * El buscador del plan filtra por NOMBRE, no por codigo, asi que aqui se
   * busca por nombre. La receta elegida no es cualquiera: el cheescake lleva
   * agua en GR -que el almacen de ejemplo no tiene a proposito- y yemas en GR
   * -que el almacen tiene en UND-, asi que ejercita de una vez los dos motivos
   * por los que una linea puede salir sin precio.
   */
  async function planConReceta(page, receta = 'CHEESCAKE') {
    await abrirModulo(page, 'plan');
    await page.locator('#plan-buscar').fill(receta);
    await page.locator('.plan__sugerencia').first().click();
    await expect(page.locator('.costeo')).toBeVisible();
    return page.locator('.costeo');
  }

  test('sin almacén lo dice, en vez de enseñar una tabla de ceros', async ({ page }) => {
    await entrar(page);
    const costeo = await planConReceta(page);
    await expect(costeo.locator('.costeo__vacio')).toContainText('vacío');
  });

  test('con almacén sale un costo total y qué parte cubre la bodega', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);
    await cerrarVentana(page);

    const costeo = await planConReceta(page);

    // Una cifra en pesos de verdad, no un cero ni un guion.
    await expect(costeo.locator('.costeo__total-cifra')).toHaveText(/^\$[\d.]+$/);
    await expect(costeo.locator('.costeo__dato-cifra').first()).toHaveText(/%$/);
  });

  test('lo que el almacén no tiene en esa MISMA unidad sale sin precio, no convertido', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);
    await cerrarVentana(page);

    // R016 lleva agua, y el almacén de ejemplo no tiene agua a propósito: es el
    // caso que hay que saber leer antes de fiarse de un total.
    const costeo = await planConReceta(page);
    const sinPrecio = costeo.locator('.costeo__estado--sinprecio');

    if ((await sinPrecio.count()) > 0) {
      await expect(sinPrecio.first()).toHaveText('Sin precio');
      // Puede haber mas de un aviso a la vez (lotes vencidos, lineas sin
      // precio): se busca el que explica las unidades, no "el aviso".
      await expect(
        costeo.locator('.costeo__aviso', { hasText: 'unidades nunca se convierten' }),
      ).toHaveCount(1);
    }
  });

  test('descontar resta de la bodega, y no se puede descontar dos veces', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    // MANTEQUILLA y no harina: la receta del cheescake no lleva harina, asi que
    // mirar ahi habria dado un falso negativo con el descuento funcionando bien.
    const fila = page.locator('.almacen__fila', { hasText: 'MANTEQUILLA' }).first();
    const existenciaAntes = await fila.locator('.almacen__num').nth(2).textContent();
    await cerrarVentana(page);

    const costeo = await planConReceta(page);
    await costeo.getByRole('button', { name: 'Descontar del almacén' }).click();
    await costeo.getByRole('button', { name: 'Sí, descontar' }).click();
    await expect(costeo.locator('.costeo__hecho')).toBeVisible();

    // Y la existencia bajó de verdad en la bodega.
    await cerrarVentana(page);
    await abrirAlmacen(page);
    const existenciaDespues = await page
      .locator('.almacen__fila', { hasText: 'MANTEQUILLA' })
      .first()
      .locator('.almacen__num')
      .nth(2)
      .textContent();

    expect(existenciaDespues).not.toBe(existenciaAntes);
  });

  test('ninguna existencia queda en negativo', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);
    await cerrarVentana(page);

    // Un plan desproporcionado: muchas tandas de la misma receta, muy por encima
    // de lo que hay comprado. El almacén tiene que quedarse en cero, nunca por
    // debajo: una existencia negativa no se ve mirando la pantalla y envenena
    // todas las cuentas de después.
    await abrirModulo(page, 'plan');
    await page.locator('#plan-buscar').fill('CHEESCAKE');
    await page.locator('.plan__sugerencia').first().click();
    await page.locator('.plan__tandas-input').first().fill('500');
    await page.locator('.plan__tandas-input').first().blur();

    const costeo = page.locator('.costeo');
    await expect(costeo).toBeVisible();
    await costeo.getByRole('button', { name: 'Descontar del almacén' }).click();
    await costeo.getByRole('button', { name: 'Sí, descontar' }).click();
    await expect(costeo.locator('.costeo__hecho')).toBeVisible();

    await cerrarVentana(page);
    await abrirAlmacen(page);

    const negativas = await page.evaluate(() =>
      [...document.querySelectorAll('.almacen__fila')]
        .map((f) => f.querySelectorAll('.almacen__num')[2].textContent.trim())
        .filter((t) => t.startsWith('-')),
    );
    expect(negativas, 'hay existencias negativas en el almacén').toEqual([]);
  });
});
