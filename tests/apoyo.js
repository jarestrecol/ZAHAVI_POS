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
 * DESDE QUE HAY MENU DE MODULOS, entrar deja en el menu y no en el recetario.
 * Por eso el valor por defecto es `#/recetario` y no `#/`: casi todas las
 * pruebas quieren el listado, y hacerlas pasar por el menu a mano solo anadiria
 * ruido. La que quiera comprobar el menu pide `#/` explicitamente.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [hash] a donde ir despues de entrar
 */
export async function entrar(page, hash = '#/recetario') {
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

  // Lo primero que aparece es el menu de modulos.
  await page.locator('.inicio').waitFor();

  if (hash && hash !== '#/') {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    /*
     * Se espera a la carcasa del modulo, y SOLO a ella.
     *
     * Hubo aqui un `('.app, .inicio').first()` para cubrir tambien las
     * direcciones ilegibles, que caen en el menu. Era una carrera: el menu
     * sigue en el documento unos milisegundos despues de cambiar el hash
     * -el repintado va detras de la transicion de vista-, asi que `.first()`
     * resolvia sobre el menu viejo y devolvia el control antes de tiempo. Las
     * pruebas de movil median entonces una pantalla a medio cambiar y fallaban
     * las cuatro.
     *
     * Quien necesite comprobar una direccion que no se entiende, que entre al
     * menu y cambie el hash por su cuenta: son dos lineas y no obligan a que
     * este ayudante adivine.
     *
     * Cual sea la carcasa depende del modulo, y por eso se deduce del hash en
     * vez de aceptar las dos: produccion, ingredientes y almacen son pantallas
     * completas (`.pantalla`) y ya no cuelgan de `.app`. Esperar `.app,
     * .pantalla` seria volver al `.first()` que hubo aqui y a su carrera.
     */
    await page.locator(carcasaDe(hash)).waitFor();
  }
}

/**
 * Que nodo anuncia que la pantalla de una direccion ya esta puesta.
 *
 * @param {string} hash
 * @returns {string} un selector
 */
function carcasaDe(hash) {
  // `[/?]` y no un limite de palabra: la direccion de un modulo puede traer
  // el parametro de la receta de fondo (`#/plan?r=R010`).
  const visto = /^#\/(plan|ingredientes|almacen)(?:[/?]|$)/.exec(hash);
  return visto ? `.pantalla[data-modulo="${visto[1]}"]` : '.app';
}

/**
 * Abre un modulo COMO SE ABRE DE VERDAD: por su tarjeta del menu.
 *
 * Antes cada prueba pulsaba el boton que ese modulo tenia en la barra del
 * recetario. Esos botones ya no existen -produccion, ingredientes y almacen
 * dejaron de ser ventanas que se abrian encima del recetario para ser pantallas
 * propias-, y el camino real pasa por el menu. Que las pruebas hagan el mismo
 * recorrido que una persona es justamente lo que hace que sirvan.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'plan'|'ingredientes'|'almacen'} modulo
 */
export async function abrirModulo(page, modulo) {
  /*
   * SE PREGUNTA SI YA SE ESTA EN EL MENU, NO SI HAY UN BOTON DE «Menú».
   *
   * Mirar el boton parece lo natural y es una carrera: con una transicion de
   * vista por medio, la barra anterior sigue en el documento unos milisegundos
   * despues de que el hash haya cambiado, asi que se encuentra un boton que se
   * esta yendo y pulsarlo falla con «element was detached from the DOM». Es el
   * mismo fallo fantasma que ya dio aqui el `('.app, .inicio').first()`.
   *
   * Y desde una pantalla de modulo «Menú» esta en su barra, desde el recetario
   * en la suya: el mismo boton en el mismo sitio, que es lo que se gano al
   * unificar la barra.
   */
  if (!(await page.locator('.inicio').count())) {
    await page.getByRole('button', { name: 'Menú', exact: true }).first().click();
  }

  const tarjeta = page.locator(`.inicio .modulo[data-tono="${modulo}"]`);
  await tarjeta.waitFor();
  await tarjeta.click();
  await page.locator(`.pantalla[data-modulo="${modulo}"]`).waitFor();
}

/**
 * Sale del modulo que este abierto y espera a que se haya ido.
 *
 * Escape es la salida, la misma que respetaban las ventanas modales.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function salirDelModulo(page) {
  await page.keyboard.press('Escape');
  await page.locator('.pantalla').waitFor({ state: 'detached' });
}

/**
 * Abre Ajustes, que vive en el menu desde que la barra del recetario se quedo
 * con lo justo: volver al menu y crear una receta.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function abrirAjustes(page) {
  // La misma pregunta que en `abrirModulo`, por el mismo motivo.
  if (!(await page.locator('.inicio').count())) {
    await page.getByRole('button', { name: 'Menú', exact: true }).first().click();
  }

  await page.locator('.inicio').waitFor();
  await page.getByRole('button', { name: 'Ajustes' }).click();
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
