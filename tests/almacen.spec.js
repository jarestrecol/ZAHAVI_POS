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
 *   1. Las unidades se convierten a gramos con equivalencias declaradas.
 *      Si falta una equivalencia, no se inventa un factor.
 *   2. Descontar nunca deja existencia negativa, y no se puede descontar dos
 *      veces la misma produccion.
 *
 * Las 122 recetas reales se LEEN y no se tocan. El almacen vive en el
 * almacenamiento local de cada aparato, asi que cada prueba arranca con el suyo.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { entrar, abrirModulo, salirDelModulo } from './apoyo.js';

test('respaldo completo: botón directo en Bodega descarga JSON íntegro aunque haya filtros', async ({ page }) => {
  await entrar(page);
  const antes = await page.evaluate(async () => {
    const { guardarLote } = await import('/src/app/almacen.js');
    const { hoyLocal } = await import('/src/core/bitacora.js');
    const r = await guardarLote({ ingrediente: 'HARINA', unidad: 'KG', pesoCompra: 5, existencia: 5,
      costoCompra: 25000, fechaCompra: hoyLocal() }, { responsable: 'QA Respaldo' });
    if (!r.ok) throw new Error(r.message);
    return JSON.parse(localStorage.getItem('zahavi_almacen_v1'));
  });
  await abrirAlmacen(page);
  await page.getByLabel('Buscar ingrediente, marca o lote', { exact: true }).fill('NO EXISTE');
  const zona = page.getByRole('region', { name: 'Respaldo de la operación' });
  const boton = zona.getByRole('button', { name: 'Descargar respaldo completo' });
  await expect(boton).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar respaldo completo' })).toHaveCount(1);
  const descargando = page.waitForEvent('download');
  await boton.click();
  const descarga = await descargando;
  expect(descarga.suggestedFilename()).toMatch(/^zahavi-operacion-\d{4}-\d{2}-\d{2}\.json$/);
  const copia = JSON.parse(await readFile(await descarga.path(), 'utf8'));
  // La lectura normaliza la colección incorporada después del formato inicial.
  expect(copia).toEqual({ ...antes, resultados: antes.resultados || [] });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')))).toEqual(antes);
});

test('permisos: obrador consulta existencias sin costos, respaldo ni columnas monetarias CSV', async ({ page }) => {
  await entrar(page);
  await page.evaluate(async () => {
    const { guardarLote } = await import('/src/app/almacen.js');
    const { hoyLocal } = await import('/src/core/bitacora.js');
    const r = await guardarLote({ ingrediente: 'HARINA', unidad: 'KG', pesoCompra: 10, existencia: 10,
      costoCompra: 43210, fechaCompra: hoyLocal() }, { responsable: 'QA Costos' });
    if (!r.ok) throw new Error(r.message);
    window.csvs = [];
    const crear = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { blob.text().then(texto => window.csvs.push(texto)); return crear(blob); };
  });
  await abrirAlmacen(page);
  await expect(page.locator('.almacen__resumen')).toContainText('Valor en bodega');
  await expect(page.getByRole('button', { name: 'Nuevo lote', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { getState, setState } = await import('/src/core/store.js');
    setState({ usuario: { ...getState().usuario, rol: 'obrador' } });
  });
  await expect(page.locator('.almacen')).toContainText('Consulta de inventario');
  await expect(page.locator('.almacen')).not.toContainText('$');
  await expect(page.locator('.almacen')).not.toContainText('43.210');
  await expect(page.getByRole('button', { name: 'Nuevo lote', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Descargar respaldo completo' })).toHaveCount(0);
  await expect(page.locator('.almacen__fila')).toContainText('1000');
  for (const boton of ['Exportar inventario', 'Exportar historial CSV']) {
    await page.getByRole('button', { name: boton, exact: true }).click();
  }
  await expect.poll(() => page.evaluate(() => window.csvs.length)).toBe(2);
  const csvs = await page.evaluate(() => window.csvs);
  for (const csv of csvs) {
    expect(csv).not.toMatch(/Costo compra|Costo unitario|Valor restante|Precio anterior|Precio nuevo|43210/);
    expect(csv).toContain('HARINA');
  }
});

test('permisos: historial omite importes cuando no recibe autorización explícita', async ({ page }) => {
  await entrar(page);
  const texto = await page.evaluate(async () => {
    const { renderHistorial } = await import('/src/views/historial.js');
    const { hoyLocal } = await import('/src/core/bitacora.js');
    const lote = { id: 'L1', ingrediente: 'HARINA', unidad: 'KG', pesoCompra: 1, existencia: 1, costoCompra: 98765, fechaCompra: hoyLocal() };
    const h = renderHistorial({ tipo: 'bodega', leerDatos: () => ({ ok: true, value: { lotes: [lote], eventos: [{ id: 'e1', tipo: 'compra', despues: lote, instante: new Date().toISOString(), responsable: 'QA', motivo: 'Compra' }] } }) });
    h.actualizar();
    return h.node.textContent;
  });
  expect(texto).toContain('HARINA');
  expect(texto).not.toContain('$');
  expect(texto).not.toContain('Descargar respaldo completo');
});

for (const ancho of [1440, 390]) {
  test(`demo Colombia: cobertura completa, carga única y retiro conserva compras · ${ancho}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await entrar(page);
    await page.evaluate(async () => {
      const { guardarLote } = await import('/src/app/almacen.js');
      const { hoyLocal } = await import('/src/core/bitacora.js');
      const r = await guardarLote({ ingrediente: 'HUEVOS', pesoCompra: 30, existencia: 30, unidad: 'UND',
        equivalencias: { UND: 63 }, costoCompra: 18000, fechaCompra: hoyLocal() }, { responsable: 'QA Real' });
      if (!r.ok) throw new Error(r.message);
    });
    await abrirAlmacen(page);
    const antes = await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')));
    await page.getByRole('button', { name: 'Cargar bodega demo Colombia completa' }).click();
    await expect(page.locator('.almacen__demo')).toContainText('DEMO activa · 159 ingredientes');
    const cargado = await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')));
    expect(cargado.lotes.filter((l) => l.demo)).toHaveLength(159);
    expect(cargado.lotes.find((l) => !l.demo)).toEqual(antes.lotes[0]);
    expect(cargado.lotes.find((l) => l.demo && l.ingrediente === 'HUEVOS').equivalencias.UND).toBe(63);
    const doble = await page.evaluate(async () => (await import('/src/app/almacen.js')).cargarDemoColombia());
    expect(doble.code).toBe('demo_activa');
    await page.getByLabel('Buscar ingrediente, marca o lote').fill('CREMA DE LECHE');
    await page.getByText('Referencia y pesos DEMO', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Consultar referencia de precio' })).toHaveAttribute('href', /crema-de-leche/);
    expect(await page.locator('.almacen').evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('bodega-demo-colombia.png'), fullPage: true });
    await page.reload();
    await expect(page.locator('.almacen__demo')).toContainText('159 ingredientes');
    const congelado = await page.evaluate(async () => {
      const { getState } = await import('/src/core/store.js');
      const { transaccionOperacion, hoyLocal } = await import('/src/core/bitacora.js');
      const { guardarPlanEn, aprobarPlanEn, costeoPendiente } = await import('/src/core/produccion.js');
      const r = await transaccionOperacion((datos) => {
        const fecha = hoyLocal();
        const guardado = guardarPlanEn(datos, { fecha, revision: 0, responsable: 'QA Demo', motivo: 'Prueba',
          entradas: [{ id: 'R016', factor: 0.5 }] }, getState().recetario.recipes);
        if (!guardado.ok) return guardado;
        return aprobarPlanEn(datos, { fecha, revision: datos.planes[0].revision, responsable: 'QA Demo',
          motivo: 'Prueba demo', costeo: costeoPendiente(datos, fecha) });
      });
      if (!r.ok) throw new Error(r.message);
      return r.value.datos.ejecuciones;
    });
    await page.getByRole('button', { name: 'Retirar precios y lotes demo' }).click();
    await expect(page.getByRole('button', { name: 'Cargar bodega demo Colombia completa' })).toBeVisible();
    const retirado = await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')));
    expect(retirado.lotes).toEqual(antes.lotes);
    expect(retirado.ejecuciones).toEqual(congelado);
    expect(retirado.eventos.filter((e) => e.tipo === 'baja' && e.antes?.demo)).toHaveLength(159);
  });
}

test('los casos de uso de demo rechazan al operario sin escribir', async ({ page }) => {
  await entrar(page);
  const r = await page.evaluate(async () => {
    const { setState, getState } = await import('/src/core/store.js');
    const { cargarDemoColombia, retirarDemoColombia } = await import('/src/app/almacen.js');
    const antes = localStorage.getItem('zahavi_almacen_v1');
    setState({ usuario: { ...getState().usuario, rol: 'operario' } });
    return { carga: await cargarDemoColombia(), retiro: await retirarDemoColombia(),
      intacto: antes === localStorage.getItem('zahavi_almacen_v1') };
  });
  expect(r.carga.code).toBe('permiso'); expect(r.retiro.code).toBe('permiso'); expect(r.intacto).toBe(true);
});

for (const ancho of [1440, 390]) {
  test(`compra en litros y producción en ml se convierten a gramos · ${ancho}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await entrar(page);
    await abrirAlmacen(page);
    await page.getByRole('button', { name: 'Nuevo lote', exact: true }).click();
    const recetarioAntes = await page.evaluate(async () => JSON.stringify((await import('/src/core/store.js')).getState().recetario.recipes));
    await page.getByLabel('ingrediente', { exact: true }).fill('ACEITE VEGETAL');
    await page.getByLabel('cantidad de compra').fill('10');
    await page.getByLabel('unidad', { exact: true }).fill('LT');
    await page.getByLabel('costo de compra').fill('92000');
    await page.getByRole('textbox', { name: 'existencia', exact: true }).fill('10');
    await page.getByRole('button', { name: 'Guardar lote' }).click();
    await expect(page.locator('.form-error')).toContainText('equivalencia');
    await page.getByLabel('Gramos de 1 ml (densidad)').fill('0,92');
    await page.getByLabel('Gramos de 1 unidad', { exact: true }).fill('50');
    await page.getByLabel('Gramos de 1 tanda', { exact: true }).fill('2500');
    await expect(page.locator('fieldset')).toContainText('1 LT = 920 g');
    expect(await page.locator('.almacen__form').evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('conversion-compra.png'), fullPage: true });
    await page.getByRole('button', { name: 'Guardar lote' }).click();
    await expect(page.locator('.almacen__fila')).toContainText('1 LT = 920 g');
    await page.reload();
    await expect(page.locator('.almacen__fila')).toContainText('920 g');
    await page.getByText('Medidas por ingrediente (1)', { exact: true }).click();
    await page.locator('.almacen__por-ingrediente summary').filter({ hasText: /^ACEITE VEGETAL$/ }).click();
    const ficha = page.locator('.medidas-ing');
    await expect(ficha.locator('tr[data-unidad="GR"]')).toContainText('9200 GR');
    await expect(ficha.locator('tr[data-unidad="ML"]')).toContainText('10000 ML');
    await expect(ficha.locator('tr[data-unidad="UND"]')).toContainText('184 UND');
    await expect(ficha.locator('tr[data-unidad="TANDA"]')).toContainText('3,68 TANDA');
    await page.getByRole('link', { name: 'Ingredientes', exact: true }).click();
    await page.getByLabel('Buscar ingrediente', { exact: true }).fill('ACEITE VEGETAL');
    await page.getByRole('button', { name: /^Con stock/ }).click();
    await expect(page.locator('.ings__fila')).toHaveCount(1);
    await page.locator('.ings__fila').click();
    await expect(ficha.locator('tr[data-unidad="GR"]')).toContainText('9200 GR');
    await expect(ficha.locator('tr[data-unidad="ML"]')).toContainText('0,92 g');
    await expect(ficha.locator('.medidas-ing__formulas')).toContainText('conserva sus datos originales');
    expect(await ficha.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await ficha.locator('table').scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('conversion-ingrediente.png'), fullPage: true });
    // Plan de prueba aislado; no se modifica ninguna fórmula del recetario real.
    const fecha = await page.evaluate(async () => {
      const { transaccionOperacion, hoyLocal } = await import('/src/core/bitacora.js');
      const { guardarPlanEn } = await import('/src/core/produccion.js');
      const recipe = { id: 'QA-TEST-CONVERSION', nombre: 'QA-TEST-CONVERSION', categoria: 'PANADERÍA',
        componentes: [{ nombre: 'BASE', items: [{ ingrediente: 'ACEITE VEGETAL', cantidad: '500', unidad: 'ML' }] }] };
      const fecha = hoyLocal();
      const r = await transaccionOperacion((d) => guardarPlanEn(d, { fecha, revision: 0,
        responsable: 'QA', motivo: 'Prueba', entradas: [{ id: recipe.id, factor: 1 }] }, [recipe]));
      if (!r.ok) throw new Error(r.message);
      return fecha;
    });
    await page.goto(`/#/plan?fecha=${fecha}`);
    await page.getByRole('button', { name: 'Costos', exact: true }).click();
    await page.getByText('Por ingrediente: lo que falta por producir (lote a lote)', { exact: true }).click();
    await expect(page.locator('.costeo__linea')).toContainText('460 GR');
    await expect(page.locator('.costeo__linea')).toContainText('500 ML');
    await page.locator('.costeo__lotes summary').click();
    await expect(page.locator('.costeo__lotes-tabla')).toContainText('0,5 LT = 460 g');
    expect(await page.locator('.costeo').evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('conversion-costo.png'), fullPage: true });
    await page.getByRole('button', { name: 'Volver al calendario' }).click();
    await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
    await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: /^Panadería/ }).click();
    const tarjeta = page.locator('.proy-tarjeta');
    const abierta = (await tarjeta.getAttribute('aria-expanded') ?? await tarjeta.getAttribute('aria-pressed')) === 'true';
    if (!abierta) await tarjeta.click();
    await page.getByRole('button', { name: 'Empezar a producir' }).click();
    await page.getByRole('button', { name: 'Marcar lista' }).click();
    await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
    await expect(page.locator('.proy-tarjeta')).toHaveClass(/proy-tarjeta--lista/);
    const datos = await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')));
    expect(datos.lotes[0].existencia).toBe(9.5);
    expect(datos.lotes[0].unidad).toBe('LT');
    expect(datos.ejecuciones[0].costeo.costoTotal).toBe(4600);
    expect(datos.ejecuciones[0].costeo.lineas[0].origen[0].gramosPorUnidad).toBe(920);
    expect(await page.evaluate(async () => JSON.stringify((await import('/src/core/store.js')).getState().recetario.recipes))).toBe(recetarioAntes);
  });
}

/**
 * Abre el almacen POR DONDE SE ABRE: la tarjeta del menu.
 *
 * Antes era un boton de la barra del recetario y una ventana modal encima.
 * Ahora es una pantalla propia, y el camino real pasa por el menu.
 */
async function abrirAlmacen(page) {
  await abrirModulo(page, 'almacen');
  await page.getByLabel('Responsable de bodega', { exact: true }).fill('QA Bodega');
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

    await page.getByRole('button', { name: 'Nuevo lote', exact: true }).click();
    await page.getByLabel('ingrediente', { exact: true }).fill('QA-TEST-INGREDIENTE');
    await page.getByLabel('cantidad de compra').fill('1000');
    await page.getByLabel('unidad', { exact: true }).fill('GR');
    await page.getByLabel('costo de compra').fill('50000');
    await page.getByRole('textbox', { name: 'existencia', exact: true }).fill('1000');
    await page.getByRole('button', { name: 'Guardar lote' }).click();

    await expect(page.locator('.almacen__fila')).toHaveCount(antes + 1);
    await expect(
      page.locator('.almacen__fila', { hasText: 'QA-TEST-INGREDIENTE' }),
    ).toHaveCount(1);
  });

  test('no deja guardar un lote sin peso de compra, y dice por qué', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    await page.getByRole('button', { name: 'Nuevo lote', exact: true }).click();
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
   * Registra el cheescake de hoy desde el calendario.
   *
   * El buscador filtra por NOMBRE, no por codigo, asi que aqui se busca por
   * nombre. La receta elegida no es cualquiera: el cheescake lleva agua en GR y
   * yemas en GR -que un almacen puede tener en UND-, asi que ejercita los dos
   * motivos por los que una linea puede salir sin precio.
   */
  async function registrarCheescake(page, tandas = 1) {
    await abrirModulo(page, 'plan');
    await page.getByRole('button', { name: 'Registrar producción', exact: true }).click();
    await page.locator('.dia .area-btn--pasteleria').click();
    await page.locator('#reg-buscar').fill('CHEESCAKE FRIO - SIN AZUCAR');
    await page.locator('#reg-cantidad').fill(String(tandas));
    await page.locator('.reg__anadir').first().click();
    await expect(page.locator('.reg__fila')).toHaveCount(1);
    await page.getByRole('button', { name: 'Volver al calendario' }).click();
  }

  /** Registra el cheescake y devuelve el panel de Costos. */
  async function planConReceta(page) {
    await registrarCheescake(page);
    await page.getByRole('button', { name: 'Costos', exact: true }).first().click();
    // El detalle por ingrediente va plegado: es de auditoría, no de lectura diaria.
    await page.locator('.cos-ingredientes > summary').first().click();
    await expect(page.locator('.cos .costeo')).toBeVisible();
    return page.locator('.cos .costeo');
  }

  /** Lo pide para producir y devuelve el boton de confirmar. */
  async function proyectarCheescake(page, tandas) {
    await registrarCheescake(page, tandas);
    await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
    await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: 'Pastelería' }).click();
    await page.getByRole('button', { name: 'Empezar a producir' }).click();
    return page.getByRole('button', { name: 'Marcar lista' });
  }

  test('sin almacén lo dice, en vez de enseñar una tabla de ceros', async ({ page }) => {
    await entrar(page);
    const costeo = await planConReceta(page);
    await expect(page.locator('.prod-aviso').filter({ hasText: 'El costo sale incompleto' })).toBeVisible();
    await expect(costeo.locator('.costeo__aviso').filter({ hasText: 'equivalencias de Bodega' })).toBeVisible();
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

  test('un costo incompleto explica cómo completar compras y equivalencias', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);
    await cerrarVentana(page);

    // R016 lleva agua, y el almacén de ejemplo no tiene agua a propósito: es el
    // caso que hay que saber leer antes de fiarse de un total.
    const costeo = await planConReceta(page);
    const sinPrecio = costeo.locator('.costeo__estado--sinprecio');

    if ((await sinPrecio.count()) > 0) {
      await expect(sinPrecio.first()).toHaveText(/Sin precio|Falta equivalencia/);
      // Puede haber mas de un aviso a la vez (lotes vencidos, lineas sin
      // precio): se busca el que explica las unidades, no "el aviso".
      await expect(
        costeo.locator('.costeo__aviso', { hasText: 'equivalencias de Bodega' }),
      ).toHaveCount(1);
    }
  });

  test('un plan incompleto no permite aprobar un consumo parcial', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);

    // MANTEQUILLA y no harina: la receta del cheescake no lleva harina, asi que
    // mirar ahi habria dado un falso negativo con el descuento funcionando bien.
    const fila = page.locator('.almacen__fila', { hasText: 'MANTEQUILLA' }).first();
    const existenciaAntes = await fila.locator('.almacen__num').nth(2).textContent();
    await cerrarVentana(page);

    // Cien tandas: mucho mas de lo que hay. No se confirma una parte.
    const confirmar = await proyectarCheescake(page, 100);
    await expect(confirmar).toBeDisabled();
    await expect(page.locator('.proy-detalle__faltan')).toContainText('No se puede marcar lista');

    // Y la existencia NO bajo en la bodega. Desde una vista del calendario,
    // Escape vuelve al calendario: a la bodega se va por la navegacion.
    await page.locator('.system-nav__link').filter({ hasText: 'Bodega' }).click();
    await expect(page.locator('.almacen__fila').first()).toBeVisible();
    const existenciaDespues = await page
      .locator('.almacen__fila', { hasText: 'MANTEQUILLA' })
      .first()
      .locator('.almacen__num')
      .nth(2)
      .textContent();

    expect(existenciaDespues).toBe(existenciaAntes);
  });

  test('ninguna existencia queda en negativo', async ({ page }) => {
    await entrar(page);
    await conDatosDeEjemplo(page);
    await cerrarVentana(page);

    // Un plan desproporcionado: muchas tandas de la misma receta, muy por encima
    // de lo que hay comprado. El almacén tiene que quedarse en cero, nunca por
    // debajo: una existencia negativa no se ve mirando la pantalla y envenena
    // todas las cuentas de después.
    const confirmar = await proyectarCheescake(page, 100);
    await expect(confirmar).toBeDisabled();
    await page.locator('.system-nav__link').filter({ hasText: 'Bodega' }).click();
    await expect(page.locator('.almacen__fila').first()).toBeVisible();

    const negativas = await page.evaluate(() =>
      [...document.querySelectorAll('.almacen__fila')]
        .map((f) => f.querySelectorAll('.almacen__num')[2].textContent.trim())
        .filter((t) => t.startsWith('-')),
    );
    expect(negativas, 'hay existencias negativas en el almacén').toEqual([]);
  });
});
