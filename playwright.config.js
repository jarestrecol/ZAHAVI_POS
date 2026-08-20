/**
 * =============================================================================
 *  PRUEBAS DE NAVEGADOR
 * =============================================================================
 *
 *  Existen porque las pruebas de `verificar.mjs` no abren ningun navegador, y
 *  hay una familia entera de fallos que solo se ve ahi: el foco que no entra en
 *  una ventana, la hoja que se manda a imprimir antes de existir, la barra que
 *  se cree flotante y esta atrapada, la lista que se desborda de lado. Todos
 *  ellos pasaron por delante de siete bloques de pruebas en verde.
 *
 *  Se ejecuta con:  npm run qa
 *
 *  El servidor lo levanta la propia suite, con las cabeceras de produccion:
 *  probar contra un servidor mas permisivo que el real esconde justo lo que
 *  interesa comprobar.
 */

import { defineConfig, devices } from '@playwright/test';

const PUERTO = 8123;

export default defineConfig({
  testDir: './tests',
  // Nada de esperas al azar: cada comprobacion espera a una condicion concreta.
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    trace: 'on-first-retry',
    // La aplicacion esta en español y hay comprobaciones que leen texto.
    locale: 'es-ES',
  },

  // Cada tamaño corre lo suyo: el reparto lo hace el archivo, no un `skip`
  // dentro de cada prueba. Asi el informe no se llena de saltadas.
  projects: [
    {
      name: 'escritorio',
      testMatch: /(recorrido|dialogos|impresion|resiliencia|publicacion|editor)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // El obrador entra desde el telefono: es donde aparecieron cuatro de los
      // seis defectos de la ultima revision.
      name: 'celular',
      testMatch: /celular\.spec\.js/,
      use: { ...devices['Pixel 5'] },
    },
    {
      // Tamaño de iPad sobre el mismo motor que el resto: lo que se comprueba
      // aqui es el reparto de la pantalla, no el navegador. Pedir WebKit
      // obligaria a descargar un segundo motor para no comprobar nada nuevo.
      name: 'tableta',
      testMatch: /tableta\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 834, height: 1112 },
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: `node scripts/servidor.mjs ${PUERTO}`,
    url: `http://127.0.0.1:${PUERTO}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
