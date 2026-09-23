-- =============================================================================
--  PRUEBAS DE LA API: CONFIRMAR UNA RECETA (0021)
-- =============================================================================
--
--  El escenario se arma por la propia API (lotes, plan, asignacion) y se
--  confirma como lo haria el operario asignado. Las cifras esperadas estan
--  calculadas a mano en cada comentario. Todo se deshace al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo 'Probando la confirmacion (0021)'
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

-- Catalogo propio: una harina solo para esta prueba y el agua de proceso.
insert into ingredientes (id, nombre, unidad_base) values
  ('bbbbbbbb-0000-0000-0000-0000000000a1', 'QA-HARINA-CONF', 'GR'),
  ('bbbbbbbb-0000-0000-0000-0000000000a2', 'AGUA', 'ML');
-- 600 g de harina y 300 ml de agua por tanda.
insert into recetas (id, codigo, nombre, categoria) values
  ('ffffffff-0000-0000-0000-000000000021', 'QA-CF-R1', 'QA-PAN CONF X 10 UND', 'PANADERÍA'),
  ('ffffffff-0000-0000-0000-000000000022', 'QA-CF-R2', 'QA-PAN GIGANTE X 1 UND', 'PANADERÍA');
insert into receta_componentes (id, receta_id, nombre, orden) values
  ('ffffffff-0000-0000-0000-0000000000d1', 'ffffffff-0000-0000-0000-000000000021', 'MASA', 1),
  ('ffffffff-0000-0000-0000-0000000000d2', 'ffffffff-0000-0000-0000-000000000022', 'MASA', 1);
insert into receta_items (componente_id, ingrediente_id, cantidad, unidad, orden) values
  ('ffffffff-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000a1', 600, 'GR', 1),
  ('ffffffff-0000-0000-0000-0000000000d1', 'bbbbbbbb-0000-0000-0000-0000000000a2', 300, 'ML', 2),
  ('ffffffff-0000-0000-0000-0000000000d2', 'bbbbbbbb-0000-0000-0000-0000000000a1', 5000, 'GR', 1);
update perfiles set area = 'PANADERÍA' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into qa values ('hoy', to_jsonb((now() at time zone 'America/Bogota')::date));

set role authenticated;

-- Jefe de obrador: dos lotes, el plan y la asignacion.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  hoy date := (select (valor #>> '{}')::date from qa where clave = 'hoy');
  r jsonb;
begin
  -- A: 1000 g a 2 $/g, vence en 10 dias. B: 1000 g a 3 $/g, vence en 20.
  r := public.operacion_ejecutar(qa_sol('registrar_lote', 0, jsonb_build_object(
    'ingrediente_id', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'unidad', 'GR', 'peso_compra', 1000,
    'costo_compra', 2000, 'vencimiento', hoy + 10)));
  insert into qa values ('lote_a', r #> '{resultado,lote}');
  r := public.operacion_ejecutar(qa_sol('registrar_lote', 0, jsonb_build_object(
    'ingrediente_id', 'bbbbbbbb-0000-0000-0000-0000000000a1', 'unidad', 'GR', 'peso_compra', 1000,
    'costo_compra', 3000, 'vencimiento', hoy + 20)));
  insert into qa values ('lote_b', r #> '{resultado,lote}');

  r := public.operacion_ejecutar(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000021', 'tandas', 2)));
  r := public.operacion_ejecutar(qa_sol('fijar_receta', 1, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000022', 'tandas', 1)));
  perform public.operacion_ejecutar(qa_sol('asignar_preparacion', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000021', 'persona_id', 'aaaaaaaa-0000-0000-0000-000000000001')));
  insert into qa values ('rev', r #> '{resultado,plan,revision}');
end $$;

-- -----------------------------------------------------------------------------
\echo '26. Cotizar: lo que se ensena antes de confirmar'
-- -----------------------------------------------------------------------------

-- Gerencia ve el costo: 2 tandas = 1200 g -> 1000 g de A (2000 $) + 200 g de B (600 $).
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';
do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  r jsonb := public.operacion_leer(jsonb_build_object('tipo', 'cotizacion', 'fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000021'));
begin
  if (r #>> '{costeo,costoTotal}')::numeric <> 2600 or not (r ->> 'listo')::boolean then
    raise exception 'FALLA: la cotizacion deberia costar 2600 y estar lista: %', r;
  end if;
  if (select count(*) from jsonb_array_elements(r #> '{costeo,lineas}') l where (l ->> 'servicio')::boolean) <> 1 then
    raise exception 'FALLA: el agua no salio como agua de proceso';
  end if;
  raise notice '  OK    2 tandas: 1000 g del lote que vence antes y 200 g del otro = 2600 $; el agua, sin bodega';
end $$;

-- El operario asignado ve la cotizacion, sin dinero.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  r jsonb := public.operacion_leer(jsonb_build_object('tipo', 'cotizacion', 'fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000021'));
begin
  if r::text ~ '"costo' or r::text ~ 'precio' then
    raise exception 'FALLA: el operario ve dinero en la cotizacion: %', r;
  end if;
  insert into qa values ('huella', r -> 'huella'), ('rev_cot', r -> 'plan_revision');
  raise notice '  OK    el operario ve la cotización con su huella, sin costos ni precios';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '27. Confirmar: todo o nada'
-- -----------------------------------------------------------------------------

do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  rev int := (select valor::int from qa where clave = 'rev_cot');
  s jsonb;
  r1 jsonb;
  r2 jsonb;
begin
  if qa_codigo(qa_sol('confirmar_receta', rev, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000021', 'huella', 'ffffffffffffffffffffffffffffffff'))) <> 'conflicto' then
    raise exception 'FALLA: se confirmo con un costeo que no es el que se vio';
  end if;
  raise notice '  OK    con una huella que no es la del costeo actual: 409, nada se descuenta';

  if qa_codigo(qa_sol('confirmar_receta', rev, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000022', 'huella', 'x'))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario confirmo una receta que no es suya';
  end if;
  raise notice '  OK    el operario no confirma lo que no tiene asignado: 403';

  s := qa_sol('confirmar_receta', rev, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000021', 'huella', (select valor from qa where clave = 'huella')));
  r1 := public.operacion_ejecutar(s);
  if r1 #>> '{resultado,receta,estado}' <> 'lista' or r1::text ~ '"costo' then
    raise exception 'FALLA: la confirmacion no dejo la receta lista, o le mostro dinero al operario: %', r1;
  end if;
  insert into qa values ('ejecucion', r1 #> '{resultado,ejecucion_id}');
  raise notice '  OK    confirmada: la receta queda lista y el operario no ve el costo';

  r2 := public.operacion_ejecutar(s);
  if not (r2 ->> 'repetida')::boolean or r2 #> '{resultado,ejecucion_id}' <> r1 #> '{resultado,ejecucion_id}' then
    raise exception 'FALLA: el doble toque creo otra confirmacion';
  end if;
  raise notice '  OK    el doble toque devuelve la misma confirmación';

  if qa_codigo(qa_sol('confirmar_receta', rev + 1, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000021', 'huella', (select valor from qa where clave = 'huella')))) <> 'invalida' then
    raise exception 'FALLA: se confirmo dos veces la misma receta con otra solicitud';
  end if;
  raise notice '  OK    otra solicitud para la misma receta ya lista: 422, sin doble consumo';
end $$;

-- Faltantes: el pan gigante pide 5000 g y quedan 800. Nada se toca.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  c jsonb := public.operacion_leer(jsonb_build_object('tipo', 'cotizacion', 'fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000022'));
begin
  if (c ->> 'listo')::boolean then
    raise exception 'FALLA: la cotizacion con faltantes se marco lista';
  end if;
  if qa_codigo(qa_sol('confirmar_receta', (c ->> 'plan_revision')::int, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000022', 'huella', c ->> 'huella'))) <> 'invalida' then
    raise exception 'FALLA: se confirmo una receta con faltantes';
  end if;
  raise notice '  OK    con faltantes no se confirma: 422';

  if qa_codigo(qa_sol('fijar_receta', (c ->> 'plan_revision')::int, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000021', 'tandas', 1))) <> 'invalida' then
    raise exception 'FALLA: se quitaron del plan tandas ya confirmadas';
  end if;
  raise notice '  OK    y lo confirmado ya no se puede quitar del plan';
end $$;

reset role;

-- -----------------------------------------------------------------------------
\echo ''
\echo '28. Lo que quedo en la base'
-- -----------------------------------------------------------------------------

do $$
declare
  a uuid := (select (valor ->> 'id')::uuid from qa where clave = 'lote_a');
  b uuid := (select (valor ->> 'id')::uuid from qa where clave = 'lote_b');
  e uuid := (select (valor #>> '{}')::uuid from qa where clave = 'ejecucion');
  n integer;
begin
  if (select existencia from lotes where id = a) <> 0 or (select existencia from lotes where id = b) <> 800 then
    raise exception 'FALLA: saldos esperados A=0 y B=800, y son A=% B=%',
      (select existencia from lotes where id = a), (select existencia from lotes where id = b);
  end if;
  raise notice '  OK    saldos: el lote A queda en 0 y el B en 800 g';

  if exists (select 1 from lotes l where l.id in (a, b)
              and l.existencia <> (select sum(cantidad) from movimientos m where m.lote_id = l.id)) then
    raise exception 'FALLA: el saldo no es la suma del libro tras confirmar';
  end if;
  raise notice '  OK    y cada saldo sigue siendo la suma de su libro';

  if (select costo_total from ejecuciones where id = e) <> 2600
     or (select count(*) from ejecucion_consumos where ejecucion_id = e) <> 2
     or (select sum(costo) from ejecucion_consumos where ejecucion_id = e) <> 2600
     or (select count(*) from movimientos where ejecucion_id = e) <> 2 then
    raise exception 'FALLA: la ejecucion no quedo con costo 2600, 2 consumos y 2 salidas';
  end if;
  raise notice '  OK    una ejecución: 2600 $ congelados, 2 consumos y 2 salidas del libro';

  select count(*) into n from ejecuciones where receta_id = 'ffffffff-0000-0000-0000-000000000021';
  if n <> 1 then
    raise exception 'FALLA: hay % ejecuciones de la misma receta', n;
  end if;
  if exists (select 1 from plan_partidas where receta_id = 'ffffffff-0000-0000-0000-000000000021' and ejecucion_id is null) then
    raise exception 'FALLA: quedaron partidas pendientes de una receta confirmada';
  end if;
  raise notice '  OK    una sola ejecución de la receta, y sus partidas marcadas como producidas';
end $$;

rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: la confirmacion se comporta como dice.'
\echo '==========================================================='
