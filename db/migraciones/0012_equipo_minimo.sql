-- =============================================================================
--  0012 · EL EQUIPO ASIGNABLE, SOLO CON LO NECESARIO
-- =============================================================================
--
--  Revision de seguridad de PROD-002 (2026-09-16): 0011 entregaba a todo jefe
--  de obrador el `codigo_usuario` y el `rol` de su sede. El codigo es la mitad
--  de la credencial -con el, solo falta adivinar un PIN de 6 digitos- y el rol
--  dice a quien conviene atacar primero. Para asignar una receta no hace falta
--  ninguno de los dos.
--
--  La vista pasa a entregar SOLO id, nombre y area, y solo de quien TIENE area:
--  gerencia y administracion sin area no se pueden asignar y no tienen por que
--  aparecer. El resto no cambia: perfil activo, jefe de obrador en adelante y su
--  sede (gerencia verificada ve todas, como en el resto del esquema).
--
--  Cambian las columnas, asi que la vista y la funcion se retiran y se crean de
--  nuevo. Nada mas depende de ellas.

drop view if exists equipo_produccion;
drop function if exists privado.equipo_produccion();

create or replace function privado.equipo_produccion()
returns table (
  id uuid,
  nombre text,
  area text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.nombre, p.area
  from public.perfiles p
  where p.activo and p.area is not null and privado.es_al_menos('obrador') and privado.es_mi_sede(p.sede_id)
$$;

revoke execute on function privado.equipo_produccion() from public, anon;
grant execute on function privado.equipo_produccion() to authenticated;

create or replace view equipo_produccion with (security_invoker = true) as
select * from privado.equipo_produccion();

revoke all on equipo_produccion from anon, authenticated;
grant select on equipo_produccion to authenticated;
