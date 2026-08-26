/**
 * CELULAR Y TABLETA
 *
 * Cuatro de los seis defectos de la ultima revision solo existian aqui: una
 * barra que se creia flotante y estaba atrapada bajo la cabecera, un listado
 * que se iba de lado, dos botones montados uno encima del otro y un control
 * que no habia forma de pulsar. En escritorio no se veia ninguno.
 *
 * Fija lo que solo se rompe en un telefono: acciones al alcance del pulgar,
 * nada solapado a 320 px y los cinco factores de la tanda alcanzables.
 */

import { test, expect } from '@playwright/test';
import { entrar, desbordeHorizontal, RECETA, abrirRecetaDesde, alturaDelListado } from './apoyo.js';

test.describe('Celular', () => {
  test('las acciones de la receta llegan abajo, al pulgar', async ({ page }) => {
    await entrar(page, `#/receta/${RECETA}`);

    const barra = page.locator('.sheet-head__actions');
    const medidas = await barra.evaluate((el) => ({
      posicion: getComputedStyle(el).position,
      alFondo: Math.round(window.innerHeight - el.getBoundingClientRect().bottom),
    }));

    expect(medidas.posicion).toBe('fixed');
    // Pegada al borde inferior. Cuando la cabecera la atrapaba, esta distancia
    // eran 660px: la barra flotaba, pero arriba del todo.
    expect(medidas.alFondo).toBeLessThan(24);
  });

  test('el contenido no queda tapado por esa barra', async ({ page }) => {
    await entrar(page, `#/receta/${RECETA}`);
    const aire = await page
      .locator('.sheet-view')
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    expect(aire).toBeGreaterThan(60);
  });

  test('a 320 px ningun boton se monta sobre otro', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await entrar(page, `#/receta/${RECETA}`);

    const botones = await page.locator('.btn--action').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const etiqueta = el.querySelector('.btn__label');
        const re = etiqueta ? etiqueta.getBoundingClientRect() : null;
        return {
          nombre: el.getAttribute('aria-label'),
          izq: r.left,
          der: r.right,
          etiquetaDer: re && re.width ? re.right : r.right,
        };
      }),
    );

    for (let i = 1; i < botones.length; i += 1) {
      const previo = botones[i - 1];
      expect(previo.der, `${previo.nombre} invade a ${botones[i].nombre}`).toBeLessThanOrEqual(botones[i].izq + 1);
      expect(previo.etiquetaDer, `la etiqueta de ${previo.nombre} se sale`).toBeLessThanOrEqual(previo.der + 1);
    }

    expect(await desbordeHorizontal(page)).toBe(0);
  });

  test('a 320 px se pueden pulsar los cinco factores de la tanda', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await entrar(page, `#/receta/${RECETA}`);

    // El segmento va en `overflow: hidden`: lo que no entra no se alcanza de
    // ninguna manera, ni desplazando ni tabulando.
    const ancho = await page.evaluate(() => document.documentElement.clientWidth);
    const factores = await page.locator('.scaler__btn').evaluateAll((els) =>
      els.map((el) => ({ texto: el.textContent.trim(), der: el.getBoundingClientRect().right })),
    );
    expect(factores).toHaveLength(5);
    for (const factor of factores) {
      expect(factor.der, `${factor.texto} queda fuera de la pantalla`).toBeLessThanOrEqual(ancho + 1);
    }

    // Y el ultimo multiplica de verdad.
    await page.getByRole('button', { name: 'Multiplicar la tanda por 4' }).click();
    await expect(page.locator('.facts')).toContainText('4 und');
  });

  test('las ventanas suben desde el borde inferior', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Plan del día', exact: true }).click();

    const hoja = await page.locator('[role=dialog]').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        alFondo: Math.round(window.innerHeight - r.bottom),
        ocupaElAncho: r.width >= document.documentElement.clientWidth - 2,
      };
    });
    expect(hoja.alFondo).toBeLessThanOrEqual(1);
    expect(hoja.ocupaElAncho).toBe(true);
  });
});

test.describe('Celular', () => {
  /*
   * EL TECLADO NO PUEDE PARPADEAR AL ESCRIBIR.
   *
   * Lo reporto el obrador: escribir en el buscador desde el telefono era una
   * pelea porque el teclado se cerraba y se volvia a abrir con cada pulsacion.
   * La causa era la del repintado completo: el campo enfocado se sacaba del
   * documento y se fabricaba otro, y quitar el foco cierra el teclado del
   * sistema.
   *
   * Aqui no se puede mirar el teclado, asi que se comprueba su causa, que es lo
   * que de verdad interesa fijar: que el campo sea EL MISMO NODO despues del
   * repintado. Se le pone una marca; si alguien vuelve a reconstruirlo, la
   * marca se va con el nodo viejo y esta prueba se pone roja.
   */
  test('escribir no reconstruye el buscador ni le quita el foco', async ({ page }) => {
    await entrar(page);

    const buscador = page.getByRole('searchbox', { name: 'Buscar receta' });
    const contador = page.locator('nav [role=status]');

    await buscador.click();
    await buscador.evaluate((campo) => {
      campo.dataset.testigo = 'el-mismo-nodo';
    });

    // 200 ms entre teclas, por encima de los 160 del retardo del buscador: asi
    // CADA pulsacion provoca su propio repintado completo, que es la situacion
    // exacta que se reporto. Con teclas mas rapidas solo repintaria al final y
    // la prueba pasaria sin haber ejercitado nada.
    await buscador.pressSequentially('brioche', { delay: 200 });

    // El recuento cambia solo cuando el listado ya se repinto: hasta aqui ha
    // habido al menos un repintado completo con el campo enfocado dentro.
    await expect(contador).toHaveText('2 recetas');

    await expect(buscador).toHaveAttribute('data-testigo', 'el-mismo-nodo');
    await expect(buscador).toBeFocused();

    // Y lo que se escribe DESPUES del repintado se anade donde toca. Cuando el
    // campo se reconstruia y el cursor se devolvia a mano un cuadro de
    // animacion mas tarde, escribir encima de una busqueda anterior daba
    // "briocheR005".
    await buscador.pressSequentially('s', { delay: 200 });
    await expect(buscador).toHaveValue('brioches');
  });
});

test.describe('Celular', () => {
  /*
   * VOLVER DE UNA RECETA NO PUEDE MANDAR EL LISTADO ARRIBA.
   *
   * Aqui no caben la lista y la ficha a la vez, asi que abrir una receta pone
   * la lista en `display: none`. Un elemento sin caja no se desplaza: leerle el
   * `scrollTop` da 0 y escribirselo no hace nada. Mientras la posicion se
   * guardaba en el propio nodo, abrir una receta la perdia y volver dejaba el
   * indice arriba del todo, con lo que despues de cada consulta habia que bajar
   * otra vez hasta donde uno estaba. Lo reporto el obrador.
   */
  test('volver de una receta deja el listado donde estaba', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('.sidebar__list')).toBeVisible();

    const { altura } = await abrirRecetaDesde(page, 900);
    expect(altura).toBeGreaterThan(0);
    await expect(page.locator('.sheet-view')).toBeVisible();

    await page.getByRole('button', { name: 'Volver al listado de recetas' }).click();
    await expect(page.locator('.sidebar__list')).toBeVisible();

    await expect.poll(() => alturaDelListado(page)).toBe(altura);
  });
});

test.describe('Celular', () => {
  /*
   * Y LA DEJA MARCADA.
   *
   * Conservar el sitio no basta: en una columna de 121 filas iguales, volver a
   * la altura correcta sigue dejando la pregunta de cual de las que se ven era
   * la que se acababa de consultar. Aqui la ficha ocupa la pantalla entera, asi
   * que al volver no hay ninguna receta abierta y, sin memoria, no quedaba ni
   * rastro.
   */
  test('volver de una receta la deja marcada en el listado', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('.sidebar__list')).toBeVisible();

    const { id } = await abrirRecetaDesde(page, 900);
    await expect(page.locator('.sheet-view')).toBeVisible();

    await page.getByRole('button', { name: 'Volver al listado de recetas' }).click();
    await expect(page.locator('.sidebar__list')).toBeVisible();

    const fila = page.locator(`.recipe-link[data-id="${id}"]`);
    await expect(fila).toHaveClass(/is-active/);

    // Una y nada mas que una.
    await expect(page.locator('.recipe-link.is-active')).toHaveCount(1);

    // Ya no esta abierta, asi que no se anuncia como el elemento actual: en su
    // lugar lleva la nota que solo oye quien usa lector de pantalla.
    await expect(fila).not.toHaveAttribute('aria-current', 'true');
    await expect(fila).toContainText('la última que abriste');
  });
});
