-- =============================================================================
--  0022 · NOTAS, RESULTADOS Y METAS POR LA API
-- =============================================================================
--
--  Ultima capa de escrituras (F3-3). Reglas de `src/core/notas.js`,
--  `src/core/resultados-produccion.js` y `src/core/bi/metas.js`:
--
--  NOTAS. Escribir, cambiar o borrar es del jefe de obrador en adelante. La
--  unica excepcion: quien tiene la nota asignada puede marcarla hecha, y solo
--  eso. Solo tareas y pendientes se pueden marcar. Una nota es para todos, para
--  un area o para una persona, nunca para dos destinos. Revision por nota.
--
--  RESULTADOS. Una medicion por receta y confirmacion. Quien confirmo registra
--  la primera; corregir o registrar la de otro es del jefe de obrador. Si el
--  nombre congelado dice cuanto rinde ("X 10 UND"), la medida y lo esperado
--  salen de ahi, no de la pantalla. Una perdida, una diferencia o una
--  correccion exigen motivo.
--
--  METAS. Solo gerencia. Nunca se editan: cada cambio es una version nueva con
--  su fecha, y el panel lee la vigente. El presupuesto y el umbral de alza de
--  precio son dinero (asi los marca el cliente): los demas roles no los leen.
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 0. Las dos metas con dinero, fuera del alcance de quien no es gerencia
-- ---------------------------------------------------------------------------
--  0015 solo ocultaba el presupuesto; el cliente marca tambien `alzaPrecio`.

drop policy if exists metas_lectura on metas;
create policy metas_lectura on metas for select to authenticated
  using (privado.es_mi_sede(sede_id)
         and (clave not in ('presupuestoMensual', 'alzaPrecio') or privado.es_al_menos('gerencia'::rol)));

create or replace function privado.sin_dinero(j jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  r jsonb;
  k text;
  v jsonb;
begin
  if jsonb_typeof(j) = 'object' then
    r := '{}';
    for k, v in select * from jsonb_each(j) loop
      if k <> all (array['costo', 'costo_total', 'costoTotal', 'costo_compra', 'costoCompra',
                         'valor_unitario', 'valorUnitario', 'precio_unitario', 'precioUnitario',
                         'precioPorGramo', 'precioMedio', 'costeo', 'valor_existencia',
                         'presupuestoMensual', 'alzaPrecio']) then
        r := r || jsonb_build_object(k, privado.sin_dinero(v));
      end if;
    end loop;
    return r;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(privado.sin_dinero(e) order by n)
                     from jsonb_array_elements(j) with ordinality x(e, n)), '[]'::jsonb);
  end if;
  return j;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Notas
-- ---------------------------------------------------------------------------

create or replace function privado.nota_json(p_nota uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', n.id, 'fecha', n.fecha, 'tipo', n.tipo, 'texto', n.texto, 'area', n.area,
    'persona', case when n.persona_id is null then null
                    else jsonb_build_object('id', pp.id, 'nombre', pp.nombre) end,
    'hecha', n.hecha, 'revision', n.revision, 'creada', n.creada, 'actualizada', n.actualizada,
    'autor', jsonb_build_object('id', n.autor_id, 'nombre', n.responsable),
    'cambiada_por', case when n.cambiada_por_id is null then null
                         else jsonb_build_object('id', pc.id, 'nombre', pc.nombre) end)
  from public.notas n
  left join public.perfiles pp on pp.id = n.persona_id
  left join public.perfiles pc on pc.id = n.cambiada_por_id
  where n.id = p_nota
$$;

create or replace function privado.guardar_nota(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := privado.dato_uuid(d, 'id', false);
  v_fecha date := privado.dato_fecha(d, 'fecha', true);
  v_tipo text := privado.dato_texto(d, 'tipo', true, 20);
  v_texto text := privado.dato_texto(d, 'texto', true, 280);
  v_area text := privado.dato_texto(d, 'area', false, 20);
  v_persona uuid := privado.dato_uuid(d, 'persona_id', false);
  v_hecha boolean := false;
  v_jefe boolean := privado.es_al_menos('obrador'::rol);
  n public.notas;
begin
  if v_tipo <> all (array['tarea', 'pendiente', 'recomendacion', 'felicitacion']) then
    perform privado.fallar('invalida', 'Elige qué quieres registrar: tarea, pendiente, recomendación o felicitación.', 422);
  end if;
  if v_area is not null and v_area <> all (array['PASTELERÍA', 'PANADERÍA', 'GALLETAS']) then
    perform privado.fallar('invalida', 'Elige un área válida o déjala para todo el equipo.', 422);
  end if;
  if v_area is not null and v_persona is not null then
    perform privado.fallar('invalida', 'Una nota es para un área o para una persona, no para las dos.', 422);
  end if;
  if v_persona is not null and not exists (select 1 from public.perfiles
      where id = v_persona and activo and sede_id = (ctx ->> 'sede')::uuid) then
    perform privado.fallar('invalida', 'Elige una persona activa del equipo de tu sede.', 422);
  end if;
  if d ? 'hecha' and jsonb_typeof(d -> 'hecha') <> 'null' then
    if jsonb_typeof(d -> 'hecha') <> 'boolean' then
      perform privado.fallar('invalida', '«hecha» tiene que ser true o false.', 422);
    end if;
    v_hecha := (d ->> 'hecha')::boolean;
  end if;
  -- Solo lo que se cumple se marca.
  v_hecha := v_hecha and v_tipo in ('tarea', 'pendiente');

  if v_id is null then
    if p_revision <> 0 then
      perform privado.fallar('invalida', 'Una nota nueva se registra con revision 0.', 422);
    end if;
    if not v_jefe then
      perform privado.fallar('sin_permiso', 'Las notas del calendario las escribe el jefe de obrador en adelante.', 403);
    end if;
    insert into public.notas (sede_id, fecha, tipo, texto, area, persona_id, hecha, responsable, autor_id)
    values ((ctx ->> 'sede')::uuid, v_fecha, v_tipo, v_texto, v_area, v_persona, v_hecha,
            ctx ->> 'responsable', (ctx ->> 'perfil')::uuid)
    returning * into n;
    perform privado.anotar(ctx, 'nota_guardada', v_fecha, 'Nota nueva', jsonb_build_object('nota_id', n.id),
      jsonb_build_object('despues', privado.nota_json(n.id)));
    return jsonb_build_object('nota', privado.nota_json(n.id));
  end if;

  select * into n from public.notas where id = v_id and sede_id = (ctx ->> 'sede')::uuid for update;
  if not found then
    perform privado.fallar('no_existe', 'Esa nota ya no existe. Puede que la hayan borrado en otra pestaña.', 404);
  end if;
  if n.revision <> p_revision then
    perform privado.fallar('conflicto', 'Esta nota cambió en otra pestaña. Vuelve a abrir el día.', 409);
  end if;
  -- Quien no es jefe solo marca la nota que le asignaron, sin cambiar nada mas.
  if not v_jefe and (n.persona_id is distinct from (ctx ->> 'perfil')::uuid
      or n.fecha <> v_fecha or n.tipo <> v_tipo or n.texto <> v_texto
      or n.area is distinct from v_area or n.persona_id is distinct from v_persona) then
    perform privado.fallar('sin_permiso', 'De la nota que te asignaron solo puedes marcar si ya está hecha.', 403);
  end if;

  update public.notas
     set fecha = v_fecha, tipo = v_tipo, texto = v_texto, area = v_area, persona_id = v_persona, hecha = v_hecha,
         revision = revision + 1, actualizada = now(),
         cambiada_por_id = case when autor_id = (ctx ->> 'perfil')::uuid then null else (ctx ->> 'perfil')::uuid end
   where id = n.id;
  perform privado.anotar(ctx, 'nota_guardada', v_fecha, 'Cambio de nota', jsonb_build_object('nota_id', n.id),
    jsonb_build_object('antes', jsonb_build_object('texto', n.texto, 'hecha', n.hecha, 'tipo', n.tipo),
                       'despues', privado.nota_json(n.id)));
  return jsonb_build_object('nota', privado.nota_json(n.id));
end $$;

create or replace function privado.eliminar_nota(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := privado.dato_uuid(d, 'id', true);
  n public.notas;
  v_antes jsonb;
begin
  select * into n from public.notas where id = v_id and sede_id = (ctx ->> 'sede')::uuid for update;
  if not found then
    perform privado.fallar('no_existe', 'Esa nota ya no existe.', 404);
  end if;
  if n.revision <> p_revision then
    perform privado.fallar('conflicto', 'Esta nota cambió en otra pestaña. Vuelve a abrir el día.', 409);
  end if;
  v_antes := privado.nota_json(n.id);
  delete from public.notas where id = n.id;
  -- El historial conserva lo que decia y quien la borro.
  perform privado.anotar(ctx, 'nota_eliminada', n.fecha, 'Nota borrada', jsonb_build_object('nota_id', n.id),
    jsonb_build_object('antes', v_antes));
  return jsonb_build_object('id', n.id, 'fecha', n.fecha);
end $$;

create or replace function privado.consultar_notas(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(q, 'fecha', true);
begin
  return jsonb_build_object('fecha', v_fecha, 'notas', coalesce((
    select jsonb_agg(privado.nota_json(n.id)
                     order by array_position(array['tarea', 'pendiente', 'recomendacion', 'felicitacion'], n.tipo), n.creada)
      from public.notas n where n.sede_id = (ctx ->> 'sede')::uuid and n.fecha = v_fecha), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Resultados
-- ---------------------------------------------------------------------------

--  `rendimientoPrevisto()`: solo rendimientos inequivocos del nombre congelado
--  ("X 10 UND"). "X 32 UND O 8 PAQ" necesita que la persona elija su medida.
create or replace function privado.rendimiento_previsto(p_nombre text, p_tandas numeric)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  m text[];
  partes text[];
  v_unidad text;
  v_cantidad numeric;
begin
  m := regexp_match(btrim(coalesce(p_nombre, '')),
    '^(.{3,}?)\s+[Xx]\s+(\d[\d.,]*\s*(?:UND|UNDS|UNIDADES|UDS|PAQ\.?|PAQUETES|CAJAS?|PORC\.?|PORCIONES)?'
    '(?:\s+O\s+\d[\d.,]*\s*(?:UND|PAQ\.?|CAJAS?)?)?)\s*$', 'i');
  if m is null then
    return jsonb_build_object('cantidad', null, 'unidad', null);
  end if;
  partes := regexp_match(btrim(m[2]), '^([\d.,]+)\s*(.*)$');
  v_unidad := case regexp_replace(upper(btrim(partes[2])), '\.$', '')
    when 'UND' then 'UND' when 'UNDS' then 'UND' when 'UNIDADES' then 'UND' when 'UDS' then 'UND'
    when 'PORC' then 'PORC' when 'PORCIONES' then 'PORC'
    when 'PAQ' then 'PAQ' when 'PAQUETES' then 'PAQ'
    when 'CAJA' then 'CAJA' when 'CAJAS' then 'CAJA' end;
  begin
    v_cantidad := replace(partes[1], ',', '.')::numeric;
  exception when others then
    v_cantidad := null;
  end;
  if v_unidad is null or v_cantidad is null or v_cantidad <= 0 or v_cantidad * p_tandas <= 0 then
    return jsonb_build_object('cantidad', null, 'unidad', null);
  end if;
  return jsonb_build_object('cantidad', v_cantidad * p_tandas, 'unidad', v_unidad);
end $$;

create or replace function privado.guardar_resultado(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ejecucion uuid := privado.dato_uuid(d, 'ejecucion_id', true);
  v_receta uuid := privado.dato_uuid(d, 'receta_id', true);
  v_vendible numeric := privado.dato_numero(d, 'vendible', true, 6);
  v_rechazado numeric := privado.dato_numero(d, 'rechazado', true, 6);
  v_merma_prep numeric := privado.dato_numero(d, 'merma_preparacion_gr', false, 6);
  v_merma_coc numeric := privado.dato_numero(d, 'merma_coccion_gr', false, 6);
  v_motivo text := privado.dato_texto(d, 'motivo', false, 500);
  e public.ejecuciones;
  a public.resultados;
  v_tandas numeric;
  v_nombre text;
  v_previsto jsonb;
  v_unidad text;
  v_esperado numeric;
begin
  select * into e from public.ejecuciones where id = v_ejecucion and sede_id = (ctx ->> 'sede')::uuid;
  select sum(tandas), min(receta ->> 'nombre') into v_tandas, v_nombre
    from public.ejecucion_partidas where ejecucion_id = v_ejecucion and receta_id = v_receta;
  if e.id is null or v_tandas is null then
    perform privado.fallar('invalida', 'Primero confirma la producción de esta receta.', 422);
  end if;

  select * into a from public.resultados where ejecucion_id = v_ejecucion and receta_id = v_receta for update;
  if not privado.es_al_menos('obrador'::rol) and (a.ejecucion_id is not null or e.autor_id is distinct from (ctx ->> 'perfil')::uuid) then
    perform privado.fallar('sin_permiso', 'Solo el jefe de obrador puede corregir resultados o registrar los de otra persona.', 403);
  end if;
  if coalesce(a.revision, 0) <> p_revision then
    perform privado.fallar('conflicto', 'El resultado cambió en otra pestaña. Vuelve a abrir la receta antes de guardar.', 409);
  end if;

  v_previsto := privado.rendimiento_previsto(v_nombre, v_tandas);
  v_unidad := coalesce(v_previsto ->> 'unidad', upper(privado.dato_texto(d, 'unidad', false, 10)));
  v_esperado := coalesce((v_previsto ->> 'cantidad')::numeric, privado.dato_numero(d, 'esperado', false, 6));

  if v_unidad is null or v_unidad <> all (array['UND', 'PORC', 'PAQ', 'CAJA', 'GR', 'KG', 'ML', 'LT']) then
    perform privado.fallar('invalida', 'Elige la medida del producto terminado.', 422);
  end if;
  if v_esperado is not null and (v_esperado <= 0 or v_esperado > 1e12) then
    perform privado.fallar('invalida', 'La cantidad esperada debe ser mayor que cero, o quedar vacía si se desconoce.', 422);
  end if;
  if v_vendible < 0 or v_rechazado < 0 or v_vendible + v_rechazado > 1e12 then
    perform privado.fallar('invalida', 'Indica las cantidades vendibles y rechazadas, desde cero hasta un billón.', 422);
  end if;
  if coalesce(v_merma_prep, 0) < 0 or coalesce(v_merma_coc, 0) < 0 then
    perform privado.fallar('invalida', 'Las pérdidas en gramos deben ser números desde cero; déjalas vacías si no se midieron.', 422);
  end if;
  if v_motivo is null and (a.ejecucion_id is not null or v_rechazado > 0 or v_vendible = 0
      or coalesce(v_merma_prep, 0) > 0 or coalesce(v_merma_coc, 0) > 0
      or (v_esperado is not null and v_vendible + v_rechazado <> v_esperado)) then
    perform privado.fallar('invalida', 'Explica la pérdida, diferencia de rendimiento o corrección antes de guardar.', 422);
  end if;

  insert into public.resultados (ejecucion_id, receta_id, revision, unidad, esperado, vendible, rechazado,
                                 merma_preparacion_gr, merma_coccion_gr, motivo, responsable, autor_id)
  values (v_ejecucion, v_receta, 1, v_unidad, v_esperado, v_vendible, v_rechazado, v_merma_prep, v_merma_coc,
          coalesce(v_motivo, 'Resultado medido'), ctx ->> 'responsable', (ctx ->> 'perfil')::uuid)
  on conflict (ejecucion_id, receta_id) do update
    set revision = resultados.revision + 1, unidad = excluded.unidad, esperado = excluded.esperado,
        vendible = excluded.vendible, rechazado = excluded.rechazado,
        merma_preparacion_gr = excluded.merma_preparacion_gr, merma_coccion_gr = excluded.merma_coccion_gr,
        motivo = excluded.motivo, responsable = excluded.responsable, autor_id = excluded.autor_id,
        actualizado = now();

  perform privado.anotar(ctx, 'resultado_guardado', e.fecha, coalesce(v_motivo, 'Resultado medido'),
    jsonb_build_object('ejecucion_id', v_ejecucion, 'receta_id', v_receta),
    jsonb_build_object('antes', case when a.ejecucion_id is null then null else to_jsonb(a) end,
                       'vendible', v_vendible, 'rechazado', v_rechazado, 'esperado', v_esperado));

  return jsonb_build_object('resultado', (select to_jsonb(r) - 'autor_id' from public.resultados r
                                           where r.ejecucion_id = v_ejecucion and r.receta_id = v_receta));
end $$;

--  Lo producido en un dia: cada confirmacion con su resultado. El costo sale
--  del costeo congelado y solo lo recibe gerencia (lo quita `proyectar`).
create or replace function privado.consultar_producido(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(q, 'fecha', true);
begin
  return jsonb_build_object('fecha', v_fecha, 'ejecuciones', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'instante', e.instante, 'receta_id', e.receta_id, 'area', e.area,
             'responsable', e.responsable, 'autor_id', e.autor_id, 'costo_total', e.costo_total,
             'tandas', (select sum(tandas) from public.ejecucion_partidas p where p.ejecucion_id = e.id),
             'nombre', (select min(receta ->> 'nombre') from public.ejecucion_partidas p where p.ejecucion_id = e.id),
             'rendimiento_previsto', privado.rendimiento_previsto(
                (select min(receta ->> 'nombre') from public.ejecucion_partidas p where p.ejecucion_id = e.id),
                (select sum(tandas) from public.ejecucion_partidas p where p.ejecucion_id = e.id)),
             'resultado', (select to_jsonb(r) - 'autor_id' from public.resultados r
                            where r.ejecucion_id = e.id and r.receta_id = e.receta_id))
           order by e.instante)
      from public.ejecuciones e where e.sede_id = (ctx ->> 'sede')::uuid and e.fecha = v_fecha), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Metas
-- ---------------------------------------------------------------------------

create or replace function privado.fijar_meta(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clave text := privado.dato_texto(d, 'clave', true, 30);
  v_valor numeric := privado.dato_numero(d, 'valor', false, 4);
  v_min numeric;
  v_max numeric;
begin
  select min, max into v_min, v_max from (values
    ('presupuestoMensual', 0::numeric, 1e11::numeric), ('cumplimientoPlan', 0, 100), ('rendimientoMinimo', 0, 200),
    ('rechazoMaximo', 0, 100), ('coberturaMinima', 0, 365), ('avisoVencimiento', 1, 90), ('alzaPrecio', 1, 500))
    x(clave, min, max) where x.clave = v_clave;
  if v_min is null then
    perform privado.fallar('invalida', 'Esa meta no existe.', 422);
  end if;
  if v_valor is null and v_clave <> 'presupuestoMensual' then
    perform privado.fallar('invalida', 'Esta meta necesita un valor.', 422);
  end if;
  if v_valor is not null and (v_valor < v_min or v_valor > v_max) then
    perform privado.fallar('invalida', format('La meta tiene que estar entre %s y %s.', v_min, v_max), 422);
  end if;

  -- `clock_timestamp()` y no `now()`: dos cambios en la misma transaccion son
  -- dos versiones, no un choque de clave.
  insert into public.metas (sede_id, clave, vigente_desde, valor, responsable, autor_id)
  values ((ctx ->> 'sede')::uuid, v_clave, clock_timestamp(), v_valor, ctx ->> 'responsable', (ctx ->> 'perfil')::uuid);
  perform privado.anotar(ctx, 'meta_fijada', (ctx ->> 'hoy')::date, null, jsonb_build_object('clave', v_clave),
    jsonb_build_object('valor', v_valor));
  return jsonb_build_object('clave', v_clave, 'valor', v_valor);
end $$;

--  Las metas vigentes de la sede: la version mas reciente de cada una (no se
--  crean con fecha futura). Lo que nunca se fijo sale con la base del cliente,
--  marcado como tal.
create or replace function privado.consultar_metas(ctx jsonb, q jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('metas', jsonb_object_agg(b.clave, jsonb_build_object(
      'valor', coalesce(m.valor, case when m.clave is null then b.base end),
      'fijada', m.clave is not null, 'desde', m.vigente_desde, 'responsable', m.responsable)))
  from (values ('presupuestoMensual', null::numeric), ('cumplimientoPlan', 90), ('rendimientoMinimo', 95),
               ('rechazoMaximo', 5), ('coberturaMinima', 3), ('avisoVencimiento', 7), ('alzaPrecio', 10)) b(clave, base)
  left join lateral (
    select * from public.metas mt
     where mt.sede_id = (ctx ->> 'sede')::uuid and mt.clave = b.clave
     order by mt.vigente_desde desc limit 1) m on true
$$;

-- ---------------------------------------------------------------------------
-- Registro y permisos
-- ---------------------------------------------------------------------------

insert into privado.acciones (accion, funcion, rol_minimo, descripcion) values
  ('guardar_nota', 'privado.guardar_nota', 'operario', 'Crea o cambia una nota; quien la tiene asignada solo la marca hecha'),
  ('eliminar_nota', 'privado.eliminar_nota', 'obrador', 'Borra una nota; la bitacora conserva lo que decia'),
  ('guardar_resultado', 'privado.guardar_resultado', 'operario', 'Registra o corrige lo que de verdad salio de una receta confirmada'),
  ('fijar_meta', 'privado.fijar_meta', 'gerencia', 'Nueva version de una meta del panel')
on conflict (accion) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('notas', 'privado.consultar_notas', 'operario', 'Notas de un dia, en el orden del panel'),
  ('producido', 'privado.consultar_producido', 'operario', 'Confirmaciones de un dia con su resultado; costo solo para gerencia'),
  ('metas', 'privado.consultar_metas', 'operario', 'Metas vigentes; presupuesto y alza de precio solo para gerencia')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

revoke all on function privado.sin_dinero(jsonb), privado.nota_json(uuid),
  privado.guardar_nota(jsonb, integer, jsonb), privado.eliminar_nota(jsonb, integer, jsonb),
  privado.consultar_notas(jsonb, jsonb), privado.rendimiento_previsto(text, numeric),
  privado.guardar_resultado(jsonb, integer, jsonb), privado.consultar_producido(jsonb, jsonb),
  privado.fijar_meta(jsonb, integer, jsonb), privado.consultar_metas(jsonb, jsonb)
  from public, anon, authenticated;
