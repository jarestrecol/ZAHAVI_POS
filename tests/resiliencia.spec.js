/**
 * RESILIENCIA
 *
 * Todo lo que pasa cuando algo va mal. Es la familia de fallos mas dificil de
 * ver en una revision manual, porque hay que romper el sitio a proposito para
 * que aparezcan, y ninguno se manifiesta mientras las cosas funcionan.
 *
 * Cubre cuatro caminos, cada uno con su propio modo de fallar:
 *
 *   1. La direccion no existe            404.html
 *   2. El programa no arranca            src/salvavidas.js
 *   3. La receta pedida ya no esta       renderNotFound
 *   4. El servidor no contesta           el recetario vive en Supabase (0024)
 *   5. No hay red                        sw.js (solo la carcasa)
 *
 * Fija lo que pasa cuando algo va mal: la direccion que no existe, el programa
 * que no arranca, la receta borrada, el servidor que falla y la falta de red.
 * El recetario ya no se guarda en el equipo ni se publica (F1-D, F4-1).
 */

import { test, expect } from '@playwright/test';
import { entrar, simularSupabase, llamadasA, PERFIL, TOTAL_RECETAS } from './apoyo.js';

/* ===========================================================================
 *  1. LA DIRECCION NO EXISTE
 * ======================================================================== */

test.describe('Página no encontrada', () => {
  test('responde 404 y explica qué pasó, con la marca del recetario', async ({ page }) => {
    const respuesta = await page.goto('/una-direccion-que-no-existe');

    // El estado importa tanto como el texto: un 200 con cara de error le dice
    // a los buscadores y a cualquier enlace automatico que la pagina existe.
    expect(respuesta.status()).toBe(404);

    await expect(page.locator('.fallo__title')).toHaveText('Esta dirección no existe');
    await expect(page.locator('.fallo__brand')).toContainText('ZAHAVI POS');
    await expect(page.locator('.fallo__code')).toContainText('404');
  });

  test('la hoja de estilo se aplica bajo la política de seguridad real', async ({ page }) => {
    await page.goto('/una-direccion-que-no-existe');

    // Sin esto la pagina se veria como texto suelto sobre fondo blanco. Es el
    // fallo exacto que tenia el aviso de `noscript`: llevaba el estilo dentro
    // del atributo y `style-src 'self'` lo descartaba en silencio.
    const fondo = await page
      .locator('.fallo')
      .evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(fondo).not.toBe('rgba(0, 0, 0, 0)');

    const borde = await page
      .locator('.fallo__inner')
      .evaluate((el) => window.getComputedStyle(el).borderTopWidth);
    expect(borde).toBe('3px');
  });

  test('el enlace devuelve al recetario', async ({ page }) => {
    await page.goto('/una-direccion-que-no-existe');
    await page.getByRole('link', { name: 'Ir al recetario' }).click();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('la página de fallo de plataforma conserva los marcadores de Vercel', async ({ page }) => {
    // Los sustituye la plataforma al servirla. Si alguien los borra por
    // parecerle texto raro, el aviso deja de poder diagnosticar nada.
    const respuesta = await page.request.get('/500.html');
    const html = await respuesta.text();
    expect(html).toContain('::vercel:ERROR_CODE::');
    expect(html).toContain('::vercel:REQUEST_ID::');
  });
});

/* ===========================================================================
 *  2. EL PROGRAMA NO ARRANCA
 * ======================================================================== */

test.describe('Arranque', () => {
  test('un módulo que no carga deja una salida, no una pantalla colgada', async ({ page }) => {
    // Asi se ve un despliegue a medias o una copia guardada corrupta: el
    // documento llega, el codigo no.
    await page.route('**/src/main.js', (route) => route.abort());

    await page.goto('/index.html');

    await expect(page.locator('.fallo__title')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: 'Volver a intentarlo' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Borrar la copia guardada y recargar' }),
    ).toBeVisible();

    // Lo primero que quiere saber quien esta delante.
    await expect(page.locator('.fallo__note')).toContainText('no se borran');

    // Y lo que antes se quedaba en pantalla para siempre.
    await expect(page.locator('.portada')).toHaveCount(0);
  });

  test('cuando arranca bien no se ve ningún aviso de fallo', async ({ page }) => {
    await entrar(page);

    await expect(page.locator('.fallo')).toHaveCount(0);
    // La marca que apaga la red de seguridad.
    await expect(page.locator('html')).toHaveAttribute('data-arranque', 'listo');
  });
});

/* ===========================================================================
 *  3. LA RECETA PEDIDA YA NO ESTA
 * ======================================================================== */

test.describe('Receta inexistente', () => {
  test('el enlace de una receta que no está lo dice, con el código pedido', async ({ page }) => {
    await entrar(page, '#/receta/R999');

    await expect(page.locator('.welcome__title')).toHaveText('Esta receta no está aquí');
    // El codigo es lo unico que permite entender que paso.
    await expect(page.locator('.welcome__code')).toHaveText('R999');

    // Antes esto llevaba a la bienvenida y el enlace parecia no hacer nada.
    await expect(page.locator('.welcome__stats')).toHaveCount(0);
  });

  test('devuelve al listado', async ({ page }) => {
    await entrar(page, '#/receta/R999');
    await page.getByRole('button', { name: 'Volver al listado' }).click();

    await expect(page.locator('.welcome__stats')).toBeVisible();
    // `#/recetario` y no `#/`: la raiz es el menu de modulos desde que el
    // sistema dejo de ser solo el recetario. Volver al listado es volver al
    // modulo, no salirse de el.
    expect(await page.evaluate(() => window.location.hash)).toBe('#/recetario');
  });
});

/* ===========================================================================
 *  4. EL RECETARIO VIVE EN EL SERVIDOR
 * ======================================================================== */

test.describe('Recetario en el servidor', () => {
  test('llega del servidor y no deja copia en el equipo', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('nav [role=status]')).toHaveText(`${TOTAL_RECETAS} recetas`);
    const sim = await simularSupabase(page.context());
    expect(llamadasA(sim, '/rest/v1/rpc/operacion_leer')).toBeGreaterThan(0);
    const copia = await page.evaluate(() => window.localStorage.getItem('zahavi_recetario_v1'));
    expect(copia).toBeNull();
  });

  test('si el servidor falla, no enseña recetas viejas y dice por qué', async ({ page, context }) => {
    const sim = await simularSupabase(context);
    sim.leerRecetario = { status: 500, datos: { code: 'error', message: 'fallo del servidor' } };
    await entrar(page);
    await expect(page.locator('nav [role=status]')).not.toHaveText(`${TOTAL_RECETAS} recetas`);
    await expect(page.locator('.notice')).toBeVisible();
  });

  test('guardar va al servidor y lo ven todas las sedes', async ({ page, context }) => {
    const sim = await simularSupabase(context);
    await entrar(page);

    // Receta nueva con el prefijo de pruebas: no se toca ninguna real.
    await page.getByRole('button', { name: 'Nueva receta' }).click();
    await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-RESILIENCIA');
    await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-HARINA');
    await page.getByRole('textbox', { name: 'Cantidad' }).first().fill('1000');
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.locator('.notice')).toContainText('todas las sedes');
    const escritura = sim.llamadas.find((l) => l.ruta.startsWith('/rest/v1/rpc/operacion_ejecutar'));
    expect(escritura && escritura.cuerpo.p_solicitud.accion).toBe('guardar_receta');
    expect(escritura.cuerpo.p_solicitud.datos.componentes[0].items[0].cantidad).toBe(1000);
    // Nada se publica en GitHub: la ruta ya no existe.
    expect(await page.evaluate(() => window.localStorage.getItem('zahavi_recetario_v1'))).toBeNull();
  });

  test('si otra persona cambió la receta, no la pisa: avisa y la relee', async ({ page, context }) => {
    const sim = await simularSupabase(context);
    await entrar(page, '#/receta/R016');
    // Otra sede guarda la R016 mientras esta pantalla la tiene abierta.
    sim.recetario.find((r) => r.id === 'R016').revision += 1;

    await page.getByRole('button', { name: 'Editar la receta' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.notice')).toContainText('cambió mientras la editabas');
  });

  test('el operario consulta el recetario pero no ve cómo editarlo', async ({ page, context }) => {
    const sim = await simularSupabase(context);
    sim.perfil = { ...PERFIL, rol: 'operario' };
    await entrar(page);
    await expect(page.locator('nav [role=status]')).toHaveText(`${TOTAL_RECETAS} recetas`);
    await expect(page.getByRole('button', { name: 'Nueva receta' })).toHaveCount(0);
  });
});

/* ===========================================================================
 *  5. NO HAY RED
 * ======================================================================== */

test.describe('Sin conexión', () => {
  // Esta es la unica prueba que deja trabajar al service worker: es justo lo
  // que se comprueba.

  test('el recetario abre sin red, incluso desde una dirección no guardada', async ({ page }) => {
    await page.goto('/index.html');

    // `controller` es la prueba de que el service worker ya sirve esta pagina,
    // no solo de que esta registrado.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, {
      timeout: 20_000,
    });

    await page.context().setOffline(true);

    // Una direccion que NO esta guardada tal cual. Antes salia la pantalla de
    // error del navegador: `networkFirst` lanzaba el fallo sin caer a la
    // portada, y a esa situacion se llega con el acceso directo instalado o con
    // un enlace escrito de otra forma.
    await page.goto('/recetario-sin-guardar');

    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

    await page.context().setOffline(false);
  });
});
