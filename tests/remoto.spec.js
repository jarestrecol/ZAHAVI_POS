import { test, expect } from '@playwright/test';

async function montar(page) {
  await page.route('**/ensayo-remoto', route => route.fulfill({ contentType: 'text/html', body: '<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>' }));
  await page.goto('/ensayo-remoto');
  await page.evaluate(async () => {
    const { crearEstadoConexion } = await import('/src/views/produccion/conexion.js');
    window.envios = 0;
    window.vista = crearEstadoConexion({ onActualizar: async () => { window.envios++; },
      onReintentar: async () => { window.envios++; await new Promise(r => { window.resolver = r; }); } });
    document.body.append(window.vista.node);
  });
}

test('conexión incierta ofrece comprobar y bloquea doble clic', async ({ page }) => {
  await montar(page);
  await page.evaluate(() => window.vista.actualizar({ fase: 'confirmacion_pendiente' }));
  await expect(page.getByRole('status')).toContainText('podría estar confirmada');
  await expect(page.getByRole('button', { name: 'Actualizar datos' })).toBeHidden();
  const comprobar = page.getByRole('button', { name: 'Comprobar confirmación' });
  await comprobar.click();
  await expect(comprobar).toBeDisabled();
  expect(await page.evaluate(() => window.envios)).toBe(1);
  await page.evaluate(() => { window.vista.actualizar({ fase: 'lista' }); window.resolver(); });
  await expect(comprobar).toBeHidden();
  await expect(page.getByRole('status')).toContainText('otros equipos');
});

test('dos contextos mantienen su estado de pantalla independiente', async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const b = await browser.newContext({ baseURL, viewport: { width: 834, height: 1112 } });
  try {
    const p = await a.newPage(), q = await b.newPage();
    await Promise.all([montar(p), montar(q)]);
    await p.evaluate(() => window.vista.actualizar({ fase: 'guardando' }));
    await q.evaluate(() => window.vista.actualizar({ fase: 'conflicto' }));
    await expect(p.getByRole('status')).toContainText('Confirmando');
    await expect(p.getByRole('button', { name: 'Actualizar datos' })).toBeHidden();
    await expect(q.getByRole('status')).toContainText('Otro equipo');
    await q.getByRole('button', { name: 'Actualizar datos' }).click();
    expect(await p.evaluate(() => window.envios)).toBe(0);
    expect(await q.evaluate(() => window.envios)).toBe(1);
    for (const pagina of [p, q]) expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await a.close(); await b.close(); }
});

test('vista y controlador conservan la identidad al comprobar una confirmación', async ({ page }) => {
  await montar(page);
  await page.evaluate(async () => {
    const { crearControlOperacion } = await import('/src/app/operacion-remota.js');
    const { crearEstadoConexion } = await import('/src/views/produccion/conexion.js');
    window.solicitudes = [];
    const remoto = { leer: async () => ({ ok: true, value: { version: 1 } }),
      ejecutar: async s => {
        window.solicitudes.push(s);
        return window.solicitudes.length === 1 ? { ok: false, code: 'confirmacion_pendiente' }
          : { ok: true, value: { version: 1 } };
      } };
    const vista = crearEstadoConexion({ onActualizar: () => control.cargar({ fecha: '2026-09-22' }), onReintentar: () => control.reintentar() });
    const control = crearControlOperacion({ remoto, alCambiar: vista.actualizar });
    document.body.replaceChildren(vista.node);
    await control.cargar({ fecha: '2026-09-22' });
    await control.guardar({ accion: 'confirmar', revision: 1, datos: { recetaId: 'R001' } });
  });
  await expect(page.getByRole('status')).toContainText('podría estar confirmada');
  await page.getByRole('button', { name: 'Comprobar confirmación' }).click();
  await expect(page.getByRole('status')).toContainText('Datos consultados');
  const solicitudes = await page.evaluate(() => window.solicitudes);
  expect(solicitudes).toHaveLength(2);
  expect(solicitudes[0]).toEqual(solicitudes[1]);
});
