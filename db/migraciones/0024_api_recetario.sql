-- =============================================================================
--  0024 · EL RECETARIO VIVE EN LA BASE, CON VERSIONES (F3-10, servidor)
-- =============================================================================
--
--  Hasta hoy el recetario se leia de `data/recipes.json` y se «publicaba»
--  haciendo un commit en GitHub desde el navegador (`api/recipes.js`). Eso se
--  retira (F5-4, decision F1-D): el recetario se lee y se edita aqui.
--
--  * `operacion_leer({tipo:'recetario'})` devuelve las recetas en la MISMA
--    forma que `recipes.json` (id = codigo, nombre, categoria, metodo,
--    componentes con sus items), mas `receta_id` y `revision`, y el catalogo
--    de ingredientes. Es lo que la app carga al abrir.
--  * `guardar_receta` reemplaza la receta entera (como el editor) y deja una
--    VERSION nueva con la formula completa, quien y por que. Nada se pierde:
--    cada version queda en `receta_versiones`.
--  * Concurrencia por `revision`: dos editores no se pisan (409).
--  * Una receta no se borra (los planes y ejecuciones la citan): se desactiva.
--  * Lo planeado y lo confirmado NO cambian al editar: guardan su formula
--    congelada (0020/0021).
--  * El catalogo deja de escribirse directamente: solo por estas funciones.
--
--  Precios y conversiones (0003/0002) no los usa la operacion: el costo sale
--  del lote. Quedan como estan, solo para gerencia.
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 1. Revision y versiones
-- ---------------------------------------------------------------------------

alter table recetas add column if not exists revision integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recetas_revision_positiva') then
    alter table recetas add constraint recetas_revision_positiva check (revision > 0);
  end if;
end $$;

create table if not exists receta_versiones (
  receta_id uuid not null references recetas (id) on delete restrict,
  version integer not null check (version > 0),
  contenido jsonb not null,
  motivo text not null,
  responsable text not null,
  autor_id uuid references perfiles (id) on delete restrict,
  creada timestamptz not null default now(),
  primary key (receta_id, version)
);

alter table receta_versiones enable row level security;
drop policy if exists receta_versiones_lectura on receta_versiones;
create policy receta_versiones_lectura on receta_versiones for select to authenticated
  using (privado.es_al_menos('obrador'::rol));
revoke all on table receta_versiones from anon, authenticated;
grant select on table receta_versiones to authenticated;

--  La version 1 de cada receta que ya existe: el recetario publicado que se
--  cargo desde `recipes.json` (verificado identico en F1-D).
insert into receta_versiones (receta_id, version, contenido, motivo, responsable)
select r.id, r.revision, privado.receta_congelada(r.id),
       'Versión inicial: recetario publicado migrado a la base', 'Migración'
  from recetas r
 where not exists (select 1 from receta_versiones v where v.receta_id = r.id);

-- ---------------------------------------------------------------------------
-- 2. Lectura
-- ---------------------------------------------------------------------------

create or replace function privado.receta_json(p_receta uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select privado.receta_congelada(r.id)
         || jsonb_build_object('receta_id', r.id, 'revision', r.revision, 'activa', r.activa,
                               'actualizado', r.actualizado_en)
  from public.recetas r where r.id = p_receta
$$;

create or replace function privado.consultar_recetario(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_inactivas boolean := false;
begin
  if q ? 'incluir_inactivas' then
    if jsonb_typeof(q -> 'incluir_inactivas') <> 'boolean' then
      perform privado.fallar('invalida', '«incluir_inactivas» tiene que ser true o false.', 422);
    end if;
    v_inactivas := (q ->> 'incluir_inactivas')::boolean;
  end if;
  return jsonb_build_object(
    'recetas', coalesce((select jsonb_agg(privado.receta_json(r.id) order by r.codigo collate "C")
                           from public.recetas r where r.activa or v_inactivas), '[]'::jsonb),
    'ingredientes', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'nombre', i.nombre, 'unidad', i.unidad_base)
                                               order by i.nombre collate "C")
                                from public.ingredientes i where i.activo), '[]'::jsonb));
end $$;

create or replace function privado.consultar_versiones_receta(ctx jsonb, q jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('receta_id', privado.dato_uuid(q, 'receta_id', true), 'versiones', coalesce((
    select jsonb_agg(jsonb_build_object('version', v.version, 'creada', v.creada, 'responsable', v.responsable,
                                        'motivo', v.motivo, 'contenido', v.contenido) order by v.version desc)
      from public.receta_versiones v where v.receta_id = privado.dato_uuid(q, 'receta_id', true)), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- 3. Guardar una receta: la receta entera, como el editor
-- ---------------------------------------------------------------------------

create or replace function privado.guardar_receta(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := privado.dato_uuid(d, 'receta_id', false);
  v_nombre text := upper(privado.dato_texto(d, 'nombre', true, 160));
  v_categoria text := upper(privado.dato_texto(d, 'categoria', true, 20));
  v_metodo text := '';
  v_motivo text := coalesce(privado.dato_texto(d, 'motivo', false, 280), 'Cambio de receta');
  v_rinde jsonb;
  r public.recetas;
  c jsonb;
  it jsonb;
  v_orden_c integer := 0;
  v_orden_i integer;
  v_componente uuid;
  v_ingrediente uuid;
  v_ing_nombre text;
  v_unidad text;
  v_cantidad numeric;
  v_lineas integer := 0;
begin
  if v_categoria <> all (array['PASTELERÍA', 'PANADERÍA', 'GALLETAS']) then
    perform privado.fallar('invalida', 'La categoría tiene que ser PASTELERÍA, PANADERÍA o GALLETAS.', 422);
  end if;
  -- El metodo es texto con saltos de linea: no se le juntan los espacios.
  if d ? 'metodo' and jsonb_typeof(d -> 'metodo') <> 'null' then
    if jsonb_typeof(d -> 'metodo') <> 'string' or length(d ->> 'metodo') > 20000 then
      perform privado.fallar('invalida', 'El método tiene que ser texto de hasta 20000 caracteres.', 422);
    end if;
    v_metodo := btrim(d ->> 'metodo');
  end if;
  -- Dos comprobaciones separadas: SQL no garantiza que `or` corte, y medir
  -- algo que no es una lista seria un error de la base en vez de un 422.
  if jsonb_typeof(d -> 'componentes') is distinct from 'array' then
    perform privado.fallar('invalida', 'La receta necesita una lista de componentes.', 422);
  end if;
  if jsonb_array_length(d -> 'componentes') not between 1 and 50 then
    perform privado.fallar('invalida', 'La receta necesita entre 1 y 50 componentes.', 422);
  end if;

  if v_id is null then
    if p_revision <> 0 then
      perform privado.fallar('invalida', 'Una receta nueva se registra con revision 0.', 422);
    end if;
    -- El codigo R### es estable y nunca se reutiliza; se serializa su calculo.
    perform pg_advisory_xact_lock(hashtext('receta_codigo'));
    insert into public.recetas (codigo, nombre, categoria, metodo, creado_por, actualizado_por)
    values ('R' || lpad((coalesce((select max(substring(codigo from '^R(\d+)$')::int) from public.recetas), 0) + 1)::text, 3, '0'),
            v_nombre, v_categoria, v_metodo, (ctx ->> 'perfil')::uuid, (ctx ->> 'perfil')::uuid)
    returning * into r;
  else
    select * into r from public.recetas where id = v_id for update;
    if not found then
      perform privado.fallar('no_existe', 'Esa receta no existe.', 404);
    end if;
    if r.revision <> p_revision then
      perform privado.fallar('conflicto', 'Esta receta cambió mientras la editabas. Vuelve a abrirla y repite el cambio.', 409);
    end if;
    delete from public.receta_componentes where receta_id = r.id;
    update public.recetas
       set nombre = v_nombre, categoria = v_categoria, metodo = v_metodo, revision = revision + 1,
           actualizado_por = (ctx ->> 'perfil')::uuid, actualizado_en = now()
     where id = r.id
     returning * into r;
  end if;

  -- Componentes e items, en el orden en que vienen.
  for c in select value from jsonb_array_elements(d -> 'componentes') loop
    v_orden_c := v_orden_c + 1;
    if jsonb_typeof(c) <> 'object' or jsonb_typeof(c -> 'items') is distinct from 'array' then
      perform privado.fallar('invalida', format('El componente %s no tiene una lista de ingredientes.', v_orden_c), 422);
    end if;
    insert into public.receta_componentes (receta_id, nombre, orden)
    values (r.id, coalesce(upper(privado.dato_texto(c, 'nombre', false, 80)), 'PRINCIPAL'), v_orden_c)
    returning id into v_componente;

    v_orden_i := 0;
    for it in select value from jsonb_array_elements(c -> 'items') loop
      v_orden_i := v_orden_i + 1;
      v_ing_nombre := upper(privado.dato_texto(it, 'ingrediente', true, 120));
      v_unidad := upper(privado.dato_texto(it, 'unidad', true, 10));
      v_cantidad := privado.dato_numero(it, 'cantidad', true, 3);
      if v_cantidad <= 0 then
        perform privado.fallar('invalida', format('La cantidad de %s tiene que ser mayor que cero.', v_ing_nombre), 422);
      end if;
      -- Un ingrediente nuevo entra al catalogo con la unidad con que se uso.
      insert into public.ingredientes (nombre, unidad_base) values (v_ing_nombre, v_unidad)
      on conflict (nombre) do update set activo = true
      returning id into v_ingrediente;
      insert into public.receta_items (componente_id, ingrediente_id, cantidad, unidad, orden)
      values (v_componente, v_ingrediente, v_cantidad, v_unidad, v_orden_i);
      v_lineas := v_lineas + 1;
    end loop;
  end loop;
  if v_lineas = 0 then
    perform privado.fallar('invalida', 'La receta necesita al menos un ingrediente.', 422);
  end if;

  -- El rendimiento sale del nombre ("X 10 UND"), como siempre.
  v_rinde := privado.rendimiento_previsto(v_nombre, 1);
  update public.recetas
     set rendimiento_cantidad = (v_rinde ->> 'cantidad')::numeric, rendimiento_unidad = v_rinde ->> 'unidad'
   where id = r.id;

  insert into public.receta_versiones (receta_id, version, contenido, motivo, responsable, autor_id)
  values (r.id, r.revision, privado.receta_congelada(r.id), v_motivo, ctx ->> 'responsable', (ctx ->> 'perfil')::uuid);

  perform privado.anotar(ctx, 'receta_guardada', (ctx ->> 'hoy')::date, v_motivo,
    jsonb_build_object('receta_id', r.id, 'codigo', r.codigo), jsonb_build_object('version', r.revision));

  return jsonb_build_object('receta', privado.receta_json(r.id));
end $$;

create or replace function privado.activar_receta(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := privado.dato_uuid(d, 'receta_id', true);
  v_motivo text := privado.dato_texto(d, 'motivo', true, 280);
  r public.recetas;
begin
  if jsonb_typeof(d -> 'activa') is distinct from 'boolean' then
    perform privado.fallar('invalida', '«activa» tiene que ser true o false.', 422);
  end if;
  select * into r from public.recetas where id = v_id for update;
  if not found then
    perform privado.fallar('no_existe', 'Esa receta no existe.', 404);
  end if;
  if r.revision <> p_revision then
    perform privado.fallar('conflicto', 'Esta receta cambió mientras tanto. Vuelve a abrirla.', 409);
  end if;
  update public.recetas set activa = (d ->> 'activa')::boolean, revision = revision + 1,
         actualizado_por = (ctx ->> 'perfil')::uuid, actualizado_en = now()
   where id = r.id returning * into r;
  insert into public.receta_versiones (receta_id, version, contenido, motivo, responsable, autor_id)
  values (r.id, r.revision, privado.receta_congelada(r.id) || jsonb_build_object('activa', r.activa),
          v_motivo, ctx ->> 'responsable', (ctx ->> 'perfil')::uuid);
  perform privado.anotar(ctx, case when r.activa then 'receta_activada' else 'receta_desactivada' end,
    (ctx ->> 'hoy')::date, v_motivo, jsonb_build_object('receta_id', r.id, 'codigo', r.codigo), '{}');
  return jsonb_build_object('receta', privado.receta_json(r.id));
end $$;

-- ---------------------------------------------------------------------------
-- 4. El catalogo solo se escribe por aqui
-- ---------------------------------------------------------------------------

drop policy if exists recetas_alta on recetas;
drop policy if exists recetas_cambio on recetas;
drop policy if exists recetas_baja on recetas;
drop policy if exists componentes_alta on receta_componentes;
drop policy if exists componentes_cambio on receta_componentes;
drop policy if exists componentes_baja on receta_componentes;
drop policy if exists items_alta on receta_items;
drop policy if exists items_cambio on receta_items;
drop policy if exists items_baja on receta_items;
drop policy if exists ingredientes_alta on ingredientes;
drop policy if exists ingredientes_cambio on ingredientes;
drop policy if exists ingredientes_baja on ingredientes;

revoke insert, update, delete, truncate on table recetas, receta_componentes, receta_items, ingredientes
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registro y permisos
-- ---------------------------------------------------------------------------

insert into privado.acciones (accion, funcion, rol_minimo, descripcion) values
  ('guardar_receta', 'privado.guardar_receta', 'obrador', 'Crea o reemplaza una receta y deja una version nueva'),
  ('activar_receta', 'privado.activar_receta', 'obrador', 'Activa o desactiva una receta; nunca se borra')
on conflict (accion) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('recetario', 'privado.consultar_recetario', 'operario', 'Recetas en la forma de recipes.json, con revision, y el catalogo de ingredientes'),
  ('versiones_receta', 'privado.consultar_versiones_receta', 'obrador', 'Historial de versiones de una receta')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

revoke all on function privado.receta_json(uuid), privado.consultar_recetario(jsonb, jsonb),
  privado.consultar_versiones_receta(jsonb, jsonb), privado.guardar_receta(jsonb, integer, jsonb),
  privado.activar_receta(jsonb, integer, jsonb)
  from public, anon, authenticated;
