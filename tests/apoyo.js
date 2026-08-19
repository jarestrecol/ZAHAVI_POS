/**
 * Piezas comunes de las pruebas de navegador.
 *
 * Ninguna prueba crea, edita ni borra recetas reales: todas leen. Las que
 * necesitan escribir lo hacen sobre recetas con el prefijo `QA-TEST-`, que es
 * la misma regla que sigue la verificacion manual.
 */

/** La clave de instalación, con la que arranca un equipo que nunca ha entrado. */
export const CLAVE = 'zahavi2026';

/**
 * La clave que se pone en su lugar.
 *
 * El sistema no deja entrar con la de instalación: obliga a cambiarla en el
 * primer acceso de cada equipo. Las pruebas pasan por ese paso igual que
 * pasaría cualquiera al dar de alta una tableta nueva.
 */
export const CLAVE_NUEVA = 'zahavi-pruebas';

/** Receta de tres componentes y catorce ingredientes: la de las pruebas. */
export const RECETA = 'R016';

/**
 * Abre el recetario con la sesion iniciada.
 *
 * Deja fuera el service worker a proposito. Su trabajo es servir la copia
 * guardada, y eso es justo lo que no interesa aqui: una prueba tiene que ver
 * el codigo que se acaba de tocar, no el que quedo en la cache. Hay una prueba
 * aparte para el modo sin conexion.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [hash] a donde ir despues de entrar
 */
export async function entrar(page, hash = '#/') {
  await page.addInitScript(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('sin sw en pruebas'));
    }
  });

  await page.goto('/index.html');

  // Hay que dejar que termine de cargar el recetario antes de escribir: la
  // pantalla de entrada se repinta cuando llegan los datos, y con ella el
  // campo. Escribir antes es tirar la clave a un nodo que ya no existe.
  await page.waitForLoadState('networkidle');

  await page.getByRole('textbox', { name: 'clave', exact: true }).fill(CLAVE);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Con la clave de instalación no se entra: hay que poner una propia antes.
  await page.getByLabel('clave nueva', { exact: true }).fill(CLAVE_NUEVA);
  await page.getByLabel('repetir la clave nueva').fill(CLAVE_NUEVA);
  await page.getByRole('button', { name: 'Guardar y entrar' }).click();

  await page.locator('nav[aria-label="Listado de recetas"]').waitFor();

  if (hash && hash !== '#/') {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await page.locator('.panel').waitFor();
  }
}

/**
 * Cambia lo que se manda a imprimir por una anotacion, y devuelve lo que se
 * habria impreso. Se mira DENTRO de `window.print`, que es el unico instante en
 * el que la hoja tiene que estar montada.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function interceptarImpresion(page) {
  await page.evaluate(() => {
    window.__hojaImpresa = null;
    window.print = () => {
      const hoja = document.querySelector('#print-root .sheet');
      window.__hojaImpresa = hoja
        ? {
            titulo: hoja.querySelector('.sheet__title')?.textContent || '',
            texto: hoja.innerText,
          }
        : null;
    };
  });
}

/**
 * Lo que quedo anotado en la ultima impresion, esperando a que ocurra.
 *
 * La impresion no es inmediata: espera a que la pantalla se haya repintado de
 * verdad, que es justo lo que se quiere comprobar.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function hojaImpresa(page) {
  await page.waitForFunction(() => window.__hojaImpresa !== null, null, { timeout: 7000 });
  return page.evaluate(() => window.__hojaImpresa);
}

/**
 * Cuanto se sale la pagina por los lados. Cero es lo unico aceptable: un
 * desplazamiento horizontal en un telefono esconde contenido sin avisar.
 *
 * @param {import('@playwright/test').Page} page
 */
export function desbordeHorizontal(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
