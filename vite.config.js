/**
 * Vite solo empaqueta. No transforma el codigo del proyecto.
 *
 * La lista de precarga del service worker se genera leyendo `dist/` despues de
 * compilar. Asi incluye exactamente los nombres con hash que Vite emitio sin
 * dejar un manifiesto de compilacion que ningun proceso consume.
 *
 * `data/` NO se mueve. `api/recipes.js` lo referencia por ruta constante y
 * cuatro scripts lo leen de ahi; moverlo romperia la publicacion. Se copia al
 * resultado del build con `scripts/copiar-estaticos.mjs` (tarea 2).
 */
import { defineConfig } from 'vite';

export default defineConfig({
  // `index.html:75-76` garantiza que todas las rutas son relativas para que
  // el sitio funcione igual servido desde una subruta o abierto desde el
  // disco, y `main.js:210` registra el service worker con `./sw.js`. Sin
  // esto Vite usa `/` por defecto y reescribe cada ruta como absoluta desde
  // la raiz, rompiendo esa garantia.
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // La fuente sigue sin transformarse; el artefacto si se minimiza para que
    // un alojamiento estatico no descargue comentarios y espacios de trabajo.
    minify: 'oxc',
  },
});
