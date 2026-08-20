/**
 * LA PUBLICACION, DE PRINCIPIO A FIN
 *
 * Esta es la prueba que faltaba, y su ausencia costo cara: en toda la vida del
 * recetario no llego a publicarse NI UNA vez. El historial de `data/recipes.json`
 * no tiene un solo commit de la funcion de publicacion, y sin embargo todas las
 * pruebas estaban en verde.
 *
 * El motivo es que ninguna comprobaba el camino completo. Habia una prueba que
 * verificaba que NO se publica cuando hay conflicto, que es la mitad defensiva,
 * y ninguna que verificara que SI se publica cuando debe.
 *
 * Ademas cubre LA PUERTA: crear, modificar y eliminar piden la clave de edicion
 * antes de dejar tocar nada, porque con la publicacion automatica en marcha esos
 * tres gestos llegan a las dos sedes.
 */

import { test, expect } from '@playwright/test';
import { entrar, RECETA } from './apoyo.js';

/** La clave de edicion que acepta el servidor simulado de estas pruebas. */
const CLAVE_EDICION = 'clave-de-edicion-de-prueba';

/** El campo de la puerta que pide la clave antes de editar. */
const puerta = (page) => page.locator('#desbloquear-clave');

/**
 * Servidor simulado con recetario compartido de verdad: entrega `sha`, atiende
 * la comprobacion de clave y atiende el PUT de publicacion.
 *
 * Devuelve la lista de publicaciones recibidas, que es lo que de verdad viajo.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{respuestaRara?: boolean}} [opciones]
 */
async function servidorQuePublica(page, opciones = {}) {
  const envios = [];
  let sha = 'sha-uno';

  await page.route('**/api/recipes', async (route) => {
    if (route.request().method() === 'PUT') {
      const cuerpo = JSON.parse(route.request().postData() || '{}');

      // La clave la comprueba el servidor, igual que en produccion.
      if (cuerpo.password !== CLAVE_EDICION) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Clave de edición incorrecta.' }),
        });
        return;
      }

      // Comprobacion de clave: vale, y no hay nada que publicar todavia.
      if (cuerpo.verificar === true) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, verificada: true }),
        });
        return;
      }

      envios.push(cuerpo);

      // Un 200 que NO es una publicacion: lo que devolveria un proxy o el
      // cortafuegos de la plataforma metidos por medio.
      if (opciones.respuestaRara) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recipes: [], sha: 'lo-que-sea' }),
        });
        return;
      }

      sha = 'sha-' + (envios.length + 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          revision: '2026-08-20 09:00:00',
          count: cuerpo.recipes.length,
          sha,
        }),
      });
      return;
    }

    const publicado = await route.fetch({ url: 'http://127.0.0.1:8123/data/recipes.json' });
    const datos = await publicado.json();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...datos, sha }),
    });
  });

  return envios;
}

/**
 * Pasa la puerta si esta puesta.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [clave]
 */
async function pasarLaPuerta(page, clave = CLAVE_EDICION) {
  // Se ESPERA a que aparezca. Comprobar el contador a secas justo despues del
  // clic devolvia cero porque el dialogo aun no estaba montado, asi que el
  // helper se saltaba la puerta y la prueba fallaba mas adelante buscando un
  // editor que seguia detras de ella.
  await puerta(page).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (!(await puerta(page).count())) return;
  await puerta(page).fill(clave);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(puerta(page)).toHaveCount(0);
}

/**
 * Rellena el editor ya abierto y guarda.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nombre
 */
async function rellenarYGuardar(page, nombre) {
  await page.getByRole('textbox', { name: 'nombre de la receta' }).fill(nombre);
  await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-HARINA');
  await page.getByRole('textbox', { name: 'Cantidad' }).first().fill('1000');
  await page.getByRole('button', { name: 'Guardar' }).click();
}

/**
 * Crea una receta de prueba entera, pasando la puerta.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nombre
 */
async function crearReceta(page, nombre) {
  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await pasarLaPuerta(page);
  await rellenarYGuardar(page, nombre);
}

/* ===========================================================================
 *  LA PUERTA
 * ======================================================================== */

test('la clave se pide antes de tocar la receta, y despues se publica sola', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  // Crear una receta ya no es gratis: cambiar una formula llega a las dos
  // sedes, asi que pide la clave de edicion ANTES de abrir el editor.
  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await expect(puerta(page)).toBeVisible();

  // Y no deja pasar con la clave equivocada.
  await puerta(page).fill('no-es-la-clave');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Clave de edición incorrecta.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toHaveCount(0);

  // Con la buena se abre el editor sin volver a pulsar nada.
  await pasarLaPuerta(page);
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toBeVisible();

  await rellenarYGuardar(page, 'QA-TEST-PUBLICAR');

  // Como la clave quedo en la sesion al pasar la puerta, no hay que volver a
  // escribirla: se publica sola.
  await expect.poll(() => envios.length, { timeout: 7000 }).toBe(1);
  expect(envios[0].recipes.some((r) => r.nombre === 'QA-TEST-PUBLICAR')).toBe(true);
  expect(envios[0].sha).toBe('sha-uno');

  await expect(page.locator('.context-badge')).toHaveCount(0);
});

test('eliminar tambien pide la clave, antes incluso de la confirmacion', async ({ page }) => {
  await servidorQuePublica(page);
  await entrar(page, `#/receta/${RECETA}`);

  await page.getByRole('button', { name: 'Eliminar la receta' }).click();

  // La puerta va PRIMERO: sin clave no se llega ni a ver los tres pasos de la
  // confirmacion de borrado.
  await expect(puerta(page)).toBeVisible();
  // Se busca el primer paso de la confirmacion, no su texto: la propia puerta
  // dice tambien "vas a eliminar esta receta", que es justo lo que tiene que
  // decir para que se sepa que se esta autorizando.
  await expect(page.getByRole('button', { name: 'Sí, es esta receta' })).toHaveCount(0);

  await pasarLaPuerta(page);
  await expect(page.getByRole('button', { name: 'Sí, es esta receta' })).toBeVisible();
});

test('cancelar la puerta no deja el recetario a medias', async ({ page }) => {
  await servidorQuePublica(page);
  await entrar(page, `#/receta/${RECETA}`);

  await page.getByRole('button', { name: 'Eliminar la receta' }).click();
  await expect(puerta(page)).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar' }).click();

  // Vuelve a la receta, sin puerta y sin confirmacion pendiente que reaparezca.
  await expect(puerta(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sí, es esta receta' })).toHaveCount(0);
  await expect(page.locator('.panel')).toBeVisible();
});

test('sin recetario compartido no se pide clave: no hay a donde publicar', async ({ page }) => {
  // Este sitio no tiene la funcion de servidor. Exigir una clave que nadie
  // puede comprobar dejaria el recetario inservible en local.
  await page.route('**/api/recipes', (route) => route.fulfill({ status: 404, body: '' }));
  await entrar(page);

  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await expect(puerta(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'nombre de la receta' })).toBeVisible();
});

/* ===========================================================================
 *  LA PUBLICACION
 * ======================================================================== */

test('un 200 que no es una publicación no se anuncia como publicado', async ({ page }) => {
  // Un intermediario -proxy de la red del local, cortafuegos de la plataforma,
  // pagina de sesion caducada- puede contestar 200 con cualquier cosa. Antes
  // eso se tomaba por buena: la pantalla decia "Publicado para todas las sedes"
  // y el aviso de cambios pendientes desaparecia, con el trabajo todavia solo
  // en este equipo y sin que nadie fuera a reintentarlo.
  const envios = await servidorQuePublica(page, { respuestaRara: true });
  await entrar(page);

  await crearReceta(page, 'QA-TEST-RESPUESTA-RARA');

  await expect.poll(() => envios.length, { timeout: 7000 }).toBe(1);

  // El envio salio, pero NO se da por publicado: el aviso de cambios pendientes
  // sigue en la cabecera.
  await expect(page.locator('.context-badge')).toContainText('sin publicar');
});

test('con la clave puesta, el segundo guardado tambien publica solo', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  await crearReceta(page, 'QA-TEST-PRIMERA');
  await expect.poll(() => envios.length, { timeout: 7000 }).toBe(1);

  // La segunda vez la puerta ya no aparece: la clave sigue en la sesion.
  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await expect(puerta(page)).toHaveCount(0);
  await rellenarYGuardar(page, 'QA-TEST-SEGUNDA');

  await expect.poll(() => envios.length, { timeout: 7000 }).toBe(2);
  expect(envios[1].recipes.some((r) => r.nombre === 'QA-TEST-SEGUNDA')).toBe(true);
});

test('si se pierde la clave de la sesion, la puerta vuelve a pedirla', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  await crearReceta(page, 'QA-TEST-CLAVE-PERDIDA');
  await expect.poll(() => envios.length, { timeout: 7000 }).toBe(1);

  // Es lo que hace `sync.js` cuando el servidor rechaza la clave: la borra para
  // no reintentar en bucle contra una clave que ya no vale.
  await page.evaluate(() => window.sessionStorage.removeItem('zahavi_edit_key'));

  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await expect(puerta(page)).toBeVisible();
});
