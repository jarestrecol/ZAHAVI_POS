/**
 * Las cuatro pestañas de análisis del Resumen (BI-001, agente D2).
 *
 * Dos niveles:
 *  1. Unidad en el navegador: cada pestaña se monta sola con una sección hecha
 *     a mano según el contrato (§5), con dinero, sin dinero y vacía. Así se
 *     prueba la vista sin depender de que el núcleo o el ejemplo ya existan, y
 *     con datos feos (nombres larguísimos, cifras enormes).
 *  2. Extremo a extremo: producción confirmada por la pantalla real y leída en
 *     el Resumen (hereda la garantía de tests/tablero.spec.js: el costo que se
 *     ve es el congelado al confirmar), y el modo de ejemplo en tres anchos.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { entrar, simularSupabase, desbordeHorizontal } from './apoyo.js';
import { consolidar } from '../src/core/plan.js';
import { hoyLocal } from '../src/core/bitacora.js';
import { pesos, titleCase } from '../src/lib/format.js';

const DINERO = /\$\s?\d/;

/**
 * Dónde guardar las capturas para revisarlas a ojo. Por defecto, en la carpeta
 * de resultados de la prueba; `CAPTURAS_DIR` las manda a otra carpeta (las
 * otras suites vacían test-results al arrancar).
 */
const captura = (testInfo, nombre) => (process.env.CAPTURAS_DIR ? join(process.env.CAPTURAS_DIR, nombre) : testInfo.outputPath(nombre));
const LARGO = 'TORTA DE TRES LECHES CON FRUTOS ROJOS DEL BOSQUE Y CREMA CHANTILLY DE VAINILLA X 24 UND';
const PERSONA_LARGA = 'María Fernanda de los Ángeles Restrepo Villegas (ejemplo)';
const AREAS = ['PASTELERÍA', 'PANADERÍA', 'GALLETAS'];
const TONO = { 'PASTELERÍA': 'pasteleria', 'PANADERÍA': 'panaderia', GALLETAS: 'galletas' };

/* ------------------------------------------------------------------------- */
/*  Secciones de prueba, con la forma del contrato                           */
/* ------------------------------------------------------------------------- */

const RANGO = {
  clave: '30d', nombre: '30 días', grano: 'dia', desde: '2026-08-23', hasta: '2026-09-21', dias: 30,
  anterior: { desde: '2026-07-24', hasta: '2026-08-22' },
};

const fechas = (n, hasta = '2026-09-21') => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${hasta}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (n - 1 - i));
  return d.toISOString().slice(0, 10);
});

function ind(id, nombre, valor, formato, extra = {}) {
  return { id, nombre, valor, formato, anterior: null, variacion: null, sentido: 'neutral', meta: null,
    estado: valor === null ? 'sin_datos' : 'sin_meta', dinero: false, base: null, definicion: 'Prueba.', chispa: null, ...extra };
}

function serie(id, formato, dinero, series, valor) {
  return { id, nombre: id, formato, dinero, grano: 'dia', series,
    puntos: fechas(30).map((f, i) => ({ desde: f, hasta: f, valores: Object.fromEntries(series.map((s, j) => [s.id, valor(i, j)])) })),
    meta: null };
}

const SERIES_AREAS = AREAS.map((a) => ({ id: TONO[a], nombre: titleCase(a), tono: TONO[a] }));

function produccion({ conDinero }) {
  const recetas = Array.from({ length: 14 }, (_, i) => ({
    recetaId: `R${100 + i}`, receta: i === 0 ? LARGO : `RECETA ${i}`, area: AREAS[i % 3],
    tandas: 20 - i, unidades: i % 2 ? null : (20 - i) * 24,
    ...(conDinero ? { costo: 98765432101 / (i + 1), costoUnidad: i % 2 ? null : 1234.5 } : {}),
    participacion: 30 - i, acumulado: Math.min(100, 30 + i * 5), variacion: 0.1,
  }));
  return {
    indicadores: [
      conDinero ? ind('gasto', 'Gasto en materia prima', 98765432101, 'pesos', { dinero: true }) : null,
      ind('tandas', 'Tandas producidas', 123.5, 'tandas'),
      ind('cumplimiento_plan', 'Cumplimiento del plan', 82, 'porcentaje', { meta: 90, sentido: 'subir', estado: 'mal' }),
    ].filter(Boolean),
    ...(conDinero ? {
      gasto: serie('gasto', 'pesos', true, [{ id: 'total', nombre: 'Total', tono: 'total' }, ...SERIES_AREAS], (i, j) => (j === 0 ? 3000000 + i * 1000 : 1000000)),
      gastoAnterior: serie('gasto_anterior', 'pesos', true, [{ id: 'anterior', nombre: 'Periodo anterior', tono: 'comparacion' }], () => 2500000),
    } : {}),
    tandas: serie('tandas', 'tandas', false, SERIES_AREAS, (i, j) => (i % 7 === 6 ? 0 : 2 + j)),
    calor: fechas(84).map((f, i) => ({ fecha: f, tandas: i % 7 === 6 ? 0 : 5, ...(conDinero ? { costo: i % 7 === 6 ? 0 : 450000 } : {}) })),
    semana: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((nombre, dia) => ({ dia, nombre, tandas: dia === 6 ? 0 : 4 + dia, ...(conDinero ? { costo: 300000 * (dia + 1) } : {}) })),
    recetas,
    pareto: { recetas: 14, top20: 3, porcentajeTop20: 61.4 },
    planVsReal: AREAS.map((area, i) => ({ area, planeadas: 20, confirmadas: 20 - i * 4, cumplimiento: 100 - i * 20 })),
  };
}

function rendimiento({ conDinero, medidas = 6 }) {
  return {
    indicadores: [
      ind('cumplimiento_rendimiento', 'Cumplimiento del rendimiento', 93.2, 'porcentaje', { meta: 95, sentido: 'subir', estado: 'atencion' }),
      ind('rechazo', 'Rechazo', 6.1, 'porcentaje', { meta: 5, sentido: 'bajar', estado: 'atencion' }),
      ind('medidas', 'Confirmaciones medidas', (medidas / 25) * 100, 'porcentaje', { base: `${medidas} de 25` }),
      conDinero ? ind('costo_rechazo', 'Costo del rechazo', 45000, 'pesos', { dinero: true }) : null,
    ].filter(Boolean),
    tendencia: serie('tendencia', 'porcentaje', false,
      [{ id: 'cumplimiento', nombre: 'Cumplimiento', tono: 'total' }, { id: 'rechazo', nombre: 'Rechazo', tono: 'otros' }],
      (i, j) => (j === 0 ? 90 + (i % 5) : 3 + (i % 4))),
    porReceta: Array.from({ length: 5 }, (_, i) => ({
      recetaId: `R${200 + i}`, receta: i === 0 ? LARGO : `RECETA ${i}`, area: AREAS[i % 3],
      obtenido: 100, vendible: 100 - i * 3, rechazado: i * 3, rechazoPct: i * 3, cumplimientoPct: 97 - i,
      ...(conDinero ? { costoReal: 1300 + i, costoPrevisto: 1250 } : {}),
    })),
    porArea: AREAS.map((area, i) => ({ area, rechazoPct: 4 + i, cumplimientoPct: 95 - i, medidas: i === 0 ? medidas : 0, producciones: i === 0 ? 25 : 0 })),
  };
}

function bodega({ conDinero }) {
  return {
    indicadores: [
      conDinero ? ind('valor_bodega', 'Valor de bodega', 12500000, 'pesos', { dinero: true }) : null,
      ind('cobertura_baja', 'Ingredientes con poca cobertura', 3, 'numero'),
    ].filter(Boolean),
    ...(conDinero ? {
      valor: serie('valor', 'pesos', true, [{ id: 'valor', nombre: 'Valor', tono: 'total' }], (i) => 12000000 + i * 10000),
      comprasVsConsumo: serie('comprasVsConsumo', 'pesos', true,
        [{ id: 'compras', nombre: 'Compras', tono: 'total' }, { id: 'consumo', nombre: 'Consumo', tono: 'otros' }], (i, j) => (j ? 400000 : i % 3 ? 0 : 1100000)),
      proveedores: [
        { id: 'p1', nombre: 'Distribuidora de Harinas y Cereales del Valle del Cauca S.A.S. (ejemplo)', valor: 9000000, formato: 'pesos', dinero: true },
        { id: 'p2', nombre: 'Sin proveedor', valor: 150000, formato: 'pesos', dinero: true },
      ],
      canasta: { indice: 4.2, comparados: 12, consumidos: 30, alzas: [{ ingrediente: 'HARINA DE TRIGO', antes: 3.2, despues: 3.9, variacion: 0.21875 }] },
    } : {}),
    cobertura: Array.from({ length: 14 }, (_, i) => ({
      ingrediente: i === 0 ? 'MANTEQUILLA SIN SAL EXTRA CREMOSA DE PRIMERA CALIDAD PARA LAMINAR' : `INGREDIENTE ${i}`,
      existenciaGr: 1500 * (i + 1), consumoDiarioGr: 900, dias: i < 12 ? (1.5 * (i + 1)) : null,
      proximoVencimiento: null, estado: i < 2 ? 'mal' : i < 4 ? 'atencion' : i < 12 ? 'bien' : 'sin_consumo',
    })),
    vencimientos: [
      { loteId: 'L007', ingrediente: 'CHOCOLATE 70%', vencimiento: '2026-09-19', dias: -2, existencia: 1200, unidad: 'GR', ...(conDinero ? { valor: 56000 } : {}) },
      { loteId: 'L010', ingrediente: 'CREMA DE LECHE', vencimiento: '2026-09-24', dias: 3, existencia: 4, unidad: 'UND', ...(conDinero ? { valor: 18000 } : {}) },
    ],
  };
}

function equipo({ conDinero }) {
  return {
    indicadores: [ind('personas_activas', 'Personas activas', 5, 'numero'), ind('tiempo_preparacion', 'Tiempo de preparación', 75, 'minutos')],
    personas: [
      { id: 'u1', nombre: PERSONA_LARGA, recetas: 40, tandas: 55.5, porArea: { 'PASTELERÍA': 40, 'GALLETAS': 15.5 }, ...(conDinero ? { costo: 2300000 } : {}) },
      { id: 'u2', nombre: 'Pedro (ejemplo)', recetas: 12, tandas: 18, porArea: { 'PANADERÍA': 18 }, ...(conDinero ? { costo: 800000 } : {}) },
      { id: null, nombre: 'Responsable sin cuenta', recetas: 1, tandas: 1, porArea: { 'PANADERÍA': 1 }, ...(conDinero ? { costo: 5000 } : {}) },
    ],
    tiempos: AREAS.map((area, i) => ({ area, mediana: 60 + i * 30, promedio: 70 + i * 30, n: i === 2 ? 0 : 5 + i })),
    notas: { abiertas: 3, hechas: 7, porTipo: { tarea: 4, pendiente: 2, recomendacion: 1, felicitacion: 3 } },
  };
}

/** Secciones con la forma del contrato pero sin nada. */
const VACIAS = {
  produccion: { indicadores: [], tandas: { ...serie('tandas', 'tandas', false, SERIES_AREAS, () => 0) }, calor: [], semana: [], recetas: [], pareto: { recetas: 0, top20: 0, porcentajeTop20: null }, planVsReal: [] },
  rendimiento: { indicadores: [], tendencia: { id: 'tendencia', series: [], puntos: [], grano: 'dia' }, porReceta: [], porArea: [] },
  bodega: { indicadores: [], cobertura: [], vencimientos: [] },
  equipo: { indicadores: [], personas: [], tiempos: [], notas: { abiertas: 0, hechas: 0, porTipo: { tarea: 0, pendiente: 0, recomendacion: 0, felicitacion: 0 } } },
};

const MODULOS = {
  produccion: ['pestana-produccion.js', 'renderPestanaProduccion'],
  rendimiento: ['pestana-rendimiento.js', 'renderPestanaRendimiento'],
  bodega: ['pestana-bodega.js', 'renderPestanaBodega'],
  equipo: ['pestana-equipo.js', 'renderPestanaEquipo'],
};

const secciones = (conDinero) => ({
  produccion: produccion({ conDinero }), rendimiento: rendimiento({ conDinero }),
  bodega: bodega({ conDinero }), equipo: equipo({ conDinero }),
});

/**
 * Monta una pestaña sola en la página, dentro del mismo contenedor que usa el
 * panel, y devuelve sus textos. Los errores de módulo salen como excepción.
 */
async function montar(page, clave, seccion, verCostos) {
  const [archivo, funcion] = MODULOS[clave];
  await page.evaluate(async ({ archivo, funcion, seccion, verCostos, rango }) => {
    const m = await import(`/src/views/resumen/${archivo}`);
    document.body.replaceChildren();
    const marco = document.createElement('main');
    marco.id = 'prueba-analisis';
    marco.style.padding = '16px';
    marco.append(m[funcion]({ seccion, verCostos, rango }));
    document.body.append(marco);
  }, { archivo, funcion, seccion, verCostos, rango: RANGO });
  return page.locator('#prueba-analisis > .analisis');
}

test.describe('pestañas de análisis, montadas solas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  for (const clave of Object.keys(MODULOS)) {
    test(`${clave}: con dinero muestra cifras en pesos y cada bloque tiene título`, async ({ page }) => {
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      const raiz = await montar(page, clave, secciones(true)[clave], true);
      await expect(raiz).toHaveAttribute('data-pestana', clave);
      await expect(raiz.locator('.kpi-fila')).toHaveCount(1);
      const bloques = raiz.locator('.analisis__bloque');
      expect(await bloques.count()).toBeGreaterThan(1);
      for (const titulo of await bloques.locator('.analisis__titulo').allTextContents()) expect(titulo.trim()).not.toBe('');
      expect(await raiz.textContent()).toMatch(DINERO);
      expect(errores).toEqual([]);
    });

    test(`${clave}: sin dinero no aparece ninguna cifra en pesos ni huecos`, async ({ page }) => {
      const raiz = await montar(page, clave, secciones(false)[clave], false);
      const texto = await raiz.textContent();
      expect(texto).not.toMatch(DINERO);
      expect(texto).not.toMatch(/oculto/i);
      // Ningún bloque vacío por falta de dinero: todos tienen algo más que el título.
      for (const b of await raiz.locator('.analisis__bloque').all()) {
        expect(await b.locator(':scope > :not(.analisis__titulo)').count()).toBeGreaterThan(0);
      }
    });

    test(`${clave}: vacía dice qué hacer, sin gráficas inventadas ni errores`, async ({ page }) => {
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      const raiz = await montar(page, clave, VACIAS[clave], true);
      await expect(raiz.locator('.analisis__vacio').first()).toBeVisible();
      await expect(raiz.locator('svg[role="img"]')).toHaveCount(0);
      await expect(raiz.locator('.analisis__tramo, .analisis__relleno')).toHaveCount(0);
      expect(errores).toEqual([]);
    });

    test(`${clave}: sección ausente o a medias no rompe la pestaña`, async ({ page }) => {
      const raiz = await montar(page, clave, {}, false);
      await expect(raiz).toBeVisible();
      await expect(raiz.locator('.analisis__vacio').first()).toBeVisible();
    });
  }

  test('producción: gasto en líneas con dinero, tandas apiladas sin él', async ({ page }) => {
    let raiz = await montar(page, 'produccion', produccion({ conDinero: true }), true);
    await expect(raiz.locator('[data-bloque="gasto"]')).toHaveCount(1);
    await expect(raiz.locator('[data-bloque="tandas"]')).toHaveCount(0);
    await expect(raiz.locator('[data-bloque="ranking"] .analisis__nota')).toHaveText('Ordenadas por gasto en materia prima.');
    await expect(raiz.locator('[data-bloque="ranking"] .graf-barras__resumen')).toContainText('20 %');
    await expect(raiz.getByRole('heading', { name: 'Todas las recetas del periodo' })).toBeVisible();
    await raiz.locator('[data-bloque="tabla"] summary').click();
    await expect(raiz.locator('[data-bloque="tabla"] thead th')).toHaveText(['Receta', 'Área', 'Tandas', 'Unidades', 'Costo', 'Costo por unidad']);

    raiz = await montar(page, 'produccion', produccion({ conDinero: false }), false);
    await expect(raiz.locator('[data-bloque="tandas"]')).toHaveCount(1);
    await expect(raiz.locator('[data-bloque="gasto"]')).toHaveCount(0);
    await expect(raiz.locator('[data-bloque="ranking"] .analisis__nota')).toHaveText('Ordenadas por tandas confirmadas.');
    await raiz.locator('[data-bloque="tabla"] summary').click();
    await expect(raiz.locator('[data-bloque="tabla"] thead th')).toHaveText(['Receta', 'Área', 'Tandas', 'Unidades']);
    // Plan contra lo confirmado: cifra escrita, meta nombrada y aviso en palabras.
    await expect(raiz.locator('[data-bloque="plan"]')).toContainText('Meta: al menos 90 %');
    await expect(raiz.locator('.analisis__avance-aviso')).toHaveCount(2);
  });

  test('producción: con verCostos pero sin el dato de dinero, no se inventa', async ({ page }) => {
    // Defensa: si el núcleo no manda el gasto, la pestaña cae a tandas.
    const raiz = await montar(page, 'produccion', produccion({ conDinero: false }), true);
    await expect(raiz.locator('[data-bloque="tandas"]')).toHaveCount(1);
    expect(await raiz.textContent()).not.toMatch(DINERO);
  });

  test('rendimiento: con pocas mediciones avisa con la cifra exacta', async ({ page }) => {
    let raiz = await montar(page, 'rendimiento', rendimiento({ conDinero: false, medidas: 6 }), false);
    const aviso = raiz.locator('[data-bloque="rend-aviso"]');
    await expect(aviso).toContainText('Solo 6 de 25 confirmaciones tienen resultado registrado.');
    await expect(aviso).toContainText('Registra el resultado real');
    // Dos gráficas de una serie cada una: nunca doble eje.
    await expect(raiz.locator('[data-bloque="rend-cumplimiento"]')).toHaveCount(1);
    await expect(raiz.locator('[data-bloque="rend-rechazo"]')).toHaveCount(1);

    raiz = await montar(page, 'rendimiento', rendimiento({ conDinero: false, medidas: 20 }), false);
    await expect(raiz.locator('[data-bloque="rend-aviso"]')).toHaveCount(0);
  });

  test('bodega: cobertura y vencimientos con estado en palabras, siempre', async ({ page }) => {
    const raiz = await montar(page, 'bodega', bodega({ conDinero: false }), false);
    await expect(raiz.locator('[data-bloque="bod-valor"], [data-bloque="bod-canasta"], [data-bloque="bod-proveedores"]')).toHaveCount(0);
    const filas = raiz.locator('[data-bloque="bod-cobertura"] .analisis__tabla tbody tr');
    await expect(filas).toHaveCount(10);
    await expect(filas.first()).toContainText('Bajo la meta');
    await expect(raiz.locator('[data-bloque="bod-vencimientos"]')).toContainText('Venció hace 2 días');
    await expect(raiz.locator('[data-bloque="bod-vencimientos"]')).toContainText('Vence en 3 días');
  });

  test('bodega: la canasta explica en una línea qué significa', async ({ page }) => {
    const raiz = await montar(page, 'bodega', bodega({ conDinero: true }), true);
    const canasta = raiz.locator('[data-bloque="bod-canasta"]');
    await expect(canasta.locator('.analisis__nota')).toContainText('Cuánto subió el precio de lo que usas');
    await expect(canasta.locator('.analisis__cifra-valor')).toHaveText('+4,2 %');
  });

  test('equipo: barras apiladas por persona con su desglose accesible', async ({ page }) => {
    const raiz = await montar(page, 'equipo', equipo({ conDinero: false }), false);
    const barra = raiz.getByRole('img', { name: `${PERSONA_LARGA}: Pastelería 40 tandas, Galletas 15,5 tandas` });
    await expect(barra).toBeVisible();
    await expect(barra.locator('.analisis__tramo')).toHaveCount(2);
    // Un área sin mediciones no aparece en tiempos (no es «0 min»).
    await expect(raiz.locator('[data-bloque="eq-tiempos"]')).not.toContainText('Galletas');
    await expect(raiz.locator('[data-bloque="eq-notas"]')).toContainText('Felicitaciones');
  });

  for (const [nombre, width] of [['movil', 390], ['tableta', 834], ['escritorio', 1440]]) {
    test(`las cuatro, con datos feos, sin desborde · ${nombre}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [clave, seccion] of Object.entries(secciones(true))) {
        const raiz = await montar(page, clave, seccion, true);
        expect(await desbordeHorizontal(page), `${clave} a ${width}px`).toBeLessThanOrEqual(0);
        await raiz.screenshot({ path: captura(testInfo, `solas-${clave}-${nombre}.png`), animations: 'disabled' });
      }
    });
  }
});

/* ------------------------------------------------------------------------- */
/*  Extremo a extremo                                                          */
/* ------------------------------------------------------------------------- */

const publicado = JSON.parse(readFileSync(new URL('../data/recipes.json', import.meta.url), 'utf8'));
const receta = publicado.recipes.find((r) => r.id === 'R016');
const lotes = consolidar([{ recipe: receta, factor: 1 }]).lineas.map((l, i) => ({
  id: `L${String(i + 1).padStart(3, '0')}`, ingrediente: l.ingrediente, unidad: l.unidad,
  equivalencias: { ML: 1, UND: 50 }, // Pesos ficticios, como en tablero.spec.js.
  pesoCompra: l.cantidad * 10, existencia: l.cantidad * 10, costoCompra: l.cantidad * 100,
  marca: 'QA', proveedor: 'QA Proveedor', presentacion: 'BOLSA', lote: `QA-${i}`, vencimiento: '2099-01-01',
  fechaCompra: hoyLocal(), registrado: new Date().toISOString(),
}));

const analisis = (page) => page.locator('.resumen-analisis__panel > .analisis');
const pestanaDe = (page, nombre) => page.getByRole('tab', { name: nombre, exact: true });

/** Programa y confirma el cheesecake de hoy desde la pantalla de producción. */
async function producirHoy(page) {
  await page.addInitScript((lista) => {
    if (!localStorage.getItem('zahavi_almacen_v1')) localStorage.setItem('zahavi_almacen_v1', JSON.stringify({ version: 1, lotes: lista }));
  }, lotes);
  await entrar(page, '#/plan');
  await page.getByRole('button', { name: 'Registrar producción', exact: true }).click();
  await page.locator('.dia .area-btn--pasteleria').click();
  await page.locator('#reg-buscar').fill(receta.nombre);
  await page.locator('.reg__anadir').first().click();
  await expect(page.locator('.reg__fila')).toHaveCount(1);
  await page.getByRole('button', { name: 'Volver al calendario' }).click();
  await page.getByRole('button', { name: 'Sacar producción', exact: true }).click();
  await page.getByRole('group', { name: 'Área' }).getByRole('button', { name: titleCase(receta.categoria) }).click();
  await page.getByRole('button', { name: 'Empezar a producir' }).click();
  await page.getByRole('button', { name: 'Marcar lista', exact: false }).click();
  await page.getByRole('button', { name: 'Sí, descontar de bodega' }).click();
  await expect(page.locator('.proy-detalle__lista')).toBeVisible();
  await page.getByRole('link', { name: 'Resumen', exact: true }).click();
  await expect(analisis(page)).toBeVisible();
}

test.describe('pestañas en el Resumen', () => {
  test('la producción confirmada aparece con su costo congelado en gasto y tabla', async ({ page }) => {
    await producirHoy(page);
    const { ejecuciones } = await page.evaluate(() => JSON.parse(localStorage.getItem('zahavi_almacen_v1')));
    const total = ejecuciones.reduce((s, e) => s + e.costeo.costoTotal, 0);
    expect(total).toBeGreaterThan(0);

    await pestanaDe(page, 'Producción').click();
    const raiz = analisis(page);
    await expect(raiz).toHaveAttribute('data-pestana', 'produccion');
    await expect(raiz.locator('.kpi[data-id="gasto"] .kpi__valor')).toHaveText(pesos(total));
    await expect(raiz.locator('[data-bloque="gasto"] figure')).toBeVisible();
    await expect(raiz.locator('[data-bloque="gasto"] .analisis__vacio')).toHaveCount(0);

    const tabla = raiz.locator('[data-bloque="tabla"]');
    await tabla.locator('summary').click();
    const fila = tabla.locator('tbody tr', { hasText: titleCase(receta.nombre) });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText(pesos(total));

    // El costo no se recalcula: aunque suba el precio de un lote, el gasto sigue igual.
    await page.evaluate(() => {
      const doc = JSON.parse(localStorage.getItem('zahavi_almacen_v1'));
      doc.lotes = doc.lotes.map((l) => ({ ...l, costoCompra: l.costoCompra * 10 }));
      localStorage.setItem('zahavi_almacen_v1', JSON.stringify(doc));
    });
    await page.reload();
    await pestanaDe(page, 'Producción').click();
    await expect(analisis(page).locator('.kpi[data-id="gasto"] .kpi__valor')).toHaveText(pesos(total));
  });

  test('el jefe de obrador ve las cuatro pestañas sin ninguna cifra de dinero', async ({ page, context }) => {
    const sim = await simularSupabase(context);
    sim.perfil.rol = 'obrador';
    await producirHoy(page);
    for (const nombre of ['Producción', 'Rendimiento y merma', 'Bodega y compras', 'Equipo']) {
      await pestanaDe(page, nombre).click();
      await expect(pestanaDe(page, nombre)).toHaveAttribute('aria-selected', 'true');
      await expect(analisis(page)).toBeVisible();
      expect(await analisis(page).textContent(), nombre).not.toMatch(DINERO);
    }
    await pestanaDe(page, 'Producción').click();
    await expect(analisis(page).locator('[data-bloque="tandas"] figure')).toBeVisible();
  });

  for (const [nombre, width, height] of [['escritorio', 1440, 1000], ['tableta', 834, 1112], ['movil', 390, 844]]) {
    test(`modo ejemplo: las cuatro pestañas con cifras y sin desbordes · ${nombre}`, async ({ page }, testInfo) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height });
      const errores = [];
      page.on('pageerror', (e) => errores.push(e.message));
      await entrar(page, '#/');
      await page.getByRole('button', { name: 'Ver con datos de ejemplo' }).click();
      await expect(page.getByRole('button', { name: 'Salir del ejemplo' })).toBeVisible({ timeout: 15000 });
      for (const [pestana, clave] of [['Producción', 'produccion'], ['Rendimiento y merma', 'rendimiento'], ['Bodega y compras', 'bodega'], ['Equipo', 'equipo']]) {
        await pestanaDe(page, pestana).click();
        const raiz = analisis(page);
        await expect(raiz).toHaveAttribute('data-pestana', clave);
        await expect(raiz.locator('.kpi').first()).toBeVisible();
        await expect(raiz.locator('figure.graf').first()).toBeVisible();
        expect(await desbordeHorizontal(page), `${pestana} a ${width}px`).toBeLessThanOrEqual(1);
        // La página desplaza dentro de su carcasa, así que ni la captura de página
        // completa ni la del elemento salen enteras: se alarga la ventana solo
        // para capturar y se devuelve a su alto.
        const alto = await raiz.evaluate((n) => Math.ceil(n.getBoundingClientRect().bottom + 40));
        await page.setViewportSize({ width, height: Math.max(height, alto) });
        await expect(async () => {
          await raiz.screenshot({ path: captura(testInfo, `analisis-${clave}-${nombre}.png`), animations: 'disabled' });
        }).toPass({ timeout: 10000 });
        await page.setViewportSize({ width, height });
      }
      expect(errores).toEqual([]);
    });
  }
});
