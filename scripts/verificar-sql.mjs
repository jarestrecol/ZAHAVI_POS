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

// El nombre puede venir calificado (`privado.acciones`): se conserva el esquema
// salvo `public`, para no confundir la tabla con el nombre de su esquema.
const NOMBRE_TABLA = String.raw`((?:[a-z_]+\.)?[a-z_]+)`;
const sinPublic = (nombre) => nombre.toLowerCase().replace(/^public\./, '');
const tablas = [...todo.matchAll(new RegExp(String.raw`create table if not exists\s+` + NOMBRE_TABLA, 'gi'))].map((m) => sinPublic(m[1]));
const conRLS = new Set(
  [...todo.matchAll(new RegExp(String.raw`alter table\s+` + NOMBRE_TABLA + String.raw`\s+enable row level security`, 'gi'))].map((m) => sinPublic(m[1])),
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
/*
 * DESDE 0008 LA LOGICA DE CADA VISTA VIVE EN UNA FUNCION DE `privado`.
 *
 * El asesor de Supabase marca como error critico toda vista `security definer`
 * del esquema publicado, porque no puede distinguir la que filtra de la que no.
 * 0008 deja en `public` vistas `security_invoker` que solo leen una funcion
 * `privado.<vista>()`, y es esa funcion la que filtra y enmascara.
 *
 * Asi que la regla no se relaja: se sigue a donde se mudo. Manda la ULTIMA
 * declaracion de cada vista, y si esa declaracion solo lee una funcion privada,
 * el filtro se exige en el cuerpo de esa funcion. Mirar solo la vista daria
 * verde con cualquier funcion detras, que es exactamente el defecto que este
 * bloque existe para impedir.
 */
const FILTRO = /es_mi_sede\s*\(|es_al_menos\s*\(/;

const vistas = new Map(
  [
    ...todo.matchAll(
      /create or replace view\s+([a-z_]+)\s*(?:with\s*\(([^)]*)\)\s*)?as([\s\S]*?);\s*(?=\n|$)/gi,
    ),
  ].map(([, nombre, opciones = '', cuerpo]) => [nombre, { opciones, cuerpo }]),
);
comprobar('se encontraron vistas', vistas.size > 0, `${vistas.size} vistas`);

const funcionesPrivadas = new Map(
  [
    ...todo.matchAll(
      /create or replace function privado\.([a-z_]+)\s*\(\s*\)\s*returns table[\s\S]*?\$\$([\s\S]*?)\$\$/gi,
    ),
  ].map(([, nombre, cuerpo]) => [nombre, cuerpo]),
);

const filtra = ({ cuerpo }) => {
  if (FILTRO.test(cuerpo)) return true;
  const origen = cuerpo.match(/from\s+privado\.([a-z_]+)\s*\(\s*\)/i);
  return Boolean(origen && FILTRO.test(funcionesPrivadas.get(origen[1]) || ''));
};

const sinFiltro = [...vistas].filter(([, v]) => !filtra(v)).map(([nombre]) => nombre);

comprobar(
  'todas filtran con `es_mi_sede()` o `es_al_menos()`, en la vista o en su funcion privada',
  sinFiltro.length === 0,
  sinFiltro.length ? 'sin filtrar: ' + sinFiltro.join(', ') : `${vistas.size} de ${vistas.size}`,
);

const sinInvoker = [...vistas]
  .filter(([, v]) => !/security_invoker\s*=\s*true/i.test(v.opciones))
  .map(([nombre]) => nombre);

comprobar(
  'y todas son `security_invoker`: ninguna se salta la seguridad de quien consulta',
  sinInvoker.length === 0,
  sinInvoker.length ? 'siguen como definer: ' + sinInvoker.join(', ') : `${vistas.size} de ${vistas.size}`,
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
    nombre: (cabecera.match(/^\s*([a-z_.]+)\s*\(/i) || [, '?'])[1],
    cabecera,
    definer: /security definer/i.test(cabecera),
  };
});

const fijadaAparte = new Set(
  [...todo.matchAll(/alter function\s+([a-z_.]+)\s*\([^)]*\)\s*set\s+search_path/gi)].map((m) =>
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
  'nunca se concede `update` ni `delete` sobre `movimientos`',
  !/grant[^;]*\b(update|delete)\b[^;]*\bon movimientos\b/i.test(todo),
);
// Desde 0023 el libro solo lo escriben las funciones de la API: la insercion
// directa que concedia 0005 se revoca.
comprobar(
  'y desde 0023 nadie inserta en el libro directamente',
  /revoke insert[^;]*\bon table\b[^;]*\bmovimientos\b[^;]*from anon, authenticated/i.test(todo),
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
comprobar(
  'lo mismo en `privado`: se revocan de `PUBLIC`',
  /revoke execute on all functions in schema privado from public/i.test(todo),
);
comprobar(
  'y tambien nacen cerradas',
  /alter default privileges in schema privado revoke execute on functions from public/i.test(todo),
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

/* ===========================================================================
 *  9. EL ACCESO INTERNO NO CONFUNDE CODIGO CON PIN
 * ======================================================================== */

console.log('\n9. El acceso interno conserva sus credenciales separadas');

comprobar(
  '`perfiles` guarda un codigo de usuario unico',
  /create unique index if not exists perfiles_codigo_usuario_unico[\s\S]*?on perfiles \(codigo_usuario\)/i.test(todo),
);
comprobar(
  'el codigo acepta solo el formato operativo documentado',
  /codigo_usuario ~ '\^\[A-Z0-9\]\[A-Z0-9_-\]\{2,31\}\$'/i.test(todo),
);
comprobar(
  'el PIN no se guarda en el perfil de datos',
  !/create table if not exists perfiles[\s\S]*?\b(pin|password|contrasena)\b/i.test(todo),
);
comprobar(
  'el disparador toma el codigo desde metadatos y conserva el rol minimo',
  /raw_user_meta_data\s*->>\s*'codigo_usuario'/i.test(todo) &&
    /'operario'/.test(todo),
);
comprobar(
  'la funcion de alta no se puede invocar como RPC publica',
  /revoke all on function crear_perfil_al_registrarse\(\) from public, anon, authenticated/i.test(todo),
);

/* ===========================================================================
 *  10. LO QUE EXIGE EL ASESOR DE SUPABASE
 * ======================================================================== */

console.log('\n10. El asesor de Supabase no tiene nada que senalar');

/*
 * Se reconstruye el estado FINAL de las politicas recorriendo las migraciones en
 * orden: un `drop policy` quita y un `create policy` pone. Mirar solo los
 * `create` contaria politicas que una migracion posterior ya retiro.
 */
const politicas = new Map();
for (const m of todo.matchAll(
  /drop policy if exists\s+(\w+)\s+on\s+(\w+)|create policy\s+(\w+)\s+on\s+(\w+)\s+for\s+(\w+)([^;]*);/gi,
)) {
  if (m[1]) politicas.delete(`${m[2]}.${m[1]}`);
  else politicas.set(`${m[4]}.${m[3]}`, { tabla: m[4], accion: m[5].toLowerCase(), cuerpo: m[6] });
}

const porTabla = new Map();
for (const p of politicas.values()) {
  if (!porTabla.has(p.tabla)) porTabla.set(p.tabla, []);
  porTabla.get(p.tabla).push(p.accion);
}
const solapadas = [...porTabla]
  .filter(([, acciones]) =>
    acciones.some((a, i) => acciones.some((b, j) => i !== j && (a === b || a === 'all' || b === 'all'))),
  )
  .map(([tabla]) => tabla);

comprobar(
  'ninguna tabla evalua dos politicas para la misma accion',
  solapadas.length === 0,
  solapadas.length ? 'con solape: ' + solapadas.join(', ') : `${politicas.size} politicas en ${porTabla.size} tablas`,
);

/*
 * NINGUNA POLITICA DEJA PASAR A CUALQUIERA CON UN TESTIGO.
 *
 * `using (true)` lo pasa quien tenga una sesion de Supabase, con perfil o sin
 * el, activo o dado de baja. Desde que cada persona entra con su usuario, dar
 * de baja es `activo = false`, y eso tiene que cortar los datos en el momento.
 * Lo corrigio 0009; esto impide que vuelva.
 */
const abiertas = [...politicas]
  .filter(([, p]) => /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i.test(p.cuerpo))
  .map(([clave]) => clave);

comprobar(
  'ninguna politica deja pasar a quien no tiene un perfil activo (`using (true)`)',
  abiertas.length === 0,
  abiertas.length ? 'abiertas: ' + abiertas.join(', ') : '',
);

const uidPorFila = [...politicas]
  .filter(([, p]) => /(?<!select\s)auth\.uid\(\)/i.test(p.cuerpo))
  .map(([clave]) => clave);

comprobar(
  '`auth.uid()` va dentro de `(select ...)` para no evaluarse por cada fila',
  uidPorFila.length === 0,
  uidPorFila.length ? 'por fila en: ' + uidPorFila.join(', ') : '',
);

comprobar(
  'las funciones de autorizacion `security definer` viven fuera del esquema publicado',
  /create or replace function privado\.mi_rol\(\)[\s\S]*?security definer/i.test(todo) &&
    /create or replace function privado\.mi_sede\(\)[\s\S]*?security definer/i.test(todo),
);

/* ===========================================================================
 *  11. LAS DECISIONES DE ACCESO SE EXIGEN EN LA BASE DE DATOS
 * ======================================================================== */

console.log('\n11. Verificacion en dos pasos, turno de 6 horas y altas desactivadas');

/*
 * Tres decisiones del negocio (0010). Se miran en la ULTIMA definicion de cada
 * funcion, porque cada migracion la reemplaza entera: que 0010 exigiera `aal2`
 * no sirve de nada si una migracion posterior reescribe `es_al_menos()` sin
 * acordarse. Y ese olvido no lo nota ninguna pantalla: la aplicacion sigue
 * pidiendo el codigo del celular mientras la base ya no lo exige.
 */
function ultimaDefinicion(nombre) {
  const patron = new RegExp(
    `create or replace function\\s+${nombre.replace('.', '\\.')}\\s*\\(([\\s\\S]*?)\\$\\$([\\s\\S]*?)\\$\\$`,
    'gi',
  );
  let ultima = null;
  for (const m of todo.matchAll(patron)) ultima = { cabecera: m[1], cuerpo: m[2] };
  return ultima;
}

const esAlMenos = ultimaDefinicion('privado.es_al_menos');
comprobar(
  'gerencia y administracion solo valen con verificacion en dos pasos (`aal2`)',
  Boolean(esAlMenos) && /'gerencia'/.test(esAlMenos.cuerpo) && /'aal2'/.test(esAlMenos.cuerpo),
);

const sinTurno = ['privado.mi_rol', 'privado.mi_sede'].filter((nombre) => {
  const f = ultimaDefinicion(nombre);
  return !f || !/\bactivo\b/.test(f.cuerpo) || !/privado\.sesion_vigente\(\)/.test(f.cuerpo);
});
comprobar(
  'el rol y la sede solo se conceden a un perfil activo dentro de su turno',
  sinTurno.length === 0,
  sinTurno.length ? 'sin turno: ' + sinTurno.join(', ') : '',
);

const sesionVigente = ultimaDefinicion('privado.sesion_vigente');
comprobar(
  'el turno se cuenta desde que se abrio la sesion del testigo, y es de esa persona',
  Boolean(sesionVigente) &&
    /auth\.sessions/.test(sesionVigente.cuerpo) &&
    /'session_id'/.test(sesionVigente.cuerpo) &&
    /user_id\s*=\s*\(select auth\.uid\(\)\)/.test(sesionVigente.cuerpo) &&
    /created_at\s*>\s*now\(\)\s*-\s*interval/.test(sesionVigente.cuerpo),
);
comprobar(
  'nadie puede llamar al turno por HTTP',
  /revoke execute on function privado\.sesion_vigente\(\) from public, anon, authenticated/i.test(todo),
);

const alta = ultimaDefinicion('crear_perfil_al_registrarse');
const defaults = [...todo.matchAll(/alter table perfiles alter column activo set default\s+(\w+)/gi)];
comprobar(
  'una cuenta nueva nace desactivada y una anonima no recibe perfil',
  Boolean(alta) &&
    /is_anonymous/.test(alta.cuerpo) &&
    /'operario',\s*false\s*\)/.test(alta.cuerpo) &&
    defaults.length > 0 &&
    defaults[defaults.length - 1][1].toLowerCase() === 'false',
);

/* ===========================================================================
 *  12. EL EQUIPO QUE SE PUEDE ASIGNAR NO ABRE LOS PERFILES
 * ======================================================================== */

console.log('\n12. Area de produccion y equipo asignable');

/*
 * `equipo_produccion` (0011) existe para que el jefe de obrador pueda asignar
 * recetas sin leer `perfiles`. Si una migracion posterior le añadiera columnas
 * -el estado de la cuenta, la sede, el correo- o le quitara el filtro de rol,
 * la regla 3 seguiria en verde mientras hubiera un `es_mi_sede`. Se mira la
 * ULTIMA definicion, igual que en el bloque 11.
 */
const equipo = ultimaDefinicion('privado.equipo_produccion');
const columnasEquipo = equipo
  ? (equipo.cuerpo.match(/select\s+([\s\S]*?)\s+from/i)?.[1] || '').split(',').map((c) => c.trim().replace(/^p\./, ''))
  : [];
// El filtro con esta forma exacta: con un `or` en medio, un `es_mi_sede` suelto
// bastaria para abrir la lista a cualquiera.
comprobar(
  'la lista del equipo exige perfil activo con area, jefe de obrador y su sede',
  Boolean(equipo) && /where\s+p\.activo\s+and\s+p\.area\s+is\s+not\s+null\s+and\s+privado\.es_al_menos\('obrador'\)\s+and\s+privado\.es_mi_sede\(p\.sede_id\)$/i.test(equipo.cuerpo.trim()),
);
// 0012: ni el codigo de acceso ni el rol. Para asignar basta el nombre.
comprobar(
  'y entrega solo id, nombre y area',
  columnasEquipo.join(',') === 'id,nombre,area',
  columnasEquipo.join(', '),
);
comprobar(
  'el area solo admite las tres areas de produccion',
  /check \(area is null or area in \('PASTELERÍA', 'PANADERÍA', 'GALLETAS'\)\)/.test(todo),
);
// Los permisos del estado FINAL: lo que se conceda despues de la ultima
// creacion de la vista. Antes se revoca todo y luego solo se concede `select`.
const ultimaVista = todo.toLowerCase().lastIndexOf('create or replace view equipo_produccion');
const trasLaVista = ultimaVista >= 0 ? todo.slice(ultimaVista) : '';
const concesiones = [...trasLaVista.matchAll(/grant\s+([\s\S]*?)\s+on\s+(?:table\s+)?equipo_produccion\b/gi)]
  .map((m) => m[1].trim().toLowerCase());
const revocaPrimero = /revoke all on equipo_produccion from anon, authenticated;[\s\S]*?grant select on equipo_produccion to authenticated;/i
  .test(trasLaVista);
comprobar(
  'la vista es de solo lectura: se revoca todo y solo se concede `select`',
  revocaPrimero && concesiones.length > 0 && concesiones.every((c) => c === 'select'),
  concesiones.join(' | '),
);

/* ===========================================================================
 *  13. UNA TABLA NUEVA NO NACE CON PERMISOS DE MAS
 * ======================================================================== */
//
//  EL HUECO QUE ESTE BLOQUE CIERRA
//  -------------------------------
//  Los privilegios POR DEFECTO del esquema `public` los define `supabase_admin`
//  y conceden TODO sobre cada tabla nueva a `anon` y `authenticated`: insert,
//  update, delete y tambien TRUNCATE. Nosotros no podemos cambiar esos valores
//  por defecto (no somos ese rol), asi que la unica defensa es que cada
//  migracion revoque lo que su tabla no necesita.
//
//  Por que importa TRUNCATE: la seguridad por filas NO lo filtra. Asi fue como
//  `auditoria` quedo vaciable por cualquier sesion valida hasta la migracion
//  0013, aunque su unica politica era de lectura para gerencia.
//
//  La regla mira SOLO las migraciones nuevas (0013 en adelante). Las anteriores
//  se revisaron a mano al detectar el caso: hoy ninguna tabla de `public`
//  concede TRUNCATE a la API (comprobado con `db/auditoria/operacion.sql`).

console.log('\n13. Permisos de las tablas nuevas');

const DESDE = 13;
const nuevas = fuente
  .filter((f) => parseInt(f.nombre.slice(0, 4), 10) >= DESDE)
  .flatMap((f) => [...f.sql.matchAll(new RegExp(String.raw`create table if not exists\s+` + NOMBRE_TABLA, 'gi'))]
    .map((m) => ({ tabla: sinPublic(m[1]), sql: f.sql, archivo: f.nombre })));

comprobar(
  `la regla se aplica desde la migracion ${String(DESDE).padStart(4, '0')}`,
  true,
  nuevas.length ? `${nuevas.length} tabla(s) nueva(s): ${nuevas.map((n) => n.tabla).join(', ')}` : 'ninguna tabla nueva todavia',
);

// Un `revoke` puede nombrar varias tablas de una vez: se mira la lista entera.
// Vale `revoke all` o cualquier revoke que incluya `truncate`, siempre que
// alcance a `authenticated`.
const REVOCACIONES = /revoke\s+([\s\S]*?)\s+on\s+(?:table\s+)?([\s\S]*?)\s+from\s+([^;]+);/gi;
const revoca = ({ tabla, sql }) => [...sql.matchAll(REVOCACIONES)].some((m) => {
  const permisos = m[1].toLowerCase();
  const tablas = m[2].split(',').map((t) => sinPublic(t.trim()));
  const roles = m[3].toLowerCase();
  const revocado = permisos.split(/[\s,]+/);
  return (revocado.includes('all') || revocado.includes('truncate')) && tablas.includes(tabla) && roles.includes('authenticated');
});

const sinRevoke = nuevas.filter((n) => !revoca(n));
comprobar(
  'cada tabla nueva revoca `truncate` (o `all`) a `authenticated`',
  sinRevoke.length === 0,
  sinRevoke.length
    ? 'les falta: ' + sinRevoke.map((n) => `${n.tabla} (${n.archivo})`).join(', ')
    : `${nuevas.length} de ${nuevas.length}`,
);

console.log('\n===========================================================');
if (fallos === 0) {
  console.log(' RESULTADO: el esquema respeta sus fronteras.');
} else {
  console.log(` RESULTADO: ${fallos} comprobacion(es) fallida(s).`);
}
console.log('===========================================================\n');

process.exit(fallos === 0 ? 0 : 1);
