-- =============================================================================
--  0005 · SEGURIDAD: PERMISOS, POLITICAS POR ROL Y AUDITORIA
-- =============================================================================
--
--  COMO SE REPARTE EL TRABAJO ENTRE LAS DOS CAPAS
--  ----------------------------------------------
--      LECTURA    la gobiernan las vistas de 0004, que filtran por sede y por
--                 rol y enmascaran el dinero.
--      ESCRITURA  la gobierna la seguridad por filas de aqui abajo.
--
--  Y por debajo de las dos, los PERMISOS: las COLUMNAS con dinero no se conceden
--  a nadie, asi que no existe la posibilidad de consultarlas saltandose las
--  vistas. Es la diferencia entre "la pantalla no lo ensena" y "la base de datos
--  no lo entrega".
--
--  Se concede POR COLUMNAS y no revocando la tabla entera, y esa correccion la
--  obligo una prueba, no una relectura: una fila de lote mezcla dos naturalezas
--  -lo que hay que saber para trabajar y lo que costo-, y revocarla entera
--  rompia la politica de `movimientos`, que necesita leer la sede del lote.
--  Esta contado donde se concede, en el apartado 4.
--
--  EL PUNTO DE PARTIDA ES CERO
--  ---------------------------
--  Se revoca todo y se concede lo justo, uno por uno. Al reves -conceder todo y
--  quitar lo sensible- el descuido se paga con una fuga, porque lo que se olvida
--  queda abierto. Asi, lo que se olvida queda cerrado y se nota enseguida.

-- -----------------------------------------------------------------------------
--  1. TODO CERRADO
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- `anon` es quien todavia no ha iniciado sesion. Aqui no ve absolutamente nada:
-- a diferencia del recetario en archivo, que era publico para quien tuviera el
-- enlace, esto exige sesion para leer una sola fila.
alter default privileges in schema public revoke all on tables from anon;

-- -----------------------------------------------------------------------------
--  2. SEGURIDAD POR FILAS EN TODAS LAS TABLAS
-- -----------------------------------------------------------------------------
--
--  Sin excepciones. Una tabla sin `enable row level security` queda gobernada
--  solo por los permisos, y basta una concesion de mas para abrirla entera.
--  `scripts/verificar-sql.mjs` falla si alguna se queda fuera de esta lista.

alter table sedes enable row level security;
alter table perfiles enable row level security;
alter table ingredientes enable row level security;
alter table conversiones enable row level security;
alter table recetas enable row level security;
alter table receta_componentes enable row level security;
alter table receta_items enable row level security;
alter table proveedores enable row level security;
alter table lotes enable row level security;
alter table movimientos enable row level security;
alter table producciones enable row level security;
alter table produccion_consumos enable row level security;
alter table precios enable row level security;

-- -----------------------------------------------------------------------------
--  3. POLITICAS
-- -----------------------------------------------------------------------------

-- ---- Sedes y perfiles -------------------------------------------------------

drop policy if exists sedes_lectura on sedes;
create policy sedes_lectura on sedes
  for select to authenticated using (true);

drop policy if exists sedes_escritura on sedes;
create policy sedes_escritura on sedes
  for all to authenticated
  using (es_al_menos('admin')) with check (es_al_menos('admin'));

/*
 * Cada quien ve su perfil; gerencia ve el equipo entero.
 *
 * NADIE puede cambiar su propio rol, ni siquiera a uno inferior. Subir y bajar
 * de rol es un acto de administracion: si cada persona pudiera tocarlo, el rol
 * dejaria de ser una autorizacion y pasaria a ser una preferencia.
 */
drop policy if exists perfiles_lectura on perfiles;
create policy perfiles_lectura on perfiles
  for select to authenticated
  using (id = auth.uid() or es_al_menos('gerencia'));

drop policy if exists perfiles_admin on perfiles;
create policy perfiles_admin on perfiles
  for all to authenticated
  using (es_al_menos('admin')) with check (es_al_menos('admin'));

-- ---- Catalogo y recetas -----------------------------------------------------
--
-- Se leen sin restriccion de sede: una formula es la misma en las dos casas, y
-- que el obrador no vea una receta de la casa de produccion no protegeria nada y
-- si estorbaria a diario.

drop policy if exists ingredientes_lectura on ingredientes;
create policy ingredientes_lectura on ingredientes
  for select to authenticated using (true);

drop policy if exists ingredientes_escritura on ingredientes;
create policy ingredientes_escritura on ingredientes
  for all to authenticated
  using (es_al_menos('obrador')) with check (es_al_menos('obrador'));

/*
 * Una conversion la PROPONE el obrador y la APRUEBA gerencia.
 *
 * No es burocracia: decidir que `AGUA` en ML y en GR son lo mismo -lo son- o que
 * `MANTEQUILLA 1050 UND` esta mal escrito -lo esta- cambia el costo de todas las
 * recetas que lleven ese ingrediente. Es una decision de negocio con
 * consecuencias en dinero, y `CLAUDE.md` ya documentaba que solo quien conoce la
 * formula puede tomarla.
 */
drop policy if exists conversiones_lectura on conversiones;
create policy conversiones_lectura on conversiones
  for select to authenticated using (true);

drop policy if exists conversiones_propuesta on conversiones;
create policy conversiones_propuesta on conversiones
  for insert to authenticated
  with check (es_al_menos('obrador') and aprobado_en is null);

drop policy if exists conversiones_aprobacion on conversiones;
create policy conversiones_aprobacion on conversiones
  for update to authenticated
  using (es_al_menos('gerencia')) with check (es_al_menos('gerencia'));

drop policy if exists recetas_lectura on recetas;
create policy recetas_lectura on recetas
  for select to authenticated using (true);

drop policy if exists recetas_escritura on recetas;
create policy recetas_escritura on recetas
  for all to authenticated
  using (es_al_menos('obrador')) with check (es_al_menos('obrador'));

drop policy if exists componentes_lectura on receta_componentes;
create policy componentes_lectura on receta_componentes
  for select to authenticated using (true);

drop policy if exists componentes_escritura on receta_componentes;
create policy componentes_escritura on receta_componentes
  for all to authenticated
  using (es_al_menos('obrador')) with check (es_al_menos('obrador'));

drop policy if exists items_lectura on receta_items;
create policy items_lectura on receta_items
  for select to authenticated using (true);

drop policy if exists items_escritura on receta_items;
create policy items_escritura on receta_items
  for all to authenticated
  using (es_al_menos('obrador')) with check (es_al_menos('obrador'));

drop policy if exists proveedores_lectura on proveedores;
create policy proveedores_lectura on proveedores
  for select to authenticated using (true);

drop policy if exists proveedores_escritura on proveedores;
create policy proveedores_escritura on proveedores
  for all to authenticated
  using (es_al_menos('obrador')) with check (es_al_menos('obrador'));

-- ---- Almacen ----------------------------------------------------------------
--
-- El costo y el valor unitario se consultan por `existencia_lotes`, que los
-- enmascara segun el rol (ver el apartado 4). Estas politicas gobiernan quien
-- puede leer una fila de su sede y quien puede dar de alta y corregir una
-- compra.

/*
 * La lectura de `lotes` SI se concede, pero solo de las columnas sin dinero
 * (ver el apartado 4). El costo no se puede consultar ni aunque se pida
 * directamente: lo impide el permiso por columna, no un filtro de la aplicacion.
 *
 * Hace falta que la fila sea legible para que funcionen dos cosas que si no
 * quedan rotas: esta misma politica cuando comprueba la sede de un movimiento, y
 * el `update` de una correccion, que necesita localizar la fila antes de
 * cambiarla.
 */
drop policy if exists lotes_lectura on lotes;
create policy lotes_lectura on lotes
  for select to authenticated using (es_mi_sede(sede_id));

drop policy if exists lotes_alta on lotes;
create policy lotes_alta on lotes
  for insert to authenticated
  with check (es_al_menos('obrador') and es_mi_sede(sede_id));

drop policy if exists lotes_correccion on lotes;
create policy lotes_correccion on lotes
  for update to authenticated
  using (es_al_menos('obrador') and es_mi_sede(sede_id))
  with check (es_al_menos('obrador') and es_mi_sede(sede_id));

/*
 * Un lote NO se borra: se ajusta a cero.
 *
 * Borrarlo se llevaria por delante su historial de movimientos, que es
 * justamente lo que hace auditable la bodega. Por eso no existe politica de
 * `delete`, y la clave foranea de `movimientos` lo impide ademas por su cuenta.
 */

/*
 * El libro de movimientos: solo se anade.
 *
 * No hay politica de `update` ni de `delete`, y ademas el disparador de 0003 las
 * rechaza aunque alguien llegue con permisos de dueno. Dos cerraduras distintas
 * para la misma puerta, porque esta es la que sostiene la auditoria entera.
 *
 * Registrar produccion es tarea de OPERARIO: es quien esta delante de la
 * bascula. Lo que exige jefe de obrador es el ajuste de inventario, que es
 * corregir un descuadre y no anotar un consumo.
 */
drop policy if exists movimientos_anotar on movimientos;
create policy movimientos_anotar on movimientos
  for insert to authenticated
  with check (
    exists (
      select 1 from lotes l
      where l.id = lote_id and es_mi_sede(l.sede_id)
    )
    and (
      (tipo in ('salida', 'devolucion') and es_al_menos('operario'))
      or (tipo in ('entrada', 'merma') and es_al_menos('obrador'))
      or (tipo = 'ajuste' and es_al_menos('obrador'))
    )
  );

-- ---- Produccion -------------------------------------------------------------

drop policy if exists producciones_lectura on producciones;
create policy producciones_lectura on producciones
  for select to authenticated using (es_mi_sede(sede_id));

drop policy if exists producciones_alta on producciones;
create policy producciones_alta on producciones
  for insert to authenticated
  with check (es_al_menos('operario') and es_mi_sede(sede_id));

drop policy if exists producciones_avance on producciones;
create policy producciones_avance on producciones
  for update to authenticated
  using (es_al_menos('operario') and es_mi_sede(sede_id))
  with check (es_al_menos('operario') and es_mi_sede(sede_id));

-- Cancelar una produccion ya terminada mueve el gasto del periodo: es de jefe de
-- obrador para arriba.
drop policy if exists producciones_baja on producciones;
create policy producciones_baja on producciones
  for delete to authenticated
  using (es_al_menos('obrador') and es_mi_sede(sede_id) and estado <> 'terminada');

drop policy if exists consumos_registro on produccion_consumos;
create policy consumos_registro on produccion_consumos
  for insert to authenticated
  with check (
    exists (
      select 1 from producciones p
      where p.id = produccion_id
        and es_mi_sede(p.sede_id)
        and es_al_menos('operario')
    )
  );

-- ---- Precios ----------------------------------------------------------------
--
-- Ni lectura ni escritura fuera de gerencia. Es el dato mas sensible del
-- sistema: con el se calcula el margen.

drop policy if exists precios_gerencia on precios;
create policy precios_gerencia on precios
  for all to authenticated
  using (es_al_menos('gerencia')) with check (es_al_menos('gerencia'));

-- -----------------------------------------------------------------------------
--  4. PERMISOS: QUE SE PUEDE TOCAR Y COMO
-- -----------------------------------------------------------------------------
--
--  OJO AL ESCRIBIR DESDE LA APLICACION: las columnas con dinero no conceden
--  lectura, asi que al dar de alta un lote o anotar un movimiento hay que pedir
--  `Prefer: return=minimal` en la cabecera. Sin eso, la API intentara devolver la
--  fila recien escrita, no podra leerla, y responderá con un error que parece de
--  permisos cuando en realidad la escritura si ocurrio.

grant usage on schema public to authenticated;

-- Tablas sin dinero: se leen directamente, gobernadas por sus politicas.
grant select on sedes, perfiles, ingredientes, conversiones, proveedores,
  recetas, receta_componentes, receta_items, producciones to authenticated;

/*
 * `lotes` SE CONCEDE POR COLUMNAS, y esto es lo mas importante del archivo.
 *
 * Una fila de lote tiene dos naturalezas mezcladas: lo que hay que saber para
 * trabajar -que ingrediente, cuanto trae, cuando vence- y lo que costo. Revocar
 * la tabla entera protegia el dinero pero rompia dos cosas necesarias: la
 * politica de `movimientos`, que consulta la sede del lote, y cualquier
 * correccion, que necesita localizar la fila antes de cambiarla. Se descubrio
 * ejecutando `db/local/pruebas.sql`, no leyendo el codigo.
 *
 * Con permiso por columna, `costo_compra` y `valor_unitario` no salen de la base
 * de datos para nadie que no pase por una vista. No es que la aplicacion no los
 * pida: es que PostgreSQL se niega a entregarlos.
 *
 * Al anadir una columna con dinero a esta tabla hay que acordarse de NO ponerla
 * en esta lista. `scripts/verificar-sql.mjs` lo comprueba.
 */
grant select (
  id, codigo, ingrediente_id, sede_id, proveedor_id, presentacion,
  peso_compra, unidad, lote_proveedor, vencimiento, recibido_en, creado_por
) on lotes to authenticated;

-- `precios` se concede entera porque la fila ENTERA es sensible: su politica ya
-- la restringe a gerencia, asi que a los demas les devuelve cero filas. Cuando
-- lo sensible es toda la fila, la seguridad por filas basta; los permisos por
-- columna hacen falta solo cuando dentro de una misma fila hay de lo uno y de
-- lo otro, como en `lotes`.
grant select on precios to authenticated;

-- Escritura, siempre bajo la seguridad por filas de arriba.
grant insert, update on ingredientes, conversiones, proveedores,
  recetas, receta_componentes, receta_items to authenticated;
grant delete on receta_componentes, receta_items to authenticated;
grant insert, update on lotes to authenticated;
grant insert on movimientos to authenticated;
grant insert, update, delete on producciones to authenticated;
grant insert on produccion_consumos to authenticated;
grant insert, update on precios to authenticated;
grant update on perfiles to authenticated;
grant insert, update, delete on sedes to authenticated;

-- Las secuencias de las tablas con identidad, o el `insert` falla.
grant usage, select on all sequences in schema public to authenticated;

-- LA LECTURA DE VERDAD: las vistas.
grant select on
  existencia_lotes,
  existencia_ingredientes,
  produccion_costos,
  gasto_diario,
  precio_vigente,
  receta_costo_actual,
  movimientos_historico
to authenticated;

grant execute on function mi_rol() to authenticated;
grant execute on function mi_sede() to authenticated;
grant execute on function es_al_menos(rol) to authenticated;
grant execute on function es_mi_sede(uuid) to authenticated;
grant execute on function gasto_por_periodo(text, date, date, uuid) to authenticated;

-- -----------------------------------------------------------------------------
--  5. AUDITORIA
-- -----------------------------------------------------------------------------
--
--  Lo que `CLAUDE.md` declaraba que el sistema NO hacia: "no registra quien hizo
--  cada cambio de forma verificable, el autor de cada commit lo declara el
--  navegador y el servidor no lo comprueba".
--
--  Aqui el autor sale de `auth.uid()`, que lo pone el servidor a partir del
--  token firmado. El cliente no puede mentir sobre quien es.

create table if not exists auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null,
  antes jsonb,
  despues jsonb,
  actor uuid,
  cuando timestamptz not null default now()
);

create index if not exists auditoria_tabla_idx on auditoria (tabla, cuando desc);
create index if not exists auditoria_actor_idx on auditoria (actor, cuando desc);

alter table auditoria enable row level security;

-- Se lee solo desde gerencia, y NO se escribe desde la aplicacion: las filas las
-- pone el disparador. Sin politica de insert, nadie puede fabricar un registro
-- de auditoria falso.
drop policy if exists auditoria_lectura on auditoria;
create policy auditoria_lectura on auditoria
  for select to authenticated using (es_al_menos('gerencia'));

grant select on auditoria to authenticated;

create or replace function registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clave text;
begin
  clave := coalesce(
    (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
    '?'
  );

  insert into auditoria (tabla, registro_id, accion, antes, despues, actor)
  values (
    tg_table_name,
    clave,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );

  return coalesce(new, old);
end $$;

/*
 * Se audita lo que cambia dinero o permisos, y no todo.
 *
 * `movimientos` y `produccion_consumos` quedan fuera a proposito: ya son
 * inmutables y llevan su propio autor y momento, asi que auditarlos seria
 * guardar dos veces lo mismo y duplicar el crecimiento de la base de datos, que
 * es justo lo que hay que vigilar en un historico.
 */
do $$
declare
  t text;
begin
  foreach t in array array['lotes', 'precios', 'conversiones', 'recetas', 'perfiles', 'ingredientes']
  loop
    execute format('drop trigger if exists auditar on %I', t);
    execute format(
      'create trigger auditar after insert or update or delete on %I
       for each row execute function registrar_auditoria()', t
    );
  end loop;
end $$;
