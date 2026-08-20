/**
 * =============================================================================
 *  PRUEBAS DE LA PUBLICACION
 * =============================================================================
 *
 *  Por que existe este archivo, aparte de los que ya habia.
 *
 *  `test-datos.mjs` simula un `fetch` que nunca devuelve `sha`, asi que
 *  `core/remote.js` jamas entra en su rama de "hay recetario compartido" y la
 *  publicacion NO se ejercita: solo se comprueba que se enviaria. Ese hueco es
 *  justo por donde se colaron tres defectos de perdida de datos, y ninguno de
 *  ellos daba error por pantalla.
 *
 *  Aqui el servidor simulado si entrega `sha` y si atiende el PUT, y ademas se
 *  puede dejar ese PUT congelado a mitad de camino. Eso ultimo es lo que
 *  permite reproducir el defecto principal: guardar mientras una publicacion
 *  anterior sigue viajando.
 *
 *  LOS TRES DEFECTOS QUE ESTAS PRUEBAS FIJAN
 *  -----------------------------------------
 *   1. `publishToAll` leia el recetario DOS veces, antes y despues del envio, y
 *      declaraba publicado lo segundo. Una receta guardada durante el envio se
 *      daba por publicada sin haber viajado, y desaparecia en la carga
 *      siguiente.
 *   2. `sync.js` descartaba en silencio el guardado que llegaba con otra
 *      publicacion en curso: sin marca de pendiente y sin reintento.
 *   3. El boton de publicar de Ajustes seguia activo durante un conflicto de
 *      version, y publicar a mano borraba el trabajo de la otra sede.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicado = JSON.parse(readFileSync(join(repoRoot, 'data/recipes.json'), 'utf8'));

/* ===========================================================================
 *  NAVEGADOR Y SERVIDOR SIMULADOS
 * ======================================================================== */

const almacen = new Map();
const sesion = new Map();

globalThis.window = {
  localStorage: {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  },
  sessionStorage: {
    getItem: (k) => (sesion.has(k) ? sesion.get(k) : null),
    setItem: (k, v) => sesion.set(k, String(v)),
    removeItem: (k) => sesion.delete(k),
  },
  location: { protocol: 'https:', hash: '' },
};

/** Lo que el servidor tiene ahora mismo. */
let enServidor = { ...publicado, sha: 'sha-inicial' };

/** Cuerpos recibidos por PUT, en orden. Es lo que de verdad viajo. */
const recibidos = [];

/**
 * Cuando vale una funcion, el PUT no responde hasta que se la llame. Sirve
 * para dejar una publicacion congelada y guardar mientras tanto.
 * @type {null | (() => void)}
 */
let soltarPut = null;

globalThis.fetch = async (url, opciones = {}) => {
  const metodo = opciones.method || 'GET';

  if (metodo === 'PUT') {
    const cuerpo = JSON.parse(opciones.body);
    recibidos.push(cuerpo);

    if (soltarPut !== null) {
      await new Promise((resolver) => {
        soltarPut = resolver;
      });
    }

    // Conflicto optimista, igual que el servidor real.
    if (cuerpo.sha !== enServidor.sha) {
      return {
        ok: false,
        status: 409,
        json: async () => ({ error: 'Otro equipo publicó antes.' }),
        text: async () => '{"error":"Otro equipo publicó antes."}',
      };
    }

    const shaNuevo = 'sha-' + (recibidos.length + 1);
    const revision = '2026-08-19 1' + recibidos.length + ':00:00';
    enServidor = {
      version: 2,
      revision,
      recipes: cuerpo.recipes,
      ingredientes: cuerpo.ingredientes,
      sha: shaNuevo,
    };
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, revision, count: cuerpo.recipes.length, sha: shaNuevo }),
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(JSON.stringify(enServidor)),
    text: async () => JSON.stringify(enServidor),
  };
};

const repo = await import(pathToFileURL(repoRoot + '/src/core/repository.js').href);
const { validateRecipe } = await import(pathToFileURL(repoRoot + '/src/core/schema.js').href);

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  const marca = condicion ? 'OK  ' : 'FALLA';
  if (!condicion) fallos += 1;
  console.log(`  ${marca} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
}

/** Receta valida con el identificador y el nombre que se le pidan. */
function receta(id, nombre) {
  const hecha = validateRecipe({
    id,
    nombre,
    categoria: 'PANADERÍA',
    metodo: '',
    componentes: [
      { nombre: 'PRINCIPAL', items: [{ ingrediente: 'HARINA', cantidad: '100', unidad: 'GR' }] },
    ],
  });
  if (!hecha.ok) throw new Error('la receta de prueba no valida: ' + hecha.message);
  return hecha.value;
}

/* ===========================================================================
 *  1. EL CAMINO NORMAL
 * ======================================================================== */

console.log('\n1. Con servidor y sha, la publicacion llega de verdad');
let estado = await repo.hydrate();
comprobar('lee del recetario compartido', estado.recipes.length === 121, String(estado.recipes.length));
comprobar('puede publicar', repo.canPublishToAll() === true);

repo.save(receta('R900', 'PRUEBA PUBLICACION X 1 UND'));
comprobar('queda pendiente', repo.localChanges().dirty === true);

let resultado = await repo.publishToAll({ password: 'clave', author: 'prueba' });
comprobar('el servidor acepto', resultado.ok === true, resultado.ok ? '' : resultado.message);
comprobar('el PUT llevo la receta', recibidos[0].recipes.some((r) => r.id === 'R900'));
comprobar('ya no queda nada pendiente', repo.localChanges().dirty === false);

/* ===========================================================================
 *  2. EL DEFECTO PRINCIPAL: guardar mientras se publica
 * ======================================================================== */

console.log('\n2. Guardar mientras una publicacion sigue en vuelo NO pierde el cambio');

repo.save(receta('R901', 'PRIMERA X 1 UND'));

// A partir de aqui el PUT se queda congelado hasta que se le diga.
soltarPut = () => {};
const enVuelo = repo.publishToAll({ password: 'clave', author: 'prueba' });

// Un instante para que el envio llegue al PUT y se detenga ahi.
await new Promise((r) => setTimeout(r, 10));
comprobar('el envio esta detenido a mitad', typeof soltarPut === 'function');

// Alguien guarda otra receta mientras la anterior viaja.
repo.save(receta('R902', 'SEGUNDA X 1 UND'));

soltarPut();
soltarPut = null;
resultado = await enVuelo;

const ultimoPut = recibidos[recibidos.length - 1];
comprobar('la publicacion salio bien', resultado.ok === true, resultado.ok ? '' : resultado.message);
comprobar('el envio llevaba la primera', ultimoPut.recipes.some((r) => r.id === 'R901'));
comprobar(
  'el envio NO llevaba la segunda (se guardo despues)',
  !ultimoPut.recipes.some((r) => r.id === 'R902'),
);
comprobar(
  'la segunda SIGUE pendiente de publicar',
  repo.localChanges().dirty === true,
  'este es el defecto: antes se daba por publicada y desaparecia',
);
comprobar('la segunda sigue en el equipo', repo.findById('R902') !== null);

console.log('\n3. La vuelta siguiente si la publica');
resultado = await repo.publishToAll({ password: 'clave', author: 'prueba' });
comprobar('publica sin conflicto', resultado.ok === true, resultado.ok ? '' : resultado.message);
comprobar(
  'ahora si viajo la segunda',
  recibidos[recibidos.length - 1].recipes.some((r) => r.id === 'R902'),
);
comprobar('no queda nada pendiente', repo.localChanges().dirty === false);

console.log('\n4. Una recarga no se lleva por delante lo publicado');
estado = await repo.hydrate();
comprobar('R901 sigue ahi', repo.findById('R901') !== null);
comprobar('R902 sigue ahi', repo.findById('R902') !== null);
comprobar('sin cambios pendientes', repo.localChanges().dirty === false);

/* ===========================================================================
 *  5. CONFLICTO DE VERSION: la publicacion manual tiene que quedar cerrada
 * ======================================================================== */

console.log('\n5. Con conflicto de version, publicar a mano queda cerrado');

repo.save(receta('R903', 'LOCAL SIN PUBLICAR X 1 UND'));
comprobar('hay cambios locales', repo.localChanges().dirty === true);

// La otra sede publica mientras tanto: cambia la revision del servidor.
enServidor = { ...enServidor, revision: '2026-09-01 08:00:00', sha: 'sha-otra-sede' };
estado = await repo.hydrate();

comprobar('se detecta el conflicto', repo.localChanges().conflict === true);
comprobar('se conserva el cambio local', repo.findById('R903') !== null);
comprobar(
  'Ajustes exige recargar antes de publicar',
  repo.needsReloadBeforePublish() === true,
  'antes daba false y el boton publicaba encima de la otra sede',
);

console.log(`\n${fallos === 0 ? 'Publicacion: todo correcto.' : `Publicacion: ${fallos} fallos.`}`);
process.exit(fallos === 0 ? 0 : 1);
