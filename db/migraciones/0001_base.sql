-- =============================================================================
--  0001 · BASE: SEDES, PERFILES Y ROLES
-- =============================================================================
--
--  Todo lo que el resto del esquema necesita para poder decidir quien ve que.
--
--  POR QUE LOS ROLES SON UN TIPO ENUMERADO Y NO UNA TABLA
--  -----------------------------------------------------
--  Porque son CUATRO y estan ordenados. Un enum de Postgres se compara con `>=`
--  siguiendo el orden de declaracion, y eso permite escribir las politicas de
--  seguridad como "de jefe de obrador para arriba" en vez de enumerar roles en
--  cada una. Con una tabla de roles habria que hacer una union en cada politica,
--  que es mas codigo y mas sitios donde equivocarse.
--
--  El precio: anadir un rol en medio obliga a una migracion del tipo. Se asume
--  a proposito; los roles de una panaderia no cambian todos los meses.
--
--  PORTABILIDAD
--  ------------
--  Este archivo es el unico que toca el esquema `auth`, que es lo que aporta
--  Supabase (GoTrue). Se aisla aqui adrede: el dia que haya que mudarse, este es
--  el unico archivo que hay que revisar. Todo lo demas es PostgreSQL estandar y
--  corre en cualquier motor.
--
--  Para validar en local sin Supabase, ver `db/local/shim-auth.sql`.

create extension if not exists "pgcrypto";
-- `btree_gist` lo necesita la restriccion que impide solapar periodos de precio
-- (ver 0003). Es una extension estandar de PostgreSQL, no de Supabase.
create extension if not exists "btree_gist";

-- -----------------------------------------------------------------------------
--  ROLES
-- -----------------------------------------------------------------------------
--
--  EL ORDEN DE ESTA DECLARACION ES LA JERARQUIA. No se toca sin pensar.
--
--    operario  consulta recetas y registra produccion
--    obrador   ademas mueve inventario y da de alta lotes
--    gerencia  ademas ve costos, margenes e informes
--    admin     ademas administra usuarios y configuracion

do $$
begin
  if not exists (select 1 from pg_type where typname = 'rol') then
    create type rol as enum ('operario', 'obrador', 'gerencia', 'admin');
  end if;
end $$;

-- -----------------------------------------------------------------------------
--  SEDES
-- -----------------------------------------------------------------------------
--
--  El obrador y la casa de produccion. Existe como tabla y no como texto libre
--  porque las politicas de seguridad filtran por ella: cada sede ve su bodega.

create table if not exists sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
--  PERFILES
-- -----------------------------------------------------------------------------
--
--  La fila que convierte a un usuario autenticado en alguien con rol y sede.
--
--  `id` apunta a `auth.users` con borrado en cascada: si se elimina la cuenta,
--  desaparece el perfil. Lo que NO desaparece es lo que esa persona registro:
--  los movimientos y las producciones apuntan aqui con `on delete restrict`,
--  asi que el sistema se niega a borrar a alguien que dejo rastro. Es
--  deliberado: una auditoria que se puede vaciar borrando al autor no es una
--  auditoria.

create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  rol rol not null default 'operario',
  sede_id uuid references sedes (id) on delete set null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create index if not exists perfiles_sede_idx on perfiles (sede_id);

-- -----------------------------------------------------------------------------
--  QUIEN SOY: las funciones que usan TODAS las politicas
-- -----------------------------------------------------------------------------
--
--  Van `security definer` porque tienen que poder leer `perfiles` aunque la
--  politica de `perfiles` aun no haya dejado pasar a quien pregunta: si no,
--  seria una pescadilla que se muerde la cola.
--
--  `set search_path = public, pg_temp` NO es opcional en una funcion
--  `security definer`: sin el, quien llame puede anteponer un esquema propio y
--  hacer que la funcion ejecute SU tabla `perfiles` en vez de esta. Es la
--  escalada de privilegios clasica de PostgreSQL.

create or replace function mi_rol()
returns rol
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create or replace function mi_sede()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sede_id from perfiles where id = auth.uid() and activo
$$;

/*
 * "De este rol para arriba".
 *
 * Devuelve false cuando no hay sesion o el perfil esta inactivo, en vez de
 * fallar: una politica que lanza excepcion deja la pantalla en blanco, y una
 * que devuelve false simplemente no ensena la fila.
 */
create or replace function es_al_menos(minimo rol)
returns boolean
language sql
stable
as $$
  select coalesce(mi_rol() >= minimo, false)
$$;

/*
 * Si la fila pertenece a la sede de quien pregunta.
 *
 * Gerencia y administracion ven TODAS las sedes: su trabajo es comparar una con
 * otra. Operario y jefe de obrador ven la suya.
 */
create or replace function es_mi_sede(sede uuid)
returns boolean
language sql
stable
as $$
  select es_al_menos('gerencia') or (sede is not null and sede = mi_sede())
$$;

-- -----------------------------------------------------------------------------
--  ALTA AUTOMATICA DEL PERFIL
-- -----------------------------------------------------------------------------
--
--  Cuando GoTrue crea el usuario, aqui nace su perfil con el rol MAS BAJO. Subir
--  de rol es siempre un acto explicito de administracion; nadie se autoasigna
--  gerencia al registrarse.

create or replace function crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    'operario'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function crear_perfil_al_registrarse();
