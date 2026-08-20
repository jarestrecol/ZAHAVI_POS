/**
 * LA PUBLICACION, DE PRINCIPIO A FIN
 *
 * Esta es la prueba que faltaba, y su ausencia costo cara: en toda la vida del
 * recetario no llego a publicarse NI UNA vez. El historial de `data/recipes.json`
 * no tiene un solo commit de la funcion de publicacion, y sin embargo todas las
 * pruebas estaban en verde.
 *
 * El motivo es que ninguna comprobaba el camino completo. Habia una prueba que
 * verificaba que NO se publica cuando hay conflicto, que es la mitad
 * defensiva, y ninguna que verificara que SI se publica cuando debe.
 *
 * Aqui se recorre entero: guardar, que se pida la clave de edicion donde hace
 * falta, escribirla, y comprobar que el envio sale con la receta dentro.
 */

import { test, expect } from '@playwright/test';
import { entrar } from './apoyo.js';

/** La clave de edicion que acepta el servidor simulado de estas pruebas. */
const CLAVE_EDICION = 'clave-de-edicion-de-prueba';

/** Titulo del dialogo, que es tambien su etiqueta accesible. */
const TITULO = 'Publicar para todas las sedes';

/**
 * El dialogo de publicar.
 *
 * Se acota a proposito: la cabecera tiene su propio boton "Publicar" cuando hay
 * cambios pendientes, y buscar por rol a secas alcanza a los dos.
 *
 * @param {import('@playwright/test').Page} page
 */
const dialogo = (page) => page.getByLabel(TITULO);

/**
 * Servidor simulado con recetario compartido de verdad: entrega `sha`, sin el
 * cual no se puede publicar, y atiende el PUT.
 *
 * Devuelve la lista de envios recibidos, que es lo que de verdad viajo.
 *
 * @param {import('@playwright/test').Page} page
 */
async function servidorQuePublica(page) {
  const envios = [];
  let sha = 'sha-uno';

  await page.route('**/api/recipes', async (route) => {
    if (route.request().method() === 'PUT') {
      const cuerpo = JSON.parse(route.request().postData() || '{}');

      // La clave se comprueba en el servidor, igual que en produccion.
      if (cuerpo.password !== CLAVE_EDICION) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Clave de edición incorrecta.' }),
        });
        return;
      }

      envios.push(cuerpo);
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
 * Crea una receta de prueba y la guarda.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} nombre
 */
async function crearReceta(page, nombre) {
  await page.getByRole('button', { name: 'Nueva receta' }).click();
  await page.getByRole('textbox', { name: 'nombre de la receta' }).fill(nombre);
  await page.getByRole('combobox', { name: 'Ingrediente' }).first().fill('QA-TEST-HARINA');
  await page.getByRole('textbox', { name: 'Cantidad' }).first().fill('1000');
  await page.getByRole('button', { name: 'Guardar' }).click();
}

/**
 * Escribe la clave en el dialogo y pulsa Publicar.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} clave
 */
async function publicarCon(page, clave) {
  await dialogo(page).getByLabel('clave de edición').fill(clave);
  await dialogo(page).getByRole('button', { name: 'Publicar', exact: true }).click();
}

test('guardar pide la clave de edición ahí mismo, y publica de verdad', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  await crearReceta(page, 'QA-TEST-PUBLICAR');

  // AQUI ESTABA EL MURO. La clave de edicion solo se pedia en Ajustes, en una
  // pantalla a la que habia que saber ir, y por eso no se publicaba nunca.
  // Ahora se pide en el momento, con el cambio ya guardado y a salvo.
  await expect(dialogo(page)).toBeVisible();

  await publicarCon(page, CLAVE_EDICION);

  // El dialogo se cierra solo cuando la publicacion sale bien.
  await expect(dialogo(page)).toHaveCount(0);

  // Y lo importante: el envio salio, y llevaba la receta dentro.
  expect(envios).toHaveLength(1);
  expect(envios[0].recipes.some((r) => r.nombre === 'QA-TEST-PUBLICAR')).toBe(true);
  expect(envios[0].sha).toBe('sha-uno');

  // Ya no queda nada pendiente: el aviso de la cabecera desaparece.
  await expect(page.locator('.context-badge')).toHaveCount(0);
});

test('una clave equivocada se dice en el propio diálogo, sin cerrarlo', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  await crearReceta(page, 'QA-TEST-CLAVE-MALA');
  await expect(dialogo(page)).toBeVisible();

  await publicarCon(page, 'no-es-la-clave');

  // El error se enseña donde la persona esta mirando, y el dialogo sigue
  // abierto para poder reintentar sin volver a empezar.
  await expect(dialogo(page).getByText('Clave de edición incorrecta.')).toBeVisible();
  await expect(dialogo(page)).toBeVisible();
  expect(envios).toHaveLength(0);

  // Y a la segunda, con la buena, publica.
  await publicarCon(page, CLAVE_EDICION);
  await expect(dialogo(page)).toHaveCount(0);
  expect(envios).toHaveLength(1);
});

test('con la clave ya puesta, el siguiente guardado publica solo', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  // Primera vez: se pide la clave.
  await crearReceta(page, 'QA-TEST-PRIMERA');
  await publicarCon(page, CLAVE_EDICION);
  await expect(dialogo(page)).toHaveCount(0);

  // Segunda vez: ya no se pide nada, y sale solo. Esta es la promesa que hace
  // el propio dialogo -"este equipo publicará solo el resto del día"- y que
  // conviene tener sujeta con una prueba.
  await crearReceta(page, 'QA-TEST-SEGUNDA');
  await expect(dialogo(page)).toHaveCount(0);

  await expect.poll(() => envios.length, { timeout: 7000 }).toBe(2);
  expect(envios[1].recipes.some((r) => r.nombre === 'QA-TEST-SEGUNDA')).toBe(true);
});

test('"Ahora no" deja el cambio guardado en el equipo, sin publicar', async ({ page }) => {
  const envios = await servidorQuePublica(page);
  await entrar(page);

  await crearReceta(page, 'QA-TEST-AHORA-NO');
  await expect(dialogo(page)).toBeVisible();

  await dialogo(page).getByRole('button', { name: 'Ahora no' }).click();
  await expect(dialogo(page)).toHaveCount(0);

  // No se publico nada, la receta sigue en el equipo, y la cabecera lo dice.
  expect(envios).toHaveLength(0);
  await expect(page.locator('.context-badge')).toContainText('sin publicar');
});

test('un 200 que no es una publicación no se anuncia como publicado', async ({ page }) => {
  // Un intermediario -proxy de la red del local, cortafuegos de la plataforma,
  // pagina de sesion caducada- puede contestar 200 con cualquier cosa. Antes
  // eso se tomaba por buena: la pantalla decia "Publicado para todas las sedes"
  // y el aviso de cambios pendientes desaparecia, con el trabajo todavia solo
  // en este equipo y sin que nadie fuera a reintentarlo.
  await page.route('**/api/recipes', async (route) => {
    const publicado = await route.fetch({ url: 'http://127.0.0.1:8123/data/recipes.json' });
    const datos = await publicado.json();

    // Al PUT le contesta lo mismo que al GET: 200, JSON valido, y ni rastro de
    // una publicacion.
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...datos, sha: 'sha-uno' }),
    });
  });

  await entrar(page);
  await crearReceta(page, 'QA-TEST-RESPUESTA-RARA');
  await expect(dialogo(page)).toBeVisible();

  await publicarCon(page, CLAVE_EDICION);

  // Se dice que no se publico, el dialogo sigue abierto para reintentar, y el
  // aviso de cambios pendientes NO desaparece.
  await expect(dialogo(page).getByText(/no es una publicación/i)).toBeVisible();
  await expect(dialogo(page)).toBeVisible();

  await dialogo(page).getByRole('button', { name: 'Ahora no' }).click();
  await expect(page.locator('.context-badge')).toContainText('sin publicar');
});
