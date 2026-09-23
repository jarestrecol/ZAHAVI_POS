-- =============================================================================
--  0016 · EL SERVIDOR COSTEA IGUAL QUE LA APLICACION
-- =============================================================================
--
--  `privado.costear()` es la traduccion, regla por regla, de `costearPlan`
--  (`src/core/costeo.js`): gramos, FEFO, vencidos y compras futuras fuera,
--  agua de proceso sin bodega, equivalencias ausentes o contradictorias como
--  error de la linea, y costo repartido por tramos de lote.
--
--  POR QUE ES UNA FUNCION PURA
--  ---------------------------
--  Recibe las lineas, los lotes y el dia; no lee tablas. Asi se prueba contra
--  el MISMO contrato que el cliente (`db/pruebas/casos-costeo.json`, 14 casos)
--  y la funcion que confirma (F3-4) solo tiene que armarle los lotes ya
--  bloqueados. Costear y descontar son dos cosas; esta solo costea.
--
--  POR QUE `float8` Y NO `numeric`
--  -------------------------------
--  El contrato exige la MISMA salida que la aplicacion: un peso o un gramo de
--  diferencia es un fallo. JavaScript calcula en dobles IEEE 754, y `float8`
--  es exactamente esa aritmetica (mismas sumas, en el mismo orden, mismos
--  redondeos). Con `numeric` saldrian cifras "mas exactas" y distintas. La
--  precision del libro no se pierde: lo que se guarda pasa a numeric(18,6) al
--  escribirse, y saldo y libro reciben el mismo valor.
--
--  Diferencias conocidas y aceptadas con el cliente: `btrim` recorta espacios
--  (no tabuladores) y los acentos se quitan con `translate` para las vocales,
--  que es lo unico que aparece en "AGUA (FRÍA)". Los ids de lote se ordenan con
--  la collation "C"; los del cliente son `L001`... y ordenan igual.

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

--  `Number(String(x).replace(',', '.'))`: vacio es 0, basura es NaN.
create or replace function privado.leer_numero(valor jsonb)
returns float8
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  t text;
begin
  if valor is null or jsonb_typeof(valor) = 'null' then
    return 0;
  elsif jsonb_typeof(valor) = 'number' then
    return (valor #>> '{}')::float8;
  elsif jsonb_typeof(valor) = 'string' then
    t := btrim(replace(valor #>> '{}', ',', '.'));
    if t = '' then
      return 0;
    end if;
    begin
      return t::float8;
    exception when invalid_text_representation then
      return 'NaN'::float8;
    end;
  end if;
  return 'NaN'::float8;
end $$;

create or replace function privado.finito(x float8)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select x is not null and x not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
$$;

--  Como `JSON.stringify`: NaN e infinitos salen como null.
--  (0017 le fija `extra_float_digits`: en Supabase escribia solo 15 cifras.)
create or replace function privado.numero_json(x float8)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when privado.finito(x) then to_jsonb(x) else 'null'::jsonb end
$$;

--  `factorGramos(unidad, equivalencias)` de `src/core/conversiones.js`.
create or replace function privado.factor_gramos(unidad text, equivalencias jsonb)
returns float8
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  u text := upper(btrim(coalesce(unidad, '')));
  f jsonb;
  v float8;
begin
  u := case u
    when 'G' then 'GR' when 'GRAMO' then 'GR' when 'GRAMOS' then 'GR'
    when 'KILOGRAMO' then 'KG' when 'KILOGRAMOS' then 'KG'
    when 'L' then 'LT' when 'LITRO' then 'LT' when 'LITROS' then 'LT'
    when 'MILILITRO' then 'ML' when 'MILILITROS' then 'ML'
    when 'UN' then 'UND' when 'UNIDAD' then 'UND' when 'UNIDADES' then 'UND'
    when 'TANDAS' then 'TANDA'
    else u end;

  if u = 'GR' then return 1; end if;
  if u = 'KG' then return 1000; end if;
  if u = 'MG' then return 0.001::float8; end if;

  if equivalencias is null or jsonb_typeof(equivalencias) <> 'object' then
    return null;
  end if;
  f := equivalencias -> (case when u = 'LT' then 'ML' else u end);
  if f is null or jsonb_typeof(f) <> 'number' then
    return null;
  end if;
  v := (f #>> '{}')::float8;
  if not privado.finito(v) or v <= 0 then
    return null;
  end if;
  v := v * (case when u = 'LT' then 1000 else 1 end);
  return case when privado.finito(v) then v end;
end $$;

create or replace function privado.clave_ingrediente(nombre text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(upper(btrim(coalesce(nombre, ''))), '\s+', ' ', 'g')
$$;

create or replace function privado.es_agua_de_proceso(nombre text)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select translate(upper(btrim(coalesce(nombre, ''))), 'ÁÉÍÓÚÜÀÈÌÒÙ', 'AEIOUUAEIOU')
         ~ '^AGUA(\s*\(\s*(CALIENTE|FRIA|TIBIA)\s*\))?$'
$$;

--  `Math.round`: la mitad sube (hacia +infinito), tambien en negativos.
create or replace function privado.redondear_js(x float8)
returns float8
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select floor(x + 0.5)
$$;

-- ---------------------------------------------------------------------------
-- El costeo
-- ---------------------------------------------------------------------------

create or replace function privado.costear(p_lineas jsonb, p_lotes jsonb, p_hoy date)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  hoy text := to_char(p_hoy, 'YYYY-MM-DD');
  eps constant float8 := 2.220446049250313e-16;          -- Number.EPSILON
  agua_motivo constant text :=
    'Agua de proceso: 1 ml ≈ 1 g. Sin compra ni descuento de bodega; costo de materia prima $0.';

  lote jsonb[] := '{}';   -- lotes utilizables, en orden FEFO
  queda float8[] := '{}'; -- lo que le queda a cada uno mientras se costea
  vencidos integer := 0;

  l jsonb;
  linea jsonb;
  lineas jsonb := '[]';
  unidad_receta text;
  cantidad_receta float8;
  factor_receta float8;
  fijo float8;
  cantidad float8;
  propios integer[];
  referencias integer[];
  factores float8[];
  f float8;
  i integer;
  hay_sin_factor boolean;
  disponible float8;
  por_cubrir float8;
  costo float8;
  previo float8;
  gpu float8;
  gramos float8;
  sale float8;
  peso float8;
  unitario float8;
  origen jsonb;
  sin_precio boolean;
  faltante float8;
  consumo float8;
  estado text;

  costo_total float8 := 0;
  n_sin_precio integer := 0;
  n_sin_conversion integer := 0;
  n_faltante integer := 0;
  cubierto float8 := 0;
  n_lineas integer := 0;
begin
  -- Vigentes: los que ya se habian comprado ese dia, en orden FEFO (sin fecha
  -- de vencimiento, al final; empate, por id).
  for l in
    select x from jsonb_array_elements(coalesce(p_lotes, '[]')) x
    where coalesce(x ->> 'fechaCompra', '') = '' or x ->> 'fechaCompra' <= hoy
    order by coalesce(x ->> 'vencimiento', '') = '', coalesce(x ->> 'vencimiento', ''),
             (x ->> 'id') collate "C"
  loop
    if coalesce(l ->> 'vencimiento', '') <> '' and l ->> 'vencimiento' < hoy then
      if privado.leer_numero(l -> 'existencia') > 0 then
        vencidos := vencidos + 1;
      end if;
    else
      lote := array_append(lote, l);
      f := privado.leer_numero(l -> 'existencia');
      queda := array_append(queda, greatest(0, case when privado.finito(f) then f else 0 end));
    end if;
  end loop;

  for linea in select x from jsonb_array_elements(coalesce(p_lineas, '[]')) x loop
    n_lineas := n_lineas + 1;
    unidad_receta := upper(btrim(coalesce(linea ->> 'unidad', '')));
    cantidad_receta := privado.leer_numero(linea -> 'cantidad');

    -- Agua de proceso: sin bodega y sin costo.
    if privado.es_agua_de_proceso(linea ->> 'ingrediente') then
      factor_receta := privado.factor_gramos(unidad_receta, '{"ML": 1}');
      cantidad := cantidad_receta * factor_receta;
      if factor_receta is not null and privado.finito(cantidad) and cantidad >= 0 then
        lineas := lineas || jsonb_build_array(jsonb_build_object(
          'ingrediente', linea -> 'ingrediente', 'unidad', 'GR', 'unidadReceta', unidad_receta,
          'cantidadReceta', privado.numero_json(cantidad_receta), 'factorReceta', privado.numero_json(factor_receta),
          'cantidad', privado.numero_json(cantidad), 'disponible', privado.numero_json(cantidad),
          'consumo', privado.numero_json(cantidad), 'faltante', 0, 'costo', 0, 'precioMedio', 0,
          'estado', 'ok', 'origen', '[]'::jsonb, 'servicio', true, 'motivo', agua_motivo));
        cubierto := cubierto + (case when cantidad > 0 then 1 else 0 end);
        continue;
      end if;
    end if;

    propios := '{}';
    for i in 1 .. coalesce(array_length(lote, 1), 0) loop
      if privado.clave_ingrediente(lote[i] ->> 'ingrediente') = privado.clave_ingrediente(linea ->> 'ingrediente') then
        propios := array_append(propios, i);
      end if;
    end loop;

    fijo := privado.factor_gramos(unidad_receta, '{}');

    -- La formula necesita un peso inequivoco: con los que tienen existencia, o
    -- con todos si ninguno tiene.
    referencias := array(select p from unnest(propios) p where privado.leer_numero(lote[p] -> 'existencia') > 0);
    if coalesce(array_length(referencias, 1), 0) = 0 then
      referencias := propios;
    end if;
    factores := array(select distinct privado.factor_gramos(unidad_receta, lote[p] -> 'equivalencias')
                      from unnest(referencias) p
                      where privado.factor_gramos(unidad_receta, lote[p] -> 'equivalencias') is not null);

    factor_receta := coalesce(fijo, case when coalesce(array_length(factores, 1), 0) = 1 then factores[1] end);
    cantidad := case when factor_receta is null then null else cantidad_receta * factor_receta end;

    hay_sin_factor := exists (select 1 from unnest(propios) p
                              where queda[p] > 0 and privado.factor_gramos(lote[p] ->> 'unidad', lote[p] -> 'equivalencias') is null);

    if factor_receta is null or hay_sin_factor or not privado.finito(cantidad) or cantidad < 0 then
      lineas := lineas || jsonb_build_array(jsonb_build_object(
        'ingrediente', linea -> 'ingrediente', 'unidad', 'GR', 'unidadReceta', unidad_receta,
        'cantidadReceta', privado.numero_json(cantidad_receta), 'factorReceta', privado.numero_json(factor_receta),
        'cantidad', privado.numero_json(cantidad), 'disponible', 0, 'consumo', 0,
        'faltante', privado.numero_json(cantidad), 'costo', 0, 'precioMedio', null,
        'estado', 'sin_conversion', 'origen', '[]'::jsonb,
        'motivo', case when coalesce(array_length(factores, 1), 0) > 1 and fijo is null
                    then 'Hay equivalencias diferentes para ' || unidad_receta || '. Revisa los lotes del ingrediente en Bodega.'
                    else 'Falta una equivalencia válida en gramos. Edita el ingrediente en Bodega.' end));
      n_sin_precio := n_sin_precio + 1;
      n_sin_conversion := n_sin_conversion + 1;
      n_faltante := n_faltante + 1;
      continue;
    end if;

    -- Se suma en el mismo orden que el cliente: con dobles, el orden cambia el resultado.
    disponible := 0;
    foreach i in array propios loop
      if queda[i] > 0 then
        disponible := disponible + queda[i] * privado.factor_gramos(lote[i] ->> 'unidad', lote[i] -> 'equivalencias');
      end if;
    end loop;

    if not privado.finito(disponible) then
      lineas := lineas || jsonb_build_array(jsonb_build_object(
        'ingrediente', linea -> 'ingrediente', 'unidad', 'GR', 'unidadReceta', unidad_receta,
        'cantidadReceta', privado.numero_json(cantidad_receta), 'factorReceta', privado.numero_json(factor_receta),
        'cantidad', privado.numero_json(cantidad), 'disponible', 0, 'consumo', 0,
        'faltante', privado.numero_json(cantidad), 'costo', 0, 'precioMedio', null,
        'estado', 'sin_conversion', 'origen', '[]'::jsonb,
        'motivo', 'Revisa las cantidades y equivalencias: exceden el límite de cálculo.'));
      n_sin_precio := n_sin_precio + 1;
      n_sin_conversion := n_sin_conversion + 1;
      n_faltante := n_faltante + 1;
      continue;
    end if;

    por_cubrir := cantidad;
    costo := 0;
    origen := '[]';
    foreach i in array propios loop
      continue when not (queda[i] > 0);
      exit when por_cubrir <= 0;
      gpu := privado.factor_gramos(lote[i] ->> 'unidad', lote[i] -> 'equivalencias');
      gramos := least(queda[i] * gpu, por_cubrir);
      sale := least(queda[i], gramos / gpu);
      peso := privado.leer_numero(lote[i] -> 'pesoCompra');
      peso := case when privado.finito(peso) then peso else 0 end;
      f := privado.leer_numero(lote[i] -> 'costoCompra');
      f := case when privado.finito(f) then f else 0 end;
      unitario := case when peso > 0 then f / peso end;
      previo := costo;
      costo := costo + coalesce(unitario * sale, 0);
      queda[i] := queda[i] - sale;
      por_cubrir := por_cubrir - gramos;
      origen := origen || jsonb_build_array(jsonb_build_object(
        'loteId', lote[i] -> 'id', 'lote', lote[i] -> 'lote', 'marca', lote[i] -> 'marca',
        'proveedor', case when coalesce(lote[i] ->> 'proveedor', '') = '' then '""'::jsonb else lote[i] -> 'proveedor' end,
        'unidad', lote[i] -> 'unidad', 'cantidad', privado.numero_json(sale),
        'cantidadGramos', privado.numero_json(gramos), 'gramosPorUnidad', privado.numero_json(gpu),
        'precioPorGramo', privado.numero_json(unitario / gpu), 'precioUnitario', privado.numero_json(unitario),
        'costo', privado.numero_json(privado.redondear_js(costo) - privado.redondear_js(previo)),
        'vencimiento', lote[i] -> 'vencimiento', 'sinPrecio', unitario is null));
    end loop;

    -- Tolerancia binaria; no perdonar miligramos por redondear el faltante.
    faltante := case when por_cubrir <= eps * greatest(1, cantidad) * 16 then 0 else por_cubrir end;
    consumo := cantidad - por_cubrir;
    sin_precio := exists (select 1 from jsonb_array_elements(origen) o where (o ->> 'sinPrecio')::boolean);
    estado := case
      when sin_precio or coalesce(array_length(propios, 1), 0) = 0 then 'sin_precio'
      when consumo <= 0 and cantidad > 0 then 'sin_existencia'
      when faltante > 0 then 'parcial'
      else 'ok' end;

    lineas := lineas || jsonb_build_array(jsonb_build_object(
      'ingrediente', linea -> 'ingrediente', 'unidad', 'GR', 'unidadReceta', unidad_receta,
      'cantidadReceta', privado.numero_json(cantidad_receta), 'factorReceta', privado.numero_json(factor_receta),
      'cantidad', privado.numero_json(cantidad), 'disponible', privado.numero_json(disponible),
      'consumo', privado.numero_json(consumo), 'faltante', privado.numero_json(faltante),
      'costo', privado.numero_json(privado.redondear_js(costo)),
      'precioMedio', case when consumo > 0 then privado.numero_json(costo / consumo) else 'null'::jsonb end,
      'estado', estado, 'origen', origen));

    costo_total := costo_total + privado.redondear_js(costo);
    n_sin_precio := n_sin_precio + (case when estado = 'sin_precio' then 1 else 0 end);
    n_faltante := n_faltante + (case when faltante > 0 then 1 else 0 end);
    cubierto := cubierto + (case when cantidad > 0 then consumo / cantidad else 0 end);
  end loop;

  return jsonb_build_object(
    'lineas', lineas,
    'costoTotal', privado.numero_json(costo_total),
    'lineasSinPrecio', n_sin_precio,
    'lineasSinConversion', n_sin_conversion,
    'lineasConFaltante', n_faltante,
    'cubiertoTotal', privado.numero_json(case when n_lineas > 0 then cubierto / n_lineas else 0 end),
    'lotesVencidosIgnorados', vencidos);
end $$;

--  Solo la usan las funciones del servidor: nadie la llama por la API.
revoke all on function privado.leer_numero(jsonb), privado.finito(float8), privado.numero_json(float8),
  privado.factor_gramos(text, jsonb), privado.clave_ingrediente(text), privado.es_agua_de_proceso(text),
  privado.redondear_js(float8), privado.costear(jsonb, jsonb, date)
  from public, anon, authenticated;
