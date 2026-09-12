-- =============================================================================
--  0006 · ENDURECER PERMISOS: LO QUE 0005 CREIA CERRAR Y NO CERRABA
-- =============================================================================
--
--  Los tres arreglos de este archivo salieron de aplicar el esquema contra un
--  Supabase de verdad y preguntarle al catalogo quien puede que. Ninguno se veia
--  leyendo el SQL, y los tres sobrevivieron a `verificar-sql.mjs` y a
--  `probar-sql` porque las dos capas miraban otra cosa.
--
--  1. EL `revoke` DE FUNCIONES DE 0005 NO REVOCABA NADA
--  ---------------------------------------------------
--  0005 abre con:
--
--      revoke all on all functions in schema public from anon, authenticated;
--
--  y da por cerrado el acceso. No lo cierra. En PostgreSQL una funcion NACE con
--  `execute` concedido a `PUBLIC`, y `anon` y `authenticated` heredan de ahi.
--  Revocarles a ellos borra unas entradas de la lista que nunca existieron y
--  deja intacta la unica que concede de verdad.
--
--  Medido en el proyecto real: `anon` -sin sesion, sin token- podia ejecutar
--  `mi_rol()`, `mi_sede()`, `es_al_menos()`, `es_mi_sede()` y
--  `gasto_por_periodo()`.
--
--  NO HABIA FUGA, y conviene decirlo con la misma claridad: sin `auth.uid()`
--  esas funciones devuelven nulo y false, y las tablas si estaban bien cerradas
--  -el mismo `revoke` SI funciona sobre tablas, que no tienen concesion por
--  defecto a `PUBLIC`-. El defecto no era una puerta abierta: era que el archivo
--  afirmaba haber cerrado una puerta que ni siquiera habia tocado. El dia que
--  alguien anada una funcion `security definer` que haga trabajo de verdad,
--  nacera abierta a todo el mundo y esa linea de 0005 hara creer lo contrario.
--
--  Se revoca de `PUBLIC`, que es de quien cuelga, y se vuelve a conceder una por
--  una. Tambien a futuro, con `alter default privileges`, para que la proxima
--  funcion nazca cerrada y haya que abrirla a proposito.
--
--  Nota sobre `service_role`: al colgar de `PUBLIC`, tambien pierde el acceso a
--  estas funciones. Es lo correcto y no un efecto colateral: ese rol se salta la
--  seguridad por filas entera, la aplicacion no lo usa NUNCA, y si algun dia un
--  proceso de administracion lo necesita tendra que concedersele de forma
--  explicita y visible, que es el punto de partida en cero que declara 0005.
--
--  2. CUATRO FUNCIONES SIN `search_path` FIJO
--  ------------------------------------------
--  `verificar-sql.mjs` comprueba que toda funcion `security definer` fije su
--  `search_path`, y por eso dio verde: estas cuatro no son `security definer`.
--  La comprobacion era correcta y el criterio demasiado estrecho.
--
--  `es_al_menos()` y `es_mi_sede()` no son dos funciones cualesquiera: son las
--  que consultan TODAS las politicas y TODAS las vistas. Si alguna vez alguien
--  puede anteponer un esquema propio, no se salta una comprobacion: se las salta
--  todas a la vez. Y `movimientos_inmutables()` es la segunda cerradura del
--  libro de movimientos, que es lo que sostiene la auditoria.
--
--  Hoy no es explotable -PostgREST fija el `search_path` de cada peticion y
--  `authenticated` no puede crear objetos en `public`-, y aun asi se fija: son
--  cuatro lineas y lo que protegen es el suelo sobre el que se apoya el resto.
--
--  3. `btree_gist` VIVIA EN `public`
--  ---------------------------------
--  Y no es una cuestion de orden. La extension trae unas 170 funciones propias,
--  y al instalarse en `public` quedaron TODAS dentro del esquema que PostgREST
--  publica como API. Movida a `extensions`, salen de ahi de una vez.
--
--  El indice de `precios_sin_solape` ya esta construido y apunta a su clase de
--  operadores por identificador, no por nombre, asi que el cambio de esquema no
--  lo afecta. Comprobado ejecutando `probar-sql` despues.

-- -----------------------------------------------------------------------------
--  1. LA EXTENSION, FUERA DEL ESQUEMA PUBLICADO
-- -----------------------------------------------------------------------------
--
--  `create schema if not exists` es lo que mantiene este archivo portable: en
--  Supabase el esquema ya existe, y en un PostgreSQL recien instalado -el que
--  levanta `probar-sql`- hay que crearlo. Va primero para que el `revoke` de
--  abajo alcance solo a las funciones del proyecto.

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname = 'public'
  ) then
    execute 'alter extension btree_gist set schema extensions';
  end if;
end $$;

-- -----------------------------------------------------------------------------
--  2. LAS FUNCIONES, CERRADAS DE VERDAD
-- -----------------------------------------------------------------------------

revoke execute on all functions in schema public from public;
revoke execute on all routines in schema public from anon, authenticated;

-- Que la proxima funcion nazca cerrada, sin depender de que alguien se acuerde.
alter default privileges in schema public revoke execute on functions from public;

-- Y ahora se concede lo justo, que es exactamente la misma lista de 0005.
grant execute on function mi_rol() to authenticated;
grant execute on function mi_sede() to authenticated;
grant execute on function es_al_menos(rol) to authenticated;
grant execute on function es_mi_sede(uuid) to authenticated;
grant execute on function gasto_por_periodo(text, date, date, uuid) to authenticated;

-- `crear_perfil_al_registrarse()`, `registrar_auditoria()` y
-- `movimientos_inmutables()` NO se conceden a nadie: son disparadores. Los
-- ejecuta el motor al dispararse, no quien llama, asi que no necesitan permiso
-- y no hay razon para que figuren en la API.

-- -----------------------------------------------------------------------------
--  3. EL `search_path` DE LAS CUATRO QUE FALTABAN
-- -----------------------------------------------------------------------------

alter function es_al_menos(rol)                          set search_path = public, pg_temp;
alter function es_mi_sede(uuid)                          set search_path = public, pg_temp;
alter function movimientos_inmutables()                  set search_path = public, pg_temp;
alter function gasto_por_periodo(text, date, date, uuid) set search_path = public, pg_temp;
