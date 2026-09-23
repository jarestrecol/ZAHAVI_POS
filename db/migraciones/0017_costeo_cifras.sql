-- =============================================================================
--  0017 · EL COSTEO ESCRIBE TODAS LAS CIFRAS, TAMBIEN EN SUPABASE
-- =============================================================================
--
--  0016 paso sus 14 casos en el PostgreSQL de las pruebas y fallo en el remoto:
--  Supabase abre cada sesion con `extra_float_digits = 0`, y un float8 se
--  escribe entonces con 15 cifras. El calculo era identico; lo que cambiaba era
--  como se convertia a JSON (3.883495145631068 salia como 3.88349514563107).
--
--  La funcion fija su propio ajuste y deja de depender de la sesion. Con 1 se
--  escribe el numero mas corto que vuelve al mismo doble, que es lo que hace
--  JavaScript. `probar-sql` corre ahora el contrato con el ajuste de Supabase.
--
--  Se puede aplicar dos veces sin efectos.

create or replace function privado.numero_json(x float8)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
set extra_float_digits = 1
as $$
  select case when privado.finito(x) then to_jsonb(x) else 'null'::jsonb end
$$;

revoke all on function privado.numero_json(float8) from public, anon, authenticated;
