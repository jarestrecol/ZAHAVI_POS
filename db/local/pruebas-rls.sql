-- =============================================================================
--  BARRIDO DE SEGURIDAD: SEDES, ROLES Y DINERO (F3-11)
-- =============================================================================
--
--  Las pruebas de cada capa ya miran su caso. Esto recorre TODAS las tablas de
--  la operacion y TODAS las consultas de la API con cada tipo de sesion, para
--  que una tabla o consulta nueva que se olvide de filtrar no pase inadvertida.
--
--  Corre despues de la concurrencia (`scripts/lib/concurrencia-sql.mjs`), que
--  deja confirmada produccion real en la sede 1111: planes, ejecuciones,
--  consumos, movimientos, eventos y solicitudes. Aqui se anade una nota, un
--  resultado y metas, y se deshace todo al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo '33. Barrido: cada sesion ve solo su sede, y el dinero solo gerencia'
\echo ''

begin;

insert into notas (sede_id, fecha, tipo, texto, responsable, autor_id) values
  ('11111111-1111-1111-1111-111111111111', current_date, 'tarea', 'Barrido', 'QA', 'aaaaaaaa-0000-0000-0000-000000000002');
insert into metas (sede_id, clave, valor, responsable, autor_id) values
  ('11111111-1111-1111-1111-111111111111', 'presupuestoMensual', 1000000, 'QA', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111111', 'alzaPrecio', 15, 'QA', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111111', 'rechazoMaximo', 4, 'QA', 'aaaaaaaa-0000-0000-0000-000000000003');
insert into resultados (ejecucion_id, receta_id, unidad, vendible, rechazado, motivo, responsable, autor_id)
select e.id, e.receta_id, 'UND', 10, 0, 'barrido', 'QA', 'aaaaaaaa-0000-0000-0000-000000000002'
  from ejecuciones e where e.sede_id = '11111111-1111-1111-1111-111111111111' limit 1;

--  Filas que ve la sesion en cada tabla de la operacion (count(*) no lee
--  columnas, asi que funciona tambien donde solo hay permiso por columnas).
create function qa_visibles() returns table (tabla text, filas bigint)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  t text;
begin
  foreach t in array array['planes', 'plan_partidas', 'preparaciones', 'ejecuciones', 'ejecucion_partidas',
    'ejecucion_consumos', 'resultados', 'notas', 'eventos_operacion', 'metas', 'solicitudes', 'lotes',
    'movimientos', 'equivalencias_lote', 'importaciones', 'importacion_mapeos', 'importacion_identidades']
  loop
    tabla := t;
    -- Sin permiso sobre la tabla (el libro se lee por su vista) no se ve nada.
    begin
      execute format('select count(*) from %I', t) into filas;
    exception when insufficient_privilege then
      filas := 0;
    end;
    return next;
  end loop;
end $$;
grant execute on function qa_visibles() to authenticated;

--  Todas las consultas de la API, juntas, como texto.
create function qa_consultas() returns text
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  r text := '';
  c text;
begin
  foreach c in array array[
    '{"tipo":"bodega","con_existencia":false}', format('{"tipo":"dia","fecha":"%s"}', hoy),
    format('{"tipo":"producido","fecha":"%s"}', hoy), format('{"tipo":"notas","fecha":"%s"}', hoy),
    '{"tipo":"metas"}']
  loop
    r := r || public.operacion_leer(c::jsonb)::text;
  end loop;
  return r;
end $$;
grant execute on function qa_consultas() to authenticated;

--  El dinero, por el nombre de sus campos en las respuestas de la API.
create function qa_hay_dinero(t text) returns boolean language sql immutable as $$
  select t ~ '"(costo|costo_total|costoTotal|costo_compra|valor_unitario|precioUnitario|precioPorGramo|precioMedio|costeo|presupuestoMensual|alzaPrecio)"'
$$;
grant execute on function qa_hay_dinero(text) to authenticated;

--  Intenta leer una columna de dinero directamente; true si se deja.
create function qa_lee(p_sql text) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  execute p_sql;
  return true;
exception when insufficient_privilege then
  return false;
end $$;
grant execute on function qa_lee(text) to authenticated;

set role authenticated;

-- ---- OTRA SEDE --------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000004';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  v record;
  otras text := '';
  c text := qa_consultas();
begin
  for v in select * from qa_visibles() loop
    -- En la 2222 solo existe su lote QA-L003 y su entrada en el libro.
    if v.filas > (case when v.tabla in ('lotes', 'movimientos') then 1 else 0 end) then
      otras := otras || format(' %s=%s', v.tabla, v.filas);
    end if;
  end loop;
  if otras <> '' then
    raise exception 'FALLA: la otra sede ve filas ajenas:%', otras;
  end if;
  if c ~ 'QA-CONC' or c ~ 'Barrido' or c ~ '"L0' then
    raise exception 'FALLA: la API le devuelve a la otra sede datos de la 1111: %', left(c, 300);
  end if;
  raise notice '  OK    otra sede: 17 tablas y 5 consultas sin una sola fila de la 1111';
end $$;

-- ---- OPERARIO, JEFE DE OBRADOR Y GERENCIA SOLO CON PIN ------------------------
do $$
declare
  p record;
  c text;
begin
  for p in select * from (values
      ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'aal1', 'operario'),
      ('aaaaaaaa-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002', 'aal1', 'jefe de obrador'),
      ('aaaaaaaa-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003', 'aal1', 'gerencia solo con PIN'))
      x(sub, sesion, aal, quien)
  loop
    perform set_config('request.jwt.claim.sub', p.sub, true);
    perform set_config('request.jwt.claim.session_id', p.sesion, true);
    perform set_config('request.jwt.claim.aal', p.aal, true);

    c := qa_consultas();
    if position('QA-CONC' in c) = 0 then
      raise exception 'FALLA: % no ve la produccion de su propia sede', p.quien;
    end if;
    if qa_hay_dinero(c) then
      raise exception 'FALLA: % recibe dinero de la API: %', p.quien, substring(c from '"(costo[a-z_A-Z]*|valor_unitario|precio[A-Za-z]*|costeo|presupuestoMensual|alzaPrecio)"');
    end if;
    if qa_lee('select costo_total from ejecuciones') or qa_lee('select costeo from ejecuciones')
       or qa_lee('select costo_compra from lotes') or qa_lee('select resultado from solicitudes') then
      raise exception 'FALLA: % lee una columna de dinero directamente', p.quien;
    end if;
    if (select count(*) from ejecucion_consumos) + (select count(*) from eventos_operacion)
       + (select count(*) from metas where clave in ('presupuestoMensual', 'alzaPrecio')) > 0 then
      raise exception 'FALLA: % ve consumos costeados, bitacora o metas de dinero', p.quien;
    end if;
    raise notice '  OK    %: ve su producción; sin dinero en 5 consultas, 4 columnas y 3 tablas', p.quien;
  end loop;
end $$;

-- ---- GERENCIA VERIFICADA EN DOS PASOS ---------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';
do $$
declare
  c text := qa_consultas();
begin
  if not (c ~ '"costo_total"' and c ~ '"costo_compra"' and c ~ '"presupuestoMensual"' and c ~ '"alzaPrecio"') then
    raise exception 'FALLA: gerencia verificada no ve el dinero que le corresponde';
  end if;
  if (select count(*) from ejecucion_consumos) = 0 or (select count(*) from eventos_operacion) = 0 then
    raise exception 'FALLA: gerencia verificada no ve consumos ni bitacora';
  end if;
  raise notice '  OK    gerencia verificada en dos pasos ve costos, consumos, bitácora y presupuesto';
end $$;

-- ---- SESION VENCIDA ---------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-0000000000ff';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  v record;
  total bigint := 0;
begin
  for v in select * from qa_visibles() loop
    total := total + v.filas;
  end loop;
  if total > 0 then
    raise exception 'FALLA: una sesion de hace 7 horas ve % filas de la operacion', total;
  end if;
  begin
    perform public.operacion_leer('{"tipo":"metas"}');
    raise exception 'FALLA: una sesion vencida uso la API';
  exception when sqlstate 'PGRST' then
    raise notice '  OK    sesión de hace 7 horas: ninguna fila en 17 tablas y la API responde 401';
  end;
end $$;

reset role;
rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: cada sesion ve solo lo suyo, y el dinero solo gerencia.'
\echo '==========================================================='
