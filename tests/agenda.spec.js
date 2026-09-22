/**
 * =============================================================================
 *  PRODUCCION: CALENDARIO (PROD-002)
 * =============================================================================
 *
 *  El calendario mensual, el panel del dia, el registro por area, las notas,
 *  Proyectar (empezar → confirmar → lista), Mi producción, Materiales, Costos
 *  y Equipo. Las cifras esperadas salen de las reglas del nucleo y de la
 *  receta real, no de numeros escritos aqui.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  entrar, interceptarImpresion, hojaImpresa, simularSupabase, abrirAjustes, PERFIL, EQUIPO, llamadasA,
  CODIGO, PIN, CODIGO_TOTP,
} from './apoyo.js';
import { consolidar } from '../src/core/plan.js';
import { hoyLocal, sumarDias } from '../src/core/bitacora.js';
import { ordenesPorArea } from '../src/core/ordenes.js';
import { costearPlan, bajasDelCosteo } from '../src/core/costeo.js';
import { tandasParaUnidades, fijarRecetaEn } from '../src/core/produccion.js';
import { asignarRecetaEn } from '../src/core/preparacion.js';
import { guardarNotaEn } from '../src/core/notas.js';
import { festivosDe, nombreMes } from '../src/core/calendario.js';
import { lotesDemo } from '../src/core/almacen.js';
import { formatQty, titleCase } from '../src/lib/format.js';
import { indicadoresResultado } from '../src/core/resultados-produccion.js';

test('los subtotales por área conservan el costo FEFO y no duplican el stock', () => {
  const crear = (id, categoria, cantidad, unidad = 'GR') => ({ recipe: { id, nombre: id, categoria,
    componentes: [{ nombre: 'Masa', items: [{ ingrediente: 'HARINA', cantidad, unidad }] }] }, factor: 1 });
  const entradas = [crear('A', 'PANADERÍA', 80), crear('B', 'GALLETAS', 80), crear('C', 'PASTELERÍA', 10, 'UND')];
  const stock = [{ id: 'L1', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 100, existencia: 100, costoCompra: 101 }];
  const antes = JSON.stringify({ entradas, stock });
  const grupos = ordenesPorArea(entradas, stock, '2026-09-14');
  const costeo = costearPlan(consolidar(entradas).lineas, stock, '2026-09-14');
  expect(grupos.reduce((s, g) => s + g.costo, 0)).toBe(costeo.costoTotal);
  expect(grupos.reduce((s, g) => s + g.costo, 0)).toBe(101);
  expect(grupos.every((g) => g.incompleto)).toBe(true);
  expect(grupos.find((g) => g.categoria === 'PASTELERÍA').plan.lineas[0].unidad).toBe('UND');
  expect(JSON.stringify({ entradas, stock })).toBe(antes);
  expect(ordenesPorArea(entradas, [], '2026-09-14', costeo)).toEqual(grupos);
});

const publicado = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));

for (const ancho of [1440, 390]) {
  test(`materiales unifican claras en gramos entre recetas y áreas · ${ancho}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: ancho, height: 950 });
    const crear = (id, categoria, items) => ({ id, nombre: id + ' X 10 UND', categoria,
      componentes: [{ nombre: 'BASE', items: items.map(([cantidad, unidad]) => ({ ingrediente: 'CLARAS DE HUEVO', cantidad: String(cantidad), unidad })) }] });
    const recetas = [crear('QA-TEST-MIXTA', 'PANADERÍA', [[8, 'UND'], [1, 'GR']]), crear('QA-TEST-GRAMO', 'GALLETAS', [[1, 'GR']])];
    const datos = { version: 1, operacionVersion: 1, secuencia: 0, planes: [], ejecuciones: [], eventos: [], notas: [], preparaciones: [],
      lotes: [{ id: 'QA-LOTE', ingrediente: 'CLARAS DE HUEVO', unidad: 'UND', equivalencias: { UND: 30 }, pesoCompra: 30, existencia: 30, costoCompra: 9000 }] };
    recetas.forEach((r, i) => expect(fijarRecetaEn(datos, { fecha: hoy, revision: i, recetaId: r.id, factor: 1, responsable: 'QA', motivo: 'Prueba aislada' }, recetas).ok).toBe(true));
    await preparar(page, { documento: datos });
    await page.getByRole('button', { name: 'Materiales', exact: true }).click();
    const pan = page.getByRole('region', { name: 'Materiales de Panadería' });
    await expect(pan.locator('tbody tr')).toHaveCount(1);
    await expect(pan.locator('tbody tr')).toContainText('241');
    await page.getByRole('group', { name: 'Ver', exact: true }).getByRole('button', { name: 'Total', exact: true }).click();
    await expect(page.locator('.mat-total tbody tr')).toHaveCount(1);
    await expect(page.locator('.mat-total tbody tr')).toContainText('242');
    await expect(page.locator('.mat-total tbody tr')).toContainText('GR');
    await page.screenshot({ path: testInfo.outputPath('materiales-claras-sumadas.png'), fullPage: true });
    await alCalendario(page);
    await page.getByRole('button', { name: 'Costos', exact: true }).click();
    await page.locator('.cos-ingredientes > summary').click();
    await expect(page.locator('.costeo__linea')).toHaveCount(1);
    await expect(page.locator('.costeo__linea')).toContainText('242 GR');
    await expect(page.locator('.costeo__linea')).toContainText('8 UND → 240 g');
    await expect(page.locator('.costeo__total-cifra')).toContainText('2.420');
  });
}

for (const ancho of [1440, 834, 390]) {
  test(`partidas independientes y resultados accesibles · ${ancho}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: ancho, height: 950 });
    await preparar(page);
    await registrar(page, receta, { cantidad: 0.5 });
    const resultado = page.locator(`.reg__resultado[data-receta="${receta.id}"]`);
    await resultado.locator('input').fill('2');
    await resultado.locator('button').click();
    await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue('2.5');
    await page.locator('#reg-buscar').fill(otra.nombre);
    const resultadoOtra = page.locator(`.reg__resultado[data-receta="${otra.id}"]`);
    await expect(resultadoOtra.locator('input')).toHaveValue('1');
    await resultadoOtra.locator('input').fill('0.75');
    await resultadoOtra.locator('button').click();
    await expect(page.getByLabel(`Tandas de ${nombre(otra)}`)).toHaveValue('0.75');
    const verRegistradas = page.getByRole('button', { name: 'Registradas (2)', exact: true });
    if (await verRegistradas.isVisible()) await verRegistradas.click();
    const ficha = page.locator(`.reg__fila[data-receta="${receta.id}"]`);
    await expect(ficha.locator('.reg__partida input')).toHaveCount(2);
    await ficha.locator('.reg__partida input').first().fill('0.25');
    await ficha.locator('.reg__partida input').first().blur();
    await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue('2.25');
    await expect(page.getByLabel(`Tandas de ${nombre(otra)}`)).toHaveValue('0.75');
    const datos = await leer(page);
    expect(datos.planes[0].entradas.find((e) => e.recipe.id === receta.id).partidas).toEqual([0.25, 2]);
    await ficha.locator('.reg__consumo summary').click();
    await expect(ficha.locator('.reg__consumo')).toContainText(' g');
    expect(await page.locator('.reg').evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await ficha.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('partidas-independientes.png'), fullPage: true });
    await alCalendario(page);
    await page.getByRole('button', { name: 'Resultados', exact: true }).click();
    await expect(page.locator('.resultados-dia')).toContainText('Cantidad esperada');
    await expect(page.locator('.resultados-dia')).toContainText('confirmar');
    await page.screenshot({ path: testInfo.outputPath('resultados-directos.png'), fullPage: true });
  });
}
const hoy = hoyLocal();
// El cheesecake (Pastelería): su bodega de prueba cubre justo 10 tandas.
const receta = publicado.recipes.find((r) => r.id === 'R016');
const otra = publicado.recipes.find((r) => r.categoria === receta.categoria && r.id !== receta.id);
const lineas = consolidar([{ recipe: receta, factor: 1 }]).lineas;
const lotes = lineas.map((l, i) => ({ id: `L${String(i + 1).padStart(3, '0')}`, ingrediente: l.ingrediente,
  equivalencias: { ML: 1, UND: 50 }, // Pesos ficticios de estas compras de prueba.
  unidad: l.unidad, pesoCompra: l.cantidad * 10, existencia: l.cantidad * 10, costoCompra: l.cantidad * 100,
  marca: 'QA', proveedor: 'QA Proveedor', presentacion: 'BOLSA', lote: `QA-${i}`, vencimiento: '2099-01-01',
  fechaCompra: hoy, registrado: new Date().toISOString() }));
const leer = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')));
const nombre = (r) => titleCase(r.nombre);

/** Bodega de prueba en el equipo, sesion abierta y el calendario delante. */
async function preparar(page, { conLotes = true, fecha = null, documento = null } = {}) {
  await page.addInitScript(({ lista, doc }) => {
    if (localStorage.getItem('zahavi_almacen_v1')) return;
    if (doc) localStorage.setItem('zahavi_almacen_v1', JSON.stringify(doc));
    else if (lista) localStorage.setItem('zahavi_almacen_v1', JSON.stringify({ version: 1, lotes: lista }));
  }, { lista: conLotes ? lotes : null, doc: documento });
  await entrar(page, fecha ? `#/plan?fecha=${fecha}` : '#/plan');
  await expect(page.locator('.cal')).toBeVisible();
}

const celda = (page, fecha) => page.locator(`.cal__celda[data-fecha="${fecha}"]`);
const panel = (page) => page.locator('.dia');

/** Desde el calendario: dia → Registrar producción → area → buscar → Añadir. */
async function registrar(page, r, { area = r.categoria, cantidad = null, modo = null } = {}) {
  await page.getByRole('button', { name: 'Registrar producción', exact: true }).click();
  await panel(page).locator(`.area-btn--${CLASE_AREA[area]}`).click();
  await expect(page.getByRole('heading', { name: `Registrar producción · ${titleCase(area)}` })).toBeVisible();
  // Se entra escribiendo: el foco ya está en el buscador del área.
  await expect(page.locator('#reg-buscar')).toBeFocused();
  if (modo) await page.getByRole('group', { name: 'Añadir por' }).getByRole('button', { name: modo }).click();
  await page.locator('#reg-buscar').fill(r.nombre);
  if (cantidad !== null) await page.locator(`.reg__resultado[data-receta="${r.id}"] input`).fill(String(cantidad));
  await page.getByRole('button', { name: new RegExp(`^(Añadir|Sumar a) ${escapar(nombre(r))}`) }).click();
  // La vista es nueva en cada llamada: el primer aviso con el nombre es el de este guardado.
  await expect(page.locator('.prod-estado-texto')).toContainText(nombre(r));
  // En una columna lo registrado está tras el conmutador «Ver»: basta con que exista.
  await expect(page.locator(`.reg__fila[data-receta="${r.id}"]`)).toHaveCount(1);
}

const CLASE_AREA = { 'PANADERÍA': 'panaderia', 'PASTELERÍA': 'pasteleria', GALLETAS: 'galletas' };
const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function alCalendario(page) {
  await page.getByRole('button', { name: 'Volver al calendario' }).click();
  await expect(page.locator('.cal')).toBeVisible();
}

/** Proyectar: elige el area, la receta, empieza y confirma. */
async function producir(page, r) {
  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(r.categoria) }).click();
  await page.locator(`.proy-tarjeta[data-receta="${r.id}"]`).click();
  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await page.getByRole('button', { name: 'Marcar lista' }).click();
  await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  await expect(page.locator(`.proy-tarjeta[data-receta="${r.id}"]`)).toHaveClass(/proy-tarjeta--lista/);
}

for (const ancho of [1440, 834, 390]) {
  test(`resultado real: rendimiento, merma, corrección e historial a ${ancho}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: ancho, height: 1000 });
    await preparar(page);
    const originales = await page.evaluate(async () => (await import('/src/core/store.js')).getState().recetario.recipes);
    await registrar(page, receta, { cantidad: 2 });
    await alCalendario(page);
    async function abrirProducida() {
      await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
      await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
      await page.getByRole('group', { name: 'Mostrar' }).getByRole('button', { name: 'Todas', exact: true }).click();
      const tarjeta = page.locator(`.proy-tarjeta[data-receta="${receta.id}"]`);
      if (await tarjeta.getAttribute('aria-pressed') !== 'true' && await tarjeta.getAttribute('aria-expanded') !== 'true') await tarjeta.click();
    }
    await abrirProducida();
    await page.getByRole('button', { name: 'Empezar a producir' }).click();
    await page.getByRole('button', { name: 'Marcar lista' }).click();
    await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
    const ficha = page.getByRole('region', { name: 'Resultado real de producción' });
    await expect(ficha).toContainText('Resultado real pendiente');
    const antes = await leer(page);
    await expect(ficha.getByLabel('Cantidad vendible', { exact: true })).toBeVisible();
    await expect(ficha.getByLabel('Cantidad esperada', { exact: true })).toHaveValue('2');
    await ficha.getByLabel('Cantidad vendible', { exact: true }).fill('1');
    await ficha.getByLabel('Cantidad rechazada', { exact: true }).fill('1');
    await ficha.getByLabel('Pérdida en preparación (g)', { exact: true }).fill('15');
    await ficha.getByRole('button', { name: 'Guardar resultado', exact: true }).click();
    await expect(ficha.getByRole('alert')).toContainText('Explica');
    expect((await leer(page)).resultados || []).toHaveLength(0);
    await ficha.getByLabel('Motivo de pérdidas o diferencias').fill('Rotura al desmoldar');
    expect(await ficha.evaluate((n) => n.scrollWidth - n.clientWidth)).toBeLessThanOrEqual(1);
    await ficha.locator('form').screenshot({ path: testInfo.outputPath('resultado-formulario.png') });
    await ficha.getByRole('button', { name: 'Guardar resultado', exact: true }).click();
    await expect(ficha.locator('p[role="status"]')).toContainText('Resultado guardado');
    let despues = await leer(page);
    expect(despues.resultados).toHaveLength(1);
    expect(despues.resultados[0]).toMatchObject({ esperado: 2, vendible: 1, rechazado: 1, mermaPreparacionGr: 15, mermaCoccionGr: null, revision: 1 });
    expect(despues.lotes).toEqual(antes.lotes);
    expect(despues.ejecuciones).toEqual(antes.ejecuciones);
    const cifras = indicadoresResultado(despues.ejecuciones[0], despues.resultados[0]);
    expect(cifras.costoReal).toBe(cifras.costoPrevisto * 2);
    await expect(ficha).toContainText('Costo real por UND vendible');
    await ficha.getByText('Costo real por UND vendible', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('resultado-costo-visible.png') });
    await ficha.screenshot({ path: testInfo.outputPath('resultado-medido.png') });
    await page.reload();
    await expect(page.locator('.cal')).toBeVisible();
    await abrirProducida();
    await ficha.getByText('Corregir resultado', { exact: true }).click();
    await ficha.getByLabel('Cantidad vendible', { exact: true }).fill('0');
    await ficha.getByLabel('Cantidad rechazada', { exact: true }).fill('2');
    await ficha.getByLabel('Motivo de la corrección').fill('Reconteo: ninguna apta para vender');
    await ficha.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(ficha).toContainText('Sin unidades vendibles');
    despues = await leer(page);
    expect(despues.resultados[0].revision).toBe(2);
    expect(despues.eventos.filter((e) => e.tipo === 'resultado_guardado')).toHaveLength(2);
    expect(despues.lotes).toEqual(antes.lotes);
    await alCalendario(page);
    await page.getByRole('button', { name: 'Costos', exact: true }).first().click();
    const costos = page.getByRole('region', { name: 'Rendimiento y costo por unidad' });
    await costos.locator('summary').click();
    await expect(costos).toContainText('Sin unidades vendibles');
    await alCalendario(page);
    await page.getByRole('button', { name: 'Historial', exact: true }).click();
    await page.locator('.historial__registro > summary').first().click();
    await page.getByText('2 registros de resultado', { exact: true }).click();
    await expect(page.locator('.historial')).toContainText('Rotura al desmoldar');
    await expect(page.locator('.historial')).toContainText('Reconteo: ninguna apta para vender');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar historial CSV' }).click();
    const csv = readFileSync(await (await descarga).path(), 'utf8');
    expect(csv).toContain('Costo real por medida vendible COP');
    expect(csv).toContain('Reconteo: ninguna apta para vender');
    expect(csv.split('\n').filter((l) => l.startsWith(hoy)).every((l) => l.split(';').length === 16)).toBe(true);
    expect(await page.evaluate(async () => (await import('/src/core/store.js')).getState().recetario.recipes)).toEqual(originales);
  });
}

test('resultado real: el operario registra su medición sin ver costos ni corregirla', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.perfil = { ...PERFIL, rol: 'operario' };
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: structuredClone(lotes), planes: [],
    ejecuciones: [], eventos: [], notas: [], preparaciones: [] };
  const jefe = { id: 'jefe', nombre: 'Jefa', codigo: 'JEFA', rol: 'obrador' };
  fijarRecetaEn(datos, { fecha: hoy, revision: 0, recetaId: receta.id, factor: 1, responsable: 'Jefa', motivo: 'QA' }, publicado.recipes);
  asignarRecetaEn(datos, { fecha: hoy, recetaId: receta.id,
    trabajador: { id: PERFIL.id, nombre: PERFIL.nombre, codigo: PERFIL.codigo_usuario, area: receta.categoria } }, jefe);
  await page.addInitScript((doc) => localStorage.setItem('zahavi_almacen_v1', JSON.stringify(doc)), datos);
  await entrar(page, '#/plan');
  await expect(page.getByRole('heading', { name: 'Mi producción' })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await page.getByRole('button', { name: 'Marcar lista' }).click();
  await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  const ficha = page.getByRole('region', { name: 'Resultado real de producción' });
  await expect(ficha.getByLabel('Cantidad vendible', { exact: true })).toBeVisible();
  await ficha.getByLabel('Cantidad vendible', { exact: true }).fill('1');
  await ficha.getByRole('button', { name: 'Guardar resultado', exact: true }).click();
  await expect(ficha).toContainText('Resultado guardado');
  await expect(ficha).not.toContainText('COP');
  await expect(ficha).not.toContainText('Costo real');
  await expect(ficha.getByText('Corregir resultado', { exact: true })).toHaveCount(0);
  expect((await leer(page)).resultados[0].autor.id).toBe(PERFIL.id);
});

test('resultado real: el historial y su CSV ocultan importes al jefe de obrador', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.perfil = { ...PERFIL, rol: 'obrador' };
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await producir(page, receta);
  const ficha = page.getByRole('region', { name: 'Resultado real de producción' });
  await expect(ficha.getByLabel('Cantidad vendible', { exact: true })).toBeVisible();
  await ficha.getByLabel('Cantidad vendible', { exact: true }).fill('1');
  await ficha.getByRole('button', { name: 'Guardar resultado', exact: true }).click();
  await expect(ficha).toContainText('Resultado guardado');
  await expect(ficha).not.toContainText('Costo real');
  await expect(ficha.getByText('Corregir resultado', { exact: true })).toBeVisible();
  await alCalendario(page);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  const historial = page.locator('.historial');
  await historial.locator('.historial__registro > summary').first().click();
  await expect(historial).toContainText('Vendible');
  expect(await historial.textContent()).not.toMatch(/\$|COP|Costo real|Materia prima consumida/);
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar historial CSV' }).click();
  const csv = readFileSync(await (await descarga).path(), 'utf8');
  expect(csv).not.toMatch(/Costo|COP/);
  expect(csv).toContain('Cantidad vendible');
});

test('el calendario muestra el mes, los festivos de cada año y se recorre con el teclado', async ({ page }) => {
  // Un mes con festivo trasladado (Ley Emiliani) del año que viene: nadie lo cargó a mano.
  const anio = Number(hoy.slice(0, 4)) + 1;
  const [fechaFestivo, nombreFestivo] = [...festivosDe(anio)].find(([f]) => f.slice(5, 7) === '11');
  await preparar(page, { fecha: fechaFestivo });
  await expect(page.locator('.cal__mes')).toHaveText(nombreMes(anio, 11));
  await expect(celda(page, fechaFestivo)).toHaveClass(/cal__celda--festivo/);
  await expect(celda(page, fechaFestivo).locator('.cal__festivo')).toHaveText(nombreFestivo);
  await expect(panel(page).locator('.dia__festivo')).toContainText(nombreFestivo);
  // Solo el dia elegido esta en el tabulador.
  await expect(page.locator('.cal__dia[tabindex="0"]')).toHaveCount(1);
  await celda(page, fechaFestivo).locator('.cal__dia').focus();
  await page.keyboard.press('ArrowRight');
  await expect(celda(page, sumarDias(fechaFestivo, 1)).locator('.cal__dia')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(celda(page, sumarDias(fechaFestivo, 8)).locator('.cal__dia')).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`fecha=${sumarDias(fechaFestivo, 8)}`));
  await page.keyboard.press('PageDown');
  await expect(page.locator('.cal__mes')).toHaveText(/diciembre/i);
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(celda(page, hoy)).toHaveClass(/cal__celda--hoy/);
  await expect(celda(page, hoy).locator('.cal__dia')).toHaveAttribute('aria-current', 'date');
});

test('registrar por área guarda al instante, suma y sobrevive a recargar', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  let datos = await leer(page);
  expect(datos.planes).toHaveLength(1);
  expect(datos.planes[0].entradas.map((e) => [e.recipe.id, e.factor])).toEqual([[receta.id, 1]]);
  expect(datos.planes[0].responsable).toBe(`${PERFIL.nombre} (${PERFIL.codigo_usuario})`);
  expect(datos.lotes).toEqual(lotes);

  // Añadirla otra vez SUMA, y por unidades convierte con su rendimiento.
  const extra = tandasParaUnidades(receta, 3).value;
  await page.getByRole('group', { name: 'Añadir por' }).getByRole('button', { name: 'Unidades' }).click();
  await page.locator('#reg-cantidad').fill('3');
  await expect(page.locator(`.reg__resultado[data-receta="${receta.id}"]`)).toContainText(`= ${formatQty(extra.tandas)} tandas`);
  await page.getByRole('button', { name: new RegExp(`^Sumar a ${escapar(nombre(receta))}`) }).click();
  await expect(page.locator('.prod-estado-texto')).toContainText('Sumaste');
  await expect(page.getByRole('button', { name: new RegExp(`^Sumar a ${escapar(nombre(receta))}`) })).toBeFocused();
  const total = Math.round((1 + extra.tandas) * 1000) / 1000;
  await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue(String(total));

  // Cambiar tandas en la lista también guarda.
  await page.getByLabel(`Tandas de ${nombre(receta)}`).fill('2');
  await page.getByLabel(`Tandas de ${nombre(receta)}`).blur();
  await expect(page.locator('.prod-estado-texto')).toContainText('2 tandas');
  datos = await leer(page);
  expect(datos.planes[0].entradas[0].factor).toBe(2);
  expect(datos.planes[0].revision).toBe(3);

  await page.reload();
  await expect(celda(page, hoy).locator('.cal-ficha--area')).toHaveText(`${titleCase(receta.categoria)} 0/1`);
  await expect(panel(page).locator(`.dia__area--${CLASE_AREA[receta.categoria]}`)).toContainText('0 de 1 lista');
});

test('cada área solo busca y registra sus propias recetas', async ({ page }) => {
  await preparar(page);
  await page.getByRole('button', { name: 'Registrar producción', exact: true }).click();
  await panel(page).locator('.area-btn--galletas').click();
  await page.locator('#reg-buscar').fill(receta.nombre);
  await expect(page.locator('.reg__resultados')).toContainText('Ninguna receta de Galletas coincide');
  await page.locator('#reg-buscar').fill('');
  const galletas = publicado.recipes.filter((r) => r.categoria === 'GALLETAS');
  await expect(page.locator('.reg__resultado')).toHaveCount(galletas.length);
  // La pestaña cambia de área sin volver al calendario.
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await page.locator('#reg-buscar').fill(receta.nombre);
  await expect(page.locator('.reg__resultado')).toHaveCount(1);
});

test('quitar la última receta de un día sin producción lo deja vacío y deja constancia', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await page.getByRole('button', { name: `Quitar ${nombre(receta)}` }).click();
  await expect(page.locator('.reg__registradas')).toContainText('Todavía no hay recetas');
  await expect(page.locator('#reg-buscar')).toBeFocused();
  const datos = await leer(page);
  expect(datos.planes).toHaveLength(0);
  expect(datos.eventos.at(-1).tipo).toBe('plan_eliminado');
  expect(datos.lotes).toEqual(lotes);
  await alCalendario(page);
  await expect(celda(page, hoy).locator('.cal-ficha')).toHaveCount(0);
});

test('notas del día: se ven en el calendario, se marcan, se editan y se borran', async ({ page }) => {
  await preparar(page);
  await page.getByRole('button', { name: 'Tarea', exact: true }).click();
  await expect(page.locator('#dia-nota-texto')).toBeFocused();
  await page.locator('#dia-nota-texto').fill('Limpiar el horno de piso');
  await page.getByRole('group', { name: 'Para' }).getByRole('button', { name: 'Panadería' }).click();
  await expect(page.getByRole('group', { name: 'Para' }).getByRole('button', { name: 'Panadería' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Guardar tarea' }).click();
  await page.getByRole('button', { name: 'Felicitación', exact: true }).click();
  await page.locator('#dia-nota-texto').fill('Excelente turno de galletas');
  await page.getByRole('button', { name: 'Guardar felicitación' }).click();

  await expect(celda(page, hoy).locator('.cal-ficha--tarea')).toContainText('Tarea: Limpiar el horno de piso');
  await expect(celda(page, hoy).locator('.cal-ficha--felicitacion')).toBeVisible();
  const tarea = panel(page).locator('.nota--tarea');
  await expect(tarea).toContainText(PERFIL.nombre);
  await expect(tarea.locator('.nota__area')).toHaveText('Panadería');
  // Las felicitaciones no se «cumplen».
  await expect(panel(page).locator('.nota--felicitacion input[type="checkbox"]')).toHaveCount(0);

  await tarea.getByLabel(/^Marcar como hecha/).check();
  await expect(panel(page).locator('.nota--tarea')).toHaveClass(/nota--hecha/);
  await expect(panel(page).locator('.nota--tarea').getByLabel(/^Marcar como hecha/)).toBeFocused();
  await expect(celda(page, hoy).locator('.cal-ficha--tarea')).toHaveClass(/cal-ficha--hecha/);

  await panel(page).getByRole('button', { name: 'Editar: Limpiar el horno de piso' }).click();
  await page.locator('#dia-nota-texto').fill('Limpiar el horno de piso y la campana');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(panel(page).locator('.nota--tarea')).toContainText('y la campana');
  await expect(panel(page).locator('.nota--tarea')).toHaveClass(/nota--hecha/);

  await panel(page).getByRole('button', { name: 'Borrar: Excelente turno de galletas' }).click();
  await expect(panel(page).getByRole('button', { name: 'Sí, borrar' })).toBeFocused();
  await panel(page).getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(panel(page).locator('.nota--felicitacion')).toHaveCount(0);
  await expect(page.locator('#dia-titulo')).toBeFocused();

  const datos = await leer(page);
  expect(datos.notas.map((n) => [n.tipo, n.hecha, n.revision])).toEqual([['tarea', true, 3]]);
  expect(datos.eventos.map((e) => e.tipo).filter((t) => t.startsWith('nota'))).toEqual(
    ['nota_guardada', 'nota_guardada', 'nota_guardada', 'nota_guardada', 'nota_eliminada']);
  expect(datos.eventos.at(-1).antes.texto).toBe('Excelente turno de galletas');
  await page.reload();
  await expect(celda(page, hoy).locator('.cal-ficha--tarea')).toContainText('y la campana');
});

test('proyectar: se asigna, se empieza y confirmar descuenta solo esa receta', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await page.locator('#reg-buscar').fill(otra.nombre);
  await page.getByRole('button', { name: new RegExp(`^Añadir ${escapar(nombre(otra))}`) }).click();
  await expect(page.locator('.reg__fila')).toHaveCount(2);
  await alCalendario(page);

  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sacar producción' })).toBeFocused();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await expect(page.locator('.proy-tarjeta')).toHaveCount(2);
  await expect(page.locator('.prod-avance__texto')).toHaveText('0 de 2 listas');
  await page.locator(`.proy-tarjeta[data-receta="${receta.id}"]`).click();
  await expect(page.locator(`.proy-tarjeta[data-receta="${receta.id}"]`)).toHaveAttribute('aria-pressed', 'true');

  // Solo aparece quien es de esa área; el equipo sale de Supabase.
  const quien = page.getByLabel(`Quién saca ${nombre(receta)}`);
  await expect(quien.locator('option')).toHaveText(['Sin asignar']);
  await expect(page.locator('.proy__aviso')).toContainText('Nadie tiene el área');

  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await expect(page.locator(`.proy-tarjeta[data-receta="${receta.id}"]`)).toHaveClass(/proy-tarjeta--en_preparacion/);
  await expect(page.getByRole('button', { name: 'Marcar lista' })).toBeFocused();
  // La medida ya viene multiplicada para lo que falta.
  await expect(page.locator('.proy-detalle')).toContainText('Medidas para 1 tanda');
  await page.getByRole('button', { name: 'Marcar lista' }).click();
  await expect(page.locator('.proy-detalle__pregunta')).toContainText('Se descuentan de bodega');
  await expect(page.getByRole('button', { name: 'Sí, descontar de bodega' })).toBeFocused();
  await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  await expect(page.locator('.prod-avance__texto')).toHaveText('1 de 2 listas');
  await expect(page.locator('.proy-detalle__lista')).toContainText(`confirmada por ${PERFIL.nombre}`);

  const datos = await leer(page);
  expect(datos.ejecuciones).toHaveLength(1);
  expect(datos.ejecuciones[0].recetaId).toBe(receta.id);
  expect(datos.ejecuciones[0].entradas.map((e) => e.recipe.id)).toEqual([receta.id]);
  for (const l of lotes) expect(datos.lotes.find((x) => x.id === l.id).existencia).toBeCloseTo(l.existencia - (bajasDelCosteo(datos.ejecuciones[0].costeo).get(l.id) || 0), 8);
  expect(datos.lotes.find((l) => l.ingrediente === 'AGUA').existencia).toBe(lotes.find((l) => l.ingrediente === 'AGUA').existencia);
  expect(datos.eventos.map((e) => e.tipo)).toContain('preparacion_iniciada');

  // La otra receta sigue pendiente y, sin bodega para ella, no se puede confirmar.
  await page.locator(`.proy-tarjeta[data-receta="${otra.id}"]`).click();
  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await expect(page.getByRole('button', { name: 'Marcar lista' })).toBeDisabled();
  await expect(page.locator('.proy-detalle__faltan')).toContainText('No se puede marcar lista');
  await expect(page.locator('.proy-detalle__faltan')).toContainText('Revisa compras y equivalencias en Bodega');
  await expect(page.locator('.proy-detalle__faltan').getByRole('button', { name: 'Ir a Bodega' })).toBeVisible();
  await page.getByRole('button', { name: 'Dejar para después' }).click();
  await expect(page.locator(`.proy-tarjeta[data-receta="${otra.id}"]`)).toHaveClass(/proy-tarjeta--pendiente/);

  await alCalendario(page);
  await expect(celda(page, hoy).locator('.cal-ficha--area')).toHaveText(`${titleCase(receta.categoria)} 1/2`);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByLabel('Periodo del historial').selectOption('año');
  await expect(page.locator('.historial__resumen').first()).toContainText('1 producción aprobada');
});

test('asignar: solo a alguien del área, y la persona lo ve en su producción', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.equipo = EQUIPO.map((p) => ({ ...p, area: p.area === 'PANADERÍA' ? receta.categoria : p.area }));
  const ana = sim.equipo[0];
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  const quien = page.getByLabel(`Quién saca ${nombre(receta)}`);
  // Solo el nombre: la lista no trae el código con el que se entra (0012).
  await expect(quien.locator('option')).toHaveText(['Sin asignar', ana.nombre]);
  await quien.selectOption(ana.id);
  await expect(page.locator('.prod-estado-texto')).toContainText(`asignada a ${ana.nombre}`);
  await expect(quien).toBeFocused();
  await expect(quien).toHaveValue(ana.id);
  const datos = await leer(page);
  expect(datos.preparaciones).toEqual([expect.objectContaining({
    recetaId: receta.id, asignado: { id: ana.id, nombre: ana.nombre, codigo: '', area: receta.categoria },
  })]);
  // La lista del equipo se pidió una sola vez.
  expect(llamadasA(sim, '/rest/v1/equipo_produccion')).toBe(1);

  // «Mi producción» de quien tiene la sesión: no tiene nada asignado.
  await alCalendario(page);
  await page.getByRole('button', { name: 'Mi producción', exact: true }).click();
  await expect(page.locator('.proy__vacio')).toContainText('No tienes recetas asignadas este día.');
});

test('sin red para leer el equipo se dice y se puede reintentar', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  sim.leerEquipo = 'sin_red';
  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await expect(page.locator('.proy__aviso')).toContainText('No se pudo cargar el equipo');
  sim.leerEquipo = null;
  await page.locator('.proy__aviso').getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByLabel(`Quién saca ${nombre(receta)}`)).toBeEnabled();
  await expect(page.locator('.proy__aviso')).toContainText('Nadie tiene el área');
});

test('cerrar sesión olvida la lista del equipo: quien entra la pide con su propio permiso', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  const abrirProyectar = async () => {
    await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
    await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
    await expect(page.getByLabel(`Quién saca ${nombre(receta)}`)).toBeEnabled();
  };
  await abrirProyectar();
  expect(llamadasA(sim, '/rest/v1/equipo_produccion')).toBe(1);

  await abrirAjustes(page);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByLabel('Código de usuario').fill(CODIGO);
  await page.getByLabel('PIN', { exact: true }).fill(PIN);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByLabel('Código de verificación').fill(CODIGO_TOTP);
  await page.getByRole('button', { name: 'Verificar' }).click();
  await page.locator('.inicio').waitFor();
  await page.evaluate(() => { window.location.hash = '#/plan'; });
  await expect(page.locator('.cal')).toBeVisible();
  await abrirProyectar();
  expect(llamadasA(sim, '/rest/v1/equipo_produccion')).toBe(2);
});

test('el operario entra directo a su producción y solo ve lo suyo, sin costos', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.perfil = { ...PERFIL, rol: 'operario' };
  // Un día con dos recetas: una asignada a la persona de la sesión y otra a alguien más.
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: structuredClone(lotes), planes: [],
    ejecuciones: [], eventos: [], notas: [], preparaciones: [] };
  const jefe = { id: 'jefe', nombre: 'Jefa', codigo: 'JEFA', rol: 'obrador' };
  fijarRecetaEn(datos, { fecha: hoy, revision: 0, recetaId: receta.id, factor: 1, responsable: 'Jefa', motivo: 'QA' }, publicado.recipes);
  fijarRecetaEn(datos, { fecha: hoy, revision: 1, recetaId: otra.id, factor: 1, responsable: 'Jefa', motivo: 'QA' }, publicado.recipes);
  asignarRecetaEn(datos, { fecha: hoy, recetaId: receta.id, trabajador: { id: PERFIL.id, nombre: PERFIL.nombre, codigo: PERFIL.codigo_usuario, area: receta.categoria } }, jefe);
  asignarRecetaEn(datos, { fecha: hoy, recetaId: otra.id, trabajador: { id: 'otra-persona', nombre: 'Otra', codigo: 'OTRA', area: otra.categoria } }, jefe);
  await page.addInitScript((doc) => {
    if (!localStorage.getItem('zahavi_almacen_v1')) localStorage.setItem('zahavi_almacen_v1', JSON.stringify(doc));
  }, datos);
  await entrar(page, '#/plan');

  await expect(page.getByRole('heading', { name: 'Mi producción' })).toBeVisible();
  await expect(page.locator('.cal')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Volver al calendario' })).toHaveCount(0);
  await expect(page.locator('.proy-tarjeta')).toHaveCount(1);
  await expect(page.locator('.proy-tarjeta')).toContainText(nombre(receta));
  await expect(page.locator('.proy-detalle__asignado')).toHaveText('Te la asignó Jefa.');
  await expect(page.getByLabel(/^Quién saca/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await page.getByRole('button', { name: 'Marcar lista' }).click();
  await expect(page.locator('.proy-detalle__pregunta')).not.toContainText('$');
  await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  await expect(page.locator('.proy-detalle__lista')).toContainText('Lista');
  const despues = await leer(page);
  expect(despues.ejecuciones[0].responsable).toBe(`${PERFIL.nombre} (${PERFIL.codigo_usuario})`);
  expect(despues.ejecuciones[0].recetaId).toBe(receta.id);
  await expect(page.locator('.calprod')).not.toContainText('$');
  // Nadie le pidió la lista del equipo.
  expect(llamadasA(sim, '/rest/v1/equipo_produccion')).toBe(0);
  // Escape no le saca de su producción hacia un calendario que no tiene: sale del módulo.
  await page.locator('.pantalla').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pantalla')).toHaveCount(0);
});

test('unidades extra sobre una receta lista: vuelve a pendiente y solo descuenta lo nuevo', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await producir(page, receta);
  const primera = await leer(page);
  await alCalendario(page);

  const extra = tandasParaUnidades(receta, 1).value;
  await registrar(page, receta, { modo: 'Unidades', cantidad: 1 });
  await expect(page.locator(`.reg__fila[data-receta="${receta.id}"] .prod-estado`)).toHaveText('Faltan tandas');
  // Con producción confirmada no hay «Quitar»: se dice por qué.
  await expect(page.getByRole('button', { name: `Quitar ${nombre(receta)}` })).toHaveCount(0);
  await expect(page.locator(`.reg__fila[data-receta="${receta.id}"] .reg__no-quitar`)).toHaveText('Ya se produjo: no se puede quitar.');
  await alCalendario(page);
  await producir(page, receta);

  const segunda = await leer(page);
  expect(segunda.ejecuciones).toHaveLength(2);
  expect(segunda.ejecuciones[1].entradas[0].factor).toBe(extra.tandas);
  for (const l of primera.lotes) expect(segunda.lotes.find((x) => x.id === l.id).existencia).toBeCloseTo(l.existencia - (bajasDelCosteo(segunda.ejecuciones[1].costeo).get(l.id) || 0), 8);
  expect(segunda.ejecuciones[0]).toEqual(primera.ejecuciones[0]);
});

test('dos pestañas no confirman dos veces la misma receta', async ({ page, context }) => {
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await page.getByRole('button', { name: 'Marcar lista' }).click();

  const otraPestana = await context.newPage();
  await otraPestana.goto('/index.html#/plan');
  await otraPestana.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await otraPestana.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await otraPestana.getByRole('button', { name: 'Marcar lista' }).click();

  await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  await expect(page.locator('.proy-detalle__lista')).toBeVisible();
  await otraPestana.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  await expect(otraPestana.locator('.prod-estado-texto')).toContainText('ya está lista');
  expect((await leer(page)).ejecuciones).toHaveLength(1);
});

test('materiales por área, sin costos, e impresión sin pesos', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta, { cantidad: 2 });
  await alCalendario(page);
  await interceptarImpresion(page);
  await page.getByRole('button', { name: 'Materiales', exact: true }).first().click();
  const area = page.locator(`.mat-area--${'pasteleria'}`);
  await expect(area.locator('h3')).toHaveText('Pastelería');
  await expect(area).toContainText(`${nombre(receta)} · 2 tandas`);
  const agua = consolidar([{ recipe: receta, factor: 2 }]).lineas[0];
  await expect(area.locator('tbody tr').first()).toContainText(titleCase(agua.ingrediente));
  await expect(area.locator('tbody tr').first()).toContainText(formatQty(agua.cantidad));
  await expect(page.locator('.mat')).not.toContainText('$');
  await page.getByRole('group', { name: 'Qué incluir' }).getByRole('button', { name: 'Solo lo que falta' }).click();
  await expect(area).toBeVisible();
  await page.getByRole('button', { name: 'Imprimir', exact: true }).click();
  const hoja = await hojaImpresa(page);
  expect(hoja.texto).toContain('Solo materiales');
  expect(hoja.texto).toContain('TANDA ×2');
  expect(hoja.texto).not.toContain('Costo');
  expect(hoja.texto).not.toContain('$');
  await expect(page.locator('.mat')).toBeVisible();
});

test('costos: separados, con el lote de compra de cada ingrediente', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await page.getByRole('button', { name: 'Costos', exact: true }).first().click();
  const esperado = costearPlan(lineas, lotes, hoy);
  await expect(page.locator('.cos-cifra').first()).toContainText(esperado.costoTotal.toLocaleString('es-CO'));
  await expect(page.locator('.cos-area').first()).toContainText('Estimado');
  await page.locator('.cos-ingredientes > summary').first().click();
  const primera = page.locator('.costeo__linea').filter({ has: page.locator('summary') }).first();
  await primera.getByText('De 1 compra', { exact: false }).click();
  await expect(primera.locator('.costeo__lotes-tabla')).toContainText('QA Proveedor');
  await expect(page.getByRole('button', { name: 'Descontar del almacén' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Toda la semana' }).click();
  await expect(page.locator('.cos-semana tbody tr')).toHaveCount(7);
});

test('faltan precios: Costos lo dice y completa la bodega con ejemplos', async ({ page }) => {
  await preparar(page, { conLotes: false });
  await registrar(page, receta);
  await alCalendario(page);
  await page.getByRole('button', { name: 'Costos', exact: true }).first().click();
  await expect(page.locator('.cos-cifra').first()).toContainText('Incompleto');
  await page.getByRole('button', { name: 'Completar la bodega con lotes de ejemplo' }).click();
  await expect(page.locator('.cos-ejemplo')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Costos' })).toBeFocused();
  const datos = await leer(page);
  expect(datos.lotes).toHaveLength(lotesDemo(hoy, publicado.recipes).length);
  expect(datos.eventos.filter((e) => e.tipo === 'ejemplo')).toHaveLength(datos.lotes.length);
});

test('los ejemplos no se mezclan con una bodega que tiene compras reales', async ({ page }) => {
  // Una compra real en el historial: los ejemplos ya no pueden entrar.
  const documento = { version: 1, operacionVersion: 1, secuencia: 1, lotes: [lotes[0]], planes: [], ejecuciones: [],
    notas: [], preparaciones: [], eventos: [{ id: 'compra-qa', tipo: 'compra', instante: new Date().toISOString(),
      responsable: 'QA', motivo: 'Compra', antes: null, despues: lotes[0] }] };
  await preparar(page, { conLotes: false, documento });
  await registrar(page, otra);
  await alCalendario(page);
  await page.getByRole('button', { name: 'Costos', exact: true }).first().click();
  await page.getByRole('button', { name: 'Completar la bodega con lotes de ejemplo' }).click();
  await expect(page.locator('.cos-ejemplo__estado')).toContainText('sin compras reales');
  expect((await leer(page)).lotes).toHaveLength(1);
});

test('equipo: administración asigna el área, guardada en Supabase', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  await preparar(page);
  await page.getByRole('button', { name: 'Equipo', exact: true }).click();
  const sinArea = EQUIPO[2];
  const campo = page.getByLabel(`Área de ${sinArea.nombre}`);
  await expect(campo).toHaveValue('');
  await campo.selectOption('GALLETAS');
  await expect(page.locator('.prod-estado-texto')).toContainText(`${sinArea.nombre}: Galletas`);
  await expect(campo).toBeFocused();
  const cambio = sim.llamadas.find((l) => l.method === 'PATCH');
  expect(cambio.ruta).toContain(`id=eq.${sinArea.id}`);
  expect(cambio.cuerpo).toEqual({ area: 'GALLETAS' });
  expect(sim.equipo[2].area).toBe('GALLETAS');

  // Sin la verificación en dos pasos, la base de datos no deja: se dice y se deshace.
  sim.nivel = 'aal1';
  await campo.selectOption('PANADERÍA');
  await expect(page.locator('.prod-estado-texto')).toContainText('verificación en dos pasos');
  await expect(campo).toHaveValue('GALLETAS');
});

test('el jefe de obrador produce, pero no ve Equipo ni los costos', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.perfil = { ...PERFIL, rol: 'obrador' };
  await preparar(page);
  await expect(page.getByRole('group', { name: 'Otras vistas' }).getByRole('button', { name: 'Mi producción' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Equipo', exact: true })).toHaveCount(0);
  // El costo es de gerencia, como en la base de datos.
  await registrar(page, receta);
  await alCalendario(page);
  await expect(panel(page).getByRole('button', { name: 'Costos' })).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: 'Materiales' })).toBeVisible();
  // Y tampoco asoma al confirmar una receta.
  await page.locator('.dia__atajos').getByRole('button', { name: 'Sacar producción' }).click();
  await page.getByRole('button', { name: `Empezar a producir: ${nombre(receta)}` }).click();
  await page.getByRole('button', { name: `Marcar lista: ${nombre(receta)}` }).click();
  await expect(page.locator('.proy-detalle__pregunta')).toContainText('Se descuentan de bodega');
  await expect(page.locator('.calprod')).not.toContainText('$');
});

test('gerencia sí ve los costos', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.perfil = { ...PERFIL, rol: 'gerencia' };
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await panel(page).getByRole('button', { name: 'Costos' }).click();
  await expect(page.getByRole('heading', { name: 'Costos' })).toBeFocused();
  await expect(page.locator('.cos-cifra').first()).toContainText('$');
});

test('siempre hay un día elegido: sin «cerrar», y el foco se queda en el día', async ({ page }) => {
  await preparar(page);
  await expect(page.getByRole('button', { name: 'Cerrar el día' })).toHaveCount(0);
  await expect(page.getByText('Día elegido:')).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await celda(page, hoy).locator('.cal__dia').click();
  await expect(panel(page)).toBeVisible();
  await expect(celda(page, hoy).locator('.cal__dia')).toBeFocused();
  // Con Enter sobre otro día, el foco sigue en el día elegido tras repintar.
  const otroDia = sumarDias(hoy, hoy.endsWith('-01') ? 1 : -1);
  await celda(page, otroDia).locator('.cal__dia').focus();
  await page.keyboard.press('Enter');
  await expect(celda(page, otroDia)).toHaveClass(/cal__celda--elegida/);
  await expect(celda(page, otroDia).locator('.cal__dia')).toBeFocused();
});

test('sumar con la lista desactualizada no pisa lo que cambió otra pestaña', async ({ page, context }) => {
  await preparar(page);
  await registrar(page, receta);
  const otraPestana = await context.newPage();
  await otraPestana.goto('/index.html#/plan');
  await registrar(otraPestana, receta, { cantidad: 4 });
  await expect(otraPestana.locator('.prod-estado-texto')).toContainText('Queda en 5 tandas');
  expect((await leer(page)).planes[0].entradas[0].factor).toBe(5);

  // Esta pestaña todavía muestra 1 tanda: sumar se rechaza y se vuelve a pintar.
  await page.getByRole('button', { name: new RegExp(`^Sumar a ${escapar(nombre(receta))}`) }).click();
  await expect(page.locator('.prod-estado-texto')).toContainText('cambió en otra pestaña');
  await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue('5');
  expect((await leer(page)).planes[0].entradas[0].factor).toBe(5);
});

test('un error al marcar una nota se ve después de repintar', async ({ page, context }) => {
  await preparar(page);
  await page.getByRole('button', { name: 'Tarea', exact: true }).click();
  await page.locator('#dia-nota-texto').fill('Revisar la báscula');
  await page.getByRole('button', { name: 'Guardar tarea' }).click();
  // Otra pestaña la cambia mientras tanto.
  const otraPestana = await context.newPage();
  await otraPestana.goto('/index.html#/plan');
  await otraPestana.getByRole('button', { name: 'Editar: Revisar la báscula' }).click();
  await otraPestana.locator('#dia-nota-texto').fill('Revisar la báscula grande');
  await otraPestana.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(otraPestana.locator('.nota--tarea')).toContainText('grande');

  await panel(page).getByLabel(/^Marcar como hecha/).check();
  await expect(panel(page).locator('.dia__estado')).toContainText('cambió en otra pestaña');
  await expect(panel(page).getByLabel(/^Marcar como hecha/)).toBeFocused();
});

test('marcar una nota con el formulario abierto conserva lo escrito', async ({ page }) => {
  await preparar(page);
  await page.getByRole('button', { name: 'Tarea', exact: true }).click();
  await page.locator('#dia-nota-texto').fill('Primera tarea');
  await page.getByRole('button', { name: 'Guardar tarea' }).click();
  await page.getByRole('button', { name: 'Pendiente', exact: true }).click();
  await page.locator('#dia-nota-texto').fill('Pedir levadura a medias');
  await panel(page).getByLabel('Marcar como hecha: Primera tarea').check();
  // Primero, que el panel ya se haya repintado con la nota marcada.
  await expect(panel(page).locator('.nota--tarea')).toHaveClass(/nota--hecha/);
  await expect(page.locator('#dia-nota-texto')).toHaveValue('Pedir levadura a medias');
  await expect(panel(page).getByLabel('Marcar como hecha: Primera tarea')).toBeFocused();
});

test('un cambio de tandas rechazado deja en la casilla lo que está guardado', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await producir(page, receta);
  await alCalendario(page);
  await registrar(page, receta);
  // 1 tanda ya hecha: 1,02 sería un adicional por debajo del mínimo (0,05).
  const campo = page.getByLabel(`Tandas de ${nombre(receta)}`);
  await campo.fill('1.02');
  await campo.blur();
  await expect(page.locator('.prod-estado-texto')).toContainText('al menos');
  await expect(campo).toHaveValue('2');
});

test('Escape vuelve al calendario, del panel lleva al día y después sale', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  // Con texto en el buscador, Escape solo lo borra.
  await page.locator('#reg-buscar').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reg-buscar')).toHaveValue('');
  await expect(page.locator('.reg')).toBeVisible();
  await page.keyboard.press('Escape');
  // Sigue en el módulo: el Escape no llegó a la pantalla, que lo habría sacado al menú.
  await expect(page).toHaveURL(/#\/plan/);
  await expect(page.locator('.cal')).toBeVisible();
  await expect(celda(page, hoy).locator('.cal__dia')).toBeFocused();
  await page.getByRole('button', { name: 'Tarea', exact: true }).click();
  await expect(page.locator('#dia-nota-texto')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/plan/);
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#dia-nota-texto')).toHaveCount(0);
  await expect(celda(page, hoy).locator('.cal__dia')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/#\/plan/);
  await expect(page.locator('.pantalla')).toHaveCount(0);
});

for (const [tamano, width, height] of [['escritorio', 1440, 1000], ['tableta', 834, 1112], ['movil', 390, 844]]) {
  test(`el calendario y sus vistas caben sin desbordes · ${tamano}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await preparar(page);
    await registrar(page, receta);
    await alCalendario(page);
    await page.getByRole('button', { name: 'Tarea', exact: true }).click();
    await page.locator('#dia-nota-texto').fill('Revisar la cámara de frío antes del turno de la tarde');
    await page.getByRole('button', { name: 'Guardar tarea' }).click();
    const desborde = () => page.locator('.pantalla__cuerpo').evaluate((n) => n.scrollWidth - n.clientWidth);
    expect(await desborde()).toBeLessThanOrEqual(1);
    await page.locator('.pantalla__cuerpo').evaluate((n) => { n.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`calendario-${tamano}.png`), animations: 'disabled' });
    for (const vista of ['Sacar producción', 'Materiales', 'Costos']) {
      await page.getByRole('button', { name: vista, exact: true }).first().click();
      await expect(page.locator('.prod-vista')).toBeVisible();
      expect(await desborde(), vista).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`${vista.split(' ')[0].toLowerCase()}-${tamano}.png`), animations: 'disabled' });
      await alCalendario(page);
    }
    // En el celular, cada ficha es un punto: el mes cabe entero.
    if (tamano === 'movil') {
      const alto = await celda(page, hoy).evaluate((n) => n.getBoundingClientRect().height);
      expect(alto).toBeLessThan(90);
    }
    expect(errores).toEqual([]);
  });
}

test('la fecha del día elegido viaja en la dirección y sobrevive a recargar', async ({ page }) => {
  const manana = sumarDias(hoy, 1);
  await preparar(page);
  await celda(page, manana).locator('.cal__dia').click();
  await expect(page).toHaveURL(new RegExp(`fecha=${manana}`));
  await registrar(page, receta);
  await alCalendario(page);
  await page.reload();
  await expect(celda(page, manana)).toHaveClass(/cal__celda--elegida/);
  await expect(panel(page).locator('button.dia__area')).toBeVisible();
  await expect(panel(page).locator('.dia__etiqueta')).toHaveText('Aún no llega');
  // Un día futuro se planifica, pero no se empieza.
  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await expect(page.getByText('Se empieza a producir el')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Empezar a producir' })).toHaveCount(0);
});

test('un día pasado con recetas sin confirmar lo dice en la celda y en el panel', async ({ page }) => {
  const ayer = sumarDias(hoy, -1);
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: structuredClone(lotes), planes: [],
    ejecuciones: [], eventos: [], notas: [], preparaciones: [] };
  fijarRecetaEn(datos, { fecha: ayer, revision: 0, recetaId: receta.id, factor: 1, responsable: 'QA', motivo: 'QA' }, publicado.recipes);
  await preparar(page, { conLotes: false, documento: datos, fecha: ayer });
  await expect(celda(page, ayer)).toHaveClass(/cal__celda--atrasada/);
  await expect(celda(page, ayer).locator('.cal-ficha--area')).toHaveText(`${titleCase(receta.categoria)} 0/1 !`);
  await expect(celda(page, ayer).locator('.cal__dia')).toHaveAttribute('aria-label', /1 sin confirmar/);
  await expect(panel(page).locator('.dia__atrasado')).toContainText('1 receta quedó sin confirmar');
  await expect(panel(page).locator('.dia__etiqueta')).toHaveText('Ya pasó');
  // Con recetas y el día ya llegado, lo principal es producir: un solo botón principal.
  await expect(panel(page).locator('.btn--primary')).toHaveCount(1);
  await expect(panel(page).locator('.btn--primary')).toHaveText('Sacar producción');
  await panel(page).getByRole('button', { name: 'Revisar lo que falta' }).click();
  await expect(page.getByRole('heading', { name: 'Sacar producción' })).toBeFocused();
  await expect(page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) })).toHaveAttribute('aria-pressed', 'true');
});

test('un día vacío tiene como principal Registrar, y cada área es una fila', async ({ page }) => {
  await preparar(page);
  await expect(panel(page).locator('.btn--primary')).toHaveText('Registrar producción');
  await expect(panel(page).getByRole('button', { name: 'Sacar producción' })).toHaveCount(0);
  await registrar(page, receta);
  await alCalendario(page);
  await expect(panel(page).locator('.btn--primary')).toHaveText('Sacar producción');
  // Las tres áreas, en su orden; la que no tiene recetas no es un botón.
  await expect(panel(page).locator('.dia__area')).toHaveCount(3);
  await expect(panel(page).locator('button.dia__area')).toHaveCount(1);
  await expect(panel(page).locator('.dia__area--vacia').first()).toContainText('Sin recetas');
  await panel(page).getByRole('button', { name: new RegExp(`^${titleCase(receta.categoria)}: 0 de 1 lista`) }).click();
  await expect(page.getByRole('heading', { name: 'Sacar producción' })).toBeFocused();
});

test('una nota vacía no se guarda y lo dice junto al campo; muchas notas se agrupan en la celda', async ({ page }) => {
  await preparar(page);
  await page.getByRole('button', { name: 'Recomendación', exact: true }).click();
  await expect(page.getByLabel('¿Qué recomiendas?')).toBeFocused();
  await page.getByRole('button', { name: 'Guardar recomendación' }).click();
  await expect(panel(page).locator('.dia__error')).toHaveText('Escribe la nota antes de guardar.');
  await expect(page.locator('#dia-nota-texto')).toBeFocused();
  expect((await leer(page))?.notas ?? []).toHaveLength(0);
  await registrar(page, receta);
  await alCalendario(page);
  for (const texto of ['Uno', 'Dos', 'Tres']) {
    await page.getByRole('button', { name: 'Tarea', exact: true }).click();
    await page.locator('#dia-nota-texto').fill(texto);
    await page.getByRole('button', { name: 'Guardar tarea' }).click();
    await expect(panel(page).locator('.nota')).toContainText([texto]);
  }
  // Un área y tres notas no caben: las notas van juntas y ninguna ficha se esconde.
  await expect(celda(page, hoy).locator('.cal-ficha')).toHaveCount(2);
  await expect(celda(page, hoy).locator('.cal-ficha--notas')).toHaveText('✎ 3 notas');
  await expect(celda(page, hoy)).not.toContainText('más');
});

test('guardar dentro del módulo no lanza transiciones: el toque siguiente no se pierde', async ({ page }) => {
  await preparar(page);
  // Mientras dura una View Transition el documento no recibe toques.
  await page.evaluate(() => {
    window.__transiciones = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) document.startViewTransition = (...args) => { window.__transiciones += 1; return original(...args); };
  });
  await registrar(page, receta);
  await page.getByRole('button', { name: `Una tanda más de ${nombre(receta)}` }).click();
  await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue('2');
  await alCalendario(page);
  await page.getByRole('button', { name: 'Tarea', exact: true }).click();
  await page.locator('#dia-nota-texto').fill('Sin transiciones');
  await page.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(panel(page).locator('.nota--tarea')).toBeVisible();
  expect(await page.evaluate(() => window.__transiciones)).toBe(0);
});

test('el foco nunca cae al cuerpo: desplegar áreas y alternar el tipo de nota', async ({ page }) => {
  await preparar(page);
  const registrar = page.getByRole('button', { name: 'Registrar producción', exact: true });
  await registrar.click();
  await expect(registrar).toHaveAttribute('aria-expanded', 'true');
  await expect(registrar).toBeFocused();
  await registrar.click();
  await expect(registrar).toHaveAttribute('aria-expanded', 'false');
  await expect(registrar).toBeFocused();

  // El botón del tipo promete alternar: reabrirlo no puede borrar lo escrito.
  const tarea = page.getByRole('button', { name: 'Tarea', exact: true });
  await tarea.click();
  await page.locator('#dia-nota-texto').fill('Texto a medias');
  await page.getByRole('button', { name: 'Pendiente', exact: true }).click();
  await tarea.click();
  await expect(page.locator('#dia-nota-texto')).toHaveValue('Texto a medias');
  await expect(tarea).toHaveAttribute('aria-pressed', 'true');
  await tarea.click();
  await expect(page.locator('#dia-nota-texto')).toHaveCount(0);
  await expect(tarea).toBeFocused();
  await expect(tarea).toHaveAttribute('aria-pressed', 'false');
});

test('proyectar abre por lo que falta, en orden de trabajo, y reparte lo que queda sin asignar', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  sim.equipo = EQUIPO.map((p) => ({ ...p, area: p.area === 'PANADERÍA' ? receta.categoria : p.area }));
  const ana = sim.equipo[0];
  await preparar(page);
  await registrar(page, receta);
  await page.locator('#reg-buscar').fill(otra.nombre);
  await page.getByRole('button', { name: new RegExp(`^Añadir ${escapar(nombre(otra))}`) }).click();
  await expect(page.locator('.reg__fila')).toHaveCount(2);
  await alCalendario(page);
  await page.locator('.dia__atajos').getByRole('button', { name: 'Sacar producción' }).click();

  // Se entra a lo que falta, no a todo.
  await expect(page.getByRole('group', { name: 'Mostrar' }).getByRole('button', { name: 'Por hacer' })).toHaveAttribute('aria-pressed', 'true');
  // La que está en preparación va primero, y es la que se abre.
  await page.locator(`.proy-tarjeta[data-receta="${otra.id}"]`).click();
  await page.getByRole('button', { name: `Empezar a producir: ${nombre(otra)}` }).click();
  await expect(page.locator('.proy-tarjeta').first()).toHaveAttribute('data-receta', otra.id);

  // Repartir de una vez lo que nadie tiene asignado.
  await page.locator('.proy__lote').getByLabel('Asignar las que faltan a').selectOption(ana.id);
  await page.locator('.proy__lote').getByRole('button', { name: 'Asignar' }).click();
  await expect(page.locator('.prod-estado-texto')).toContainText(`2 recetas asignadas a ${ana.nombre}`);
  await expect(page.locator('.proy__lote')).toBeHidden();
  const datos = await leer(page);
  expect(datos.preparaciones.map((p) => p.asignado?.id)).toEqual([ana.id, ana.id]);
});

test('en pantalla baja, tocar un día lleva su panel a la vista; con el teclado no salta', async ({ page }) => {
  // Alta suficiente para el mes, pero no para el panel: es cuando hace falta.
  await page.setViewportSize({ width: 390, height: 640 });
  await preparar(page);
  const cuerpo = page.locator('.pantalla__cuerpo');
  const registrar = page.getByRole('button', { name: 'Registrar producción', exact: true });
  const otroDia = sumarDias(hoy, hoy.endsWith('-01') ? 8 : 7);
  await cuerpo.evaluate((n) => { n.scrollTop = 0; });
  await expect(registrar).not.toBeInViewport();
  await celda(page, otroDia).locator('.cal__dia').click();
  await expect(page.locator('#dia-titulo')).toHaveText(new RegExp(String(Number(otroDia.slice(8)))));
  // El día se toca para trabajarlo: se ve entero, no asomando por abajo.
  await expect(registrar).toBeInViewport({ ratio: 1 });

  // Con las flechas se recorre la rejilla: cada paso no puede mover la página.
  await cuerpo.evaluate((n) => { n.scrollTop = 0; });
  await celda(page, otroDia).locator('.cal__dia').focus({ preventScroll: true });
  await page.keyboard.press('ArrowRight');
  await expect(celda(page, sumarDias(otroDia, 1)).locator('.cal__dia')).toBeFocused();
  await expect(registrar).not.toBeInViewport({ ratio: 1 });
});

test('quitar una receta por error se deshace de un toque', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta, { cantidad: 3 });
  await page.getByRole('button', { name: `Quitar ${nombre(receta)}` }).click();
  await expect(page.locator('.prod-estado-texto')).toContainText('quitada del día');
  expect((await leer(page)).planes).toHaveLength(0);

  await page.getByRole('button', { name: `Deshacer: volver a añadir ${nombre(receta)}` }).click();
  await expect(page.locator('.prod-estado-texto')).toContainText('vuelve al día: 3 tandas');
  await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue('3');
  expect((await leer(page)).planes[0].entradas[0].factor).toBe(3);
  // La oferta es de una sola vez: el cambio siguiente se la lleva.
  await expect(page.locator('.reg__deshacer')).toBeEmpty();
});

test('si falta materia prima, se puede bajar las tandas desde el aviso', async ({ page }) => {
  await preparar(page, { conLotes: false });
  await registrar(page, receta);
  await alCalendario(page);
  await page.locator('.dia__atajos').getByRole('button', { name: 'Sacar producción' }).click();
  await page.getByRole('button', { name: `Empezar a producir: ${nombre(receta)}` }).click();
  const faltan = page.locator('.proy-detalle__faltan');
  await expect(faltan).toContainText('No se puede marcar lista');
  await faltan.getByRole('button', { name: 'Cambiar tandas' }).click();
  // Lleva directamente a la receta que se necesita corregir.
  await expect(page.getByRole('heading', { name: `Registrar producción · ${titleCase(receta.categoria)}` })).toBeVisible();
  await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toHaveValue('1');
  await expect(page.getByLabel(`Tandas de ${nombre(receta)}`)).toBeFocused();
});

// ---- PROD-004: eliminar lo cargado, notas a una persona y el respaldo --------

test('la producción cargada por error se elimina con su motivo y queda en el historial', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await expect(celda(page, hoy).locator('.cal-ficha')).toHaveCount(1);

  await panel(page).getByRole('button', { name: 'Eliminar la producción del día' }).click();
  // Sin motivo no se elimina: el núcleo exige la traza y la pantalla no la esconde.
  await expect(page.getByRole('button', { name: 'Sí, eliminar' })).toBeDisabled();
  await page.getByRole('group', { name: 'Motivo' }).getByRole('button', { name: 'Se cargó por error' }).click();
  await page.getByRole('button', { name: 'Sí, eliminar' }).click();

  await expect(panel(page).locator('.dia__vacio')).toBeVisible();
  await expect(celda(page, hoy).locator('.cal-ficha')).toHaveCount(0);
  const datos = await leer(page);
  expect(datos.planes).toHaveLength(0);
  const evento = datos.eventos.at(-1);
  expect(evento.tipo).toBe('plan_eliminado');
  expect(evento.motivo).toBe('Se cargó por error');
  expect(evento.responsable).toBe(`${PERFIL.nombre} (${PERFIL.codigo_usuario})`);

  // El historial lo cuenta como lo que fue, no como un día vacío.
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(page.locator('.historial')).toContainText('Plan eliminado');
});

test('un día ya producido no ofrece eliminar: solo quitar lo que falte', async ({ page }) => {
  await preparar(page);
  await registrar(page, receta);
  await alCalendario(page);
  await producir(page, receta);
  await alCalendario(page);

  await expect(panel(page).getByRole('button', { name: 'Eliminar la producción del día' })).toHaveCount(0);
  await expect(panel(page).locator('.dia__borrado-no')).toContainText('ya tiene producción confirmada');
  await panel(page).locator('.dia__borrado-no').getByRole('button', { name: 'Quitar recetas' }).click();
  await expect(page.getByRole('group', { name: 'Elige el área para registrar' })).toBeVisible();
});

test('una nota se dirige a una persona del equipo, no a todo el equipo', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  await preparar(page);
  const ana = EQUIPO[0];

  await panel(page).getByRole('button', { name: 'Tarea', exact: true }).click();
  await page.locator('#dia-nota-texto').fill('Sacar el pan a las 5');
  // El equipo no se pide hasta que alguien dice que la nota es para una persona.
  expect(llamadasA(sim, '/rest/v1/equipo_produccion')).toBe(0);
  await page.getByRole('group', { name: 'Para' }).getByRole('button', { name: 'Una persona…' }).click();
  await page.getByRole('group', { name: 'Para quién es la nota' }).getByRole('button', { name: `Para ${ana.nombre}` }).click();
  expect(llamadasA(sim, '/rest/v1/equipo_produccion')).toBe(1);
  await page.getByRole('button', { name: 'Guardar tarea' }).click();

  await expect(panel(page).locator('.nota__persona')).toHaveText(`Para: ${ana.nombre}`);
  await expect(panel(page).locator('.nota__area')).toHaveCount(0);
  const datos = await leer(page);
  // Sin código de acceso: la lista del equipo no lo entrega (0012) y la nota no lo inventa.
  expect(datos.notas[0].persona).toEqual({ id: ana.id, nombre: ana.nombre, codigo: '' });
  expect(datos.notas[0].area).toBe(null);

  // Marcarla hecha no le cambia el destinatario.
  await panel(page).getByRole('checkbox', { name: /^Marcar como hecha/ }).check();
  await expect(panel(page).locator('.nota--hecha')).toHaveCount(1);
  expect((await leer(page)).notas[0].persona.id).toBe(ana.id);
});

test('el operario ve en su producción lo que le dejaron dicho, y puede marcarlo hecho', async ({ page, context }) => {
  const sim = await simularSupabase(context);
  const ana = EQUIPO[0];
  sim.perfil = { ...PERFIL, id: ana.id, nombre: ana.nombre, codigo_usuario: ana.codigo_usuario, rol: 'operario' };
  const datos = { version: 1, operacionVersion: 1, secuencia: 0, lotes: structuredClone(lotes), planes: [],
    ejecuciones: [], eventos: [], notas: [], preparaciones: [] };
  const jefe = { id: 'jefe', nombre: 'Jefa', codigo: 'JEFA', rol: 'obrador' };
  const suya = { id: ana.id, nombre: ana.nombre, codigo: ana.codigo_usuario };
  guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'Sacar el pan a las 5', persona: suya }, jefe);
  guardarNotaEn(datos, { fecha: hoy, tipo: 'tarea', texto: 'Esto es de Leo', persona: { id: EQUIPO[1].id, nombre: EQUIPO[1].nombre, codigo: 'LEO' } }, jefe);
  guardarNotaEn(datos, { fecha: hoy, tipo: 'recomendacion', texto: 'Para todo el equipo' }, jefe);
  await page.addInitScript((doc) => {
    if (!localStorage.getItem('zahavi_almacen_v1')) localStorage.setItem('zahavi_almacen_v1', JSON.stringify(doc));
  }, datos);
  await entrar(page, '#/plan');

  await expect(page.getByRole('heading', { name: 'Mi producción' })).toBeVisible();
  // Solo lo suyo: ni lo de Leo ni lo que es para todos.
  await expect(page.locator('.proy-nota')).toHaveCount(1);
  await expect(page.locator('.proy-nota__texto')).toContainText('Sacar el pan a las 5');

  await page.getByRole('checkbox', { name: /^Marcar como hecha/ }).check();
  await expect(page.locator('.proy-nota--hecha')).toHaveCount(1);
  const despues = await leer(page);
  const mia = despues.notas.find((n) => n.texto === 'Sacar el pan a las 5');
  expect(mia.hecha).toBe(true);
  expect(mia.persona.id).toBe(ana.id);
  // Solo eso: la nota sigue siendo de quien la escribió.
  expect(mia.autor.nombre).toBe('Jefa');
});

test('el respaldo completo se baja desde bodega, no desde el historial de producción', async ({ page }) => {
  await preparar(page);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(page.locator('.historial')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar respaldo completo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar historial CSV' })).toBeVisible();

  // En bodega sigue estando: es la única copia de todo mientras los datos vivan aquí.
  await page.evaluate(() => { window.location.hash = '#/almacen'; });
  await expect(page.locator('.almacen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar respaldo completo' })).toBeVisible();
});
