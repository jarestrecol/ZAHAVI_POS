-- =============================================================================
--  0019 · BODEGA POR LA API: ALTA, AJUSTE Y EQUIVALENCIAS
-- =============================================================================
--
--  Primeras acciones sobre el nucleo de 0018. Tres reglas que no se negocian:
--
--  1. SALDO Y LIBRO SE MUEVEN JUNTOS. `lotes.existencia` y la suma de
--     `movimientos` cambian en la misma sentencia de la misma funcion. Ningun
--     camino toca uno sin el otro.
--  2. UN LOTE NO SE BORRA NI SE REESCRIBE. Se corrige su existencia con un
--     ajuste que dice por que. Darlo de baja es dejarlo en cero.
--  3. CONCURRENCIA POR REVISION. Cada lote lleva `revision`: quien ajusta dice
--     que version vio; si otro cambio el lote entre tanto, 409. El lote se
--     bloquea (`for update`) mientras se decide, asi que dos ajustes nunca se
--     mezclan.
--
--  El conteo fisico del dia del corte (F5-0) entra por `registrar_lote` con
--  `origen = 'conteo_inicial'`: un bulto abierto se registra con su peso de
--  compra y la existencia que queda, y el libro lo explica con una entrada y
--  un ajuste.
--
--  Se puede aplicar dos veces sin efectos.

alter table lotes add column if not exists revision integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lotes_revision_positiva') then
    alter table lotes add constraint lotes_revision_positiva check (revision > 0);
  end if;
end $$;

create sequence if not exists privado.lote_codigo;
revoke all on sequence privado.lote_codigo from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

--  Equivalencias como las valida el cliente: solo ML, UND, TANDA y CM, cada
--  una un peso en gramos mayor que cero.
create or replace function privado.dato_equivalencias(d jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  v jsonb := d -> 'equivalencias';
  k text;
  n jsonb;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return '{}';
  end if;
  if jsonb_typeof(v) <> 'object' then
    perform privado.fallar('invalida', 'Las equivalencias tienen que ser un objeto {medida: gramos}.', 422);
  end if;
  for k, n in select * from jsonb_each(v) loop
    if k <> all (array['ML', 'UND', 'TANDA', 'CM']) then
      perform privado.fallar('invalida', format('La medida «%s» no existe. Usa ML, UND, TANDA o CM.', k), 422);
    end if;
    if jsonb_typeof(n) <> 'number' or (n #>> '{}')::numeric <= 0
       or (n #>> '{}')::numeric <> round((n #>> '{}')::numeric, 6) then
      perform privado.fallar('invalida', format('Los gramos de 1 %s tienen que ser un número mayor que cero, con hasta seis decimales.', k), 422);
    end if;
  end loop;
  return v;
end $$;

--  El lote como lo devuelve la API. El dinero, solo si el rol lo ve.
create or replace function privado.lote_json(ctx jsonb, p_lote uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', l.id, 'codigo', l.codigo, 'revision', l.revision,
    'ingrediente_id', l.ingrediente_id, 'ingrediente', i.nombre,
    'unidad', l.unidad, 'peso_compra', l.peso_compra, 'existencia', l.existencia,
    'vencimiento', l.vencimiento, 'fecha_compra', l.fecha_compra,
    'presentacion', l.presentacion, 'marca', l.marca, 'proveedor', p.nombre,
    'lote_proveedor', l.lote_proveedor,
    'equivalencias', coalesce((select jsonb_object_agg(q.medida, q.gramos order by q.medida)
                                 from public.equivalencias_lote q where q.lote_id = l.id and q.vigente), '{}'))
    || case when (ctx ->> 'gerencia')::boolean
            then jsonb_build_object('costo_compra', l.costo_compra, 'valor_unitario', l.valor_unitario)
            else '{}'::jsonb end
  from public.lotes l
  join public.ingredientes i on i.id = l.ingrediente_id
  left join public.proveedores p on p.id = l.proveedor_id
  where l.id = p_lote
$$;

--  Toma el lote de la sede de quien pide, bloqueado, y comprueba la revision.
create or replace function privado.lote_para_cambiar(ctx jsonb, p_lote uuid, p_revision integer)
returns public.lotes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.lotes;
begin
  select * into l from public.lotes
   where id = p_lote and sede_id = (ctx ->> 'sede')::uuid
   for update;
  if not found then
    perform privado.fallar('no_existe', 'Ese lote no existe en tu sede.', 404);
  end if;
  if l.revision <> p_revision then
    perform privado.fallar('conflicto', 'Este lote cambió mientras tanto. Actualiza la bodega y repite el cambio.', 409);
  end if;
  return l;
end $$;

-- ---------------------------------------------------------------------------
-- registrar_lote
-- ---------------------------------------------------------------------------

create or replace function privado.registrar_lote(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ingrediente uuid := privado.dato_uuid(d, 'ingrediente_id', true);
  v_unidad text := upper(privado.dato_texto(d, 'unidad', true, 10));
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
  if not exists (select 1 from public.ingredientes where id = v_ingrediente) then
    perform privado.fallar('invalida', 'Ese ingrediente no existe en el catálogo.', 422);
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

  -- El libro: la compra entra entera; si en el conteo inicial ya estaba
  -- abierto, un ajuste explica lo que falta.
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
-- ajustar_lote
-- ---------------------------------------------------------------------------

create or replace function privado.ajustar_lote(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := privado.dato_uuid(d, 'lote_id', true);
  v_nueva numeric := privado.dato_numero(d, 'existencia', true, 6);
  v_tipo text := coalesce(privado.dato_texto(d, 'tipo', false, 10), 'ajuste');
  v_motivo text := privado.dato_texto(d, 'motivo', true, 280);
  l public.lotes;
  v_delta numeric;
begin
  if v_tipo <> all (array['ajuste', 'merma']) then
    perform privado.fallar('invalida', 'El tipo tiene que ser «ajuste» o «merma».', 422);
  end if;
  l := privado.lote_para_cambiar(ctx, v_lote, p_revision);
  if v_nueva < 0 or v_nueva > l.peso_compra then
    perform privado.fallar('invalida', 'La existencia tiene que estar entre cero y el peso de compra del lote.', 422);
  end if;
  v_delta := v_nueva - l.existencia;
  if v_delta = 0 then
    perform privado.fallar('invalida', 'La existencia ya es esa: no hay nada que ajustar.', 422);
  end if;
  if v_tipo = 'merma' and v_delta > 0 then
    perform privado.fallar('invalida', 'Una merma solo puede bajar la existencia.', 422);
  end if;

  insert into public.movimientos (lote_id, tipo, cantidad, motivo, creado_por)
  values (l.id, v_tipo::movimiento_tipo, v_delta, v_motivo, (ctx ->> 'perfil')::uuid);
  update public.lotes set existencia = v_nueva, revision = revision + 1 where id = l.id;

  perform privado.anotar(ctx, v_tipo, (ctx ->> 'hoy')::date, v_motivo, jsonb_build_object('lote_id', l.id),
    jsonb_build_object('antes', l.existencia, 'despues', v_nueva));

  return jsonb_build_object('lote', privado.lote_json(ctx, l.id));
end $$;

-- ---------------------------------------------------------------------------
-- fijar_equivalencia
-- ---------------------------------------------------------------------------
--  Nunca se edita una equivalencia: se agrega una version nueva y la anterior
--  queda como estaba, porque un costeo viejo se calculo con la suya.

create or replace function privado.fijar_equivalencia(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := privado.dato_uuid(d, 'lote_id', true);
  v_medida text := upper(privado.dato_texto(d, 'medida', true, 10));
  v_gramos numeric := privado.dato_numero(d, 'gramos', true, 6);
  v_motivo text := privado.dato_texto(d, 'motivo', true, 280);
  l public.lotes;
  v_version integer;
  v_antes numeric;
begin
  if v_medida <> all (array['ML', 'UND', 'TANDA', 'CM']) then
    perform privado.fallar('invalida', 'La medida tiene que ser ML, UND, TANDA o CM.', 422);
  end if;
  if v_gramos <= 0 then
    perform privado.fallar('invalida', 'Los gramos tienen que ser mayores que cero.', 422);
  end if;
  l := privado.lote_para_cambiar(ctx, v_lote, p_revision);

  select gramos into v_antes from public.equivalencias_lote where lote_id = l.id and medida = v_medida and vigente;
  if v_antes = v_gramos then
    perform privado.fallar('invalida', 'Esa equivalencia ya está vigente.', 422);
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.equivalencias_lote
   where lote_id = l.id and medida = v_medida;

  update public.equivalencias_lote set vigente = false where lote_id = l.id and medida = v_medida and vigente;
  insert into public.equivalencias_lote (lote_id, medida, version, gramos, responsable, autor_id)
  values (l.id, v_medida, v_version, v_gramos, ctx ->> 'responsable', (ctx ->> 'perfil')::uuid);
  update public.lotes set revision = revision + 1 where id = l.id;

  perform privado.anotar(ctx, 'equivalencia', (ctx ->> 'hoy')::date, v_motivo, jsonb_build_object('lote_id', l.id),
    jsonb_build_object('medida', v_medida, 'antes', v_antes, 'despues', v_gramos, 'version', v_version));

  return jsonb_build_object('lote', privado.lote_json(ctx, l.id));
end $$;

-- ---------------------------------------------------------------------------
-- Consulta: la bodega de la sede, paginada
-- ---------------------------------------------------------------------------

create or replace function privado.consultar_bodega(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_con boolean := true;
  v_despues text := privado.dato_texto(q, 'despues', false, 20);
  v_limite integer := coalesce(privado.dato_numero(q, 'limite', false, 0), 100)::integer;
  v_ids uuid[];
begin
  if q ? 'con_existencia' then
    if jsonb_typeof(q -> 'con_existencia') <> 'boolean' then
      perform privado.fallar('invalida', '«con_existencia» tiene que ser true o false.', 422);
    end if;
    v_con := (q ->> 'con_existencia')::boolean;
  end if;
  if v_limite < 1 or v_limite > 200 then
    perform privado.fallar('invalida', 'El límite tiene que estar entre 1 y 200.', 422);
  end if;

  select array_agg(id order by codigo collate "C") into v_ids from (
    select l.id, l.codigo from public.lotes l
     where l.sede_id = (ctx ->> 'sede')::uuid
       and (not v_con or l.existencia > 0)
       and (v_despues is null or l.codigo collate "C" > v_despues collate "C")
     order by l.codigo collate "C"
     limit v_limite + 1) x;

  return jsonb_build_object(
    'lotes', coalesce((select jsonb_agg(privado.lote_json(ctx, i) order by n)
                         from unnest(v_ids[1:v_limite]) with ordinality u(i, n)), '[]'::jsonb),
    'siguiente', case when coalesce(array_length(v_ids, 1), 0) > v_limite
                      then (select codigo from public.lotes where id = v_ids[v_limite]) end);
end $$;

-- ---------------------------------------------------------------------------
-- Registro y permisos
-- ---------------------------------------------------------------------------

insert into privado.acciones (accion, funcion, rol_minimo, descripcion) values
  ('registrar_lote', 'privado.registrar_lote', 'obrador', 'Alta de un lote por compra o por conteo inicial'),
  ('ajustar_lote', 'privado.ajustar_lote', 'obrador', 'Ajuste o merma de la existencia de un lote, con motivo'),
  ('fijar_equivalencia', 'privado.fijar_equivalencia', 'obrador', 'Nueva version de los gramos de una medida del lote')
on conflict (accion) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('bodega', 'privado.consultar_bodega', 'operario', 'Lotes de la sede, paginados por codigo; dinero solo para gerencia')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

revoke all on function privado.dato_equivalencias(jsonb), privado.lote_json(jsonb, uuid),
  privado.lote_para_cambiar(jsonb, uuid, integer),
  privado.registrar_lote(jsonb, integer, jsonb), privado.ajustar_lote(jsonb, integer, jsonb),
  privado.fijar_equivalencia(jsonb, integer, jsonb), privado.consultar_bodega(jsonb, jsonb)
  from public, anon, authenticated;
