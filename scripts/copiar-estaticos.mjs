/**
 * Completa el resultado de Vite con los archivos que el navegador pide por
 * nombre fijo. Vite solo conoce lo que importa `index.html`; el manifiesto,
 * el service worker, las paginas de error y los datos no se pueden renombrar.
 */
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');

/** Copia un archivo conservando la carpeta de destino. */
async function copiar(origen, destino) {
  await mkdir(dirname(destino), { recursive: true });
  await cp(origen, destino);
}

await Promise.all([
  copiar(join(raiz, 'manifest.webmanifest'), join(dist, 'manifest.webmanifest')),
  copiar(join(raiz, 'sw.js'), join(dist, 'sw.js')),
  copiar(join(raiz, '404.html'), join(dist, '404.html')),
  copiar(join(raiz, '500.html'), join(dist, '500.html')),
  copiar(join(raiz, 'robots.txt'), join(dist, 'robots.txt')),
  // El salvavidas se mantiene como script clasico para poder avisar incluso si
  // el modulo principal no llega a evaluarse.
  copiar(join(raiz, 'src', 'salvavidas.js'), join(dist, 'src', 'salvavidas.js')),
  // Estas rutas se nombran desde el manifiesto y desde las paginas 404/500;
  // por eso no pueden depender del nombre con hash que genera Vite.
  // Las paginas de error no pasan por Vite y conservan estos cuatro enlaces.
  copiar(join(raiz, 'assets', 'css', 'fonts.css'), join(dist, 'assets', 'css', 'fonts.css')),
  copiar(join(raiz, 'assets', 'css', 'tokens.css'), join(dist, 'assets', 'css', 'tokens.css')),
  copiar(join(raiz, 'assets', 'css', 'base.css'), join(dist, 'assets', 'css', 'base.css')),
  copiar(join(raiz, 'assets', 'css', 'fallback.css'), join(dist, 'assets', 'css', 'fallback.css')),
  cp(join(raiz, 'assets', 'fonts'), join(dist, 'assets', 'fonts'), { recursive: true }),
  copiar(join(raiz, 'assets', 'favicon.svg'), join(dist, 'assets', 'favicon.svg')),
  copiar(join(raiz, 'assets', 'apple-touch-icon.png'), join(dist, 'assets', 'apple-touch-icon.png')),
  copiar(join(raiz, 'assets', 'logo-zahavi.png'), join(dist, 'assets', 'logo-zahavi.png')),
  copiar(join(raiz, 'assets', 'icon-192.png'), join(dist, 'assets', 'icon-192.png')),
  copiar(join(raiz, 'assets', 'icon-512.png'), join(dist, 'assets', 'icon-512.png')),
  copiar(join(raiz, 'assets', 'icon-maskable-512.png'), join(dist, 'assets', 'icon-maskable-512.png')),
]);
