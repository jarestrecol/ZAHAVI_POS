/**
 * Verificacion completa del proyecto, en un solo comando.
 *
 *   node scripts/verificar.mjs
 *
 * Ejecuta, en orden: sintaxis de todos los modulos, resolucion de importaciones,
 * coherencia del CSS, pruebas de la capa de datos, pruebas de la validacion del
 * servidor, alta y baja masiva de recetas y usuarios, integridad de las recetas
 * de la capa de datos.
 *
 * Devuelve codigo distinto de cero si algo falla, para poder usarlo como puerta
 * antes de publicar.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function paso(titulo, fn) {
  process.stdout.write(`${titulo}... `);
  try {
    const detalle = fn();
    console.log('ok' + (detalle ? ` (${detalle})` : ''));
  } catch (error) {
    failed += 1;
    console.log('FALLA');
    console.error('  ' + String(error.message).split('\n').slice(0, 6).join('\n  '));
  }
}

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(name)) out.push(full);
  }
  return out;
}

function run(script) {
  return execFileSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function comprobarArquitectura() {
  const capas = [
    { nombre: 'core', prohibidas: ['/app/', '/views/'] },
    { nombre: 'lib', prohibidas: ['/app/', '/core/', '/views/'] },
    { nombre: 'app', prohibidas: ['/views/'] },
  ];
  const problemas = [];

  for (const capa of capas) {
    const carpeta = join(root, 'src', capa.nombre);
    for (const file of walk(carpeta, (name) => name.endsWith('.js'))) {
      const source = readFileSync(file, 'utf8');
      const imports = source.matchAll(/(?:from|import)\s+['\"]([^'\"]+)['\"]/g);
      for (const match of imports) {
        for (const prohibida of capa.prohibidas) {
          if (match[1].includes(prohibida)) {
            problemas.push(`${relative(root, file)} importa ${prohibida.slice(1, -1)}`);
          }
        }
      }
    }
  }

  // SEGUNDA FRONTERA, la que no se ve en el arbol de carpetas: quien ESCRIBE.
  //
  // Las vistas leen del nucleo sin problema -escalar una tanda o consolidar un
  // plan son transformaciones sin efectos-, pero guardar, publicar o borrar es
  // un caso de uso. Cuando una pantalla escribe estado por su cuenta acaba
  // teniendo su propia idea de que hay que limpiar, y las diferencias solo se
  // notan al encadenar dos: asi un permiso de escritura sobrevivia a un cierre
  // de sesion, porque cada copia de "salir" borraba claves distintas.
  //
  // Sin este comprobador la regla estaba escrita y rota a la vez, en tres
  // vistas. El modulo siguiente repetiria el patron.
  const escritores = [
    'src/main.js',
    'src/app/commands.js',
    // `sync.js` refresca el recetario tras publicar en segundo plano: es un caso
    // de uso, vive en `app/`, y no construye ninguna pantalla.
    'src/app/sync.js',
    // `store.js` es donde `setState` se declara: `notify` lo usa por dentro.
    'src/core/store.js',
  ];
  for (const file of walk(join(root, 'src'), (name) => name.endsWith('.js'))) {
    const ruta = relative(root, file).replace(/\\/g, '/');
    if (escritores.includes(ruta)) continue;
    if (/\bsetState\s*\(/.test(readFileSync(file, 'utf8'))) {
      problemas.push(`${ruta} escribe estado (setState): eso lo decide app/commands.js o main.js`);
    }
  }

  // TERCERA FRONTERA: cerrar sesion tiene que revocar la clave de edicion.
  //
  // `signOut` solo cierra la sesion local. Quien la llame por su cuenta deja la
  // clave de edicion viva en la sesion del navegador, y quien entre despues
  // hereda la capacidad de publicar sin conocerla. Fue un defecto real. Las dos
  // mitades viven juntas en `cerrarSesion` (`app/commands.js`) y ahi se quedan.
  for (const file of walk(join(root, 'src'), (name) => name.endsWith('.js'))) {
    const ruta = relative(root, file).replace(/\\/g, '/');
    if (ruta === 'src/app/commands.js' || ruta === 'src/core/access.js') continue;
    if (/\bsignOut\b/.test(readFileSync(file, 'utf8'))) {
      problemas.push(`${ruta} usa signOut: usa cerrarSesion de app/commands.js, que ademas revoca la clave`);
    }
  }

  if (problemas.length) throw new Error(problemas.join('\n'));
  return `${capas.length} de carpeta y 2 de responsabilidad`;
}

/**
 * Texto corrompido por doble codificacion.
 *
 * Aparece cuando un archivo UTF-8 se lee como latin-1 y se vuelve a guardar como
 * UTF-8: la "a" con tilde pasa a "A-tilde-ordinal" y los puntos suspensivos a
 * "a-circunfleja-euro-barra". Lo provoca `Set-Content` sin `-Encoding utf8` en
 * PowerShell, y aqui ya paso dos veces: `CLAUDE.md` acabo con 95 lineas asi, y
 * este mismo archivo imprimia basura en cada linea de su resumen.
 *
 * Es un fallo que nadie ve al escribir -el editor lo muestra bien- y que se
 * propaga en silencio hasta que alguien mira la pantalla del obrador.
 */
function comprobarCodificacion() {
  const carpetas = ['src', 'api', 'scripts', 'tests', 'assets/css'];
  const sueltos = ['sw.js', 'index.html', '404.html', '500.html', 'README.md', 'vercel.json'];
  const problemas = [];

  const archivos = [
    ...carpetas.flatMap((c) => walk(join(root, c), (n) => /\.(js|mjs|css|html)$/.test(n))),
    ...sueltos.map((n) => join(root, n)),
  ];

  for (const file of archivos) {
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((linea, i) => {
        if (estaCorrompida(linea)) {
          problemas.push(`${relative(root, file)}:${i + 1} texto corrompido por doble codificacion`);
        }
      });
  }

  if (problemas.length) throw new Error(problemas.slice(0, 8).join('\n'));
  return `${archivos.length} archivos en UTF-8`;
}

/**
 * La marca de la doble codificacion, comparada POR CODIGO y no por caracter.
 *
 * Escrita con los caracteres de verdad, esta funcion se delataria a si misma en
 * cada ejecucion y el bloque fallaria siempre. Los tres arranques posibles son
 * 0xC3 y 0xC2 -la "A" con tilde y con circunflejo, que preceden a una vocal
 * acentuada o a un signo- y 0xE2, que abre unos puntos suspensivos o unas
 * comillas. Ninguno de los tres aparece en espanol bien escrito seguido de otro
 * byte alto, asi que no hay falsos positivos que perdonar.
 *
 * @param {string} linea
 * @returns {boolean}
 */
function estaCorrompida(linea) {
  for (let i = 0; i < linea.length - 1; i += 1) {
    const a = linea.charCodeAt(i);
    if (a !== 0xc3 && a !== 0xc2 && a !== 0xe2) continue;
    const b = linea.charCodeAt(i + 1);
    if (b === 0x20ac || (b >= 0xa0 && b <= 0xbf)) return true;
  }
  return false;
}

console.log('\nVerificando el recetario\n');

paso('Fronteras de arquitectura', comprobarArquitectura);
paso('Codificacion de los archivos', comprobarCodificacion);

paso('Sintaxis de los modulos', () => {
  // node --check trata .js como CommonJS: se copian a .mjs para validarlos como
  // modulos ES, que es como los ejecuta el navegador.
  const dir = mkdtempSync(join(tmpdir(), 'zahavi-'));
  try {
    const files = [
      ...walk(join(root, 'src'), (n) => n.endsWith('.js')),
      ...walk(join(root, 'api'), (n) => n.endsWith('.js')),
      join(root, 'sw.js'),
    ];
    for (const file of files) {
      const target = join(dir, relative(root, file).replace(/[\\/]/g, '_') + '.mjs');
      copyFileSync(file, target);
      execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' });
    }
    return `${files.length} archivos`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

paso('Resolucion de importaciones', () => {
  const files = walk(join(root, 'src'), (n) => n.endsWith('.js'));
  const exported = new Map();

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    exported.set(resolve(file), names);
  }

  const problems = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]+)\})\s+from\s+'([^']+)'/g)) {
      if (!m[2].startsWith('.') || !m[1]) continue;
      const target = resolve(dirname(file), m[2]);
      const available = exported.get(target);
      if (!available) {
        problems.push(`${relative(root, file)} -> falta ${m[2]}`);
        continue;
      }
      for (const raw of m[1].split(',')) {
        // "algo as alias": lo que debe existir en el destino es el nombre
        // original; el alias es solo como se llama aqui.
        const [name] = raw.trim().split(/\s+as\s+/);
        const original = name.trim();
        if (original && !available.has(original)) {
          problems.push(`${relative(root, file)}: "${original}" no existe en ${m[2]}`);
        }
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return `${files.length} modulos`;
});

paso('Coherencia del CSS', () => {
  const out = run('check-css.mjs');
  const match = out.match(/(\d+) clases aplicadas/);
  return match ? `${match[1]} clases` : '';
});

// Todos los bloques cuentan lo que de verdad ejecutaron. Escribir la cifra a
// mano la deja congelada: se anadian comprobaciones y el resumen seguia diciendo
// el numero viejo, que es justo la clase de dato que nadie vuelve a mirar.
paso('Capa de datos', () => {
  const out = run('test-datos.mjs');
  return `${(out.match(/^\s+OK\s/gm) || []).length} comprobaciones`;
});

paso('Publicacion y conflictos', () => {
  const out = run('test-publicacion.mjs');
  const total = (out.match(/^\s+OK\s/gm) || []).length;
  return `${total} comprobaciones`;
});

paso('Validacion del servidor', () => {
  const out = run('test-api.mjs');
  return `${(out.match(/^\s+OK\s/gm) || []).length} comprobaciones`;
});

paso('Alta y baja masiva', () => {
  const out = run('test-qa.mjs');
  const total = (out.match(/^\s+OK\s/gm) || []).length;
  return `${total} comprobaciones`;
});

// La version se declara en `src/core/version.js` porque el navegador tiene que
// poder leerla sin red, y se repite en package.json porque npm la exige ahi. Dos
// sitios son dos oportunidades de que se separen, y una version equivocada en la
// pantalla es peor que ninguna: se usa para saber si dos sedes miran lo mismo.
paso('Version del proyecto', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const fuente = readFileSync(join(root, 'src/core/version.js'), 'utf8');
  const declarada = fuente.match(/APP_VERSION\s*=\s*'([^']+)'/);

  if (!declarada) throw new Error('src/core/version.js no declara APP_VERSION');
  if (declarada[1] !== pkg.version) {
    throw new Error(`package.json dice ${pkg.version} y src/core/version.js dice ${declarada[1]}`);
  }

  return `v${pkg.version}`;
});

// El techo real del sistema no es el numero de recetas: es el TAMANO del
// archivo. La API de contenidos de GitHub deja de entregarlo a partir de 1 MB, y
// ese dia el recetario deja de cargar en las dos sedes a la vez. El umbral de
// accion son 700 KB, que deja semanas de margen para montar otra cosa. Sin esta
// alarma nadie mira el tamano de un archivo en un repositorio hasta que revienta.
const UMBRAL_AVISO = 700 * 1024;
const TECHO_GITHUB = 1024 * 1024;

paso('Integridad de las recetas', () => {
  const crudo = readFileSync(join(root, 'data/recipes.json'), 'utf8');
  const data = JSON.parse(crudo);
  if (!Array.isArray(data.recipes)) throw new Error('el archivo no contiene recetas');

  const bytes = Buffer.byteLength(crudo);
  if (bytes >= UMBRAL_AVISO) {
    const pct = Math.round((bytes / TECHO_GITHUB) * 100);
    throw new Error(
      `data/recipes.json ocupa ${Math.round(bytes / 1024)} KB (${pct}% del techo de 1 MB de la ` +
        'API de contenidos de GitHub). Es el momento de mover los datos, no despues.',
    );
  }

  const componentes = data.recipes.reduce((n, r) => n + r.componentes.length, 0);
  const items = data.recipes.reduce(
    (n, r) => n + r.componentes.reduce((m, c) => m + c.items.length, 0),
    0,
  );
  const hash = createHash('sha256').update(JSON.stringify(data.recipes)).digest('hex');

  const sinNombre = data.recipes.filter((r) => !r.nombre || !r.nombre.trim()).length;
  if (sinNombre) throw new Error(`${sinNombre} recetas sin nombre`);

  const ids = new Set(data.recipes.map((r) => r.id));
  if (ids.size !== data.recipes.length) throw new Error('hay codigos de receta repetidos');

  return (
    `${data.recipes.length} recetas, ${componentes} componentes, ${items} items, ` +
    `${Math.round(bytes / 1024)} KB, sha ${hash.slice(0, 8)}`
  );
});

console.log(
  failed === 0 ? '\nTodo correcto. El proyecto se puede publicar.\n' : `\n${failed} comprobacion(es) fallan.\n`,
);
process.exit(failed === 0 ? 0 : 1);
