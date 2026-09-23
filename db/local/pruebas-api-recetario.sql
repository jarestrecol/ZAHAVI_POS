-- =============================================================================
--  PRUEBAS DE LA API: EL RECETARIO CON VERSIONES (0024)
-- =============================================================================
--
--  El recetario se lee y se edita por la API; nada se publica en GitHub. Cada
--  cambio deja una version y lo ya planeado conserva su formula. Reutiliza la
--  semilla de `pruebas.sql` y lo deshace todo al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo '34. El recetario vive en la base, con versiones'
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

-- Una receta del catalogo, para que haya algo que leer.
insert into recetas (id, codigo, nombre, categoria) values
  ('ffffffff-0000-0000-0000-000000000041', 'QA-RC-R1', 'QA-RECETARIO X 5 UND', 'PASTELERÍA');
insert into receta_componentes (id, receta_id, nombre, orden) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-000000000041', 'MASA', 1);
insert into receta_items (componente_id, ingrediente_id, cantidad, unidad, orden) values
  ('ffffffff-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-000000000001', 300, 'GR', 1);

set role authenticated;

-- ---- Operario: lee el recetario, no lo edita ---------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  r jsonb := public.operacion_leer('{"tipo":"recetario"}');
begin
  if jsonb_typeof(r -> 'recetas') <> 'array' or jsonb_typeof(r -> 'ingredientes') <> 'array'
     or not exists (select 1 from jsonb_array_elements(r -> 'recetas') x where x ? 'componentes' and x ? 'revision') then
    raise exception 'FALLA: el recetario no llega en la forma de recipes.json: %', left(r::text, 300);
  end if;
  if qa_codigo(qa_sol('guardar_receta', 0, '{"nombre":"X","categoria":"PANADERÍA","componentes":[]}')) <> 'sin_permiso' then
    raise exception 'FALLA: el operario edito el recetario';
  end if;
  raise notice '  OK    el operario lee el recetario en la forma de recipes.json, y no lo edita: 403';
end $$;

-- ---- Jefe de obrador: crea, edita, desactiva ---------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
do $$
declare
  r jsonb;
begin
  begin
    insert into recetas (codigo, nombre, categoria) values ('QA-DIRECTA', 'QA', 'PANADERÍA');
    raise exception 'FALLA: el jefe de obrador escribio una receta saltandose la API';
  exception when insufficient_privilege then
    raise notice '  OK    nadie escribe el recetario directamente en la tabla';
  end;

  if qa_codigo(qa_sol('guardar_receta', 0, '{"nombre":"QA PAN","categoria":"PANADERÍA",
      "componentes":[{"nombre":"MASA","items":[{"ingrediente":"QA-TEST-HARINA","cantidad":0,"unidad":"GR"}]}]}')) <> 'invalida'
     or qa_codigo(qa_sol('guardar_receta', 0, '{"nombre":"QA PAN","categoria":"POSTRES",
      "componentes":[{"nombre":"MASA","items":[{"ingrediente":"QA-TEST-HARINA","cantidad":1,"unidad":"GR"}]}]}')) <> 'invalida'
     or qa_codigo(qa_sol('guardar_receta', 0, '{"nombre":"QA PAN","categoria":"PANADERÍA","componentes":"no"}')) <> 'invalida' then
    raise exception 'FALLA: se acepto una receta con cantidad cero, categoria inexistente o sin lista de componentes';
  end if;
  raise notice '  OK    cantidad cero, categoría inexistente o componentes mal formados: 422';

  r := public.operacion_ejecutar(qa_sol('guardar_receta', 0, jsonb_build_object(
    'nombre', 'qa pan nuevo x 12 und', 'categoria', 'PANADERÍA', 'metodo', E'Amasar.\n\nHornear 20 min.',
    'componentes', jsonb_build_array(jsonb_build_object('nombre', 'masa', 'items', jsonb_build_array(
      jsonb_build_object('ingrediente', 'QA-TEST-HARINA', 'cantidad', 500, 'unidad', 'GR'),
      jsonb_build_object('ingrediente', 'qa-sal nueva', 'cantidad', 10.5, 'unidad', 'gr')))))));
  if r #>> '{resultado,receta,nombre}' <> 'QA PAN NUEVO X 12 UND' or (r #>> '{resultado,receta,revision}')::int <> 1
     or r #>> '{resultado,receta,metodo}' <> E'Amasar.\n\nHornear 20 min.'
     or r #>> '{resultado,receta,componentes,0,items,1,ingrediente}' <> 'QA-SAL NUEVA' then
    raise exception 'FALLA: la receta nueva no quedo como se pidio: %', r -> 'resultado';
  end if;
  insert into qa values ('receta', r #> '{resultado,receta}');
  raise notice '  OK    receta nueva: código %, revisión 1, método con sus saltos de línea e ingrediente nuevo en el catálogo',
    r #>> '{resultado,receta,id}';
end $$;

-- Se planea con la version 1: lo planeado debe conservarla.
do $$
declare
  v jsonb := (select valor from qa where clave = 'receta');
begin
  perform public.operacion_ejecutar(qa_sol('fijar_receta', 0, jsonb_build_object(
    'fecha', (now() at time zone 'America/Bogota')::date + 7, 'receta_id', v ->> 'receta_id', 'tandas', 1)));
end $$;

do $$
declare
  v jsonb := (select valor from qa where clave = 'receta');
  r jsonb;
begin
  r := public.operacion_ejecutar(qa_sol('guardar_receta', 1, jsonb_build_object(
    'receta_id', v ->> 'receta_id', 'nombre', 'QA PAN NUEVO X 12 UND', 'categoria', 'PANADERÍA', 'motivo', 'Más harina',
    'componentes', jsonb_build_array(jsonb_build_object('nombre', 'MASA', 'items', jsonb_build_array(
      jsonb_build_object('ingrediente', 'QA-TEST-HARINA', 'cantidad', 650, 'unidad', 'GR')))))));
  if (r #>> '{resultado,receta,revision}')::int <> 2 or (r #>> '{resultado,receta,componentes,0,items,0,cantidad}')::numeric <> 650 then
    raise exception 'FALLA: la edicion no dejo revision 2 con 650 g: %', r -> 'resultado';
  end if;
  raise notice '  OK    editarla deja la revisión 2 con la fórmula nueva';

  if qa_codigo(qa_sol('guardar_receta', 1, jsonb_build_object('receta_id', v ->> 'receta_id', 'nombre', 'OTRA',
      'categoria', 'PANADERÍA', 'componentes', v -> 'componentes'))) <> 'conflicto' then
    raise exception 'FALLA: otro editor con la revision 1 piso la receta';
  end if;
  raise notice '  OK    otro editor con la revisión vieja: 409';

  r := public.operacion_leer(jsonb_build_object('tipo', 'versiones_receta', 'receta_id', v ->> 'receta_id'));
  if jsonb_array_length(r -> 'versiones') <> 2
     or (r #>> '{versiones,1,contenido,componentes,0,items,0,cantidad}')::numeric <> 500 then
    raise exception 'FALLA: el historial no conserva las 2 versiones con su formula: %', r;
  end if;
  raise notice '  OK    el historial conserva las 2 versiones, cada una con su fórmula';

  r := public.operacion_leer(jsonb_build_object('tipo', 'dia', 'fecha', (now() at time zone 'America/Bogota')::date + 7));
  if not exists (select 1 from plan_partidas p where p.receta_id = (v ->> 'receta_id')::uuid
                  and (p.receta #>> '{componentes,0,items,0,cantidad}')::numeric = 500) then
    raise exception 'FALLA: editar la receta cambio lo ya planeado';
  end if;
  raise notice '  OK    lo ya planeado sigue con la fórmula con que se planeó (500 g)';

  r := public.operacion_ejecutar(qa_sol('activar_receta', 2, jsonb_build_object('receta_id', v ->> 'receta_id',
    'activa', false, 'motivo', 'Ya no se produce')));
  if (select count(*) from jsonb_array_elements(public.operacion_leer('{"tipo":"recetario"}') -> 'recetas') x
       where x ->> 'receta_id' = v ->> 'receta_id') <> 0
     or (select count(*) from jsonb_array_elements(public.operacion_leer('{"tipo":"recetario","incluir_inactivas":true}') -> 'recetas') x
       where x ->> 'receta_id' = v ->> 'receta_id') <> 1 then
    raise exception 'FALLA: la receta desactivada sigue en el recetario, o desaparecio del todo';
  end if;
  raise notice '  OK    desactivarla la saca del recetario sin borrarla';
end $$;

reset role;
rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: el recetario por la API se comporta como dice.'
\echo '==========================================================='
