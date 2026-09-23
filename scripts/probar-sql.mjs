/**
 * =============================================================================
 *  PRUEBAS DE COMPORTAMIENTO DEL ESQUEMA, CONTRA UN POSTGRESQL DE VERDAD
 * =============================================================================
 *
 *  `verificar-sql.mjs` lee las migraciones como texto y comprueba que las reglas
 *  ESTAN ESCRITAS. Esto comprueba que FUNCIONAN, que no es lo mismo y no se
 *  puede deducir leyendo: una politica puede existir, estar bien redactada y no
 *  cubrir el caso que se creia.
 *
 *  No es teoria. La primera vez que se ejecuto esto aparecieron dos cosas que
 *  ninguna lectura habia visto:
 *
 *    1. `movimientos` no se podia insertar, porque su politica necesitaba leer
 *       la sede del lote y a `lotes` se le habia revocado la lectura entera.
 *       De ahi salio el permiso por columnas de 0005.
 *    2. Una prueba que esperaba una excepcion donde PostgreSQL no lanza
 *       ninguna: un `insert` contra el `with check` de una politica falla, pero
 *       un `update` cuyo `using` no encaja con ninguna fila no falla, solo toca
 *       cero filas.
 *
 *  QUE HACE
 *  --------
 *  Levanta un PostgreSQL desechable en Docker, le aplica la emulacion minima de
 *  Supabase, TODAS las migraciones de `db/migraciones/` y `db/local/pruebas.sql`,
 *  y lo borra. No toca ninguna base de datos existente ni deja nada encendido.
 *
 *  POR QUE NO VA DENTRO DE `npm run verificar`
 *  -------------------------------------------
 *  Porque necesita Docker, y `verificar` tiene que poder ejecutarse en cualquier
 *  sitio en segundos. Lo que si va dentro son las fronteras de texto, que no
 *  necesitan nada: son el bloque `Fronteras del esquema SQL`.
 *
 *  Se ejecuta con:  npm run probar-sql
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { probarConcurrencia } from './lib/concurrencia-sql.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Un nombre propio y desechable: no se reutiliza ningun contenedor que el equipo
// pueda tener levantado para otra cosa, y asi borrarlo al terminar nunca se
// lleva por delante nada de nadie.
const CONTENEDOR = 'zahavi-pruebas-sql';
const IMAGEN = 'postgres:15';
const BASE = 'zahavi';

/*
 * LAS MIGRACIONES SE LEEN DE LA CARPETA, NO SE ESCRIBEN AQUI.
 *
 * Estaban enumeradas a mano, y la lista se quedo corta en cuanto aparecio la
 * primera migracion nueva: `0006` no se aplicaba y esta prueba seguia dando
 * verde, o sea que decia haber comprobado un esquema que no era el del
 * repositorio. Es el mismo defecto que `CLAUDE.md` ya documenta dos veces -una
 * cifra escrita a mano que envejece sin avisar-, y aqui era peor que una cifra:
 * era una comprobacion que no miraba lo que decia mirar.
 *
 * Se ordenan por nombre, que es lo que hace que `0001` vaya antes que `0010`
 * mientras el prefijo tenga cuatro cifras. `verificar-sql.mjs` comprueba
 * precisamente eso, asi que un nombre mal puesto se cazaria antes de llegar
 * aqui.
 */
const MIGRACIONES = readdirSync(join(root, 'db/migraciones'))
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((n) => `db/migraciones/${n}`);

const ARCHIVOS = ['db/local/emula-supabase.sql', ...MIGRACIONES];

/**
 * Ejecuta `docker` y devuelve las dos salidas por separado.
 *
 * No se usa `execFileSync` porque ese solo devuelve la salida estandar, y `psql`
 * escribe los `raise notice` -o sea, TODO el resultado de las pruebas- en el
 * error estandar. Se habrian perdido justo las lineas que interesan.
 *
 * @param {string[]} args
 * @param {Buffer} [entrada]
 * @returns {{salida: string, error: string}}
 */
function docker(args, entrada) {
  const r = spawnSync('docker', args, {
    input: entrada,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (r.error) throw r.error;

  if (r.status !== 0) {
    const fallo = new Error(`docker ${args.slice(0, 2).join(' ')} termino con codigo ${r.status}`);
    fallo.salida = r.stdout || '';
    fallo.error = r.stderr || '';
    throw fallo;
  }

  return { salida: r.stdout || '', error: r.stderr || '' };
}

/**
 * Corre un archivo SQL dentro del contenedor.
 *
 * Se pasa por `sh -c ... 2>&1` en vez de juntar las dos salidas aqui fuera para
 * que el ORDEN se conserve: los `\echo` de los titulos van por la salida
 * estandar y los `raise notice` de cada comprobacion por la de error, asi que
 * juntarlas despues pondria todos los titulos primero y todos los resultados
 * despues, que es ilegible.
 *
 * @param {string} archivo
 * @returns {string}
 */
function correrSql(archivo) {
  const psql = `psql -U postgres -d ${BASE} -v ON_ERROR_STOP=1 2>&1`;
  const { salida } = docker(
    ['exec', '-i', CONTENEDOR, 'sh', '-c', psql],
    readFileSync(join(root, archivo)),
  );
  return salida;
}

/** Espera sin quemar CPU ni encadenar procesos. @param {number} ms */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function borrarContenedor() {
  try {
    docker(['rm', '-f', CONTENEDOR]);
  } catch {
    // Si no existe, no hay nada que borrar. No es un error.
  }
}

// ---------------------------------------------------------------------------
//  1. QUE HAYA DOCKER, Y DECIRLO CLARO SI NO
// ---------------------------------------------------------------------------

try {
  docker(['version', '--format', '{{.Server.Version}}']);
} catch {
  console.error('\nNo hay un Docker en marcha, y estas pruebas lo necesitan.');
  console.error('Levantalo y vuelve a ejecutar `npm run probar-sql`.');
  console.error('');
  console.error('Las fronteras del esquema que NO necesitan base de datos si se');
  console.error('pueden comprobar ahora mismo, con `npm run verificar-sql`.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
//  2. UN POSTGRESQL LIMPIO
// ---------------------------------------------------------------------------

console.log('\nLevantando un PostgreSQL desechable...');
borrarContenedor();

docker(['run', '-d', '--name', CONTENEDOR, '-e', 'POSTGRES_PASSWORD=zahavi', IMAGEN]);

let listo = false;
for (let intento = 0; intento < 60 && !listo; intento += 1) {
  try {
    docker(['exec', CONTENEDOR, 'pg_isready', '-U', 'postgres']);
    listo = true;
  } catch {
    // Todavia arrancando. `pg_isready` es la senal correcta y no la existencia
    // del contenedor: este responde bastante antes de que el servidor acepte
    // conexiones.
    esperar(500);
  }
}

if (!listo) {
  borrarContenedor();
  console.error('El PostgreSQL no llego a aceptar conexiones. Se cancela.\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
//  3. EL ESQUEMA ENTERO, DE CERO
// ---------------------------------------------------------------------------

let fallo = null;

try {
  docker([
    'exec', CONTENEDOR, 'psql', '-U', 'postgres', '-q',
    '-c', `drop database if exists ${BASE};`,
    '-c', `create database ${BASE};`,
  ]);

  for (const archivo of ARCHIVOS) {
    try {
      correrSql(archivo);
    } catch (error) {
      throw new Error(`${archivo} no se pudo aplicar:\n${error.salida || error.message}`);
    }
  }

  console.log(`Las ${ARCHIVOS.length - 1} migraciones se aplican sobre una base vacia.`);

  // -------------------------------------------------------------------------
  //  4. Y AHORA, EL COMPORTAMIENTO
  // -------------------------------------------------------------------------

  const limpiar = (texto) =>
    texto
      .split('\n')
      .filter((l) => l.trim() && l.trim() !== 'SET')
      .map((l) => l.replace(/^NOTICE:\s{2}/, ''))
      .join('\n');

  console.log(limpiar(correrSql('db/local/pruebas.sql')));
  // Reutiliza la semilla de `pruebas.sql` y la deja intacta: va en una
  // transaccion que se deshace.
  console.log(limpiar(correrSql('db/local/pruebas-operacion.sql')));
  console.log(limpiar(correrSql('db/local/pruebas-api.sql')));
  console.log(limpiar(correrSql('db/local/pruebas-api-plan.sql')));
  console.log(limpiar(correrSql('db/local/pruebas-api-confirmar.sql')));
  console.log(limpiar(correrSql('db/local/pruebas-api-notas.sql')));
  console.log(limpiar(correrSql('db/local/pruebas-api-recetario.sql')));

  // Dos sesiones de verdad a la vez: doble toque, dos pantallas y bodega
  // cambiando mientras se confirma (F3-8).
  console.log('');
  console.log('32. Concurrencia: sesiones de PostgreSQL a la vez');
  await probarConcurrencia({ contenedor: CONTENEDOR, base: BASE, ok: (texto) => console.log(`  OK    ${texto}`) });
  // Con la produccion que deja la concurrencia, el barrido de sedes, roles y dinero (F3-11).
  console.log(limpiar(correrSql('db/local/pruebas-rls.sql')));

  // -------------------------------------------------------------------------
  //  EL SERVIDOR COSTEA IGUAL QUE LA APLICACION
  // -------------------------------------------------------------------------
  //
  //  Los mismos 14 casos que `test-casos-costeo.mjs` corre contra el nucleo del
  //  navegador, ahora contra `privado.costear()`. Se compara la salida ENTERA
  //  (jsonb compara los numeros por valor): un peso o un gramo de diferencia es
  //  un fallo, no un redondeo aceptable.
  const contrato = JSON.parse(readFileSync(join(root, 'db/pruebas/casos-costeo.json'), 'utf8'));
  const literal = (valor) => `$json$${JSON.stringify(valor)}$json$::jsonb`;
  const casosSql = [
    '\\set ON_ERROR_STOP on',
    "\\echo ''",
    `\\echo '16. El servidor costea igual que la aplicacion (${contrato.casos.length} casos)'`,
    // Supabase abre cada sesion con `extra_float_digits = 0` (15 cifras al
    // escribir un float8). Asi se prueba con el ajuste de produccion, no con el
    // de la imagen de Docker: con el de Docker estos casos pasaban y en el
    // remoto no.
    'set extra_float_digits = 0;',
    'create temp table casos_costeo (nombre text, lineas jsonb, lotes jsonb, hoy date, salida jsonb);',
    ...contrato.casos.map((c) =>
      `insert into casos_costeo values (${literal(c.nombre)} #>> '{}', ${literal(c.lineas)}, ${literal(c.lotes)}, '${c.hoy}', ${literal(c.salida)});`),
    `do $$
declare
  c record;
  obtenida jsonb;
begin
  for c in select * from casos_costeo loop
    obtenida := privado.costear(c.lineas, c.lotes, c.hoy);
    if obtenida is distinct from c.salida then
      raise exception 'FALLA: % no coincide con la aplicacion.%  servidor:   % %  aplicacion: %',
        c.nombre, chr(10), obtenida, chr(10), c.salida;
    end if;
    raise notice '  OK    %', c.nombre;
  end loop;
end $$;`,
  ].join('\n');
  const costeo = docker(
    ['exec', '-i', CONTENEDOR, 'sh', '-c', `psql -U postgres -d ${BASE} -v ON_ERROR_STOP=1 -q 2>&1`],
    Buffer.from(casosSql, 'utf8'),
  );
  if (/ERROR|FALLA/.test(costeo.salida)) throw new Error('El costeo del servidor no cumple el contrato:\n' + costeo.salida);
  console.log(limpiar(costeo.salida));

  // -------------------------------------------------------------------------
  //  5. Y AHORA CON LAS 122 RECETAS DE VERDAD
  // -------------------------------------------------------------------------
  //
  //  Las pruebas de arriba usan dos ingredientes inventados, que es lo correcto
  //  para comprobar politicas: dan un escenario pequeno y controlado. Pero un
  //  esquema que funciona con dos filas y se atraganta con las 1.293 reales no
  //  sirve de nada, y la unica forma de saberlo es meterlas.
  //
  //  El SQL no esta guardado en el repositorio: lo genera
  //  `scripts/sembrar-recetas.mjs` a partir de `data/recipes.json`, para que no
  //  existan dos copias del recetario que puedan discrepar.

  const semilla = spawnSync(process.execPath, [join(root, 'scripts/sembrar-recetas.mjs')], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  if (semilla.status !== 0) {
    throw new Error('No se pudo generar la semilla:\n' + (semilla.stderr || ''));
  }

  const cargada = docker(
    ['exec', '-i', CONTENEDOR, 'sh', '-c', `psql -U postgres -d ${BASE} -v ON_ERROR_STOP=1 -q 2>&1`],
    Buffer.from(semilla.stdout, 'utf8'),
  );

  const problemas = cargada.salida.split('\n').filter((l) => /ERROR|FALLA/.test(l));
  if (problemas.length) throw new Error('La semilla no entro:\n' + problemas.join('\n'));

  console.log('');
  console.log('Cargando las 122 recetas reales');
  console.log(limpiar(cargada.salida));
  console.log(limpiar(correrSql('db/local/pruebas-recetas.sql')));
} catch (error) {
  fallo = error;
  console.error('\n' + String(error.salida || error.message).split('\n').slice(0, 40).join('\n'));
} finally {
  // Se borra pase lo que pase. Un contenedor olvidado de una ejecucion que fallo
  // es lo que hace que la siguiente mienta.
  borrarContenedor();
}

process.exit(fallo ? 1 : 0);
