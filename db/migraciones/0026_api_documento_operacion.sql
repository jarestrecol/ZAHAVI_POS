-- =============================================================================
--  0026 · LO QUE FALTA PARA QUE EL CLIENTE DE OPERACION HABLE CON LA API
-- =============================================================================
--
--  (0025 la usa Codex para la gestion de usuarios; esta va despues.)
--
--  1. ALTA POR NOMBRE. El formulario de Bodega escribe el ingrediente; la API
--     exigia su id. Ahora `registrar_lote` acepta `ingrediente` (nombre) y, si
--     no esta en el catalogo, lo crea con la unidad de compra, igual que hace
--     `guardar_receta` (0024) con los ingredientes nuevos.
--
--  2. CORREGIR UN LOTE sin reescribir la compra: marca, proveedor,
--     presentacion, lote del proveedor, vencimiento y fecha de compra, con
--     motivo y revision. El costo tambien, pero solo gerencia, y solo cuenta
--     para lo que se costee desde ahora: lo confirmado tiene su costo
--     congelado (0021). El peso, el ingrediente y la unidad NO se corrigen:
--     identifican el historial; para otra cosa se registra otro lote.
--
--  3. EL DOCUMENTO DE OPERACION. El calendario, la produccion y el panel del
--     cliente trabajan sobre un documento (`lotes, planes, ejecuciones,
--     resultados, notas, preparaciones, eventos`). `operacion_leer({tipo:
--     'operacion', desde, hasta})` lo devuelve con ESA forma desde la base,
--     para que el nucleo del cliente (`resumenDelDia`, `hechosDeOperacion`,
--     `proyectarPlanes`) siga igual y solo cambie de donde lee. Sin dinero para
--     quien no es gerencia (lo quita `proyectar`, 0018).
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 1. registrar_lote acepta el nombre del ingrediente
-- ---------------------------------------------------------------------------

create or replace function privado.ingrediente_de(d jsonb, p_unidad text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := privado.dato_uuid(d, 'ingrediente_id', false);
  v_nombre text;
begin
  if v_id is not null then
    if not exists (select 1 from public.ingredientes where id = v_id) then
      perform privado.fallar('invalida', 'Ese ingrediente no existe en el catálogo.', 422);
    end if;
    return v_id;
  end if;
  v_nombre := upper(privado.dato_texto(d, 'ingrediente', true, 120));
  insert into public.ingredientes (nombre, unidad_base) values (v_nombre, p_unidad)
  on conflict (nombre) do update set activo = true
  returning id into v_id;
  return v_id;
end $$;

create or replace function privado.registrar_lote(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unidad text := upper(privado.dato_texto(d, 'unidad', true, 10));
  v_ingrediente uuid;
  v_peso numeric := privado.dato_numero(d, 'peso_compra', true, 3);
  v_costo numeric := privado.dato_numero(d, 'costo_compra', true, 2);
  v_origen text := coalesce(privado.dato_texto(d, 'origen', false, 20), 'compra');
  v_existencia numeric := privado.dato_numero(d, 'existencia', false, 6);
  v_equivalencias jsonb := privado.dato_equivalencias(d);
  v_fecha_compra date := coalesce(privado.dato_fecha(d, 'fecha_compra'), (ctx ->> 'hoy')::date);
  v_vencimiento date := privado.dato_fecha(d, 'vencimiento');
  v_proveedor text := upper(privado.dato_texto(d, 'proveedor', false, 120));
  v_motivo text := privado.dato_texto(d, 'motivo', false, 280);
  v_proveedor_id uuid;
  v_lote uuid;
  v_codigo text;
begin
  if p_revision <> 0 then
    perform privado.fallar('invalida', 'Un lote nuevo se registra con revision 0.', 422);
  end if;
  if v_unidad <> all (array['GR', 'KG', 'MG', 'LT', 'ML', 'UND', 'TANDA', 'CM']) then
    perform privado.fallar('invalida', 'La unidad de compra tiene que ser GR, KG, MG, LT, ML, UND, TANDA o CM.', 422);
  end if;
  if v_peso <= 0 then
    perform privado.fallar('invalida', 'El peso de compra tiene que ser mayor que cero.', 422);
  end if;
  if v_costo < 0 then
    perform privado.fallar('invalida', 'El costo de compra no puede ser negativo.', 422);
  end if;
  if v_origen <> all (array['compra', 'conteo_inicial']) then
    perform privado.fallar('invalida', 'El origen del lote tiene que ser «compra» o «conteo_inicial».', 422);
  end if;
  if v_existencia is not null and v_origen <> 'conteo_inicial' then
    perform privado.fallar('invalida', 'Una compra entra completa: la existencia parcial solo se declara en el conteo inicial.', 422);
  end if;
  v_existencia := coalesce(v_existencia, v_peso);
  if v_existencia < 0 or v_existencia > v_peso then
    perform privado.fallar('invalida', 'La existencia tiene que estar entre cero y el peso de compra.', 422);
  end if;
  if privado.factor_gramos(v_unidad, v_equivalencias) is null then
    perform privado.fallar('invalida', 'Indica la equivalencia en gramos de la unidad de compra. Para litros, los gramos de 1 ml.', 422);
  end if;
  if v_fecha_compra > (ctx ->> 'hoy')::date then
    perform privado.fallar('invalida', 'Registra la compra cuando se reciba: una compra futura aún no es existencia.', 422);
  end if;
  -- Al final de las validaciones: un alta rechazada no deja un ingrediente nuevo.
  v_ingrediente := privado.ingrediente_de(d, v_unidad);

  if v_proveedor is not null then
    insert into public.proveedores (nombre) values (v_proveedor)
    on conflict (nombre) do update set nombre = excluded.nombre
    returning id into v_proveedor_id;
  end if;

  v_codigo := 'L' || lpad(nextval('privado.lote_codigo')::text, 6, '0');

  insert into public.lotes (codigo, ingrediente_id, sede_id, proveedor_id, presentacion, peso_compra, unidad,
                            costo_compra, lote_proveedor, vencimiento, creado_por, marca, fecha_compra, existencia)
  values (v_codigo, v_ingrediente, (ctx ->> 'sede')::uuid, v_proveedor_id,
          upper(privado.dato_texto(d, 'presentacion', false, 60)), v_peso, v_unidad, v_costo,
          privado.dato_texto(d, 'lote_proveedor', false, 60), v_vencimiento, (ctx ->> 'perfil')::uuid,
          privado.dato_texto(d, 'marca', false, 120), v_fecha_compra, v_existencia)
  returning id into v_lote;

  insert into public.equivalencias_lote (lote_id, medida, gramos, responsable, autor_id)
  select v_lote, e.key, (e.value #>> '{}')::numeric, ctx ->> 'responsable', (ctx ->> 'perfil')::uuid
    from jsonb_each(v_equivalencias) e;

  insert into public.movimientos (lote_id, tipo, cantidad, motivo, creado_por)
  values (v_lote, 'entrada', v_peso,
          coalesce(v_motivo, case when v_origen = 'compra' then 'Recepción de compra' else 'Conteo inicial' end),
          (ctx ->> 'perfil')::uuid);
  if v_existencia < v_peso then
    insert into public.movimientos (lote_id, tipo, cantidad, motivo, creado_por)
    values (v_lote, 'ajuste', v_existencia - v_peso, 'Conteo inicial: el lote ya estaba abierto', (ctx ->> 'perfil')::uuid);
  end if;

  perform privado.anotar(ctx, case when v_origen = 'compra' then 'compra' else 'conteo_inicial' end,
    (ctx ->> 'hoy')::date, v_motivo, jsonb_build_object('lote_id', v_lote),
    jsonb_build_object('codigo', v_codigo, 'peso_compra', v_peso, 'existencia', v_existencia,
                       'costo_compra', v_costo, 'unidad', v_unidad));

  return jsonb_build_object('lote', privado.lote_json(ctx, v_lote));
end $$;

-- ---------------------------------------------------------------------------
-- 2. corregir_lote
-- ---------------------------------------------------------------------------

create or replace function privado.corregir_lote(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := privado.dato_uuid(d, 'lote_id', true);
  v_motivo text := privado.dato_texto(d, 'motivo', true, 280);
  l public.lotes;
  v_antes jsonb;
  v_proveedor_id uuid;
  v_costo numeric;
  v_fecha date;
begin
  l := privado.lote_para_cambiar(ctx, v_lote, p_revision);
  v_antes := privado.lote_json(ctx, l.id);

  if d ? 'costo_compra' then
    if not (ctx ->> 'gerencia')::boolean then
      perform privado.fallar('sin_permiso', 'Corregir el costo de una compra es de gerencia, verificada en dos pasos.', 403);
    end if;
    v_costo := privado.dato_numero(d, 'costo_compra', true, 2);
    if v_costo < 0 then
      perform privado.fallar('invalida', 'El costo de compra no puede ser negativo.', 422);
    end if;
  end if;
  if d ? 'fecha_compra' then
    v_fecha := privado.dato_fecha(d, 'fecha_compra', true);
    if v_fecha > (ctx ->> 'hoy')::date then
      perform privado.fallar('invalida', 'La fecha de compra no puede ser futura.', 422);
    end if;
  end if;
  if d ? 'proveedor' and privado.dato_texto(d, 'proveedor', false, 120) is not null then
    insert into public.proveedores (nombre) values (upper(privado.dato_texto(d, 'proveedor', false, 120)))
    on conflict (nombre) do update set nombre = excluded.nombre
    returning id into v_proveedor_id;
  end if;

  update public.lotes set
    marca = case when d ? 'marca' then privado.dato_texto(d, 'marca', false, 120) else marca end,
    proveedor_id = case when d ? 'proveedor' then v_proveedor_id else proveedor_id end,
    presentacion = case when d ? 'presentacion' then upper(privado.dato_texto(d, 'presentacion', false, 60)) else presentacion end,
    lote_proveedor = case when d ? 'lote_proveedor' then privado.dato_texto(d, 'lote_proveedor', false, 60) else lote_proveedor end,
    vencimiento = case when d ? 'vencimiento' then privado.dato_fecha(d, 'vencimiento') else vencimiento end,
    fecha_compra = case when d ? 'fecha_compra' then v_fecha else fecha_compra end,
    costo_compra = case when d ? 'costo_compra' then v_costo else costo_compra end,
    revision = revision + 1
  where id = l.id;

  perform privado.anotar(ctx, 'correccion', (ctx ->> 'hoy')::date, v_motivo, jsonb_build_object('lote_id', l.id),
    jsonb_build_object('antes', v_antes, 'despues', privado.lote_json(jsonb_set(ctx, '{gerencia}', 'true'), l.id)));

  return jsonb_build_object('lote', privado.lote_json(ctx, l.id));
end $$;

-- ---------------------------------------------------------------------------
-- 3. El documento de operacion, con la forma que usa el cliente
-- ---------------------------------------------------------------------------

--  Una persona como la guarda el documento: {id, nombre, codigo}.
create or replace function privado.persona_json(p_perfil uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when p.id is null then null else
    jsonb_build_object('id', p.id, 'nombre', p.nombre, 'codigo', coalesce(p.codigo_usuario, '')) end
  from (select p_perfil as id) q left join public.perfiles p on p.id = q.id
$$;

--  Un lote como lo guarda el documento (`normalizarLote`).
create or replace function privado.lote_documento(p_lote uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', l.id, 'codigo', l.codigo, 'revision', l.revision, 'ingrediente', i.nombre,
    'marca', coalesce(l.marca, ''), 'proveedor', coalesce(p.nombre, ''),
    'fechaCompra', coalesce(to_char(l.fecha_compra, 'YYYY-MM-DD'), ''),
    'presentacion', coalesce(l.presentacion, ''), 'pesoCompra', l.peso_compra, 'unidad', l.unidad,
    'equivalencias', coalesce((select jsonb_object_agg(q.medida, q.gramos) from public.equivalencias_lote q
                                where q.lote_id = l.id and q.vigente), '{}'),
    'costoCompra', l.costo_compra, 'lote', coalesce(l.lote_proveedor, ''),
    'vencimiento', coalesce(to_char(l.vencimiento, 'YYYY-MM-DD'), ''),
    'existencia', l.existencia, 'registrado', l.recibido_en)
  from public.lotes l
  join public.ingredientes i on i.id = l.ingrediente_id
  left join public.proveedores p on p.id = l.proveedor_id
  where l.id = p_lote
$$;

create or replace function privado.consultar_operacion(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_desde date := privado.dato_fecha(q, 'desde', true);
  v_hasta date := privado.dato_fecha(q, 'hasta', true);
  v_sede uuid := (ctx ->> 'sede')::uuid;
begin
  if v_hasta < v_desde or v_hasta - v_desde > 400 then
    perform privado.fallar('invalida', 'El rango tiene que ir de «desde» a «hasta», y no pasar de 400 días.', 422);
  end if;

  return jsonb_build_object(
    'version', 1, 'operacionVersion', 1, 'secuencia', 0, 'desde', v_desde, 'hasta', v_hasta,

    'lotes', coalesce((select jsonb_agg(privado.lote_documento(l.id) order by l.codigo collate "C")
                         from public.lotes l where l.sede_id = v_sede), '[]'::jsonb),

    'planes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', pl.fecha, 'revision', pl.revision, 'responsable', pl.responsable, 'motivo', pl.motivo,
               'actualizado', pl.actualizado,
               'entradas', (select jsonb_agg(jsonb_build_object(
                                 'recipe', x.receta, 'factor', x.tandas, 'partidas', x.partidas) order by x.area, x.nombre)
                              from (select min(receta ->> 'categoria') as area, min(receta ->> 'nombre') as nombre,
                                           (array_agg(receta order by partida))[1] as receta, sum(tandas) as tandas,
                                           coalesce(jsonb_agg(tandas order by partida) filter (where ejecucion_id is null), '[]'::jsonb) as partidas
                                      from public.plan_partidas pp where pp.plan_id = pl.id group by receta_id) x))
             order by pl.fecha)
        from public.planes pl where pl.sede_id = v_sede and pl.fecha between v_desde and v_hasta), '[]'::jsonb),

    'ejecuciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'fecha', e.fecha, 'planRevision', e.plan_revision, 'instante', e.instante,
               'responsable', e.responsable, 'motivo', e.motivo, 'area', e.area,
               'recetaId', (select r.codigo from public.recetas r where r.id = e.receta_id),
               'autor', privado.persona_json(e.autor_id), 'costeo', e.costeo,
               'entradas', (select jsonb_agg(jsonb_build_object('recipe', x.receta, 'factor', x.tandas))
                              from (select (array_agg(receta order by partida))[1] as receta, sum(tandas) as tandas
                                      from public.ejecucion_partidas ep where ep.ejecucion_id = e.id group by receta_id) x))
             order by e.instante)
        from public.ejecuciones e where e.sede_id = v_sede and e.fecha between v_desde and v_hasta), '[]'::jsonb),

    'resultados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produccionId', r.ejecucion_id, 'recetaId', rc.codigo, 'revision', r.revision, 'unidad', r.unidad,
               'esperado', r.esperado, 'vendible', r.vendible, 'rechazado', r.rechazado,
               'mermaPreparacionGr', r.merma_preparacion_gr, 'mermaCoccionGr', r.merma_coccion_gr,
               'motivo', r.motivo, 'actualizado', r.actualizado, 'autor', privado.persona_json(r.autor_id))
             order by r.actualizado)
        from public.resultados r
        join public.ejecuciones e on e.id = r.ejecucion_id
        join public.recetas rc on rc.id = r.receta_id
       where e.sede_id = v_sede and e.fecha between v_desde and v_hasta), '[]'::jsonb),

    'notas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'fecha', n.fecha, 'tipo', n.tipo, 'texto', n.texto, 'area', n.area,
               'persona', privado.persona_json(n.persona_id), 'hecha', n.hecha, 'revision', n.revision,
               'creada', n.creada, 'actualizada', n.actualizada, 'autor', privado.persona_json(n.autor_id),
               'cambiadaPor', privado.persona_json(n.cambiada_por_id))
             order by n.fecha, n.creada)
        from public.notas n where n.sede_id = v_sede and n.fecha between v_desde and v_hasta), '[]'::jsonb),

    'preparaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', pr.fecha, 'recetaId', rc.codigo, 'iniciada', pr.iniciada,
               'iniciadaPor', privado.persona_json(pr.iniciada_por),
               'asignado', case when pr.asignado_a is null then null
                                else privado.persona_json(pr.asignado_a)
                                     || jsonb_build_object('area', (select area from public.perfiles where id = pr.asignado_a)) end,
               'asignadoPor', privado.persona_json(pr.asignado_por), 'actualizada', pr.actualizada)
             order by pr.fecha)
        from public.preparaciones pr join public.recetas rc on rc.id = pr.receta_id
       where pr.sede_id = v_sede and pr.fecha between v_desde and v_hasta), '[]'::jsonb),

    --  Las compras, como eventos del documento: el panel las usa para las
    --  alertas de alza de precio. Se derivan de los lotes (fecha y costo de
    --  compra), sin guardar copias de lotes enteros en la bitacora.
    'eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', 'compra-' || l.id, 'tipo', 'compra', 'instante', l.recibido_en,
               'fecha', coalesce(l.fecha_compra, (l.recibido_en at time zone 'America/Bogota')::date),
               'responsable', coalesce((select nombre from public.perfiles where id = l.creado_por), 'Sin registrar'),
               'motivo', 'Recepción de compra', 'antes', null, 'despues', privado.lote_documento(l.id))
             order by l.recibido_en)
        from public.lotes l where l.sede_id = v_sede and l.historico = false), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Registro y permisos
-- ---------------------------------------------------------------------------

insert into privado.acciones (accion, funcion, rol_minimo, descripcion) values
  ('corregir_lote', 'privado.corregir_lote', 'obrador', 'Corrige los datos de una compra sin reescribirla; el costo, solo gerencia')
on conflict (accion) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('operacion', 'privado.consultar_operacion', 'operario', 'Documento de operacion de un rango, con la forma que usa el cliente; dinero solo gerencia')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

revoke all on function privado.ingrediente_de(jsonb, text), privado.registrar_lote(jsonb, integer, jsonb),
  privado.corregir_lote(jsonb, integer, jsonb), privado.persona_json(uuid), privado.lote_documento(uuid),
  privado.consultar_operacion(jsonb, jsonb)
  from public, anon, authenticated;
