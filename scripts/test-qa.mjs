/**
 * =============================================================================
 *  PRUEBA DE ACEPTACION: ALTA Y BAJA MASIVA
 * =============================================================================
 *
 *  Responde a dos preguntas concretas del dueno del producto:
 *
 *      1. Si creo 20 recetas, ¿se guardan bien y siguen ahi al recargar?
 *         ¿Y se pueden borrar todas, dejando el recetario como estaba?
 *
 *      2. Si creo 5 usuarios, ¿se guardan? ¿Se puede entrar con ellos?
 *         ¿Se pueden borrar? ¿Y las protecciones aguantan?
 *
 *  NO TOCA NINGUN DATO REAL
 *  ------------------------
 *  El navegador esta simulado: `localStorage` es un Map en memoria que muere
 *  con el proceso, y `fetch` devuelve una copia del recetario publicado sin
 *  pedir nada por la red. Las 121 recetas reales se leen, nunca se escriben.
 *  Al final se comprueba que el archivo `data/recipes.json` sigue con su mismo
 *  resumen sha256, byte a byte.
 *
 *  Todo lo que crea la prueba lleva el prefijo `QA-TEST-` o `qa-test-` para que
 *  no pueda confundirse con contenido real ni siquiera al leer el volcado.
 *
 *  Se ejecuta con:  node scripts/test-qa.mjs
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { webcrypto } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaDatos = join(repoRoot, 'data/recipes.json');

/** Resumen del archivo real ANTES de empezar, para comprobarlo al terminar. */
const shaAntes = createHash('sha256').update(readFileSync(rutaDatos)).digest('hex');

const publicado = JSON.parse(readFileSync(rutaDatos, 'utf8'));
const RECETAS_ORIGINALES = publicado.recipes.length;

/* ===========================================================================
 *  NAVEGADOR SIMULADO
 * ======================================================================== */

const almacen = new Map();
const almacenSesion = new Map();

const storage = (mapa) => ({
  getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
  setItem: (k, v) => mapa.set(k, String(v)),
  removeItem: (k) => mapa.delete(k),
});

globalThis.window = {
  localStorage: storage(almacen),
  sessionStorage: storage(almacenSesion),
  location: { protocol: 'https:', hash: '' },
  // `users.js` usa crypto.subtle para el SHA-256 de las claves. Node ya
  // expone `globalThis.crypto`, pero solo de lectura, asi que se cuelga aqui.
  crypto: webcrypto,
};

globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(publicado)) });

const repo = await import(pathToFileURL(repoRoot + '/src/core/repository.js').href);
const { validateRecipe } = await import(pathToFileURL(repoRoot + '/src/core/schema.js').href);
const usuarios = await import(pathToFileURL(repoRoot + '/src/core/users.js').href);

/* ===========================================================================
 *  UTILIDADES DE LA PRUEBA
 * ======================================================================== */

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  const marca = condicion ? 'OK   ' : 'FALLA';
  if (!condicion) fallos += 1;
  console.log(`  ${marca} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
}

/** Reparte las 20 recetas entre las tres categorias reales. */
const CATEGORIAS = ['PASTELERÍA', 'PANADERÍA', 'GALLETAS'];

/**
 * Construye una receta de prueba, reconocible por su prefijo.
 *
 * @param {number} n numero de orden, de 1 a 20
 * @returns {object} receta ya validada
 */
function recetaDePrueba(n) {
  const num = String(n).padStart(2, '0');
  const resultado = validateRecipe({
    id: repo.nextId(),
    nombre: `QA-TEST-${num} RECETA DE PRUEBA X 1 UND`,
    categoria: CATEGORIAS[n % 3],
    metodo: `Paso 1 de la prueba ${num}.\nPaso 2 de la prueba ${num}.`,
    componentes: [
      {
        nombre: 'MASA DE PRUEBA',
        items: [
          { ingrediente: 'HARINA', cantidad: String(100 * n), unidad: 'GR' },
          { ingrediente: 'AZUCAR', cantidad: String(50 * n), unidad: 'GR' },
          { ingrediente: 'LECHE', cantidad: String(10 * n), unidad: 'ML' },
        ],
      },
    ],
  });
  if (!resultado.ok) throw new Error('la receta de prueba no valida: ' + resultado.message);
  return resultado.value;
}

console.log('\n===========================================================');
console.log(' PRUEBA DE ACEPTACION - ALTA Y BAJA MASIVA');
console.log('===========================================================');
console.log(` Recetario real: ${RECETAS_ORIGINALES} recetas (no se modifica)`);
console.log(` Resumen sha256: ${shaAntes.slice(0, 8)}`);

/* ===========================================================================
 *  BLOQUE 1: VEINTE RECETAS
 * ======================================================================== */

console.log('\n1. Arranque: se carga el recetario publicado');
let estado = await repo.hydrate();
comprobar(`${RECETAS_ORIGINALES} recetas al arrancar`, estado.recipes.length === RECETAS_ORIGINALES, String(estado.recipes.length));
comprobar('sin cambios pendientes', repo.localChanges().dirty === false);

console.log('\n2. Crear 20 recetas de prueba');
const creadas = [];
for (let n = 1; n <= 20; n += 1) {
  const receta = recetaDePrueba(n);
  const guardado = repo.save(receta);
  if (!guardado.ok) {
    comprobar(`guardar QA-TEST-${n}`, false, guardado.message);
    break;
  }
  creadas.push(receta.id);
}
comprobar('se crearon las 20', creadas.length === 20, String(creadas.length));
comprobar('todas con codigo distinto', new Set(creadas).size === 20, `${new Set(creadas).size} codigos unicos`);
comprobar(
  `el recetario pasa a ${RECETAS_ORIGINALES + 20}`,
  repo.findAll().length === RECETAS_ORIGINALES + 20,
  String(repo.findAll().length),
);

let cambios = repo.localChanges();
comprobar('marcadas como cambios sin publicar', cambios.dirty === true);
comprobar('cuenta 20 nuevas', cambios.added === 20, JSON.stringify(cambios));
comprobar('ninguna receta real modificada', cambios.modified === 0, `modificadas: ${cambios.modified}`);
comprobar('ninguna receta real eliminada', cambios.removed === 0, `eliminadas: ${cambios.removed}`);

console.log('\n3. El contenido guardado es exactamente el que se envio');
const muestra = repo.findById(creadas[7]);
comprobar('la receta se recupera por su codigo', muestra !== null);
comprobar('conserva el nombre', muestra && muestra.nombre.startsWith('QA-TEST-08'), muestra && muestra.nombre);
comprobar('conserva los 3 ingredientes', muestra && muestra.componentes[0].items.length === 3);
comprobar('conserva la cantidad exacta', muestra && String(muestra.componentes[0].items[0].cantidad) === '800');
comprobar('conserva la unidad de volumen', muestra && muestra.componentes[0].items[2].unidad === 'ML');
comprobar('conserva el metodo con sus saltos', muestra && muestra.metodo.split('\n').length === 2);

console.log('\n4. Recargar la pagina: las 20 siguen ahi');
estado = await repo.hydrate();
comprobar('origen: cambios de este equipo', estado.source === 'local', estado.source);
comprobar(
  `siguen las ${RECETAS_ORIGINALES + 20}`,
  repo.findAll().length === RECETAS_ORIGINALES + 20,
  String(repo.findAll().length),
);
const trasRecarga = repo.findById(creadas[7]);
comprobar('la muestra sobrevive intacta', trasRecarga && trasRecarga.nombre.startsWith('QA-TEST-08'));
comprobar('y con su metodo', trasRecarga && trasRecarga.metodo.includes('Paso 2 de la prueba 08'));

console.log('\n5. Borrar las 20, una por una');
let borradas = 0;
for (const id of creadas) {
  const resultado = repo.remove(id);
  if (resultado.ok && repo.findById(id) === null) borradas += 1;
}
comprobar('se borraron las 20', borradas === 20, String(borradas));
comprobar(
  `el recetario vuelve a ${RECETAS_ORIGINALES}`,
  repo.findAll().length === RECETAS_ORIGINALES,
  String(repo.findAll().length),
);
comprobar('no queda ninguna QA-TEST', repo.findAll().filter((r) => r.nombre.includes('QA-TEST')).length === 0);

cambios = repo.localChanges();
comprobar('ya no hay nuevas pendientes', cambios.added === 0, JSON.stringify(cambios));
comprobar('sigue sin tocar ninguna receta real', cambios.modified === 0 && cambios.removed === 0);
// Crear 20 y borrarlas deja el recetario igual que al principio. Si aqui
// siguiera marcado como "con cambios", la cabecera anunciaria "0 cambios sin
// publicar" y el boton de publicar quedaria activo sin nada que publicar.
comprobar('no quedan cambios que anunciar', cambios.dirty === false, JSON.stringify(cambios));
comprobar('el recuento es cero', cambios.total === 0, String(cambios.total));

/* ---------------------------------------------------------------------------
 *  El enlace de una receta conserva el filtro y la busqueda
 *
 *  Los enlaces del listado se escribian a mano como `#/receta/R123`, sin los
 *  parametros. Al elegir "galletas" y abrir una, el filtro se perdia y el
 *  listado volvia a mostrar las 121. Se comprueba sobre `buildHash`, que es lo
 *  que ahora construye esos enlaces.
 * ------------------------------------------------------------------------ */

console.log('\n5b. Abrir una receta no pierde el filtro ni la busqueda');
const router = await import(pathToFileURL(repoRoot + '/src/core/router.js').href);

const conFiltro = router.buildHash({ name: 'detail', id: 'R010', query: '', category: 'GALLETAS' });
comprobar('el enlace lleva la categoria', conFiltro.includes('cat=GALLETAS'), conFiltro);
comprobar('y sigue apuntando a la receta', conFiltro.includes('receta/R010'), conFiltro);
comprobar(
  'al leerlo se recupera la categoria',
  router.parseHash(conFiltro).category === 'GALLETAS',
  router.parseHash(conFiltro).category,
);
comprobar('y el codigo de receta, limpio', router.parseHash(conFiltro).id === 'R010', router.parseHash(conFiltro).id);

const conBusqueda = router.buildHash({ name: 'detail', id: 'R010', query: 'torta', category: 'PANADERÍA' });
comprobar('tambien conserva la busqueda', router.parseHash(conBusqueda).query === 'torta');
comprobar('y la categoria a la vez', router.parseHash(conBusqueda).category === 'PANADERÍA');

const sinFiltro = router.buildHash({ name: 'detail', id: 'R010', query: '', category: 'TODAS' });
comprobar('sin filtro no ensucia la direccion', !sinFiltro.includes('cat='), sinFiltro);

/* ---------------------------------------------------------------------------
 *  La busqueda mira nombre y codigo, ya no los ingredientes
 * ------------------------------------------------------------------------ */

console.log('\n5c. La busqueda solo mira el nombre y el codigo');
const busqueda = await import(pathToFileURL(repoRoot + '/src/core/search.js').href);
const todas = repo.findAll();

const porNombre = busqueda.filterRecipes(todas, { query: 'torta', category: 'TODAS' });
comprobar('encuentra por nombre', porNombre.length > 0, `${porNombre.length} resultados`);
comprobar(
  'y todas las devueltas llevan el texto en el nombre',
  porNombre.every((r) => r.nombre.toLowerCase().includes('torta')),
);

const porCodigo = busqueda.filterRecipes(todas, { query: 'R01', category: 'TODAS' });
comprobar('encuentra por codigo', porCodigo.length > 0, `${porCodigo.length} resultados`);

// "HARINA" es un ingrediente muy comun pero no aparece en ningun nombre de
// receta: es la comprobacion de que ya no se busca dentro de los ingredientes.
const nombresConHarina = todas.filter((r) => r.nombre.toUpperCase().includes('HARINA')).length;
const porIngrediente = busqueda.filterRecipes(todas, { query: 'harina', category: 'TODAS' });
comprobar(
  'ya NO busca dentro de los ingredientes',
  porIngrediente.length === nombresConHarina,
  `${porIngrediente.length} resultados, ${nombresConHarina} recetas con "harina" en el nombre`,
);

const conCategoria = busqueda.filterRecipes(todas, { query: '', category: 'GALLETAS' });
comprobar('el filtro de categoria sigue funcionando', conCategoria.length === 21, String(conCategoria.length));
comprobar('y todas son de esa categoria', conCategoria.every((r) => r.categoria === 'GALLETAS'));

/* ---------------------------------------------------------------------------
 *  ESCALADO DE TANDA
 *
 *  Es la funcion donde un error cuesta dinero de verdad: si multiplica mal, se
 *  pierde una tanda entera de materia prima. Se comprueba contra recetas
 *  reales, sin modificarlas.
 * ------------------------------------------------------------------------ */

console.log('\n5d. Escalado de la tanda');
const escala = await import(pathToFileURL(repoRoot + '/src/core/scale.js').href);

const muestraReal = repo.findAll().find((r) => r.componentes[0].items.length >= 2);
const doble = escala.escalarReceta(muestraReal, 2);

comprobar(
  'multiplica la primera cantidad por 2',
  Number(doble.componentes[0].items[0].cantidad) === Number(muestraReal.componentes[0].items[0].cantidad) * 2,
);
comprobar(
  'NO altera la receta original',
  Number(repo.findById(muestraReal.id).componentes[0].items[0].cantidad) ===
    Number(muestraReal.componentes[0].items[0].cantidad),
);
comprobar('conserva el nombre y el codigo', doble.id === muestraReal.id && doble.nombre === muestraReal.nombre);
comprobar(
  'conserva el numero de lineas',
  doble.componentes[0].items.length === muestraReal.componentes[0].items.length,
);

const mitad = escala.escalarReceta(muestraReal, 0.5);
comprobar(
  'divide a la mitad',
  Number(mitad.componentes[0].items[0].cantidad) === Number(muestraReal.componentes[0].items[0].cantidad) / 2,
);

comprobar('factor 1 devuelve la receta tal cual', escala.escalarReceta(muestraReal, 1) === muestraReal);

// Factores imposibles: no deben vaciar la receta ni dar cantidades negativas.
comprobar('factor 0 vuelve al original', escala.normalizarFactor(0) === 1);
comprobar('factor negativo vuelve al original', escala.normalizarFactor(-3) === 1);
comprobar('texto sin numero vuelve al original', escala.normalizarFactor('abc') === 1);
comprobar('acepta coma decimal', escala.normalizarFactor('1,5') === 1.5);
comprobar('limita un factor desmedido', escala.normalizarFactor(99999) <= 100);

// Las medidas de molde y tiempo no se multiplican.
comprobar('los gramos si se escalan', escala.esEscalable('GR') === true);
comprobar('los centimetros NO se escalan', escala.esEscalable('CM') === false);
comprobar('los minutos NO se escalan', escala.esEscalable('MIN') === false);

const conCm = repo.findAll().find((r) =>
  r.componentes.some((c) => c.items.some((i) => String(i.unidad).toUpperCase() === 'CM')),
);
if (conCm) {
  const cmOriginal = conCm.componentes
    .flatMap((c) => c.items)
    .find((i) => String(i.unidad).toUpperCase() === 'CM');
  const cmEscalado = escala
    .escalarReceta(conCm, 4)
    .componentes.flatMap((c) => c.items)
    .find((i) => String(i.unidad).toUpperCase() === 'CM');
  comprobar(
    'un molde en CM sigue igual con factor 4',
    Number(cmEscalado.cantidad) === Number(cmOriginal.cantidad),
    `${cmOriginal.cantidad} -> ${cmEscalado.cantidad}`,
  );
  comprobar('y la receta se marca como que tiene medidas fijas', escala.tieneMedidasFijas(conCm) === true);
}

// El rendimiento se lee del nombre para poder pedir "quiero N unidades".
comprobar('lee el rendimiento del nombre', escala.rendimientoBase('TORTA DE BANANO X 2 UND') === 2);
comprobar('sin rendimiento declarado devuelve null', escala.rendimientoBase('PAN SIN CANTIDAD') === null);

// Cuantas recetas admiten pedir "quiero N unidades". Las demas solo pueden
// usar el multiplicador, que funciona para las 121 sin excepcion. Se fija el
// numero para enterarnos si un cambio en la lectura del nombre lo mueve.
const conRinde = repo.findAll().filter((r) => escala.rendimientoBase(r.nombre) !== null).length;
comprobar(
  '87 recetas admiten pedir una cantidad concreta',
  conRinde === 87,
  `${conRinde} de ${RECETAS_ORIGINALES}`,
);
comprobar(
  'y el multiplicador funciona para las 121',
  repo.findAll().every((r) => escala.escalarReceta(r, 2) !== null),
);

console.log('\n6. Las 121 recetas reales quedan como estaban');
const idsReales = publicado.recipes.map((r) => r.id).sort();
const idsAhora = repo.findAll().map((r) => r.id).sort();
comprobar('mismos codigos', JSON.stringify(idsReales) === JSON.stringify(idsAhora));
comprobar(
  'mismo contenido byte a byte',
  JSON.stringify(publicado.recipes) === JSON.stringify(repo.findAll()),
);

/* ===========================================================================
 *  BLOQUE 2: CINCO USUARIOS
 * ======================================================================== */

console.log('\n7. Usuario de fabrica');
await usuarios.ensureUsers();
comprobar('existe un usuario de partida', usuarios.listUsers().length === 1, String(usuarios.listUsers().length));
comprobar('se llama zahavi', usuarios.listUsers()[0].name === usuarios.DEFAULT_USER, usuarios.listUsers()[0].name);
comprobar(
  'entra con la clave de fabrica',
  await usuarios.verifyUser(usuarios.DEFAULT_USER, usuarios.DEFAULT_PASSWORD),
);
comprobar('rechaza una clave incorrecta', !(await usuarios.verifyUser(usuarios.DEFAULT_USER, 'incorrecta')));
usuarios.signIn(usuarios.DEFAULT_USER);
comprobar('la sesion queda abierta', usuarios.isSignedIn() === true);

console.log('\n8. Crear 5 usuarios');
const creados = [];
for (let n = 1; n <= 5; n += 1) {
  const nombre = `qa-test-${n}`;
  const clave = `ClaveDePrueba${n}`;
  const resultado = await usuarios.createUser(nombre, clave, clave);
  if (resultado.ok) creados.push(nombre);
  else comprobar(`crear ${nombre}`, false, resultado.message);
}
comprobar('se crearon los 5', creados.length === 5, String(creados.length));
comprobar('la lista tiene 6 (fabrica + 5)', usuarios.listUsers().length === 6, String(usuarios.listUsers().length));

console.log('\n9. Los 5 pueden entrar de verdad');
let entran = 0;
for (let n = 1; n <= 5; n += 1) {
  if (await usuarios.verifyUser(`qa-test-${n}`, `ClaveDePrueba${n}`)) entran += 1;
}
comprobar('los 5 entran con su clave', entran === 5, String(entran));
comprobar('no entran con la clave de otro', !(await usuarios.verifyUser('qa-test-1', 'ClaveDePrueba2')));
comprobar('no entra un usuario inventado', !(await usuarios.verifyUser('qa-test-99', 'ClaveDePrueba1')));

console.log('\n10. Protecciones al crear');
let r = await usuarios.createUser('qa-test-1', 'OtraClave123', 'OtraClave123');
comprobar('rechaza un nombre repetido', !r.ok, r.ok ? 'lo permitio' : r.message);
r = await usuarios.createUser('qa-test-6', 'abc', 'abc');
comprobar('rechaza una clave demasiado corta', !r.ok, r.ok ? 'la permitio' : r.message);
r = await usuarios.createUser('qa-test-6', 'ClaveLarga1', 'ClaveLarga2');
comprobar('rechaza si las claves no coinciden', !r.ok, r.ok ? 'lo permitio' : r.message);
r = await usuarios.createUser('', 'ClaveLarga1', 'ClaveLarga1');
comprobar('rechaza un nombre vacio', !r.ok, r.ok ? 'lo permitio' : r.message);

console.log('\n11. Cambiar la clave propia');
r = await usuarios.changePassword(usuarios.DEFAULT_USER, 'claveIncorrecta', 'NuevaClave123', 'NuevaClave123');
comprobar('rechaza si la clave actual esta mal', !r.ok, r.ok ? 'lo permitio' : r.message);
r = await usuarios.changePassword(usuarios.DEFAULT_USER, usuarios.DEFAULT_PASSWORD, 'NuevaClave123', 'NuevaClave123');
comprobar('acepta con la clave actual correcta', r.ok, r.ok ? '' : r.message);
comprobar('la nueva clave funciona', await usuarios.verifyUser(usuarios.DEFAULT_USER, 'NuevaClave123'));
comprobar('la anterior ya no', !(await usuarios.verifyUser(usuarios.DEFAULT_USER, usuarios.DEFAULT_PASSWORD)));

console.log('\n12. Borrar los 5 usuarios');
let quitados = 0;
for (const nombre of creados) {
  const resultado = usuarios.removeUser(nombre);
  if (resultado.ok) quitados += 1;
  else comprobar(`quitar ${nombre}`, false, resultado.message);
}
comprobar('se quitaron los 5', quitados === 5, String(quitados));
comprobar('vuelve a quedar 1 usuario', usuarios.listUsers().length === 1, String(usuarios.listUsers().length));
comprobar('ninguno qa-test sobrevive', usuarios.listUsers().filter((u) => u.name.startsWith('qa-test')).length === 0);
comprobar('los borrados ya no entran', !(await usuarios.verifyUser('qa-test-1', 'ClaveDePrueba1')));

console.log('\n13. Protecciones al borrar');
r = usuarios.removeUser(usuarios.DEFAULT_USER);
comprobar('no deja quedarse sin usuarios', !r.ok, r.ok ? 'lo permitio' : r.message);
comprobar('el usuario sigue ahi', usuarios.listUsers().length === 1);

console.log('\n14. Cerrar sesion revoca tambien la clave de edicion');
const remote = await import(pathToFileURL(repoRoot + '/src/core/remote.js').href);
remote.setEditKey('clave-de-edicion-de-prueba');
comprobar('la clave queda en la sesion', remote.getEditKey() === 'clave-de-edicion-de-prueba');
usuarios.signOut();
comprobar('la sesion se cierra', usuarios.isSignedIn() === false);
comprobar('y la clave de edicion se borra', remote.getEditKey() === '', remote.getEditKey());

/* ===========================================================================
 *  CIERRE: EL ARCHIVO REAL NO SE TOCO
 * ======================================================================== */

console.log('\n15. El archivo de recetas reales no se modifico');
const shaDespues = createHash('sha256').update(readFileSync(rutaDatos)).digest('hex');
comprobar('mismo resumen sha256', shaAntes === shaDespues, shaDespues.slice(0, 8));

console.log('\n===========================================================');
if (fallos === 0) {
  console.log(' RESULTADO: todo correcto.');
} else {
  console.log(` RESULTADO: ${fallos} comprobacion(es) fallida(s).`);
}
console.log('===========================================================\n');

process.exit(fallos === 0 ? 0 : 1);
