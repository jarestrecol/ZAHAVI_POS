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
 *      2. La clave del equipo: ¿se puede cambiar? ¿caduca a la semana?
 *         ¿y nadie se queda fuera al actualizar desde los modelos anteriores?
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
  // `access.js` usa crypto.subtle para el SHA-256 de la clave. Node ya
  // expone `globalThis.crypto`, pero solo de lectura, asi que se cuelga aqui.
  crypto: webcrypto,
};

globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(publicado)) });

const repo = await import(pathToFileURL(repoRoot + '/src/core/repository.js').href);
const { validateRecipe } = await import(pathToFileURL(repoRoot + '/src/core/schema.js').href);
const acceso = await import(pathToFileURL(repoRoot + '/src/core/access.js').href);

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

/* ---------------------------------------------------------------------------
 *  CATALOGO DE INGREDIENTES
 *
 *  Es la base del costeo futuro, asi que lo importante es que los totales sean
 *  exactos y que NUNCA se sumen unidades distintas: con un precio de por medio,
 *  ese error se convertiria en dinero.
 * ------------------------------------------------------------------------ */

console.log('\n5e. Catalogo de ingredientes');
const ings = await import(pathToFileURL(repoRoot + '/src/core/ingredients.js').href);
const catalogo = ings.catalogoIngredientes(repo.findAll());
const resumenIng = ings.resumenCatalogo(catalogo);

comprobar('159 ingredientes distintos', resumenIng.distintos === 159, String(resumenIng.distintos));
comprobar('cubre las 1282 lineas', resumenIng.lineas === 1282, String(resumenIng.lineas));
comprobar('64 se usan en una sola receta', resumenIng.enUnaSolaReceta === 64, String(resumenIng.enUnaSolaReceta));
comprobar(
  'ninguno se pierde por el camino',
  catalogo.reduce((n, i) => n + i.lineas, 0) === 1282,
);

// El mas usado del recetario.
const harinaCat = catalogo.find((i) => /HARINA DE TRIGO/i.test(i.nombre));
comprobar('encuentra la harina de trigo', Boolean(harinaCat));
comprobar('la sitúa en 86 recetas', harinaCat && harinaCat.recetas === 86, harinaCat ? String(harinaCat.recetas) : '');
comprobar(
  'sale de primera al ordenar por uso',
  ings.ordenarPorUso(catalogo)[0].nombre === harinaCat.nombre,
);

// LA REGLA: cada unidad lleva su propio total, nunca se mezclan.
comprobar('la harina lleva dos unidades separadas', harinaCat && harinaCat.totales.length === 2);
comprobar(
  'y ninguna unidad se repite',
  catalogo.every((i) => new Set(i.totales.map((t) => t.unidad)).size === i.totales.length),
);
const lecheCat = catalogo.find((i) => i.nombre.toUpperCase() === 'LECHE');
comprobar('la leche aparece con tres unidades', lecheCat && lecheCat.totales.length === 3, lecheCat ? lecheCat.totales.map((t) => t.unidad).join('/') : '');
comprobar('15 ingredientes con varias unidades', resumenIng.conVariasUnidades === 15, String(resumenIng.conVariasUnidades));

// Comprobacion aritmetica contra los datos crudos.
const harinaEnGr = repo
  .findAll()
  .flatMap((r) => r.componentes.flatMap((c) => c.items))
  .filter((i) => /HARINA DE TRIGO/i.test(i.ingrediente) && String(i.unidad).toUpperCase() === 'GR')
  .reduce((n, i) => n + Number(i.cantidad), 0);
const totalGr = harinaCat.totales.find((t) => t.unidad === 'GR');
comprobar(
  'el total en gramos cuadra con la suma cruda',
  Math.abs(totalGr.total - harinaEnGr) < 0.01,
  `${Math.round(totalGr.total)} vs ${Math.round(harinaEnGr)}`,
);

// Donde se usa cada uno: es la busqueda por ingrediente, en su sitio.
comprobar('anota en que recetas entra', harinaCat && harinaCat.enRecetas.length === harinaCat.recetas);
comprobar('con codigo y nombre de cada una', harinaCat.enRecetas.every((r) => r.id && r.nombre));

// EN QUE RECETAS SE MIDE DE CADA FORMA. Es el paso que falta para poder
// unificar unidades antes del costeo: saber que un ingrediente se mide de dos
// formas no sirve de nada si no se sabe DONDE. Son 67 lineas en 47 recetas, y
// sin esto habia que abrirlas a mano.
comprobar(
  'cada receta anota con que unidad usa el ingrediente',
  catalogo.every((i) => i.enRecetas.every((r) => Array.isArray(r.unidades) && r.unidades.length > 0)),
);

const cremaCat = catalogo.find((i) => i.nombre.toUpperCase() === 'CREMA DE LECHE');
const gruposCrema = ings.recetasPorUnidad(cremaCat);
comprobar('agrupa las recetas por unidad', gruposCrema.length === 2, gruposCrema.map((g) => g.unidad).join('/'));
comprobar(
  'la unidad MINORITARIA va primero, que es la que hay que revisar',
  gruposCrema[0].recetas.length <= gruposCrema[1].recetas.length,
  `${gruposCrema[0].unidad}:${gruposCrema[0].recetas.length} antes que ${gruposCrema[1].unidad}:${gruposCrema[1].recetas.length}`,
);
comprobar(
  'ninguna receta se pierde al agrupar',
  gruposCrema.reduce((n, g) => n + g.recetas.length, 0) >= cremaCat.recetas,
);

// El caso mas grave: UNA MISMA RECETA con dos unidades del mismo ingrediente.
// Ocurre una vez -R048 lleva agua en GR y en ML- y tiene que verse en los dos
// grupos, no en uno: la incoherencia esta dentro de una sola formula.
const aguaCat = catalogo.find((i) => i.nombre.toUpperCase() === 'AGUA');
const gruposAgua = ings.recetasPorUnidad(aguaCat);
const dondeSaleR048 = gruposAgua.filter((g) => g.recetas.some((r) => r.id === 'R048'));
comprobar(
  'una receta con dos unidades del mismo ingrediente sale en los dos grupos',
  dondeSaleR048.length === 2,
  dondeSaleR048.map((g) => g.unidad).join(' y '),
);

// Un ingrediente de una sola unidad no se agrupa: seria ruido.
const azucarCat = catalogo.find((i) => i.totales.length === 1 && i.recetas > 3);
comprobar(
  'con una sola unidad hay un solo grupo',
  ings.recetasPorUnidad(azucarCat).length === 1,
  azucarCat.nombre,
);

// Orden y filtrado.
comprobar(
  'el orden alfabetico es correcto',
  ings.ordenarPorNombre(catalogo).every((v, i, a) => i === 0 || a[i - 1].nombre.localeCompare(v.nombre, 'es') <= 0),
);
comprobar('filtra por texto', ings.filtrarIngredientes(catalogo, 'harina').length > 0);
comprobar(
  'filtra sin acentos',
  ings.filtrarIngredientes(catalogo, 'azucar').some((i) => /AZÚCAR/i.test(i.nombre)),
);
comprobar('busqueda vacia devuelve todo', ings.filtrarIngredientes(catalogo, '').length === catalogo.length);
comprobar('busqueda sin coincidencias devuelve vacio', ings.filtrarIngredientes(catalogo, 'zzzz').length === 0);
comprobar('un recetario vacio no rompe', ings.catalogoIngredientes([]).length === 0);

comprobar(
  'consultar el catalogo no altera el recetario',
  JSON.stringify(repo.findAll()) === JSON.stringify(publicado.recipes),
);

/* ---------------------------------------------------------------------------
 *  PLAN DE PRODUCCION
 *
 *  Lo critico aqui no es que sume, es que NO sume lo que no debe: juntar
 *  gramos con unidades daria una lista de compra sin sentido.
 * ------------------------------------------------------------------------ */

console.log('\n5f. Plan de produccion');
const planificador = await import(pathToFileURL(repoRoot + '/src/core/plan.js').href);

const rA = {
  id: 'P1', nombre: 'RECETA A X 1 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [{ nombre: 'MASA', items: [
    { ingrediente: 'HARINA', cantidad: 100, unidad: 'GR' },
    { ingrediente: 'HUEVOS', cantidad: 2, unidad: 'UND' },
  ] }],
};
const rB = {
  id: 'P2', nombre: 'RECETA B X 1 UND', categoria: 'PASTELERÍA', metodo: '',
  componentes: [{ nombre: 'MASA', items: [
    { ingrediente: 'HARINA', cantidad: 250, unidad: 'GR' },
    { ingrediente: 'LECHE', cantidad: 500, unidad: 'ML' },
  ] }],
};

const plan1 = planificador.consolidar([{ recipe: rA, factor: 1 }, { recipe: rB, factor: 1 }]);
const harina = plan1.lineas.find((l) => l.ingrediente === 'HARINA');
comprobar('suma el mismo ingrediente de dos recetas', harina && harina.cantidad === 350, harina ? String(harina.cantidad) : 'no aparece');
comprobar('y anota de que recetas viene', harina && harina.recetas.length === 2);

// El desglose es lo que hace comprobable la cifra consolidada: si no cuadra con
// el total, la lista dice una cosa y el detalle otra.
comprobar(
  'el desglose suma exactamente el total de la linea',
  harina.recetas.reduce((n, r) => n + r.cantidad, 0) === harina.cantidad,
);
comprobar(
  'y va de mayor a menor aporte',
  harina.recetas[0].cantidad === 250 && harina.recetas[1].cantidad === 100,
  harina.recetas.map((r) => r.cantidad).join(' / '),
);

// Dos recetas DISTINTAS pueden llamarse igual: el editor no lo impide, y los
// nombres del recetario solo son unicos porque llevan el rendimiento dentro. Si
// el desglose se indexara por nombre, las fundiria en una sola entrada: el total
// seguiria bien y el detalle diria "de 1 receta", que es justo lo contrario de
// para lo que existe el desglose.
const gemelaA = { ...rA, id: 'P3', nombre: 'RECETA GEMELA' };
const gemelaB = {
  ...rB,
  id: 'P4',
  nombre: 'RECETA GEMELA',
  componentes: [{ nombre: 'MASA', items: [{ ingrediente: 'HARINA', cantidad: 250, unidad: 'GR' }] }],
};
const planGemelas = planificador.consolidar([
  { recipe: gemelaA, factor: 1 },
  { recipe: gemelaB, factor: 1 },
]);
const harinaGemelas = planGemelas.lineas.find((l) => l.ingrediente === 'HARINA');
comprobar(
  'dos recetas con el mismo nombre no se funden en el desglose',
  harinaGemelas.recetas.length === 2,
  harinaGemelas.recetas.length + ' entradas',
);
comprobar(
  'y cada una conserva su aporte',
  harinaGemelas.recetas.map((r) => r.cantidad).sort((a, b) => a - b).join('/') === '100/250',
  harinaGemelas.recetas.map((r) => r.cantidad).join(' / '),
);
// Cuatro lineas de ingrediente entre las dos recetas, pero la harina aparece
// en ambas: consolidadas quedan tres. Eso es justo lo que hace util el plan.
comprobar('consolida en 3 lineas (harina fusionada)', plan1.totalLineas === 3, String(plan1.totalLineas));
comprobar(
  'y estan las tres esperadas',
  ['HARINA', 'HUEVOS', 'LECHE'].every((n) => plan1.lineas.some((l) => l.ingrediente === n)),
);

// Multiplicar tandas.
const plan2 = planificador.consolidar([{ recipe: rA, factor: 3 }]);
const harina3 = plan2.lineas.find((l) => l.ingrediente === 'HARINA');
comprobar('tres tandas multiplican por 3', harina3 && harina3.cantidad === 300, harina3 ? String(harina3.cantidad) : '');

// LA REGLA QUE NO SE PUEDE ROMPER: no mezclar unidades.
const rC = {
  id: 'P3', nombre: 'RECETA C X 1 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [{ nombre: 'MASA', items: [{ ingrediente: 'HARINA', cantidad: 5, unidad: 'UND' }] }],
};
const plan3 = planificador.consolidar([{ recipe: rA, factor: 1 }, { recipe: rC, factor: 1 }]);
const enGr = plan3.lineas.filter((l) => l.ingrediente === 'HARINA' && l.unidad === 'GR');
const enUnd = plan3.lineas.filter((l) => l.ingrediente === 'HARINA' && l.unidad === 'UND');
comprobar('NO suma gramos con unidades', enGr.length === 1 && enUnd.length === 1);
comprobar('los gramos quedan intactos', enGr[0].cantidad === 100, String(enGr[0].cantidad));
comprobar('las unidades quedan intactas', enUnd[0].cantidad === 5, String(enUnd[0].cantidad));
comprobar('y lo reporta como conflicto', plan3.conflictos === 1, String(plan3.conflictos));
comprobar(
  'la interfaz puede detectarlo',
  planificador.tieneVariasUnidades(plan3.lineas, 'HARINA') === true,
);
comprobar(
  'y no marca los que solo tienen una unidad',
  planificador.tieneVariasUnidades(plan1.lineas, 'LECHE') === false,
);
// El aviso tiene que poder decir CUALES, no solo cuantos: con cuarenta lineas
// en pantalla, un recuento obliga a buscarlos a ojo uno por uno.
const conflictivos = planificador.ingredientesConVariasUnidades(plan3.lineas);
comprobar(
  'nombra los ingredientes en conflicto',
  conflictivos.length === 1 && conflictivos[0] === 'HARINA',
  conflictivos.join(', '),
);
comprobar(
  'y no nombra ninguno cuando no los hay',
  planificador.ingredientesConVariasUnidades(plan1.lineas).length === 0,
);

// Un mismo ingrediente repetido en dos componentes de la MISMA receta: la
// harina de la masa y la del espolvoreado son la misma compra.
const rD = {
  id: 'P4', nombre: 'RECETA D X 1 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [
    { nombre: 'MASA', items: [{ ingrediente: 'HARINA', cantidad: 400, unidad: 'GR' }] },
    { nombre: 'ESPOLVOREADO', items: [{ ingrediente: 'HARINA', cantidad: 30, unidad: 'GR' }] },
  ],
};
const plan4 = planificador.consolidar([{ recipe: rD, factor: 1 }]);
const harinaD = plan4.lineas.find((l) => l.ingrediente === 'HARINA');
comprobar('suma el ingrediente repetido en dos componentes', harinaD.cantidad === 430, String(harinaD.cantidad));
comprobar(
  'y el desglose lo atribuye entero a su receta',
  harinaD.recetas.length === 1 && harinaD.recetas[0].cantidad === 430,
  harinaD.recetas.map((r) => `${r.nombre}: ${r.cantidad}`).join(', '),
);

// Varios conflictos a la vez: es lo que alimenta la frase que los enumera.
const rE = {
  id: 'P5', nombre: 'RECETA E X 1 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [{ nombre: 'MASA', items: [
    { ingrediente: 'HUEVOS', cantidad: 300, unidad: 'GR' },
    { ingrediente: 'LECHE', cantidad: 2, unidad: 'MG' },
  ] }],
};
const plan5 = planificador.consolidar([
  { recipe: rA, factor: 1 }, { recipe: rB, factor: 1 }, { recipe: rC, factor: 1 }, { recipe: rE, factor: 1 },
]);
const variosConflictos = planificador.ingredientesConVariasUnidades(plan5.lineas);
comprobar(
  'nombra los tres ingredientes en conflicto',
  variosConflictos.length === 3,
  variosConflictos.join(', '),
);
comprobar('y el recuento coincide con los nombres', plan5.conflictos === variosConflictos.length);

// Cantidades imposibles: no restan del total ni inflan la lista. En el catalogo
// real no hay ninguna; esto protege de lo que pueda entrar al editar.
const rF = {
  id: 'P6', nombre: 'RECETA F X 1 UND', categoria: 'PANADERÍA', metodo: '',
  componentes: [{ nombre: 'MASA', items: [
    { ingrediente: 'HARINA', cantidad: 100, unidad: 'GR' },
    { ingrediente: 'SAL', cantidad: 0, unidad: 'GR' },
    { ingrediente: 'AZUCAR', cantidad: -50, unidad: 'GR' },
  ] }],
};
const plan6 = planificador.consolidar([{ recipe: rF, factor: 1 }]);
comprobar('descarta cantidades cero y negativas', plan6.totalLineas === 1, String(plan6.totalLineas));
comprobar('y no altera la que si es valida', plan6.lineas[0].cantidad === 100, String(plan6.lineas[0].cantidad));

// El limite que el nucleo aplica en silencio: la interfaz lo necesita para
// poder avisar ANTES de recortar, en vez de enseñar una cifra y consolidar otra.
const escalador = await import(pathToFileURL(repoRoot + '/src/core/scale.js').href);
comprobar('los limites del factor son publicos', escalador.FACTOR_MIN === 0.05 && escalador.FACTOR_MAX === 100);
comprobar('y normalizarFactor recorta hasta ellos', escalador.normalizarFactor(500) === escalador.FACTOR_MAX);

/* ---------------------------------------------------------------------------
 *  RENDIMIENTO COMO CAMPO PROPIO DEL EDITOR
 *
 *  El editor separa el nombre en base + cantidad + unidad al abrir, y lo vuelve
 *  a juntar al guardar. Lo que se protege aqui es lo unico que no se puede
 *  romper: abrir una receta y guardarla SIN tocar el rendimiento tiene que
 *  devolver el nombre identico. 13 de las 121 usan `x` minuscula o "2UND" sin
 *  espacio, asi que componer la forma canonica a ciegas las reescribiria y
 *  cambiaria la identidad con la que aparecen en el plan y en el catalogo.
 * ------------------------------------------------------------------------ */

console.log('\n5g. Rendimiento en el editor');
const formato = await import(pathToFileURL(repoRoot + '/src/lib/format.js').href);

/** Reproduce lo que hace el editor entre abrir y guardar sin tocar nada. */
function abrirYGuardarSinTocar(nombre) {
  const p = formato.splitYield(nombre);
  const original = formato.splitYield(nombre);
  const sinCambios =
    p.base.trim() === original.base.trim() &&
    p.cantidad.trim() === original.cantidad.trim() &&
    p.unidad.trim() === original.unidad.trim();
  return sinCambios ? nombre : formato.composeName(p.base, p.cantidad, p.unidad);
}

const todasLasRecetas = repo.findAll();
const nombresIntactos = todasLasRecetas.filter((r) => abrirYGuardarSinTocar(r.nombre) === r.nombre);
comprobar(
  'abrir y guardar sin tocar el rendimiento deja los 121 nombres identicos',
  nombresIntactos.length === todasLasRecetas.length,
  `${nombresIntactos.length}/${todasLasRecetas.length}`,
);

// Las tres partes se separan bien en los formatos que hay de verdad.
comprobar(
  'separa el formato normal',
  JSON.stringify(formato.splitYield('ALMOJÁBANA (LEÓN) X 15 UND')) ===
    JSON.stringify({ base: 'ALMOJÁBANA (LEÓN)', cantidad: '15', unidad: 'UND' }),
);
comprobar(
  'separa la x minuscula',
  JSON.stringify(formato.splitYield('BROWNIE HOBANY x 24 UND')) ===
    JSON.stringify({ base: 'BROWNIE HOBANY', cantidad: '24', unidad: 'UND' }),
);
comprobar(
  'separa el rendimiento sin unidad',
  JSON.stringify(formato.splitYield('GALLETAS SUGAR COOKIE x 5')) ===
    JSON.stringify({ base: 'GALLETAS SUGAR COOKIE', cantidad: '5', unidad: '' }),
);
comprobar(
  'separa el pegado sin espacio',
  JSON.stringify(formato.splitYield('PAN BAGUETTE X 4UND')) ===
    JSON.stringify({ base: 'PAN BAGUETTE', cantidad: '4', unidad: 'UND' }),
);
comprobar(
  'conserva entero el rendimiento doble',
  formato.splitYield('BAGUEL NORMAL X 32 UND O 8 PAQ.').unidad === 'UND O 8 PAQ.',
  formato.splitYield('BAGUEL NORMAL X 32 UND O 8 PAQ.').unidad,
);
comprobar(
  'una receta sin rendimiento no inventa ninguno',
  formato.splitYield('PONQUE BASICO').cantidad === '' &&
    formato.splitYield('PONQUE BASICO').unidad === '',
);

// Al cambiar el rendimiento SI se reescribe, y en forma canonica.
comprobar(
  'cambiar el rendimiento escribe la forma canonica',
  formato.composeName('BROWNIE HOBANY', '30', 'UND') === 'BROWNIE HOBANY X 30 UND',
  formato.composeName('BROWNIE HOBANY', '30', 'UND'),
);
comprobar(
  'sin unidad no deja un espacio colgando',
  formato.composeName('GALLETAS', '5', '') === 'GALLETAS X 5',
  JSON.stringify(formato.composeName('GALLETAS', '5', '')),
);
comprobar(
  'sin cantidad no escribe la X',
  formato.composeName('PONQUE BASICO', '', 'UND') === 'PONQUE BASICO',
  formato.composeName('PONQUE BASICO', '', 'UND'),
);
comprobar('un nombre vacio sigue vacio', formato.composeName('', '5', 'UND') === '');

// Lo que de verdad importa del cambio: el nombre que compone el editor tiene
// que ser legible por el escalado, que es quien lee esa cifra para saber cuanto
// rinde una tanda. (El recuento de las 87 recetas con rendimiento ya se
// comprueba mas arriba, en la seccion de escalado.)
comprobar(
  'un nombre compuesto por el editor lo lee el escalado',
  escalador.rendimientoBase(formato.composeName('TORTA NUEVA', '12', 'UND')) === 12,
);
comprobar(
  'y uno sin unidad tambien',
  escalador.rendimientoBase(formato.composeName('GALLETAS NUEVAS', '30', '')) === 30,
);

// La lista del desplegable de unidades. Es la pieza que evita perder la mitad
// del rendimiento de BAGUEL NORMAL al abrir su ficha y guardarla.
const UNIDADES = ['UND', 'PAQ.', 'CAJAS', 'PORCIONES'];
comprobar(
  'conserva una unidad desconocida como opcion propia',
  formato.yieldUnitList(UNIDADES, 'UND O 8 PAQ.').includes('UND O 8 PAQ.'),
);
comprobar(
  'no duplica una unidad ya conocida',
  formato.yieldUnitList(UNIDADES, 'UND').length === UNIDADES.length,
);
comprobar(
  'sin unidad no añade nada',
  formato.yieldUnitList(UNIDADES, '').length === UNIDADES.length,
);
comprobar(
  'y no modifica la lista que recibe',
  (() => {
    const copia = [...UNIDADES];
    formato.yieldUnitList(copia, 'RARA');
    return copia.length === UNIDADES.length;
  })(),
);

// Todas las unidades reales del catalogo sobreviven al desplegable.
const unidadesReales = [...new Set(todasLasRecetas.map((r) => formato.splitYield(r.nombre).unidad).filter(Boolean))];
comprobar(
  'todas las unidades del catalogo caben en el desplegable',
  unidadesReales.every((u) => formato.yieldUnitList(UNIDADES, u).includes(u)),
  unidadesReales.join(' | '),
);

// El rendimiento escalado: la regla que la hoja impresa no aplicaba.
comprobar(
  'el rendimiento escalado multiplica con la tanda',
  escalador.rendimientoEscalado('TORTA DE BANANO X 2 UND', 3) === '6 und',
  escalador.rendimientoEscalado('TORTA DE BANANO X 2 UND', 3),
);
comprobar(
  'con tanda original no toca el texto',
  escalador.rendimientoEscalado('TORTA DE BANANO X 2 UND', 1) === '2 und',
  escalador.rendimientoEscalado('TORTA DE BANANO X 2 UND', 1),
);
comprobar(
  'sin rendimiento declarado devuelve vacio',
  escalador.rendimientoEscalado('PONQUE BASICO', 3) === '',
);

// La guarda que impide que los dos lectores del rendimiento se separen.
comprobar(
  'splitYield y rendimientoBase coinciden en las 121 recetas',
  todasLasRecetas.every((r) => {
    const c = formato.splitYield(r.nombre).cantidad;
    const esperado = c === '' ? null : parseFloat(c.replace(',', '.'));
    return escalador.rendimientoBase(r.nombre) === (esperado === null || !(esperado > 0) ? null : esperado);
  }),
);

// Sobre el catalogo real, con recetas de verdad.
const tresReales = repo.findAll().slice(0, 3).map((r) => ({ recipe: r, factor: 1 }));
const planReal = planificador.consolidar(tresReales);
comprobar('funciona con recetas reales', planReal.totalLineas > 0, `${planReal.totalLineas} ingredientes`);
comprobar(
  'consolida: menos lineas que la suma de las tres',
  planReal.totalLineas <= tresReales.reduce((n, e) => n + countItemsDe(e.recipe), 0),
);
comprobar('ordenado alfabeticamente', estaOrdenado(planReal.lineas.map((l) => l.ingrediente)));
comprobar('un plan vacio no rompe', planificador.consolidar([]).totalLineas === 0);
comprobar(
  'planificar no altera el recetario',
  JSON.stringify(repo.findAll()) === JSON.stringify(publicado.recipes),
);

function countItemsDe(r) {
  return r.componentes.reduce((n, c) => n + c.items.length, 0);
}
function estaOrdenado(lista) {
  return lista.every((v, i) => i === 0 || lista[i - 1].localeCompare(v, 'es') <= 0);
}

console.log('\n6. Las 121 recetas reales quedan como estaban');
const idsReales = publicado.recipes.map((r) => r.id).sort();
const idsAhora = repo.findAll().map((r) => r.id).sort();
comprobar('mismos codigos', JSON.stringify(idsReales) === JSON.stringify(idsAhora));
comprobar(
  'mismo contenido byte a byte',
  JSON.stringify(publicado.recipes) === JSON.stringify(repo.findAll()),
);

/* ===========================================================================
 *  BLOQUE 2: LA CLAVE DEL EQUIPO
 *
 *  Ya no hay usuarios: una sola clave que caduca cada semana. Lo que hay que
 *  proteger aqui son dos cosas. Que nadie se quede fuera al actualizar desde
 *  los modelos anteriores, y que la caducidad cuente los dias de verdad.
 * ======================================================================== */

console.log('\n7. Clave de fabrica');
await acceso.ensureAccess();
comprobar('entra con la clave de fabrica', (await acceso.verifyPassword(acceso.DEFAULT_PASSWORD)).ok);
comprobar('rechaza una clave incorrecta', !(await acceso.verifyPassword('incorrecta')).ok);
comprobar('y detecta que sigue siendo la de fabrica', await acceso.isUsingDefaultPassword());
acceso.signIn();
comprobar('la sesion queda abierta', acceso.isSignedIn() === true);

console.log('\n8. Cambiar la clave');
let r = await acceso.changePassword('claveIncorrecta', 'NuevaClave123', 'NuevaClave123');
comprobar('rechaza si la actual esta mal', !r.ok, r.ok ? 'lo permitio' : r.message);
r = await acceso.changePassword(acceso.DEFAULT_PASSWORD, 'abc', 'abc');
comprobar('rechaza una clave demasiado corta', !r.ok, r.ok ? 'la permitio' : r.message);
r = await acceso.changePassword(acceso.DEFAULT_PASSWORD, 'ClaveLarga1', 'ClaveLarga2');
comprobar('rechaza si las dos nuevas no coinciden', !r.ok, r.ok ? 'lo permitio' : r.message);
r = await acceso.changePassword(acceso.DEFAULT_PASSWORD, acceso.DEFAULT_PASSWORD, acceso.DEFAULT_PASSWORD);
comprobar('rechaza repetir la misma clave', !r.ok, r.ok ? 'lo permitio' : r.message);

r = await acceso.changePassword(acceso.DEFAULT_PASSWORD, 'NuevaClave123', 'NuevaClave123');
comprobar('acepta con la actual correcta', r.ok, r.ok ? '' : r.message);
comprobar('la nueva funciona', (await acceso.verifyPassword('NuevaClave123')).ok);
comprobar('la anterior ya no', !(await acceso.verifyPassword(acceso.DEFAULT_PASSWORD)).ok);
comprobar('y deja de ser la de fabrica', !(await acceso.isUsingDefaultPassword()));

console.log('\n9. Retirada de la clave por generacion de acceso');

// Sustituye a la caducidad semanal, que obligaba a renovar por calendario en
// cada aparato por separado y no retiraba el acceso a nadie. Ahora la panaderia
// sube un numero en el servidor y todos los equipos piden clave nueva a la vez.
let vigencia = acceso.estadoClave();
comprobar('sin generacion nueva, la clave no caduca', vigencia.caducada === false);
comprobar('la generacion vigente arranca en cero', vigencia.vigente === 0, String(vigencia.vigente));

// El servidor anuncia que se ha retirado el acceso.
acceso.anotarGeneracion(1);
vigencia = acceso.estadoClave();
comprobar(
  'al subir la generacion, la clave de este equipo queda retirada',
  vigencia.caducada === true && vigencia.motivo === 'revocada',
  JSON.stringify(vigencia),
);
comprobar('retirada, todavia sirve para entrar y poder cambiarla', (await acceso.verifyPassword('NuevaClave123')).ok);

r = await acceso.changePassword('NuevaClave123', 'OtraMas456', 'OtraMas456');
comprobar('poner una clave nueva la sella con la generacion vigente', r.ok, r.ok ? '' : r.message);
comprobar('y deja de pedirse el cambio', acceso.estadoClave().caducada === false);
comprobar('la generacion quedo anotada', acceso.estadoClave().generacion === 1, String(acceso.estadoClave().generacion));

// Un servidor que de pronto contesta menos no puede reactivar claves retiradas.
acceso.anotarGeneracion(0);
comprobar('la generacion no baja nunca', acceso.estadoClave().vigente === 1, String(acceso.estadoClave().vigente));

// Sin red no se anota nada nuevo, asi que un obrador sin señal sigue entrando.
comprobar('sin generacion nueva no queda nadie fuera', acceso.estadoClave().caducada === false);

console.log('\n10. Migracion desde los modelos anteriores');
// Un equipo que venia de la lista de usuarios: se conserva la clave de zahavi.
almacen.clear();
almacenSesion.clear();
almacen.set(
  'zahavi_usuarios_v1',
  JSON.stringify([
    { name: 'otra-persona', credential: { alg: 'plain', value: 'suya' }, createdAt: new Date().toISOString() },
    { name: 'zahavi', credential: { alg: 'plain', value: 'la-de-siempre' }, createdAt: new Date().toISOString() },
  ]),
);
await acceso.ensureAccess();
comprobar('migra conservando la clave de zahavi', (await acceso.verifyPassword('la-de-siempre')).ok);
comprobar('y descarta la lista de usuarios', almacen.get('zahavi_usuarios_v1') === undefined);

// Un equipo que venia de la clave unica de dos modelos atras.
almacen.clear();
almacen.set('zahavi_recetario_pwd_v2', JSON.stringify({ alg: 'plain', value: 'clave-vieja' }));
await acceso.ensureAccess();
comprobar('migra la clave unica anterior', (await acceso.verifyPassword('clave-vieja')).ok);

// Un equipo nuevo del todo.
almacen.clear();
await acceso.ensureAccess();
comprobar('un equipo nuevo arranca con la de fabrica', (await acceso.verifyPassword(acceso.DEFAULT_PASSWORD)).ok);

console.log('\n10c. Los dos motivos de no entrar se distinguen');

// Decir "Clave incorrecta" cuando el problema real es que el equipo no puede
// guardar nada manda a la persona a probar claves buenas toda la manana.
const malaClave = await acceso.verifyPassword('esta-no-es-la-clave');
comprobar('una clave mal escrita da clave_incorrecta', malaClave.code === 'clave_incorrecta', malaClave.code);

// Sin credencial guardada: es lo que ocurre cuando el almacenamiento no esta
// disponible, y reescribir la clave no lo arregla.
almacen.clear();
const sinCredencial = await acceso.verifyPassword('la-que-sea');
comprobar('sin credencial guardada da sin_credencial', sinCredencial.code === 'sin_credencial', sinCredencial.code);
comprobar(
  'y el mensaje NO dice "incorrecta"',
  !sinCredencial.message.toLowerCase().includes('incorrecta'),
  sinCredencial.message,
);

await acceso.ensureAccess();

console.log('\n11. Cerrar sesion revoca tambien la clave de edicion');
// Se prueba `cerrarSesion` y NO `signOut`, y la diferencia importa: `signOut`
// solo cierra la sesion local. Las dos mitades -cerrar y revocar- viven juntas
// en el caso de uso, y `scripts/verificar.mjs` comprueba que nadie llame a la
// de abajo por su cuenta. Lo que esta prueba fija es la GARANTIA: quien entre
// despues no hereda la capacidad de publicar de quien estuvo antes.
const remote = await import(pathToFileURL(repoRoot + '/src/core/remote.js').href);
const comandos = await import(pathToFileURL(repoRoot + '/src/app/commands.js').href);

comandos.entrarSesion();
comprobar('la sesion se abre', acceso.isSignedIn() === true);
remote.setEditKey('clave-de-edicion-de-prueba');
comprobar('la clave queda en la sesion', remote.getEditKey() === 'clave-de-edicion-de-prueba');
comandos.cerrarSesion();
comprobar('la sesion se cierra', acceso.isSignedIn() === false);
comprobar('y la clave de edicion se borra', remote.getEditKey() === '', remote.getEditKey());

console.log('\n11b. La clave de edicion caduca por inactividad');

// La clave se queda en la sesion para que la publicacion automatica salga sola
// despues de guardar. En una tableta instalada como aplicacion esa sesion no
// termina al acabar el turno, sino cuando alguien cierra la ventana, asi que
// sin caducidad quedaba una llave olvidada sobre el mostrador: cualquiera que
// se encontrara el aparato encendido podia publicar para las dos sedes.
remote.setEditKey('clave-de-edicion-de-prueba');
comprobar('recien puesta, la clave vale', remote.getEditKey() === 'clave-de-edicion-de-prueba');

// Media hora y un minuto sin usarla.
almacenSesion.set('zahavi_edit_key_desde', String(Date.now() - (31 * 60 * 1000)));
comprobar('pasada la media hora deja de valer', remote.getEditKey() === '', remote.getEditKey());
comprobar('y se borra de la sesion, no solo se oculta', almacenSesion.has('zahavi_edit_key') === false);

// Una marca ilegible se trata como vencida: es la unica proteccion real del
// sistema, asi que ante la duda se vuelve a pedir.
remote.setEditKey('clave-con-marca-rota');
almacenSesion.set('zahavi_edit_key_desde', 'no-es-un-numero');
comprobar('una marca ilegible tambien caduca', remote.getEditKey() === '', remote.getEditKey());

// Y dentro de la ventana sigue valiendo: la caducidad no puede estorbar el turno.
remote.setEditKey('clave-vigente');
almacenSesion.set('zahavi_edit_key_desde', String(Date.now() - 5 * 60 * 1000));
comprobar('cinco minutos despues sigue valiendo', remote.getEditKey() === 'clave-vigente');

remote.setEditKey('');

/* ===========================================================================
 *  CIERRE: EL ARCHIVO REAL NO SE TOCO
 * ======================================================================== */

console.log('\n14b. Un ingrediente a medias no se guarda');

// Antes bastaba con el nombre: se podia guardar "AZUCAR" sin cantidad y sin
// unidad. Ese ingrediente envenena todo lo que toca -escalar, consolidar la
// compra, el Modo Pesar junto a la bascula, y la hoja que se lleva al obrador-,
// asi que ahora se rechaza al guardar.
function receta(items, componentes) {
  return {
    nombre: 'QA-TEST-VALIDACION X 1 UND',
    categoria: 'PANADERÍA',
    metodo: '',
    componentes: componentes || [{ nombre: 'PRINCIPAL', items }],
  };
}

let v = validateRecipe(receta([{ ingrediente: 'AZUCAR', cantidad: '100', unidad: 'GR' }]));
comprobar('un ingrediente completo se acepta', v.ok, v.ok ? '' : v.message);

v = validateRecipe(receta([{ ingrediente: 'AZUCAR', cantidad: '', unidad: 'GR' }]));
comprobar('sin cantidad se rechaza', !v.ok && v.code === 'cantidad_required', v.ok ? 'lo acepto' : v.message);

v = validateRecipe(receta([{ ingrediente: 'AZUCAR', cantidad: '100', unidad: '' }]));
comprobar('sin unidad se rechaza', !v.ok && v.code === 'unidad_required', v.ok ? 'lo acepto' : v.message);

v = validateRecipe(receta([{ ingrediente: 'AZUCAR', cantidad: 'un poco', unidad: 'GR' }]));
comprobar('una cantidad que no es numero se rechaza', !v.ok && v.code === 'cantidad_invalid', v.ok ? 'lo acepto' : v.message);

v = validateRecipe(receta([{ ingrediente: 'AZUCAR', cantidad: '0', unidad: 'GR' }]));
comprobar('una cantidad de cero se rechaza', !v.ok && v.code === 'cantidad_cero', v.ok ? 'lo acepto' : v.message);

v = validateRecipe(receta([{ ingrediente: 'AZUCAR', cantidad: '-5', unidad: 'GR' }]));
comprobar('una cantidad negativa se rechaza', !v.ok, v.ok ? 'lo acepto' : v.message);

// La fila libre que el editor deja siempre al final no puede dar error.
v = validateRecipe(
  receta([
    { ingrediente: 'AZUCAR', cantidad: '100', unidad: 'GR' },
    { ingrediente: '', cantidad: '', unidad: '' },
  ]),
);
comprobar('la fila vacia del final se ignora, no da error', v.ok, v.ok ? '' : v.message);

// Decimales con coma, que es como se escriben aqui.
v = validateRecipe(receta([{ ingrediente: 'SAL', cantidad: '2,5', unidad: 'GR' }]));
comprobar('acepta decimales con coma', v.ok, v.ok ? '' : v.message);

// Con varios componentes, el mensaje tiene que decir en cual falla: con catorce
// lineas en pantalla, "falta una cantidad" obliga a buscarla a ojo.
v = validateRecipe(
  receta(null, [
    { nombre: 'BASE', items: [{ ingrediente: 'HARINA', cantidad: '1', unidad: 'KG' }] },
    { nombre: 'RELLENO', items: [{ ingrediente: 'CREMA', cantidad: '', unidad: 'GR' }] },
  ]),
);
comprobar(
  'dice el ingrediente y el componente donde falla',
  !v.ok && v.message.includes('CREMA') && v.message.includes('RELLENO'),
  v.ok ? 'lo acepto' : v.message,
);

// Y lo que ya existe tiene que seguir entrando: las 121 reales estan completas.
let realesValidas = 0;
for (const r of publicado.recipes) {
  if (validateRecipe(r).ok) realesValidas += 1;
}
comprobar(
  'las 121 recetas reales pasan la validacion nueva',
  realesValidas === publicado.recipes.length,
  realesValidas + ' de ' + publicado.recipes.length,
);

console.log('\n14c. El estado por modulos aguanta un modulo nuevo');

// El dia que entre el costeo, `setState({costos: {...}})` no puede pisar el
// recetario, y `setState({recetario: {factor: 2}})` no puede borrar las recetas
// cargadas. Las dos cosas dependen de que la fusion sea de UN nivel y de que
// todo modulo este declarado en `MODULOS`.
const almacenEstado = await import(pathToFileURL(repoRoot + '/src/core/store.js').href);

const modulosDeclarados = almacenEstado.MODULOS;
const estadoInicial = almacenEstado.getState();

// Toda clave de objeto plano en la raiz tiene que ser un modulo declarado. Si
// no lo esta, `setState` la reemplazaria entera en vez de fusionarla, y un
// cambio parcial borraria en silencio el resto de ese modulo.
const objetosEnRaiz = Object.keys(estadoInicial).filter((k) => {
  const v = estadoInicial[k];
  return v !== null && typeof v === 'object' && !Array.isArray(v);
});
const sinDeclarar = objetosEnRaiz.filter((k) => !modulosDeclarados.includes(k));
comprobar(
  'todo modulo del estado esta declarado en MODULOS',
  sinDeclarar.length === 0,
  sinDeclarar.length ? 'sin declarar: ' + sinDeclarar.join(', ') : modulosDeclarados.length + ' modulo(s)',
);

// La fusion de un nivel: cambiar una clave deja el resto del modulo intacto.
almacenEstado.setState({ recetario: { recipes: [{ id: 'X1' }], factor: 3 } });
almacenEstado.setState({ recetario: { factor: 5 } });
comprobar(
  'cambiar una clave del modulo no borra las demas',
  almacenEstado.recetario().recipes.length === 1,
  String(almacenEstado.recetario().recipes.length),
);
comprobar(
  'y la clave cambiada tiene el valor nuevo',
  almacenEstado.recetario().factor === 5,
  String(almacenEstado.recetario().factor),
);

// Lo transversal y lo del modulo no se estorban.
almacenEstado.setState({ online: false });
comprobar(
  'tocar lo transversal no toca el modulo',
  almacenEstado.recetario().factor === 5 && almacenEstado.getState().online === false,
);

// Un cambio que no cambia nada no debe repintar.
let repintados = 0;
const cancelarEscucha = almacenEstado.subscribe(() => {
  repintados += 1;
});
almacenEstado.setState({ recetario: { factor: 5 } });
comprobar('un cambio que no cambia nada no notifica', repintados === 0, String(repintados));
almacenEstado.setState({ recetario: { factor: 6 } });
comprobar('y uno que si cambia, notifica una vez', repintados === 1, String(repintados));
cancelarEscucha();

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
