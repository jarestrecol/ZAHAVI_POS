-- =============================================================================
--  0008 · API PRIVADA: LO QUE SEÑALA EL ASESOR DE SUPABASE
-- =============================================================================
--
--  El asesor del proyecto real marcaba 7 errores criticos y varios avisos. Este
--  archivo los resuelve SIN CAMBIAR QUIEN VE QUE: las mismas personas leen las
--  mismas filas y el costo sigue enmascarado por rol. Lo que cambia es DONDE
--  vive la logica que lo decide.
--
--  1. LAS 7 VISTAS `security definer` (ERROR, "critical")
--  ------------------------------------------------------
--  0004 las declaro asi a proposito: hay que ocultar COLUMNAS de dinero a quien
--  si puede ver la fila, y eso no lo hace la seguridad por filas. La decision era
--  correcta y estaba probada. El problema es la forma: una vista `definer` en el
--  esquema que publica la API se salta la seguridad por filas de forma
--  silenciosa, y el asesor no puede distinguir una que filtra de una que no.
--
--  El patron que recomienda Supabase separa las dos cosas:
--
--      privado.<vista>()   funcion `security definer` con la misma consulta de
--                          0004: filtra por sede y enmascara el dinero. El
--                          esquema `privado` NO lo publica la API.
--      public.<vista>      vista `security_invoker` que solo lee esa funcion.
--
--  La aplicacion sigue consultando las mismas vistas con las mismas columnas.
--
--  EL PRECIO, DICHO CLARO: PostgreSQL no puede meter los filtros de quien
--  consulta (`where fecha = ...`) dentro de una funcion `security definer`, asi
--  que cada consulta calcula la vista entera de la sede y despues filtra. Con el
--  volumen de una panaderia no se nota. Para el historico largo
--  (`movimientos_historico`) la salida prevista son consultas con parametros y
--  paginadas, que ya pide `docs/plan-operacion-auditable.md`.
--
--  2. `mi_rol()` Y `mi_sede()` EJECUTABLES POR HTTP (WARN)
--  ------------------------------------------------------
--  Las cuatro funciones de autorizacion pasan a `privado`. Las politicas guardan
--  la referencia a la funcion por identificador y no por nombre, asi que siguen
--  funcionando sin tocarlas. Lo que si hay que reescribir son los CUERPOS que las
--  llaman por nombre, y eso se hace aqui abajo.
--
--  3. RENDIMIENTO
--  --------------
--  - `perfiles_lectura` evaluaba `auth.uid()` por cada fila: pasa a `(select ...)`.
--  - Siete tablas tenian una politica `for all` de escritura que TAMBIEN cubria
--    la lectura, asi que cada `select` evaluaba dos politicas. Se parte en
--    alta, cambio y baja, con la misma regla que antes.
--  - Once claves foraneas sin indice.
--
--  LO QUE NO SE PUEDE ARREGLAR DESDE AQUI: la proteccion contra contrasenas
--  filtradas es de los planes de pago de Supabase, y ademas rechazaria muchos PIN
--  numericos de 6 digitos.

-- -----------------------------------------------------------------------------
--  1. EL ESQUEMA PRIVADO
-- -----------------------------------------------------------------------------

create schema if not exists privado;

revoke all on schema privado from public;
grant usage on schema privado to authenticated;

-- Que toda funcion nueva de este esquema nazca cerrada, igual que en `public`
-- desde 0006.
alter default privileges in schema privado revoke execute on functions from public;

-- -----------------------------------------------------------------------------
--  2. LAS FUNCIONES DE AUTORIZACION, FUERA DE LA API
-- -----------------------------------------------------------------------------
--
--  Se mueven en vez de recrearse: moverlas conserva su identificador, y las
--  politicas de 0005 apuntan a ese identificador. Recrearlas obligaria a
--  reescribir todas las politicas.

do $$
declare
  firma text;
begin
  foreach firma in array array['mi_rol()', 'mi_sede()', 'es_al_menos(rol)', 'es_mi_sede(uuid)']
  loop
    if to_regprocedure('public.' || firma) is not null then
      execute format('alter function public.%s set schema privado', firma);
    end if;
  end loop;
end $$;

-- Los cuerpos llaman a las otras por nombre: se reescriben con el esquema
-- explicito para no depender de la ruta de busqueda.
create or replace function privado.mi_rol()
returns rol
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function privado.mi_sede()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sede_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function privado.es_al_menos(minimo rol)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(privado.mi_rol() >= minimo, false)
$$;

create or replace function privado.es_mi_sede(sede uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select privado.es_al_menos('gerencia') or (sede is not null and sede = privado.mi_sede())
$$;

-- -----------------------------------------------------------------------------
--  3. LAS VISTAS: LOGICA EN `privado`, LECTURA EN `public`
-- -----------------------------------------------------------------------------
--
--  Se borran y se crean de nuevo en vez de reemplazarse porque las columnas
--  numericas pierden su precision declarada al pasar por una funcion, y
--  `create or replace view` no admite cambiar el tipo de una columna. Sin
--  `cascade`: si algo inesperado dependiera de ellas, la migracion tiene que
--  fallar y no llevarselo por delante en silencio.

drop view if exists
  existencia_ingredientes,
  receta_costo_actual,
  precio_vigente,
  gasto_diario,
  produccion_costos,
  movimientos_historico,
  existencia_lotes;

-- ---- Existencia por lote ----------------------------------------------------

create or replace function privado.existencia_lotes()
returns table (
  lote_id uuid,
  codigo text,
  ingrediente_id uuid,
  ingrediente text,
  unidad_base text,
  sede_id uuid,
  unidad text,
  presentacion text,
  lote_proveedor text,
  proveedor_id uuid,
  peso_compra numeric,
  vencimiento date,
  existencia numeric,
  costo_compra numeric,
  valor_unitario numeric,
  valor_existencia numeric,
  estado_vencimiento text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    l.id,
    l.codigo,
    l.ingrediente_id,
    i.nombre,
    i.unidad_base,
    l.sede_id,
    l.unidad,
    l.presentacion,
    l.lote_proveedor,
    l.proveedor_id,
    l.peso_compra,
    l.vencimiento,
    coalesce(sum(m.cantidad), 0),
    case when privado.es_al_menos('gerencia') then l.costo_compra end,
    case when privado.es_al_menos('gerencia') then l.valor_unitario end,
    case when privado.es_al_menos('gerencia')
      then round(coalesce(sum(m.cantidad), 0) * l.valor_unitario, 2)
    end,
    case
      when l.vencimiento is null then 'sin_fecha'
      when l.vencimiento < current_date then 'vencido'
      when l.vencimiento <= current_date + 30 then 'proximo'
      else 'ok'
    end
  from public.lotes l
  join public.ingredientes i on i.id = l.ingrediente_id
  left join public.movimientos m on m.lote_id = l.id
  where privado.es_mi_sede(l.sede_id)
  group by l.id, i.nombre, i.unidad_base
$$;

create or replace view existencia_lotes with (security_invoker = true) as
select * from privado.existencia_lotes();

-- ---- Existencia por ingrediente ---------------------------------------------

create or replace function privado.existencia_ingredientes()
returns table (
  ingrediente_id uuid,
  ingrediente text,
  unidad text,
  sede_id uuid,
  existencia numeric,
  disponible numeric,
  lotes_con_existencia bigint,
  lotes_vencidos bigint,
  lotes_proximos bigint,
  valor_existencia numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    el.ingrediente_id,
    el.ingrediente,
    el.unidad,
    el.sede_id,
    sum(el.existencia),
    sum(el.existencia) filter (where el.estado_vencimiento <> 'vencido'),
    count(*) filter (where el.existencia > 0),
    count(*) filter (where el.estado_vencimiento = 'vencido' and el.existencia > 0),
    count(*) filter (where el.estado_vencimiento = 'proximo' and el.existencia > 0),
    case when privado.es_al_menos('gerencia') then sum(el.valor_existencia) end
  from privado.existencia_lotes() el
  where privado.es_mi_sede(el.sede_id)
  group by el.ingrediente_id, el.ingrediente, el.unidad, el.sede_id
$$;

create or replace view existencia_ingredientes with (security_invoker = true) as
select * from privado.existencia_ingredientes();

-- ---- Costo de cada produccion -----------------------------------------------

create or replace function privado.produccion_costos()
returns table (
  produccion_id uuid,
  fecha date,
  sede_id uuid,
  receta_id uuid,
  receta_codigo text,
  receta text,
  factor numeric,
  estado produccion_estado,
  lineas bigint,
  costo numeric,
  costo_por_tanda numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.fecha,
    p.sede_id,
    p.receta_id,
    r.codigo,
    r.nombre,
    p.factor,
    p.estado,
    count(c.id),
    case when privado.es_al_menos('gerencia') then coalesce(sum(c.costo), 0) end,
    case when privado.es_al_menos('gerencia') and p.factor > 0
      then round(coalesce(sum(c.costo), 0) / p.factor, 2)
    end
  from public.producciones p
  join public.recetas r on r.id = p.receta_id
  left join public.produccion_consumos c on c.produccion_id = p.id
  where privado.es_mi_sede(p.sede_id)
  group by p.id, r.codigo, r.nombre
$$;

create or replace view produccion_costos with (security_invoker = true) as
select * from privado.produccion_costos();

-- ---- Gasto diario -------------------------------------------------------------

create or replace function privado.gasto_diario()
returns table (
  fecha date,
  sede_id uuid,
  costo numeric,
  producciones bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.fecha,
    p.sede_id,
    sum(c.costo),
    count(distinct p.id)
  from public.producciones p
  join public.produccion_consumos c on c.produccion_id = p.id
  where p.estado = 'terminada'
    and privado.es_al_menos('gerencia')
    and privado.es_mi_sede(p.sede_id)
  group by p.fecha, p.sede_id
$$;

create or replace view gasto_diario with (security_invoker = true) as
select * from privado.gasto_diario();

-- ---- Precio vigente -----------------------------------------------------------

create or replace function privado.precio_vigente()
returns table (
  ingrediente_id uuid,
  valor numeric,
  vigente_desde date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.ingrediente_id, p.valor, p.vigente_desde
  from public.precios p
  where (p.vigente_hasta is null or p.vigente_hasta > current_date)
    and privado.es_al_menos('gerencia')
$$;

create or replace view precio_vigente with (security_invoker = true) as
select * from privado.precio_vigente();

-- ---- Costo teorico de una receta --------------------------------------------

create or replace function privado.receta_costo_actual()
returns table (
  receta_id uuid,
  codigo text,
  nombre text,
  item_id uuid,
  ingrediente_id uuid,
  ingrediente text,
  cantidad numeric,
  unidad text,
  unidad_base text,
  factor numeric,
  cantidad_base numeric,
  precio_unitario numeric,
  costo numeric,
  problema text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.id,
    r.codigo,
    r.nombre,
    ri.id,
    i.id,
    i.nombre,
    ri.cantidad,
    ri.unidad,
    i.unidad_base,
    case
      when ri.unidad = i.unidad_base then 1::numeric
      when cv.aprobado_en is not null then cv.factor
    end,
    case
      when ri.unidad = i.unidad_base then ri.cantidad
      when cv.aprobado_en is not null then ri.cantidad * cv.factor
    end,
    pv.valor,
    case
      when pv.valor is null then null
      when ri.unidad = i.unidad_base then round(ri.cantidad * pv.valor, 2)
      when cv.aprobado_en is not null then round(ri.cantidad * cv.factor * pv.valor, 2)
    end,
    case
      when pv.valor is null then 'sin_precio'
      when ri.unidad <> i.unidad_base and cv.id is null then 'sin_conversion'
      when ri.unidad <> i.unidad_base and cv.aprobado_en is null then 'conversion_sin_aprobar'
    end
  from public.recetas r
  join public.receta_componentes rc on rc.receta_id = r.id
  join public.receta_items ri on ri.componente_id = rc.id
  join public.ingredientes i on i.id = ri.ingrediente_id
  left join public.conversiones cv
    on cv.ingrediente_id = i.id and cv.desde_unidad = ri.unidad
  left join privado.precio_vigente() pv on pv.ingrediente_id = i.id
  where privado.es_al_menos('gerencia')
$$;

create or replace view receta_costo_actual with (security_invoker = true) as
select * from privado.receta_costo_actual();

-- ---- Historico de movimientos ------------------------------------------------

create or replace function privado.movimientos_historico()
returns table (
  id bigint,
  creado_en timestamptz,
  tipo movimiento_tipo,
  cantidad numeric,
  lote text,
  sede_id uuid,
  ingrediente text,
  unidad text,
  produccion_id uuid,
  receta text,
  motivo text,
  quien text,
  valor numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    m.id,
    m.creado_en,
    m.tipo,
    m.cantidad,
    l.codigo,
    l.sede_id,
    i.nombre,
    l.unidad,
    m.produccion_id,
    r.codigo,
    m.motivo,
    pf.nombre,
    case when privado.es_al_menos('gerencia')
      then round(abs(m.cantidad) * l.valor_unitario, 2)
    end
  from public.movimientos m
  join public.lotes l on l.id = m.lote_id
  join public.ingredientes i on i.id = l.ingrediente_id
  left join public.producciones p on p.id = m.produccion_id
  left join public.recetas r on r.id = p.receta_id
  left join public.perfiles pf on pf.id = m.creado_por
  where privado.es_mi_sede(l.sede_id)
$$;

create or replace view movimientos_historico with (security_invoker = true) as
select * from privado.movimientos_historico();

-- ---- Permisos del esquema privado --------------------------------------------
--
--  `authenticated` necesita ejecutar estas funciones porque las vistas
--  `security_invoker` las llaman con los permisos de quien consulta. Eso no las
--  publica: la API solo sirve los esquemas configurados, y `privado` no es uno.

revoke execute on all functions in schema privado from public, anon;

grant execute on function
  privado.mi_rol(),
  privado.mi_sede(),
  privado.es_al_menos(rol),
  privado.es_mi_sede(uuid),
  privado.existencia_lotes(),
  privado.existencia_ingredientes(),
  privado.produccion_costos(),
  privado.gasto_diario(),
  privado.precio_vigente(),
  privado.receta_costo_actual(),
  privado.movimientos_historico()
to authenticated;

grant select on
  existencia_lotes,
  existencia_ingredientes,
  produccion_costos,
  gasto_diario,
  precio_vigente,
  receta_costo_actual,
  movimientos_historico
to authenticated;

-- -----------------------------------------------------------------------------
--  4. POLITICAS: UNA POR ACCION Y SIN REEVALUAR POR FILA
-- -----------------------------------------------------------------------------
--
--  Las comprobaciones de rol van dentro de `(select ...)`: no dependen de la
--  fila, asi que PostgreSQL las calcula una vez por consulta y no una por fila.

drop policy if exists perfiles_lectura on perfiles;
create policy perfiles_lectura on perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select privado.es_al_menos('gerencia')));

-- ---- Sedes y perfiles: administracion ---------------------------------------

drop policy if exists sedes_escritura on sedes;
drop policy if exists sedes_alta on sedes;
drop policy if exists sedes_cambio on sedes;
drop policy if exists sedes_baja on sedes;
create policy sedes_alta on sedes
  for insert to authenticated
  with check ((select privado.es_al_menos('admin')));
create policy sedes_cambio on sedes
  for update to authenticated
  using ((select privado.es_al_menos('admin')))
  with check ((select privado.es_al_menos('admin')));
create policy sedes_baja on sedes
  for delete to authenticated
  using ((select privado.es_al_menos('admin')));

drop policy if exists perfiles_admin on perfiles;
drop policy if exists perfiles_alta on perfiles;
drop policy if exists perfiles_cambio on perfiles;
drop policy if exists perfiles_baja on perfiles;
create policy perfiles_alta on perfiles
  for insert to authenticated
  with check ((select privado.es_al_menos('admin')));
create policy perfiles_cambio on perfiles
  for update to authenticated
  using ((select privado.es_al_menos('admin')))
  with check ((select privado.es_al_menos('admin')));
create policy perfiles_baja on perfiles
  for delete to authenticated
  using ((select privado.es_al_menos('admin')));

-- ---- Catalogo y recetas: jefe de obrador para arriba ------------------------

drop policy if exists ingredientes_escritura on ingredientes;
drop policy if exists ingredientes_alta on ingredientes;
drop policy if exists ingredientes_cambio on ingredientes;
drop policy if exists ingredientes_baja on ingredientes;
create policy ingredientes_alta on ingredientes
  for insert to authenticated
  with check ((select privado.es_al_menos('obrador')));
create policy ingredientes_cambio on ingredientes
  for update to authenticated
  using ((select privado.es_al_menos('obrador')))
  with check ((select privado.es_al_menos('obrador')));
create policy ingredientes_baja on ingredientes
  for delete to authenticated
  using ((select privado.es_al_menos('obrador')));

drop policy if exists recetas_escritura on recetas;
drop policy if exists recetas_alta on recetas;
drop policy if exists recetas_cambio on recetas;
drop policy if exists recetas_baja on recetas;
create policy recetas_alta on recetas
  for insert to authenticated
  with check ((select privado.es_al_menos('obrador')));
create policy recetas_cambio on recetas
  for update to authenticated
  using ((select privado.es_al_menos('obrador')))
  with check ((select privado.es_al_menos('obrador')));
create policy recetas_baja on recetas
  for delete to authenticated
  using ((select privado.es_al_menos('obrador')));

drop policy if exists componentes_escritura on receta_componentes;
drop policy if exists componentes_alta on receta_componentes;
drop policy if exists componentes_cambio on receta_componentes;
drop policy if exists componentes_baja on receta_componentes;
create policy componentes_alta on receta_componentes
  for insert to authenticated
  with check ((select privado.es_al_menos('obrador')));
create policy componentes_cambio on receta_componentes
  for update to authenticated
  using ((select privado.es_al_menos('obrador')))
  with check ((select privado.es_al_menos('obrador')));
create policy componentes_baja on receta_componentes
  for delete to authenticated
  using ((select privado.es_al_menos('obrador')));

drop policy if exists items_escritura on receta_items;
drop policy if exists items_alta on receta_items;
drop policy if exists items_cambio on receta_items;
drop policy if exists items_baja on receta_items;
create policy items_alta on receta_items
  for insert to authenticated
  with check ((select privado.es_al_menos('obrador')));
create policy items_cambio on receta_items
  for update to authenticated
  using ((select privado.es_al_menos('obrador')))
  with check ((select privado.es_al_menos('obrador')));
create policy items_baja on receta_items
  for delete to authenticated
  using ((select privado.es_al_menos('obrador')));

drop policy if exists proveedores_escritura on proveedores;
drop policy if exists proveedores_alta on proveedores;
drop policy if exists proveedores_cambio on proveedores;
drop policy if exists proveedores_baja on proveedores;
create policy proveedores_alta on proveedores
  for insert to authenticated
  with check ((select privado.es_al_menos('obrador')));
create policy proveedores_cambio on proveedores
  for update to authenticated
  using ((select privado.es_al_menos('obrador')))
  with check ((select privado.es_al_menos('obrador')));
create policy proveedores_baja on proveedores
  for delete to authenticated
  using ((select privado.es_al_menos('obrador')));

-- -----------------------------------------------------------------------------
--  5. INDICES DE LAS CLAVES FORANEAS
-- -----------------------------------------------------------------------------
--
--  Sin ellos, borrar o cambiar la fila apuntada obliga a recorrer la tabla
--  entera buscando quien la referencia, y los `join` de los informes no tienen
--  por donde entrar.

create index if not exists conversiones_aprobado_por_idx on conversiones (aprobado_por);
create index if not exists lotes_creado_por_idx on lotes (creado_por);
create index if not exists lotes_proveedor_idx on lotes (proveedor_id);
create index if not exists movimientos_creado_por_idx on movimientos (creado_por);
create index if not exists precios_creado_por_idx on precios (creado_por);
create index if not exists consumos_lote_idx on produccion_consumos (lote_id);
create index if not exists producciones_creado_por_idx on producciones (creado_por);
create index if not exists producciones_receta_idx on producciones (receta_id);
create index if not exists producciones_sede_idx on producciones (sede_id);
create index if not exists recetas_actualizado_por_idx on recetas (actualizado_por);
create index if not exists recetas_creado_por_idx on recetas (creado_por);
