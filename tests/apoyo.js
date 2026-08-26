/**
 * Piezas comunes de las pruebas de navegador.
 *
 * Ninguna prueba crea, edita ni borra recetas reales: todas leen. Las que
 * necesitan escribir lo hacen sobre recetas con el prefijo `QA-TEST-`, que es
 * la misma regla que sigue la verificacion manual.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** El recetario publicado, para armar con el las cifras que las pruebas esperan. */
const PUBLICADO = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/recipes.json', import.meta.url)), 'utf8'),
);

/**
 * Cuantas recetas hay publicadas ahora mismo.
 *
 * SE CUENTA DEL ARCHIVO, NO SE ESCRIBE. Estaba a mano como 121 en cinco
 * pruebas, y la panaderia publico la receta 122 desde el obrador: las cinco se
 * pusieron rojas de golpe sin que nada estuviera roto. Lo que estas pruebas
 * comprueban no es cuantas recetas hay -eso lo decide la panaderia, no el
 * codigo- sino que el listado las muestre TODAS.
 */
export const TOTAL_RECETAS = PUBLICADO.recipes.length;

/**
 * Nombre accesible del boton de un filtro de categoria, tal y como lo escribe
 * `views/sidebar.js`: "galletas (22 recetas)".
 *
 * SE ARMA CON LA CIFRA REAL. Estaba escrito a mano -"galletas (21 recetas)"- en
 * dos pruebas, y bastó con que la panaderia publicara una galleta desde el
 * obrador para que las dos dejaran de encontrar el boton. Lo que se quiere
 * comprobar es que el filtro EXISTE y dice cuantas hay, no cuantas hay.
 *
 * @param {string} categoria en mayusculas, como viene en los datos
 * @returns {string}
 */
export function filtro(categoria) {
  const total = cuantasEn(categoria);
  return `${categoria.toLowerCase()} (${total} ${total === 1 ? 'receta' : 'recetas'})`;
}

/**
 * Cuantas recetas publicadas hay en una categoria. `TODAS` devuelve el total.
 *
 * @param {string} categoria en mayusculas, como viene en los datos
 * @returns {number}
 */
export function cuantasEn(categoria) {
  if (categoria === 'TODAS') return PUBLICADO.recipes.length;
  return PUBLICADO.recipes.filter((r) => r.categoria === categoria).length;
}

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

/**
 * Desplaza el listado y abre una receta SIN mover la lista de sitio.
 *
 * Lo segundo es la mitad del asunto: `locator.click()` desplaza el elemento a la
 * vista antes de pulsarlo, asi que pulsar asi mueve justo lo que se quiere
 * medir. Aqui se pulsa desde la propia pagina, que no desplaza nada.
 *
 * Devuelve la altura a la que quedo el listado -contra la que hay que comparar
 * despues, porque la pedida puede no ser alcanzable si la lista es corta- y el
 * codigo de la receta que se abrio.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} alturaPedida
 * @returns {Promise<{altura: number, id: string}>}
 */
export async function abrirRecetaDesde(page, alturaPedida) {
  const lista = page.locator('.sidebar__list');
  await lista.evaluate((el, alto) => { el.scrollTop = alto; }, alturaPedida);
  const altura = await lista.evaluate((el) => el.scrollTop);

  // Una receta de las que SE VEN, comparando rectangulos: `offsetTop` no sirve,
  // porque la lista no esta posicionada y ese valor no es relativo a ella.
  const id = await lista.evaluate((el) => {
    const caja = el.getBoundingClientRect();
    const visible = [...el.querySelectorAll('.recipe-link')].find((enlace) => {
      const r = enlace.getBoundingClientRect();
      return r.top > caja.top + 60 && r.bottom < caja.bottom - 10;
    });
    return visible ? visible.dataset.id : null;
  });

  await page.locator(`.recipe-link[data-id="${id}"]`).evaluate((enlace) => enlace.click());
  return { altura, id };
}

/**
 * Altura actual del listado.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
export function alturaDelListado(page) {
  return page.locator('.sidebar__list').evaluate((el) => el.scrollTop);
}

/**
 * Contraste real entre los fondos de dos elementos.
 *
 * Compone el alfa contra lo que cada uno tiene detras: `getComputedStyle`
 * devuelve el color DECLARADO con su transparencia, no el que se acaba viendo,
 * y sin componerlo un blanco al 4 % sobre un rail oscuro se leeria como casi
 * blanco y la medida no diria nada.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selectorA
 * @param {string} selectorB
 * @returns {Promise<number>} la razon de contraste, de 1 a 21
 */
export function contrasteDeFondos(page, selectorA, selectorB) {
  return page.evaluate(([a, b]) => {
    const cifras = (valor) => valor.match(/[0-9.]+/g).map(Number);

    // Se sube por los ancestros hasta el primero que pinte de verdad, en vez de
    // dar por hecho cual es.
    const detras = (nodo) => {
      for (let n = nodo.parentElement; n; n = n.parentElement) {
        const color = cifras(getComputedStyle(n).backgroundColor);
        if (color.length < 4 || color[3] === 1) return color.slice(0, 3);
      }
      return [255, 255, 255];
    };

    const compuesto = (sel) => {
      const nodo = document.querySelector(sel);
      const [r, g, azul, alfa = 1] = cifras(getComputedStyle(nodo).backgroundColor);
      const fondo = detras(nodo);
      return [r, g, azul].map((canal, i) => canal * alfa + fondo[i] * (1 - alfa));
    };

    const canal = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminancia = ([r, g, azul]) =>
      0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(azul);

    const luzA = luminancia(compuesto(a));
    const luzB = luminancia(compuesto(b));
    return (Math.max(luzA, luzB) + 0.05) / (Math.min(luzA, luzB) + 0.05);
  }, [selectorA, selectorB]);
}
