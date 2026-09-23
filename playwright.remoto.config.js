import { defineConfig } from '@playwright/test';
const puerto = Number(process.env.PLAYWRIGHT_PUERTO) || 8123;
export default defineConfig({
  testDir: './tests', testMatch: 'remoto.spec.js', reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${puerto}` },
  webServer: { command: `node scripts/servidor.mjs ${puerto}`, url: `http://127.0.0.1:${puerto}/index.html`, reuseExistingServer: false },
});
