-- =============================================================================
--  EMULACION MINIMA DE SUPABASE, SOLO PARA VALIDAR EN LOCAL
-- =============================================================================
--
--  NO ES UNA MIGRACION Y NO SE APLICA NUNCA EN LA NUBE.
--
--  Las migraciones de `db/migraciones/` usan tres cosas que aporta Supabase y
--  que un PostgreSQL recien instalado no tiene:
--
--      auth.users            la tabla de cuentas, que gestiona GoTrue
--      auth.uid()            quien esta preguntando, sacado del token firmado
--      anon / authenticated  los dos roles con los que entra la API
--
--  Este archivo las crea con la forma justa para que el esquema se pueda aplicar
--  contra un Postgres desechable y comprobar que todo compila: tipos, claves
--  foraneas, restricciones, vistas, funciones y politicas.
--
--  QUE SE VALIDA ASI Y QUE NO
--  --------------------------
--  SI: que el SQL es correcto y que el esquema se levanta entero de cero.
--  NO: el comportamiento real de la autenticacion. Para eso hace falta GoTrue.
--
--  Que este archivo exista tiene ademas un segundo valor: demuestra que la
--  dependencia de Supabase cabe en sesenta lineas. Es la medida exacta de lo que
--  habria que sustituir para mudarse a otro Postgres, y por eso conviene que no
--  crezca.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

/*
 * Quien pregunta.
 *
 * En Supabase sale del token JWT que valida el servidor. Aqui se lee de una
 * variable de sesion que pone la propia prueba, que es lo que permite
 * comprobar las politicas poniendose en la piel de cada rol:
 *
 *     set local request.jwt.claim.sub = '<uuid del usuario>';
 */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Los dos roles con los que la API se conecta a la base de datos. `nologin`
-- porque nadie se conecta como ellos directamente: la API cambia a ellos.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

grant usage on schema auth to anon, authenticated;
