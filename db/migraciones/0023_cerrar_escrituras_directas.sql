-- =============================================================================
--  0023 · LA OPERACION SOLO SE ESCRIBE POR LA API (F3-5)
-- =============================================================================
--
--  Desde 0018 existe una puerta para cada escritura de la operacion. Mientras
--  quedaran abiertas las de 0005, cualquiera con sesion podia saltarsela:
--
--    * `lotes`: alta y UPDATE de la fila entera, `existencia` incluida. Un
--      update directo descuadraba el saldo frente a su libro.
--    * `movimientos`: anotar en el libro sin mover el saldo.
--    * `proveedores`: altas sueltas (la API los crea al registrar el lote).
--    * `producciones` y `produccion_consumos`: el modelo de 0003, sin filas y
--      reemplazado por `ejecuciones` (0014). Nadie debe escribir ahi.
--
--  Se cierran todas. El catalogo (recetas, ingredientes, precios,
--  conversiones) sigue como esta hasta F3-10, que lo pasa a edicion
--  versionada; perfiles y sedes son administracion (0010).
--
--  Y dos garantias que ya no dependen de que el codigo este bien:
--
--    1. EL SALDO ES LA SUMA DEL LIBRO, comprobado por la base al confirmar
--       cada transaccion (restriccion diferida): lo que sea que la escriba,
--       si al terminar `lotes.existencia` no es la suma de sus `movimientos`,
--       la transaccion entera se deshace.
--    2. Todo lote nuevo tiene autor autenticado, salvo lo historico importado
--       (lo que 0015 dejo pendiente para cuando se cerrara el alta directa).
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 1. Sin escritura directa
-- ---------------------------------------------------------------------------

drop policy if exists lotes_alta on lotes;
drop policy if exists lotes_correccion on lotes;
drop policy if exists movimientos_anotar on movimientos;
drop policy if exists proveedores_alta on proveedores;
drop policy if exists proveedores_cambio on proveedores;
drop policy if exists proveedores_baja on proveedores;
drop policy if exists producciones_alta on producciones;
drop policy if exists producciones_avance on producciones;
drop policy if exists producciones_baja on producciones;
drop policy if exists consumos_registro on produccion_consumos;

revoke insert, update, delete, truncate on table lotes, movimientos, proveedores, producciones, produccion_consumos
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Autoria de los lotes
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lotes_autoria') then
    alter table lotes add constraint lotes_autoria check (historico or creado_por is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. El saldo es la suma del libro
-- ---------------------------------------------------------------------------
--  Restriccion DIFERIDA: dentro de la transaccion el lote y su libro se
--  escriben en dos sentencias (0019 da de alta el lote y luego su entrada); lo
--  que importa es como quedan al final.

create or replace function privado.saldo_igual_al_libro()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lote uuid := coalesce((to_jsonb(new) ->> 'lote_id')::uuid, (to_jsonb(new) ->> 'id')::uuid);
  v_saldo numeric;
  v_libro numeric;
begin
  select existencia into v_saldo from public.lotes where id = v_lote;
  select coalesce(sum(cantidad), 0) into v_libro from public.movimientos where lote_id = v_lote;
  if v_saldo is distinct from v_libro then
    raise exception 'El saldo del lote % (%) no es la suma de su libro (%)', v_lote, v_saldo, v_libro
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

revoke all on function privado.saldo_igual_al_libro() from public, anon, authenticated;

drop trigger if exists saldo_igual_al_libro on lotes;
create constraint trigger saldo_igual_al_libro
  after insert or update of existencia on lotes
  deferrable initially deferred
  for each row execute function privado.saldo_igual_al_libro();

drop trigger if exists saldo_igual_al_libro on movimientos;
create constraint trigger saldo_igual_al_libro
  after insert on movimientos
  deferrable initially deferred
  for each row execute function privado.saldo_igual_al_libro();
