-- =============================================================================
--  0011 · AREA DE PRODUCCION DE CADA TRABAJADOR
-- =============================================================================
--
--  Decision del negocio (2026-09-16): cada receta del dia se asigna a un
--  trabajador de su area (PASTELERÍA, PANADERÍA o GALLETAS), y esa persona ve
--  en su modulo solo lo que le toca sacar.
--
--  1. `perfiles.area`: el area de cada persona. Nula = sin area (gerencia,
--     administracion o alguien a quien aun no se le asigno). Solo la cambia un
--     administrador: lo exige `perfiles_cambio`, que ya pide `admin` con `aal2`.
--
--  2. `equipo_produccion`: quien asigna -jefe de obrador en adelante- necesita
--     la lista de trabajadores activos de su sede con su area. `perfiles` solo
--     deja leer la fila propia por debajo de gerencia, y abrirla entera al jefe
--     le entregaria tambien el estado de las cuentas. La vista entrega SOLO
--     id, nombre, codigo, rol y area, y la misma regla de siempre: la funcion
--     privada filtra por rol (`es_al_menos('obrador')`) y por sede.
--
--  Las asignaciones en si se guardan en el equipo, con el resto de la
--  produccion, hasta que la produccion se centralice.

alter table perfiles add column if not exists area text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'perfiles_area_valida'
      and conrelid = 'public.perfiles'::regclass
  ) then
    alter table perfiles add constraint perfiles_area_valida
      check (area is null or area in ('PASTELERÍA', 'PANADERÍA', 'GALLETAS'));
  end if;
end $$;

create or replace function privado.equipo_produccion()
returns table (
  id uuid,
  nombre text,
  codigo_usuario text,
  rol public.rol,
  area text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nombre, p.codigo_usuario, p.rol, p.area
  from public.perfiles p
  where p.activo
    and privado.es_al_menos('obrador')
    and privado.es_mi_sede(p.sede_id)
$$;

-- Nace cerrada por los privilegios por defecto de 0008; se abre solo a quien
-- tiene sesion, que es quien la lee a traves de la vista.
revoke execute on function privado.equipo_produccion() from public, anon;
grant execute on function privado.equipo_produccion() to authenticated;

create or replace view equipo_produccion with (security_invoker = true) as
select * from privado.equipo_produccion();

-- Supabase concede por defecto todo sobre una vista nueva. Solo lectura.
revoke all on equipo_produccion from anon, authenticated;
grant select on equipo_produccion to authenticated;
