/**
 * =============================================================================
 *  PRUEBA DEL ALMACEN Y DEL COSTEO
 * =============================================================================
 *
 *  Sin navegador y en segundos. Lo que se fija aqui no es que la pantalla se
 *  pinte -de eso se encarga `tests/almacen.spec.js`- sino las reglas de negocio
 *  que, si se rompen, se convierten en dinero mal contado sin que nadie lo note
 *  mirando la pantalla:
 *
 *      1. FEFO: sale antes lo que vence antes, y lo VENCIDO no sale.
 *      2. Las unidades se convierten solo con equivalencias explícitas.
 *      3. El costo se calcula lote a lote, no con un precio medio.
 *      4. Descontar no deja existencias negativas ni se aplica dos veces.
 *      5. El valor unitario se deriva y no se guarda.
 *
 *  NINGUNA CIFRA ESCRITA A MANO
 *  ----------------------------
 *  `CLAUDE.md` seccion 6 lo explica con el defecto que lo origino: el dia que la
 *  panaderia publico una receta, cuatro scripts y seis pruebas se pusieron rojos
 *  sin que hubiera nada roto, porque llevaban el total escrito. Aqui las cifras
 *  se calculan de los propios datos o se construyen dentro de la prueba, y lo
 *  que se comprueba son PROPIEDADES.
 *
 *  NO TOCA NINGUN DATO REAL: `localStorage` es un Map en memoria que muere con
 *  el proceso. Al terminar se comprueba que `data/recipes.json` sigue igual.
 *
 *  Se ejecuta con:  node scripts/test-almacen.mjs
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rutaDatos = join(repoRoot, 'data/recipes.json');
const shaAntes = createHash('sha256').update(readFileSync(rutaDatos)).digest('hex');

/* ===========================================================================
 *  NAVEGADOR SIMULADO
 * ======================================================================== */

const memoria = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => memoria.set(k, String(v)),
    removeItem: (k) => memoria.delete(k),
  },
};

const modulo = (rel) => import(pathToFileURL(join(repoRoot, rel)).href);

const A = await modulo('src/core/almacen.js');
const C = await modulo('src/core/costeo.js');

let fallos = 0;

function comprobar(titulo, condicion, detalle = '') {
  const marca = condicion ? 'OK   ' : 'FALLA';
  if (!condicion) fallos += 1;
  console.log(`  ${marca} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
}

/** Un dia relativo a hoy, en el formato del almacen. */
function dia(desplazamiento) {
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const d = new Date(hoy + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + desplazamiento);
  return d.toISOString().slice(0, 10);
}

/** Un lote de prueba, con lo justo. */
function lote(id, ingrediente, unidad, peso, costo, existencia, vence) {
  return A.normalizarLote({
    id,
    ingrediente,
    unidad,
    pesoCompra: peso,
    costoCompra: costo,
    existencia,
    vencimiento: vence,
    presentacion: 'QA-TEST',
    marca: 'QA-TEST',
    lote: 'QA-TEST-' + id,
  });
}

console.log('\nProbando el almacen y el costeo\n');

/* ===========================================================================
 *  1. EL VALOR UNITARIO SE DERIVA
 * ======================================================================== */

console.log('1. El valor por unidad de medida');

const unLote = lote('L001', 'HARINA', 'GR', 25000, 120000, 25000, dia(180));
comprobar(
  'sale de dividir el costo entre el peso',
  A.valorUnitario(unLote) === 120000 / 25000,
  String(A.valorUnitario(unLote)),
);
comprobar('no se guarda en el lote', !('valorUnitario' in unLote));
comprobar(
  'sin peso no se inventa un valor, devuelve null',
  A.valorUnitario(lote('L002', 'X', 'GR', 0, 100, 0, '')) === null,
);

/* ===========================================================================
 *  2. LA EXISTENCIA NUNCA PASA DE LO COMPRADO NI BAJA DE CERO
 * ======================================================================== */

console.log('\n2. La existencia se mantiene dentro de lo posible');

comprobar(
  'una existencia negativa se corrige a cero',
  A.normalizarLote({ id: 'L', ingrediente: 'X', pesoCompra: 100, existencia: -50 }).existencia === 0,
);
comprobar(
  'una existencia mayor que la compra se recorta a la compra',
  A.normalizarLote({ id: 'L', ingrediente: 'X', pesoCompra: 100, existencia: 500 }).existencia === 100,
);

/* ===========================================================================
 *  3. VALIDACION
 * ======================================================================== */

console.log('\n3. Lo que no se deja guardar');

const sinIngrediente = A.validarLote({ pesoCompra: 10, costoCompra: 1 });
comprobar('sin ingrediente se rechaza', sinIngrediente.ok === false, sinIngrediente.code);
const sinPeso = A.validarLote({ ingrediente: 'HARINA', pesoCompra: 0, costoCompra: 1 });
comprobar('sin peso se rechaza', sinPeso.ok === false, sinPeso.code);
comprobar(
  'y el mensaje esta redactado para la persona, sin codigos crudos',
  typeof sinPeso.message === 'string' && sinPeso.message.length > 20 && !sinPeso.message.includes('_'),
);
const bueno = A.validarLote({ ingrediente: 'harina', pesoCompra: '1.000', costoCompra: 5, existencia: 1, unidad: 'gr' });
comprobar('uno correcto pasa y sube a mayusculas', bueno.ok === true && bueno.value.ingrediente === 'HARINA');

/* ===========================================================================
 *  4. FEFO
 * ======================================================================== */

console.log('\n4. FEFO: sale antes lo que vence antes');

const paraFEFO = [
  lote('L003', 'HARINA', 'GR', 1000, 1000, 1000, ''),
  lote('L004', 'HARINA', 'GR', 1000, 1000, 1000, dia(200)),
  lote('L005', 'HARINA', 'GR', 1000, 1000, 1000, dia(10)),
];
const ordenados = A.lotesOrdenadosFEFO(paraFEFO);
comprobar('el que vence antes va primero', ordenados[0].id === 'L005', ordenados.map((l) => l.id).join(','));
comprobar(
  'el que no tiene fecha va al final, no al principio',
  ordenados[ordenados.length - 1].id === 'L003',
);

console.log('\n5. Estados de vencimiento');
comprobar('vencido', A.estadoVencimiento(lote('L', 'X', 'GR', 1, 1, 1, dia(-1))) === 'vencido');
comprobar('proximo dentro del plazo', A.estadoVencimiento(lote('L', 'X', 'GR', 1, 1, 1, dia(5))) === 'proximo');
comprobar(
  'en fecha mas alla del plazo',
  A.estadoVencimiento(lote('L', 'X', 'GR', 1, 1, 1, dia(A.DIAS_PROXIMO + 10))) === 'ok',
);
comprobar('sin fecha se dice, no se supone', A.estadoVencimiento(lote('L', 'X', 'GR', 1, 1, 1, '')) === 'sin_fecha');

/* ===========================================================================
 *  6. EL COSTEO, QUE ES DONDE ESTA EL DINERO
 * ======================================================================== */

console.log('\n6. El costo se calcula lote a lote, no con un precio medio');

// Dos compras del mismo ingrediente a precios MUY distintos. Si se promediara,
// el costo de consumir 1.000 seria 15.000; lote a lote y por FEFO son 10.000,
// porque sale entero del lote barato, que es el que vence antes.
const dosPrecios = [
  lote('L006', 'HARINA', 'GR', 1000, 10000, 1000, dia(10)),
  lote('L007', 'HARINA', 'GR', 1000, 20000, 1000, dia(90)),
];
const unaLinea = C.costearPlan([{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 1000 }], dosPrecios);
comprobar(
  'consumir 1.000 sale del lote que vence antes',
  unaLinea.costoTotal === 10000,
  String(unaLinea.costoTotal),
);
comprobar(
  'y el promedio de los dos lotes habria dado otra cifra',
  unaLinea.costoTotal !== (10000 + 20000) / 2,
);

const aCaballo = C.costearPlan([{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 1500 }], dosPrecios);
comprobar(
  'a caballo entre dos lotes se suma cada tramo a su precio',
  aCaballo.costoTotal === 10000 + 10000,
  String(aCaballo.costoTotal),
);
comprobar('y el desglose dice de que lotes sale', aCaballo.lineas[0].origen.length === 2);

console.log('\n7. Lo vencido no se consume');
const conVencido = [
  lote('L008', 'AZUCAR', 'GR', 1000, 5000, 1000, dia(-5)),
  lote('L009', 'AZUCAR', 'GR', 1000, 8000, 1000, dia(60)),
];
const evita = C.costearPlan([{ ingrediente: 'AZUCAR', unidad: 'GR', cantidad: 500 }], conVencido);
comprobar(
  'el lote vencido queda fuera aunque venza antes',
  evita.lineas[0].origen.every((o) => o.loteId !== 'L008'),
  evita.lineas[0].origen.map((o) => o.loteId).join(','),
);
comprobar('y se informa de cuantos se dejaron fuera', evita.lotesVencidosIgnorados === 1);
comprobar(
  'la existencia disponible tampoco lo cuenta',
  evita.lineas[0].disponible === 1000,
  String(evita.lineas[0].disponible),
);

console.log('\n8. Las unidades requieren equivalencias en gramos');
const enUnidades = [lote('L010', 'HUEVOS', 'UND', 30, 18000, 30, dia(20))];
const pideGramos = C.costearPlan([{ ingrediente: 'HUEVOS', unidad: 'GR', cantidad: 100 }], enUnidades);
comprobar('sin peso de la unidad se indica la equivalencia faltante', pideGramos.lineas[0].estado === 'sin_conversion');
comprobar('no se inventa ningun costo', pideGramos.costoTotal === 0);
comprobar('y se cuenta como linea sin precio', pideGramos.lineasSinPrecio === 1);

const pideUnidades = C.costearPlan([{ ingrediente: 'HUEVOS', unidad: 'UND', cantidad: 10 }], enUnidades.map((l) => ({ ...l, equivalencias: { UND: 50 } })));
comprobar('pedirlo en su propia unidad si cuesta', pideUnidades.costoTotal === 6000, String(pideUnidades.costoTotal));

console.log('\n9. Cuando no alcanza');
const poco = [lote('L011', 'SAL', 'GR', 100, 1000, 100, dia(50))];
const falta = C.costearPlan([{ ingrediente: 'SAL', unidad: 'GR', cantidad: 250 }], poco);
comprobar('el estado lo dice', falta.lineas[0].estado === 'parcial', falta.lineas[0].estado);
comprobar('se consume solo lo que hay', falta.lineas[0].consumo === 100);
comprobar('y el faltante es la diferencia exacta', falta.lineas[0].faltante === 150);
comprobar('el faltante nunca es negativo', falta.lineas.every((l) => l.faltante >= 0));

console.log('\n10. Dos lineas del mismo ingrediente no gastan dos veces lo mismo');
const unSoloLote = [lote('L012', 'HARINA DE TRIGO', 'GR', 100, 1000, 100, dia(50))];
const dobleGasto = C.costearPlan(
  [
    { ingrediente: 'HARINA DE TRIGO', unidad: 'GR', cantidad: 80 },
    { ingrediente: 'HARINA DE TRIGO', unidad: 'GR', cantidad: 80 },
  ],
  unSoloLote,
);
const consumidoTotal = dobleGasto.lineas.reduce((n, l) => n + l.consumo, 0);
comprobar(
  'entre las dos no se consume mas de lo que hay',
  consumidoTotal <= 100,
  `${consumidoTotal} de 100`,
);

/* ===========================================================================
 *  11. DESCONTAR
 * ======================================================================== */

console.log('\n11. Descontar del almacen');

const bajas = C.bajasDelCosteo(aCaballo);
comprobar('se sabe cuanto sale de cada lote', bajas.get('L006') === 1000 && bajas.get('L007') === 500);

// Se aplica a mano lo que hace `app/almacen.js`, sin arrastrar el estado de la
// aplicacion: lo que se comprueba es la regla, no el cableado.
const despues = dosPrecios.map((l) => ({
  ...l,
  existencia: Math.max(0, l.existencia - (bajas.get(l.id) || 0)),
}));
comprobar('el lote agotado queda en cero, no en negativo', despues[0].existencia === 0);
comprobar('el otro baja lo suyo', despues[1].existencia === 500);
comprobar('ninguna existencia queda negativa', despues.every((l) => l.existencia >= 0));

const exceso = C.costearPlan([{ ingrediente: 'SAL', unidad: 'GR', cantidad: 99999 }], poco);
const bajasExceso = C.bajasDelCosteo(exceso);
comprobar(
  'pedir mucho mas de lo que hay nunca descuenta mas de lo que hay',
  (bajasExceso.get('L011') || 0) <= 100,
  String(bajasExceso.get('L011')),
);

/* ===========================================================================
 *  12. GUARDAR Y LEER
 * ======================================================================== */

console.log('\n12. El almacen se guarda y se vuelve a leer');

comprobar('un almacen vacio se lee sin fallar', A.leerAlmacen().lotes.length === 0);
A.guardarLotes(dosPrecios);
const releido = A.leerAlmacen();
comprobar('lo guardado vuelve entero', releido.lotes.length === dosPrecios.length);
comprobar('con sus cifras intactas', releido.lotes[0].costoCompra === dosPrecios[0].costoCompra);

memoria.set('zahavi_almacen_v1', '{roto');
const corrupto = A.leerAlmacen();
comprobar('una copia ilegible no tumba la pantalla', Array.isArray(corrupto.lotes));
comprobar('y lo dice en vez de callarselo', corrupto.warning !== '');

console.log('\n13. Los codigos de lote no se reutilizan');
const conHuecos = [lote('L001', 'X', 'GR', 1, 1, 1, ''), lote('L009', 'Y', 'GR', 1, 1, 1, '')];
comprobar('el siguiente va despues del mayor, no del conteo', A.siguienteId(conHuecos) === 'L010', A.siguienteId(conHuecos));
comprobar('en un almacen vacio empieza en L001', A.siguienteId([]) === 'L001');

/* ===========================================================================
 *  14. LOS DATOS DE EJEMPLO CUADRAN CON LAS RECETAS REALES
 * ======================================================================== */

console.log('\n14. Los lotes de ejemplo sirven para algo');

const publicado = JSON.parse(readFileSync(rutaDatos, 'utf8'));
/** Pares ingrediente|unidad que existen de verdad en las 122 recetas. */
const realesEnRecetas = new Set();
for (const receta of publicado.recipes) {
  for (const componente of receta.componentes) {
    for (const item of componente.items) {
      realesEnRecetas.add(A.claveDe(item.ingrediente, item.unidad));
    }
  }
}

const demo = A.lotesDemo();
const encajan = demo.filter((l) => realesEnRecetas.has(A.claveDe(l.ingrediente, l.unidad)));
comprobar(
  'todos los lotes de ejemplo existen en el recetario con esa misma unidad',
  encajan.length === demo.length,
  `${encajan.length} de ${demo.length}`,
);
comprobar(
  'hay al menos un lote vencido, para que ese estado se vea',
  demo.some((l) => A.estadoVencimiento(l) === 'vencido'),
);
comprobar(
  'y al menos uno proximo a vencer',
  demo.some((l) => A.estadoVencimiento(l) === 'proximo'),
);
comprobar('el resumen cuenta un valor mayor que cero', A.resumenAlmacen(demo).valorTotal > 0);

/* El ejemplo con recetario tiene que dejar costear TODO: sin eso, cualquier
 * plan de prueba sale "incompleto" y no se puede confirmar nada. La demanda se
 * calcula aqui con el mismo consolidado que usa el plan, no con una cifra. */
const P = await modulo('src/core/plan.js');
const hoyDemo = dia(0);
const completo = A.lotesDemo(hoyDemo, publicado.recipes);
const catalogo = (factor) => P.consolidar(publicado.recipes.map((recipe) => ({ recipe, factor }))).lineas;
const todoElCatalogo = C.costearPlan(catalogo(A.TANDAS_DEMO), completo, hoyDemo);
comprobar(
  'con recetario, todas las lineas del catalogo tienen precio',
  todoElCatalogo.lineasSinPrecio === 0,
  `${todoElCatalogo.lineasSinPrecio} sin precio de ${todoElCatalogo.lineas.length}`,
);
comprobar(
  `y alcanzan para ${A.TANDAS_DEMO} tandas de cada receta a la vez`,
  todoElCatalogo.lineasConFaltante === 0,
  `${todoElCatalogo.lineasConFaltante} con faltante`,
);
const recetaSinCosto = publicado.recipes.find((receta) =>
  C.costearPlan(P.consolidar([{ recipe: receta, factor: 1 }]).lineas, completo, hoyDemo).costoTotal <= 0);
comprobar('ninguna receta sale con costo cero', !recetaSinCosto, recetaSinCosto ? recetaSinCosto.nombre : '');
comprobar(
  'todos los lotes generados pasan la misma validacion que uno tecleado',
  completo.every((l) => A.validarLote(l).ok),
);
const soloEscritos = (lista) => lista.slice(0, demo.length).map(({ registrado, ...resto }) => resto);
comprobar(
  'los lotes escritos a mano se conservan, en el mismo orden',
  JSON.stringify(soloEscritos(completo)) === JSON.stringify(soloEscritos(A.lotesDemo(hoyDemo))),
);
comprobar('los codigos no se repiten', new Set(completo.map((l) => l.id)).size === completo.length);
comprobar(
  'el unico vencido sigue siendo el escrito a proposito',
  completo.filter((l) => A.estadoVencimiento(l, hoyDemo) === 'vencido').length
    === demo.filter((l) => A.estadoVencimiento(l, hoyDemo) === 'vencido').length,
);

/* ===========================================================================
 *  15. EL ARCHIVO REAL NO SE TOCO
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

await import('./test-conversiones.mjs');
process.exit(fallos === 0 ? 0 : 1);
