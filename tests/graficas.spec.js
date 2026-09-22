/**
 * Kit de graficas (BI-001, src/views/graficas/*).
 *
 * Cada componente se monta con datos de prueba DENTRO de la aplicacion
 * servida: asi carga las mismas hojas de estilo y los mismos modulos que el
 * panel, sin depender de que el nucleo BI ni las vistas del panel existan.
 * El banco sustituye el contenido del `body`; la aplicacion sigue viva debajo
 * pero pinta en un nodo que ya no esta en el documento.
 *
 * Se comprueba lo que la guia de visualizacion exige y lo que el contrato
 * promete: estructura accesible, tabla con las mismas cifras, tooltip con
 * puntero y teclado, leyenda, vacio sin linea inventada, formatos y que nada
 * desborde a 1440 ni a 390 px. Las capturas quedan en `test-results/graficas/`
 * para revisarlas a ojo.
 */

import { test, expect } from '@playwright/test';
import { desbordeHorizontal } from './apoyo.js';

const CAPTURAS = 'test-results/graficas';

/** Carga la aplicacion y deja el `body` con un banco vacio de ancho natural. */
async function abrirBanco(page) {
  // La aplicacion anima su primer pintado con una View Transition. Mientras
  // dura, el navegador entrega el puntero a la raiz de la transicion y no a
  // la pagina, y el banco sustituye el `body` en medio de ella, asi que no
  // terminaria nunca. El banco no la necesita: se desactiva antes de cargar.
  await page.addInitScript(() => { delete Document.prototype.startViewTransition; });
  await page.goto('/index.html');
  await page.waitForLoadState('load');
  await page.evaluate(() => {
    const banco = document.createElement('main');
    banco.id = 'banco';
    banco.style.cssText = 'display:grid;gap:32px;padding:16px;max-width:960px;margin:0 auto;background:var(--surface-card);';
    document.body.replaceChildren(banco);
  });
}

/**
 * Monta en el banco lo que devuelva `fabrica(m, datos)`, con los ocho modulos
 * del kit ya importados en `m`. La fabrica corre en el navegador.
 */
async function montar(page, fabrica, datos = null) {
  await page.evaluate(async () => {
    const nombres = ['comun', 'lineas', 'columnas', 'barras', 'calor', 'meta', 'chispa', 'tabla'];
    const m = {};
    for (const n of nombres) Object.assign(m, await import(`/src/views/graficas/${n}.js`));
    window.__kit = m;
    window.__montar = (nodos) => document.getElementById('banco').replaceChildren(...[].concat(nodos));
  });
  // La fabrica es codigo de ESTA prueba (nunca datos de fuera) y se evalua
  // por el protocolo del navegador, como cualquier `page.evaluate`: la
  // politica de contenido de la aplicacion prohibe `new Function` y asi debe
  // seguir.
  await page.evaluate(`window.__montar((${fabrica.toString()})(window.__kit, ${JSON.stringify(datos)}))`);
}

// -----------------------------------------------------------------------------
//  Datos de prueba (se construyen en Node y viajan como JSON)
// -----------------------------------------------------------------------------

function fecha(inicio, dias) {
  const f = new Date(`${inicio}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** 30 dias de gasto por area, con domingos vacios y un total. */
function serieGasto({ ceros = false, conNulo = false } = {}) {
  const puntos = [];
  for (let i = 0; i < 30; i++) {
    const d = fecha('2026-08-24', i);
    const domingo = new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
    const base = ceros || domingo ? 0 : 1;
    const p = Math.round(base * (180000 + 40000 * Math.sin(i / 3)));
    const n = Math.round(base * (260000 + 90000 * Math.cos(i / 4)));
    const g = Math.round(base * (90000 + 30000 * Math.sin(i / 2)));
    puntos.push({ desde: d, hasta: d, valores: { total: p + n + g, pasteleria: p, panaderia: n, galletas: g } });
  }
  if (conNulo) for (const k of [10, 11]) for (const id of ['total', 'pasteleria', 'panaderia', 'galletas']) puntos[k].valores[id] = null;
  return {
    id: 'gasto', nombre: 'Gasto', formato: 'pesos', dinero: true, grano: 'dia',
    series: [
      { id: 'total', nombre: 'Total', tono: 'total' },
      { id: 'pasteleria', nombre: 'Pastelería', tono: 'pasteleria' },
      { id: 'panaderia', nombre: 'Panadería', tono: 'panaderia' },
      { id: 'galletas', nombre: 'Galletas', tono: 'galletas' },
    ],
    puntos,
    meta: { valor: 700000, nombre: 'Tope diario' },
  };
}

function serieAnterior() {
  const puntos = [];
  for (let i = 0; i < 30; i++) {
    const d = fecha('2026-07-25', i);
    puntos.push({ desde: d, hasta: d, valores: { total: 420000 + 60000 * Math.cos(i / 2) } });
  }
  return { id: 'gasto-ant', nombre: 'Gasto anterior', formato: 'pesos', dinero: true, grano: 'dia', series: [{ id: 'total', nombre: 'Total', tono: 'comparacion' }], puntos, meta: null };
}

function serieTandas() {
  const s = serieGasto();
  return {
    ...s, id: 'tandas', formato: 'tandas', dinero: false, meta: null,
    puntos: s.puntos.map((p) => ({ ...p, valores: Object.fromEntries(Object.entries(p.valores).map(([k, v]) => [k, Math.round(v / 40000)])) })),
  };
}

const RECETAS = [
  ['Pan brioche', 820000, 'PANADERÍA'], ['Torta de chocolate', 610000, 'PASTELERÍA'], ['Croissant de mantequilla', 540000, 'PANADERÍA'],
  ['Galleta de avena y uvas pasas', 300000, 'GALLETAS'], ['Cheesecake de frutos rojos', 260000, 'PASTELERÍA'], ['Almojábana', 150000, 'PANADERÍA'],
  ['Galleta de chips', 120000, 'GALLETAS'], ['Brownie', 90000, 'PASTELERÍA'], ['Pan campesino', 60000, 'PANADERÍA'],
  ['Madeleine', 40000, 'PASTELERÍA'], ['Galleta de jengibre', 25000, 'GALLETAS'], ['Pan de bono', 10000, 'PANADERÍA'],
];

function filasRanking() {
  const tono = { 'PASTELERÍA': 'pasteleria', 'PANADERÍA': 'panaderia', GALLETAS: 'galletas' };
  return RECETAS.map(([nombre, valor, area], i) => ({ id: `R${i}`, nombre, valor, formato: 'pesos', detalle: `${3 + i} tandas`, tono: tono[area], dinero: true }));
}

function diasCalor() {
  const dias = [];
  for (let i = 0; i < 84; i++) {
    const d = fecha('2026-06-29', i); // lunes
    const dow = i % 7;
    const valor = dow === 6 ? 0 : [6, 7, 8, 7, 12, 14][dow] + (i % 3);
    dias.push({ fecha: d, valor, detalle: `${valor} tandas` });
  }
  return dias;
}

// -----------------------------------------------------------------------------
//  Formatos
// -----------------------------------------------------------------------------

test('formatear, formatearVariacion y rotuloCubeta escriben como se lee en el obrador', async ({ page }) => {
  await abrirBanco(page);
  const r = await page.evaluate(async () => {
    const m = await import('/src/views/graficas/comun.js');
    const f = m.formatear;
    return {
      pesos: f(1234567, 'pesos'), pesosCorto: f(1234567, 'pesos', { corto: true }), milCorto: f(450000, 'pesos', { corto: true }),
      pesosNeg: f(-1500, 'pesos'), pesosPequeno: f(950, 'pesos', { corto: true }),
      pct: f(12.5, 'porcentaje'), dias: f(3.5, 'dias'), undia: f(1, 'dias'), diasCorto: f(3.5, 'dias', { corto: true }),
      kg: f(12.44, 'kg'), min: f(80, 'minutos'), minCorto: f(80, 'minutos', { corto: true }), min45: f(45, 'minutos'), min120: f(120, 'minutos'),
      tandas: f(12.5, 'tandas'), unaTanda: f(1, 'tandas'), und: f(240, 'unidades'), num: f(1234, 'numero'), numCorto: f(12345, 'numero', { corto: true }),
      nulo: f(null, 'pesos'), nan: f(NaN, 'numero'),
      varMas: m.formatearVariacion(0.12), varMenos: m.formatearVariacion(-0.031), varCero: m.formatearVariacion(0), varNulo: m.formatearVariacion(null), varChica: m.formatearVariacion(0.004),
      dia: m.rotuloCubeta({ desde: '2026-09-21', hasta: '2026-09-21' }, 'dia'),
      diaLargo: m.rotuloCubeta({ desde: '2026-09-21', hasta: '2026-09-21' }, 'dia', { largo: true }),
      semana: m.rotuloCubeta({ desde: '2026-09-15', hasta: '2026-09-21' }, 'semana', { largo: true }),
      semanaCruza: m.rotuloCubeta({ desde: '2026-09-28', hasta: '2026-10-04' }, 'semana', { largo: true }),
      semanaCorta: m.rotuloCubeta({ desde: '2026-09-15', hasta: '2026-09-21' }, 'semana'),
      mes: m.rotuloCubeta({ desde: '2026-09-01', hasta: '2026-09-30' }, 'mes'),
      mesLargo: m.rotuloCubeta({ desde: '2026-09-01', hasta: '2026-09-30' }, 'mes', { largo: true }),
      techo: [m.techoRedondo(0), m.techoRedondo(7), m.techoRedondo(1234567), m.techoRedondo(200), m.techoRedondo(2300)],
      tonos: [m.tonoDeArea('PASTELERÍA'), m.tonoDeArea('Panadería'), m.tonoDeArea('GALLETAS'), m.tonoDeArea('OTRA')],
    };
  });
  const miles = (s) => s.replace(/\s/g, ' ');
  expect(miles(r.pesos)).toBe('$1.234.567');
  expect(r.pesosCorto).toBe('$1,2 M');
  expect(r.milCorto).toBe('$450 mil');
  expect(miles(r.pesosNeg)).toBe('−$1.500');
  expect(r.pesosPequeno).toBe('$950');
  expect(r.pct).toBe('12,5 %');
  expect(r.dias).toBe('3,5 días');
  expect(r.undia).toBe('1 día');
  expect(r.diasCorto).toBe('3,5 d');
  expect(r.kg).toBe('12,4 kg');
  expect(r.min).toBe('1 h 20 min');
  expect(r.minCorto).toBe('1 h 20');
  expect(r.min45).toBe('45 min');
  expect(r.min120).toBe('2 h');
  expect(r.tandas).toBe('12,5 tandas');
  expect(r.unaTanda).toBe('1 tanda');
  expect(r.und).toBe('240 und');
  expect(miles(r.num)).toBe('1.234');
  expect(r.numCorto).toBe('12 mil');
  expect(r.nulo).toBe('—');
  expect(r.nan).toBe('—');
  expect(r.varMas).toBe('+12 %');
  expect(r.varMenos).toBe('−3 %');
  expect(r.varCero).toBe('0 %');
  expect(r.varNulo).toBe('—');
  expect(r.varChica).toBe('+0,4 %');
  expect(r.dia).toBe('lun 21 sep');
  expect(r.diaLargo).toBe('lunes 21 sep 2026');
  expect(r.semana).toBe('Semana del 15 al 21 sep 2026');
  expect(r.semanaCruza).toBe('Semana del 28 sep al 4 oct 2026');
  expect(r.semanaCorta).toBe('15 sep');
  expect(r.mes).toBe('sep 2026');
  expect(r.mesLargo).toBe('septiembre 2026');
  expect(r.techo).toEqual([1, 10, 2000000, 200, 2500]);
  expect(r.tonos).toEqual(['pasteleria', 'panaderia', 'galletas', 'otros']);
});

// -----------------------------------------------------------------------------
//  Lineas
// -----------------------------------------------------------------------------

test('lineas: figura accesible, leyenda, comparacion punteada y tabla con las mismas cifras', async ({ page }) => {
  await abrirBanco(page);
  const serie = serieGasto();
  await montar(page, (m, d) => m.graficaLineas({ titulo: 'Gasto por área', serie: d.serie, comparacion: d.anterior }), { serie, anterior: serieAnterior() });

  const fig = page.locator('#banco figure.graf');
  await expect(fig.locator('figcaption')).toContainText('Gasto por área');
  const dibujo = fig.locator('svg[role="img"]');
  await expect(dibujo).toHaveAttribute('aria-label', /Gasto por área\. Líneas de 30 días/);
  await expect(dibujo).toHaveAttribute('aria-label', /periodo anterior/);

  // Leyenda: cuatro series y el periodo anterior, con muestra punteada.
  const leyenda = fig.locator('.graf__leyenda li');
  await expect(leyenda).toHaveCount(5);
  await expect(leyenda.last()).toContainText('Periodo anterior');
  await expect(fig.locator('.graf__leyenda [data-forma="punteada"]')).toHaveCount(1);
  await expect(fig.locator('path.graf__linea--comparacion')).toHaveCount(1);
  await expect(fig.locator('path.graf__linea:not(.graf__linea--comparacion)')).toHaveCount(4);
  // Rotulo directo al final de cada linea (<= 4 series) o ninguno si se montan.
  const rotulos = await fig.locator('.graf__rotulo-final').count();
  expect([0, 4]).toContain(rotulos);
  // Meta dibujada como umbral.
  await expect(fig.locator('.graf__meta')).toHaveCount(1);

  // Tabla: una fila por dia, lo mas reciente arriba, con las mismas cifras.
  await fig.locator('summary', { hasText: 'Ver los datos en tabla' }).click();
  const filas = fig.locator('tbody tr');
  await expect(filas).toHaveCount(30);
  const ultimo = serie.puntos[29];
  const esperado = await page.evaluate(async (v) => {
    const m = await import('/src/views/graficas/comun.js');
    return [m.rotuloCubeta(v, 'dia', { largo: true }), m.formatear(v.valores.total, 'pesos'), m.formatear(v.valores.galletas, 'pesos')];
  }, ultimo);
  await expect(filas.first().locator('th')).toHaveText(esperado[0]);
  await expect(filas.first().locator('td').nth(0)).toHaveText(esperado[1]);
  await expect(filas.first().locator('td').nth(3)).toHaveText(esperado[2]);
});

test('lineas: tooltip al pasar el puntero y al recorrer con el teclado', async ({ page }) => {
  await abrirBanco(page);
  const serie = serieGasto();
  await montar(page, (m, d) => m.graficaLineas({ titulo: 'Gasto por área', serie: d.serie, comparacion: d.anterior }), { serie, anterior: serieAnterior() });
  const dibujo = page.locator('#banco svg.graf__svg');
  const tooltip = page.locator('#banco .graf__tooltip');
  await expect(tooltip).toBeHidden();

  const caja = await dibujo.boundingBox();
  await page.mouse.move(caja.x + caja.width * 0.5, caja.y + caja.height * 0.5);
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('.graf__tooltip-fila')).toHaveCount(5);
  await expect(tooltip).toContainText('Total');
  await expect(tooltip).toContainText('Periodo anterior');
  await expect(page.locator('#banco .graf__cruz')).toHaveAttribute('visibility', 'visible');
  // El tooltip no se sale de la grafica.
  const t = await tooltip.boundingBox();
  const lienzo = await page.locator('#banco .graf__lienzo').boundingBox();
  expect(t.x).toBeGreaterThanOrEqual(lienzo.x - 1);
  expect(t.x + t.width).toBeLessThanOrEqual(lienzo.x + lienzo.width + 1);
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();

  // Teclado: el foco muestra el ultimo dia; Inicio lleva al primero y el aviso
  // oculto lo dice al lector de pantalla.
  await dibujo.focus();
  await expect(tooltip).toBeVisible();
  const titulos = await page.evaluate(async (s) => {
    const m = await import('/src/views/graficas/comun.js');
    return [m.rotuloCubeta(s.puntos[29], 'dia', { largo: true }), m.rotuloCubeta(s.puntos[0], 'dia', { largo: true }), m.rotuloCubeta(s.puntos[1], 'dia', { largo: true })];
  }, serie);
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText(titulos[0]);
  await page.keyboard.press('Home');
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText(titulos[1]);
  await page.keyboard.press('ArrowRight');
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText(titulos[2]);
  await expect(page.locator('#banco .graf__lienzo [aria-live="polite"]')).toContainText(titulos[2]);
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
});

test('lineas: sin datos o todo en cero no dibuja una linea inventada', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m, d) => [
    m.graficaLineas({ titulo: 'Todo en cero', serie: d.ceros }),
    m.graficaLineas({ titulo: 'Sin puntos', serie: { ...d.ceros, puntos: [] } }),
    m.graficaLineas({ titulo: 'Sin serie', serie: null }),
  ], { ceros: serieGasto({ ceros: true }) });
  const figuras = page.locator('#banco figure.graf');
  await expect(figuras).toHaveCount(3);
  await expect(page.locator('#banco .graf__vacio')).toHaveCount(3);
  await expect(page.locator('#banco svg')).toHaveCount(0);
  await expect(figuras.first().locator('.graf__vacio')).toContainText('Sin datos para mostrar');
});

test('lineas: un valor nulo corta la linea en vez de unir el hueco', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m, d) => m.graficaLineas({ titulo: 'Con hueco', serie: d.serie }), { serie: serieGasto({ conNulo: true }) });
  const d = await page.locator('#banco path.graf__linea[data-tono="total"]').getAttribute('d');
  expect((d.match(/M/g) || []).length).toBe(2);
  await page.locator('#banco summary').click();
  // En la tabla el dia sin dato dice «—», no 0.
  await expect(page.locator('#banco tbody tr').nth(29 - 10).locator('td').first()).toHaveText('—');
});

// -----------------------------------------------------------------------------
//  Columnas
// -----------------------------------------------------------------------------

test('columnas apiladas: no apila el total, tooltip con total y tabla', async ({ page }) => {
  await abrirBanco(page);
  const serie = serieTandas();
  await montar(page, (m, d) => [
    m.graficaColumnas({ titulo: 'Tandas por área', serie: d.serie }),
    m.graficaColumnas({ titulo: 'Tandas agrupadas', serie: { ...d.serie, series: d.serie.series.slice(1), puntos: d.serie.puntos.slice(0, 7) }, apiladas: false }),
  ], { serie });
  const apiladas = page.locator('#banco figure.graf').first();
  await expect(apiladas.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Columnas apiladas de 30 días/);
  await expect(apiladas.locator('.graf__leyenda li')).toHaveCount(3);
  await expect(apiladas.locator('path.graf__columna[data-tono="total"]')).toHaveCount(0);
  // Solo un rotulo de valor: la columna mas alta.
  await expect(apiladas.locator('.graf__rotulo-valor')).toHaveCount(1);

  const dibujo = apiladas.locator('svg.graf__svg');
  const caja = await dibujo.boundingBox();
  await page.mouse.move(caja.x + caja.width * 0.4, caja.y + caja.height * 0.6);
  const tooltip = apiladas.locator('.graf__tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Total');
  await expect(apiladas.locator('.graf__banda--activa')).toHaveCount(1);

  await apiladas.locator('summary').click();
  await expect(apiladas.locator('thead th')).toHaveText(['Día', 'Pastelería', 'Panadería', 'Galletas', 'Total']);
  await expect(apiladas.locator('tbody tr')).toHaveCount(30);

  const agrupadas = page.locator('#banco figure.graf').nth(1);
  await expect(agrupadas.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Columnas agrupadas de 7 días/);
});

// -----------------------------------------------------------------------------
//  Barras
// -----------------------------------------------------------------------------

test('barras: ranking con Pareto, maximo de filas y tabla completa', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m, d) => m.graficaBarras({ titulo: 'Recetas que más gastan', filas: d.filas, formato: 'pesos', pareto: true, nombreColumna: 'Receta', medida: 'del gasto' }), { filas: filasRanking() });
  const fig = page.locator('#banco figure.graf');
  await expect(fig.locator('.graf-barras__fila')).toHaveCount(10);
  await expect(fig.locator('.graf__nota')).toContainText('Se muestran 10 de 12');
  await expect(fig.locator('.graf-barras__resumen')).toContainText('explican el');
  // Total 3.025 mil. Acumulado: 820+610+540+300 = 2.270 (75 %); +260 = 2.530 (83,6 %) → corte en la 5.ª.
  await expect(fig.locator('.graf-barras__fila').nth(4)).toHaveAttribute('data-corte', 'true');
  await expect(fig.locator('.graf-barras__marca')).toHaveText('Hasta aquí, el 83,6 % del gasto con 5 de 12.');
  // 20 % de 12 = 3 recetas: 820+610+540 = 1.970 de 3.025 = 65,1 %.
  await expect(fig.locator('.graf-barras__resumen')).toHaveText('Las 3 primeras de 12 (el 20 %) explican el 65,1 % del gasto.');
  await expect(fig.locator('.graf-barras__fila').first().locator('.graf-barras__valor')).toHaveText(/\$820\.000/);
  // Leyenda por area (las filas traen tono).
  await expect(fig.locator('.graf__leyenda li')).toHaveCount(3);
  // La barra mas larga es la primera y ocupa toda la pista.
  const anchoPrimera = await fig.locator('.graf-barras__barra').first().evaluate((b) => b.style.width);
  expect(parseFloat(anchoPrimera)).toBeCloseTo(100, 5);
  await fig.locator('summary').click();
  await expect(fig.locator('tbody tr')).toHaveCount(12);
  await expect(fig.locator('thead th').first()).toHaveText('Receta');
});

test('barras: vacio y una sola serie sin tono usan un solo color', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m, d) => [
    m.graficaBarras({ titulo: 'Vacío', filas: [], formato: 'numero' }),
    m.graficaBarras({ titulo: 'Proveedores', filas: d.filas.map(({ tono, ...f }) => f), formato: 'pesos' }),
  ], { filas: filasRanking().slice(0, 4) });
  await expect(page.locator('#banco figure').first().locator('.graf__vacio')).toBeVisible();
  const segunda = page.locator('#banco figure').nth(1);
  await expect(segunda.locator('.graf__leyenda')).toHaveCount(0);
  await expect(segunda.locator('.graf-barras__barra[data-tono="uno"]')).toHaveCount(4);
});

// -----------------------------------------------------------------------------
//  Mapa de calor
// -----------------------------------------------------------------------------

test('mapa de calor: un cuadro por dia, escala, tooltip y flechas de calendario', async ({ page }) => {
  await abrirBanco(page);
  const dias = diasCalor();
  await montar(page, (m, d) => m.mapaDeCalor({ titulo: 'Tandas por día', dias: d.dias, formato: 'tandas' }), { dias });
  const fig = page.locator('#banco figure.graf');
  await expect(fig.locator('rect.graf-calor__celda')).toHaveCount(84);
  await expect(fig.locator('svg[role="img"]')).toHaveAttribute('aria-label', /Calendario de 12 semanas/);
  await expect(fig.locator('rect.graf-calor__celda[data-nivel="0"]')).toHaveCount(12); // los domingos
  await expect(fig.locator('.graf-calor__escala')).toContainText('Menos');

  const celda = fig.locator('rect.graf-calor__celda').nth(5); // sabado de la primera semana
  await celda.hover();
  const tooltip = fig.locator('.graf__tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText('sábado 4 jul 2026');

  const dibujo = fig.locator('svg.graf__svg');
  await dibujo.focus();
  await page.keyboard.press('Home');
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText('lunes 29 jun 2026');
  await page.keyboard.press('ArrowRight');
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText('lunes 6 jul 2026');
  await page.keyboard.press('ArrowDown');
  await expect(tooltip.locator('.graf__tooltip-titulo')).toHaveText('martes 7 jul 2026');
  await expect(fig.locator('.graf-calor__celda--activa')).toHaveCount(1);

  await fig.locator('summary').click();
  await expect(fig.locator('tbody tr')).toHaveCount(84);
});

// -----------------------------------------------------------------------------
//  Meta, chispa y tabla
// -----------------------------------------------------------------------------

test('barra de meta: estado con icono y palabra, marca de la meta y sin datos', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m) => [
    m.barraDeMeta({ valor: 82, meta: 90, formato: 'porcentaje', sentido: 'subir', estado: 'mal' }),
    m.barraDeMeta({ valor: 3200000, meta: 5000000, formato: 'pesos', sentido: 'bajar', estado: 'bien' }),
    m.barraDeMeta({ valor: null, meta: 5, formato: 'porcentaje', sentido: 'bajar', estado: 'sin_datos' }),
    m.barraDeMeta({ valor: 4, meta: null, formato: 'dias', sentido: 'subir', estado: 'sin_meta' }),
  ]);
  const barras = page.locator('#banco .graf-meta');
  await expect(barras).toHaveCount(4);
  await expect(barras.nth(0)).toHaveAttribute('data-estado', 'mal');
  await expect(barras.nth(0).locator('.graf-estado')).toHaveText(/Mal/);
  await expect(barras.nth(0).locator('.graf-estado__icono')).toHaveText('✕');
  await expect(barras.nth(0)).toContainText('82 % · meta ≥ 90 %');
  expect(parseFloat(await barras.nth(0).locator('.graf-meta__relleno').evaluate((e) => e.style.width))).toBeCloseTo(82, 5);
  expect(parseFloat(await barras.nth(0).locator('.graf-meta__marca').evaluate((e) => e.style.left))).toBeCloseTo(90, 5);
  await expect(barras.nth(1).locator('.graf-estado')).toHaveText(/Bien/);
  await expect(barras.nth(1)).toContainText('meta ≤');
  await expect(barras.nth(2).locator('.graf-estado')).toHaveText(/Sin datos/);
  await expect(barras.nth(3).locator('.graf-estado')).toHaveText(/Sin meta/);
  await expect(barras.nth(3).locator('.graf-meta__marca')).toHaveCount(0);
});

test('chispa: decorativa, corta en nulos y vacia con menos de dos valores', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m) => [
    m.chispa({ valores: [3, 5, 4, null, 6, 8, 7], formato: 'numero', nombre: 'Tandas' }),
    m.chispa({ valores: [5], formato: 'numero' }),
    m.chispa({ valores: [2, 2, 2], formato: 'numero' }),
  ]);
  const chispas = page.locator('#banco svg.graf-chispa');
  await expect(chispas).toHaveCount(3);
  await expect(chispas.first()).toHaveAttribute('aria-hidden', 'true');
  const d = await chispas.first().locator('path').getAttribute('d');
  expect((d.match(/M/g) || []).length).toBe(2);
  await expect(chispas.nth(1)).toHaveClass(/graf-chispa--vacia/);
  await expect(chispas.nth(1).locator('path')).toHaveCount(0);
  await expect(chispas.nth(2).locator('path')).toHaveCount(1);
});

test('tabla de datos: plegada, cabecera de fila, formatos y alineacion', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m) => m.tablaDeDatos({
    titulo: 'Personas',
    columnas: [{ id: 'nombre', nombre: 'Persona' }, { id: 'tandas', nombre: 'Tandas', formato: 'tandas' }, { id: 'costo', nombre: 'Costo', formato: 'pesos' }],
    filas: [{ nombre: 'Ana (ejemplo)', tandas: 12.5, costo: 1234567 }, { nombre: '<b>no es HTML</b>', tandas: null, costo: 0 }],
  }));
  const detalles = page.locator('#banco details.graf__datos');
  await expect(detalles).not.toHaveAttribute('open', '');
  await expect(detalles.locator('summary')).toHaveText('Ver los datos en tabla');
  await detalles.locator('summary').click();
  await expect(detalles.locator('caption')).toHaveText('Personas');
  await expect(detalles.locator('tbody tr').first().locator('th')).toHaveAttribute('scope', 'row');
  await expect(detalles.locator('tbody tr').first().locator('td').first()).toHaveText('12,5 tandas');
  await expect(detalles.locator('tbody tr').first().locator('td').first()).toHaveAttribute('data-alinear', 'derecha');
  // El texto no confiable queda como texto.
  await expect(detalles.locator('tbody tr').nth(1).locator('th')).toHaveText('<b>no es HTML</b>');
  await expect(detalles.locator('b')).toHaveCount(0);
  await expect(detalles.locator('tbody tr').nth(1).locator('td').first()).toHaveText('—');
  // El resumen es un objetivo tactil de al menos 44 px.
  const alto = (await detalles.locator('summary').boundingBox()).height;
  expect(alto).toBeGreaterThanOrEqual(44);
});

// -----------------------------------------------------------------------------
//  Todo junto: sin desborde y capturas para revisar
// -----------------------------------------------------------------------------

function fabricaCompleta(m, d) {
  return [
    m.graficaLineas({ titulo: 'Gasto por área', subtitulo: 'Materia prima confirmada · COP', serie: d.serie, comparacion: d.anterior }),
    m.graficaLineas({ titulo: 'Rendimiento', serie: { ...d.serie, formato: 'porcentaje', meta: { valor: 95, nombre: 'Meta' }, series: [d.serie.series[0]], puntos: d.serie.puntos.map((p, i) => ({ ...p, valores: { total: 90 + (i % 7) } })) } }),
    m.graficaColumnas({ titulo: 'Tandas por área', serie: d.tandas }),
    m.graficaBarras({ titulo: 'Recetas que más gastan', filas: d.filas, formato: 'pesos', pareto: true }),
    m.mapaDeCalor({ titulo: 'Tandas por día', dias: d.dias, formato: 'tandas' }),
    m.barraDeMeta({ valor: 82, meta: 90, formato: 'porcentaje', sentido: 'subir', estado: 'atencion' }),
    m.chispa({ valores: [3, 5, 4, 6, 8, 7], formato: 'numero' }),
  ];
}

for (const { ancho, alto, nombre } of [{ ancho: 1440, alto: 900, nombre: 'escritorio' }, { ancho: 390, alto: 844, nombre: 'telefono' }]) {
  test(`sin desborde horizontal a ${ancho} px, con tooltips abiertos (${nombre})`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await abrirBanco(page);
    await montar(page, fabricaCompleta, { serie: serieGasto(), anterior: serieAnterior(), tandas: serieTandas(), filas: filasRanking(), dias: diasCalor() });
    for (const s of await page.locator('#banco summary').all()) await s.click();
    expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);

    // El lienzo mide lo que su caja (una unidad por pixel); en telefono, sin
    // nombres al final de las lineas.
    for (const fig of await page.locator('#banco figure.graf--lineas, #banco figure.graf--columnas').all()) {
      const [vb, caja] = await fig.locator('.graf__lienzo').evaluate((l) => [l.querySelector('svg').viewBox.baseVal.width, l.clientWidth]);
      expect(Math.abs(vb - caja)).toBeLessThanOrEqual(2);
    }
    if (ancho <= 600) await expect(page.locator('#banco .graf__rotulo-final')).toHaveCount(0);

    // Tooltip en el borde derecho de cada grafica: tampoco ensancha la pagina.
    for (const dibujo of await page.locator('#banco svg.graf__svg').all()) {
      const caja = await dibujo.boundingBox();
      await page.mouse.move(caja.x + caja.width - 4, caja.y + caja.height * 0.5);
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
      await page.mouse.move(caja.x + 60, caja.y + caja.height * 0.5);
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
    }
    for (const s of await page.locator('#banco summary').all()) await s.click(); // plegar para la captura
    await page.evaluate(() => window.scrollTo(0, 0));
    const primera = page.locator('#banco svg.graf__svg').first();
    const caja = await primera.boundingBox();
    await page.screenshot({ path: `${CAPTURAS}/kit-${nombre}.png`, fullPage: true });
    // Y el tooltip abierto, para revisar su lectura y que no tape ni se corte.
    await page.mouse.move(caja.x + caja.width * 0.62, caja.y + caja.height * 0.5);
    await expect(page.locator('#banco .graf__tooltip').first()).toBeVisible();
    await page.screenshot({ path: `${CAPTURAS}/tooltip-${nombre}.png`, clip: { x: 0, y: Math.max(0, caja.y - 60), width: ancho, height: caja.height + 120 } });
  });
}

// -----------------------------------------------------------------------------
//  Hallazgos de integracion: caja estrecha, rotulos que se montan, redibujo
// -----------------------------------------------------------------------------

test('en una columna estrecha del escritorio el lienzo sigue a su caja, no a la ventana', async ({ page }) => {
  await abrirBanco(page);
  await page.evaluate(() => { document.getElementById('banco').style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))'; });
  await montar(page, (m, d) => [
    m.graficaLineas({ titulo: 'Gasto', serie: d.serie }),
    m.graficaColumnas({ titulo: 'Tandas', serie: d.tandas }),
    m.mapaDeCalor({ titulo: 'Calor', dias: d.dias, formato: 'tandas' }),
  ], { serie: serieGasto(), tandas: serieTandas(), dias: diasCalor() });
  for (const lienzo of await page.locator('#banco .graf__lienzo').all()) {
    const { vb, caja, texto } = await lienzo.evaluate((l) => {
      const s = l.querySelector('svg');
      const t = s.querySelector('.graf__eje').getBoundingClientRect();
      return { vb: s.viewBox.baseVal.width, caja: l.clientWidth, texto: t.height };
    });
    expect(caja).toBeLessThan(330);
    expect(vb).toBeLessThanOrEqual(caja + 2);
    // El rotulo del eje se ve a su tamano (11 px), no encogido por la escala.
    expect(texto).toBeGreaterThanOrEqual(10);
  }
  // Caja estrecha: sin nombres al final de las lineas; la leyenda los dice.
  await expect(page.locator('#banco .graf__rotulo-final')).toHaveCount(0);
  await expect(page.locator('#banco figure.graf--lineas .graf__leyenda li')).toHaveCount(4);
});

test('los nombres al final de las lineas nunca se montan entre si', async ({ page }) => {
  await abrirBanco(page);
  // Dos casos: finales separados (se rotulan) y finales casi iguales (se
  // quitan: la leyenda dice quien es quien).
  const separados = serieGasto();
  const juntos = serieGasto();
  const ultimo = juntos.puntos[29].valores;
  ultimo.pasteleria = 200000; ultimo.panaderia = 201000; ultimo.galletas = 199000;
  await montar(page, (m, d) => [
    m.graficaLineas({ titulo: 'Separados', serie: { ...d.separados, series: d.separados.series.slice(1) } }),
    m.graficaLineas({ titulo: 'Juntos', serie: { ...d.juntos, series: d.juntos.series.slice(1) } }),
  ], { separados, juntos });
  for (const fig of await page.locator('#banco figure.graf').all()) {
    const cajas = await fig.locator('.graf__rotulo-final').evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect().toJSON()));
    for (let i = 0; i < cajas.length; i++) {
      for (let j = i + 1; j < cajas.length; j++) {
        const a = cajas[i]; const b = cajas[j];
        const cruzan = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(cruzan, 'dos nombres al final de linea se montan').toBe(false);
      }
    }
  }
  await expect(page.locator('#banco figure.graf').first().locator('.graf__rotulo-final')).toHaveCount(3);
  await expect(page.locator('#banco figure.graf').nth(1).locator('.graf__rotulo-final')).toHaveCount(0);
});

test('al cambiar el ancho de la caja se redibuja y el foco sigue en el mismo dato', async ({ page }) => {
  await abrirBanco(page);
  await montar(page, (m, d) => m.graficaLineas({ titulo: 'Gasto', serie: d.serie }), { serie: serieGasto() });
  const ancho = () => page.locator('#banco svg.graf__svg').evaluate((s) => s.viewBox.baseVal.width);
  const antes = await ancho();
  await page.locator('#banco svg.graf__svg').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const titulo = await page.locator('#banco .graf__tooltip-titulo').textContent();
  await page.evaluate(() => { document.getElementById('banco').style.maxWidth = '420px'; });
  await expect.poll(ancho).toBeLessThan(antes - 100);
  await expect(page.locator('#banco svg.graf__svg')).toBeFocused();
  await expect(page.locator('#banco .graf__tooltip')).toBeVisible();
  await expect(page.locator('#banco .graf__tooltip-titulo')).toHaveText(titulo);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#banco .graf__tooltip-titulo')).not.toHaveText(titulo);
});
