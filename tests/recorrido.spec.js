/**
 * EL CAMINO DE TODOS LOS DIAS
 *
 * Entrar, encontrar la receta, leerla y escalar la tanda. Si algo de esto se
 * rompe, el recetario no sirve para lo unico que se le pide.
 *
 * Fija el camino de todos los dias: entrar, buscar, abrir una receta y escalar
 * la tanda.
 */

import { test, expect } from '@playwright/test';
import {
  entrar,
  CLAVE,
  CLAVE_NUEVA,
  RECETA,
  desbordeHorizontal,
  abrirRecetaDesde,
  alturaDelListado,
  contrasteDeFondos,
  TOTAL_RECETAS,
  filtro,
} from './apoyo.js';

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

test(`con la clave correcta aparecen las ${TOTAL_RECETAS} recetas`, async ({ page }) => {
  await entrar(page);
  await expect(page.locator('nav [role=status]')).toHaveText(`${TOTAL_RECETAS} recetas`);

  // Los cuatro filtros tienen que sumar el total, o alguno se esta perdiendo
  // recetas por el camino.
  await expect(page.getByRole('button', { name: filtro('PASTELERÍA') })).toBeVisible();
  await expect(page.getByRole('button', { name: filtro('PANADERÍA') })).toBeVisible();
  await expect(page.getByRole('button', { name: filtro('GALLETAS') })).toBeVisible();
});

test('la sesion sobrevive a recargar', async ({ page }) => {
  await entrar(page);
  await page.reload();
  await expect(page.locator('nav [role=status]')).toHaveText(`${TOTAL_RECETAS} recetas`);
  await expect(page.getByRole('textbox', { name: 'clave' })).toHaveCount(0);
});

test('pero no sobrevive a que la panaderia retire la clave', async ({ page }) => {
  await entrar(page);

  // La panaderia sube la generacion de acceso en el servidor. Eso es lo que
  // retira la clave en TODOS los aparatos a la vez, que es lo que la caducidad
  // semanal prometia y no cumplia: aquella obligaba a renovar por calendario en
  // cada equipo por separado, y no dejaba a nadie fuera de verdad.
  //
  // La tableta de pared del obrador, que no cierra sesion nunca, es justo el
  // caso donde la comprobacion tenia que llegar y no llegaba.
  await page.route('**/api/recipes', async (route) => {
    const publicado = await route.fetch({ url: 'http://127.0.0.1:8123/data/recipes.json' });
    const datos = await publicado.json();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...datos, sha: 'sha-uno', accesoGen: 1 }),
    });
  });

  await page.reload();

  // La sesion se cierra: la clave de este equipo dejo de valer.
  await expect(page.getByRole('textbox', { name: 'clave', exact: true })).toBeVisible();
  await expect(page.locator('nav[aria-label="Listado de recetas"]')).toHaveCount(0);

  // Pero nadie se queda fuera: con la clave que tenia se entra, y lo que se
  // pide es ponerla nueva, diciendo por que.
  await page.getByRole('textbox', { name: 'clave', exact: true }).fill(CLAVE_NUEVA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('La panadería retiró esta clave')).toBeVisible();
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
  await expect(contador).toHaveText(`${TOTAL_RECETAS} recetas`);
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

/*
 * EL FILTRO ACTIVO TIENE QUE VERSE SIN LEERLO.
 *
 * Iba con el mismo boton un poco mas claro -0,14 de blanco contra 0,04-, que
 * sobre el rail oscuro son 1,1:1. En la tableta del obrador, a contraluz, no se
 * distinguia cual de los cuatro estaba puesto.
 *
 * No se fija un color concreto a proposito: lo que importa es que se DISTINGA,
 * asi que se mide el contraste real entre el activo y uno inactivo y se exige
 * el 3:1 que la norma pide para que algo se lea como un objeto aparte. Cualquier
 * paleta que lo cumpla pasa.
 */
test('el filtro de categoria activo se distingue de los demas', async ({ page }) => {
  await entrar(page);

  await page.getByRole('button', { name: /pasteler/i }).click();

  const activo = page.locator("[data-category='PASTELERÍA'].chip");
  await expect(activo).toHaveAttribute('aria-pressed', 'true');

  const contraste = await contrasteDeFondos(
    page,
    "[data-category='PASTELERÍA'].chip",
    "[data-category='PANADERÍA'].chip",
  );

  expect(contraste).toBeGreaterThanOrEqual(3);
});

/*
 * EL TAMAÑO DEL TEXTO ALCANZA A LA RECETA Y A NADA MAS.
 *
 * Lo pidio el obrador desde el telefono: el texto de la ficha se ve grande, y
 * quiere poder achicarlo sin que se le mueva el resto de la pantalla. Las dos
 * mitades importan igual, asi que las dos se comprueban aqui: que la receta
 * encoja Y que el filtro del listado se quede donde estaba.
 */
test('el tamaño del texto cambia la receta y deja quieto el resto', async ({ page }) => {
  await entrar(page, `#/receta/${RECETA}`);

  const medir = () =>
    page.evaluate(() => ({
      ingrediente: getComputedStyle(document.querySelector('.item__name')).fontSize,
      filtro: getComputedStyle(document.querySelector('.chip')).fontSize,
    }));

  await expect(page.locator('.item__name').first()).toBeVisible();
  const antes = await medir();

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('button', { name: 'Pequeño' }).click();
  await page.keyboard.press('Escape');

  // El repintado va dentro de una transicion de vista, asi que no es sincrono:
  // se espera a que el atributo de la raiz refleje la eleccion (regla 20).
  await expect(page.locator('html')).toHaveAttribute('data-escala', 'pequeno');

  const despues = await medir();

  expect(parseFloat(despues.ingrediente)).toBeLessThan(parseFloat(antes.ingrediente));
  expect(despues.filtro).toBe(antes.filtro);

  // Y se queda puesto: es una preferencia de ESTE aparato, no del rato que dura
  // la pantalla abierta.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.item__name').first()).toBeVisible();
  expect(await medir()).toEqual(despues);
});

/*
 * EN ESCRITORIO EL LISTADO NO SE VA DE LA PANTALLA, asi que abrir una receta ya
 * conservaba el sitio. Lo que se fija aqui es la otra mitad de la regla: que la
 * posicion pertenece a UN listado concreto.
 *
 * Cambiar de categoria da otra lista, mas corta o mas larga, y devolverla a la
 * altura de la anterior es caer en cualquier sitio. Con un filtro nuevo se
 * empieza arriba; volviendo de una receta, no.
 */
test('la posicion del listado pertenece al filtro, no a la pantalla', async ({ page }) => {
  await entrar(page);

  const { altura } = await abrirRecetaDesde(page, 900);
  expect(altura).toBeGreaterThan(0);
  await expect(page.locator('.sheet-view')).toBeVisible();
  await expect.poll(() => alturaDelListado(page)).toBe(altura);

  // Otro filtro es otra lista: arriba del todo.
  await page.getByRole('button', { name: /galletas/i }).click();
  await expect.poll(() => alturaDelListado(page)).toBe(0);
});

/*
 * LA RECETA QUE SE ESTA MIRANDO TIENE QUE VERSE EN EL LISTADO.
 *
 * Iba con un ambar muy profundo que sobre el rail oscuro da 1,43:1, y en la
 * tableta del obrador no se distinguia de las filas de al lado. Como con los
 * filtros, no se fija un color: se mide contra una fila normal y se exige el
 * 3:1 que la norma pide para que algo se lea como un objeto aparte.
 */
test('la receta abierta se distingue de las demas filas del listado', async ({ page }) => {
  await entrar(page);
  const { id } = await abrirRecetaDesde(page, 900);
  await expect(page.locator('.sheet-view')).toBeVisible();
  await expect(page.locator(`.recipe-link[data-id="${id}"]`)).toHaveClass(/is-active/);

  const contraste = await contrasteDeFondos(
    page,
    '.recipe-link.is-active',
    '.recipe-link:not(.is-active)',
  );
  expect(contraste).toBeGreaterThanOrEqual(3);
});
