-- =============================================================================
--  0009 · LEER EXIGE UN PERFIL ACTIVO
-- =============================================================================
--
--  Siete lecturas de 0005 eran `using (true)`: cualquiera con un testigo de
--  Supabase valido las pasaba, tuviera perfil o no, y estuviera activo o no.
--
--  Mientras entrar era una clave del equipo daba igual. Desde que cada persona
--  entra con su codigo y su PIN, dar de baja a alguien es poner `activo = false`
--  en su perfil, y eso tiene que cortarle los datos EN EL MOMENTO. No lo hacia:
--  su testigo sigue valiendo hasta que vence, y con `using (true)` seguia
--  leyendo proveedores, conversiones y recetas desde fuera de la aplicacion.
--
--  `es_al_menos('operario')` es verdadero para todo perfil ACTIVO, de cualquier
--  rol, y falso sin perfil o con el perfil desactivado (ver `privado.mi_rol()`).
--  Va dentro de `(select ...)` para calcularse una vez por consulta.
--
--  `perfiles_lectura` NO cambia: la fila propia se sigue leyendo aunque este
--  inactiva, que es lo que permite a la pantalla de entrada decir "tu usuario
--  esta desactivado" en vez de un error sin explicacion.
--
--  Lo que esta migracion no puede hacer: invalidar el testigo. Eso es de Auth
--  (bloquear la cuenta y cerrar sus sesiones con la clave de servicio), y queda
--  para el alta y baja de usuarios desde el servidor.

drop policy if exists sedes_lectura on sedes;
create policy sedes_lectura on sedes
  for select to authenticated using ((select privado.es_al_menos('operario')));

drop policy if exists ingredientes_lectura on ingredientes;
create policy ingredientes_lectura on ingredientes
  for select to authenticated using ((select privado.es_al_menos('operario')));

drop policy if exists conversiones_lectura on conversiones;
create policy conversiones_lectura on conversiones
  for select to authenticated using ((select privado.es_al_menos('operario')));

drop policy if exists recetas_lectura on recetas;
create policy recetas_lectura on recetas
  for select to authenticated using ((select privado.es_al_menos('operario')));

drop policy if exists componentes_lectura on receta_componentes;
create policy componentes_lectura on receta_componentes
  for select to authenticated using ((select privado.es_al_menos('operario')));

drop policy if exists items_lectura on receta_items;
create policy items_lectura on receta_items
  for select to authenticated using ((select privado.es_al_menos('operario')));

drop policy if exists proveedores_lectura on proveedores;
create policy proveedores_lectura on proveedores
  for select to authenticated using ((select privado.es_al_menos('operario')));
