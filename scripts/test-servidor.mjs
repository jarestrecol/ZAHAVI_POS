/**
 * Contrato del servidor local: sirve la aplicacion con sus cabeceras de
 * produccion sin convertir el arbol completo del repositorio en superficie web.
 */

import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const puerto = 16_000 + (process.pid % 10_000);
const servidor = spawn(process.execPath, ['scripts/servidor.mjs', String(puerto)], {
  cwd: raiz,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let fallos = 0;

function comprobar(texto, condicion, detalle = '') {
  if (condicion) console.log(`  OK   ${texto}${detalle ? ` -> ${detalle}` : ''}`);
  else {
    fallos += 1;
    console.log(`  FALLA ${texto}${detalle ? ` -> ${detalle}` : ''}`);
  }
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function pedir(ruta, method = 'GET') {
  return new Promise((resolver, rechazar) => {
    const solicitud = request({ hostname: '127.0.0.1', port: puerto, path: ruta, method }, (respuesta) => {
      respuesta.resume();
      respuesta.once('end', () => resolver(respuesta.statusCode));
    });
    solicitud.once('error', rechazar);
    solicitud.end();
  });
}

async function esperarServidor() {
  let ultimo;
  for (let intento = 0; intento < 30; intento += 1) {
    try {
      await pedir('/index.html');
      return;
    } catch (error) {
      ultimo = error;
      await esperar(100);
    }
  }
  throw ultimo || new Error('El servidor local no arranco');
}

async function cerrar() {
  if (servidor.exitCode !== null) return;
  const salida = new Promise((resolver) => servidor.once('exit', resolver));
  servidor.kill();
  await Promise.race([salida, esperar(1_000)]);
  if (servidor.exitCode === null) servidor.kill('SIGKILL');
}

try {
  await esperarServidor();

  console.log('\nServidor local y superficie publica');
  comprobar('entrega la aplicacion', (await pedir('/index.html')) === 200);
  comprobar('entrega sus estilos', (await pedir('/assets/css/base.css')) === 200);
  comprobar('la API ausente conserva su 404', (await pedir('/api/recipes')) === 404);
  comprobar('no expone la documentacion', (await pedir('/docs/seguridad.md')) === 404);
  comprobar('no expone las migraciones', (await pedir('/db/migraciones/0001_base.sql')) === 404);
  comprobar('rechaza una URL malformada', (await pedir('/%zz')) === 400);
  comprobar('no acepta escrituras sobre la superficie estatica', (await pedir('/index.html', 'POST')) === 405);
} catch (error) {
  comprobar('el contrato del servidor se puede ejecutar', false, String(error.message));
} finally {
  await cerrar();
}

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASAN\n' : `\n${fallos} COMPROBACION(ES) FALLAN\n`);
process.exit(fallos === 0 ? 0 : 1);
