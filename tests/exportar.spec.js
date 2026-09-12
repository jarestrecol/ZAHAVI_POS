/**
 * EXPORTAR E IMPRIMIR EL CATALOGO DE INGREDIENTES
 *
 * El obrador pidio poder sacar la lista de ingredientes para ponerle precios
 * fuera del recetario. Lo que se fija aqui son las dos cosas que deciden si el
 * archivo sirve o nace inservible, y que NO se ven abriendolo a ojo:
 *
 *   - El BOM de UTF-8 al principio. Sin el, Excel abre el archivo como ANSI y
 *     `AZÚCAR` sale `AZÃšCAR`. Este recetario esta lleno de acentos.
 *   - El separador `;`. Con coma, Excel en español mete TODA la tabla en la
 *     columna A y hay que rescatarla con el asistente de importacion.
 *
 * Los dos fallan en silencio, y por eso tienen prueba.
 *
 * Se comprueba ademas que la descarga no la bloquea la politica de seguridad:
 * la suite levanta el servidor con las cabeceras de produccion a proposito
 * (`default-src 'none'`, sin `blob:` declarado), asi que esto se mide de verdad.
 */

import { test, expect } from '@playwright/test';
import { entrar, abrirModulo, interceptarImpresion, hojaImpresa } from './apoyo.js';

/** Abre el catalogo de ingredientes por su tarjeta del menu. */
async function abrirIngredientes(page) {
  await abrirModulo(page, 'ingredientes');
}

/**
 * Pulsa "Exportar a Excel" y devuelve el contenido del archivo descargado.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{nombre: string, texto: string}>}
 */
async function exportar(page) {
  const esperaDescarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar a Excel' }).click();
  const descarga = await esperaDescarga;

  const ruta = await descarga.path();
  const { readFile } = await import('node:fs/promises');
  return {
    nombre: descarga.suggestedFilename(),
    texto: await readFile(ruta, 'utf8'),
  };
}

test.describe('Exportar el catálogo', () => {
  test('se descarga de verdad, con la fecha en el nombre', async ({ page }) => {
    await entrar(page);
    await abrirIngredientes(page);

    const archivo = await exportar(page);
    expect(archivo.nombre).toMatch(/^zahavi-ingredientes-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(archivo.texto.length).toBeGreaterThan(1000);
  });

  test('empieza por el BOM de UTF-8, o Excel parte los acentos', async ({ page }) => {
    await entrar(page);
    await abrirIngredientes(page);

    const archivo = await exportar(page);
    expect(
      archivo.texto.charCodeAt(0),
      'falta el BOM: Excel abriría el archivo como ANSI',
    ).toBe(0xfeff);

    // Y los acentos llegan enteros. `AZÚCAR` es el caso real del recetario.
    expect(archivo.texto).toContain('AZÚCAR');
  });

  test('usa punto y coma como separador, que es el del español', async ({ page }) => {
    await entrar(page);
    await abrirIngredientes(page);

    const archivo = await exportar(page);
    const cabecera = archivo.texto.replace('﻿', '').split('\r\n')[0];

    expect(cabecera.split(';')).toContain('Ingrediente');
    expect(cabecera.split(';')).toContain('Unidad');
    // La columna vacía que convierte esto en una plantilla, que es para lo que
    // se pidió: exportar para PONER precios.
    expect(cabecera.split(';')).toContain('Precio por unidad');
  });

  test('un ingrediente medido de dos formas sale en dos filas, una por unidad', async ({ page }) => {
    await entrar(page);
    await abrirIngredientes(page);

    const archivo = await exportar(page);
    const filas = archivo.texto
      .replace('﻿', '')
      .split('\r\n')
      .slice(1)
      .map((f) => f.split(';'));

    // AGUA se mide en GR y en ML en las recetas reales. Son dos filas, no una
    // con dos cifras dentro: un precio solo puede existir por unidad de medida.
    const agua = filas.filter((f) => f[0] === 'AGUA');
    expect(agua.length, 'AGUA debería salir una vez por cada unidad').toBeGreaterThan(1);
    const unidades = agua.map((f) => f[1]).sort();
    expect(unidades).toEqual([...new Set(unidades)].sort());
  });

  test('NO lleva las cantidades por receta: no se pueden reconstruir las fórmulas', async ({ page }) => {
    await entrar(page);
    await abrirIngredientes(page);

    const archivo = await exportar(page);

    // La sección 8 de CLAUDE.md declara que sacar una copia completa de las
    // fórmulas no debe poder hacerse desde el mostrador. Esta exportación es el
    // catálogo de la compra: nombres y totales agregados, nada por receta.
    const cabecera = archivo.texto.replace('﻿', '').split('\r\n')[0].split(';');
    expect(cabecera).not.toContain('Receta');
    expect(archivo.texto).not.toContain('R001');
    // Ni un solo nombre de receta del recetario real.
    expect(archivo.texto).not.toContain('CHEESCAKE');
  });
});

test.describe('Imprimir el catálogo', () => {
  test('imprime el catálogo, y no la receta que hubiera detrás', async ({ page }) => {
    await entrar(page);
    await interceptarImpresion(page);
    await abrirIngredientes(page);

    await page.getByRole('button', { name: 'Imprimir la lista' }).click();

    const hoja = await hojaImpresa(page);
    expect(hoja, 'no se llegó a montar ninguna hoja').not.toBeNull();
    expect(hoja.titulo).toContain('Catálogo de ingredientes');
    // La hoja escribe los nombres en mayúscula inicial, como el resto de lo
    // que se imprime en este proyecto.
    expect(hoja.texto).toContain('Azúcar');
  });
});
