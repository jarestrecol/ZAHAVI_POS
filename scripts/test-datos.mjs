/**
 * Pruebas de la capa de datos sin navegador: simula window, localStorage y fetch
 * para ejercitar el modelo publicado / cambios locales.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicado = JSON.parse(readFileSync(join(repoRoot, 'data/recipes.json'), 'utf8'));

// --- Navegador simulado ---
const almacen = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  },
  location: { protocol: 'https:', hash: '' },
};
let servido = publicado;
let hayRed = true;
globalThis.fetch = async () => {
  if (!hayRed) throw new Error('sin red');
  return { ok: true, json: async () => JSON.parse(JSON.stringify(servido)) };
};

const repo = await import(pathToFileURL(repoRoot + '/src/core/repository.js').href);
const { validateRecipe } = await import(pathToFileURL(repoRoot + '/src/core/schema.js').href);

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  const marca = condicion ? 'OK  ' : 'FALLA';
  if (!condicion) fallos += 1;
  console.log(`  ${marca} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
}

console.log('\n1. Arranque limpio: manda la version publicada');
let estado = await repo.hydrate();
comprobar('121 recetas', estado.recipes.length === 121, String(estado.recipes.length));
comprobar('origen publicado', estado.source === 'published', estado.source);
comprobar('sin cambios pendientes', repo.localChanges().dirty === false);
comprobar('revision leida', repo.publishedRevision() === publicado.revision, repo.publishedRevision());

console.log('\n2. Datos intactos: ninguna receta alterada al cargar');
const origen = JSON.stringify(publicado.recipes);
const cargado = JSON.stringify(repo.findAll());
comprobar('recetas identicas byte a byte', origen === cargado);

console.log('\n3. Editar una receta la marca como cambio local');
const receta = repo.findById('R005');
const editada = validateRecipe({ ...receta, metodo: 'Paso 1.\nPaso 2.' });
comprobar('la receta valida', editada.ok);
repo.save(editada.value);
let cambios = repo.localChanges();
comprobar('marcado como pendiente', cambios.dirty === true);
comprobar('1 modificada', cambios.modified === 1, JSON.stringify(cambios));
comprobar('0 nuevas, 0 eliminadas', cambios.added === 0 && cambios.removed === 0);
comprobar('el metodo se guardo', repo.findById('R005').metodo.includes('Paso 1'));

console.log('\n4. Crear y eliminar');
const nueva = validateRecipe({
  id: repo.nextId(),
  nombre: 'PRUEBA X 1 UND',
  categoria: 'PANADERÍA',
  metodo: '',
  componentes: [{ nombre: 'PRINCIPAL', items: [{ ingrediente: 'HARINA', cantidad: '100', unidad: 'GR' }] }],
});
repo.save(nueva.value);
repo.remove('R001');
cambios = repo.localChanges();
comprobar('1 nueva', cambios.added === 1, JSON.stringify(cambios));
comprobar('1 eliminada', cambios.removed === 1);
comprobar('total 3 cambios', cambios.total === 3);
comprobar('quedan 121 recetas', repo.findAll().length === 121, String(repo.findAll().length));

console.log('\n5. Recarga con cambios locales: se conservan');
estado = await repo.hydrate();
comprobar('origen local', estado.source === 'local', estado.source);
comprobar('sigue el metodo editado', repo.findById('R005').metodo.includes('Paso 1'));
comprobar('sigue eliminada R001', repo.findById('R001') === null);

console.log('\n6. El archivo a publicar lleva los cambios');
const archivo = repo.toPublishableFile();
comprobar('esquema v2', archivo.version === 2);
comprobar('lleva revision', typeof archivo.revision === 'string' && archivo.revision.length === 10);
comprobar('incluye la edicion', archivo.recipes.find((r) => r.id === 'R005').metodo.includes('Paso 1'));
comprobar('no incluye la eliminada', !archivo.recipes.find((r) => r.id === 'R001'));

console.log('\n7. Se publica una version nueva: se detecta el conflicto');
servido = { ...publicado, revision: '2026-09-01' };
estado = await repo.hydrate();
comprobar('avisa del conflicto', repo.localChanges().conflict === true);
comprobar('conserva los cambios locales', repo.findById('R001') === null);

console.log('\n8. Descartar cambios vuelve a lo publicado');
repo.discardLocalChanges();
comprobar('sin pendientes', repo.localChanges().dirty === false);
comprobar('R001 vuelve', repo.findById('R001') !== null);
comprobar('R005 sin el metodo local', !repo.findById('R005').metodo.includes('Paso 1'));
comprobar('121 recetas', repo.findAll().length === 121);

console.log('\n9. Sin conexion: sigue funcionando');
hayRed = false;
estado = await repo.hydrate();
comprobar('arranca igualmente', estado.recipes.length === 121, String(estado.recipes.length));
comprobar('avisa de la falta de red', Boolean(estado.warning), estado.warning || '');

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASAN\n' : `\n${fallos} COMPROBACION(ES) FALLAN\n`);
process.exit(fallos === 0 ? 0 : 1);
