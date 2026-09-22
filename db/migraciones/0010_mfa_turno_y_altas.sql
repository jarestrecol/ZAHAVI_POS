-- =============================================================================
--  0010 · VERIFICACION EN DOS PASOS, TURNO DE 6 HORAS Y ALTAS POR ADMINISTRADOR
-- =============================================================================
--
--  Tres decisiones del negocio (2026-09-15), exigidas AQUI y no solo en la
--  pantalla. La pantalla se puede saltar con la clave publicable y un `curl`;
--  la seguridad por filas no.
--
--  1. GERENCIA Y ADMINISTRACION EXIGEN VERIFICACION EN DOS PASOS
--  -----------------------------------------------------------
--  Supabase marca en el testigo como se identifico la sesion: `aal1` con el PIN,
--  `aal2` cuando ademas se verifico un codigo de la aplicacion autenticadora.
--  `es_al_menos()` concede gerencia o administracion SOLO con `aal2`. Un PIN
--  robado a un administrador da, como mucho, lo que da el de un operario.
--
--  Se exige por el nivel que se PIDE y no por el rol que se tiene: una persona
--  de gerencia que aun no verifico sigue pudiendo leer recetas, y lo que no
--  puede es ver costos, informes ni tocar usuarios.
--
--  2. LA SESION DURA COMO MUCHO 6 HORAS
--  -----------------------------------
--  `privado.sesion_vigente()` busca la sesion del testigo (`session_id`) en
--  `auth.sessions` y exige que se abriera hace menos de 6 horas. `mi_rol()` y
--  `mi_sede()` devuelven nulo fuera de ese plazo, y con ellas se cae toda
--  autorizacion: roles, sedes y lecturas. Renovar el testigo no alarga el turno,
--  porque la sesion conserva su hora de creacion.
--
--  El plan gratuito de Supabase no limita la duracion de las sesiones en Auth,
--  asi que el testigo se sigue pudiendo renovar: lo que deja de entregar es la
--  base de datos. La aplicacion ademas cierra la sesion a las 6 horas.
--
--  3. UN USUARIO NUEVO NACE DESACTIVADO
--  -----------------------------------
--  Hasta ahora el disparador creaba el perfil activo, de operario. Ahora nace
--  `activo = false`, y solo un administrador -con verificacion en dos pasos,
--  por el punto 1- puede activarlo (`perfiles_cambio`). Las cuentas anonimas de
--  Auth no reciben perfil. El registro publico ya esta desactivado en el panel;
--  esto cubre el dia que alguien lo reactive por error o cree una cuenta de
--  prueba desde el panel.
--
--  LA EXCEPCION QUE SE MANTIENE: `perfiles_lectura` deja leer la fila propia
--  sin mirar nada de esto (`id = auth.uid()`). Es lo que permite a la pantalla de
--  entrada decir "tu usuario esta desactivado" o saber que el rol exige
--  verificacion ANTES de completarla.

-- -----------------------------------------------------------------------------
--  1. LA SESION DEL TESTIGO, CON SU PLAZO
-- -----------------------------------------------------------------------------

create or replace function privado.sesion_vigente()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
      and s.created_at > now() - interval '6 hours'
  )
$$;

-- -----------------------------------------------------------------------------
--  2. QUIEN SOY, SOLO DENTRO DEL TURNO
-- -----------------------------------------------------------------------------

create or replace function privado.mi_rol()
returns rol
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from public.perfiles
  where id = auth.uid() and activo and privado.sesion_vigente()
$$;

create or replace function privado.mi_sede()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sede_id from public.perfiles
  where id = auth.uid() and activo and privado.sesion_vigente()
$$;

-- -----------------------------------------------------------------------------
--  3. GERENCIA Y ADMINISTRACION, SOLO CON VERIFICACION EN DOS PASOS
-- -----------------------------------------------------------------------------

create or replace function privado.es_al_menos(minimo rol)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(privado.mi_rol() >= minimo, false)
     and (minimo < 'gerencia' or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2')
$$;

-- `es_mi_sede()` no cambia: ver todas las sedes pasa por `es_al_menos('gerencia')`,
-- que ya exige `aal2`, y la sede propia por `mi_sede()`, que ya exige el turno.

-- -----------------------------------------------------------------------------
--  4. LAS ALTAS NACEN DESACTIVADAS
-- -----------------------------------------------------------------------------

create or replace function crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Una cuenta anonima de Auth no es una persona del equipo.
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into perfiles (id, nombre, codigo_usuario, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    nullif(upper(btrim(new.raw_user_meta_data ->> 'codigo_usuario')), ''),
    'operario',
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Y a futuro, tambien si alguien inserta un perfil a mano sin decirlo.
alter table perfiles alter column activo set default false;

-- -----------------------------------------------------------------------------
--  5. PERMISOS
-- -----------------------------------------------------------------------------
--
--  `sesion_vigente()` la llaman `mi_rol()` y `mi_sede()`, que son `security
--  definer`, asi que se ejecuta con los permisos de su dueño: nadie mas necesita
--  poder llamarla. `create or replace` conserva los permisos de las demas.

revoke execute on function privado.sesion_vigente() from public, anon, authenticated;
revoke all on function crear_perfil_al_registrarse() from public, anon, authenticated;
