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

-- El disparador de 0001 crea el perfil con rol `operario`; luego se ajusta.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'operario@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'obrador@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'gerencia@qa-test'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'otrasede@qa-test');

update perfiles set rol = 'operario', sede_id = '11111111-1111-1111-1111-111111111111'
  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update perfiles set rol = 'obrador', sede_id = '11111111-1111-1111-1111-111111111111'
  where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update perfiles set rol = 'gerencia', sede_id = '11111111-1111-1111-1111-111111111111'
  where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update perfiles set rol = 'operario', sede_id = '22222222-2222-2222-2222-222222222222'
  where id = 'aaaaaaaa-0000-0000-0000-000000000004';

insert into ingredientes (id, nombre, unidad_base) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'QA-TEST-HARINA', 'GR'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'QA-TEST-AGUA', 'GR');

-- Dos lotes del mismo ingrediente a precios MUY distintos, uno de ellos vencido.
insert into lotes (id, codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra, vencimiento) values
  ('cccccccc-0000-0000-0000-000000000001', 'QA-L001', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1000, 'GR', 10000, current_date + 90),
  ('cccccccc-0000-0000-0000-000000000002', 'QA-L002', 'bbbbbbbb-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 1000, 'GR', 20000, current_date - 5),
  -- Un lote de la OTRA sede, para comprobar el aislamiento.
  ('cccccccc-0000-0000-0000-000000000003', 'QA-L003', 'bbbbbbbb-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 500, 'GR', 5000, null);

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

do $$
declare
  fila record;
  n integer;
begin
  if mi_rol() <> 'operario' then
    raise exception 'FALLA: se esperaba operario y es %', mi_rol();
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

do $$
declare
  n integer;
begin
  -- El operario registra consumo: es quien esta delante de la bascula.
  insert into movimientos (lote_id, tipo, cantidad)
  values ('cccccccc-0000-0000-0000-000000000001', 'salida', -10);
  raise notice '  OK    el operario puede anotar una salida por produccion';

  -- Pero no da de alta compras.
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
  if mi_rol() <> 'operario' then
    raise exception 'FALLA: el operario se cambio el rol a si mismo (ahora es %)', mi_rol();
  end if;
  raise notice '  OK    ni cambiarse el rol a si mismo (0 filas, sigue siendo %)', mi_rol();
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000002';

do $$
begin
  insert into lotes (codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra)
  values ('QA-L101', 'bbbbbbbb-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111', 100, 'GR', 1000);
  raise notice '  OK    el jefe de obrador si da de alta compras';

  -- Pero no en la sede ajena.
  begin
    insert into lotes (codigo, ingrediente_id, sede_id, peso_compra, unidad, costo_compra)
    values ('QA-L102', 'bbbbbbbb-0000-0000-0000-000000000001',
            '22222222-2222-2222-2222-222222222222', 100, 'GR', 1000);
    raise exception 'FALLA: se dio de alta un lote en otra sede';
  exception when others then
    if sqlerrm like 'FALLA:%' then raise; end if;
    raise notice '  OK    pero no en la bodega de la otra sede';
  end;

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

  select actor into quien from auditoria
  where tabla = 'lotes' and accion = 'INSERT' and despues ->> 'codigo' = 'QA-L101';
  if quien is distinct from 'aaaaaaaa-0000-0000-0000-000000000002'::uuid then
    raise exception 'FALLA: el autor registrado es % y deberia ser el jefe de obrador', quien;
  end if;

  raise notice '  OK    % cambios registrados, con el autor que los hizo', n;
end $$;

\echo ''
\echo '==========================================================='
\echo ' RESULTADO: el esquema se comporta como dice.'
\echo '==========================================================='
\echo ''
