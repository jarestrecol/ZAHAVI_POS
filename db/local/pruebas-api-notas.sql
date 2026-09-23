-- =============================================================================
--  PRUEBAS DE LA API: NOTAS, RESULTADOS Y METAS (0022)
-- =============================================================================
--
--  Se llama a la API con el rol y la sesion de cada persona. Reutiliza la
--  semilla de `pruebas.sql` y lo deshace todo al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo 'Probando notas, resultados y metas (0022)'
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

-- Una confirmacion ya hecha por el operario (autor), de una receta que rinde
-- "X 10 UND" y se produjo en 2 tandas: se esperan 20 unidades.
insert into recetas (id, codigo, nombre, categoria) values
  ('ffffffff-0000-0000-0000-000000000031', 'QA-NT-R1', 'QA-PAN NOTAS X 10 UND', 'PANADERÍA'),
  ('ffffffff-0000-0000-0000-000000000032', 'QA-NT-R2', 'QA-BAGUEL X 32 UND O 8 PAQ', 'PANADERÍA');
insert into ejecuciones (id, sede_id, fecha, plan_revision, area, receta_id, responsable, motivo, autor_id, costo_total, costeo) values
  ('99999999-0000-0000-0000-000000000031', '11111111-1111-1111-1111-111111111111', current_date, 1, 'PANADERÍA',
   'ffffffff-0000-0000-0000-000000000031', 'Operario QA', 'Receta preparada', 'aaaaaaaa-0000-0000-0000-000000000001', 1500, '{}'),
  ('99999999-0000-0000-0000-000000000032', '11111111-1111-1111-1111-111111111111', current_date, 1, 'PANADERÍA',
   'ffffffff-0000-0000-0000-000000000032', 'Obrador QA', 'Receta preparada', 'aaaaaaaa-0000-0000-0000-000000000002', 900, '{}');
insert into ejecucion_partidas (ejecucion_id, receta_id, partida, tandas, receta) values
  ('99999999-0000-0000-0000-000000000031', 'ffffffff-0000-0000-0000-000000000031', 1, 2,
   '{"id":"QA-NT-R1","nombre":"QA-PAN NOTAS X 10 UND","categoria":"PANADERÍA"}'),
  ('99999999-0000-0000-0000-000000000032', 'ffffffff-0000-0000-0000-000000000032', 1, 1,
   '{"id":"QA-NT-R2","nombre":"QA-BAGUEL X 32 UND O 8 PAQ","categoria":"PANADERÍA"}');

set role authenticated;

-- -----------------------------------------------------------------------------
\echo '29. Notas: el jefe escribe; quien la tiene asignada solo la marca'
-- -----------------------------------------------------------------------------

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  r jsonb;
begin
  if qa_codigo(qa_sol('guardar_nota', 0, jsonb_build_object('fecha', current_date, 'tipo', 'tarea',
      'texto', 'x', 'area', 'PANADERÍA', 'persona_id', 'aaaaaaaa-0000-0000-0000-000000000001'))) <> 'invalida' then
    raise exception 'FALLA: una nota para un area y una persona a la vez se acepto';
  end if;
  raise notice '  OK    una nota no va a un área y a una persona a la vez';

  r := public.operacion_ejecutar(qa_sol('guardar_nota', 0, jsonb_build_object('fecha', current_date, 'tipo', 'tarea',
    'texto', '  Limpiar   el horno  ', 'persona_id', 'aaaaaaaa-0000-0000-0000-000000000001')));
  if r #>> '{resultado,nota,texto}' <> 'Limpiar el horno' or (r #>> '{resultado,nota,revision}')::int <> 1 then
    raise exception 'FALLA: la nota no quedo limpia en revision 1: %', r -> 'resultado';
  end if;
  insert into qa values ('nota', r #> '{resultado,nota}');

  r := public.operacion_ejecutar(qa_sol('guardar_nota', 0, jsonb_build_object('fecha', current_date,
    'tipo', 'felicitacion', 'texto', 'Buen trabajo', 'hecha', true)));
  if (r #>> '{resultado,nota,hecha}')::boolean then
    raise exception 'FALLA: una felicitacion quedo marcada como hecha';
  end if;
  raise notice '  OK    el jefe asigna una tarea; una felicitación nunca queda «hecha»';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
do $$
declare
  n jsonb := (select valor from qa where clave = 'nota');
  r jsonb;
begin
  if qa_codigo(qa_sol('guardar_nota', 0, jsonb_build_object('fecha', current_date, 'tipo', 'tarea', 'texto', 'mia'))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario escribio una nota';
  end if;
  if qa_codigo(qa_sol('guardar_nota', 1, jsonb_build_object('id', n ->> 'id', 'fecha', current_date, 'tipo', 'tarea',
      'texto', 'Otro texto', 'persona_id', n #>> '{persona,id}', 'hecha', true))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario cambio el texto de su nota';
  end if;
  raise notice '  OK    el operario no escribe notas ni cambia el texto de la suya: 403';

  r := public.operacion_ejecutar(qa_sol('guardar_nota', 1, jsonb_build_object('id', n ->> 'id', 'fecha', current_date,
    'tipo', 'tarea', 'texto', 'Limpiar el horno', 'persona_id', n #>> '{persona,id}', 'hecha', true)));
  if not (r #>> '{resultado,nota,hecha}')::boolean or r #>> '{resultado,nota,cambiada_por,id}' <> 'aaaaaaaa-0000-0000-0000-000000000001' then
    raise exception 'FALLA: el operario no pudo marcar su tarea: %', r -> 'resultado';
  end if;
  raise notice '  OK    y marca hecha la suya, quedando como quien la cambió';

  if qa_codigo(qa_sol('guardar_nota', 1, jsonb_build_object('id', n ->> 'id', 'fecha', current_date,
      'tipo', 'tarea', 'texto', 'Limpiar el horno', 'persona_id', n #>> '{persona,id}', 'hecha', false))) <> 'conflicto' then
    raise exception 'FALLA: un cambio con la revision vieja de la nota no respondio 409';
  end if;
  raise notice '  OK    otra pestaña con la revisión vieja de la nota: 409';

  r := public.operacion_leer(jsonb_build_object('tipo', 'notas', 'fecha', current_date));
  if jsonb_array_length(r -> 'notas') <> 2 or r #>> '{notas,0,tipo}' <> 'tarea' then
    raise exception 'FALLA: las notas del dia no salen en el orden del panel: %', r;
  end if;
  raise notice '  OK    las notas del día salen en el orden del panel';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '30. Resultados: lo esperado sale del nombre, las perdidas piden motivo'
-- -----------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  if qa_codigo(qa_sol('guardar_resultado', 0, jsonb_build_object('ejecucion_id', '99999999-0000-0000-0000-000000000031',
      'receta_id', 'ffffffff-0000-0000-0000-000000000031', 'vendible', 18, 'rechazado', 2))) <> 'invalida' then
    raise exception 'FALLA: un rechazo sin motivo se acepto';
  end if;
  raise notice '  OK    rechazo sin motivo: 422';

  r := public.operacion_ejecutar(qa_sol('guardar_resultado', 0, jsonb_build_object(
    'ejecucion_id', '99999999-0000-0000-0000-000000000031', 'receta_id', 'ffffffff-0000-0000-0000-000000000031',
    'vendible', 18, 'rechazado', 2, 'unidad', 'KG', 'esperado', 999, 'motivo', 'Dos quemados')));
  if (r #>> '{resultado,resultado,esperado}')::numeric <> 20 or r #>> '{resultado,resultado,unidad}' <> 'UND' then
    raise exception 'FALLA: lo esperado no salio del nombre (2 tandas x 10 UND): %', r -> 'resultado';
  end if;
  raise notice '  OK    «X 10 UND» en 2 tandas: se esperan 20 UND, aunque la pantalla diga otra cosa';

  if qa_codigo(qa_sol('guardar_resultado', 1, jsonb_build_object('ejecucion_id', '99999999-0000-0000-0000-000000000031',
      'receta_id', 'ffffffff-0000-0000-0000-000000000031', 'vendible', 19, 'rechazado', 1, 'motivo', 'corrijo'))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario corrigio un resultado ya registrado';
  end if;
  if qa_codigo(qa_sol('guardar_resultado', 0, jsonb_build_object('ejecucion_id', '99999999-0000-0000-0000-000000000032',
      'receta_id', 'ffffffff-0000-0000-0000-000000000032', 'vendible', 30, 'rechazado', 0, 'unidad', 'UND'))) <> 'sin_permiso' then
    raise exception 'FALLA: el operario registro el resultado de otra persona';
  end if;
  raise notice '  OK    el operario registra el suyo una vez; corregir o el de otro es del jefe';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
do $$
declare
  r jsonb;
begin
  if qa_codigo(qa_sol('guardar_resultado', 0, jsonb_build_object('ejecucion_id', '99999999-0000-0000-0000-000000000032',
      'receta_id', 'ffffffff-0000-0000-0000-000000000032', 'vendible', 30, 'rechazado', 0))) <> 'invalida' then
    raise exception 'FALLA: «X 32 UND O 8 PAQ» se acepto sin elegir medida';
  end if;
  r := public.operacion_ejecutar(qa_sol('guardar_resultado', 0, jsonb_build_object(
    'ejecucion_id', '99999999-0000-0000-0000-000000000032', 'receta_id', 'ffffffff-0000-0000-0000-000000000032',
    'vendible', 8, 'rechazado', 0, 'unidad', 'PAQ')));
  if r #>> '{resultado,resultado,unidad}' <> 'PAQ' or r #> '{resultado,resultado,esperado}' <> 'null'::jsonb then
    raise exception 'FALLA: el rendimiento doble no dejo elegir la medida: %', r -> 'resultado';
  end if;
  raise notice '  OK    «X 32 UND O 8 PAQ» exige elegir la medida, y sin esperado inventado';

  r := public.operacion_ejecutar(qa_sol('guardar_resultado', 1, jsonb_build_object(
    'ejecucion_id', '99999999-0000-0000-0000-000000000031', 'receta_id', 'ffffffff-0000-0000-0000-000000000031',
    'vendible', 19, 'rechazado', 1, 'motivo', 'Recontado')));
  if (r #>> '{resultado,resultado,revision}')::int <> 2 then
    raise exception 'FALLA: la correccion del jefe no dejo revision 2';
  end if;
  raise notice '  OK    el jefe corrige con motivo: revisión 2';

  r := public.operacion_leer(jsonb_build_object('tipo', 'producido', 'fecha', current_date));
  if jsonb_array_length(r -> 'ejecuciones') <> 2 or r::text ~ 'costo_total' then
    raise exception 'FALLA: lo producido no trae 2 confirmaciones sin costo para el obrador: %', r;
  end if;
  raise notice '  OK    lo producido del día trae sus 2 confirmaciones, sin costo para el obrador';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '31. Metas: solo gerencia, versionadas, y el dinero aparte'
-- -----------------------------------------------------------------------------

do $$
begin
  if qa_codigo(qa_sol('fijar_meta', 0, '{"clave":"rechazoMaximo","valor":4}')) <> 'sin_permiso' then
    raise exception 'FALLA: el obrador fijo una meta';
  end if;
  raise notice '  OK    el obrador no fija metas: 403';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';
do $$
declare
  r jsonb;
begin
  if qa_codigo(qa_sol('fijar_meta', 0, '{"clave":"avisoVencimiento","valor":0}')) <> 'invalida' then
    raise exception 'FALLA: se acepto un aviso de vencimiento de 0 dias';
  end if;
  perform public.operacion_ejecutar(qa_sol('fijar_meta', 0, '{"clave":"rechazoMaximo","valor":4}'));
  perform public.operacion_ejecutar(qa_sol('fijar_meta', 0, '{"clave":"rechazoMaximo","valor":3.5}'));
  perform public.operacion_ejecutar(qa_sol('fijar_meta', 0, '{"clave":"presupuestoMensual","valor":8000000}'));
  r := public.operacion_leer('{"tipo":"metas"}');
  if (r #>> '{metas,rechazoMaximo,valor}')::numeric <> 3.5 or (r #>> '{metas,presupuestoMensual,valor}')::numeric <> 8000000
     or (r #>> '{metas,cumplimientoPlan,valor}')::numeric <> 90 or (r #>> '{metas,cumplimientoPlan,fijada}')::boolean then
    raise exception 'FALLA: las metas vigentes no son las esperadas: %', r;
  end if;
  raise notice '  OK    dos cambios son dos versiones: vale la última (3,5); lo no fijado sale con su base';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  r jsonb := public.operacion_leer('{"tipo":"metas"}');
begin
  if r #> '{metas}' ? 'presupuestoMensual' or r #> '{metas}' ? 'alzaPrecio' then
    raise exception 'FALLA: el obrador lee metas con dinero: %', r;
  end if;
  if (select count(*) from metas where clave in ('presupuestoMensual', 'alzaPrecio')) <> 0 then
    raise exception 'FALLA: el obrador lee el presupuesto en la tabla';
  end if;
  raise notice '  OK    el obrador no ve presupuesto ni alza de precio, ni en la API ni en la tabla';
end $$;

reset role;
rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: notas, resultados y metas se comportan como dicen.'
\echo '==========================================================='
