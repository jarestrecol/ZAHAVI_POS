-- =============================================================================
--  0013 · LA AUDITORIA NO SE PUEDE VACIAR DESDE LA API
-- =============================================================================
--
--  QUE PASABA
--  ----------
--  `authenticated` tenia TRUNCATE, DELETE, INSERT, UPDATE, REFERENCES y TRIGGER
--  sobre `auditoria`. No lo concedio ninguna migracion nuestra: 0005 solo hizo
--  `grant select on auditoria to authenticated`. Viene de los privilegios por
--  defecto del proyecto, que conceden todo sobre las tablas nuevas de `public`.
--
--  La seguridad por filas no salva aqui: **TRUNCATE no pasa por RLS**. Con una
--  sesion valida -cualquier rol, incluido un operario- se podia vaciar de un
--  golpe el libro que sostiene la trazabilidad. El DELETE fila a fila si estaba
--  bloqueado, porque `auditoria` solo tiene politica de lectura.
--
--  QUE SE HACE
--  -----------
--  1. Se retiran todos los permisos de escritura sobre `auditoria`; se conserva
--     el `select`, que la politica de 0005 ya limita a gerencia en adelante.
--     Quien escribe la auditoria es `registrar_auditoria()`, que es `security
--     definer` y no necesita permisos del rol que llama.
--  2. Se retira TRUNCATE de TODAS las tablas de `public` para `anon` y
--     `authenticated`. Ninguna pantalla vacia una tabla entera; y el dia que una
--     tabla nueva herede los privilegios por defecto, esto ya no deja la puerta
--     abierta. Las escrituras normales siguen igual: TRUNCATE es lo unico que se
--     quita, y es el unico permiso que RLS no puede filtrar.
--
--  Se puede repetir sin efectos. No borra ni modifica ninguna fila.

-- 1. La auditoria solo se lee desde la API.
revoke insert, update, delete, truncate, references, trigger on table public.auditoria
  from anon, authenticated;
grant select on table public.auditoria to authenticated;

-- 2. Nadie vacia tablas desde la API.
revoke truncate on all tables in schema public from anon, authenticated;

-- 3. Y tampoco las tablas que se creen despues.
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
