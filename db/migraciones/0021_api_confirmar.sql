-- =============================================================================
--  0021 · CONFIRMAR UNA RECETA: COSTEAR Y DESCONTAR COMO UNA SOLA OPERACION
-- =============================================================================
--
--  Lo que en el navegador era `confirmarRecetaEn` + `aprobarPlanEn`, ahora en el
--  servidor y dentro de UNA transaccion. O pasa todo o no pasa nada:
--
--    1. Se bloquea el plan del dia (serializa las confirmaciones de ese dia) y
--       se comprueba la revision que vio la pantalla.
--    2. Se bloquean los lotes del ingrediente, en orden estable (por id), para
--       que dos confirmaciones o un ajuste de bodega no se crucen ni se
--       bloqueen mutuamente.
--    3. Se costea con `privado.costear()` (0016), la misma regla del cliente,
--       sobre lo PENDIENTE de la receta y con la formula CONGELADA del plan.
--    4. Si falta algo o falta una equivalencia, se niega (422) sin tocar nada.
--    5. Si el costeo no es el que vio la persona (su `huella`), se niega (409):
--       nadie confirma un costo que no vio.
--    6. Se crean la ejecucion con el costeo congelado, sus partidas, un consumo
--       y un movimiento por tramo de lote; se descuenta el saldo de cada lote
--       en la misma sentencia que su libro; se marcan las partidas como
--       producidas; se limpia la preparacion y queda la bitacora.
--
--  La COTIZACION es la consulta que calcula lo mismo sin bloquear ni escribir:
--  es lo que la pantalla ensena antes de confirmar, con su huella.
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- La receta como lineas: `consolidar()` de src/core/plan.js para una receta
-- ---------------------------------------------------------------------------
--  Se escala lo escalable; lo que no (CM, MM, grados, minutos...) queda igual,
--  salvo el papel parafinado en CM, que es un consumible de cada tanda. Se
--  descarta lo que no es una cantidad positiva. Un mismo ingrediente en dos
--  unidades son dos lineas: nunca se suman gramos con unidades.

create or replace function privado.lineas_de_receta(p_receta jsonb, p_tandas numeric)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  f float8 := p_tandas::float8;
  c jsonb;
  it jsonb;
  v_nombre text;
  v_unidad text;
  v_clave text;
  v_cantidad float8;
  acumulado jsonb := '{}';
begin
  for c in select value from jsonb_array_elements(coalesce(p_receta -> 'componentes', '[]')) loop
    for it in select value from jsonb_array_elements(coalesce(c -> 'items', '[]')) loop
      v_nombre := btrim(coalesce(it ->> 'ingrediente', ''));
      continue when v_nombre = '';
      v_unidad := upper(btrim(coalesce(it ->> 'unidad', '')));
      v_cantidad := privado.leer_numero(it -> 'cantidad');
      if v_unidad <> all (array['CM', 'MM', 'M', 'PULG', '°C', 'C', 'MIN', 'HORA', 'HORAS']) then
        v_cantidad := v_cantidad * f;
      elsif v_unidad = 'CM' and translate(upper(v_nombre), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') = 'PAPEL PARAFINADO' then
        v_cantidad := v_cantidad * f;
      end if;
      continue when not privado.finito(v_cantidad) or v_cantidad <= 0;
      v_clave := translate(upper(v_nombre), 'ÁÉÍÓÚÜÑ', 'AEIOUUN') || '|' || v_unidad;
      acumulado := jsonb_set(acumulado, array[v_clave], jsonb_build_object(
        'ingrediente', coalesce(acumulado #>> array[v_clave, 'ingrediente'], v_nombre),
        'unidad', v_unidad,
        'cantidad', privado.numero_json(coalesce((acumulado #>> array[v_clave, 'cantidad'])::float8, 0) + v_cantidad)));
    end loop;
  end loop;
  return coalesce((select jsonb_agg(value order by key collate "C") from jsonb_each(acumulado)), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- La cotizacion: lo pendiente de una receta, costeado con la bodega actual
-- ---------------------------------------------------------------------------
--  Con `bloquear`, deja los lotes tomados hasta el final de la transaccion.

create or replace function privado.cotizar(ctx jsonb, p_plan uuid, p_receta uuid, p_fecha date, bloquear boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_pendiente numeric;
  v_congelada jsonb;
  v_lineas jsonb;
  v_claves text[];
  v_ids uuid[];
  v_lotes jsonb;
  v_costeo jsonb;
begin
  select coalesce(sum(tandas), 0), (array_agg(receta order by partida))[1]
    into v_pendiente, v_congelada
    from public.plan_partidas where plan_id = p_plan and receta_id = p_receta and ejecucion_id is null;

  v_lineas := privado.lineas_de_receta(v_congelada, v_pendiente);
  select array_agg(distinct privado.clave_ingrediente(l ->> 'ingrediente'))
    into v_claves from jsonb_array_elements(v_lineas) l;

  select array_agg(l.id order by l.id) into v_ids
    from public.lotes l join public.ingredientes i on i.id = l.ingrediente_id
   where l.sede_id = (ctx ->> 'sede')::uuid and privado.clave_ingrediente(i.nombre) = any (coalesce(v_claves, '{}'));

  if bloquear and v_ids is not null then
    perform 1 from public.lotes where id = any (v_ids) order by id for update;
  end if;

  -- Los lotes en la forma normalizada que espera `costear()`.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id::text, 'ingrediente', i.nombre, 'unidad', l.unidad,
           'pesoCompra', l.peso_compra, 'costoCompra', l.costo_compra,
           'existencia', privado.numero_json(l.existencia::float8),
           'vencimiento', coalesce(to_char(l.vencimiento, 'YYYY-MM-DD'), ''),
           'fechaCompra', coalesce(to_char(l.fecha_compra, 'YYYY-MM-DD'), ''),
           'lote', coalesce(l.lote_proveedor, ''), 'marca', coalesce(l.marca, ''),
           'proveedor', coalesce(p.nombre, ''),
           'equivalencias', coalesce((select jsonb_object_agg(q.medida, q.gramos) from public.equivalencias_lote q
                                       where q.lote_id = l.id and q.vigente), '{}'))), '[]'::jsonb)
    into v_lotes
    from public.lotes l join public.ingredientes i on i.id = l.ingrediente_id
    left join public.proveedores p on p.id = l.proveedor_id
   where l.id = any (coalesce(v_ids, '{}'));

  v_costeo := privado.costear(v_lineas, v_lotes, p_fecha);

  return jsonb_build_object(
    'pendiente', v_pendiente,
    'receta', v_congelada,
    'costeo', v_costeo,
    'huella', md5(v_costeo::text),
    'listo', v_pendiente > 0 and jsonb_array_length(v_costeo -> 'lineas') > 0
             and (v_costeo ->> 'lineasSinConversion')::int = 0
             and (v_costeo ->> 'lineasConFaltante')::int = 0
             and (v_costeo ->> 'lineasSinPrecio')::int = 0);
end $$;

create or replace function privado.consultar_cotizacion(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(q, 'fecha', true);
  v_receta uuid := privado.dato_uuid(q, 'receta_id', true);
  r jsonb := privado.receta_en_plan(ctx, v_fecha, v_receta);
  c jsonb;
begin
  c := privado.cotizar(ctx, (r ->> 'plan_id')::uuid, v_receta, v_fecha, false);
  return jsonb_build_object('fecha', v_fecha, 'receta_id', v_receta,
    'plan_revision', (select revision from public.planes where id = (r ->> 'plan_id')::uuid),
    'pendiente', c -> 'pendiente', 'costeo', c -> 'costeo', 'huella', c -> 'huella', 'listo', c -> 'listo');
end $$;

-- ---------------------------------------------------------------------------
-- confirmar_receta
-- ---------------------------------------------------------------------------

create or replace function privado.confirmar_receta(ctx jsonb, p_revision integer, d jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := privado.dato_fecha(d, 'fecha', true);
  v_receta uuid := privado.dato_uuid(d, 'receta_id', true);
  v_huella text := privado.dato_texto(d, 'huella', true, 32);
  p public.planes;
  r jsonb;
  c jsonb;
  v_costeo jsonb;
  v_ejecucion uuid := gen_random_uuid();
  linea jsonb;
  tramo jsonb;
  v_cantidad numeric;
  v_lote public.lotes;
begin
  if v_fecha > (ctx ->> 'hoy')::date then
    perform privado.fallar('invalida', 'Los días futuros se planifican; confirma la producción cuando llegue el día.', 422);
  end if;

  -- 1. El plan, bloqueado y en la revision que se vio.
  p := privado.plan_para_cambiar(ctx, v_fecha, p_revision);
  if p.id is null then
    perform privado.fallar('invalida', 'Este día no tiene producción planeada.', 422);
  end if;
  r := privado.receta_en_plan(ctx, v_fecha, v_receta);
  perform privado.exigir_trabajo(ctx, r);
  if (r ->> 'pendiente')::numeric = 0 then
    perform privado.fallar('invalida', 'Esta receta ya está lista. No se descontó nada más.', 422);
  end if;

  -- 2 y 3. Lotes bloqueados y costeo con la bodega de este instante.
  c := privado.cotizar(ctx, p.id, v_receta, v_fecha, true);
  v_costeo := c -> 'costeo';

  -- 4. Sin equivalencias o con faltantes no se descuenta nada.
  if (v_costeo ->> 'lineasSinConversion')::int > 0 then
    perform privado.fallar('invalida', 'Completa o corrige las equivalencias en gramos en Bodega antes de confirmar la producción.', 422);
  end if;
  if not (c ->> 'listo')::boolean then
    perform privado.fallar('invalida', 'Faltan ingredientes para completar la producción. Registra la compra o ajusta las tandas antes de confirmar.', 422);
  end if;

  -- 5. Nadie confirma un costo que no vio.
  if c ->> 'huella' <> v_huella then
    perform privado.fallar('conflicto', 'La bodega cambió desde el cálculo. Actualiza la receta y revisa el costo antes de confirmar.', 409);
  end if;

  -- 6. Todo junto.
  insert into public.ejecuciones (id, sede_id, fecha, plan_revision, area, receta_id, responsable, motivo,
                                  autor_id, costo_total, costeo)
  values (v_ejecucion, p.sede_id, v_fecha, p.revision, r ->> 'categoria', v_receta, ctx ->> 'responsable',
          coalesce(privado.dato_texto(d, 'motivo', false, 280), 'Receta preparada'), (ctx ->> 'perfil')::uuid,
          round((v_costeo ->> 'costoTotal')::numeric, 2), v_costeo);

  insert into public.ejecucion_partidas (ejecucion_id, receta_id, partida, tandas, receta)
  select v_ejecucion, receta_id, partida, tandas, receta
    from public.plan_partidas where plan_id = p.id and receta_id = v_receta and ejecucion_id is null;

  for linea in select value from jsonb_array_elements(v_costeo -> 'lineas') loop
    for tramo in select value from jsonb_array_elements(coalesce(linea -> 'origen', '[]')) loop
      v_cantidad := round((tramo ->> 'cantidad')::numeric, 6);
      continue when v_cantidad <= 0;
      select * into v_lote from public.lotes where id = (tramo ->> 'loteId')::uuid;
      -- El redondeo a seis decimales nunca puede dejar el saldo en negativo.
      v_cantidad := least(v_cantidad, v_lote.existencia);
      continue when v_cantidad <= 0;

      insert into public.ejecucion_consumos (ejecucion_id, lote_id, ingrediente_id, cantidad, unidad, gramos,
                                             gramos_por_unidad, precio_unitario, costo)
      values (v_ejecucion, v_lote.id, v_lote.ingrediente_id, v_cantidad, v_lote.unidad,
              round((tramo ->> 'cantidadGramos')::numeric, 6), round((tramo ->> 'gramosPorUnidad')::numeric, 6),
              round(coalesce((tramo ->> 'precioUnitario')::numeric, 0), 6), round((tramo ->> 'costo')::numeric, 2));

      insert into public.movimientos (lote_id, tipo, cantidad, motivo, creado_por, ejecucion_id)
      values (v_lote.id, 'salida', -v_cantidad, 'Producción: ' || (r ->> 'nombre'), (ctx ->> 'perfil')::uuid, v_ejecucion);

      update public.lotes set existencia = existencia - v_cantidad, revision = revision + 1 where id = v_lote.id;
    end loop;
  end loop;

  update public.plan_partidas set ejecucion_id = v_ejecucion
   where plan_id = p.id and receta_id = v_receta and ejecucion_id is null;
  update public.planes set revision = revision + 1, actualizado = now() where id = p.id;
  update public.preparaciones set iniciada = null, iniciada_por = null, actualizada = now()
   where sede_id = p.sede_id and fecha = p.fecha and receta_id = v_receta and iniciada is not null;

  perform privado.anotar(ctx, 'produccion_aprobada', v_fecha, 'Receta preparada',
    jsonb_build_object('ejecucion_id', v_ejecucion, 'receta_id', v_receta),
    jsonb_build_object('tandas', c -> 'pendiente', 'costo_total', v_costeo -> 'costoTotal'));

  return jsonb_build_object(
    'ejecucion_id', v_ejecucion,
    'ejecucion', jsonb_build_object('id', v_ejecucion, 'fecha', v_fecha, 'receta_id', v_receta,
                                    'tandas', c -> 'pendiente', 'costo_total', v_costeo -> 'costoTotal',
                                    'costeo', v_costeo),
    'receta', privado.receta_del_dia(p.id, v_receta),
    'plan_revision', p.revision + 1);
end $$;

-- ---------------------------------------------------------------------------
-- Registro y permisos
-- ---------------------------------------------------------------------------

insert into privado.acciones (accion, funcion, rol_minimo, descripcion) values
  ('confirmar_receta', 'privado.confirmar_receta', 'operario', 'Costea y descuenta lo pendiente de una receta en una sola transaccion')
on conflict (accion) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('cotizacion', 'privado.consultar_cotizacion', 'operario', 'Costeo de lo pendiente de una receta, con la huella que exige confirmar')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

revoke all on function privado.lineas_de_receta(jsonb, numeric),
  privado.cotizar(jsonb, uuid, uuid, date, boolean), privado.consultar_cotizacion(jsonb, jsonb),
  privado.confirmar_receta(jsonb, integer, jsonb)
  from public, anon, authenticated;
