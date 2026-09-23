-- =============================================================================
--  0020 · EL PLAN DEL DIA Y SUS PREPARACIONES POR LA API
-- =============================================================================
--
--  Reglas de `src/core/produccion.js` y `src/core/preparacion.js`, ahora en el
--  servidor, que es el unico que decide:
--
--  EL MODELO
--  ---------
--  Cada fila de `plan_partidas` es una PARTIDA: unas tandas de una receta que
--  se confirman juntas. Si tiene `ejecucion_id`, ya se produjo; si no, esta
--  pendiente. De ahi sale todo sin guardar nada dos veces:
--    tandas del dia  = suma de las partidas de la receta
--    producido       = suma de las que tienen ejecucion
--    pendiente       = suma de las que no
--  La receta se guarda CONGELADA en la partida (su formula de ese momento): si
--  manana se edita el recetario, lo planeado sigue diciendo lo que se planeo.
--
--  LAS REGLAS
--  ----------
--  * Tandas entre 0,05 y 100, con hasta tres decimales. Cero quita la receta.
--  * Lo producido no se quita: el total nunca baja de lo ya confirmado.
--  * Lo que se anade a una receta ya producida es al menos 0,05 tandas.
--  * Las partidas pendientes suman exactamente lo pendiente.
--  * Un dia sin recetas y sin produccion no deja plan.
--  * Concurrencia por la revision del plan: quien la vio vieja recibe 409.
--  * Asignar es del jefe de obrador en adelante, a alguien de la misma area.
--    Un operario solo empieza o deja lo que tiene asignado. No se empieza un
--    dia que aun no llega, ni una receta que ya esta lista.
--
--  Se puede aplicar dos veces sin efectos.

alter table plan_partidas add column if not exists ejecucion_id uuid references ejecuciones (id) on delete restrict;
create index if not exists plan_partidas_ejecucion on plan_partidas (ejecucion_id) where ejecucion_id is not null;
create index if not exists plan_partidas_pendientes on plan_partidas (plan_id, receta_id) where ejecucion_id is null;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

--  La receta en la forma que usa el cliente (`recipes.json`), para congelarla.
create or replace function privado.receta_congelada(p_receta uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.codigo, 'nombre', r.nombre, 'categoria', r.categoria, 'metodo', r.metodo,
    'componentes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', c.nombre,
        'items', coalesce((select jsonb_agg(jsonb_build_object('ingrediente', i.nombre, 'cantidad', it.cantidad,
                                                               'unidad', it.unidad) order by it.orden)
                             from public.receta_items it join public.ingredientes i on i.id = it.ingrediente_id
                            where it.componente_id = c.id), '[]'::jsonb)) order by c.orden)
        from public.receta_componentes c where c.receta_id = r.id), '[]'::jsonb))
  from public.recetas r
  where r.id = p_receta
$$;

--  Tandas validas: 0,05 a 100, tres decimales. Cero solo si se permite.
create or replace function privado.validar_tandas(v numeric, campo text, cero_permitido boolean)
returns numeric
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if v = 0 and cero_permitido then
    return 0;
  end if;
  if v < 0.05 or v > 100 then
    perform privado.fallar('invalida', format('«%s» tiene que estar entre 0,05 y 100 tandas.', campo), 422);
  end if;
  if v <> round(v, 3) then
    perform privado.fallar('invalida', format('«%s» admite como máximo tres decimales.', campo), 422);
  end if;
  return v;
end $$;

--  El plan de la sede en esa fecha, bloqueado, comprobando la revision que se
--  vio. Sin plan, la revision vista tiene que ser 0.
create or replace function privado.plan_para_cambiar(ctx jsonb, p_fecha date, p_revision integer)
returns public.planes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.planes;
begin
  select * into p from public.planes
   where sede_id = (ctx ->> 'sede')::uuid and fecha = p_fecha
   for update;
  if not found then
    if p_revision <> 0 then
      perform privado.fallar('conflicto', 'La producción de este día cambió mientras tanto. Vuelve a cargar el día.', 409);
    end if;
    return null;
  end if;
  if p.revision <> p_revision then
    perform privado.fallar('conflicto', 'La producción de este día cambió mientras tanto. Vuelve a cargar el día.', 409);
  end if;
  return p;
end $$;

--  Estado de una receta del plan, como lo deduce el cliente.
create or replace function privado.receta_del_dia(p_plan uuid, p_receta uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with t as (
    select coalesce(sum(tandas), 0) as tandas,
           coalesce(sum(tandas) filter (where ejecucion_id is not null), 0) as producido,
           coalesce(sum(tandas) filter (where ejecucion_id is null), 0) as pendiente,
           coalesce(jsonb_agg(tandas order by partida) filter (where ejecucion_id is null), '[]'::jsonb) as partidas,
           (array_agg(receta order by partida))[1] as receta
      from public.plan_partidas where plan_id = p_plan and receta_id = p_receta)
  select jsonb_build_object(
    'receta_id', p_receta, 'codigo', t.receta ->> 'id', 'nombre', t.receta ->> 'nombre',
    'categoria', t.receta ->> 'categoria', 'tandas', t.tandas, 'producido', t.producido,
    'pendiente', t.pendiente, 'partidas', t.partidas,
    'estado', case when t.pendiente = 0 then 'lista'
                   when pr.iniciada is not null then 'en_preparacion' else 'pendiente' end,
    'preparacion', case when pr.receta_id is null then null else jsonb_build_object(
        'iniciada', pr.iniciada,
        'iniciada_por', case when pr.iniciada_por is null then null
                             else jsonb_build_object('id', pi.id, 'nombre', pi.nombre) end,
        'asignado', case when pr.asignado_a is null then null
                         else jsonb_build_object('id', pa.id, 'nombre', pa.nombre, 'area', pa.area) end) end)
  from t
  join public.planes pl on pl.id = p_plan
  left join public.preparaciones pr on pr.sede_id = pl.sede_id and pr.fecha = pl.fecha and pr.receta_id = p_receta
  left join public.perfiles pi on pi.id = pr.iniciada_por
  left join public.perfiles pa on pa.id = pr.asignado_a
$$;

create or replace function privado.plan_json(p_plan uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when pl.id is null then null else jsonb_build_object(
    'id', pl.id, 'fecha', pl.fecha, 'revision', pl.revision, 'responsable', pl.responsable,
    'motivo', pl.motivo, 'actualizado', pl.actualizado,
    'recetas', coalesce((select jsonb_agg(privado.receta_del_dia(pl.id, x.receta_id) order by x.area, x.nombre)
                           from (select receta_id, min(receta ->> 'categoria') as area, min(receta ->> 'nombre') as nombre
                                   from public.plan_partidas where plan_id = pl.id group by receta_id) x), '[]'::jsonb)) end
  from (select p_plan as id) q
  left join public.planes pl on pl.id = q.id
$$;

-- ---------------------------------------------------------------------------
-- fijar_receta: pone una receta en el plan con N tandas, o la quita (0)
-- ---------------------------------------------------------------------------

create or replace function privado.fijar_receta(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(d, 'fecha', true);
  v_receta uuid := privado.dato_uuid(d, 'receta_id', true);
  v_tandas numeric := privado.validar_tandas(privado.dato_numero(d, 'tandas', true, 3), 'tandas', true);
  v_motivo text := coalesce(privado.dato_texto(d, 'motivo', false, 280), 'Ajuste del plan');
  v_partidas numeric[];
  p public.planes;
  v_producido numeric;
  v_antes numeric;
  v_pendiente numeric;
  v_congelada jsonb;
  v_siguiente integer;
  v_nuevo boolean := false;
  x numeric;
  e jsonb;
begin
  p := privado.plan_para_cambiar(ctx, v_fecha, p_revision);

  if not exists (select 1 from public.recetas where id = v_receta and activa) then
    perform privado.fallar('invalida', 'Esa receta no existe o no está activa.', 422);
  end if;

  if p.id is null then
    if v_tandas = 0 then
      perform privado.fallar('invalida', 'Esa receta no está en la producción del día.', 422);
    end if;
    insert into public.planes (sede_id, fecha, responsable, motivo, autor_id)
    values ((ctx ->> 'sede')::uuid, v_fecha, ctx ->> 'responsable', v_motivo, (ctx ->> 'perfil')::uuid)
    on conflict (sede_id, fecha) do nothing
    returning * into p;
    if p.id is null then
      -- Otro lo creo entre tanto: la revision que vio esta pantalla ya es vieja.
      perform privado.fallar('conflicto', 'La producción de este día cambió mientras tanto. Vuelve a cargar el día.', 409);
    end if;
    v_nuevo := true;
  end if;

  select coalesce(sum(tandas), 0), coalesce(sum(tandas) filter (where ejecucion_id is not null), 0),
         (array_agg(receta order by partida))[1], coalesce(max(partida), 0) + 1
    into v_antes, v_producido, v_congelada, v_siguiente
    from public.plan_partidas where plan_id = p.id and receta_id = v_receta;

  if v_tandas = 0 and v_antes = 0 then
    perform privado.fallar('invalida', 'Esa receta no está en la producción del día.', 422);
  end if;
  if v_tandas < v_producido then
    perform privado.fallar('invalida', 'No puedes quitar tandas ya producidas. Puedes añadir producción adicional al mismo día.', 422);
  end if;
  v_pendiente := v_tandas - v_producido;
  if v_pendiente > 0 and v_pendiente < 0.05 then
    perform privado.fallar('invalida', 'La producción adicional debe ser de al menos 0,05 tandas.', 422);
  end if;

  -- Partidas de lo pendiente: por defecto una sola.
  if d ? 'partidas' and jsonb_typeof(d -> 'partidas') <> 'null' then
    if jsonb_typeof(d -> 'partidas') <> 'array' or jsonb_array_length(d -> 'partidas') > 2000 then
      perform privado.fallar('invalida', '«partidas» tiene que ser una lista de tandas.', 422);
    end if;
    v_partidas := '{}';
    for e in select value from jsonb_array_elements(d -> 'partidas') loop
      if jsonb_typeof(e) <> 'number' then
        perform privado.fallar('invalida', 'Cada partida tiene que ser un número de tandas.', 422);
      end if;
      v_partidas := array_append(v_partidas, privado.validar_tandas((e #>> '{}')::numeric, 'partidas', false));
    end loop;
  else
    v_partidas := case when v_pendiente > 0 then array[v_pendiente] else '{}'::numeric[] end;
  end if;
  if (select coalesce(sum(t), 0) from unnest(v_partidas) t) <> v_pendiente then
    perform privado.fallar('invalida', 'Las partidas tienen que sumar la cantidad pendiente de esta receta.', 422);
  end if;

  -- Se reemplazan solo las partidas pendientes; lo producido no se toca.
  delete from public.plan_partidas where plan_id = p.id and receta_id = v_receta and ejecucion_id is null;
  v_congelada := coalesce(v_congelada, privado.receta_congelada(v_receta));
  foreach x in array v_partidas loop
    insert into public.plan_partidas (plan_id, receta_id, partida, tandas, receta)
    values (p.id, v_receta, v_siguiente, x, v_congelada);
    v_siguiente := v_siguiente + 1;
  end loop;

  -- Una receta que sale del plan se lleva su seguimiento.
  if v_tandas = 0 then
    delete from public.preparaciones
     where sede_id = p.sede_id and fecha = p.fecha and receta_id = v_receta;
  end if;

  perform privado.anotar(ctx, 'plan_ajustado', v_fecha, v_motivo,
    jsonb_build_object('plan_id', p.id, 'receta_id', v_receta),
    jsonb_build_object('receta', v_congelada ->> 'nombre', 'tandas_antes', v_antes, 'tandas_despues', v_tandas,
                       'partidas', to_jsonb(v_partidas)));

  -- Sin recetas y sin produccion, el dia no tiene plan.
  if not exists (select 1 from public.plan_partidas where plan_id = p.id) then
    delete from public.planes where id = p.id;
    return jsonb_build_object('fecha', v_fecha, 'plan', null);
  end if;

  update public.planes
     set revision = revision + case when v_nuevo then 0 else 1 end, responsable = ctx ->> 'responsable', motivo = v_motivo,
         autor_id = (ctx ->> 'perfil')::uuid, actualizado = now()
   where id = p.id;

  return jsonb_build_object('fecha', v_fecha, 'plan', privado.plan_json(p.id));
end $$;

-- ---------------------------------------------------------------------------
-- Preparaciones
-- ---------------------------------------------------------------------------

--  La receta del plan de ese dia, con su estado, o 422 si no esta.
create or replace function privado.receta_en_plan(ctx jsonb, p_fecha date, p_receta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan uuid;
begin
  select id into v_plan from public.planes where sede_id = (ctx ->> 'sede')::uuid and fecha = p_fecha;
  if v_plan is null or not exists (select 1 from public.plan_partidas where plan_id = v_plan and receta_id = p_receta) then
    perform privado.fallar('invalida', 'Esa receta no está en la producción del día.', 422);
  end if;
  return privado.receta_del_dia(v_plan, p_receta) || jsonb_build_object('plan_id', v_plan);
end $$;

--  Un operario solo trabaja lo que tiene asignado.
create or replace function privado.exigir_trabajo(ctx jsonb, r jsonb)
returns void
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
begin
  if not privado.es_al_menos('obrador'::public.rol)
     and (r #>> '{preparacion,asignado,id}') is distinct from (ctx ->> 'perfil') then
    perform privado.fallar('sin_permiso', 'Esta receta no está asignada a ti.', 403);
  end if;
end $$;

create or replace function privado.iniciar_preparacion(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(d, 'fecha', true);
  v_receta uuid := privado.dato_uuid(d, 'receta_id', true);
  r jsonb := privado.receta_en_plan(ctx, v_fecha, v_receta);
begin
  perform privado.exigir_trabajo(ctx, r);
  if v_fecha > (ctx ->> 'hoy')::date then
    perform privado.fallar('invalida', 'Esta producción es de un día que aún no llega. Se empieza el día programado.', 422);
  end if;
  if r ->> 'estado' = 'lista' then
    perform privado.fallar('invalida', 'Esta receta ya está lista.', 422);
  end if;
  if r ->> 'estado' = 'pendiente' then
    insert into public.preparaciones (sede_id, fecha, receta_id, iniciada, iniciada_por)
    values ((ctx ->> 'sede')::uuid, v_fecha, v_receta, now(), (ctx ->> 'perfil')::uuid)
    on conflict (sede_id, fecha, receta_id)
      do update set iniciada = now(), iniciada_por = (ctx ->> 'perfil')::uuid, actualizada = now();
    perform privado.anotar(ctx, 'preparacion_iniciada', v_fecha, 'Empezó a producir',
      jsonb_build_object('receta_id', v_receta), '{}');
  end if;
  return jsonb_build_object('receta', privado.receta_del_dia((r ->> 'plan_id')::uuid, v_receta));
end $$;

create or replace function privado.cancelar_preparacion(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(d, 'fecha', true);
  v_receta uuid := privado.dato_uuid(d, 'receta_id', true);
  r jsonb := privado.receta_en_plan(ctx, v_fecha, v_receta);
begin
  perform privado.exigir_trabajo(ctx, r);
  if r ->> 'estado' <> 'en_preparacion' then
    perform privado.fallar('invalida', 'Esta receta no está en preparación.', 422);
  end if;
  update public.preparaciones set iniciada = null, iniciada_por = null, actualizada = now()
   where sede_id = (ctx ->> 'sede')::uuid and fecha = v_fecha and receta_id = v_receta;
  perform privado.anotar(ctx, 'preparacion_cancelada', v_fecha, 'Dejó de producir',
    jsonb_build_object('receta_id', v_receta), '{}');
  return jsonb_build_object('receta', privado.receta_del_dia((r ->> 'plan_id')::uuid, v_receta));
end $$;

create or replace function privado.asignar_preparacion(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(d, 'fecha', true);
  v_receta uuid := privado.dato_uuid(d, 'receta_id', true);
  v_persona uuid := privado.dato_uuid(d, 'persona_id', false);
  r jsonb := privado.receta_en_plan(ctx, v_fecha, v_receta);
  v_area text;
begin
  if r ->> 'estado' = 'lista' then
    perform privado.fallar('invalida', 'Esta receta ya está lista: no se puede cambiar quién la saca.', 422);
  end if;
  if v_persona is not null then
    select area into v_area from public.perfiles
     where id = v_persona and activo and sede_id = (ctx ->> 'sede')::uuid;
    if v_area is null then
      perform privado.fallar('invalida', 'Elige un trabajador activo de tu sede con área de producción asignada.', 422);
    end if;
    if v_area <> r ->> 'categoria' then
      perform privado.fallar('invalida', 'Ese trabajador es de otra área. Asigna la receta a alguien de su área.', 422);
    end if;
  end if;
  if (r #>> '{preparacion,asignado,id}') is not distinct from v_persona::text then
    return jsonb_build_object('receta', r - 'plan_id');
  end if;

  insert into public.preparaciones (sede_id, fecha, receta_id, asignado_a, asignado_por)
  values ((ctx ->> 'sede')::uuid, v_fecha, v_receta, v_persona,
          case when v_persona is null then null else (ctx ->> 'perfil')::uuid end)
  on conflict (sede_id, fecha, receta_id)
    do update set asignado_a = excluded.asignado_a, asignado_por = excluded.asignado_por, actualizada = now();
  perform privado.anotar(ctx, 'receta_asignada', v_fecha,
    case when v_persona is null then 'Sin asignar' else 'Asignada' end,
    jsonb_build_object('receta_id', v_receta),
    jsonb_build_object('antes', r #> '{preparacion,asignado,id}', 'despues', v_persona));
  return jsonb_build_object('receta', privado.receta_del_dia((r ->> 'plan_id')::uuid, v_receta));
end $$;

-- ---------------------------------------------------------------------------
-- Consulta: el dia
-- ---------------------------------------------------------------------------

create or replace function privado.consultar_dia(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(q, 'fecha', true);
  v_plan uuid;
begin
  select id into v_plan from public.planes where sede_id = (ctx ->> 'sede')::uuid and fecha = v_fecha;
  return jsonb_build_object('fecha', v_fecha, 'plan', case when v_plan is null then null else privado.plan_json(v_plan) end);
end $$;

-- ---------------------------------------------------------------------------
-- Registro y permisos
-- ---------------------------------------------------------------------------

insert into privado.acciones (accion, funcion, rol_minimo, descripcion) values
  ('fijar_receta', 'privado.fijar_receta', 'obrador', 'Pone una receta en el plan del dia con N tandas, o la quita'),
  ('iniciar_preparacion', 'privado.iniciar_preparacion', 'operario', 'Empieza a producir una receta del dia'),
  ('cancelar_preparacion', 'privado.cancelar_preparacion', 'operario', 'Devuelve una receta en preparacion a pendiente'),
  ('asignar_preparacion', 'privado.asignar_preparacion', 'obrador', 'Asigna una receta del dia a un trabajador de su area')
on conflict (accion) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('dia', 'privado.consultar_dia', 'operario', 'Plan del dia con el estado de cada receta y sus preparaciones')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

revoke all on function privado.receta_congelada(uuid), privado.validar_tandas(numeric, text, boolean),
  privado.plan_para_cambiar(jsonb, date, integer), privado.receta_del_dia(uuid, uuid), privado.plan_json(uuid),
  privado.fijar_receta(jsonb, integer, jsonb), privado.receta_en_plan(jsonb, date, uuid),
  privado.exigir_trabajo(jsonb, jsonb), privado.iniciar_preparacion(jsonb, integer, jsonb),
  privado.cancelar_preparacion(jsonb, integer, jsonb), privado.asignar_preparacion(jsonb, integer, jsonb),
  privado.consultar_dia(jsonb, jsonb)
  from public, anon, authenticated;
