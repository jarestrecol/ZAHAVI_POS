/**
 * Pruebas de la capa de datos sin navegador.
 *
 * El recetario vive en Supabase (0024) y no se guarda en el equipo (F1-D, F4-1):
 * aqui se comprueba que el repositorio del navegador lee del servidor, que sin
 * servidor NO sirve una copia vieja sino un recetario vacio con el motivo, y
 * que borra las copias que dejo la version anterior. El transporte es de
 * mentira; las reglas del servidor se prueban contra PostgreSQL (`probar-sql`)
 * y el alta y baja completas en `test-qa.mjs`.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicado = JSON.parse(readFileSync(join(repoRoot, 'data/recipes.json'), 'utf8'));
const TOTAL = publicado.recipes.length;

// --- Navegador simulado ---
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
globalThis.window = { localStorage: globalThis.localStorage, location: { protocol: 'https:', hash: '' } };

const repo = await import(pathToFileURL(repoRoot + '/src/core/repository.js').href);

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  const marca = condicion ? 'OK  ' : 'FALLA';
  if (!condicion) fallos += 1;
  console.log(`  ${marca} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
}

let respuesta = { ok: true, value: { version: 1, recetas: publicado.recipes, ingredientes: publicado.ingredientes } };
const consultas = [];
repo.usarTransporte({
  leer: async (q) => { consultas.push(q); return JSON.parse(JSON.stringify(respuesta)); },
  ejecutar: async () => ({ ok: false, code: 'invalida', message: 'No se usa en esta prueba.' }),
});

console.log('\n1. Las copias de la version anterior se borran al cargar');
for (const k of ['zahavi_recetario_v1', 'zahavi_recetario_rescate', 'zahavi_recetario_rescate_crudo', 'zahavi_edit_key']) {
  almacen.set(k, '{"recipes":[]}');
}
let estado = await repo.hydrate();
comprobar('no queda ninguna copia local del recetario', !['zahavi_recetario_v1', 'zahavi_recetario_rescate',
  'zahavi_recetario_rescate_crudo', 'zahavi_edit_key'].some((k) => almacen.has(k)));

console.log('\n2. Con servidor: llegan todas las recetas, pedidas como «recetario»');
comprobar(`${TOTAL} recetas`, estado.recipes.length === TOTAL, String(estado.recipes.length));
comprobar('origen: el servidor', estado.source === 'servidor', estado.source);
comprobar('la consulta es la del contrato', consultas.at(-1)?.tipo === 'recetario', JSON.stringify(consultas.at(-1)));
comprobar('con el catalogo de ingredientes', repo.allIngredients().length === publicado.ingredientes.length);
comprobar('se encuentran por su codigo', repo.findById('R005')?.id === 'R005');

console.log('\n3. Sin servidor: recetario vacio y el motivo, nunca una copia vieja');
respuesta = { ok: false, code: 'sin_conexion', message: 'No se pudo consultar la operación. Reintenta cuando haya conexión.' };
estado = await repo.hydrate();
comprobar('no enseña recetas viejas', estado.recipes.length === 0 && repo.findAll().length === 0, String(estado.recipes.length));
comprobar('dice por que', Boolean(estado.warning), estado.warning || '');
comprobar('y no escribe nada en el equipo', ![...almacen.keys()].some((k) => k.startsWith('zahavi_recetario')));

console.log('\n4. Al cerrar sesion no queda nada en memoria');
respuesta = { ok: true, value: { version: 1, recetas: publicado.recipes, ingredientes: publicado.ingredientes } };
await repo.hydrate();
repo.vaciar();
comprobar('recetario vacio', repo.findAll().length === 0 && repo.allIngredients().length === 0);

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASAN\n' : `\n${fallos} COMPROBACION(ES) FALLAN\n`);
process.exit(fallos === 0 ? 0 : 1);
