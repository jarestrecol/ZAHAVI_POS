-- Usuario indica que Supabase ya contiene toda la operación. Ejecutar con acceso
-- administrativo de Claude y registrar SOLO estos agregados; no exportar filas.
-- Requiere 0014 aplicada. Un error no equivale a cero registros.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';

select current_timestamp as observado_en,
  (select count(*) from public.lotes) as lotes,
  (select count(*) from public.movimientos) as movimientos,
  (select count(*) from public.planes) as planes,
  (select count(*) from public.plan_partidas) as partidas,
  (select count(*) from public.ejecuciones) as ejecuciones,
  (select count(*) from public.ejecucion_consumos) as consumos,
  (select count(*) from public.resultados) as resultados,
  (select count(*) from public.preparaciones) as preparaciones,
  (select count(*) from public.notas) as notas,
  (select count(*) from public.eventos_operacion) as eventos,
  (select count(*) from public.importaciones) as importaciones;

-- ¿Qué procedencia sobrevivió? Su ausencia significa por clasificar, no real.
select 'lotes' as entidad, count(*) as filas,
  count(*) filter (where historico) as historicas,
  count(*) filter (where importacion_id is not null) as con_importacion,
  count(*) filter (where id_origen is not null) as con_id_origen
from public.lotes
union all
select 'ejecuciones', count(*), count(*) filter (where historico),
  count(*) filter (where importacion_id is not null), count(*) filter (where id_origen is not null)
from public.ejecuciones;

-- Columnas reales disponibles para aislamiento demo, sin asumir su existencia.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('lotes', 'ejecuciones', 'importaciones', 'eventos_operacion')
  and (column_name ilike '%demo%' or column_name ilike '%entorno%'
    or column_name in ('origen', 'historico', 'importacion_id', 'id_origen'))
order by table_name, ordinal_position;

-- Precisión del libro frente al saldo; no revelar cantidades ni importes.
select table_name, column_name, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and
  ((table_name = 'movimientos' and column_name = 'cantidad')
  or (table_name = 'lotes' and column_name in ('peso_compra', 'existencia'))
  or (table_name = 'ejecucion_consumos' and column_name in ('cantidad', 'gramos')))
order by table_name, column_name;

select
  (select count(*) from public.movimientos m left join public.ejecuciones e on e.id = m.ejecucion_id
    where m.ejecucion_id is not null and e.id is null) as movimientos_huerfanos,
  (select count(*) from public.resultados r where not exists
    (select 1 from public.ejecucion_partidas p where p.ejecucion_id = r.ejecucion_id and p.receta_id = r.receta_id)) as resultados_sin_partida,
  (select count(*) from public.ejecucion_consumos c join public.ejecuciones e on e.id = c.ejecucion_id
    join public.lotes l on l.id = c.lote_id where e.sede_id <> l.sede_id) as consumos_entre_sedes;

-- Conteos de grupos repetidos; no exponer identificadores privados.
select count(*) as respaldos_repetidos from
  (select sede_id, origen, huella, modo from public.importaciones
    group by sede_id, origen, huella, modo having count(*) > 1) repetidos;
rollback;
