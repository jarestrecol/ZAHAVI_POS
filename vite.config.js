/**
 * Vite solo empaqueta. No transforma el codigo del proyecto.
 *
 * `manifest: true` es lo que hace posible generar la lista de precarga del
 * service worker en vez de escribirla a mano: sin el, los nombres con hash del
 * build no se pueden conocer desde fuera.
 *
 * `data/` NO se mueve. `api/recipes.js` lo referencia por ruta constante y
 * cuatro scripts lo leen de ahi; moverlo romperia la publicacion. Se copia al
 * resultado del build con `scripts/copiar-estaticos.mjs` (tarea 2).
 */
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    // Sin minificar de momento: se quiere poder comparar el resultado con la
    // fuente durante esta tarea, que es la que decide si el build es fiable.
    minify: false,
  },
});
