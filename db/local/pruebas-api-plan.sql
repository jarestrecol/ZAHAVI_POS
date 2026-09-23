-- =============================================================================
--  PRUEBAS DE LA API: PLAN DEL DIA Y PREPARACIONES (0020)
-- =============================================================================
--
--  Mismo metodo que `pruebas-api.sql`: se llama a la API con el rol y la sesion
--  de cada persona. Reutiliza la semilla de `pruebas.sql` y lo deshace todo.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo 'Probando la API del plan (0020)'
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

--  Arma una solicitud con un id nuevo: cada intencion del usuario, el suyo.
create function qa_sol(p_accion text, p_revision integer, p_datos jsonb) returns jsonb
language sql volatile set search_path = public, pg_temp as $$
  select jsonb_build_object('id', gen_random_uuid(), 'accion', p_accion, 'revision', p_revision, 'datos', p_datos)
$$;
grant execute on function qa_sol(text, integer, jsonb) to authenticated;

create temp table qa (clave text primary key, valor jsonb);
grant all on qa to authenticated;

-- Dos recetas reales en forma: una de pan (area del operario) y una de galletas.
insert into recetas (id, codigo, nombre, categoria) values
  ('ffffffff-0000-0000-0000-000000000011', 'QA-PL-R1', 'QA-PAN X 10 UND', 'PANADERÍA'),
  ('ffffffff-0000-0000-0000-000000000012', 'QA-PL-R2', 'QA-GALLETA X 20 UND', 'GALLETAS');
insert into receta_componentes (id, receta_id, nombre, orden) values
  ('ffffffff-0000-0000-0000-0000000000c1', 'ffffffff-0000-0000-0000-000000000011', 'MASA', 1),
  ('ffffffff-0000-0000-0000-0000000000c2', 'ffffffff-0000-0000-0000-000000000012', 'MASA', 1);
insert into receta_items (componente_id, ingrediente_id, cantidad, unidad, orden) values
  ('ffffffff-0000-0000-0000-0000000000c1', 'bbbbbbbb-0000-0000-0000-000000000001', 500, 'GR', 1),
  ('ffffffff-0000-0000-0000-0000000000c2', 'bbbbbbbb-0000-0000-0000-000000000001', 200, 'GR', 1);
update perfiles set area = 'PANADERÍA' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into qa values
  ('hoy', to_jsonb((now() at time zone 'America/Bogota')::date)),
  ('manana', to_jsonb((now() at time zone 'America/Bogota')::date + 1));

set role authenticated;

-- -----------------------------------------------------------------------------
\echo '24. Planear: tandas, partidas y revision'
-- -----------------------------------------------------------------------------

-- Operario: no planea.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';
do $$
begin
  if qa_codigo(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', (select valor from qa where clave = 'hoy'),
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 1))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario pudo planear';
  end if;
  raise notice '  OK    el operario no planea: 403';
end $$;

-- Jefe de obrador.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  r jsonb;
begin
  r := public.operacion_ejecutar(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 2)));
  if (r #>> '{resultado,plan,revision}')::int <> 1 or (r #>> '{resultado,plan,recetas,0,pendiente}')::numeric <> 2
     or r #>> '{resultado,plan,recetas,0,estado}' <> 'pendiente' then
    raise exception 'FALLA: el plan nuevo no quedo en revision 1 con 2 tandas pendientes: %', r -> 'resultado';
  end if;
  raise notice '  OK    plan nuevo: revisión 1, 2 tandas pendientes';

  if qa_codigo(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 3))) <> 'conflicto' then
    raise exception 'FALLA: otra pantalla con la revision 0 piso el plan';
  end if;
  raise notice '  OK    otra pantalla con la revisión vieja: 409';

  if qa_codigo(qa_sol('fijar_receta', 1, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 0.04))) <> 'invalida'
     or qa_codigo(qa_sol('fijar_receta', 1, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 2.0005))) <> 'invalida' then
    raise exception 'FALLA: se aceptaron tandas fuera de rango o con cuatro decimales';
  end if;
  raise notice '  OK    menos de 0,05 tandas o cuatro decimales: 422';

  if qa_codigo(qa_sol('fijar_receta', 1, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 1.5, 'partidas', jsonb_build_array(1, 0.4)))) <> 'invalida' then
    raise exception 'FALLA: se aceptaron partidas que no suman lo pendiente';
  end if;
  r := public.operacion_ejecutar(qa_sol('fijar_receta', 1, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 1.5, 'partidas', jsonb_build_array(1, 0.5))));
  if (r #>> '{resultado,plan,revision}')::int <> 2 or r #> '{resultado,plan,recetas,0,partidas}' <> '[1, 0.5]'::jsonb then
    raise exception 'FALLA: las partidas no quedaron [1, 0.5] en revision 2: %', r -> 'resultado';
  end if;
  raise notice '  OK    1,5 tandas en partidas de 1 y 0,5; las que no suman: 422';
end $$;

-- Se edita el recetario: el plan conserva la formula que se planeo.
reset role;
update receta_items set cantidad = 999 where componente_id = 'ffffffff-0000-0000-0000-0000000000c1';
do $$
begin
  if exists (select 1 from plan_partidas where receta_id = 'ffffffff-0000-0000-0000-000000000011'
              and (receta #>> '{componentes,0,items,0,cantidad}')::numeric <> 500) then
    raise exception 'FALLA: editar la receta cambio lo ya planeado';
  end if;
  raise notice '  OK    editar la receta no cambia la fórmula congelada del plan';
end $$;

-- Se simula que la primera partida ya se produjo (la confirmacion llega en 0021).
insert into ejecuciones (id, sede_id, fecha, plan_revision, receta_id, responsable, motivo, autor_id, costo_total, costeo)
values ('99999999-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
        (now() at time zone 'America/Bogota')::date, 2, 'ffffffff-0000-0000-0000-000000000011',
        'QA', 'prueba', 'aaaaaaaa-0000-0000-0000-000000000002', 0, '{}');
update plan_partidas set ejecucion_id = '99999999-0000-0000-0000-000000000011'
 where receta_id = 'ffffffff-0000-0000-0000-000000000011' and tandas = 1;
set role authenticated;

do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  r jsonb;
begin
  if qa_codigo(qa_sol('fijar_receta', 2, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 0.5))) <> 'invalida' then
    raise exception 'FALLA: se quitaron tandas ya producidas';
  end if;
  if qa_codigo(qa_sol('fijar_receta', 2, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 1.02))) <> 'invalida' then
    raise exception 'FALLA: se acepto una produccion adicional de 0,02 tandas';
  end if;
  raise notice '  OK    no se quita lo producido, ni se añade menos de 0,05';

  r := public.operacion_ejecutar(qa_sol('fijar_receta', 2, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 3)));
  if (r #>> '{resultado,plan,recetas,0,producido}')::numeric <> 1 or (r #>> '{resultado,plan,recetas,0,pendiente}')::numeric <> 2 then
    raise exception 'FALLA: 3 tandas con 1 producida no dejan 2 pendientes: %', r -> 'resultado';
  end if;
  insert into qa values ('rev', r #> '{resultado,plan,revision}');
  raise notice '  OK    subir a 3 tandas con 1 producida deja 2 pendientes';
end $$;

-- Un dia sin recetas y sin produccion no deja plan.
do $$
declare
  manana jsonb := (select valor from qa where clave = 'manana');
  r jsonb;
begin
  r := public.operacion_ejecutar(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', manana,
    'receta_id', 'ffffffff-0000-0000-0000-000000000012', 'tandas', 1)));
  r := public.operacion_ejecutar(qa_sol('fijar_receta', 1, jsonb_build_object('fecha', manana,
    'receta_id', 'ffffffff-0000-0000-0000-000000000012', 'tandas', 0)));
  if r #> '{resultado,plan}' <> 'null'::jsonb then
    raise exception 'FALLA: quitar la unica receta dejo un plan vacio';
  end if;
  raise notice '  OK    quitar la única receta de un día sin producción elimina el plan';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '25. Preparar: asignar, empezar y dejar'
-- -----------------------------------------------------------------------------

do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  rev int := (select valor::int from qa where clave = 'rev');
  r jsonb;
begin
  -- Galletas en el plan, para probar el area.
  perform public.operacion_ejecutar(qa_sol('fijar_receta', rev, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000012', 'tandas', 1)));
  if qa_codigo(qa_sol('asignar_preparacion', 0, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000012', 'persona_id', 'aaaaaaaa-0000-0000-0000-000000000001'))) <> 'invalida' then
    raise exception 'FALLA: se asigno galletas a alguien de panaderia';
  end if;
  raise notice '  OK    no se asigna a alguien de otra área';

  r := public.operacion_ejecutar(qa_sol('asignar_preparacion', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'persona_id', 'aaaaaaaa-0000-0000-0000-000000000001')));
  if r #>> '{resultado,receta,preparacion,asignado,id}' <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'FALLA: la asignacion no quedo: %', r -> 'resultado';
  end if;
  raise notice '  OK    el pan queda asignado al operario de panadería';
end $$;

-- Operario: trabaja lo suyo y nada mas.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
do $$
declare
  hoy jsonb := (select valor from qa where clave = 'hoy');
  r jsonb;
begin
  if qa_codigo(qa_sol('iniciar_preparacion', 0, jsonb_build_object('fecha', hoy,
      'receta_id', 'ffffffff-0000-0000-0000-000000000012'))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario empezo una receta que no es suya';
  end if;
  raise notice '  OK    el operario no empieza lo que no tiene asignado: 403';

  r := public.operacion_ejecutar(qa_sol('iniciar_preparacion', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011')));
  if r #>> '{resultado,receta,estado}' <> 'en_preparacion' then
    raise exception 'FALLA: empezar no dejo la receta en preparacion: %', r -> 'resultado';
  end if;
  r := public.operacion_ejecutar(qa_sol('iniciar_preparacion', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011')));
  if r #>> '{resultado,receta,estado}' <> 'en_preparacion' then
    raise exception 'FALLA: empezar dos veces cambio el estado';
  end if;
  raise notice '  OK    empieza la suya; empezarla otra vez no cambia nada';

  r := public.operacion_ejecutar(qa_sol('cancelar_preparacion', 0, jsonb_build_object('fecha', hoy,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011')));
  if r #>> '{resultado,receta,estado}' <> 'pendiente' or r #>> '{resultado,receta,preparacion,asignado,id}' is null then
    raise exception 'FALLA: dejar la receta no la devolvio a pendiente conservando la asignacion';
  end if;
  raise notice '  OK    dejarla la vuelve pendiente y conserva la asignación';

  r := public.operacion_leer(jsonb_build_object('tipo', 'dia', 'fecha', hoy));
  if jsonb_array_length(r #> '{plan,recetas}') <> 2 then
    raise exception 'FALLA: la consulta del dia no trae las 2 recetas: %', r;
  end if;
  raise notice '  OK    la consulta del día trae el plan con sus 2 recetas y su estado';
end $$;

-- Un dia que aun no llega no se empieza.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
do $$
declare
  manana jsonb := (select valor from qa where clave = 'manana');
begin
  perform public.operacion_ejecutar(qa_sol('fijar_receta', 0, jsonb_build_object('fecha', manana,
    'receta_id', 'ffffffff-0000-0000-0000-000000000011', 'tandas', 1)));
  if qa_codigo(qa_sol('iniciar_preparacion', 0, jsonb_build_object('fecha', manana,
      'receta_id', 'ffffffff-0000-0000-0000-000000000011'))) <> 'invalida' then
    raise exception 'FALLA: se empezo la produccion de un dia futuro';
  end if;
  raise notice '  OK    no se empieza la producción de mañana';
end $$;

reset role;
rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: el plan por la API se comporta como dice.'
\echo '==========================================================='
