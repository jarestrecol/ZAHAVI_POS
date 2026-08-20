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
 *   4. No hay red, o no hay servidor     sw.js y el aviso de aislamiento
 *
 * Cubre los puntos 90 a 96 de QA.md.
 */

import { test, expect } from '@playwright/test';
import { entrar, CLAVE } from './apoyo.js';

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
    await expect(page.locator('.fallo__brand')).toContainText('Zahavi');
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
    await expect(page.locator('.booting')).toHaveCount(0);
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
    expect(await page.evaluate(() => window.location.hash)).toBe('#/');
  });
});

/* ===========================================================================
 *  4. NO HAY SERVIDOR
 * ======================================================================== */

test.describe('Sin recetario compartido', () => {
  // El servidor de pruebas no tiene la funcion `/api/recipes`, igual que un
  // despliegue al que le faltan las variables de entorno. Ese es justo el caso
  // que hay que anunciar: se puede trabajar durante semanas creyendo que lo
  // guardado llega a la otra sede.

  test('lo anuncia en la cabecera, no escondido en Ajustes', async ({ page }) => {
    await entrar(page);

    const aviso = page.locator('.context-badge--warn');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('no está conectado al recetario compartido');
  });

  test('Ajustes lo explica en una línea', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Ajustes' }).click();

    const fila = page.locator('.diag__row', { hasText: 'Recetario compartido' });
    // "Sitio" se cambio por "No configurado": en una panaderia un sitio es una
    // sede, y quien leia esto en Panaderia entendia "no disponible en esta sede".
    await expect(fila.locator('.diag__value')).toHaveText('No configurado');

    const automatica = page.locator('.diag__row', { hasText: 'Publicación automática' });
    await expect(automatica.locator('.diag__value')).toHaveText('No disponible');
  });

  test('si el servidor falla, Ajustes enseña lo que dijo', async ({ page }) => {
    // Es el caso real de un despliegue al que le faltan las variables de
    // entorno: la funcion existe y contesta con su motivo. Antes ese motivo se
    // descartaba y Ajustes solo decia "responde con error", que no permite
    // arreglar nada.
    await page.route('**/api/recipes', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'El servidor no tiene configurado el acceso al repositorio.' }),
      }),
    );

    await entrar(page);
    await page.getByRole('button', { name: 'Ajustes' }).click();

    const fila = page.locator('.diag__row', { hasText: 'Recetario compartido' });
    await expect(fila.locator('.diag__value')).toHaveText('Responde con error');
    await expect(page.locator('.diag__error')).toContainText(
      'no tiene configurado el acceso al repositorio',
    );
  });

  test('un 404 con motivo propio no se confunde con un sitio sin recetario', async ({ page }) => {
    // La funcion contesta 404 cuando `GITHUB_BRANCH` apunta a una rama que no
    // existe. Anunciarlo como "no disponible en este sitio" mandaria a revisar
    // justo donde no esta el problema.
    await page.route('**/api/recipes', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'El archivo de recetas no existe en el repositorio.' }),
      }),
    );

    await entrar(page);
    await page.getByRole('button', { name: 'Ajustes' }).click();

    const fila = page.locator('.diag__row', { hasText: 'Recetario compartido' });
    await expect(fila.locator('.diag__value')).toHaveText('Responde con error');
    await expect(page.locator('.diag__error')).toContainText('no existe en el repositorio');
  });

  test('guardar dice que el cambio se queda en este equipo', async ({ page }) => {
    await entrar(page);

    // Receta nueva con el prefijo de pruebas: no se toca ninguna de las 121.
    await page.getByRole('button', { name: 'Nueva receta' }).click();
    await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-RESILIENCIA');
    // Una receta sin ningun ingrediente no se guarda: la validacion la rechaza.
    // El campo lleva lista de sugerencias, asi que su papel es `combobox`.
    await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-HARINA');
    await page.getByRole('textbox', { name: 'Cantidad' }).first().fill('1000');
    await page.getByRole('button', { name: 'Guardar' }).click();

    // Sin servidor no puede haber publicacion automatica, y el mensaje no debe
    // prometer lo contrario.
    await expect(page.locator('.notice')).toContainText('en este equipo');
    await expect(page.locator('.notice')).not.toContainText('Publicando');

    // Se deja el recetario como estaba: las pruebas no dejan restos.
    await page.evaluate(() => {
      window.localStorage.removeItem('zahavi_recetario_v1');
    });
  });
});

/* ===========================================================================
 *  4b. DOS SEDES SOBRE LA MISMA RECETA
 * ======================================================================== */

test.describe('Dos sedes editando', () => {
  /**
   * Sirve un recetario compartido con la revision que se le diga.
   *
   * Es el minimo para representar a la otra sede: lo unico que hace falta es
   * que la revision cambie, porque es lo que le dice a este equipo que hay una
   * version nueva que el no tiene.
   *
   * @param {import('@playwright/test').Page} page
   * @param {{revision: string, sha: string}} version
   */
  /**
   * Pasa la puerta que pide la clave de edicion antes de tocar una receta.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function pasarLaPuerta(page) {
    const campo = page.locator('#desbloquear-clave');
    await campo.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (!(await campo.count())) return;
    await campo.fill('clave-de-prueba');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(campo).toHaveCount(0);
  }

  async function servirRecetario(page, version) {
    await page.route('**/api/recipes', async (route) => {
      if (route.request().method() !== 'GET') {
        const cuerpo = JSON.parse(route.request().postData() || '{}');

        // La puerta comprueba la clave antes de dejar tocar una receta. Esto no
        // es publicar: no escribe nada.
        if (cuerpo.verificar === true) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, verificada: true }),
          });
          return;
        }

        // Un PUT de publicacion aqui significaria que este equipo publico: la
        // prueba lo cuenta para comprobar que NO ocurre.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ revision: 'no-deberia', count: 0, sha: 'x' }),
        });
        return;
      }

      const publicado = await route.fetch({ url: 'http://127.0.0.1:8123/data/recipes.json' });
      const datos = await publicado.json();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...datos, revision: version.revision, sha: version.sha }),
      });
    });
  }

  test('no se publica solo encima de lo que publicó la otra sede', async ({ page }) => {
    await servirRecetario(page, { revision: '2026-01-01', sha: 'sha-uno' });
    await entrar(page);

    // Este equipo edita y su cambio queda pendiente, apoyado en la revisión 1.
    // Se pasa la puerta: sin ella no se llega al editor, y sin la clave guardada
    // tampoco habría publicación automática que comprobar.
    await page.getByRole('button', { name: 'Nueva receta' }).click();
    await pasarLaPuerta(page);
    await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-DOS-SEDES');
    await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-HARINA');
    await page.getByRole('textbox', { name: 'Cantidad' }).first().fill('1000');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('.context-badge')).toContainText('sin publicar');


    // Mientras tanto, la otra sede publica: al recargar hay una revisión nueva.
    await servirRecetario(page, { revision: '2026-01-02', sha: 'sha-dos' });

    let publicaciones = 0;
    page.on('request', (peticion) => {
      if (!peticion.url().includes('/api/recipes') || peticion.method() !== 'PUT') return;

      // Las comprobaciones de clave viajan por la misma via y no escriben nada:
      // aqui solo cuentan las publicaciones de verdad.
      const cuerpo = JSON.parse(peticion.postData() || '{}');
      if (cuerpo.verificar === true) return;

      publicaciones += 1;
    });

    await page.reload();

    // Se avisa de que hay dos versiones y de que hay que elegir.
    await expect(page.locator('.context-badge')).toContainText('Otra sede publicó');

    // Y guardar otra vez NO dispara la publicación: enviar el recetario de
    // este equipo, que no tiene lo de la otra sede, la borraría en silencio.
    await page.getByRole('button', { name: 'Nueva receta' }).click();
    await pasarLaPuerta(page);
    await page.getByRole('textbox', { name: 'nombre de la receta' }).fill('QA-TEST-DOS-SEDES-B');
    await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-AZUCAR');
    await page.getByRole('textbox', { name: 'Cantidad' }).first().fill('500');
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.locator('.notice')).toContainText('en este equipo');
    await page.waitForTimeout(500);
    expect(publicaciones).toBe(0);
  });
});

/* ===========================================================================
 *  4c. LA COPIA GUARDADA ESTA DAÑADA
 * ======================================================================== */

test.describe('Copia local ilegible', () => {
  test('no se sobrescribe en silencio: se aparta y se avisa', async ({ page }) => {
    await entrar(page);

    // Así queda una copia local si la escritura se corta a mitad: por la cuota
    // agotada, por cerrar el navegador en mal momento, o por un fallo del
    // dispositivo. El texto no se puede interpretar, así que no hay forma de
    // saber si contenía trabajo sin publicar.
    await page.evaluate(() => {
      window.localStorage.setItem('zahavi_recetario_v1', '{"dirty":true,"recipes":[{"id":"R0');
    });

    await page.reload();

    // Antes de esto, una copia ilegible se trataba como "aquí no hay nada":
    // se escribía encima la versión publicada y lo que hubiera desaparecía sin
    // un solo aviso.
    await expect(page.locator('.notice')).toContainText('estaba dañada');

    // Y lo ilegible se conserva, que es lo único que queda de ese trabajo.
    const rescatado = await page.evaluate(() =>
      window.localStorage.getItem('zahavi_recetario_rescate_crudo'),
    );
    expect(rescatado).toContain('{"dirty":true');

    // El recetario sigue usable con la versión publicada.
    await expect(page.locator('nav [role=status]')).toHaveText('121 recetas');
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
