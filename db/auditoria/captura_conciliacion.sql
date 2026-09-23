-- CAPTURA PRIVADA. Contiene costos y f?rmulas: guardar fuera del repositorio/webroot.
-- Ejecutar sobre Zahavi_Pos con acceso administrativo. Repetir antes/despu?s del
-- ensayo. No cambia datos. Requiere 0014; fallo o permisos limitados no significan vac?o.
begin transaction isolation level repeatable read read only;
set local statement_timeout = '30s';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'La captura exige lectura administrativa completa; no usar filas filtradas por RLS';
  end if;
end $$;
select jsonb_build_object(
  'version', 1, 'proyecto', 'xjcdeczfyghanrccgsxu',
  'capturada', transaction_timestamp(), 'completa', true,
  'lotes', coalesce((select jsonb_agg(jsonb_build_object(
    'id', l.id, 'existencia', l.existencia::text, 'peso_compra', l.peso_compra::text,
    'costo_compra', l.costo_compra::text, 'unidad', l.unidad,
    'equivalencias', coalesce((select jsonb_agg(jsonb_build_object('medida', q.medida,
      'version', q.version, 'gramos', q.gramos::text, 'vigente', q.vigente)
      order by q.medida, q.version) from public.equivalencias_lote q where q.lote_id = l.id), '[]'::jsonb)
  ) order by l.id) from public.lotes l), '[]'::jsonb),
  'ejecuciones', coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id, 'costo_total', e.costo_total::text, 'costeo', e.costeo::text,
    'formula', coalesce((select jsonb_agg(jsonb_build_object('receta_id', p.receta_id,
      'partida', p.partida, 'tandas', p.tandas::text, 'receta', p.receta::text)
      order by p.receta_id, p.partida) from public.ejecucion_partidas p where p.ejecucion_id = e.id), '[]'::jsonb)
  ) order by e.id) from public.ejecuciones e), '[]'::jsonb),
  'resultados', coalesce((select jsonb_agg(jsonb_build_object(
    'id', jsonb_build_array(r.ejecucion_id, r.receta_id)::text,
    'vendible', r.vendible::text, 'rechazado', r.rechazado::text,
    'detalle', to_jsonb(r)::text
  ) order by r.ejecucion_id, r.receta_id) from public.resultados r), '[]'::jsonb),
  'movimientos', coalesce((select jsonb_agg(jsonb_build_object(
    'id', m.id::text, 'cantidad', m.cantidad::text, 'detalle', to_jsonb(m)::text
  ) order by m.id) from public.movimientos m), '[]'::jsonb),
  'planes', coalesce((select jsonb_agg(jsonb_build_object(
    'id', p.id, 'detalle', to_jsonb(p)::text,
    'partidas', coalesce((select jsonb_agg(to_jsonb(pp)::text order by pp.receta_id, pp.partida)
      from public.plan_partidas pp where pp.plan_id = p.id), '[]'::jsonb)
  ) order by p.id) from public.planes p), '[]'::jsonb),
  'preparaciones', coalesce((select jsonb_agg(jsonb_build_object(
    'id', jsonb_build_array(p.sede_id, p.fecha, p.receta_id)::text, 'detalle', to_jsonb(p)::text
  ) order by p.sede_id, p.fecha, p.receta_id) from public.preparaciones p), '[]'::jsonb),
  'notas', coalesce((select jsonb_agg(jsonb_build_object(
    'id', n.id, 'detalle', to_jsonb(n)::text) order by n.id) from public.notas n), '[]'::jsonb),
  'eventos', coalesce((select jsonb_agg(jsonb_build_object(
    'id', e.id::text, 'detalle', to_jsonb(e)::text) order by e.id) from public.eventos_operacion e), '[]'::jsonb),
  'metas', coalesce((select jsonb_agg(jsonb_build_object(
    'id', jsonb_build_array(m.sede_id, m.clave, m.vigente_desde)::text, 'detalle', to_jsonb(m)::text
  ) order by m.sede_id, m.clave, m.vigente_desde) from public.metas m), '[]'::jsonb)
) as captura_privada;
rollback;
