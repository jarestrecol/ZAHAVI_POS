/**
 * =============================================================================
 *  FRONTERAS DEL ESQUEMA DE BASE DE DATOS
 * =============================================================================
 *
 *  El mismo principio que `verificar.mjs` aplica al codigo: las reglas que
 *  sostienen la seguridad no se confian a la memoria de quien escribe la
 *  siguiente migracion. Se comprueban, y fallan.
 *
 *  Y hacen falta MAS aqui que en el codigo, por dos motivos:
 *
 *    1. Un descuido en una politica no se nota. El sistema sigue funcionando y
 *       enseñando las pantallas de siempre; lo unico que cambia es que alguien
 *       ve algo que no le tocaba. No hay pantalla en blanco ni error en la
 *       consola que avise.
 *
 *    2. Las migraciones se escriben de una en una y con meses de diferencia.
 *       Quien anada la tabla de mermas el ano que viene no va a recordar que
 *       toda tabla lleva seguridad por filas ni que las vistas filtran por sede.
 *
 *  Se ejecuta con:  node scripts/verificar-sql.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

const repoRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const carpeta = join(repoRoot, 'db/migraciones');

let fallos = 0;

function comprobar(titulo, condicion, detalle = '') {
  const marca = condicion ? 'OK   ' : 'FALLA';
  if (!condicion) fallos += 1;
  console.log(`  ${marca} ${titulo}${detalle ? ' -> ' + detalle : ''}`);
}

/**
 * Quita comentarios antes de buscar.
 *
 * Sin esto, un comentario que EXPLIQUE por que una tabla no lleva politica
 * cuenta como si la llevara, y la frontera acaba prohibiendo documentarse a si
 * misma. Es la misma trampa que ya documenta `verificar.mjs`.
 *
 * @param {string} sql
 * @returns {string}
 */
function sinComentarios(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

const archivos = readdirSync(carpeta)
  .filter((n) => n.endsWith('.sql'))
  .sort();

const fuente = archivos.map((n) => ({
  nombre: n,
  sql: sinComentarios(readFileSync(join(carpeta, n), 'utf8')),
}));

const todo = fuente.map((f) => f.sql).join('\n');

console.log('\nVerificando el esquema de la base de datos\n');

/* ===========================================================================
 *  1. LAS MIGRACIONES SE APLICAN EN ORDEN Y NO SE PISAN
 * ======================================================================== */

console.log('1. Orden de las migraciones');

comprobar('hay migraciones que aplicar', archivos.length > 0, `${archivos.length} archivos`);

const numeros = archivos.map((n) => parseInt(n.slice(0, 4), 10));
comprobar(
  'todas empiezan por un numero de cuatro cifras',
  numeros.every((n) => Number.isInteger(n)),
  archivos.join(', '),
);
comprobar(
  'la numeracion es consecutiva y sin huecos',
  numeros.every((n, i) => n === i + 1),
  numeros.join(','),
);
comprobar('no hay dos con el mismo numero', new Set(numeros).size === numeros.length);

/* ===========================================================================
 *  2. TODA TABLA LLEVA SEGURIDAD POR FILAS
 * ======================================================================== */

console.log('\n2. Ninguna tabla se queda sin seguridad por filas');

const tablas = [...todo.matchAll(/create table if not exists\s+([a-z_]+)/gi)].map((m) => m[1]);
const conRLS = new Set(
  [...todo.matchAll(/alter table\s+([a-z_]+)\s+enable row level security/gi)].map((m) => m[1]),
);

comprobar('se encontraron tablas', tablas.length > 0, `${tablas.length} tablas`);

const sinRLS = tablas.filter((t) => !conRLS.has(t));
comprobar(
  'todas tienen `enable row level security`',
  sinRLS.length === 0,
  sinRLS.length ? 'les falta: ' + sinRLS.join(', ') : `${tablas.length} de ${tablas.length}`,
);

/* ===========================================================================
 *  3. LAS VISTAS FILTRAN SIEMPRE
 * ======================================================================== */

console.log('\n3. Ninguna vista entrega filas sin filtrar');

/*
 * Esta es la comprobacion mas importante del archivo.
 *
 * Las vistas de `0004` son `security definer`: se saltan la seguridad por filas
 * de las tablas de abajo, a proposito, porque es la unica forma de enmascarar
 * una columna de dinero a quien si puede ver la fila. El precio de esa decision
 * es que la autorizacion de LECTURA vive dentro de cada vista.
 *
 * Una vista nueva que se olvide de filtrar no daria ningun error: simplemente
 * entregaria la bodega entera, con costos, a cualquiera que haya iniciado
 * sesion. Por eso se comprueba aqui.
 */
const vistas = [...todo.matchAll(/create or replace view\s+([a-z_]+)\s+as([\s\S]*?);\s*(?=\n|$)/gi)];
comprobar('se encontraron vistas', vistas.length > 0, `${vistas.length} vistas`);

const sinFiltro = vistas
  .filter(([, , cuerpo]) => !/es_mi_sede\s*\(|es_al_menos\s*\(/.test(cuerpo))
  .map(([, nombre]) => nombre);

comprobar(
  'todas filtran con `es_mi_sede()` o `es_al_menos()`',
  sinFiltro.length === 0,
  sinFiltro.length ? 'sin filtrar: ' + sinFiltro.join(', ') : `${vistas.length} de ${vistas.length}`,
);

/* ===========================================================================
 *  4. LAS TABLAS CON DINERO NO SE LEEN DIRECTAMENTE
 * ======================================================================== */

console.log('\n4. El dinero no sale de las tablas, sale de las vistas');

/*
 * ESTE BLOQUE ESTABA ESCRITO Y DABA `OK` SIN MIRAR NADA, que es la peor forma
 * de fallar que tiene una comprobacion: la anterior exigia que `lotes` no
 * concediera lectura, y lo daba por bueno porque su expresion solo reconocia
 * la forma `grant select on <tabla>`. El permiso de `lotes` se concede POR
 * COLUMNAS -`grant select (...) on lotes`-, que es otra sintaxis, asi que no
 * la veia. Habria dejado anadir `costo_compra` a esa lista sin decir una
 * palabra.
 *
 * Lo que se comprueba ahora no es la ausencia de una linea, es el hecho: que
 * el costo y el valor unitario no salgan de la tabla para nadie.
 */

// Concesion de tabla entera:   grant select on a, b, c to authenticated;
const grantsTabla = [...todo.matchAll(/grant select on\s+([\s\S]*?)\s+to\s+authenticated/gi)]
  .map((m) => m[1])
  .join(' ');

// Concesion por columnas:      grant select (c1, c2) on tabla to authenticated;
const grantsColumna = [
  ...todo.matchAll(/grant select\s*\(([\s\S]*?)\)\s*on\s+([a-z_]+)\s+to\s+authenticated/gi),
].map((m) => ({ tabla: m[2], columnas: m[1].split(',').map((c) => c.trim()) }));

// Con separadores a los lados, para que `existencia_lotes` no cuente como `lotes`.
const concedidaEntera = (tabla) =>
  new RegExp('(^|[\\s,])' + tabla + '([\\s,]|$)').test(grantsTabla);

const DINERO_EN_LOTES = ['costo_compra', 'valor_unitario'];

comprobar(
  '`lotes` no se concede entera',
  !concedidaEntera('lotes'),
  concedidaEntera('lotes') ? 'se entrega la fila completa, costo incluido' : '',
);

const lotes = grantsColumna.find((g) => g.tabla === 'lotes');
comprobar(
  'se concede por columnas, una por una',
  Boolean(lotes),
  lotes ? `${lotes.columnas.length} columnas` : 'no hay ningun `grant select (...) on lotes`',
);

const escapadas = lotes ? DINERO_EN_LOTES.filter((c) => lotes.columnas.includes(c)) : DINERO_EN_LOTES;
comprobar(
  'y el dinero se queda fuera de esa lista',
  escapadas.length === 0,
  escapadas.length
    ? 'se estan entregando: ' + escapadas.join(', ')
    : DINERO_EN_LOTES.join(' y ') + ' no se conceden',
);

comprobar(
  '`produccion_consumos` no concede lectura de ninguna de las dos formas',
  !concedidaEntera('produccion_consumos') &&
    !grantsColumna.some((g) => g.tabla === 'produccion_consumos'),
);

/*
 * `precios` SI se concede entera, y es correcto. Ahi la fila entera es
 * sensible, asi que la seguridad por filas basta: a quien no es gerencia le
 * devuelve cero filas. El permiso por columna hace falta solo cuando dentro de
 * una misma fila hay de lo uno y de lo otro, como en `lotes`.
 *
 * Lo que hay que vigilar entonces es que esa politica siga exigiendo el rol,
 * porque es lo unico que sostiene la concesion.
 */
const precioReservado =
  /create policy\s+\w+\s+on precios\s+for all to authenticated\s+using\s*\(\s*es_al_menos\('gerencia'\)\s*\)/i.test(
    todo,
  );
comprobar(
  '`precios` se concede entera, pero su politica la reserva a gerencia',
  precioReservado,
  precioReservado ? '' : 'no hay politica que exija el rol, asi que la concesion la abre',
);

/* ===========================================================================
 *  5. LAS FUNCIONES `security definer` FIJAN SU RUTA DE BUSQUEDA
 * ======================================================================== */

console.log('\n5. Sin escalada de privilegios por `search_path`');

/*
 * Una funcion `security definer` sin `set search_path` es la escalada de
 * privilegios clasica de PostgreSQL: quien la llama antepone un esquema propio,
 * la funcion resuelve `perfiles` contra SU tabla en vez de la real, y devuelve
 * el rol que quiera.
 */
// Se parte por declaracion y se mira SOLO la cabecera de cada una -lo que va
// antes del `$$` que abre el cuerpo-, porque `security definer` y
// `set search_path` viven ahi.
//
// La version anterior usaba una sola expresion sobre el archivo entero y se
// saltaba dos de las cuatro funciones sin decir nada: daba `OK` y contaba dos.
// Una comprobacion que no ve lo que dice vigilar es peor que no tenerla, porque
// ademas tranquiliza.
/*
 * Y SE MIRAN TODAS LAS FUNCIONES, NO SOLO LAS `security definer`.
 *
 * El criterio anterior era correcto por sus propios terminos y demasiado
 * estrecho, y eso lo destapo aplicar el esquema contra un Supabase real: cuatro
 * funciones no fijaban `search_path` y ninguna era `security definer`, asi que
 * este bloque daba verde. Dos de ellas eran `es_al_menos()` y `es_mi_sede()`,
 * que consultan TODAS las politicas y TODAS las vistas: quien pudiera
 * desviarlas no se saltaria una comprobacion, se las saltaria todas a la vez.
 *
 * Se admiten las dos formas de fijarlo, porque el esquema usa las dos: en la
 * cabecera del `create`, o despues con `alter function ... set search_path`.
 */
const declaraciones = todo.split(/create or replace function/i).slice(1);
const funciones = declaraciones.map((resto) => {
  const cabecera = resto.split('$$')[0];
  return {
    nombre: (cabecera.match(/^\s*([a-z_]+)\s*\(/i) || [, '?'])[1],
    cabecera,
    definer: /security definer/i.test(cabecera),
  };
});

const fijadaAparte = new Set(
  [...todo.matchAll(/alter function\s+([a-z_]+)\s*\([^)]*\)\s*set\s+search_path/gi)].map((m) =>
    m[1].toLowerCase(),
  ),
);
const fijaRuta = (f) =>
  /set\s+search_path/i.test(f.cabecera) || fijadaAparte.has(f.nombre.toLowerCase());

const definers = funciones.filter((f) => f.definer);
const sinRuta = funciones.filter((f) => !fijaRuta(f));

comprobar(
  'se encontraron las funciones del esquema',
  funciones.length > 0,
  `${funciones.length} funciones, ${definers.length} de ellas \`security definer\``,
);
comprobar(
  'TODAS fijan `search_path`, no solo las `security definer`',
  sinRuta.length === 0,
  sinRuta.length
    ? `${sinRuta.length} sin fijarlo: ${sinRuta.map((f) => f.nombre).join(', ')}`
    : `${funciones.length} de ${funciones.length}`,
);

/* ===========================================================================
 *  6. EL LIBRO DE MOVIMIENTOS ES INMUTABLE
 * ======================================================================== */

console.log('\n6. El historico no se puede reescribir');

comprobar(
  'hay un disparador que rechaza cambios en `movimientos`',
  /create trigger\s+movimientos_sin_cambios[\s\S]*?before update or delete on movimientos/i.test(todo),
);
comprobar(
  'no existe ninguna politica de `update` sobre `movimientos`',
  !/create policy[^;]*on movimientos\s+for update/i.test(todo),
);
comprobar(
  'ni de `delete`',
  !/create policy[^;]*on movimientos\s+for delete/i.test(todo),
);
comprobar(
  'y el permiso concedido es solo de insercion',
  /grant insert on movimientos to authenticated/i.test(todo) &&
    !/grant[^;]*\b(update|delete)\b[^;]*\bon movimientos\b/i.test(todo),
);

/* ===========================================================================
 *  7. EL PUNTO DE PARTIDA ES CERO
 * ======================================================================== */

console.log('\n7. Se revoca todo antes de conceder nada');

comprobar(
  'se revocan las tablas antes de repartir permisos',
  /revoke all on all tables in schema public from anon, authenticated/i.test(todo),
);
comprobar(
  'quien no ha iniciado sesion no recibe ningun permiso',
  !/grant[^;]*\bto\b[^;]*\banon\b/i.test(todo.replace(/grant usage on schema auth to anon[^;]*;/gi, '')),
);

/*
 * Y LAS FUNCIONES SE REVOCAN DE `PUBLIC`, QUE ES DE QUIEN CUELGAN.
 *
 * Esta es la comprobacion que faltaba, y la escribe el defecto que la obligo.
 * 0005 revocaba `all on all functions ... from anon, authenticated` y daba el
 * acceso por cerrado. No cerraba nada: en PostgreSQL una funcion NACE con
 * `execute` concedido a `PUBLIC`, y esos dos roles heredan de ahi. Revocarles a
 * ellos borra unas entradas que nunca existieron y deja intacta la unica que
 * concede de verdad.
 *
 * Se comprobo preguntandole al catalogo del proyecto real, no leyendo el SQL:
 * `anon`, sin sesion y sin token, podia ejecutar las cinco funciones del
 * esquema. No habia fuga -sin `auth.uid()` devuelven nulo y false, y las tablas
 * si estaban cerradas-, pero el archivo afirmaba haber cerrado una puerta que no
 * habia tocado, que es la clase de defecto que este proyecto considera peor que
 * la ausencia de la comprobacion: ademas tranquiliza.
 */
comprobar(
  'las funciones se revocan de `PUBLIC`, no solo de `anon` y `authenticated`',
  /revoke execute on all (functions|routines) in schema public from public/i.test(todo),
);
comprobar(
  'y la proxima funcion nacera cerrada',
  /alter default privileges in schema public revoke execute on functions from public/i.test(todo),
);

/* ===========================================================================
 *  8. EL COSTO SE CONGELA
 * ======================================================================== */

console.log('\n8. El costo de una produccion no se puede mover despues');

comprobar(
  '`produccion_consumos` guarda su propio `costo_unitario`',
  /create table if not exists produccion_consumos[\s\S]*?costo_unitario numeric/i.test(todo),
);
comprobar(
  'y el costo es una columna generada, no un numero que alguien teclea',
  /costo numeric\(14, 2\) generated always as/i.test(todo),
);
comprobar(
  'el valor unitario de un lote tambien se deriva',
  /valor_unitario numeric\(18, 6\)\s*\n?\s*generated always as/i.test(todo),
);

console.log('\n===========================================================');
if (fallos === 0) {
  console.log(' RESULTADO: el esquema respeta sus fronteras.');
} else {
  console.log(` RESULTADO: ${fallos} comprobacion(es) fallida(s).`);
}
console.log('===========================================================\n');

process.exit(fallos === 0 ? 0 : 1);
