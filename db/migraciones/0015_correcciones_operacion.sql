-- =============================================================================
--  0015 · LO QUE 0014 NECESITA ANTES DE RECIBIR UN SOLO DATO REAL
-- =============================================================================
--
--  Responde a la revision de Codex (`coordinacion/entregas/REVISION-0014.md`).
--  Se aplica ahora porque las tablas de operacion estan VACIAS en el remoto
--  (lectura del 23-sep): cambiar tipos y restricciones cuesta cero hoy y una
--  migracion de datos manana.
--
--  1. El libro de movimientos a seis decimales, como el saldo que resume.
--  2. Identidad estable de lo importado: el mismo registro local, venga en el
--     respaldo que venga, es la misma fila remota.
--  3. Lo demo no entra en la base: queda su traza de exclusion, no sus filas.
--  4. Quien lo hizo en el navegador se conserva sin fingir que se autentico.
--  5. Relaciones que el esquema no garantizaba: FK del libro, resultado de una
--     receta que si estaba en la confirmacion, y nada que cruce de sede.
--  6. Permisos: el presupuesto, la bitacora y el resultado de una solicitud
--     solo para quien hoy puede ver dinero.
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 1. El libro a la misma precision que el saldo
-- ---------------------------------------------------------------------------
--  `lotes.existencia` es numeric(18,6) y tiene que ser SIEMPRE la suma de su
--  libro. Con el libro a tres decimales, consumir 0,0004 LT dejaba el saldo
--  movido y el movimiento en cero (y ademas violaba su check de signo).
--
--  `lotes.peso_compra` se queda en (14,3) a proposito: es lo que alguien
--  teclea al recibir una compra (un gramo de un kilo cabe de sobra), su
--  entrada al libro cabe entera en (18,6), y ensancharlo obligaria a rehacer
--  `valor_unitario`, que es una columna generada con vistas encima.

alter table movimientos alter column cantidad type numeric(18, 6);

-- ---------------------------------------------------------------------------
-- 2. Identidad estable de lo importado
-- ---------------------------------------------------------------------------
--  `importacion_mapeos` dependia del uuid de cada intento: dos intentos con el
--  mismo respaldo, o dos respaldos sucesivos del mismo navegador, podian crear
--  la misma compra dos veces. La identidad pasa a ser (sede, origen, entidad,
--  id local), independiente del intento, y la base la hace unica.
--
--  `importaciones.modo` sigue describiendo el PROCESO: `diagnostico` y
--  `ensayo` no dejan filas de operacion (el ensayo corre en otra base o en una
--  transaccion que se deshace); solo `definitiva` las deja, y un mismo archivo
--  solo se importa en definitiva una vez por sede y origen.

create unique index if not exists importaciones_definitiva_unica
  on importaciones (sede_id, origen, huella) where modo = 'definitiva';

create table if not exists importacion_identidades (
  sede_id uuid not null references sedes (id) on delete restrict,
  origen text not null,
  entidad text not null,
  id_origen text not null,
  id_remoto uuid not null,
  primera_importacion_id uuid not null references importaciones (id) on delete restrict,
  primary key (sede_id, origen, entidad, id_origen),
  unique (entidad, id_remoto)
);

-- ---------------------------------------------------------------------------
-- 3. Lo demo se registra como excluido, no se importa
-- ---------------------------------------------------------------------------
--  La base de produccion solo guarda operacion real. Mezclar demo con filas
--  marcadas obligaria a filtrar en cada costeo, panel y FEFO, y un filtro
--  olvidado regala o cobra de mas. Lo que el clasificador (F1) declare demo o
--  dudoso queda en el mapeo del intento con su decision y SIN fila remota; el
--  contenido sigue en el respaldo privado identificado por `huella`. Nada se
--  borra y nada dudoso se convierte en real.

alter table importacion_mapeos alter column id_remoto drop not null;
alter table importacion_mapeos add column if not exists decision text not null default 'importado';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'importacion_mapeos_decision') then
    alter table importacion_mapeos add constraint importacion_mapeos_decision check (
      (decision in ('importado', 'ya_importado') and id_remoto is not null)
      or (decision in ('excluido_demo', 'excluido_dudoso') and id_remoto is null));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Procedencia y autoria declarada
-- ---------------------------------------------------------------------------
--  Regla de 0014, ahora en TODAS las tablas que reciben historia: una fila es
--  historica si y solo si viene de una importacion, y solo una fila historica
--  puede no tener autor autenticado. El nombre que se escribio en el navegador
--  va en `responsable` (o en los `*_declarado` de preparaciones), nunca en un
--  `autor_id` que el servidor no verifico.

alter table equivalencias_lote add column if not exists importacion_id uuid references importaciones (id) on delete restrict;
alter table equivalencias_lote add column if not exists historico boolean not null default false;
alter table preparaciones add column if not exists importacion_id uuid references importaciones (id) on delete restrict;
alter table preparaciones add column if not exists historico boolean not null default false;
alter table preparaciones add column if not exists iniciada_por_declarado text;
alter table preparaciones add column if not exists asignado_declarado text;
alter table resultados add column if not exists importacion_id uuid references importaciones (id) on delete restrict;
alter table resultados add column if not exists historico boolean not null default false;
alter table metas add column if not exists importacion_id uuid references importaciones (id) on delete restrict;
alter table metas add column if not exists historico boolean not null default false;
alter table metas alter column autor_id drop not null;

alter table preparaciones drop constraint if exists preparaciones_inicio_con_autor;

do $$
declare
  t text;
begin
  foreach t in array array['lotes', 'planes', 'ejecuciones', 'notas', 'eventos_operacion',
                           'equivalencias_lote', 'preparaciones', 'resultados', 'metas']
  loop
    if not exists (select 1 from pg_constraint where conname = t || '_historico_importado') then
      execute format('alter table %I add constraint %I check (historico = (importacion_id is not null))',
                     t, t || '_historico_importado');
    end if;
  end loop;

  -- `ejecuciones` ya lo tenia desde 0014 y `preparaciones` lo resuelve con su
  -- propio check. `lotes` (`creado_por`, de 0003) todavia admite el alta
  -- directa del cliente actual: su autoria se exige en F3-5, cuando esa via se
  -- cierre y el alta pase por la funcion que pone el perfil del servidor.
  foreach t in array array['planes', 'notas', 'eventos_operacion', 'equivalencias_lote', 'resultados', 'metas']
  loop
    if not exists (select 1 from pg_constraint where conname = t || '_autoria') then
      execute format('alter table %I add constraint %I check (historico or autor_id is not null)',
                     t, t || '_autoria');
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'preparaciones_inicio_con_autor_v2') then
    alter table preparaciones add constraint preparaciones_inicio_con_autor_v2 check (
      (iniciada is null and iniciada_por is null and iniciada_por_declarado is null)
      or (iniciada is not null and (iniciada_por is not null
                                    or (historico and iniciada_por_declarado is not null))));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'preparaciones_asignacion_declarada') then
    alter table preparaciones add constraint preparaciones_asignacion_declarada
      check (asignado_declarado is null or historico);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Relaciones que el esquema tiene que garantizar por su cuenta
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'movimientos_ejecucion_fk') then
    alter table movimientos add constraint movimientos_ejecucion_fk
      foreign key (ejecucion_id) references ejecuciones (id) on delete restrict;
  end if;
end $$;

--  Una sola funcion para las comprobaciones que una FK no sabe expresar (lo
--  que no existe lo sigue rechazando la FK, con su propio error). Es
--  `security definer` porque tiene que leer tablas que el rol que inserta
--  quiza no ve (la importacion la hace gerencia; el costo, nadie mas).
create or replace function privado.validar_operacion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Solo una importacion definitiva deja filas de operacion.
  if to_jsonb(new) ? 'importacion_id' and (to_jsonb(new) ->> 'importacion_id') is not null
     and not exists (select 1 from public.importaciones i
                     where i.id = (to_jsonb(new) ->> 'importacion_id')::uuid and i.modo = 'definitiva') then
    raise exception 'Solo una importacion definitiva deja filas en %', tg_table_name
      using errcode = 'check_violation';
  end if;

  if tg_table_name = 'resultados' then
    if not exists (select 1 from public.ejecucion_partidas p
                   where p.ejecucion_id = new.ejecucion_id and p.receta_id = new.receta_id) then
      raise exception 'La receta % no forma parte de la confirmacion %', new.receta_id, new.ejecucion_id
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'ejecucion_consumos' then
    if exists (select 1 from public.ejecuciones e join public.lotes l on l.id = new.lote_id
               where e.id = new.ejecucion_id and e.sede_id <> l.sede_id) then
      raise exception 'El lote % no es de la sede de la confirmacion %', new.lote_id, new.ejecucion_id
        using errcode = 'check_violation';
    end if;

  -- Anidado a proposito: plpgsql resuelve `new.ejecucion_id` al evaluar la
  -- condicion, y en las demas tablas ese campo no existe.
  elsif tg_table_name = 'movimientos' then
    if new.ejecucion_id is not null
       and exists (select 1 from public.ejecuciones e join public.lotes l on l.id = new.lote_id
                   where e.id = new.ejecucion_id and e.sede_id <> l.sede_id) then
      raise exception 'El lote % no es de la sede de la confirmacion %', new.lote_id, new.ejecucion_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

revoke all on function privado.validar_operacion() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['lotes', 'planes', 'ejecuciones', 'notas', 'eventos_operacion',
                           'equivalencias_lote', 'preparaciones', 'resultados', 'metas',
                           'ejecucion_consumos', 'movimientos']
  loop
    execute format('drop trigger if exists validar_operacion on %I', t);
    execute format('create trigger validar_operacion before insert or update on %I
                    for each row execute function privado.validar_operacion()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Permisos: lo que tiene dinero, solo para quien hoy puede verlo
-- ---------------------------------------------------------------------------

--  El presupuesto mensual es dinero; los demas umbrales (porcentajes y dias)
--  los necesita el panel de todos.
drop policy if exists metas_lectura on metas;
create policy metas_lectura on metas for select to authenticated
  using (privado.es_mi_sede(sede_id)
         and (clave <> 'presupuestoMensual' or privado.es_al_menos('gerencia'::rol)));

--  `datos` es JSON libre (un cambio de precio lleva el antes y el despues).
--  Cuando una pantalla de obrador necesite la bitacora, se publica una
--  proyeccion sin dinero; hasta entonces, gerencia.
drop policy if exists eventos_operacion_lectura on eventos_operacion;
create policy eventos_operacion_lectura on eventos_operacion for select to authenticated
  using (privado.es_mi_sede(sede_id) and privado.es_al_menos('gerencia'::rol));

--  El resultado guardado de una solicitud puede llevar costos calculados con el
--  rol que tenia quien la envio. Si ese rol baja, no puede seguir leyendolos:
--  la columna no se concede, y la funcion que reintenta la solicitud (F3-4)
--  la devuelve proyectada con el rol de AHORA.
revoke select on table solicitudes from authenticated;
grant select (clave, sede_id, perfil_id, operacion, huella, ejecucion_id, creada, completada)
  on table solicitudes to authenticated;

alter table importacion_identidades enable row level security;

drop policy if exists importacion_identidades_lectura on importacion_identidades;
create policy importacion_identidades_lectura on importacion_identidades for select to authenticated
  using (privado.es_mi_sede(sede_id) and privado.es_al_menos('gerencia'::rol));

revoke all on table importacion_identidades from anon, authenticated;
grant select on table importacion_identidades to authenticated;
