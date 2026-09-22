/**
 * Reemplaza la lista manual de precache por los archivos que Vite produjo.
 * Asi una actualizacion no deja fuera un recurso con hash ni conserva una ruta
 * fuente que ya no existe dentro de `dist`.
 */
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'dist');

/** Devuelve todos los archivos publicables, con ruta relativa POSIX. */
async function archivosEn(carpeta) {
  const entradas = await readdir(carpeta, { withFileTypes: true });
  const anidados = await Promise.all(
    entradas.map(async (entrada) => {
      const ruta = join(carpeta, entrada.name);
      return entrada.isDirectory() ? archivosEn(ruta) : [ruta];
    }),
  );
  return anidados.flat();
}

const fijos = ['./', './index.html', './manifest.webmanifest', './data/recipes.json'];
const recursos = (await archivosEn(join(dist, 'assets')))
  .map((archivo) => './' + relative(dist, archivo).split(sep).join('/'))
  .sort();
const salvavidas = './src/salvavidas.js';
const shell = [...new Set([...fijos, ...recursos, salvavidas])];

const destino = join(dist, 'sw.js');
const codigo = await readFile(destino, 'utf8');
const reemplazo = `const SHELL = ${JSON.stringify(shell, null, 2)};`;
const actualizado = codigo.replace(/const SHELL = \[[\s\S]*?\n\];/, reemplazo);

if (actualizado === codigo) {
  throw new Error('No se encontro la lista SHELL en sw.js.');
}

await writeFile(destino, actualizado, 'utf8');

/** El HTML y la carcasa no pueden apuntar a recursos que el build no entrego. */
async function existe(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

const index = await readFile(join(dist, 'index.html'), 'utf8');
const desdeHtml = [...index.matchAll(/\b(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)].map((m) => m[1]);
// Las rutas de recursos escritas literalmente en vistas JavaScript no las ve
// el parser del HTML. Deben seguir disponibles despues de minificar el bundle.
const archivosJavaScript = (await archivosEn(join(dist, 'assets')))
  .filter((archivo) => archivo.endsWith('.js'));
const desdeJavaScript = [];
for (const archivo of archivosJavaScript) {
  const codigoJavaScript = await readFile(archivo, 'utf8');
  for (const coincidencia of codigoJavaScript.matchAll(/["'`]\.\/(assets\/[^"'`?#]+)(?:[?#][^"'`]*)?["'`]/g)) {
    desdeJavaScript.push(coincidencia[1]);
  }
}

const esperados = [...new Set([
  ...shell.filter((ruta) => ruta !== './').map((ruta) => ruta.slice(2)),
  ...desdeHtml,
  ...desdeJavaScript,
])];
const faltantes = [];

for (const ruta of esperados) {
  if (!(await existe(join(dist, ruta)))) faltantes.push(ruta);
}

if (faltantes.length) {
  throw new Error(`El artefacto referencia archivos ausentes: ${faltantes.join(', ')}`);
}
