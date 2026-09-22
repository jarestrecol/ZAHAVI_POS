/**
 * EL AJUSTE A LA PANTALLA DEL TELÉFONO
 *
 * Dos defectos reportados por el obrador con la aplicación YA INSTALADA en la
 * pantalla de inicio, uno en Android y otro en iPhone:
 *
 *   1. "la interfaz no se está ajustando a la pantalla de manera automática y
 *      toca disminuir su tamaño de manera de scroll para que la app vaya
 *      ajustando su tamaño"
 *   2. "al realizar el scroll en la lista de las recetas por segundos
 *      desaparece la pantalla y sigue en un scroll infinito de fondo blanco"
 *
 * Los dos son de maqueta, no de datos, y los dos tienen una causa medible en
 * un navegador sin ventana. Esto es lo que se fija aquí, y por qué:
 *
 *   - La etiqueta `viewport` decide el ancho con el que el navegador maqueta.
 *     Sin `viewport-fit=cover` una aplicación instalada no recibe las medidas
 *     del área segura (la muesca, la barra de gestos), así que o deja franjas
 *     muertas o mete contenido debajo del hardware.
 *   - El documento NO se desplaza en esta aplicación: `.app` es de altura fija
 *     y quien se desplaza es el listado. Si la página gana desplazamiento
 *     vertical, la maqueta se salió de la pantalla, y eso es exactamente el
 *     "toca disminuir su tamaño de manera de scroll".
 *   - El "scroll infinito de fondo blanco" es el rebote del documento: al
 *     llegar al final del listado, el gesto encadena al documento y arrastra
 *     la maqueta entera dejando ver el fondo del `body`. Se corta declarando
 *     `overscroll-behavior` en la raíz, no en el listado (el listado ya lo
 *     tiene, y por eso el defecto sobrevivió).
 *
 * Lo que NO se puede comprobar aquí, y hay que mirar con un teléfono en la
 * mano, está anotado al final del archivo.
 */

import { test, expect } from '@playwright/test';
import { entrar } from './apoyo.js';

/**
 * Los tamaños en los que se usa de verdad. El de 320 px es el mínimo que el
 * proyecto se ha comprometido a soportar; el resto son aparatos reales.
 */
const TAMANOS = [
  { nombre: '320 px, el mínimo soportado', width: 320, height: 640 },
  { nombre: 'iPhone SE', width: 375, height: 667 },
  { nombre: 'Pixel 5', width: 393, height: 851 },
  { nombre: 'iPhone 14 Pro', width: 393, height: 852 },
  { nombre: 'tableta del obrador', width: 834, height: 1112 },
];

/**
 * Cuánto se sale la maqueta por los lados, DESACTIVANDO antes la guarda.
 *
 * `base.css` pone `overflow-x: hidden` en `html, body` a propósito, y está
 * bien puesto: evita que una pieza suelta arrastre la página entera en el
 * obrador. Pero recorta `scrollWidth`, así que medir sin quitarlo devuelve
 * cero aunque la maqueta se esté saliendo. Aquí interesa el desbordamiento
 * real, que es lo que obliga a pellizcar para ver el resto.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>} píxeles que sobran por la derecha
 */
async function desbordeReal(page) {
  return page.evaluate(() => {
    const raiz = document.documentElement;
    const previoRaiz = raiz.style.overflowX;
    const previoCuerpo = document.body.style.overflowX;
    raiz.style.overflowX = 'visible';
    document.body.style.overflowX = 'visible';
    // Forzar el recálculo antes de leer.
    void raiz.offsetWidth;
    const sobra = raiz.scrollWidth - raiz.clientWidth;
    raiz.style.overflowX = previoRaiz;
    document.body.style.overflowX = previoCuerpo;
    return sobra;
  });
}

/**
 * Emula que la aplicación está INSTALADA (`display-mode: standalone`).
 *
 * Los dos defectos se reportaron con la aplicación en la pantalla de inicio,
 * no en una pestaña, y ahí no hay barra de direcciones: la altura disponible
 * es otra y las reglas `@media (display-mode: standalone)` entran en juego.
 * Playwright no lo expone, así que se pide por CDP, que es lo que hay debajo.
 *
 * Devuelve `true` si se pudo emular. No se da por hecho: si el motor no lo
 * admite, la prueba lo dice en vez de fingir que probó algo.
 *
 * @param {import('@playwright/test').Page} page
 */
async function comoInstalada(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'display-mode', value: 'standalone' }],
    });
  } catch {
    return false;
  }

  // Y SE COMPRUEBA QUE HAYA SERVIDO DE ALGO.
  //
  // Que la llamada no lance no significa que la emulacion se haya aplicado:
  // medido en el Chromium de esta suite, `Emulation.setEmulatedMedia` acepta
  // `display-mode` sin protestar y `matchMedia('(display-mode: standalone)')`
  // sigue diciendo `false`. Devolver `true` ahi era lo peor de los dos mundos:
  // la prueba no se saltaba y fallaba por un motivo que no era el suyo, con un
  // mensaje que senalaba a la maqueta.
  //
  // Preguntandoselo al navegador, o la prueba mide de verdad la aplicacion
  // instalada, o se salta diciendo por que. Lo que esta prueba cubre solo se
  // confirma del todo con un telefono en la mano; ver la nota del final.
  return page.evaluate(() => matchMedia('(display-mode: standalone)').matches);
}

/**
 * Espera a que la pantalla se quede QUIETA antes de medir quien pinta cada
 * pixel.
 *
 * `main.js` envuelve cada repintado en la View Transitions API. Mientras esa
 * transicion corre, el navegador no ensena los nodos reales: pinta DOS
 * fotografias del documento en una capa aparte
 * (`::view-transition-old/new(root)`). Durante ese rato `elementFromPoint`
 * devuelve `<html>`, porque lo que hay bajo el dedo es el retrato y no el
 * arbol.
 *
 * Medir ahi da un falso positivo de "hay superficie sin pintar": la pantalla
 * esta perfectamente cubierta, solo que por la capa de la transicion. Medido:
 * justo despues de entrar devuelve `<html>`, y 600 ms mas tarde devuelve
 * `ul.sidebar__list`, sin que nada haya cambiado en el CSS.
 *
 * Es exactamente el tipo de prueba inestable que ya esta en el historial de
 * defectos del proyecto -medir de una sola pasada algo que aun se mueve-, y por
 * eso se espera a una condicion concreta en vez de a un numero de milisegundos.
 *
 * @param {import('@playwright/test').Page} page
 */
async function esperarQuietud(page) {
  await page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some((a) => String((a.effect && a.effect.pseudoElement) || '').startsWith('::view-transition')),
    null,
    { timeout: 5_000 },
  );
}

test.describe('La etiqueta viewport', () => {
  test('declara viewport-fit=cover, o la app instalada no ve el área segura', async ({ page }) => {
    await page.goto('/index.html');
    const contenido = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');

    expect(contenido, 'no hay etiqueta viewport').not.toBeNull();
    expect(contenido).toContain('width=device-width');
    expect(contenido).toContain('initial-scale=1');
    // Sin esto, en un iPhone con muesca el navegador maqueta dentro de un
    // rectángulo menor que la pantalla y deja franjas; y `env(safe-area-inset-*)`
    // vale cero siempre, así que ningún CSS puede corregirlo.
    expect(
      contenido,
      'falta viewport-fit=cover: la app instalada no recibe las medidas del área segura',
    ).toContain('viewport-fit=cover');
  });

  test('y NO bloquea el zoom: pellizcar tiene que seguir siendo posible', async ({ page }) => {
    await page.goto('/index.html');
    const contenido = await page.locator('meta[name="viewport"]').getAttribute('content');

    // Lo que pidió el obrador es que NO HAGA FALTA pellizcar, no que se
    // prohíba. Bloquearlo incumple WCAG 2.2 AA 1.4.4 (Resize text), que este
    // proyecto declara como objetivo, y le quita el recurso a quien lee peor.
    expect(contenido, 'user-scalable=no incumple WCAG 1.4.4').not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    expect(contenido, 'maximum-scale=1 incumple WCAG 1.4.4').not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/i);
  });

  test('y el CSS usa el área segura que esa etiqueta habilita', async ({ page }) => {
    await page.goto('/index.html');

    // `viewport-fit=cover` sin relleno de área segura EMPEORA las cosas: la
    // barra de acciones se va debajo de la barra de gestos de Android y del
    // indicador de inicio de iOS. Las dos piezas van juntas o ninguna.
    const usaAreaSegura = await page.evaluate(() => {
      for (const hoja of document.styleSheets) {
        let reglas;
        try {
          reglas = hoja.cssRules;
        } catch {
          continue; // hoja de otro origen: aquí no hay ninguna, pero no se asume
        }
        for (const regla of reglas) {
          if (regla.cssText && regla.cssText.includes('safe-area-inset')) return true;
        }
      }
      return false;
    });

    expect(
      usaAreaSegura,
      'ninguna hoja usa env(safe-area-inset-*): con viewport-fit=cover el contenido se mete bajo el hardware',
    ).toBe(true);
  });
});

test('la preferencia de alto contraste refuerza los limites de trabajo', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto('/index.html');

  // No basta con que exista una media query: se comprueba el token que recibe
  // toda la interfaz. Asi un cambio de orden que la deje tapada por la paleta
  // normal se detecta antes de llegar a la tableta bajo luz directa.
  const tokens = await page.evaluate(() => {
    const estilo = getComputedStyle(document.documentElement);
    return {
      linea: estilo.getPropertyValue('--line-strong').trim(),
      textura: estilo.getPropertyValue('--texture-dot').trim(),
    };
  });

  expect(tokens.linea).toBe('#4a443c');
  expect(tokens.textura).toBe('none');
});

test('el aviso de trabajo aislado conserva su accion sin ocupar media pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await entrar(page, '#/');

  const aviso = page.locator('.context-badge--warn');
  await expect(aviso).toBeVisible();
  await expect(aviso.getByRole('button', { name: 'Ver estado' })).toBeVisible();

  const medida = await aviso.evaluate((elemento) => {
    const avisoRect = elemento.getBoundingClientRect();
    const botonRect = elemento.querySelector('button').getBoundingClientRect();
    return { alto: avisoRect.height, altoBoton: botonRect.height };
  });

  expect(medida.alto, 'el aviso no debe desplazar el trabajo fuera de vista').toBeLessThanOrEqual(72);
  expect(medida.altoBoton, 'Ver estado debe seguir siendo un blanco tactil').toBeGreaterThanOrEqual(44);
});

for (const tamano of TAMANOS) {
  test.describe(`Ajuste a la pantalla · ${tamano.nombre}`, () => {
    test.use({ viewport: { width: tamano.width, height: tamano.height } });

    test('la maqueta cabe de ancho sin pellizcar', async ({ page }) => {
      await entrar(page);
      expect(
        await desbordeReal(page),
        `la maqueta se sale ${tamano.width} px de ancho: hay que reducir el zoom para verla entera`,
      ).toBe(0);
    });

    /*
     * EL MENU TIENE SU PROPIA COMPROBACION, y no sobra.
     *
     * Las demas pruebas de este archivo entran directamente al recetario, que es
     * lo que quieren medir. Pero el menu es la pantalla A LA QUE SE ENTRA desde
     * que el sistema tiene modulos: es la primera que ve el obrador al abrir el
     * telefono por la mañana, y es la unica con tarjetas de ancho minimo fijo
     * (`minmax(17rem, 1fr)`), que es exactamente la forma de romper el ajuste a
     * 320 px sin que nadie se entere hasta que lo abre alguien.
     */
    test('el menú de módulos cabe sin pellizcar y no se desplaza de lado', async ({ page }) => {
      await entrar(page, '#/');
      await expect(page.locator('.inicio')).toBeVisible();

      expect(
        await desbordeReal(page),
        `el menú se sale de ${tamano.width} px de ancho`,
      ).toBe(0);

      const medida = await page.evaluate(() => ({
        sobra: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        // El menu SI puede ser mas alto que la pantalla y desplazarse por
        // dentro: lo que no puede es arrastrar el documento.
        desplazaPorDentro:
          document.querySelector('.inicio').scrollHeight >
          document.querySelector('.inicio').clientHeight,
      }));

      expect(
        medida.sobra,
        'el documento se desplaza: el menú se salió de la pantalla en vez de desplazarse por dentro',
      ).toBeLessThanOrEqual(1);
      // No se afirma nada sobre `desplazaPorDentro`: que quepa o no depende del
      // tamaño, y las dos cosas son correctas. Se lee para que, el día que esto
      // falle, el informe diga cuál de los dos casos era.
      expect(typeof medida.desplazaPorDentro).toBe('boolean');
    });

    test('el documento no se desplaza en vertical: quien se desplaza es el listado', async ({ page }) => {
      await entrar(page);

      const medida = await page.evaluate(() => ({
        sobra: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        altoApp: Math.round(document.querySelector('.app').getBoundingClientRect().height),
        pantalla: window.innerHeight,
      }));

      // `.app` es `height: 100dvh; overflow: hidden`. Si la página gana
      // desplazamiento vertical es que algo se salió de esa caja, y ese es el
      // "toca disminuir su tamaño de manera de scroll".
      expect(medida.sobra, 'la página se desplaza en vertical: la maqueta se salió de la pantalla').toBeLessThanOrEqual(1);
      expect(medida.altoApp, '.app es más alta que la pantalla').toBeLessThanOrEqual(medida.pantalla + 1);
    });

    test('empujar la página no la mueve de sitio', async ({ page }) => {
      await entrar(page);

      await page.evaluate(() => window.scrollBy(0, 2000));
      expect(
        await page.evaluate(() => Math.round(window.scrollY)),
        'la página entera se desplazó: la maqueta no está anclada a la pantalla',
      ).toBe(0);
    });

    test('el rebote del documento está cortado en la raíz', async ({ page }) => {
      await entrar(page);

      const rebote = await page.evaluate(() => ({
        raiz: getComputedStyle(document.documentElement).overscrollBehaviorY,
        cuerpo: getComputedStyle(document.body).overscrollBehaviorY,
      }));

      // Este es el "scroll infinito de fondo blanco". El listado ya declara
      // `overscroll-behavior: contain`, y por eso el defecto sobrevivió: lo que
      // rebota es el DOCUMENTO, y eso se corta en `html`/`body`. Con `auto`,
      // seguir arrastrando al final de la lista despega la maqueta y deja ver
      // el fondo del cuerpo.
      const cortado = (valor) => valor === 'none' || valor === 'contain';
      expect(
        cortado(rebote.raiz) || cortado(rebote.cuerpo),
        `overscroll-behavior-y es "${rebote.raiz}" en html y "${rebote.cuerpo}" en body: el documento rebota y deja ver el fondo blanco`,
      ).toBe(true);
    });

    test('llegar al final del listado no descubre superficie sin pintar', async ({ page }) => {
      await entrar(page);

      const lista = page.locator('.sidebar__list');
      await expect(lista).toBeVisible();

      // Hasta el final de verdad, sin esperas al azar: se pide el final y se
      // espera a que la posición deje de cambiar.
      await lista.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await expect
        .poll(() => lista.evaluate((el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 1))
        .toBe(true);

      // Y ahora se sigue empujando, que es lo que hace el pulgar al llegar al
      // final. La rueda es lo más parecido a ese gesto que hay sin ventana.
      await page.mouse.move(tamano.width / 2, tamano.height / 2);
      await page.mouse.wheel(0, 1200);

      // Sin esto se mide encima de la transicion de entrada y `elementFromPoint`
      // devuelve `<html>` aunque la pantalla este entera cubierta.
      await esperarQuietud(page);

      const estado = await page.evaluate(() => {
        const x = Math.round(window.innerWidth / 2);
        const abajo = document.elementFromPoint(x, window.innerHeight - 2);
        const app = document.querySelector('.app');
        return {
          desplazada: Math.round(window.scrollY),
          ultimoPintado: abajo ? abajo.tagName : 'NADA',
          dentroDeLaApp: Boolean(abajo && app && app.contains(abajo)),
        };
      });

      expect(estado.desplazada, 'el documento se movió al empujar el final de la lista').toBe(0);
      // Si el último píxel de la pantalla lo pinta `html` o `body`, eso es
      // literalmente la franja de fondo blanco que reportó el obrador.
      expect(
        estado.dentroDeLaApp,
        `el borde inferior de la pantalla lo pinta <${estado.ultimoPintado}>, fuera de .app: hay superficie sin pintar`,
      ).toBe(true);
    });
  });
}

test.describe('Con la aplicación instalada (display-mode: standalone)', () => {
  test.use({ viewport: { width: 393, height: 851 } });

  test('sigue cabiendo y sigue sin desplazarse', async ({ page }) => {
    // La emulacion se pide DESPUES de entrar, y no antes, porque no sobrevive a
    // la navegacion que hace `entrar`: se perdia por el camino y la prueba
    // acababa midiendo una pestana normal creyendo medir la app instalada.
    // `matchMedia` se reevalua en vivo, asi que aplicarla aqui vale para todo
    // lo que se mide debajo.
    await entrar(page);

    const emulado = await comoInstalada(page);
    test.skip(!emulado, 'este motor no permite emular display-mode: standalone');

    // Que de verdad se está probando el modo instalado, y no la pestaña de
    // siempre con otro nombre.
    expect(
      await page.evaluate(() => matchMedia('(display-mode: standalone)').matches),
      'no se llegó a emular la aplicación instalada',
    ).toBe(true);

    expect(await desbordeReal(page), 'instalada, la maqueta se sale de ancho').toBe(0);

    const sobra = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(sobra, 'instalada, la página gana desplazamiento vertical').toBeLessThanOrEqual(1);
  });

  test('la barra de acciones de la receta no queda debajo del borde', async ({ page }) => {
    await entrar(page, '#/receta/R016');

    const emulado = await comoInstalada(page);
    test.skip(!emulado, 'este motor no permite emular display-mode: standalone');

    const barra = page.locator('.sheet-head__actions');
    await expect(barra).toBeVisible();

    const caja = await barra.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { abajo: r.bottom, alto: r.height, pantalla: window.innerHeight };
    });

    // Cortada por abajo significa que en un teléfono real quedaría bajo la
    // barra de gestos. Sin ventana no hay área segura, así que aquí solo se
    // puede exigir que quepa: la comprobación de verdad va con un teléfono.
    expect(caja.abajo, 'la barra de acciones se sale por abajo').toBeLessThanOrEqual(caja.pantalla + 1);
    expect(caja.alto, 'la barra de acciones no se está pintando').toBeGreaterThan(0);
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────
 *  LO QUE ESTA PRUEBA NO ALCANZA, Y HAY QUE MIRAR CON UN TELÉFONO EN LA MANO
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  - El área segura de verdad. En un navegador sin ventana `env(safe-area-inset-*)`
 *    vale 0 SIEMPRE, así que aquí no se puede ver si la barra de acciones queda
 *    debajo del indicador de inicio de un iPhone 14 o de la barra de gestos de
 *    Android. Hay que abrirlo instalado, en un aparato con muesca.
 *  - El rebote elástico. Chromium sin ventana no lo hace. Lo que se comprueba
 *    aquí es su causa (`overscroll-behavior` sin declarar), no el efecto.
 *  - La barra de direcciones que aparece y desaparece al desplazar en Safari,
 *    que es lo que hace que `100vh` mienta. En modo instalado no existe, pero
 *    quien abra el enlace en una pestaña sí la tiene.
 *  - El teclado en pantalla, que en iOS reduce la ventana visual y no el
 *    `viewport` de maqueta.
 *  - El nivel de zoom que el navegador recuerda por sitio: si alguien redujo
 *    el tamaño a mano para poder trabajar, seguirá reducido después del
 *    arreglo hasta que lo restablezca.
 */
