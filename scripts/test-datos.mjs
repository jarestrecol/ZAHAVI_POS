/**
 * Pruebas de la capa de datos sin navegador: simula window, localStorage y fetch
 * para ejercitar el modelo publicado / cambios locales.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicado = JSON.parse(readFileSync(join(repoRoot, 'data/recipes.json'), 'utf8'));

// SE CUENTA, NO SE ESCRIBE. Estaba a mano como 121 y la panaderia publico la
// receta 122 desde el obrador: la verificacion se puso roja sin que nada
// estuviera mal. Lo que aqui importa no es cuantas hay, sino que lleguen TODAS
// las que estan publicadas.
const TOTAL = publicado.recipes.length;

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
comprobar(`${TOTAL} recetas`, estado.recipes.length === TOTAL, String(estado.recipes.length));
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
comprobar(`quedan ${TOTAL} recetas`, repo.findAll().length === TOTAL, String(repo.findAll().length));

console.log('\n5. Recarga con cambios locales: se conservan');
estado = await repo.hydrate();
comprobar('origen local', estado.source === 'local', estado.source);
comprobar('sigue el metodo editado', repo.findById('R005').metodo.includes('Paso 1'));
comprobar('sigue eliminada R001', repo.findById('R001') === null);

// Lo que se envia al publicar es exactamente el estado actual del repositorio:
// `publishToAll` pasa `findAll()` y el catalogo tal cual a `publishShared`, y es
// el servidor quien arma el archivo con su version y su revision. Se comprueba
// sobre ese estado, que es el que de verdad viaja.
console.log('\n6. Lo que se publicaria lleva los cambios');
const aPublicar = repo.findAll();
comprobar('incluye la edicion', aPublicar.find((r) => r.id === 'R005').metodo.includes('Paso 1'));
comprobar('no incluye la eliminada', !aPublicar.find((r) => r.id === 'R001'));
comprobar('incluye la receta nueva', aPublicar.some((r) => r.nombre === 'PRUEBA X 1 UND'));
comprobar('lleva el catalogo de ingredientes', repo.allIngredients().length > 0);

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
comprobar(`${TOTAL} recetas`, repo.findAll().length === TOTAL);

console.log('\n9. Sin conexion: sigue funcionando');
hayRed = false;
estado = await repo.hydrate();
comprobar('arranca igualmente', estado.recipes.length === TOTAL, String(estado.recipes.length));
comprobar('avisa de la falta de red', Boolean(estado.warning), estado.warning || '');

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASAN\n' : `\n${fallos} COMPROBACION(ES) FALLAN\n`);
process.exit(fallos === 0 ? 0 : 1);
