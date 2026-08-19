/**
 * EL CAMINO DE TODOS LOS DIAS
 *
 * Entrar, encontrar la receta, leerla y escalar la tanda. Si algo de esto se
 * rompe, el recetario no sirve para lo unico que se le pide.
 *
 * Cubre los puntos 1 a 16, 20, 21, 24, 24a, 34a a 34j y 45 de QA.md.
 */

import { test, expect } from '@playwright/test';
import { entrar, CLAVE, RECETA, desbordeHorizontal } from './apoyo.js';

test('la clave incorrecta no dice cual de los dos datos fallo', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('networkidle');
  await page.getByRole('textbox', { name: 'clave' }).fill('no-es-la-clave');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Clave incorrecta.');
});

test('la clave de instalacion no se anuncia y no deja quedarse con ella', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('networkidle');

  // La pantalla llevaba escrita la clave de instalación para que nadie se
  // quedara fuera el primer día. Cualquiera que abriera el enlace la leía, y
  // como cada equipo nuevo empieza con ella, volvía a aparecer siempre.
  await expect(page.locator('body')).not.toContainText(CLAVE);

  // Y con ella no se entra: se pide una propia antes de pasar.
  await page.getByRole('textbox', { name: 'clave', exact: true }).fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByText('Pon la clave de tu equipo')).toBeVisible();
  await expect(page.locator('nav[aria-label="Listado de recetas"]')).toHaveCount(0);
});

test('con la clave correcta aparecen las 121 recetas', async ({ page }) => {
  await entrar(page);
  await expect(page.locator('nav [role=status]')).toHaveText('121 recetas');

  // Los cuatro filtros tienen que sumar el total, o alguno se esta perdiendo
  // recetas por el camino.
  await expect(page.getByRole('button', { name: 'pastelería (66 recetas)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'panadería (34 recetas)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'galletas (21 recetas)' })).toBeVisible();
});

test('la sesion sobrevive a recargar', async ({ page }) => {
  await entrar(page);
  await page.reload();
  await expect(page.locator('nav [role=status]')).toHaveText('121 recetas');
  await expect(page.getByRole('textbox', { name: 'clave' })).toHaveCount(0);
});

test('pero no sobrevive a la caducidad de la clave', async ({ page }) => {
  await entrar(page);

  // Ocho dias atras: la clave dura siete. Es lo que le pasa a la tableta de
  // pared del obrador, que nunca cierra sesion y donde por eso la caducidad
  // semanal no llegaba a aplicarse nunca.
  await page.evaluate(() => {
    const acceso = JSON.parse(window.localStorage.getItem('zahavi_acceso_v1'));
    acceso.changedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    window.localStorage.setItem('zahavi_acceso_v1', JSON.stringify(acceso));
  });

  await page.reload();

  // Pide la clave otra vez, y al darla correcta obliga a renovarla: nadie se
  // queda fuera, pero la clave vieja deja de servir.
  await expect(page.getByRole('textbox', { name: 'clave' })).toBeVisible();
});

test('la busqueda filtra por nombre, por codigo y sin acentos', async ({ page }) => {
  await entrar(page);
  const buscador = page.getByRole('searchbox', { name: 'Buscar receta' });
  const contador = page.locator('nav [role=status]');

  await buscador.fill('brioche');
  await expect(contador).toHaveText('2 recetas');

  await buscador.fill('R005');
  await expect(contador).toHaveText('1 receta');
  await expect(page.getByRole('link', { name: /Berlinas/ })).toBeVisible();

  // Escrito sin acento, encontrado con acento: en el obrador nadie los pone.
  await buscador.fill('almojabana');
  await expect(contador).toHaveText('2 recetas');

  // Y no busca por ingrediente: "harina" solo devuelve lo que lo lleva en el
  // nombre. Es la regla, no una carencia.
  await buscador.fill('harina');
  await expect(contador).toHaveText('1 receta');

  await buscador.fill('xyzzy');
  await expect(page.getByText('Ninguna receta coincide')).toBeVisible();
  await page.getByRole('button', { name: 'Borrar búsqueda' }).click();
  await expect(contador).toHaveText('121 recetas');
});

test('abrir una receta del final no manda el listado al principio', async ({ page }) => {
  await entrar(page);
  const lista = page.locator('.sidebar__list');
  await lista.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const antes = await lista.evaluate((el) => el.scrollTop);

  await page.getByRole('link', { name: /Vegan Chocolate Cake/ }).click();
  await expect(page.locator('.panel h1')).toContainText('Vegan Chocolate Cake');

  // Lo que se vigila es que no vuelva al principio, no el pixel exacto: el
  // listado se reconstruye y puede reajustarse unos pocos al repintar.
  const despues = await page.locator('.sidebar__list').evaluate((el) => el.scrollTop);
  expect(despues).toBeGreaterThan(antes * 0.9);
  await expect(page.getByRole('link', { name: /Vegan Chocolate Cake/ })).toBeInViewport();
});

test('la ficha muestra cada componente como una estacion numerada', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);

  await expect(page.locator('.facts')).toContainText('1 und');
  await expect(page.locator('.facts')).toContainText('14');

  const estaciones = page.locator('.components h3');
  await expect(estaciones).toHaveCount(3);
  await expect(estaciones.first()).toContainText('Base');

  // Sin metodo escrito se ofrece escribirlo; no es un error.
  await expect(page.getByText('Aún no hay método para esta receta.')).toBeVisible();
});

test('escalar la tanda multiplica todo salvo lo que no se multiplica', async ({ page }) => {
  await entrar(page, '#/receta/R010');
  const panel = page.locator('.panel');

  await page.getByRole('button', { name: 'Multiplicar la tanda por 2' }).click();
  await expect(panel).toContainText('4 und');
  await expect(panel.getByText(/Cantidades ×2/)).toBeVisible();

  // Los centimetros son un molde, no una cantidad: se avisa y no se toca.
  await expect(panel).toContainText('Las medidas de molde y los tiempos no se multiplican');
  await expect(panel.locator('.item--volume, .item').filter({ hasText: 'Papel Parafinado' })).toContainText('60');

  await page.getByRole('button', { name: 'Cantidades originales de la receta' }).click();
  await expect(panel).toContainText('2 und');
});

test('una cantidad imposible vuelve al original en vez de vaciar la receta', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  const campo = page.locator('.scaler input[type=number]');

  // El campo recalcula al salir de el, no en cada tecla: escribir "12" no debe
  // pasar por multiplicar por 1 a mitad de camino.
  await campo.fill('4');
  await campo.blur();
  await expect(page.locator('.facts')).toContainText('4 und');

  await campo.fill('0');
  await campo.blur();
  await expect(page.locator('.facts')).toContainText('1 und');
  await expect(page.locator('.panel')).toContainText('300');
});

test('el factor vuelve al original al cambiar de receta', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  await page.getByRole('button', { name: 'Multiplicar la tanda por 3' }).click();
  await expect(page.locator('.facts')).toContainText('3 und');

  await page.evaluate(() => { window.location.hash = '#/receta/R011'; });
  await expect(page.getByRole('button', { name: 'Cantidades originales de la receta' })).toHaveAttribute('aria-pressed', 'true');
});

test('ningun ancho de pantalla desborda la pagina', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);
  for (const width of [1440, 1024, 992, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await desbordeHorizontal(page), `desborda a ${width}px`).toBe(0);
  }
});
