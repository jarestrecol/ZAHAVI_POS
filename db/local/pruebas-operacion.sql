-- =============================================================================
--  PRUEBAS DE LA OPERACION (0014 + 0015)
-- =============================================================================
--
--  Cada apartado responde a un hallazgo de `coordinacion/entregas/REVISION-0014.md`
--  preguntandoselo a PostgreSQL, no leyendo el SQL. Corre despues de
--  `pruebas.sql`, cuyas sedes, perfiles, sesiones y lotes reutiliza, y lo deja
--  todo como estaba: el archivo entero va dentro de una transaccion que se
--  deshace al final.
--
--  Se ejecuta con:  npm run probar-sql

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo 'Probando la operacion (0014 y 0015)'
\echo ''

begin;

-- Semilla propia, como superusuario. Sede 1111 = obrador; 2222 = la otra.
insert into recetas (id, codigo, nombre, categoria) values
  ('ffffffff-0000-0000-0000-000000000001', 'QA-OP-R1', 'QA-TEST-PAN', 'PANADERÍA'),
  ('ffffffff-0000-0000-0000-000000000002', 'QA-OP-R2', 'QA-TEST-GALLETA', 'GALLETAS');

insert into importaciones (id, sede_id, origen, huella, modo, importado_por) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'navegador-caja', 'huella-A', 'definitiva', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'navegador-caja', 'huella-A', 'ensayo', 'aaaaaaaa-0000-0000-0000-000000000003');

insert into ejecuciones (id, sede_id, fecha, plan_revision, receta_id, responsable, motivo,
                         autor_id, costo_total, costeo) values
  ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', current_date, 1,
   'ffffffff-0000-0000-0000-000000000001', 'Gerencia QA', 'prueba',
   'aaaaaaaa-0000-0000-0000-000000000003', 100, '{}'::jsonb);

insert into ejecucion_partidas (ejecucion_id, receta_id, tandas, receta) values
  ('99999999-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 1, '{}'::jsonb);

-- -----------------------------------------------------------------------------
\echo '10. El libro guarda lo mismo que el saldo'
-- -----------------------------------------------------------------------------

do $$
declare
  v numeric;
begin
  insert into movimientos (lote_id, tipo, cantidad)
    values ('cccccccc-0000-0000-0000-000000000001', 'salida', -0.0004);
  select cantidad into v from movimientos
    where lote_id = 'cccccccc-0000-0000-0000-000000000001' order by creado_en desc, id desc limit 1;
  if v is distinct from -0.0004 then
    raise exception 'FALLA: un consumo de 0,0004 quedo en el libro como %', v;
  end if;
  raise notice '  OK    un consumo de 0,0004 queda en el libro como %, no como cero', v;
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '11. Importar dos veces no duplica'
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into importaciones (sede_id, origen, huella, modo, importado_por) values
      ('11111111-1111-1111-1111-111111111111', 'navegador-caja', 'huella-A', 'definitiva',
       'aaaaaaaa-0000-0000-0000-000000000003');
    raise exception 'FALLA: el mismo respaldo entro dos veces en definitiva';
  exception when unique_violation then
    raise notice '  OK    el mismo respaldo no entra dos veces en definitiva';
  end;

  insert into importaciones (sede_id, origen, huella, modo, importado_por) values
    ('11111111-1111-1111-1111-111111111111', 'navegador-caja', 'huella-A', 'ensayo',
     'aaaaaaaa-0000-0000-0000-000000000003');
  raise notice '  OK    y ensayarlo otra vez si se puede';

  insert into importacion_identidades (sede_id, origen, entidad, id_origen, id_remoto, primera_importacion_id)
    values ('11111111-1111-1111-1111-111111111111', 'navegador-caja', 'lote', 'L001',
            'cccccccc-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001');
  begin
    -- Un respaldo POSTERIOR del mismo navegador trae otra vez L001.
    insert into importacion_identidades (sede_id, origen, entidad, id_origen, id_remoto, primera_importacion_id)
      values ('11111111-1111-1111-1111-111111111111', 'navegador-caja', 'lote', 'L001',
              gen_random_uuid(), 'eeeeeeee-0000-0000-0000-000000000001');
    raise exception 'FALLA: el mismo lote local recibio dos filas remotas';
  exception when unique_violation then
    raise notice '  OK    el mismo lote local, en otro respaldo, sigue siendo la misma fila';
  end;

  -- El mismo id legible en OTRO navegador es otra compra: no choca.
  insert into importacion_identidades (sede_id, origen, entidad, id_origen, id_remoto, primera_importacion_id)
    values ('11111111-1111-1111-1111-111111111111', 'navegador-bodega', 'lote', 'L001',
            'cccccccc-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001');
  raise notice '  OK    y L001 de otro navegador es otro lote';
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '12. Lo demo queda excluido con su traza, nunca como real'
-- -----------------------------------------------------------------------------

do $$
begin
  insert into importacion_mapeos (importacion_id, entidad, id_origen, id_remoto, decision)
    values ('eeeeeeee-0000-0000-0000-000000000001', 'lote', 'DEMO-1', null, 'excluido_demo');
  raise notice '  OK    un lote demo deja constancia de su exclusion, sin fila remota';

  begin
    insert into importacion_mapeos (importacion_id, entidad, id_origen, id_remoto, decision)
      values ('eeeeeeee-0000-0000-0000-000000000001', 'lote', 'DEMO-2', gen_random_uuid(), 'excluido_demo');
    raise exception 'FALLA: algo excluido como demo apunta a una fila remota';
  exception when check_violation then
    raise notice '  OK    lo excluido no puede tener fila remota';
  end;

  begin
    insert into importacion_mapeos (importacion_id, entidad, id_origen, id_remoto, decision)
      values ('eeeeeeee-0000-0000-0000-000000000001', 'lote', 'L009', null, 'importado');
    raise exception 'FALLA: algo importado no dice a que fila fue';
  exception when check_violation then
    raise notice '  OK    y lo importado siempre dice a que fila fue';
  end;

  begin
    insert into lotes (codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra,
                       importacion_id, historico)
      values ('QA-OP-ENSAYO', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
              10, 'GR', 10, 'eeeeeeee-0000-0000-0000-000000000002', true);
    raise exception 'FALLA: un ensayo dejo un lote en la base';
  exception when check_violation then
    raise notice '  OK    un ensayo no deja lotes: solo la importacion definitiva';
  end;
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '13. Lo historico conserva a quien lo declaro, sin inventar autenticacion'
-- -----------------------------------------------------------------------------

do $$
begin
  insert into planes (sede_id, fecha, responsable, motivo, importacion_id, historico)
    values ('11111111-1111-1111-1111-111111111111', current_date - 30, 'Ana (navegador)', 'importado',
            'eeeeeeee-0000-0000-0000-000000000001', true);
  raise notice '  OK    un plan importado entra con el nombre declarado y sin autor autenticado';

  begin
    insert into planes (sede_id, fecha, responsable, motivo)
      values ('11111111-1111-1111-1111-111111111111', current_date - 31, 'Nadie', 'sin autor');
    raise exception 'FALLA: un plan nuevo entro sin autor autenticado';
  exception when check_violation then
    raise notice '  OK    uno nuevo no entra sin autor autenticado';
  end;

  begin
    insert into planes (sede_id, fecha, responsable, motivo, autor_id, historico)
      values ('11111111-1111-1111-1111-111111111111', current_date - 32, 'Gerencia', 'falso',
              'aaaaaaaa-0000-0000-0000-000000000003', true);
    raise exception 'FALLA: una fila se declaro historica sin venir de una importacion';
  exception when check_violation then
    raise notice '  OK    ni se declara historico sin importacion que lo respalde';
  end;

  insert into preparaciones (sede_id, fecha, receta_id, iniciada, iniciada_por_declarado,
                             asignado_declarado, importacion_id, historico)
    values ('11111111-1111-1111-1111-111111111111', current_date - 30, 'ffffffff-0000-0000-0000-000000000001',
            now() - interval '30 days', 'Luis (navegador)', 'Marta (navegador)',
            'eeeeeeee-0000-0000-0000-000000000001', true);
  raise notice '  OK    una preparacion importada conserva quien la empezo y a quien se asigno';

  begin
    insert into preparaciones (sede_id, fecha, receta_id, iniciada, iniciada_por_declarado)
      values ('11111111-1111-1111-1111-111111111111', current_date, 'ffffffff-0000-0000-0000-000000000001',
              now(), 'Alguien');
    raise exception 'FALLA: una preparacion de hoy empezo con un nombre sin perfil';
  exception when check_violation then
    raise notice '  OK    hoy, empezar exige el perfil autenticado';
  end;
end $$;

-- -----------------------------------------------------------------------------
\echo ''
\echo '14. Relaciones que no se pueden romper'
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into movimientos (lote_id, tipo, cantidad, ejecucion_id)
      values ('cccccccc-0000-0000-0000-000000000001', 'salida', -1, gen_random_uuid());
    raise exception 'FALLA: un movimiento apunta a una confirmacion que no existe';
  exception when foreign_key_violation then
    raise notice '  OK    ningun movimiento apunta a una confirmacion inexistente';
  end;

  begin
    insert into movimientos (lote_id, tipo, cantidad, ejecucion_id)
      values ('cccccccc-0000-0000-0000-000000000003', 'salida', -1, '99999999-0000-0000-0000-000000000001');
    raise exception 'FALLA: una confirmacion descuenta un lote de otra sede';
  exception when check_violation then
    raise notice '  OK    ni descuenta un lote de otra sede';
  end;

  begin
    insert into ejecucion_consumos (ejecucion_id, lote_id, ingrediente_id, cantidad, unidad, gramos,
                                    precio_unitario, costo)
      values ('99999999-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003',
              'bbbbbbbb-0000-0000-0000-000000000002', 1, 'GR', 1, 10, 10);
    raise exception 'FALLA: un consumo se costeo con un lote de otra sede';
  exception when check_violation then
    raise notice '  OK    ni costea con un lote de otra sede';
  end;

  insert into resultados (ejecucion_id, receta_id, unidad, vendible, rechazado, motivo, responsable, autor_id)
    values ('99999999-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'UND', 10, 0,
            'medido', 'Gerencia QA', 'aaaaaaaa-0000-0000-0000-000000000003');
  raise notice '  OK    el resultado de una receta confirmada se registra';

  begin
    insert into resultados (ejecucion_id, receta_id, unidad, vendible, rechazado, motivo, responsable, autor_id)
      values ('99999999-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000002', 'UND', 5, 0,
              'medido', 'Gerencia QA', 'aaaaaaaa-0000-0000-0000-000000000003');
    raise exception 'FALLA: se registro el resultado de una receta que no estaba en la confirmacion';
  exception when foreign_key_violation then
    raise notice '  OK    el de una receta que no estaba en la confirmacion, no';
  end;
end $$;

-- Datos para comprobar permisos: un presupuesto, un umbral, un evento y una solicitud.
insert into metas (sede_id, clave, valor, responsable, autor_id) values
  ('11111111-1111-1111-1111-111111111111', 'presupuestoMensual', 5000000, 'Gerencia QA', 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('11111111-1111-1111-1111-111111111111', 'rendimientoMinimo', 90, 'Gerencia QA', 'aaaaaaaa-0000-0000-0000-000000000003');
insert into eventos_operacion (sede_id, tipo, responsable, autor_id, datos) values
  ('11111111-1111-1111-1111-111111111111', 'precio', 'Gerencia QA', 'aaaaaaaa-0000-0000-0000-000000000003',
   '{"antes": 1000, "despues": 1200}');
insert into solicitudes (clave, sede_id, perfil_id, operacion, huella, resultado) values
  ('QA-SOL-1', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002',
   'confirmar', 'h', '{"costo_total": 100}');

-- -----------------------------------------------------------------------------
\echo ''
\echo '15. El dinero de la operacion solo lo ve gerencia'
-- -----------------------------------------------------------------------------

set role authenticated;

-- ---- JEFE DE OBRADOR ---------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';

do $$
declare
  n integer;
begin
  select count(*) into n from metas where clave = 'presupuestoMensual';
  if n <> 0 then
    raise exception 'FALLA: el obrador ve el presupuesto mensual';
  end if;
  select count(*) into n from metas where clave = 'rendimientoMinimo';
  if n <> 1 then
    raise exception 'FALLA: el obrador no ve el umbral de rendimiento (% filas)', n;
  end if;
  raise notice '  OK    el obrador ve los umbrales del panel y NO el presupuesto';

  select count(*) into n from eventos_operacion;
  if n <> 0 then
    raise exception 'FALLA: el obrador lee la bitacora con precios (% filas)', n;
  end if;
  raise notice '  OK    ni la bitacora, que puede llevar precios';

  select count(*) into n from solicitudes where clave = 'QA-SOL-1';
  if n <> 1 then
    raise exception 'FALLA: el obrador no ve su propia solicitud';
  end if;
  begin
    execute 'select resultado from solicitudes';
    raise exception 'FALLA: el obrador lee el resultado guardado de su solicitud';
  exception when insufficient_privilege then
    raise notice '  OK    ve su solicitud, pero no el resultado guardado con costos';
  end;
end $$;

-- ---- GERENCIA, VERIFICADA EN DOS PASOS ----------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';

do $$
declare
  n integer;
begin
  select count(*) into n from metas;
  if n <> 2 then
    raise exception 'FALLA: gerencia deberia ver las 2 metas y ve %', n;
  end if;
  select count(*) into n from eventos_operacion;
  if n <> 1 then
    raise exception 'FALLA: gerencia deberia ver la bitacora y ve % filas', n;
  end if;
  select count(*) into n from importacion_identidades;
  if n <> 2 then
    raise exception 'FALLA: gerencia deberia ver las 2 identidades de su sede y ve %', n;
  end if;
  raise notice '  OK    gerencia ve presupuesto, bitacora e identidades importadas';
end $$;

reset role;
rollback;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: la operacion se comporta como dice.'
\echo '==========================================================='
