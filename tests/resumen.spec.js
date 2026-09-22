/**
 * =============================================================================
 *  EL RESUMEN: PANEL DE GESTIÓN DEL INICIO (BI-001)
 * =============================================================================
 *
 *  Lo que se fija aquí es lo que el gerente y el jefe de obrador cuentan con
 *  que no cambie:
 *
 *    - quién ve qué: gerencia y administración con pesos; el jefe de obrador el
 *      mismo panel SIN ningún importe; el operario, solo el acceso a su
 *      producción;
 *    - el modo ejemplo enseña cifras y avisos sin escribir NADA en la bodega;
 *    - las metas se validan junto al campo, se guardan y mueven los semáforos;
 *    - pestañas y periodo se usan con teclado y no pierden el foco;
 *    - cada aviso lleva a donde se arregla;
 *    - no hay desplazamiento lateral en escritorio, tableta ni celular.
 *
 *  Los datos reales de la prueba se escriben como bodega anterior (solo lotes):
 *  la aplicación los migra como saldo de apertura, igual que en un equipo real.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { entrar, simularSupabase, PERFIL, desbordeHorizontal } from './apoyo.js';
import { consolidar } from '../src/core/plan.js';
import { hoyLocal, sumarDias } from '../src/core/bitacora.js';

const publicado = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));
const receta = publicado.recipes.find((r) => r.id === 'R016');
const hoy = hoyLocal();

/** Bodega con precios, y un lote VENCIDO con existencia para que haya un aviso. */
const LOTES = [
  ...consolidar([{ recipe: receta, factor: 1 }]).lineas.map((l, i) => ({
    id: `L${String(i + 1).padStart(3, '0')}`, ingrediente: l.ingrediente, unidad: l.unidad,
    equivalencias: { ML: 1, UND: 50 },
    pesoCompra: l.cantidad * 10, existencia: l.cantidad * 10, costoCompra: l.cantidad * 100,
    marca: 'QA', proveedor: 'QA Proveedor', presentacion: 'BOLSA', lote: `QA-${i}`, vencimiento: '2099-01-01',
    fechaCompra: hoy, registrado: new Date().toISOString(),
  })),
  {
    id: 'L900', ingrediente: 'CHOCOLATE QA', unidad: 'GR', equivalencias: {},
    pesoCompra: 1000, existencia: 800, costoCompra: 40000,
    marca: 'QA', proveedor: 'QA Proveedor', presentacion: 'BOLSA', lote: 'QA-VENCIDO', vencimiento: sumarDias(hoy, -3),
    fechaCompra: sumarDias(hoy, -40), registrado: new Date().toISOString(),
  },
];

const DINERO = /\$\s?\d/;
const inicio = (page) => page.locator('.inicio');
const leerAlmacen = (page) => page.evaluate(() => localStorage.getItem('zahavi_almacen_v1'));

async function sembrarBodega(page) {
  await page.addInitScript((lista) => {
    if (!localStorage.getItem('zahavi_almacen_v1')) localStorage.setItem('zahavi_almacen_v1', JSON.stringify({ version: 1, lotes: lista }));
  }, LOTES);
}

async function comoRol(context, rol) {
  const sim = await simularSupabase(context);
  sim.perfil = { ...PERFIL, rol };
  return sim;
}

async function verEjemplo(page) {
  await page.getByRole('button', { name: 'Ver con datos de ejemplo' }).click();
  await expect(page.locator('.resumen__aviso-ejemplo')).toBeVisible({ timeout: 15000 });
}

/* ===========================================================================
 *  1. QUIÉN VE QUÉ
 * ======================================================================== */

test('administración ve el panel con cifras en pesos', async ({ page }) => {
  await sembrarBodega(page);
  await entrar(page, '#/');

  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hoy', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Necesita atención' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Análisis' }).getByRole('tab')).toHaveCount(4);
  // La bodega sembrada vale dinero: alguna cifra de hoy tiene que estar en pesos.
  await expect(page.locator('.resumen-hoy')).toContainText(DINERO);
});

test('el jefe de obrador ve avance, avisos y pestañas, pero ningún importe', async ({ page, context }) => {
  await comoRol(context, 'obrador');
  await sembrarBodega(page);
  await entrar(page, '#/');

  await expect(page.getByRole('heading', { name: 'Avance por área' })).toBeVisible();
  await expect(page.locator('.resumen-area')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Necesita atención' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Análisis' }).getByRole('tab')).toHaveCount(4);

  // Con datos reales y con el ejemplo (que sí tiene gasto): en ningún caso sale dinero.
  const sinDinero = async () => {
    const texto = await inicio(page).innerText();
    expect(texto).not.toMatch(DINERO);
    expect(texto).not.toMatch(/Presupuesto/i);
    expect(texto).not.toMatch(/valor (en|de la) bodega/i);
    expect(texto).not.toMatch(/oculto/i);
  };
  await sinDinero();
  await verEjemplo(page);
  await expect(page.locator('.resumen-alerta').first()).toBeVisible();
  await sinDinero();
  for (const nombre of ['Rendimiento y merma', 'Bodega y compras', 'Equipo']) {
    await page.getByRole('tab', { name: nombre }).click();
    await expect(page.getByRole('tab', { name: nombre })).toHaveAttribute('aria-selected', 'true');
    await sinDinero();
  }
});

test('el operario no ve el panel y sí el acceso a su producción', async ({ page, context }) => {
  await comoRol(context, 'operario');
  await entrar(page, '#/');

  await expect(page.getByRole('heading', { name: 'Tu producción de hoy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir a mi producción' })).toHaveAttribute('href', '#/plan');
  await expect(page.locator('.resumen__cuerpo')).toHaveCount(0);
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Metas' })).toHaveCount(0);
  expect(await inicio(page).innerText()).not.toMatch(DINERO);
  // Los accesos a los módulos siguen ahí.
  await expect(page.locator('.modulo[data-tono="plan"]')).toBeVisible();
});

/* ===========================================================================
 *  2. MODO EJEMPLO
 * ======================================================================== */

test('el ejemplo enseña cifras y avisos sin tocar la bodega, y se sale de él', async ({ page }) => {
  await sembrarBodega(page);
  await entrar(page, '#/');
  const antes = await leerAlmacen(page);
  expect(antes).not.toBeNull();

  await verEjemplo(page);
  const aviso = page.getByRole('status').filter({ hasText: 'Estás viendo datos de ejemplo' });
  await expect(aviso).toHaveText('Estás viendo datos de ejemplo: 90 días simulados. No son de tu operación y no se guardan.');
  await expect(page.getByRole('button', { name: 'Salir del ejemplo' })).toBeFocused();

  // Hay cifras de verdad (no «Sin datos») y avisos.
  const valores = await page.locator('.resumen-hoy .kpi__valor:not(.kpi__valor--vacio)').count();
  expect(valores).toBeGreaterThan(0);
  await expect(page.locator('.resumen-alerta').first()).toBeVisible();
  // Los avisos del ejemplo no llevan a la operación real: se muestran como texto.
  await expect(page.locator('a.resumen-alerta__accion')).toHaveCount(0);
  await expect(page.locator('.resumen-hoy a')).toHaveCount(0);

  expect(await leerAlmacen(page)).toBe(antes);

  await page.getByRole('button', { name: 'Salir del ejemplo' }).click();
  await expect(page.locator('.resumen__aviso-ejemplo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver con datos de ejemplo' })).toBeFocused();
  await expect(page.locator('.resumen-hoy a').first()).toBeVisible();
  expect(await leerAlmacen(page)).toBe(antes);
});

/* ===========================================================================
 *  3. METAS
 * ======================================================================== */

test('las comparaciones se leen en español correcto: «frente al», no «frente a el»', async ({ page }) => {
  await entrar(page, '#/');
  await verEjemplo(page);
  // Cada indicador escribe su referencia («el promedio de…») sin saber cómo se
  // enlaza; la contracción la hace la tarjeta. Si se pierde, salen frases rotas.
  const texto = await page.locator('.dashboard.resumen').innerText();
  expect(texto).not.toMatch(/frente a el/);
  expect(texto).toMatch(/frente al /);
});

test('metas: se valida junto al campo, se guarda y mueve el semáforo', async ({ page }) => {
  await entrar(page, '#/');
  await verEjemplo(page);

  const botonMetas = page.getByRole('button', { name: 'Metas', exact: true });
  await botonMetas.click();
  await expect(botonMetas).toHaveAttribute('aria-expanded', 'true');
  const metas = page.getByRole('region', { name: 'Metas' });
  const rechazo = metas.getByLabel('Rechazo máximo');
  await expect(rechazo).toBeVisible();

  // Un valor que no es cifra: el error va junto al campo y lo escrito se queda.
  await rechazo.fill('mucho');
  await metas.getByRole('button', { name: 'Guardar metas' }).click();
  await expect(rechazo).toHaveAttribute('aria-invalid', 'true');
  await expect(rechazo).toBeFocused();
  await expect(rechazo).toHaveValue('mucho');
  await expect(metas.locator('.resumen-meta__error')).toContainText('Rechazo máximo');
  expect(await page.evaluate(() => localStorage.getItem('zahavi_metas_v1'))).toBeNull();

  // Fuera de rango, igual.
  await rechazo.fill('150');
  await metas.getByRole('button', { name: 'Guardar metas' }).click();
  await expect(metas.locator('.resumen-meta__error')).toContainText('entre');

  await rechazo.fill('3,5');
  await metas.getByRole('button', { name: 'Guardar metas' }).click();
  await expect(page.getByRole('region', { name: 'Metas' })).toHaveCount(0);
  await expect(botonMetas).toBeFocused();
  await expect(botonMetas).toHaveAttribute('aria-expanded', 'false');

  const guardadas = await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_metas_v1')));
  expect(guardadas.metas.rechazoMaximo).toBe(3.5);
  expect(guardadas.autor.id).toBe(PERFIL.id);
  // El semáforo del rechazo ya mide contra la meta nueva.
  await expect(page.locator('.kpi[data-id="rechazo_7d"] .kpi__objetivo')).toHaveText('Meta: máximo 3,5 %');
});

test('metas: cancelar no guarda y Escape también cierra', async ({ page }) => {
  await entrar(page, '#/');
  const botonMetas = page.getByRole('button', { name: 'Metas', exact: true });
  await botonMetas.click();
  const metas = page.getByRole('region', { name: 'Metas' });
  await metas.getByLabel('Cumplimiento mínimo del plan').fill('80');
  await metas.getByRole('button', { name: 'Cancelar' }).click();
  await expect(metas).toHaveCount(0);
  await expect(botonMetas).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('zahavi_metas_v1'))).toBeNull();

  await botonMetas.click();
  await expect(page.getByRole('region', { name: 'Metas' }).getByLabel('Cumplimiento mínimo del plan')).toHaveValue('90');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Metas' })).toHaveCount(0);
  await expect(botonMetas).toBeFocused();
});

test('metas: el jefe de obrador las ve en solo lectura y sin presupuesto', async ({ page, context }) => {
  await comoRol(context, 'obrador');
  await entrar(page, '#/');
  await page.getByRole('button', { name: 'Metas', exact: true }).click();
  const metas = page.getByRole('region', { name: 'Metas' });
  await expect(metas).toContainText('Las metas las fija gerencia o administración');
  await expect(metas.locator('input')).toHaveCount(0);
  await expect(metas).toContainText('Rechazo máximo');
  await expect(metas).not.toContainText('Presupuesto');
  await expect(metas).not.toContainText('Alza de precio');
  await metas.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('button', { name: 'Metas', exact: true })).toBeFocused();
});

/* ===========================================================================
 *  4. TECLADO Y FOCO
 * ======================================================================== */

test('pestañas con flechas, Inicio y Fin; el foco va con la pestaña', async ({ page }) => {
  await entrar(page, '#/');
  const tab = (nombre) => page.getByRole('tab', { name: nombre, exact: true });

  await tab('Producción').focus();
  await expect(tab('Producción')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Rendimiento y merma')).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('ArrowRight');
  await expect(tab('Rendimiento y merma')).toBeFocused();
  await expect(tab('Rendimiento y merma')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Rendimiento y merma')).toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('tabpanel', { name: 'Rendimiento y merma' })).toBeVisible();

  await page.keyboard.press('End');
  await expect(tab('Equipo')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Producción')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab('Equipo')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('Producción')).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Producción' })).toBeVisible();

  // Tab sale de la lista de pestañas en un solo paso (tabindex itinerante).
  await page.keyboard.press('Tab');
  await expect(page.getByRole('group', { name: 'Periodo del análisis' }).getByRole('button').first()).toBeFocused();
});

test('cambiar el periodo conserva el foco y la pestaña', async ({ page }) => {
  await entrar(page, '#/');
  await page.getByRole('tab', { name: 'Bodega y compras' }).click();
  const periodos = page.getByRole('group', { name: 'Periodo del análisis' });
  await expect(periodos.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true');

  await periodos.getByRole('button', { name: '7 días' }).click();
  await expect(periodos.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
  await expect(periodos.getByRole('button', { name: '7 días' })).toBeFocused();
  await expect(periodos.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('tab', { name: 'Bodega y compras' })).toHaveAttribute('aria-selected', 'true');

  // Con teclado: Enter sobre otro periodo.
  await periodos.getByRole('button', { name: '12 meses' }).focus();
  await page.keyboard.press('Enter');
  await expect(periodos.getByRole('button', { name: '12 meses' })).toBeFocused();
  await expect(periodos.getByRole('button', { name: '12 meses' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.resumen-analisis__rango')).toContainText('se compara con');

  // Sobrevive a salir y volver al inicio (mirada del módulo).
  await page.locator('.modulo[data-tono="recetario"]').click();
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Periodo del análisis' }).getByRole('button', { name: '12 meses' })).toHaveAttribute('aria-pressed', 'true');
});

/* ===========================================================================
 *  5. LOS AVISOS LLEVAN A DONDE SE ARREGLAN
 * ======================================================================== */

test('cada aviso enlaza a su módulo y el de vencidos lleva a Bodega', async ({ page }) => {
  await sembrarBodega(page);
  await entrar(page, '#/');

  const enlaces = page.locator('a.resumen-alerta__accion');
  await expect(enlaces.first()).toBeVisible();
  const hrefs = await enlaces.evaluateAll((nodos) => nodos.map((n) => n.getAttribute('href')));
  for (const href of hrefs) expect(href).toMatch(/^#\/(plan|almacen|recetario|ingredientes)(\?.*)?$/);

  const vencidos = page.locator('.resumen-alerta[data-tipo="vencidos"]');
  await expect(vencidos).toBeVisible();
  await expect(vencidos).toContainText('Urgente');
  await expect(vencidos.locator('a')).toHaveAttribute('href', '#/almacen');
  await vencidos.locator('a').click();
  await expect(page.locator('.pantalla[data-modulo="almacen"]')).toBeVisible();

  // La franja de hoy lleva a la producción de HOY, con su fecha.
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Ir a la producción de hoy →' })).toHaveAttribute('href', `#/plan?fecha=${hoy}`);
});

/* ===========================================================================
 *  6. ESTADOS VACÍO Y DE ERROR
 * ======================================================================== */

test('sin operación el panel lo dice en palabras y ofrece el ejemplo', async ({ page }) => {
  await entrar(page, '#/');
  await expect(page.locator('.resumen__vacio')).toContainText('Todavía no hay operación registrada en este equipo.');
  await expect(page.getByText('Todo en orden: nada requiere atención hoy.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver con datos de ejemplo' })).toBeVisible();
  await expect(page.getByText('Sin producción programada para hoy.')).toBeVisible();
});

test('si la operación no se puede leer, se explica sin romper la navegación', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('zahavi_almacen_v1', JSON.stringify({ version: 1, lotes: 'roto' }));
  });
  await entrar(page, '#/');
  await expect(page.getByRole('heading', { name: 'No se pudo armar el resumen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver a intentar' })).toBeVisible();
  await page.locator('.modulo[data-tono="recetario"]').click();
  await expect(page.locator('nav[aria-label="Listado de recetas"]')).toBeVisible();
});

/* ===========================================================================
 *  7. SIN DESBORDES
 * ======================================================================== */

for (const [nombre, width, height] of [['escritorio', 1440, 1000], ['tableta', 834, 1112], ['celular', 390, 844]]) {
  test(`sin desplazamiento lateral con datos de ejemplo: ${nombre}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errores = [];
    page.on('pageerror', (error) => errores.push(error.message));
    await entrar(page, '#/');
    await verEjemplo(page);
    for (const pestana of ['Producción', 'Rendimiento y merma', 'Bodega y compras', 'Equipo']) {
      await page.getByRole('tab', { name: pestana, exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      expect(await desbordeHorizontal(page), pestana).toBeLessThanOrEqual(1);
      const interno = await page.locator('.dashboard').evaluate((n) => n.scrollWidth - n.clientWidth);
      expect(interno, pestana).toBeLessThanOrEqual(1);
    }
    await page.getByRole('tab', { name: 'Producción', exact: true }).click();
    await page.getByRole('button', { name: 'Metas', exact: true }).click();
    expect(await desbordeHorizontal(page), 'metas').toBeLessThanOrEqual(1);
    await page.locator('.dashboard').evaluate((n) => { n.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`resumen-${nombre}.png`), fullPage: false, animations: 'disabled' });
    expect(errores).toEqual([]);
  });
}
