-- =============================================================================
--  PRUEBAS DE COMPORTAMIENTO DEL ESQUEMA
-- =============================================================================
--
--  `scripts/verificar-sql.mjs` comprueba que las reglas ESTAN ESCRITAS. Esto
--  comprueba que FUNCIONAN, que no es lo mismo: una politica puede existir, estar
--  bien redactada y no cubrir el caso que se creia.
--
--  Se pone en la piel de cada rol -operario, jefe de obrador y gerencia- y mira
--  que ve y que puede hacer cada uno. Es la unica forma de saber que el costo no
--  se escapa: preguntandoselo a la base de datos como se lo preguntaria alguien
--  que no deberia verlo.
--
--  Se ejecuta con:  npm run probar-sql
--  (levanta un PostgreSQL desechable en Docker, aplica todo y corre esto)

\set ON_ERROR_STOP on
\set QUIET on

-- -----------------------------------------------------------------------------
--  SEMILLA (como superusuario, que se salta la seguridad por filas)
-- -----------------------------------------------------------------------------

begin;

insert into sedes (id, nombre) values
  ('11111111-1111-1111-1111-111111111111', 'QA-TEST-OBRADOR'),
  ('22222222-2222-2222-2222-222222222222', 'QA-TEST-CASA');

-- El disparador crea el perfil DESACTIVADO y de operario (0010): solo un
-- administrador activa. Aqui se ajusta como superusuario.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'operario@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'obrador@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gerencia@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'otrasede@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'admin@qa-test');

-- Una sesion abierta por persona, y una de hace 7 horas: el turno maximo es de 6.
insert into auth.sessions (id, user_id, created_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', now()),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', now()),
  ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', now()),
  ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004', now()),
  ('dddddddd-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000005', now()),
  ('dddddddd-0000-0000-0000-0000000000ff', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '7 hours');

update perfiles set rol = 'operario', sede_id = '11111111-1111-1111-1111-111111111111', activo = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update perfiles set rol = 'obrador', sede_id = '11111111-1111-1111-1111-111111111111', activo = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update perfiles set rol = 'gerencia', sede_id = '11111111-1111-1111-1111-111111111111', activo = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update perfiles set rol = 'operario', sede_id = '22222222-2222-2222-2222-222222222222', activo = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000004';
update perfiles set rol = 'admin', sede_id = '11111111-1111-1111-1111-111111111111', activo = true
  where id = 'aaaaaaaa-0000-0000-0000-000000000005';

insert into ingredientes (id, nombre, unidad_base) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'QA-TEST-HARINA', 'GR'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'QA-TEST-AGUA', 'GR');

-- Dos lotes del mismo ingrediente a precios MUY distintos, uno de ellos vencido.
-- Desde 0023 cada lote nace con autor y con el saldo que dice su libro (abajo):
-- la base comprueba al confirmar que `existencia` es la suma de `movimientos`.
insert into lotes (id, codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra, vencimiento,
                   existencia, creado_por) values
  ('cccccccc-0000-0000-0000-000000000001', 'QA-L001', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1000, 'GR', 10000, current_date + 90,
   750, 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000002', 'QA-L002', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1000, 'GR', 20000, current_date - 5,
   1000, 'aaaaaaaa-0000-0000-0000-000000000002'),
  -- Un lote de la OTRA sede, para comprobar el aislamiento.
  ('cccccccc-0000-0000-0000-000000000003', 'QA-L003', 'bbbbbbbb-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 500, 'GR', 5000, null,
   500, 'aaaaaaaa-0000-0000-0000-000000000004');

insert into movimientos (lote_id, tipo, cantidad) values
  ('cccccccc-0000-0000-0000-000000000001', 'entrada', 1000),
  ('cccccccc-0000-0000-0000-000000000002', 'entrada', 1000),
  ('cccccccc-0000-0000-0000-000000000003', 'entrada', 500),
  ('cccccccc-0000-0000-0000-000000000001', 'salida', -250);

insert into precios (ingrediente_id, valor) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 12.5);

commit;

\echo ''
\echo 'Probando el comportamiento del esquema'
\echo ''

/*
 * QUIEN PREGUNTA EN LOS PRIMEROS CUATRO APARTADOS.
 *
 * Las vistas filtran por sede con `es_mi_sede()`, que sale de `auth.uid()`. Sin
 * declarar quien pregunta, `auth.uid()` es nulo, no hay perfil, y las vistas
 * devuelven CERO FILAS -que es justamente lo que deben hacer-.
 *
 * Asi que aqui se declara gerencia, que ve las dos sedes. Se sigue ejecutando
 * como superusuario a proposito: los apartados 1 a 4 comprueban reglas del DATO
 * -sumas, restricciones, columnas derivadas, inmutabilidad- y esas tienen que
 * cumplirse para todo el mundo, incluido quien se salta la seguridad por filas.
 *
 * El reparto por roles se prueba a partir del apartado 5, ya con `set role`.
 */
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';

-- -----------------------------------------------------------------------------
--  1. LA EXISTENCIA ES LA SUMA DEL LIBRO
-- -----------------------------------------------------------------------------

\echo '1. La existencia sale de los movimientos'

do $$
declare
  v numeric;
begin
  select existencia into v from existencia_lotes where codigo = 'QA-L001';
  if v is distinct from 750 then
    raise exception 'FALLA: 1000 de entrada menos 250 de salida deberian ser 750, y son %', v;
  end if;
  raise notice '  OK    1000 - 250 = % en QA-L001', v;
end $$;

do $$
declare
  total numeric;
  disp numeric;
begin
  select existencia, disponible into total, disp
  from existencia_ingredientes where ingrediente = 'QA-TEST-HARINA';
  if total is distinct from 1750 then
    raise exception 'FALLA: la existencia total deberia ser 1750 y es %', total;
  end if;
  -- El lote vencido suma en la existencia fisica pero NO en lo disponible.
  if disp is distinct from 750 then
    raise exception 'FALLA: lo disponible deberia excluir el lote vencido (750) y es %', disp;
  end if;
  raise notice '  OK    existencia % con lo vencido, disponible % sin ello', total, disp;
end $$;

-- -----------------------------------------------------------------------------
--  2. EL LIBRO ES INMUTABLE
-- -----------------------------------------------------------------------------

\echo ''
\echo '2. Un movimiento no se corrige: se anota al reves'

do $$
begin
  begin
    update movimientos set cantidad = 999 where lote_id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'FALLA: se pudo modificar un movimiento';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    modificar lo rechaza la base de datos';
  end;

  begin
    delete from movimientos where lote_id = 'cccccccc-0000-0000-0000-000000000001';
    raise exception 'FALLA: se pudo borrar un movimiento';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    borrar tambien';
  end;
end $$;

-- -----------------------------------------------------------------------------
--  3. LAS RESTRICCIONES QUE PROTEGEN LAS CIFRAS
-- -----------------------------------------------------------------------------

\echo ''
\echo '3. Lo que la base de datos se niega a guardar'

do $$
begin
  begin
    insert into movimientos (lote_id, tipo, cantidad)
    values ('cccccccc-0000-0000-0000-000000000001', 'entrada', -5);
    raise exception 'FALLA: se admitio una entrada negativa';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    una entrada con cantidad negativa';
  end;

  begin
    insert into movimientos (lote_id, tipo, cantidad)
    values ('cccccccc-0000-0000-0000-000000000001', 'ajuste', 10);
    raise exception 'FALLA: se admitio un ajuste sin motivo';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    un ajuste sin explicacion';
  end;

  begin
    insert into precios (ingrediente_id, valor, vigente_desde)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 99, current_date);
    raise exception 'FALLA: se admitieron dos precios solapados';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    dos precios vigentes a la vez para el mismo ingrediente';
  end;

  begin
    insert into lotes (codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra)
    values ('QA-L9', 'bbbbbbbb-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111', 0, 'GR', 100);
    raise exception 'FALLA: se admitio un lote con peso cero';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    un lote con peso cero (no se podria dividir)';
  end;
end $$;

-- -----------------------------------------------------------------------------
--  4. EL VALOR UNITARIO SE DERIVA
-- -----------------------------------------------------------------------------

\echo ''
\echo '4. El valor por unidad lo calcula la base de datos'

do $$
declare
  v numeric;
begin
  select valor_unitario into v from lotes where codigo = 'QA-L001';
  if v is distinct from 10.0 then
    raise exception 'FALLA: 10000 / 1000 deberia ser 10 y es %', v;
  end if;

  update lotes set costo_compra = 20000 where codigo = 'QA-L001';
  select valor_unitario into v from lotes where codigo = 'QA-L001';
  if v is distinct from 20.0 then
    raise exception 'FALLA: al cambiar el costo, el valor unitario deberia seguirlo. Es %', v;
  end if;
  update lotes set costo_compra = 10000 where codigo = 'QA-L001';

  raise notice '  OK    se recalcula solo al cambiar el costo, no se puede desfasar';
end $$;

-- -----------------------------------------------------------------------------
--  5. LO QUE VE CADA ROL
-- -----------------------------------------------------------------------------
--
--  Aqui esta lo importante. Se cambia al rol con el que entra la API y se declara
--  quien pregunta, igual que haria el token.

\echo ''
\echo '5. El dinero solo lo ve gerencia'

set role authenticated;

-- ---- OPERARIO ---------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';

do $$
declare
  fila record;
  n integer;
begin
  if privado.mi_rol() <> 'operario' then
    raise exception 'FALLA: se esperaba operario y es %', privado.mi_rol();
  end if;

  select * into fila from existencia_lotes where codigo = 'QA-L001';
  if fila.existencia is null then
    raise exception 'FALLA: el operario no ve las existencias de su sede';
  end if;
  if fila.costo_compra is not null or fila.valor_unitario is not null
     or fila.valor_existencia is not null then
    raise exception 'FALLA: el operario esta viendo el dinero (costo %, unitario %)',
      fila.costo_compra, fila.valor_unitario;
  end if;
  raise notice '  OK    el operario ve la existencia (%) y NO el costo', fila.existencia;

  -- Y no puede esquivar la vista consultando la tabla.
  begin
    execute 'select costo_compra from lotes limit 1';
    raise exception 'FALLA: el operario pudo leer la tabla `lotes` directamente';
  exception when insufficient_privilege then
    raise notice '  OK    y la tabla `lotes` no se la deja consultar';
  end;

  -- Ni los precios.
  select count(*) into n from precio_vigente;
  if n <> 0 then
    raise exception 'FALLA: el operario ve % precios', n;
  end if;
  raise notice '  OK    ni un solo precio';

  -- Ni saltandose la vista y llamando a la funcion privada que hay detras: el
  -- enmascarado vive en la funcion, no en la vista.
  select * into fila from privado.existencia_lotes() where codigo = 'QA-L001';
  if fila.costo_compra is not null or fila.valor_existencia is not null then
    raise exception 'FALLA: la funcion privada entrega el costo al operario (%)', fila.costo_compra;
  end if;
  raise notice '  OK    ni llamando directamente a la funcion privada de la vista';
end $$;

-- ---- AISLAMIENTO ENTRE SEDES ------------------------------------------------
do $$
declare
  n integer;
begin
  select count(*) into n from existencia_lotes where codigo = 'QA-L003';
  if n <> 0 then
    raise exception 'FALLA: se ve un lote de otra sede';
  end if;
  raise notice '  OK    no ve la bodega de la otra sede';
end $$;

-- ---- GERENCIA ---------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';

do $$
declare
  fila record;
  n integer;
begin
  select * into fila from existencia_lotes where codigo = 'QA-L001';
  if fila.costo_compra is null then
    raise exception 'FALLA: gerencia NO ve el costo, y deberia';
  end if;
  raise notice '  OK    gerencia ve el costo (%) y el valor de la existencia (%)',
    fila.costo_compra, fila.valor_existencia;

  -- Gerencia ve TODAS las sedes: su trabajo es comparar una con otra.
  select count(*) into n from existencia_lotes where codigo = 'QA-L003';
  if n <> 1 then
    raise exception 'FALLA: gerencia deberia ver las dos sedes';
  end if;
  raise notice '  OK    y ve las dos sedes';
end $$;

-- ---- ESCRITURA POR ROL ------------------------------------------------------
\echo ''
\echo '6. Quien puede escribir que'

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';

do $$
declare
  n integer;
begin
  -- Desde 0023 nadie escribe en el libro directamente: el consumo lo anota
  -- la confirmacion (0021), junto con el saldo, o no se anota.
  begin
    insert into movimientos (lote_id, tipo, cantidad)
    values ('cccccccc-0000-0000-0000-000000000001', 'salida', -10);
    raise exception 'FALLA: el operario anoto una salida directamente en el libro';
  exception when insufficient_privilege then
    raise notice '  OK    el operario no anota salidas directas: el consumo lo anota la confirmacion';
  end;

  -- Ni da de alta compras.
  begin
    insert into lotes (codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra)
    values ('QA-L100', 'bbbbbbbb-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111', 100, 'GR', 1000);
    raise exception 'FALLA: el operario dio de alta un lote';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    pero no puede dar de alta una compra';
  end;

  /*
   * Ni se sube el sueldo.
   *
   * OJO A LA ASIMETRIA DE POSTGRESQL, que esta prueba tuvo que aprender a
   * golpes: un `insert` que incumple el `with check` de una politica LANZA un
   * error, pero un `update` cuyo `using` no encaja con ninguna fila NO lanza
   * nada. Simplemente no toca ninguna fila.
   *
   * Esperar una excepcion aqui daba un falso NEGATIVO: la prueba se ponia roja
   * con la seguridad intacta. Y el dia que alguien la "arreglara" al reves
   * -capturando cualquier salida como buena- se pondria verde con la seguridad
   * rota. Lo que hay que comprobar no es la forma del rechazo, es el EFECTO:
   * cero filas tocadas, y el rol sigue siendo el mismo.
   */
  begin
    update perfiles set rol = 'gerencia' where id = auth.uid();
    get diagnostics n = row_count;
  exception when others then
    n := 0;   -- Si ademas lanza, mejor: tambien es un rechazo.
  end;

  if n <> 0 then
    raise exception 'FALLA: el operario cambio % fila(s) de perfil', n;
  end if;
  if privado.mi_rol() <> 'operario' then
    raise exception 'FALLA: el operario se cambio el rol a si mismo (ahora es %)', privado.mi_rol();
  end if;
  raise notice '  OK    ni cambiarse el rol a si mismo (0 filas, sigue siendo %)', privado.mi_rol();
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';

do $$
declare
  r jsonb;
begin
  -- Ni siquiera el jefe de obrador escribe la tabla: ni alta ni correccion.
  begin
    insert into lotes (codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra)
    values ('QA-L101', 'bbbbbbbb-0000-0000-0000-000000000001',
            '11111111-1111-1111-1111-111111111111', 100, 'GR', 1000);
    raise exception 'FALLA: el jefe de obrador dio de alta un lote saltandose la API';
  exception when insufficient_privilege then
    raise notice '  OK    el jefe de obrador no da de alta lotes en la tabla';
  end;
  begin
    update lotes set existencia = 0 where codigo = 'QA-L001';
    raise exception 'FALLA: el jefe de obrador cambio una existencia saltandose la API';
  exception when insufficient_privilege then
    raise notice '  OK    ni cambia una existencia sin su movimiento';
  end;

  -- La compra entra por la API, en SU sede: la sede la pone la sesion.
  r := public.operacion_ejecutar(jsonb_build_object('id', 'eeeeeeee-6666-4000-8000-000000000001',
    'accion', 'registrar_lote', 'revision', 0, 'datos', jsonb_build_object(
      'ingrediente_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'unidad', 'GR', 'peso_compra', 100, 'costo_compra', 1000)));
  perform set_config('qa.lote_api', r #>> '{resultado,lote,codigo}', false);
  raise notice '  OK    el jefe de obrador da de alta compras por la API, siempre en su sede';

  -- Y no pone precios: eso es de gerencia.
  begin
    insert into precios (ingrediente_id, valor, vigente_desde)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 5, current_date);
    raise exception 'FALLA: el jefe de obrador puso un precio';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    ni pone precios';
  end;
end $$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.session_id;
reset request.jwt.claim.aal;

-- -----------------------------------------------------------------------------
--  7. AUDITORIA
-- -----------------------------------------------------------------------------

\echo ''
\echo '7. Queda rastro de quien toco que'

do $$
declare
  n integer;
  quien uuid;
begin
  select count(*) into n from auditoria where tabla = 'lotes';
  if n = 0 then
    raise exception 'FALLA: no se registro ningun cambio sobre `lotes`';
  end if;

  -- El alta la escribe una funcion de la API, pero el autor sigue siendo
  -- quien la pidio, no la funcion.
  select actor into quien from auditoria
  where tabla = 'lotes' and accion = 'INSERT' and despues ->> 'codigo' = current_setting('qa.lote_api');
  if quien is distinct from 'aaaaaaaa-0000-0000-0000-000000000002'::uuid then
    raise exception 'FALLA: el autor registrado es % y deberia ser el jefe de obrador', quien;
  end if;

  -- Y el saldo nunca se separa de su libro: la base lo comprueba al confirmar.
  begin
    update lotes set existencia = existencia - 1 where codigo = 'QA-L001';
    set constraints all immediate;
    raise exception 'FALLA: un saldo quedo distinto de la suma de su libro';
  exception when check_violation then
    raise notice '  OK    un saldo distinto de la suma de su libro no se puede confirmar';
  end;

  raise notice '  OK    % cambios registrados, con el autor que los hizo', n;
end $$;

-- -----------------------------------------------------------------------------
--  8. LA API SOLO PUBLICA LO QUE DEBE (0008)
-- -----------------------------------------------------------------------------
--
--  Lo que exige el asesor de Supabase, comprobado contra el catalogo despues de
--  aplicar todas las migraciones y no leyendo el SQL.

\echo ''
\echo '8. La API solo publica lo que debe'

do $$
declare
  n integer;
  nombres text;
begin
  select count(*), string_agg(c.relname, ', ') into n, nombres
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any (c.reloptions), false);
  if n <> 0 then
    raise exception 'FALLA: vistas que se saltan la seguridad de quien consulta: %', nombres;
  end if;
  raise notice '  OK    todas las vistas de `public` son `security_invoker`';

  select count(*), string_agg(p.proname, ', ') into n, nombres
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute');
  if n <> 0 then
    raise exception 'FALLA: funciones `security definer` que la API deja llamar: %', nombres;
  end if;
  raise notice '  OK    ninguna funcion `security definer` de `public` se puede llamar por la API';

  select count(*), string_agg(p.proname, ', ') into n, nombres
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'privado' and has_function_privilege('anon', p.oid, 'execute');
  if n <> 0 then
    raise exception 'FALLA: sin sesion se pueden ejecutar funciones privadas: %', nombres;
  end if;
  raise notice '  OK    y sin sesion no se ejecuta ninguna funcion de `privado`';

  select count(*), string_agg(distinct a.tablename, ', ') into n, nombres
  from pg_policies a join pg_policies b
    on a.schemaname = b.schemaname and a.tablename = b.tablename and a.policyname < b.policyname
  where a.schemaname = 'public'
    and a.permissive = 'PERMISSIVE' and b.permissive = 'PERMISSIVE'
    and (a.cmd = b.cmd or a.cmd = 'ALL' or b.cmd = 'ALL');
  if n <> 0 then
    raise exception 'FALLA: tablas con dos politicas para la misma accion: %', nombres;
  end if;
  raise notice '  OK    ninguna tabla evalua dos politicas para la misma accion';
end $$;

-- ---- UNA BAJA CORTA LOS DATOS EN EL MOMENTO (0009) ---------------------------
--
-- El testigo de quien dan de baja sigue valiendo hasta que vence. Lo que tiene
-- que pasar es que la base de datos deje de entregarle nada aunque lo presente.

update perfiles set activo = false where id = 'aaaaaaaa-0000-0000-0000-000000000004';

set role authenticated;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
begin
  select count(*) into n from ingredientes;
  if n = 0 then
    raise exception 'FALLA: un operario activo no ve el catalogo';
  end if;
  raise notice '  OK    un perfil activo lee el catalogo (% ingredientes)', n;
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000004';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000004';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
  propio integer;
begin
  select (select count(*) from ingredientes) + (select count(*) from sedes)
       + (select count(*) from recetas) + (select count(*) from proveedores)
       + (select count(*) from conversiones)
    into n;
  if n <> 0 then
    raise exception 'FALLA: un perfil dado de baja sigue leyendo % filas', n;
  end if;

  select count(*) into propio from perfiles where id = auth.uid();
  if propio <> 1 then
    raise exception 'FALLA: la baja no puede leer su propio perfil, y la entrada no sabria decir por que';
  end if;
  raise notice '  OK    dado de baja, con el testigo aun valido, no lee nada salvo su propio perfil';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-00000000dead';
set request.jwt.claim.session_id = '';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
begin
  select (select count(*) from ingredientes) + (select count(*) from sedes) into n;
  if n <> 0 then
    raise exception 'FALLA: una sesion sin perfil lee % filas', n;
  end if;
  raise notice '  OK    y una sesion sin perfil tampoco';
end $$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.session_id;
reset request.jwt.claim.aal;
update perfiles set activo = true where id = 'aaaaaaaa-0000-0000-0000-000000000004';

-- ---- VERIFICACION EN DOS PASOS, TURNO DE 6 HORAS Y ALTAS (0010) --------------

-- Una cuenta nueva de Auth nace DESACTIVADA, y una anonima no recibe perfil.
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000006', 'nuevo@qa-test');
insert into auth.users (id, email, is_anonymous) values ('aaaaaaaa-0000-0000-0000-000000000007', null, true);

do $$
begin
  if (select activo from perfiles where id = 'aaaaaaaa-0000-0000-0000-000000000006') is distinct from false then
    raise exception 'FALLA: una cuenta nueva nace activa';
  end if;
  if exists (select 1 from perfiles where id = 'aaaaaaaa-0000-0000-0000-000000000007') then
    raise exception 'FALLA: una cuenta anonima recibio perfil';
  end if;
  raise notice '  OK    una cuenta nueva nace desactivada, y una anonima no recibe perfil';
end $$;

set role authenticated;

-- Gerencia que solo entro con el PIN.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  fila record;
  n integer;
begin
  select * into fila from existencia_lotes where codigo = 'QA-L001';
  if fila.existencia is null then
    raise exception 'FALLA: gerencia sin verificar no ve ni la existencia de su sede';
  end if;
  if fila.costo_compra is not null then
    raise exception 'FALLA: gerencia ve costos sin verificacion en dos pasos';
  end if;
  select count(*) into n from existencia_lotes where codigo = 'QA-L003';
  if n <> 0 then
    raise exception 'FALLA: gerencia sin verificar ve la bodega de otra sede';
  end if;
  raise notice '  OK    gerencia con solo el PIN ve su sede, sin costos ni otras sedes';
end $$;

-- Administracion: sin verificar no activa a nadie; verificada si.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000005';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
begin
  update perfiles set activo = true where id = 'aaaaaaaa-0000-0000-0000-000000000006';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLA: un administrador con solo el PIN activo un usuario';
  end if;
  raise notice '  OK    administracion con solo el PIN no activa usuarios';
end $$;

set request.jwt.claim.aal = 'aal2';
do $$
declare
  n integer;
begin
  update perfiles set activo = true where id = 'aaaaaaaa-0000-0000-0000-000000000006';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLA: un administrador verificado no pudo activar un usuario';
  end if;
  raise notice '  OK    administracion verificada en dos pasos si activa';
end $$;

-- Un operario activo pero con el turno de hace 7 horas.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-0000000000ff';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
begin
  select (select count(*) from ingredientes) + (select count(*) from existencia_lotes) into n;
  if n <> 0 then
    raise exception 'FALLA: una sesion de hace 7 horas sigue leyendo % filas', n;
  end if;
  if (select count(*) from perfiles where id = auth.uid()) <> 1 then
    raise exception 'FALLA: con el turno vencido no se lee ni el propio perfil';
  end if;
  raise notice '  OK    pasadas 6 horas la sesion no lee nada salvo su propio perfil';
end $$;

-- Y la sesion de otra persona no sirve aunque este vigente.
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
do $$
declare
  n integer;
begin
  select count(*) into n from ingredientes;
  if n <> 0 then
    raise exception 'FALLA: una sesion ajena da acceso';
  end if;
  raise notice '  OK    ni con la sesion de otra persona';
end $$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.session_id;
reset request.jwt.claim.aal;

-- ---- AREA DE PRODUCCION Y EQUIPO QUE SE PUEDE ASIGNAR (0011 y 0012) ---------

update perfiles set area = 'PANADERÍA' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
-- Un segundo operario con area, que luego se da de baja, y un turno vencido
-- del jefe de obrador.
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000008', 'baja@qa-test');
update perfiles set rol = 'operario', sede_id = '11111111-1111-1111-1111-111111111111', activo = false,
  area = 'GALLETAS' where id = 'aaaaaaaa-0000-0000-0000-000000000008';
insert into auth.sessions (id, user_id, created_at) values
  ('dddddddd-0000-0000-0000-0000000000fe', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '7 hours');

do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'equipo_produccion') <> 3 then
    raise exception 'FALLA: la vista del equipo no entrega exactamente id, nombre y area';
  end if;
  raise notice '  OK    la vista del equipo tiene solo tres columnas: id, nombre y area';
end $$;

do $$
begin
  begin
    update perfiles set area = 'CAFÉ' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLA: se acepto un area que no existe';
  exception when check_violation then
    raise notice '  OK    un perfil solo admite las tres areas de produccion';
  end;
end $$;

set role authenticated;

-- El jefe de obrador ve a su equipo activo, con el area, y a nadie de otra sede.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000002';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
  area_operario text;
begin
  select count(*) into n from equipo_produccion
    where id = 'aaaaaaaa-0000-0000-0000-000000000004';
  if n <> 0 then
    raise exception 'FALLA: el jefe de obrador ve trabajadores de otra sede';
  end if;
  select area into area_operario from equipo_produccion
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if area_operario is distinct from 'PANADERÍA' then
    raise exception 'FALLA: el jefe de obrador no ve el area del operario (%)', area_operario;
  end if;
  if (select count(*) from perfiles) <> 1 then
    raise exception 'FALLA: la vista del equipo abrio tambien la tabla de perfiles';
  end if;
  update perfiles set area = 'GALLETAS' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLA: el jefe de obrador cambio el area de alguien';
  end if;
  raise notice '  OK    el jefe de obrador lista su equipo con el area, sin abrir perfiles ni cambiarlos';

  if exists (select 1 from equipo_produccion where id in (
      'aaaaaaaa-0000-0000-0000-000000000003',   -- gerencia, sin area
      'aaaaaaaa-0000-0000-0000-000000000008'))  -- dado de baja
  then
    raise exception 'FALLA: la lista trae a quien no tiene area o esta de baja';
  end if;
  raise notice '  OK    y no trae a quien no tiene area ni a quien esta de baja';
end $$;

-- El mismo jefe con un turno de hace 7 horas no lista a nadie.
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-0000000000fe';
do $$
begin
  if (select count(*) from equipo_produccion) <> 0 then
    raise exception 'FALLA: con el turno vencido se sigue listando al equipo';
  end if;
  raise notice '  OK    con el turno vencido no lista a nadie';
end $$;

-- El operario no lista a nadie.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000001';
do $$
begin
  if (select count(*) from equipo_produccion) <> 0 then
    raise exception 'FALLA: un operario lista al equipo';
  end if;
  raise notice '  OK    un operario no lista al equipo';
end $$;

-- Solo administracion verificada cambia el area: con solo el PIN, no.
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000005';
set request.jwt.claim.aal = 'aal1';
do $$
declare
  n integer;
begin
  update perfiles set area = 'GALLETAS' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FALLA: administracion con solo el PIN cambio el area';
  end if;
  raise notice '  OK    administracion con solo el PIN no cambia el area';
end $$;

set request.jwt.claim.aal = 'aal2';
do $$
declare
  n integer;
begin
  update perfiles set area = 'GALLETAS' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FALLA: un administrador verificado no pudo cambiar el area';
  end if;
  raise notice '  OK    administracion verificada cambia el area';
end $$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.session_id;
reset request.jwt.claim.aal;

do $$
begin
  if has_table_privilege('anon', 'equipo_produccion', 'select')
     or has_table_privilege('authenticated', 'equipo_produccion', 'insert')
     or has_function_privilege('anon', 'privado.equipo_produccion()', 'execute') then
    raise exception 'FALLA: la vista del equipo concede mas de lo que debe';
  end if;
  raise notice '  OK    la vista del equipo es de solo lectura y cerrada sin sesion';
end $$;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: el esquema se comporta como dice.'
\echo '==========================================================='
\echo ''
