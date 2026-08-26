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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validatePayload } from '../api/_schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = JSON.parse(readFileSync(join(root, 'data/recipes.json'), 'utf8'));

// Se cuenta del archivo real, no a mano: lo que se comprueba es que el
// validador no PIERDA ninguna, sea cual sea el numero de recetas publicadas.
const TOTAL = real.recipes.length;

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
  comprobar(`acepta las ${TOTAL} recetas`, r.ok, r.ok ? '' : r.error);
  if (r.ok) {
    comprobar('conserva el numero de recetas', r.value.recipes.length === TOTAL, String(r.value.recipes.length));
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

  // El catalogo tenia tope de peso pero no de cantidad, y un ingrediente ocupa
  // tan poco que cabian decenas de miles dentro del mismo margen.
  const muchosIngredientes = Array.from({ length: 20001 }, (_, i) => 'INGREDIENTE ' + i);
  comprobar('rechaza mas de 20000 ingredientes', validatePayload([buena], muchosIngredientes).ok === false);
  comprobar('y acepta un catalogo normal', validatePayload([buena], real.ingredientes).ok === true);
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

console.log('\n5. Las dos validaciones coinciden sobre los datos reales');
{
  // El cliente y el servidor validan con politicas distintas a proposito (uno
  // repara, el otro rechaza), pero sobre el recetario real de produccion tienen
  // que dar exactamente el mismo resultado. Si alguien cambia una de las dos y
  // las separa de mas, esto lo detecta antes de que llegue a la panaderia.
  //
  // `src/core/schema.js` toca `window` solo dentro de funciones, asi que se
  // puede importar desde Node con un objeto minimo simulado.
  globalThis.window = globalThis.window || { localStorage: undefined };

  const { validateBackup } = await import(
    pathToFileURL(join(root, 'src/core/schema.js')).href
  );

  const cliente = validateBackup(real);
  const servidor = validatePayload(real.recipes, real.ingredientes);

  comprobar('el cliente acepta el recetario real', cliente.ok, cliente.ok ? '' : cliente.message);
  comprobar('el servidor acepta el recetario real', servidor.ok, servidor.ok ? '' : servidor.error);

  if (cliente.ok && servidor.ok) {
    const iguales = JSON.stringify(cliente.value.recipes) === JSON.stringify(servidor.value.recipes);
    comprobar('ambas devuelven las mismas recetas', iguales);

    const mismosIngredientes =
      JSON.stringify(cliente.value.ingredientes) === JSON.stringify(servidor.value.ingredientes);
    comprobar('ambas devuelven los mismos ingredientes', mismosIngredientes);
  }
}

console.log('\n6. Freno de lecturas y copia en memoria');
{
  // La lectura es publica a proposito, pero cada una que no salga de la copia
  // es una peticion real a GitHub con el token del servidor. Sin freno,
  // cualquiera agota esa cuota desde fuera y deja a las dos sedes sin recetario
  // compartido: el dano no es que lean, es que el obrador no pueda leer.
  process.env.GITHUB_TOKEN = 'token-de-prueba';
  process.env.GITHUB_REPO = 'ejemplo/repositorio';
  process.env.EDIT_PASSWORD = 'clave-de-prueba';

  let peticionesAGitHub = 0;
  globalThis.fetch = async () => {
    peticionesAGitHub += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        sha: 'sha-de-prueba',
        content: Buffer.from(
          JSON.stringify({ version: 2, recipes: real.recipes, ingredientes: real.ingredientes }),
        ).toString('base64'),
      }),
    };
  };

  const { default: handler } = await import(pathToFileURL(join(root, 'api/recipes.js')).href);

  /** Pide el recetario como lo haria una sede, desde una direccion concreta. */
  const pedir = async (ip) => {
    let status = 0;
    const response = {
      status(codigo) {
        status = codigo;
        return this;
      },
      setHeader() {
        return this;
      },
      end() {},
    };
    await handler({ method: 'GET', headers: { 'x-forwarded-for': ip } }, response);
    return status;
  };

  comprobar('la primera lectura responde', (await pedir('10.0.0.1')) === 200);
  comprobar('y va a GitHub una sola vez', peticionesAGitHub === 1, String(peticionesAGitHub));

  comprobar('la segunda lectura responde igual', (await pedir('10.0.0.1')) === 200);
  comprobar('pero sale de la copia, sin volver a GitHub', peticionesAGitHub === 1, String(peticionesAGitHub));

  // Un barrido desde un mismo origen: las primeras pasan, el resto se corta.
  let rechazadas = 0;
  for (let i = 0; i < 70; i += 1) {
    if ((await pedir('10.0.0.2')) === 429) rechazadas += 1;
  }
  comprobar('un barrido acaba rechazado', rechazadas > 0, `${rechazadas} de 70 rechazadas`);
  comprobar('y el barrido tampoco gasta cuota de GitHub', peticionesAGitHub === 1, String(peticionesAGitHub));

  // El freno es por origen: la otra sede no paga lo que hizo un desconocido.
  comprobar('otra sede no hereda el limite del vecino', (await pedir('10.0.0.3')) === 200);
}

console.log(fallos === 0 ? '\nTODAS LAS COMPROBACIONES PASAN\n' : `\n${fallos} COMPROBACION(ES) FALLAN\n`);
process.exit(fallos === 0 ? 0 : 1);
