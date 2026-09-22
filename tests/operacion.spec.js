import { test, expect } from '@playwright/test';
import { entrar } from './apoyo.js';
import { resumenOperacion, stockPorUnidad } from '../src/core/operacion.js';

test('los indicadores excluyen lotes agotados del riesgo y vencidos del stock utilizable', () => {
  const base = { ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 100, costoCompra: 200 };
  const lotes = [
    { ...base, id: 'L1', existencia: 50, vencimiento: '2026-09-01' },
    { ...base, id: 'L2', existencia: 0, vencimiento: '2026-09-02' },
    { ...base, id: 'L3', existencia: 80, vencimiento: '2026-09-30' },
    { ...base, id: 'L4', existencia: 20, vencimiento: '' },
    { ...base, id: 'L5', unidad: 'KG', existencia: 2, vencimiento: '2027-01-01' },
  ];
  const antes = JSON.stringify(lotes);
  const resumen = resumenOperacion([], lotes, '2026-09-13');
  expect(resumen.revisar.map((l) => l.id)).toEqual(['L1', 'L3']);
  expect(resumen.valorEnRiesgo).toBe(260);
  expect(resumen.sinFecha).toBe(1);
  const stock = stockPorUnidad(lotes, '2026-09-13');
  expect(stock.get('HARINA|GR')).toBe(100);
  expect(stock.get('HARINA|KG')).toBe(2);
  expect(JSON.stringify(lotes)).toBe(antes);
});

test('filtros y navegación conservan los lotes; exportar respeta el filtro', async ({ page }) => {
  await entrar(page, '#/almacen');
  await page.getByRole('button', { name: 'Cargar lotes de ejemplo' }).click();
  // Tantas filas como lotes guardó el ejemplo, que ahora cubre todo el recetario.
  await expect(page.locator('.almacen__fila').first()).toBeVisible();
  const guardado = await page.evaluate(() => localStorage.getItem('zahavi_almacen_v1'));
  await expect(page.locator('.almacen__fila')).toHaveCount(JSON.parse(guardado).lotes.length);
  await page.getByRole('button', { name: /^Vencidos/ }).click();
  await expect(page.locator('.almacen__fila')).toHaveCount(1);
  await expect(page.locator('.almacen__fila')).toContainText('CHOCOLATE 70%');
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar inventario' }).click();
  expect((await descarga).suggestedFilename()).toMatch(/^zahavi-inventario-.*\.csv$/);
  await page.getByRole('link', { name: 'Ingredientes', exact: true }).click();
  await page.getByRole('button', { name: /^Con stock/ }).click();
  await expect(page.locator('.ings__fila').first()).toBeVisible();
  await expect(page.locator('.ings__stock').first()).toContainText('Con stock');
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  // El Resumen avisa del lote vencido en «Necesita atención» (BI-001), no en la
  // lista de vencimientos que tenía antes.
  await expect(page.locator('.resumen-alerta[data-tipo="vencidos"]')).toContainText(/chocolate/i);
  await page.reload();
  await expect(page.locator('.dashboard')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('zahavi_almacen_v1'))).toBe(guardado);
});

test('editar conserva la presentación del lote y eliminar requiere confirmación', async ({ page }) => {
  await entrar(page, '#/almacen');
  await page.getByLabel('Responsable de bodega', { exact: true }).fill('QA Bodega');
  await page.getByRole('button', { name: 'Cargar lotes de ejemplo' }).click();
  await expect(page.locator('.almacen__fila').first()).toBeVisible();
  const leer = () => page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')).lotes);
  const antes = await leer();
  const harina = antes.find((l) => l.ingrediente === 'HARINA DE TRIGO');
  // El ejemplo trae varios lotes de harina: se edita la fila de ESE lote, que es
  // la que lleva su código en el botón de eliminar.
  const filaHarina = page.locator('.almacen__fila').filter({
    has: page.getByRole('button', { name: `Eliminar el lote ${harina.id} de HARINA DE TRIGO`, exact: true }),
  });
  await filaHarina.getByRole('button', { name: 'Editar el lote de HARINA DE TRIGO', exact: true }).click();
  await expect(page.getByLabel('presentación', { exact: true })).toHaveValue(harina.presentacion);
  await page.getByLabel('marca', { exact: true }).fill('Marca QA');
  await page.getByLabel('Motivo del movimiento', { exact: true }).fill('Corregir marca');
  await page.getByRole('button', { name: 'Guardar lote' }).click();
  await expect.poll(async () => (await leer()).find((l) => l.id === harina.id)).toEqual({ ...harina, marca: 'Marca QA' });
  await page.getByRole('button', { name: `Eliminar el lote ${harina.id} de HARINA DE TRIGO`, exact: true }).click();
  await page.getByRole('button', { name: 'Conservar', exact: true }).click();
  expect((await leer()).length).toBe(antes.length);
  await page.getByRole('button', { name: `Eliminar el lote ${harina.id} de HARINA DE TRIGO`, exact: true }).click();
  await page.getByLabel('Motivo de la baja').fill('Retiro de ejemplo');
  await page.locator('.almacen__confirmar').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.locator('.almacen__fila')).toHaveCount(antes.length - 1);
  await page.reload();
  await expect(page.locator('.almacen__fila')).toHaveCount(antes.length - 1);
  expect(await leer()).toEqual(antes.filter((l) => l.id !== harina.id));
});

test('la navegación lateral conserva la receta de origen', async ({ page }) => {
  await entrar(page, '#/receta/R001');
  await page.locator('.system-nav__link').filter({ hasText: 'Ingredientes' }).click();
  await page.getByRole('button', { name: 'Volver a la receta', exact: true }).click();
  await expect(page.locator('.sheet-head__title')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toContain('R001');
});

for (const [nombre, width, height] of [['escritorio', 1440, 1000], ['tablet', 834, 1112], ['movil', 390, 844]]) {
  test('recorrido visual sin desbordes: ' + nombre, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errores = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await entrar(page, '#/almacen');
    await page.getByRole('button', { name: 'Cargar lotes de ejemplo' }).click();
    for (const [modulo, selector] of [['almacen', '.almacen'], ['ingredientes', '.ings'], ['plan', '.calprod'], ['inicio', '.dashboard'], ['recetario', '.workspace']]) {
      await page.locator('.system-nav__link').filter({ hasText: { almacen: 'Bodega', ingredientes: 'Ingredientes', plan: 'Producción', inicio: 'Resumen', recetario: 'Recetario' }[modulo] }).click();
      await expect(page.locator(selector)).toBeVisible();
      if (modulo === 'plan') {
        await page.getByRole('button', { name: 'Registrar producción', exact: true }).click();
        await page.locator('.dia .area-btn--pasteleria').click();
        await page.locator('#reg-buscar').fill('chees');
        await page.locator('.reg__anadir').first().click();
        await expect(page.locator('.reg__fila')).toHaveCount(1);
        await page.getByRole('button', { name: 'Volver al calendario' }).click();
        await page.getByRole('button', { name: 'Costos', exact: true }).first().click();
        await page.locator('.cos-ingredientes > summary').first().click();
        await expect(page.locator('.cos .costeo')).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      const scroll = await page.locator(modulo === 'inicio' ? '.dashboard' : ['almacen', 'ingredientes', 'plan'].includes(modulo) ? '.pantalla__cuerpo' : '.workspace').evaluate((nodo) => nodo.scrollWidth - nodo.clientWidth);
      expect(scroll, modulo).toBeLessThanOrEqual(1);
      await page.locator(modulo === 'inicio' ? '.dashboard' : ['almacen', 'ingredientes', 'plan'].includes(modulo) ? '.pantalla__cuerpo' : '.sidebar__list').evaluate((nodo) => { nodo.scrollTop = 0; });
      await page.screenshot({ path: testInfo.outputPath(nombre + '-' + modulo + '.png'), animations: 'disabled' });
      if (modulo === 'recetario') {
        await page.locator('.recipe-link').first().click();
        await expect(page.locator('.sheet-head__title')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(nombre + '-ficha.png'), animations: 'disabled' });
      }
    }
    expect(errores).toEqual([]);
  });
}
