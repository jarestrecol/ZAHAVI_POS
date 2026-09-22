-- =============================================================================
--  0007 · ACCESO INTERNO: CODIGO DE USUARIO Y PIN
-- =============================================================================
--
-- La identidad visible del POS no depende de un correo corporativo:
--
--   nombre visible + codigo_usuario + PIN
--
-- El PIN es la contrasena de Supabase Auth. Nunca se guarda en `perfiles`, ni
-- se consulta desde PostgreSQL, ni llega a otra persona que no sea quien lo
-- acaba de definir. Auth lo almacena y verifica con su propio mecanismo.
--
-- Supabase mantiene un correo tecnico interno para poder emitir la sesion. La
-- aplicacion no lo ensena, no envia mensajes y tampoco permite el registro
-- publico: el servidor crea las cuentas por orden de un administrador.

alter table perfiles add column if not exists codigo_usuario text;

-- Los perfiles anteriores a esta migracion pueden no tener codigo hasta que
-- un administrador los complete. Toda cuenta creada desde la nueva interfaz
-- lo recibe en `user_metadata`, y el indice impide que dos personas compartan
-- una credencial visible.
create unique index if not exists perfiles_codigo_usuario_unico
  on perfiles (codigo_usuario)
  where codigo_usuario is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'perfiles_codigo_usuario_formato'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table perfiles add constraint perfiles_codigo_usuario_formato
      check (
        codigo_usuario is null
        or codigo_usuario ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'
      );
  end if;
end $$;

-- Reemplaza el disparador de 0001 sin tocar los roles: toda cuenta nueva nace
-- como operario. El alta que no incluya codigo sigue siendo posible solo para
-- recuperar cuentas ya existentes desde el panel; la interfaz no la ofrece.
create or replace function crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into perfiles (id, nombre, codigo_usuario, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    nullif(upper(btrim(new.raw_user_meta_data ->> 'codigo_usuario')), ''),
    'operario'
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Es una funcion de disparador: nadie debe poder invocarla por HTTP/RPC.
revoke all on function crear_perfil_al_registrarse() from public, anon, authenticated;
