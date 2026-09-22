/**
 * ENTRAR CON CODIGO DE USUARIO Y PIN
 *
 * Cada persona entra con su codigo y su PIN, comprobados por Supabase Auth.
 * Estas pruebas fijan lo que ve quien esta delante de la pantalla: que entra
 * quien debe, que un error dice lo justo para corregirlo sin ayudar a un
 * extraño, que una baja llega al equipo y que sin red nadie se queda fuera.
 *
 * Supabase va simulado (ver `simularSupabase` en `apoyo.js`): ninguna prueba
 * gasta intentos del proyecto real ni necesita un PIN de verdad.
 */

import { test, expect } from '@playwright/test';
import { entrar, simularSupabase, llamadasA, abrirAjustes, CODIGO, PIN, CODIGO_TOTP, PERFIL } from './apoyo.js';

const SESION_KEY = 'zahavi_sesion_v2';

/** La pantalla de entrada sin service worker, como la dejan las demas pruebas. */
async function abrirEntrada(page) {
  await page.addInitScript(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('sin sw en pruebas'));
    }
  });
  const sim = await simularSupabase(page.context());
  await page.goto('/index.html');
  await page.waitForLoadState('networkidle');
  return sim;
}

/** @param {import('@playwright/test').Page} page */
async function escribir(page, codigo, pin) {
  await page.getByLabel('Código de usuario').fill(codigo);
  await page.getByLabel('PIN', { exact: true }).fill(pin);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/**
 * El segundo paso: la persona de prueba es administradora y el PIN no le basta.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [codigo] para probar tambien uno equivocado
 */
async function verificar(page, codigo = CODIGO_TOTP) {
  await page.getByLabel('Código de verificación').fill(codigo);
  await page.getByRole('button', { name: 'Verificar' }).click();
}

test('entra con codigo y PIN, y Ajustes dice quien esta dentro', async ({ page }) => {
  await entrar(page, '#/');
  await abrirAjustes(page);

  const ficha = page.locator('.settings__sesion');
  await expect(ficha).toContainText(PERFIL.nombre);
  await expect(ficha).toContainText(CODIGO);
  await expect(ficha).toContainText('Administrador');
  await expect(ficha).toContainText(PERFIL.sede.nombre);

  // El PIN no se queda en ningun sitio del equipo.
  const guardado = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(guardado).not.toContain(PIN);
});

test('el codigo se puede escribir en minusculas: viaja como correo interno', async ({ page }) => {
  const sim = await abrirEntrada(page);
  await escribir(page, '  qa-test ', PIN);
  await verificar(page);
  await page.locator('.inicio').waitFor();

  const entrada = sim.llamadas.find((l) => l.ruta.startsWith('/auth/v1/token?grant_type=password'));
  expect(entrada.cuerpo.email).toBe('qa-test@usuarios.zahavi.internal');
});

test('un PIN equivocado no dice cual de los dos datos fallo y conserva el codigo', async ({ page }) => {
  await abrirEntrada(page);
  await escribir(page, CODIGO, '000000');

  await expect(page.getByRole('alert')).toHaveText('Código o PIN incorrectos.');
  // Volver a teclear el codigo tras cada PIN equivocado es lo que hace que la
  // gente acabe dejando la sesion abierta.
  await expect(page.getByLabel('Código de usuario')).toHaveValue(CODIGO);
  await expect(page.getByLabel('PIN', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('PIN', { exact: true })).toBeFocused();
  await expect(page.locator('.inicio')).toHaveCount(0);
});

test('un PIN que no son 6 numeros se corrige sin gastar un intento', async ({ page }) => {
  const sim = await abrirEntrada(page);
  await escribir(page, CODIGO, '1234');

  await expect(page.getByRole('alert')).toHaveText('El PIN son 6 números.');
  expect(llamadasA(sim, '/auth')).toBe(0);

  await escribir(page, 'a', PIN);
  await expect(page.getByRole('alert')).toContainText('El código tiene de 3 a 32 caracteres');
  await expect(page.getByLabel('Código de usuario')).toBeFocused();
  expect(llamadasA(sim, '/auth')).toBe(0);
});

test('demasiados intentos y la falta de red se dicen como tales', async ({ page }) => {
  const sim = await abrirEntrada(page);

  sim.entrar = { status: 429, datos: { code: 429, error_code: 'over_request_rate_limit', msg: 'Too many requests' } };
  await escribir(page, CODIGO, PIN);
  await expect(page.getByRole('alert')).toContainText('Demasiados intentos seguidos');

  sim.entrar = 'sin_red';
  await escribir(page, CODIGO, PIN);
  await expect(page.getByRole('alert')).toContainText('No hay conexión con el servidor');
  await expect(page.getByRole('alert')).not.toContainText('incorrectos');
});

test('un usuario desactivado no entra aunque el PIN sea bueno', async ({ page }) => {
  const sim = await abrirEntrada(page);
  sim.perfil = { ...PERFIL, activo: false };

  await escribir(page, CODIGO, PIN);

  await expect(page.getByRole('alert')).toContainText('desactivado');
  await expect(page.locator('.inicio')).toHaveCount(0);
  // La sesion que Auth llego a abrir no se queda viva en el servidor.
  await expect.poll(() => llamadasA(sim, '/auth/v1/logout')).toBe(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), SESION_KEY)).toBeNull();
});

test('mientras comprueba no se puede enviar dos veces', async ({ page }) => {
  const sim = await abrirEntrada(page);
  sim.entrar = { demora: 1200 };

  await page.getByLabel('Código de usuario').fill(CODIGO);
  await page.getByLabel('PIN', { exact: true }).fill(PIN);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('button', { name: 'Entrando…' })).toBeDisabled();

  // EL RIESGO REAL ES UN REPINTADO A MEDIAS. Con el boton desactivado el
  // navegador ya no envia el formulario con Intro; lo que si pasa en una cocina
  // es que la red se caiga y vuelva mientras Supabase contesta, y la pantalla se
  // reconstruye con un formulario nuevo. Se marca el viejo para comprobar que de
  // verdad es otro nodo.
  await page.evaluate(() => { document.querySelector('.login__card').dataset.viejo = '1'; });
  await page.context().setOffline(true);
  await page.context().setOffline(false);
  await expect(page.locator('.login__card:not([data-viejo])')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Entrando…' })).toBeDisabled();

  // Y ese formulario nuevo tampoco se deja enviar mientras dura el primero.
  await page.evaluate(() => document.querySelector('.login__card').requestSubmit());
  await expect(page.getByRole('alert')).toHaveText('');

  await verificar(page);
  await page.locator('.inicio').waitFor();
  expect(llamadasA(sim, '/auth/v1/token?grant_type=password')).toBe(1);
});

test('sin transiciones de vista, tras un PIN equivocado se puede volver a intentar', async ({ page }) => {
  // Safari de iPad anterior a la 18 y Firefox anterior a la 144 no tienen
  // `startViewTransition`: ahi la pantalla se repinta DENTRO del `setState`, y
  // era justo donde el boton se quedaba desactivado para siempre.
  await page.addInitScript(() => {
    delete Document.prototype.startViewTransition;
  });
  const sim = await abrirEntrada(page);
  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('undefined');

  await escribir(page, CODIGO, '000000');
  await expect(page.getByRole('alert')).toHaveText('Código o PIN incorrectos.');

  const boton = page.getByRole('button', { name: 'Entrar', exact: true });
  await expect(boton).toBeEnabled();
  await page.getByLabel('PIN', { exact: true }).fill(PIN);
  await boton.click();
  await verificar(page);
  await page.locator('.inicio').waitFor();
  expect(llamadasA(sim, '/auth/v1/token?grant_type=password')).toBe(2);
});

test('la sesion sobrevive a recargar sin volver a pedir el PIN', async ({ page }) => {
  await entrar(page);
  const sim = await simularSupabase(page.context());
  const perfilesAntes = llamadasA(sim, '/rest/v1/perfiles');

  await page.reload();
  await page.locator('.app').waitFor();

  expect(llamadasA(sim, '/auth/v1/token?grant_type=password')).toBe(1);
  // Al arrancar se vuelve a leer el perfil: asi llegan una baja o un cambio de rol.
  await expect.poll(() => llamadasA(sim, '/rest/v1/perfiles')).toBeGreaterThan(perfilesAntes);
});

test('una sesion que el servidor ya no reconoce saca a la persona diciendo por que', async ({ page }) => {
  const sim = await simularSupabase(page.context());
  // El testigo vence en 30 segundos: al recargar hay que renovarlo.
  sim.expiraEn = 30;
  await entrar(page);

  sim.renovar = { status: 400, datos: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } };
  await page.reload();

  await expect(page.getByRole('alert')).toHaveText('Tu sesión ya no es válida. Vuelve a entrar.');
  await expect(page.getByLabel('Código de usuario')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), SESION_KEY)).toBeNull();
});

test('una baja llega al equipo al recargar', async ({ page }) => {
  await entrar(page);
  const sim = await simularSupabase(page.context());
  sim.perfil = { ...PERFIL, activo: false };

  await page.reload();

  await expect(page.getByRole('alert')).toContainText('desactivado');
  await expect(page.locator('.app')).toHaveCount(0);
});

test('sin red, quien ya entro sigue dentro', async ({ page }) => {
  const sim = await simularSupabase(page.context());
  sim.expiraEn = 30;
  await entrar(page);

  sim.renovar = 'sin_red';
  sim.leerPerfil = 'sin_red';
  await page.reload();

  await page.locator('.app').waitFor();
  await expect.poll(() => llamadasA(sim, '/auth/v1/token?grant_type=refresh_token')).toBeGreaterThan(0);
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.getByLabel('Código de usuario')).toHaveCount(0);
});

test('cerrar sesion vuelve a la entrada, la borra del equipo y la desconecta', async ({ page }) => {
  await entrar(page, '#/');
  const sim = await simularSupabase(page.context());

  await abrirAjustes(page);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();

  await expect(page.getByLabel('Código de usuario')).toBeVisible();
  // El codigo de quien salio no se queda escrito para el siguiente.
  await expect(page.getByLabel('Código de usuario')).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveText('');
  expect(await page.evaluate((k) => localStorage.getItem(k), SESION_KEY)).toBeNull();
  await expect.poll(() => llamadasA(sim, '/auth/v1/logout')).toBe(1);
});

test('la clave del equipo de antes ya no abre y se borra del aparato', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('qa-sembrado')) {
      sessionStorage.setItem('qa-sembrado', '1');
      localStorage.setItem('zahavi_acceso_v1', JSON.stringify({ credential: { alg: 'plain', value: 'vieja' }, gen: 0 }));
      localStorage.setItem('zahavi_sesion_v1', new Date().toISOString());
    }
  });
  await abrirEntrada(page);

  await expect(page.getByLabel('Código de usuario')).toBeVisible();
  const restos = await page.evaluate(() => [localStorage.getItem('zahavi_acceso_v1'), localStorage.getItem('zahavi_sesion_v1')]);
  expect(restos).toEqual([null, null]);
});

test('administración entra en dos pasos: el PIN no basta', async ({ page }) => {
  const sim = await abrirEntrada(page);
  await escribir(page, CODIGO, PIN);

  // El PIN fue correcto, pero nadie esta dentro todavia.
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
  await expect(page.locator('.inicio')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SESION_KEY)).toBeNull();

  await verificar(page, '000000');
  await expect(page.getByRole('alert')).toContainText('Código incorrecto');
  // Un codigo equivocado no obliga a repetir el PIN.
  await expect(page.getByLabel('Código de verificación')).toBeVisible();

  await verificar(page);
  await page.locator('.inicio').waitFor();
  expect(llamadasA(sim, '/auth/v1/token?grant_type=password')).toBe(1);
});

test('la primera vez, el celular se registra con un QR que no hace falta escanear para entrar', async ({ page }) => {
  const sim = await abrirEntrada(page);
  sim.factores = [];
  await escribir(page, CODIGO, PIN);

  await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
  // Y la clave escrita, para quien no pueda usar la camara.
  await page.getByText('¿No puedes escanear?').click();
  await expect(page.locator('.login__secreto')).toContainText('ABCD');

  await verificar(page);
  await page.locator('.inicio').waitFor();
});

test('volver atrás en la verificación pide el PIN otra vez y desconecta', async ({ page }) => {
  const sim = await abrirEntrada(page);
  await escribir(page, CODIGO, PIN);
  await expect(page.getByLabel('Código de verificación')).toBeVisible();

  await page.getByRole('button', { name: 'Volver' }).click();

  await expect(page.getByLabel('PIN', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Código de verificación')).toHaveCount(0);
  // La sesion que el PIN abrio en el servidor no se queda viva.
  await expect.poll(() => llamadasA(sim, '/auth/v1/logout')).toBe(1);
  expect(await page.evaluate((k) => localStorage.getItem(k), SESION_KEY)).toBeNull();
});

test('un jefe de obrador entra con el PIN, sin segundo paso', async ({ page }) => {
  const sim = await abrirEntrada(page);
  sim.perfil = { ...PERFIL, rol: 'obrador' };

  await escribir(page, CODIGO, PIN);

  await page.locator('.inicio').waitFor();
  expect(llamadasA(sim, '/auth/v1/factors')).toBe(0);
});

test('pasadas 6 horas el turno se cierra, y lo dice', async ({ page }) => {
  await entrar(page, '#/');

  // Se atrasa el inicio del turno en el equipo, que es lo que hace la hora al
  // pasar. No se toca el testigo: lo que vence es el TURNO, no la sesion de Auth.
  await page.evaluate((k) => {
    const sesion = JSON.parse(localStorage.getItem(k));
    sesion.inicio_turno -= 6 * 60 * 60 + 60;
    localStorage.setItem(k, JSON.stringify(sesion));
  }, SESION_KEY);

  await page.reload();

  await expect(page.getByRole('alert')).toContainText('turno');
  await expect(page.getByLabel('Código de usuario')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), SESION_KEY)).toBeNull();
});

test('sin conexion la pantalla lo avisa antes de teclear', async ({ page, context }) => {
  await abrirEntrada(page);
  await context.setOffline(true);

  await expect(page.getByText('Para entrar hace falta internet')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Para entrar hace falta internet')).toHaveCount(0);
});
