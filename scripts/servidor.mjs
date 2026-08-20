/**
 * =============================================================================
 *  SERVIDOR LOCAL CON LAS CABECERAS DE PRODUCCION
 * =============================================================================
 *
 *  Sirve el recetario igual que lo sirve Vercel: mismas cabeceras, misma CSP.
 *  Es lo que usan las pruebas de navegador, y sirve tambien para desarrollo.
 *
 *  Se levanta con las cabeceras DE VERDAD, leidas de `vercel.json`, y no con
 *  una copia escrita a mano. Un servidor de desarrollo permisivo esconde
 *  exactamente los fallos que solo aparecen publicados: un recurso que la CSP
 *  bloquea, un tipo de contenido mal declarado, un modulo que solo carga
 *  porque el servidor de pruebas era mas blando.
 *
 *  Sin dependencias: solo `node:http` y `node:fs`.
 *
 *  Se ejecuta con:  node scripts/servidor.mjs [puerto]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const puerto = Number(process.argv[2] || process.env.PORT || 8000);

const config = JSON.parse(await readFile(join(raiz, 'vercel.json'), 'utf8'));

/** El tipo importa: un modulo servido como texto plano no lo ejecuta nadie. */
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  // El fondo de la pantalla de entrada. Sin esto se servia como descarga
  // binaria y el navegador no lo pintaba como imagen.
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Las cabeceras que `vercel.json` aplica a una ruta.
 *
 * Los `source` de Vercel usan `(.*)` donde una expresion regular usaria `.*`;
 * es la unica traduccion que hace falta para las reglas que hay hoy.
 *
 * @param {string} ruta
 * @returns {Record<string, string>}
 */
function cabecerasDe(ruta) {
  const salida = {};
  for (const bloque of config.headers || []) {
    const patron = new RegExp('^' + bloque.source.replace(/\(\.\*\)/g, '.*') + '$');
    if (!patron.test(ruta)) continue;
    for (const { key, value } of bloque.headers) salida[key] = value;
  }
  return salida;
}

const servidor = createServer(async (peticion, respuesta) => {
  const ruta = decodeURIComponent(new URL(peticion.url, 'http://local').pathname);
  // `normalize` mas el recorte de barras iniciales impide salir de la carpeta
  // del proyecto con una ruta como `/../../secreto`.
  const relativa = normalize(ruta === '/' ? '/index.html' : ruta).replace(/^[/\\]+/, '');

  try {
    const contenido = await readFile(join(raiz, relativa));
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(relativa)] || 'application/octet-stream',
      ...cabecerasDe(ruta),
    });
    respuesta.end(contenido);
  } catch {
    // La API de publicacion es una funcion de Vercel y aqui no existe: el
    // recetario ya sabe caer al archivo publicado cuando no responde. Se
    // contesta en texto plano porque quien pregunta es codigo, no una persona.
    if (ruta.startsWith('/api/')) {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...cabecerasDe(ruta) });
      respuesta.end('No encontrado');
      return;
    }

    // Cualquier otra direccion que no existe: la misma pagina que sirve Vercel,
    // y con el mismo estado 404. Servirla aqui es lo que permite comprobarla
    // sin desplegar.
    try {
      const pagina = await readFile(join(raiz, '404.html'));
      respuesta.writeHead(404, { 'Content-Type': TIPOS['.html'], ...cabecerasDe(ruta) });
      respuesta.end(pagina);
    } catch {
      respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      respuesta.end('No encontrado');
    }
  }
});

servidor.listen(puerto, '127.0.0.1', () => {
  console.log(`Recetario en http://127.0.0.1:${puerto} con las cabeceras de produccion`);
});
