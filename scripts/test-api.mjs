/**
 * Pruebas de la validacion del servidor.
 *
 * `api/_schema.js` es lo unico que separa las 121 recetas reales de un envio
 * mal formado: es la ultima comprobacion antes de escribir sobre el archivo
 * compartido de las dos sedes. Estas pruebas cubren los envios que deben
 * rechazarse y confirman que uno correcto pasa sin alterar los datos.
 *
 * Se ejecuta con:  node scripts/test-api.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePayload } from '../api/_schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = JSON.parse(readFileSync(join(root, 'data/recipes.json'), 'utf8'));

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  console.log(`  ${condicion ? 'OK  ' : 'FALLA'} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
  if (!condicion) fallos += 1;
}

/** Receta minima valida, para construir casos a partir de ella. */
const buena = {
  id: 'R001',
  nombre: 'PAN DE PRUEBA',
  categoria: 'PANADERÍA',
  metodo: '',
  componentes: [{ nombre: 'PRINCIPAL', items: [{ ingrediente: 'HARINA', cantidad: '500', unidad: 'GR' }] }],
};

console.log('\n1. El recetario real pasa sin alterarse');
{
  const r = validatePayload(real.recipes, real.ingredientes);
  comprobar('acepta las 121 recetas', r.ok, r.ok ? '' : r.error);
  if (r.ok) {
    comprobar('conserva el numero de recetas', r.value.recipes.length === 121, String(r.value.recipes.length));
    comprobar('conserva los ingredientes', r.value.ingredientes.length === 159, String(r.value.ingredientes.length));
    const origen = JSON.stringify(real.recipes);
    const salida = JSON.stringify(r.value.recipes);
    comprobar('no altera ningun dato', origen === salida);
  }
}

console.log('\n2. Rechaza envios que destruirian el recetario');
{
  const casos = [
    ['recetas ausentes', undefined, real.ingredientes],
    ['recetas no es una lista', { recipes: [] }, real.ingredientes],
    ['lista vacia', [], real.ingredientes],
    ['ingredientes ausentes', [buena], undefined],
    ['ingredientes no es una lista', [buena], 'nada'],
    ['receta que no es objeto', ['texto suelto'], real.ingredientes],
    ['receta sin nombre', [{ ...buena, nombre: '' }], real.ingredientes],
    ['receta sin componentes', [{ ...buena, componentes: undefined }], real.ingredientes],
    ['componentes sin items', [{ ...buena, componentes: [{ nombre: 'X', items: [] }] }], real.ingredientes],
    [
      'items sin nombre de ingrediente',
      [{ ...buena, componentes: [{ nombre: 'X', items: [{ ingrediente: '', cantidad: '1', unidad: 'GR' }] }] }],
      real.ingredientes,
    ],
    ['codigos duplicados', [buena, { ...buena }], real.ingredientes],
  ];

  for (const [titulo, recipes, ingredientes] of casos) {
    const r = validatePayload(recipes, ingredientes);
    comprobar(`rechaza: ${titulo}`, r.ok === false, r.ok ? 'ACEPTADO, no deberia' : '');
  }
}

console.log('\n3. Limites de tamano');
{
  const muchas = Array.from({ length: 5001 }, (_, i) => ({ ...buena, id: 'R' + i }));
  comprobar('rechaza mas de 5000 recetas', validatePayload(muchas, []).ok === false);

  const largo = { ...buena, metodo: 'x'.repeat(30000) };
  const r = validatePayload([largo], []);
  comprobar('recorta el texto desmedido', r.ok && r.value.recipes[0].metodo.length === 20000);
}

console.log('\n4. Normaliza sin perder informacion util');
{
  const sucia = {
    id: '  R900  ',
    nombre: '  TORTA  ',
    categoria: 'pastelería',
    componentes: [
      { nombre: '', items: [{ ingrediente: ' AZUCAR ', cantidad: 250, unidad: ' gr ' }] },
      { nombre: 'VACIO', items: [] },
    ],
  };
  const r = validatePayload([sucia], []);
  comprobar('acepta la receta', r.ok, r.ok ? '' : r.error);
  if (r.ok) {
    const receta = r.value.recipes[0];
    comprobar('recorta espacios del id', receta.id === 'R900', receta.id);
    comprobar('categoria en mayusculas', receta.categoria === 'PASTELERÍA', receta.categoria);
    comprobar('nombre de componente por defecto', receta.componentes[0].nombre === 'PRINCIPAL');
    comprobar('descarta el componente vacio', receta.componentes.length === 1);
    comprobar('cantidad numerica a texto', receta.componentes[0].items[0].cantidad === '250');
    comprobar('unidad recortada', receta.componentes[0].items[0].unidad === 'gr');
  }
}

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASAN\n' : `\n${fallos} COMPROBACION(ES) FALLAN\n`);
process.exit(fallos === 0 ? 0 : 1);
