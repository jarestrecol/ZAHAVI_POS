-- =============================================================================
--  PRUEBAS DE LA API: ALTA POR NOMBRE, CORRECCION Y DOCUMENTO DE OPERACION (0026)
-- =============================================================================
--
--  Lo que necesita el cliente de bodega y produccion para hablar con la base:
--  dar de alta por nombre de ingrediente, corregir una compra y leer el
--  documento de operacion con la forma que ya usa su nucleo. Reutiliza la
--  semilla de `pruebas.sql` y lo deshace todo al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo '35. Alta por nombre, correccion y documento de operacion (0026)'
\echo ''

begin;

create function qa_codigo(p_solicitud jsonb) returns text
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  m text;
begin
  perform public.operacion_ejecutar(p_solicitud);
  return 'ok';
exception when sqlstate 'PGRST' then
  get stacked diagnostics m = message_text;
  return m::jsonb ->> 'code';
end $$;
grant execute on function qa_codigo(jsonb) to authenticated;

create function qa_sol(p_accion text, p_revision integer, p_datos jsonb) returns jsonb
language sql volatile set search_path = public, pg_temp as $$
  select jsonb_build_object('id', gen_random_uuid(), 'accion', p_accion, 'revision', p_revision, 'datos', p_datos)
$$;
grant execute on function qa_sol(text, integer, jsonb) to authenticated;

create temp table qa (clave text primary key, valor jsonb);
grant all on qa to authenticated;

-- Una receta de 400 g de un ingrediente que todavia no esta en el catalogo.
insert into recetas (id, codigo, nombre, categoria) values
  ('ffffffff-0000-0000-0000-000000000051', 'QA-DOC-R1', 'QA-DOC PAN X 8 UND', 'PANADERÍA');
insert into receta_componentes (id, receta_id, nombre, orden) values
  ('ffffffff-0000-0000-0000-0000000000a5', 'ffffffff-0000-0000-0000-000000000051', 'MASA', 1);
insert into qa values ('hoy', to_jsonb((now() at time zone 'America/Bogota')::date));

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';

-- -----------------------------------------------------------------------------
\echo 'Alta por nombre de ingrediente'
-- -----------------------------------------------------------------------------

do $$
declare
  r jsonb;
  n integer;
begin
  r := public.operacion_ejecutar(qa_sol('registrar_lote', 0, jsonb_build_object(
    'ingrediente', 'qa-doc harina', 'unidad', 'GR', 'peso_compra', 1000, 'costo_compra', 4000,
    'marca', 'Molino QA', 'vencimiento', (select (valor #>> '{}')::date + 30 from qa where clave = 'hoy'))));
  if r #>> '{resultado,lote,ingrediente}' <> 'QA-DOC HARINA' then
    raise exception 'FALLA: el lote no quedo con el ingrediente por nombre: %', r -> 'resultado';
  end if;
  insert into qa values ('lote', r #> '{resultado,lote}');
  perform public.operacion_ejecutar(qa_sol('registrar_lote', 0, jsonb_build_object(
    'ingrediente', 'QA-DOC HARINA', 'unidad', 'GR', 'peso_compra', 500, 'costo_compra', 2500)));
  reset role;
  select count(*) into n from ingredientes where nombre = 'QA-DOC HARINA';
  set role authenticated;
  if n <> 1 then
    raise exception 'FALLA: el mismo nombre creo % ingredientes', n;
  end if;
  raise notice '  OK    se da de alta por nombre; el ingrediente nuevo entra una sola vez al catálogo';

  if qa_codigo(qa_sol('registrar_lote', 0, jsonb_build_object('unidad', 'GR', 'peso_compra', 1, 'costo_compra', 1))) <> 'invalida' then
    raise exception 'FALLA: se registro un lote sin ingrediente';
  end if;
  raise notice '  OK    sin ingrediente ni id: 422';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo 'Corregir una compra sin reescribirla'
-- -----------------------------------------------------------------------------

do $$
declare
  l jsonb := (select valor from qa where clave = 'lote');
  r jsonb;
begin
  if qa_codigo(qa_sol('corregir_lote', 1, jsonb_build_object('lote_id', l ->> 'id', 'costo_compra', 1,
      'motivo', 'factura'))) <> 'sin_permiso' then
    raise exception 'FALLA: el jefe de obrador corrigio un costo';
  end if;
  raise notice '  OK    el costo solo lo corrige gerencia: 403';

  r := public.operacion_ejecutar(qa_sol('corregir_lote', 1, jsonb_build_object('lote_id', l ->> 'id',
    'marca', 'Molino Nuevo', 'lote_proveedor', 'A-77', 'motivo', 'Error al digitar')));
  if r #>> '{resultado,lote,marca}' <> 'Molino Nuevo' or (r #>> '{resultado,lote,revision}')::int <> 2
     or (r #>> '{resultado,lote,existencia}')::numeric <> 1000 then
    raise exception 'FALLA: la correccion no quedo, o toco la existencia: %', r -> 'resultado';
  end if;
  raise notice '  OK    marca y lote del proveedor corregidos; la existencia no se toca';

  if qa_codigo(qa_sol('corregir_lote', 1, jsonb_build_object('lote_id', l ->> 'id', 'marca', 'X', 'motivo', 'y'))) <> 'conflicto' then
    raise exception 'FALLA: una correccion con revision vieja no respondio 409';
  end if;
  raise notice '  OK    con la revisión vieja: 409';
end $$;

-- Gerencia verificada corrige el costo.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';
do $$
declare
  l jsonb := (select valor from qa where clave = 'lote');
  r jsonb;
begin
  r := public.operacion_ejecutar(qa_sol('corregir_lote', 2, jsonb_build_object('lote_id', l ->> 'id',
    'costo_compra', 5000, 'motivo', 'Factura corregida')));
  if (r #>> '{resultado,lote,costo_compra}')::numeric <> 5000 then
    raise exception 'FALLA: gerencia no pudo corregir el costo: %', r -> 'resultado';
  end if;
  raise notice '  OK    gerencia verificada corrige el costo (5 $/g desde ahora)';
end $$;

-- Se completa la receta, se planea y se confirma para tener un dia real.
reset role;
insert into receta_items (componente_id, ingrediente_id, cantidad, unidad, orden)
select 'ffffffff-0000-0000-0000-0000000000a5', id, 400, 'GR', 1 from ingredientes where nombre = 'QA-DOC HARINA';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  c jsonb;
begin
  perform public.operacion_ejecutar(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000051', 'tandas', 2)));
  c := public.operacion_leer(jsonb_build_object('tipo', 'cotizacion', 'fecha', hoy, 'receta_id', 'ffffffff-0000-0000-0000-000000000051'));
  perform public.operacion_ejecutar(qa_sol('confirmar_receta', (c ->> 'plan_revision')::int, jsonb_build_object(
    'fecha', hoy, 'receta_id', 'ffffffff-0000-0000-0000-000000000051', 'huella', c ->> 'huella')));
  perform public.operacion_ejecutar(qa_sol('fijar_receta', (c ->> 'plan_revision')::int + 1, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000051', 'tandas', 3)));
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo 'El documento de operacion, con la forma del cliente'
-- -----------------------------------------------------------------------------

do $$
declare
  hoy date := (select (valor #>> '{}')::date from qa where clave = 'hoy');
  d jsonb;
  e jsonb;
  p jsonb;
begin
  begin
    perform public.operacion_leer(jsonb_build_object('tipo', 'operacion', 'desde', hoy - 500, 'hasta', hoy));
    raise exception 'FALLA: se acepto un rango de 500 dias';
  exception when sqlstate 'PGRST' then
    raise notice '  OK    un rango de más de 400 días: 422';
  end;

  d := public.operacion_leer(jsonb_build_object('tipo', 'operacion', 'desde', hoy - 7, 'hasta', hoy + 7));
  p := (select x from jsonb_array_elements(d -> 'planes') x where x ->> 'fecha' = hoy::text);
  if p #>> '{entradas,0,recipe,id}' <> 'QA-DOC-R1' or (p #>> '{entradas,0,factor}')::numeric <> 3
     or p #> '{entradas,0,partidas}' <> '[1]'::jsonb then
    raise exception 'FALLA: el plan no tiene la forma del cliente (receta, factor 3, partidas [1]): %', p;
  end if;
  raise notice '  OK    plan: la receta congelada, 3 tandas y la partida que falta, como en el cliente';

  e := d #> '{ejecuciones,0}';
  if e #>> '{entradas,0,recipe,id}' <> 'QA-DOC-R1' or (e #>> '{entradas,0,factor}')::numeric <> 2
     or e #>> '{autor,nombre}' is null then
    raise exception 'FALLA: la ejecucion no tiene la forma del cliente: %', e;
  end if;
  if d::text ~ '"costoCompra"' or d::text ~ '"costeo"' or d::text ~ '"costo_total"' then
    raise exception 'FALLA: el jefe de obrador recibe dinero en el documento';
  end if;
  if not exists (select 1 from jsonb_array_elements(d -> 'lotes') x where x ->> 'codigo' like 'L0%' and x ? 'pesoCompra' and x ? 'fechaCompra')
     or not exists (select 1 from jsonb_array_elements(d -> 'eventos') x where x ->> 'tipo' = 'compra') then
    raise exception 'FALLA: faltan lotes con la forma del cliente o las compras como eventos';
  end if;
  raise notice '  OK    ejecución con su receta y autor; lotes y compras con la forma del cliente; sin dinero para el obrador';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';
do $$
declare
  hoy date := (select (valor #>> '{}')::date from qa where clave = 'hoy');
  d jsonb := public.operacion_leer(jsonb_build_object('tipo', 'operacion', 'desde', hoy, 'hasta', hoy));
begin
  -- 2 tandas x 400 g = 800 g a 5 $/g (costo corregido antes de confirmar) = 4000 $.
  if (d #>> '{ejecuciones,0,costeo,costoTotal}')::numeric <> 4000 then
    raise exception 'FALLA: gerencia no ve el costeo congelado de 4000: %', d #> '{ejecuciones,0,costeo,costoTotal}';
  end if;
  raise notice '  OK    gerencia ve el costeo congelado: 800 g a 5 $/g = 4000 $';
end $$;

reset role;
rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: alta por nombre, correccion y documento, como dicen.'
\echo '==========================================================='
