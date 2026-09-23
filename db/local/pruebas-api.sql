-- =============================================================================
--  PRUEBAS DE LA API DE OPERACION (0018 nucleo + 0019 bodega)
-- =============================================================================
--
--  Se llama a la API como la llamaria el navegador: `set role authenticated`,
--  la sesion en los claims y `public.operacion_ejecutar` / `operacion_leer`.
--  Reutiliza sedes, perfiles e ingredientes de `pruebas.sql` y lo deshace todo
--  al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo 'Probando la API de operacion (0018 y 0019)'
\echo ''

begin;

--  Llama a la API y devuelve el `code` del error, o 'ok'. Es `invoker`: corre
--  con el rol y la sesion de quien la llama, como una llamada real.
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

--  Estado HTTP que PostgREST devolveria para ese error.
create function qa_estado(p_solicitud jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  d text;
begin
  perform public.operacion_ejecutar(p_solicitud);
  return 200;
exception when sqlstate 'PGRST' then
  get stacked diagnostics d = pg_exception_detail;
  return (d::jsonb ->> 'status')::integer;
end $$;
grant execute on function qa_estado(jsonb) to authenticated;

create temp table qa (clave text primary key, valor jsonb);
grant all on qa to authenticated;

set role authenticated;

-- -----------------------------------------------------------------------------
\echo '17. Quien pide lo dice la sesion'
-- -----------------------------------------------------------------------------

set request.jwt.claim.sub = '';
set request.jwt.claim.session_id = '';
do $$
begin
  if qa_estado('{"id":"00000000-0000-4000-8000-000000000001","accion":"registrar_lote","revision":0,"datos":{}}') <> 401 then
    raise exception 'FALLA: sin sesion no respondio 401';
  end if;
  raise notice '  OK    sin sesion: 401';
end $$;

-- Operario de la sede 1111.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';

do $$
begin
  if qa_estado('{"id":"00000000-0000-4000-8000-000000000002","accion":"registrar_lote","revision":0,
      "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000001","unidad":"GR","peso_compra":1000,"costo_compra":5000}}') <> 403 then
    raise exception 'FALLA: el operario pudo registrar un lote';
  end if;
  raise notice '  OK    el operario no registra lotes: 403';

  if qa_codigo('{"id":"00000000-0000-4000-8000-000000000003","accion":"borrar_todo","revision":0,"datos":{}}') <> 'invalida' then
    raise exception 'FALLA: una accion inexistente no se rechazo como invalida';
  end if;
  if qa_codigo('{"id":"no-es-uuid","accion":"registrar_lote","revision":0,"datos":{}}') <> 'invalida' then
    raise exception 'FALLA: una solicitud mal formada no se rechazo';
  end if;
  raise notice '  OK    accion inexistente o solicitud mal formada: 422';

  begin
    perform privado.registrar_lote('{}'::jsonb, 0, '{}'::jsonb);
    raise exception 'FALLA: se pudo llamar a una accion saltandose la puerta';
  exception when insufficient_privilege then
    raise notice '  OK    y nadie llama a una accion saltandose la puerta';
  end;
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '18. Registrar un lote: una vez, aunque se repita'
-- -----------------------------------------------------------------------------

-- Jefe de obrador de la sede 1111 (no ve dinero).
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';

do $$
declare
  s jsonb := '{"id":"11111111-0000-4000-8000-000000000001","accion":"registrar_lote","revision":0,
    "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000001","unidad":"KG","peso_compra":25,
             "costo_compra":125000,"proveedor":"molinos qa","vencimiento":"2027-01-31","marca":"QA"}}';
  r1 jsonb;
  r2 jsonb;
begin
  r1 := public.operacion_ejecutar(s);
  if (r1 ->> 'version')::int <> 1 or (r1 ->> 'repetida')::boolean then
    raise exception 'FALLA: respuesta inesperada %', r1;
  end if;
  if (r1 #>> '{resultado,lote,existencia}')::numeric <> 25 or r1 #>> '{resultado,lote,proveedor}' <> 'MOLINOS QA' then
    raise exception 'FALLA: el lote no quedo como se pidio: %', r1 -> 'resultado';
  end if;
  if r1::text ~ 'costo' or r1::text ~ 'valor_unitario' then
    raise exception 'FALLA: el obrador recibio dinero en la respuesta: %', r1;
  end if;
  raise notice '  OK    lote % registrado, sin dinero en la respuesta del obrador', r1 #>> '{resultado,lote,codigo}';

  r2 := public.operacion_ejecutar(s);
  if not (r2 ->> 'repetida')::boolean or r2 -> 'resultado' <> r1 -> 'resultado' then
    raise exception 'FALLA: repetir la solicitud no devolvio lo mismo: %', r2;
  end if;
  insert into qa values ('lote_kg', r1 #> '{resultado,lote}');
  raise notice '  OK    repetir la misma solicitud devuelve el mismo lote, sin crear otro';

  if qa_estado(jsonb_set(s, '{datos,peso_compra}', '30')) <> 409 then
    raise exception 'FALLA: la misma clave con otros datos no respondio 409';
  end if;
  raise notice '  OK    la misma clave con otros datos: 409';
end $$;

do $$
begin
  if qa_codigo('{"id":"11111111-0000-4000-8000-000000000002","accion":"registrar_lote","revision":0,
      "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000002","unidad":"LT","peso_compra":1,"costo_compra":3000}}') <> 'invalida' then
    raise exception 'FALLA: un lote en litros sin gramos de 1 ml se acepto';
  end if;
  raise notice '  OK    litros sin la equivalencia de 1 ml: 422';

  if qa_codigo('{"id":"11111111-0000-4000-8000-000000000003","accion":"registrar_lote","revision":0,
      "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000001","unidad":"GR","peso_compra":100,"costo_compra":10,
               "fecha_compra":"2999-01-01"}}') <> 'invalida' then
    raise exception 'FALLA: se acepto una compra futura';
  end if;
  raise notice '  OK    compra con fecha futura: 422';

  if qa_codigo('{"id":"11111111-0000-4000-8000-000000000004","accion":"registrar_lote","revision":0,
      "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000001","unidad":"GR","peso_compra":"100","costo_compra":10}}') <> 'invalida' then
    raise exception 'FALLA: un numero enviado como texto se acepto';
  end if;
  raise notice '  OK    un número enviado como texto: 422';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '19. El conteo inicial de un bulto abierto'
-- -----------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  r := public.operacion_ejecutar('{"id":"22222222-0000-4000-8000-000000000001","accion":"registrar_lote","revision":0,
    "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000002","unidad":"LT","peso_compra":20,"costo_compra":40000,
             "origen":"conteo_inicial","existencia":7.5,"equivalencias":{"ML":1.03},"motivo":"Conteo del corte"}}');
  if (r #>> '{resultado,lote,existencia}')::numeric <> 7.5 or (r #>> '{resultado,lote,equivalencias,ML}')::numeric <> 1.03 then
    raise exception 'FALLA: el conteo inicial no quedo bien: %', r -> 'resultado';
  end if;
  insert into qa values ('lote_lt', r #> '{resultado,lote}');
  raise notice '  OK    bidón de 20 LT abierto entra con 7,5 LT y su gramaje por ml';

  if qa_codigo('{"id":"22222222-0000-4000-8000-000000000002","accion":"registrar_lote","revision":0,
      "datos":{"ingrediente_id":"bbbbbbbb-0000-0000-0000-000000000001","unidad":"GR","peso_compra":100,"costo_compra":10,"existencia":50}}') <> 'invalida' then
    raise exception 'FALLA: una compra entro con existencia parcial';
  end if;
  raise notice '  OK    una compra no declara existencia parcial: solo el conteo inicial';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '20. Ajustar: con la revision que se vio, y con motivo'
-- -----------------------------------------------------------------------------

do $$
declare
  l jsonb := (select valor from qa where clave = 'lote_kg');
  r jsonb;
begin
  if qa_estado(jsonb_build_object('id', '33333333-0000-4000-8000-000000000001', 'accion', 'ajustar_lote', 'revision', 7,
      'datos', jsonb_build_object('lote_id', l ->> 'id', 'existencia', 20, 'motivo', 'conteo'))) <> 409 then
    raise exception 'FALLA: un ajuste con revision vieja no respondio 409';
  end if;
  raise notice '  OK    ajuste con una revisión que no es la actual: 409';

  if qa_codigo(jsonb_build_object('id', '33333333-0000-4000-8000-000000000002', 'accion', 'ajustar_lote', 'revision', 1,
      'datos', jsonb_build_object('lote_id', l ->> 'id', 'existencia', 30, 'tipo', 'merma', 'motivo', 'x'))) <> 'invalida' then
    raise exception 'FALLA: una merma por encima de lo comprado se acepto';
  end if;
  raise notice '  OK    una merma no sube la existencia';

  r := public.operacion_ejecutar(jsonb_build_object('id', '33333333-0000-4000-8000-000000000003', 'accion', 'ajustar_lote',
    'revision', 1, 'datos', jsonb_build_object('lote_id', l ->> 'id', 'existencia', 24.5, 'tipo', 'merma',
    'motivo', 'Bulto roto')));
  if (r #>> '{resultado,lote,existencia}')::numeric <> 24.5 or (r #>> '{resultado,lote,revision}')::int <> 2 then
    raise exception 'FALLA: la merma no quedo: %', r -> 'resultado';
  end if;
  raise notice '  OK    merma de 0,5 KG con motivo: existencia 24,5 y revisión 2';

  r := public.operacion_ejecutar(jsonb_build_object('id', '33333333-0000-4000-8000-000000000004', 'accion', 'ajustar_lote',
    'revision', 2, 'datos', jsonb_build_object('lote_id', l ->> 'id', 'existencia', 0, 'motivo', 'Baja: vencido')));
  if (r #>> '{resultado,lote,existencia}')::numeric <> 0 then
    raise exception 'FALLA: la baja no dejo el lote en cero';
  end if;
  raise notice '  OK    dar de baja es dejarlo en cero: el lote y su historia siguen';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '21. Equivalencias: una version nueva, nunca una edicion'
-- -----------------------------------------------------------------------------

do $$
declare
  l jsonb := (select valor from qa where clave = 'lote_lt');
  r jsonb;
begin
  r := public.operacion_ejecutar(jsonb_build_object('id', '44444444-0000-4000-8000-000000000001', 'accion', 'fijar_equivalencia',
    'revision', 1, 'datos', jsonb_build_object('lote_id', l ->> 'id', 'medida', 'ML', 'gramos', 1.05, 'motivo', 'Pesado de nuevo')));
  if (r #>> '{resultado,lote,equivalencias,ML}')::numeric <> 1.05 then
    raise exception 'FALLA: la equivalencia vigente no cambio: %', r -> 'resultado';
  end if;
  raise notice '  OK    1 ml pasa a pesar 1,05 g';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '22. Leer: la bodega paginada y la solicitud propia'
-- -----------------------------------------------------------------------------

do $$
declare
  r jsonb;
begin
  r := public.operacion_leer('{"tipo":"bodega","con_existencia":false,"limite":1}');
  if jsonb_array_length(r -> 'lotes') <> 1 or r ->> 'siguiente' is null then
    raise exception 'FALLA: la paginacion no devolvio 1 lote y un cursor: %', r;
  end if;
  if r::text ~ 'costo_compra' then
    raise exception 'FALLA: el obrador lee el costo de compra en la bodega';
  end if;
  raise notice '  OK    página de 1 lote con cursor, sin costos para el obrador';

  r := public.operacion_leer('{"tipo":"solicitud","id":"11111111-0000-4000-8000-000000000001"}');
  if r #>> '{solicitud,accion}' <> 'registrar_lote' or r #> '{solicitud,completada}' = 'null' then
    raise exception 'FALLA: el obrador no encuentra su propia solicitud: %', r;
  end if;
  r := public.operacion_leer('{"tipo":"solicitud","id":"99999999-0000-4000-8000-000000000099"}');
  if r -> 'solicitud' <> 'null'::jsonb then
    raise exception 'FALLA: una solicitud que nunca llego no devolvio null';
  end if;
  raise notice '  OK    su solicitud aparece completada; una que nunca llegó, null';
end $$;

-- Gerencia, verificada en dos pasos: si ve el dinero, y no las solicitudes ajenas.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';

do $$
declare
  r jsonb;
begin
  r := public.operacion_leer('{"tipo":"bodega","con_existencia":false}');
  if not r::text ~ 'costo_compra' then
    raise exception 'FALLA: gerencia no ve el costo de compra';
  end if;
  r := public.operacion_leer('{"tipo":"solicitud","id":"11111111-0000-4000-8000-000000000001"}');
  if r -> 'solicitud' <> 'null'::jsonb then
    raise exception 'FALLA: gerencia lee la solicitud de otra persona';
  end if;
  raise notice '  OK    gerencia ve costos; la solicitud de otro no la ve nadie más';
end $$;

-- Otra sede: no ve ni puede tocar los lotes de la 1111.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000004';
set request.jwt.claim.aal = 'aal1';

do $$
declare
  r jsonb := public.operacion_leer('{"tipo":"bodega","con_existencia":false}');
begin
  if exists (select 1 from jsonb_array_elements(r -> 'lotes') e where e ->> 'codigo' like 'L0%') then
    raise exception 'FALLA: otra sede ve los lotes nuevos de la 1111';
  end if;
  raise notice '  OK    otra sede no ve esos lotes';
end $$;

reset role;

-- -----------------------------------------------------------------------------
\echo ''
\echo '23. El saldo es siempre la suma del libro'
-- -----------------------------------------------------------------------------

do $$
declare
  n integer;
begin
  select count(*) into n from lotes l
   where l.existencia <> (select coalesce(sum(m.cantidad), 0) from movimientos m where m.lote_id = l.id)
     and l.codigo like 'L0%';
  if n > 0 then
    raise exception 'FALLA: % lotes con saldo distinto de su libro', n;
  end if;
  select count(*) into n from lotes where codigo like 'L0%';
  raise notice '  OK    % lotes creados por la API, cada uno con saldo = suma de movimientos', n;

  select count(*) into n from eventos_operacion where tipo in ('compra', 'conteo_inicial', 'ajuste', 'merma', 'equivalencia');
  if n < 5 then
    raise exception 'FALLA: la bitacora no registro los cambios (% eventos)', n;
  end if;
  raise notice '  OK    y cada cambio quedó en la bitácora (% eventos)', n;
end $$;

rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: la API de operacion se comporta como dice.'
\echo '==========================================================='
