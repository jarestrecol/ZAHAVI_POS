-- =============================================================================
--  0003 · ALMACEN, PRODUCCION Y PRECIOS
-- =============================================================================
--
--  LA DECISION QUE SOSTIENE TODO ESTE ARCHIVO
--  ------------------------------------------
--  La existencia de un lote NO es una columna. Es la SUMA de un libro de
--  movimientos que no se puede modificar ni borrar.
--
--  Con una columna `existencia` que se sobrescribe hay tres preguntas que no
--  tienen respuesta, y son justo las que pide gerencia:
--
--      ¿cuanto habia el 3 de marzo?
--      ¿quien sacó esos ocho kilos, y para que produccion?
--      ¿por que la cifra de ayer no cuadra con la de hoy?
--
--  Con un libro inmutable, las tres se contestan con una consulta y el historico
--  no hay que construirlo aparte: ya esta escrito. El precio que se paga es que
--  corregir un error obliga a anotar el movimiento contrario en vez de editar el
--  original, y eso es exactamente lo que hace una contabilidad seria.

-- -----------------------------------------------------------------------------
--  PROVEEDORES
-- -----------------------------------------------------------------------------

create table if not exists proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  contacto text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
--  LOTES: cada compra concreta
-- -----------------------------------------------------------------------------
--
--  Un lote es UNA COMPRA, no un producto. Dos bultos de harina comprados con dos
--  meses de diferencia son dos lotes con dos precios, y de cual salga cambia el
--  costo de la tanda. Por eso el costeo consume lote a lote y no con un precio
--  medio: el promedio no corresponde a ninguna compra real y se mueve solo cada
--  vez que entra mercancia.

create table if not exists lotes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  ingrediente_id uuid not null references ingredientes (id) on delete restrict,
  sede_id uuid not null references sedes (id) on delete restrict,
  proveedor_id uuid references proveedores (id) on delete set null,

  presentacion text,
  peso_compra numeric(14, 3) not null,
  unidad text not null,
  costo_compra numeric(14, 2) not null,

  -- EL VALOR POR UNIDAD DE MEDIDA LO CALCULA LA BASE DE DATOS.
  --
  -- Es una columna generada, no un campo que alguien teclea ni un numero que
  -- calcula el navegador. Asi no puede quedarse desfasada respecto al costo, y
  -- no existe la posibilidad de que dos pantallas ensenen cifras distintas por
  -- redondear cada una a su manera.
  valor_unitario numeric(18, 6)
    generated always as (costo_compra / peso_compra) stored,

  lote_proveedor text,
  vencimiento date,
  recibido_en timestamptz not null default now(),
  creado_por uuid references perfiles (id) on delete restrict,

  constraint lotes_peso_positivo check (peso_compra > 0),
  constraint lotes_costo_no_negativo check (costo_compra >= 0),
  constraint lotes_unidad_limpia check (unidad = upper(btrim(unidad)))
);

create index if not exists lotes_ingrediente_idx on lotes (ingrediente_id);
create index if not exists lotes_sede_idx on lotes (sede_id);
-- Para FEFO: lo que vence antes, primero. Los que no declaran fecha van al
-- final, que es lo correcto: sin fecha no hay urgencia conocida.
create index if not exists lotes_fefo_idx on lotes (ingrediente_id, vencimiento nulls last);

-- -----------------------------------------------------------------------------
--  PRODUCCIONES
-- -----------------------------------------------------------------------------
--
--  Se declara ANTES que `movimientos` porque el movimiento apunta aqui: toda
--  salida de bodega por produccion queda atada a la produccion que la consumio.
--  Es lo que permite responder "cuanto costo hacer esto" sin estimar nada.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'produccion_estado') then
    create type produccion_estado as enum ('planeada', 'en_proceso', 'terminada', 'cancelada');
  end if;
end $$;

create table if not exists producciones (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  receta_id uuid not null references recetas (id) on delete restrict,
  -- El multiplicador de tanda, el mismo concepto que ya usa el recetario.
  factor numeric(8, 3) not null default 1,
  sede_id uuid not null references sedes (id) on delete restrict,
  estado produccion_estado not null default 'planeada',
  nota text,
  creado_por uuid references perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  terminada_en timestamptz,

  constraint producciones_factor_positivo check (factor > 0),
  constraint producciones_terminada_con_fecha check (
    (estado = 'terminada' and terminada_en is not null)
    or (estado <> 'terminada' and terminada_en is null)
  )
);

-- El indice que sostiene los informes por periodo: se consulta siempre por
-- fecha y por sede.
create index if not exists producciones_fecha_idx on producciones (fecha, sede_id);

-- -----------------------------------------------------------------------------
--  MOVIMIENTOS: el libro inmutable
-- -----------------------------------------------------------------------------
--
--  `cantidad` va CON SIGNO y una restriccion ata el signo al tipo. Asi la
--  existencia es literalmente `sum(cantidad)` -sin condicionales, sin poder
--  equivocarse al sumar- y a la vez no se puede anotar una entrada negativa ni
--  una salida positiva, que serian dos formas silenciosas de descuadrar la
--  bodega.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'movimiento_tipo') then
    create type movimiento_tipo as enum ('entrada', 'salida', 'merma', 'devolucion', 'ajuste');
  end if;
end $$;

create table if not exists movimientos (
  id bigint generated always as identity primary key,
  lote_id uuid not null references lotes (id) on delete restrict,
  tipo movimiento_tipo not null,
  cantidad numeric(14, 3) not null,
  produccion_id uuid references producciones (id) on delete restrict,
  motivo text,
  creado_por uuid references perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),

  constraint movimientos_signo_coherente check (
    (tipo in ('entrada', 'devolucion') and cantidad > 0)
    or (tipo in ('salida', 'merma') and cantidad < 0)
    -- El ajuste es el unico que puede ir en los dos sentidos: es la correccion
    -- de un conteo fisico. Lo que no puede es ser cero.
    or (tipo = 'ajuste' and cantidad <> 0)
  ),
  -- Una salida por produccion tiene que decir POR CUAL. Sin esto, el costo de
  -- una tanda seria una estimacion y no un hecho.
  constraint movimientos_produccion_solo_en_salidas check (
    produccion_id is null or tipo in ('salida', 'devolucion')
  ),
  -- Un ajuste sin explicacion es un descuadre sin explicacion.
  constraint movimientos_ajuste_con_motivo check (
    tipo <> 'ajuste' or (motivo is not null and btrim(motivo) <> '')
  )
);

create index if not exists movimientos_lote_idx on movimientos (lote_id);
create index if not exists movimientos_produccion_idx on movimientos (produccion_id);
create index if not exists movimientos_fecha_idx on movimientos (creado_en);

/*
 * EL LIBRO NO SE CORRIGE: SE ANOTA AL REVES.
 *
 * Las politicas de seguridad ya no conceden `update` ni `delete` sobre esta
 * tabla, pero eso solo alcanza a quien pasa por ellas: el dueno de la tabla y
 * cualquier conexion con la clave de servicio las esquivan. Este disparador es
 * la segunda cerradura, y es la que de verdad hace inmutable el historico.
 *
 * Si alguna vez hace falta borrar de verdad -una migracion, un dato de prueba-,
 * se desactiva el disparador a proposito y queda en el historial de migraciones
 * que alguien lo hizo.
 */
create or replace function movimientos_inmutables()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Los movimientos no se modifican ni se borran. Para corregir uno, anota un movimiento de ajuste con su motivo.';
end $$;

drop trigger if exists movimientos_sin_cambios on movimientos;
create trigger movimientos_sin_cambios
  before update or delete on movimientos
  for each row execute function movimientos_inmutables();

-- -----------------------------------------------------------------------------
--  CONSUMOS DE PRODUCCION: el costo congelado
-- -----------------------------------------------------------------------------
--
--  `costo_unitario` se copia AQUI en el momento de consumir, y no se vuelve a
--  mirar el lote.
--
--  Es la diferencia entre una contabilidad y una hoja de calculo: si manana se
--  corrige el precio de aquella compra -porque llego la factura definitiva, o
--  porque alguien tecleo un cero de mas-, el margen del trimestre pasado NO
--  puede moverse. Un informe que cambia cuando se mira otra vez no sirve para
--  tomar decisiones.

create table if not exists produccion_consumos (
  id bigint generated always as identity primary key,
  produccion_id uuid not null references producciones (id) on delete cascade,
  lote_id uuid not null references lotes (id) on delete restrict,
  ingrediente_id uuid not null references ingredientes (id) on delete restrict,
  cantidad numeric(14, 3) not null,
  unidad text not null,
  costo_unitario numeric(18, 6) not null,
  costo numeric(14, 2) generated always as (round(cantidad * costo_unitario, 2)) stored,
  creado_en timestamptz not null default now(),

  constraint consumos_cantidad_positiva check (cantidad > 0),
  constraint consumos_costo_no_negativo check (costo_unitario >= 0)
);

create index if not exists consumos_produccion_idx on produccion_consumos (produccion_id);
create index if not exists consumos_ingrediente_idx on produccion_consumos (ingrediente_id);

-- -----------------------------------------------------------------------------
--  PRECIOS CON VIGENCIA
-- -----------------------------------------------------------------------------
--
--  El precio de referencia de un ingrediente a lo largo del tiempo, que no es lo
--  mismo que lo que costo un lote concreto. Sirve para valorar, comparar y ver
--  como se mueve el gasto sin depender de que haya habido compra ese mes.
--
--  LA RESTRICCION `exclude` ES LA PIEZA IMPORTANTE. Impide que un mismo
--  ingrediente tenga dos precios solapados en el tiempo, que es el error que
--  convierte un historico en algo que no se puede consultar: preguntar "cuanto
--  valia el 3 de marzo" devolveria dos respuestas y ninguna seria la buena.
--  `vigente_hasta` nulo significa "sigue vigente".

create table if not exists precios (
  id bigint generated always as identity primary key,
  ingrediente_id uuid not null references ingredientes (id) on delete cascade,
  -- Siempre en la unidad BASE del ingrediente: un precio por unidad que no se
  -- sabe cual es no vale para nada.
  valor numeric(14, 4) not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  fuente text,
  creado_por uuid references perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),

  constraint precios_valor_no_negativo check (valor >= 0),
  constraint precios_periodo_coherente check (
    vigente_hasta is null or vigente_hasta > vigente_desde
  ),
  constraint precios_sin_solape exclude using gist (
    ingrediente_id with =,
    daterange(vigente_desde, vigente_hasta, '[)') with &&
  )
);

create index if not exists precios_ingrediente_idx on precios (ingrediente_id, vigente_desde desc);
