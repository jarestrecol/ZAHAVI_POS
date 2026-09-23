-- =============================================================================
--  AUDITORIA DE LECTURA DEL PROYECTO REMOTO (F0-REMOTO)
-- =============================================================================
--
--  Solo lectura: ninguna de estas consultas escribe, siembra ni altera nada. Se
--  ejecutan contra el proyecto `Zahavi_Pos` para contrastar el esquema remoto con
--  el modelo local antes de migrar la operacion (plan, fase 0).
--
--  Cada bloque responde una pregunta del plan: que hay, quien puede tocarlo, con
--  que se cruza lo local y cuanto dato existe. Repetible: se puede volver a correr
--  despues de cada migracion para ver que cambio.

-- 1. Migraciones aplicadas -----------------------------------------------------
select version, name from supabase_migrations.schema_migrations order by version;

-- 2. Tablas: RLS, politicas, indices y permisos directos de los roles de la API --
select c.relname as tabla,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politicas,
       (select count(*) from pg_index i where i.indrelid = c.oid) as indices,
       coalesce((select string_agg(grantee || ':' || privilege_type, ' ' order by grantee, privilege_type)
                 from information_schema.role_table_grants g
                 where g.table_schema = 'public' and g.table_name = c.relname
                   and g.grantee in ('anon', 'authenticated')), 'ninguno') as permisos
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 3. TRUNCATE y DELETE: RLS NO filtra TRUNCATE, asi que el privilegio manda -----
select t.tabla,
       has_table_privilege('authenticated', t.tabla, 'TRUNCATE') as truncate_authenticated,
       has_table_privilege('authenticated', t.tabla, 'DELETE') as delete_authenticated,
       has_table_privilege('anon', t.tabla, 'SELECT') as select_anon
from (select 'public.' || c.relname as tabla
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r') as t
order by 2 desc, 3 desc, 1;

-- 4. Politicas por tabla, con su regla ------------------------------------------
select tablename, cmd, roles::text, coalesce(qual, '') as usando, coalesce(with_check, '') as revisa
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- 5. Funciones de public y privado: definer/invoker y quien las ejecuta ----------
select n.nspname || '.' || p.proname as funcion,
       case when p.prosecdef then 'definer' else 'invoker' end as seguridad,
       has_function_privilege('anon', p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'privado') order by 1;

-- 6. Vistas: security_invoker y quien las lee -----------------------------------
select c.relname as vista,
       (select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker') as invoker,
       has_table_privilege('authenticated', 'public.' || c.relname, 'SELECT') as authenticated,
       has_table_privilege('anon', 'public.' || c.relname, 'SELECT') as anon
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v' order by 1;

-- 7. Cuanto dato hay (sin exponer filas) -----------------------------------------
select 'ingredientes' as tabla, count(*) from ingredientes
union all select 'recetas', count(*) from recetas
union all select 'receta_componentes', count(*) from receta_componentes
union all select 'receta_items', count(*) from receta_items
union all select 'lotes', count(*) from lotes
union all select 'movimientos', count(*) from movimientos
union all select 'producciones', count(*) from producciones
union all select 'produccion_consumos', count(*) from produccion_consumos
union all select 'precios', count(*) from precios
union all select 'proveedores', count(*) from proveedores
union all select 'conversiones', count(*) from conversiones
union all select 'auditoria', count(*) from auditoria
union all select 'perfiles', count(*) from perfiles
union all select 'sedes', count(*) from sedes
order by 1;

-- 8. Llaves con las que se cruza lo local ---------------------------------------
--    Receta: `codigo` remoto == id local (R001...). Ingrediente: `nombre` unico.
select (select count(*) from recetas where codigo ~ '^R[0-9]{3}$') as recetas_con_codigo_local,
       (select count(*) from recetas) as recetas,
       (select count(*) from recetas where rendimiento_cantidad is not null) as recetas_con_rendimiento,
       (select count(distinct nombre) from ingredientes) as ingredientes_distintos,
       (select count(*) from ingredientes) as ingredientes;

-- 9. Columnas de las tablas de operacion, para comparar con el modelo local ------
select table_name, string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as columnas
from information_schema.columns
where table_schema = 'public'
  and table_name in ('lotes', 'movimientos', 'producciones', 'produccion_consumos', 'precios', 'auditoria')
group by table_name order by table_name;
