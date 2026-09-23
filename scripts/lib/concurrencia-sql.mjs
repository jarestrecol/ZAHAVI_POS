/**
 * =============================================================================
 *  CONCURRENCIA DE VERDAD: DOS SESIONES DE POSTGRESQL A LA VEZ (F3-8)
 * =============================================================================
 *
 *  Las pruebas de `db/local/pruebas-api*.sql` corren en UNA sesion: comprueban
 *  reglas, no carreras. Esto abre sesiones `psql` en paralelo contra el mismo
 *  PostgreSQL y fuerza el solapamiento: la primera toma sus bloqueos y los
 *  retiene con `pg_sleep` antes de confirmar; la segunda arranca despues y
 *  tiene que esperar. Asi el orden es determinista y la prueba no depende de
 *  la suerte.
 *
 *  Lo que se exige, en todos los escenarios:
 *    * una sola ejecucion por receta, aunque se toque dos veces o desde dos
 *      pantallas;
 *    * quien llega con una vista vieja recibe 409, no un descuento a ciegas;
 *    * al final, ningun saldo negativo y cada saldo igual a la suma de su
 *      libro (ademas de la restriccion diferida de 0023).
 *
 *  Lo usa `scripts/probar-sql.mjs`, que ya levanto el contenedor.
 */

import { spawn } from 'node:child_process';

const OBRADOR = `
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';
`;

const HOY = "(now() at time zone 'America/Bogota')::date";

/** Corre SQL en una sesion propia y devuelve su salida (no falla si el SQL falla). */
function sesion(contenedor, base, sql) {
  return new Promise((resolver) => {
    const p = spawn('docker', ['exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', base,
      '-v', 'ON_ERROR_STOP=1', '-At', '-q'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let salida = '';
    p.stdout.on('data', (d) => { salida += d; });
    p.stderr.on('data', (d) => { salida += d; });
    p.on('close', (codigo) => resolver({ codigo, salida }));
    p.stdin.end(sql);
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** El `code` del error de la API que haya en la salida, o null. */
function codigoDeError(salida) {
  const m = salida.match(/ERROR:\s+(\{.*\})/);
  if (!m) return null;
  try { return JSON.parse(m[1]).code; } catch { return 'otro'; }
}

/** Una sola fila, un solo valor. */
async function valor(contenedor, base, sql) {
  const r = await sesion(contenedor, base, sql);
  if (r.codigo !== 0) throw new Error('Consulta de apoyo fallida:\n' + r.salida);
  return r.salida.trim();
}

export async function probarConcurrencia({ contenedor, base, ok }) {
  const correr = (sql) => sesion(contenedor, base, sql);
  const leer = (sql) => valor(contenedor, base, sql);

  /*
   * La segunda sesion no arranca por reloj sino cuando la primera YA tiene sus
   * bloqueos y esta dormida en `pg_sleep`: con una espera fija, un `docker
   * exec` lento dejaria que la segunda se adelantara y la prueba mentiria.
   */
  async function cuandoRetenga() {
    for (let i = 0; i < 100; i += 1) {
      const n = await leer(`select count(*) from pg_stat_activity
        where state = 'active' and query like '%pg_sleep(1.5)%' and pid <> pg_backend_pid();`);
      if (n === '1') return;
      await esperar(100);
    }
    throw new Error('La primera sesion nunca llego a retener sus bloqueos');
  }

  // ---- Escenario comun: 3000 g de harina y tres recetas de 1000 g por tanda.
  const preparacion = await correr(`
    insert into ingredientes (id, nombre, unidad_base) values
      ('bbbbbbbb-0000-0000-0000-0000000000c1', 'QA-CONC-HARINA', 'GR');
    insert into recetas (id, codigo, nombre, categoria) values
      ('ffffffff-0000-0000-0000-0000000000c1', 'QA-CC-A', 'QA-CONC A', 'PANADERÍA'),
      ('ffffffff-0000-0000-0000-0000000000c2', 'QA-CC-B', 'QA-CONC B', 'PANADERÍA'),
      ('ffffffff-0000-0000-0000-0000000000c3', 'QA-CC-C', 'QA-CONC C', 'PANADERÍA');
    insert into receta_componentes (id, receta_id, nombre, orden) values
      ('ffffffff-0000-0000-0000-0000000000e1', 'ffffffff-0000-0000-0000-0000000000c1', 'MASA', 1),
      ('ffffffff-0000-0000-0000-0000000000e2', 'ffffffff-0000-0000-0000-0000000000c2', 'MASA', 1),
      ('ffffffff-0000-0000-0000-0000000000e3', 'ffffffff-0000-0000-0000-0000000000c3', 'MASA', 1);
    insert into receta_items (componente_id, ingrediente_id, cantidad, unidad, orden) values
      ('ffffffff-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-0000000000c1', 1000, 'GR', 1),
      ('ffffffff-0000-0000-0000-0000000000e2', 'bbbbbbbb-0000-0000-0000-0000000000c1', 1000, 'GR', 1),
      ('ffffffff-0000-0000-0000-0000000000e3', 'bbbbbbbb-0000-0000-0000-0000000000c1', 1000, 'GR', 1);
    ${OBRADOR}
    select public.operacion_ejecutar(jsonb_build_object('id', 'cccc0000-0000-4000-8000-000000000001',
      'accion', 'registrar_lote', 'revision', 0, 'datos', jsonb_build_object(
        'ingrediente_id', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'unidad', 'GR', 'peso_compra', 3000,
        'costo_compra', 6000, 'vencimiento', ${HOY} + 30)));
    select public.operacion_ejecutar(jsonb_build_object('id', 'cccc0000-0000-4000-8000-000000000002',
      'accion', 'fijar_receta', 'revision', 0, 'datos', jsonb_build_object('fecha', ${HOY},
        'receta_id', 'ffffffff-0000-0000-0000-0000000000c1', 'tandas', 1)));
    select public.operacion_ejecutar(jsonb_build_object('id', 'cccc0000-0000-4000-8000-000000000003',
      'accion', 'fijar_receta', 'revision', 1, 'datos', jsonb_build_object('fecha', ${HOY},
        'receta_id', 'ffffffff-0000-0000-0000-0000000000c2', 'tandas', 1)));
    select public.operacion_ejecutar(jsonb_build_object('id', 'cccc0000-0000-4000-8000-000000000004',
      'accion', 'fijar_receta', 'revision', 2, 'datos', jsonb_build_object('fecha', ${HOY},
        'receta_id', 'ffffffff-0000-0000-0000-0000000000c3', 'tandas', 1)));
  `);
  if (preparacion.codigo !== 0) throw new Error('No se pudo preparar la concurrencia:\n' + preparacion.salida);

  const cotizar = (receta) => leer(`${OBRADOR}
    select (r ->> 'plan_revision') || ' ' || (r ->> 'huella') from (select public.operacion_leer(jsonb_build_object(
      'tipo', 'cotizacion', 'fecha', ${HOY}, 'receta_id', '${receta}')) r) x;`);
  // La llamada como expresion, para usarla dentro de un `select`.
  const llamada = (id, receta, revision, huella) => `public.operacion_ejecutar(jsonb_build_object(
      'id', '${id}', 'accion', 'confirmar_receta', 'revision', ${revision}, 'datos', jsonb_build_object(
      'fecha', ${HOY}, 'receta_id', '${receta}', 'huella', '${huella}')))`;
  const confirmar = (...args) => `select ${llamada(...args)};`;
  const ejecuciones = (receta) => leer(`select count(*) from ejecuciones where receta_id = '${receta}';`);

  // ---- 1. Doble toque: la MISMA solicitud, a la vez.
  {
    const [rev, huella] = (await cotizar('ffffffff-0000-0000-0000-0000000000c1')).split(' ');
    const args = ['dddd0000-0000-4000-8000-000000000001', 'ffffffff-0000-0000-0000-0000000000c1', rev, huella];
    const a = correr(`${OBRADOR} begin; ${confirmar(...args)} select pg_sleep(1.5); commit;`);
    await cuandoRetenga();
    const b = correr(`${OBRADOR} select ${llamada(...args)} ->> 'repetida';`);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.codigo !== 0) throw new Error('El primer toque fallo:\n' + ra.salida);
    if (!/^t(rue)?$/m.test(rb.salida.trim())) throw new Error('El segundo toque no devolvio la misma confirmacion:\n' + rb.salida);
    if (await ejecuciones('ffffffff-0000-0000-0000-0000000000c1') !== '1') throw new Error('El doble toque creo dos ejecuciones');
    ok('doble toque simultáneo: el segundo espera y recibe la misma confirmación; una sola ejecución');
  }

  // ---- 2. Dos pantallas: DOS solicitudes para la misma receta, a la vez.
  {
    const [rev, huella] = (await cotizar('ffffffff-0000-0000-0000-0000000000c2')).split(' ');
    const a = correr(`${OBRADOR} begin; ${confirmar('dddd0000-0000-4000-8000-000000000002', 'ffffffff-0000-0000-0000-0000000000c2', rev, huella)} select pg_sleep(1.5); commit;`);
    await cuandoRetenga();
    const b = correr(`${OBRADOR} ${confirmar('dddd0000-0000-4000-8000-000000000003', 'ffffffff-0000-0000-0000-0000000000c2', rev, huella)}`);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.codigo !== 0) throw new Error('La primera pantalla fallo:\n' + ra.salida);
    if (codigoDeError(rb.salida) !== 'conflicto') throw new Error('La segunda pantalla no recibio 409:\n' + rb.salida);
    if (await ejecuciones('ffffffff-0000-0000-0000-0000000000c2') !== '1') throw new Error('Dos pantallas confirmaron dos veces');
    ok('dos pantallas confirman la misma receta a la vez: una sola ejecución, la otra recibe 409');
  }

  // ---- 3. Confirmar mientras alguien ajusta el mismo lote (el ajuste llega tarde).
  const lote = await leer(`select id || ' ' || revision from lotes where codigo = (
      select codigo from lotes l join ingredientes i on i.id = l.ingrediente_id where i.nombre = 'QA-CONC-HARINA');`);
  {
    const [loteId, revLote] = lote.split(' ');
    const [rev, huella] = (await cotizar('ffffffff-0000-0000-0000-0000000000c3')).split(' ');
    const a = correr(`${OBRADOR} begin; ${confirmar('dddd0000-0000-4000-8000-000000000004', 'ffffffff-0000-0000-0000-0000000000c3', rev, huella)} select pg_sleep(1.5); commit;`);
    await cuandoRetenga();
    const b = correr(`${OBRADOR} select public.operacion_ejecutar(jsonb_build_object('id', 'dddd0000-0000-4000-8000-000000000005',
      'accion', 'ajustar_lote', 'revision', ${revLote}, 'datos', jsonb_build_object('lote_id', '${loteId}',
      'existencia', 500, 'tipo', 'merma', 'motivo', 'Conteo concurrente')));`);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.codigo !== 0) throw new Error('La confirmacion concurrente fallo:\n' + ra.salida);
    if (codigoDeError(rb.salida) !== 'conflicto') throw new Error('El ajuste con la revision vieja no recibio 409:\n' + rb.salida);
    ok('un ajuste que espera a una confirmación llega con revisión vieja: 409, sin pisarla');
  }

  // ---- 4. Ajustar primero: la confirmacion que esperaba ve otro costeo y se niega.
  //      Lote nuevo de 1000 g y media tanda mas de C (500 g pendientes).
  {
    const [loteId, revLote] = (await leer(`${OBRADOR} select (r #>> '{resultado,lote,id}') || ' ' || (r #>> '{resultado,lote,revision}')
      from (select public.operacion_ejecutar(jsonb_build_object('id', 'dddd0000-0000-4000-8000-000000000009',
        'accion', 'registrar_lote', 'revision', 0, 'datos', jsonb_build_object(
          'ingrediente_id', 'bbbbbbbb-0000-0000-0000-0000000000c1', 'unidad', 'GR', 'peso_compra', 1000,
          'costo_compra', 3000, 'vencimiento', ${HOY} + 40))) r) x;`)).split(' ');
    const fijado = await correr(`${OBRADOR} select public.operacion_ejecutar(jsonb_build_object('id', 'dddd0000-0000-4000-8000-000000000006',
      'accion', 'fijar_receta', 'revision', (select revision from planes where fecha = ${HOY}
        and sede_id = '11111111-1111-1111-1111-111111111111'),
      'datos', jsonb_build_object('fecha', ${HOY}, 'receta_id', 'ffffffff-0000-0000-0000-0000000000c3', 'tandas', 1.5)));`);
    if (fijado.codigo !== 0) throw new Error(`No se pudo añadir media tanda:\n${fijado.salida}`);
    const [rev, huella] = (await cotizar('ffffffff-0000-0000-0000-0000000000c3')).split(' ');
    const a = correr(`${OBRADOR} begin; select public.operacion_ejecutar(jsonb_build_object('id', 'dddd0000-0000-4000-8000-000000000007',
      'accion', 'ajustar_lote', 'revision', ${revLote}, 'datos', jsonb_build_object('lote_id', '${loteId}',
      'existencia', 900, 'tipo', 'merma', 'motivo', 'Bulto roto'))); select pg_sleep(1.5); commit;`);
    await cuandoRetenga();
    const b = correr(`${OBRADOR} ${confirmar('dddd0000-0000-4000-8000-000000000008', 'ffffffff-0000-0000-0000-0000000000c3', rev, huella)}`);
    const [ra, rb] = await Promise.all([a, b]);
    if (ra.codigo !== 0) throw new Error('El ajuste previo fallo:\n' + ra.salida);
    if (codigoDeError(rb.salida) !== 'conflicto') throw new Error('La confirmacion con el costeo viejo no recibio 409:\n' + rb.salida);
    ok('la confirmación que esperaba un ajuste ve otro costeo: 409, no descuenta con una vista vieja');
  }

  // ---- Lo que quedo.
  const negativos = await leer('select count(*) from lotes where existencia < 0;');
  const descuadres = await leer(`select count(*) from lotes l
    where l.existencia <> (select coalesce(sum(cantidad), 0) from movimientos m where m.lote_id = l.id);`);
  const saldos = await leer(`select string_agg(existencia::numeric(18,0)::text, ' ' order by peso_compra desc)
    from lotes where ingrediente_id = 'bbbbbbbb-0000-0000-0000-0000000000c1';`);
  if (negativos !== '0' || descuadres !== '0') throw new Error(`Saldos negativos: ${negativos}; saldos distintos de su libro: ${descuadres}`);
  // Lote de 3000: 3000 - 1000 (A) - 1000 (B) - 1000 (C) = 0; la merma a 500
  // llego tarde y no paso. Lote de 1000: la merma a 900 si paso y la media
  // tanda de C, confirmada con la vista vieja, no descontó nada.
  if (saldos !== '0 900') throw new Error(`Los saldos deberian ser 0 y 900 y son ${saldos}`);
  ok('al final: saldos exactos (0 y 900 g), ninguno negativo, todos iguales a su libro');
}
