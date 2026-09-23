-- =============================================================================
--  0014 · LA OPERACION VIVE EN LA BASE DE DATOS
-- =============================================================================
--
--  QUE ENTRA AQUI
--  --------------
--  El dia a dia de la panaderia: lo que se planea, lo que se prepara, lo que se
--  confirma, lo que sale de bodega, lo que de verdad salio del horno, las notas
--  del equipo y las metas del panel. Hoy todo eso vive en el navegador de cada
--  equipo (`zahavi_almacen_v1`), crece unos 225.000 caracteres por dia y no se
--  comparte entre aparatos.
--
--  POR QUE NO SIRVE `producciones` DE 0003
--  ---------------------------------------
--  0003 se escribio antes de que el modulo creciera: una fila por receta y dia
--  con un estado, sin revision del plan, sin formula congelada, sin partidas,
--  sin equivalencias en gramos y sin resultado real. Se conserva como esta -no
--  tiene filas- y la operacion nueva entra en tablas propias.
--
--  TRES REGLAS QUE ATRAVIESAN TODO EL ESQUEMA
--  ------------------------------------------
--  1. LO CONFIRMADO NO SE RECALCULA. La formula y el costeo se guardan
--     congelados (`jsonb`) tal como se vieron al confirmar. Cambiar hoy el
--     precio de un lote no puede mover lo que costo la produccion de ayer.
--  2. QUIEN DIJO Y QUIEN FIRMO NO SON LO MISMO. `responsable` es el nombre
--     declarado en el origen (tambien al importar historia local, que no tiene
--     identidad autenticada); `autor_id` es el perfil que el servidor
--     autentico. Un historico importado lleva `historico = true` y su
--     `importacion_id`: no se le atribuye autenticacion hacia atras.
--  3. NADIE ESCRIBE DIRECTO. Estas tablas solo se leen desde la API. Las
--     escrituras llegan en 0016, por funciones que validan sede, rol, turno,
--     revision del plan y clave de solicitud, y que descuentan en la misma
--     transaccion. Por eso aqui no hay politicas de insert, update ni delete.
--
--  PRECISION
--  ---------
--  Gramos y equivalencias a seis decimales: una unidad de 0,000001 g no existe,
--  pero el reparto de una fraccion de bulto entre varias recetas si arrastra
--  decimales, y redondear a tres regalaba o cobraba de mas. El dinero queda a
--  dos decimales, que es como se paga, con el valor de origen aparte cuando se
--  importa historia que venia con otra precision.
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 1. De donde viene cada fila importada
-- ---------------------------------------------------------------------------
--  Los ids legibles de los navegadores (`L001`) se repiten entre aparatos: no
--  son identidad. Se conserva su referencia y su origen, y la identidad remota
--  la pone la base. `importacion_mapeos` es lo que hace que repetir una
--  importacion no cree una segunda compra ni un segundo consumo.

create table if not exists importaciones (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id) on delete restrict,
  origen text not null,                      -- aparato/navegador declarado
  huella text not null,                      -- huella del archivo de respaldo
  secuencia bigint,                          -- `secuencia` del documento local
  modo text not null check (modo in ('diagnostico', 'ensayo', 'definitiva')),
  importado_por uuid not null references perfiles (id) on delete restrict,
  creada timestamptz not null default now(),
  nota text
);

create table if not exists importacion_mapeos (
  importacion_id uuid not null references importaciones (id) on delete cascade,
  entidad text not null,                     -- lote, plan, ejecucion, nota...
  id_origen text not null,
  id_remoto uuid not null,
  primary key (importacion_id, entidad, id_origen)
);

create unique index if not exists importacion_mapeos_unicos
  on importacion_mapeos (entidad, id_remoto, importacion_id);

-- ---------------------------------------------------------------------------
-- 2. Bodega: el lote y su libro
-- ---------------------------------------------------------------------------
--  `existencia` vive en el lote porque es lo que se bloquea al descontar, y
--  SOLO cambia dentro de la funcion que escribe su `movimientos`. El libro
--  queda en `movimientos` (0003), que ya es inmutable por disparador.

alter table lotes add column if not exists marca text;
alter table lotes add column if not exists fecha_compra date;
alter table lotes add column if not exists existencia numeric(18, 6) not null default 0;
alter table lotes add column if not exists importacion_id uuid references importaciones (id) on delete restrict;
alter table lotes add column if not exists id_origen text;
alter table lotes add column if not exists historico boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lotes_existencia_en_rango') then
    alter table lotes add constraint lotes_existencia_en_rango
      check (existencia >= 0 and existencia <= peso_compra);
  end if;
end $$;

alter table movimientos add column if not exists ejecucion_id uuid;
alter table movimientos add column if not exists gramos numeric(18, 6);

--  Equivalencias VERSIONADAS: cuantos gramos pesa 1 ml, 1 unidad, 1 tanda o
--  1 cm de ESE lote. Nunca se editan: se agrega una version nueva y la anterior
--  queda como estaba, porque un costeo viejo se calculo con la suya.
create table if not exists equivalencias_lote (
  lote_id uuid not null references lotes (id) on delete restrict,
  medida text not null check (medida in ('ML', 'UND', 'TANDA', 'CM')),
  version integer not null default 1 check (version > 0),
  gramos numeric(18, 6) not null check (gramos > 0),
  vigente boolean not null default true,
  responsable text not null,
  autor_id uuid references perfiles (id) on delete restrict,
  creada timestamptz not null default now(),
  primary key (lote_id, medida, version)
);

create unique index if not exists equivalencias_lote_vigente
  on equivalencias_lote (lote_id, medida) where vigente;

-- ---------------------------------------------------------------------------
-- 3. El plan del dia y sus partidas
-- ---------------------------------------------------------------------------
--  Una receta puede entrar varias veces el mismo dia (partidas): son tandas
--  distintas, con su propio avance. `receta` guarda la formula CONGELADA: si
--  manana se edita la receta, lo planeado y lo confirmado siguen diciendo lo
--  que se preparo de verdad.

create table if not exists planes (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id) on delete restrict,
  fecha date not null,
  revision integer not null default 1 check (revision > 0),
  responsable text not null,
  motivo text not null,
  autor_id uuid references perfiles (id) on delete restrict,
  importacion_id uuid references importaciones (id) on delete restrict,
  historico boolean not null default false,
  actualizado timestamptz not null default now(),
  unique (sede_id, fecha)
);

create table if not exists plan_partidas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references planes (id) on delete cascade,
  receta_id uuid not null references recetas (id) on delete restrict,
  partida integer not null default 1 check (partida > 0),
  tandas numeric(12, 6) not null check (tandas > 0),
  receta jsonb not null,
  id_origen text,
  unique (plan_id, receta_id, partida)
);

-- ---------------------------------------------------------------------------
-- 4. Quien la saca y cuando empezo
-- ---------------------------------------------------------------------------

create table if not exists preparaciones (
  sede_id uuid not null references sedes (id) on delete restrict,
  fecha date not null,
  receta_id uuid not null references recetas (id) on delete restrict,
  iniciada timestamptz,
  iniciada_por uuid references perfiles (id) on delete restrict,
  asignado_a uuid references perfiles (id) on delete restrict,
  asignado_por uuid references perfiles (id) on delete restrict,
  actualizada timestamptz not null default now(),
  primary key (sede_id, fecha, receta_id),
  constraint preparaciones_inicio_con_autor check (
    (iniciada is null and iniciada_por is null) or (iniciada is not null and iniciada_por is not null)
  )
);

-- ---------------------------------------------------------------------------
-- 5. La confirmacion: lo unico que descuenta bodega
-- ---------------------------------------------------------------------------
--  `costeo` es la salida completa del costeo FEFO tal como la vio la pantalla,
--  con sus lineas y el tramo de cada lote. `ejecucion_consumos` repite esa
--  informacion normalizada para poder consultarla por lote e ingrediente sin
--  abrir el json.

create table if not exists ejecuciones (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id) on delete restrict,
  fecha date not null,
  plan_revision integer not null check (plan_revision > 0),
  area text check (area is null or area in ('PASTELERÍA', 'PANADERÍA', 'GALLETAS')),
  receta_id uuid references recetas (id) on delete restrict,   -- null: se confirmo un area o el dia
  instante timestamptz not null default now(),
  responsable text not null,
  motivo text not null,
  autor_id uuid references perfiles (id) on delete restrict,
  costo_total numeric(14, 2) not null check (costo_total >= 0),
  costo_origen numeric(18, 6),                                 -- valor tal como venia al importar
  costeo jsonb not null,
  importacion_id uuid references importaciones (id) on delete restrict,
  id_origen text,
  historico boolean not null default false,
  constraint ejecuciones_autoria check (historico or autor_id is not null)
);

create table if not exists ejecucion_partidas (
  ejecucion_id uuid not null references ejecuciones (id) on delete cascade,
  receta_id uuid not null references recetas (id) on delete restrict,
  partida integer not null default 1 check (partida > 0),
  tandas numeric(12, 6) not null check (tandas > 0),
  receta jsonb not null,
  primary key (ejecucion_id, receta_id, partida)
);

create table if not exists ejecucion_consumos (
  id bigint generated always as identity primary key,
  ejecucion_id uuid not null references ejecuciones (id) on delete cascade,
  lote_id uuid not null references lotes (id) on delete restrict,
  ingrediente_id uuid not null references ingredientes (id) on delete restrict,
  cantidad numeric(18, 6) not null check (cantidad > 0),        -- en la unidad de compra
  unidad text not null,
  gramos numeric(18, 6) not null check (gramos >= 0),
  gramos_por_unidad numeric(18, 6) check (gramos_por_unidad > 0),
  precio_unitario numeric(18, 6) not null check (precio_unitario >= 0),
  costo numeric(14, 2) not null check (costo >= 0)
);

-- ---------------------------------------------------------------------------
-- 6. Lo que de verdad salio
-- ---------------------------------------------------------------------------
--  Vacio significa no medido; cero significa medido sin perdida. Registrar el
--  resultado NUNCA vuelve a descontar inventario.

create table if not exists resultados (
  ejecucion_id uuid not null references ejecuciones (id) on delete cascade,
  receta_id uuid not null references recetas (id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  unidad text not null check (unidad in ('UND', 'PORC', 'PAQ', 'CAJA', 'GR', 'KG', 'ML', 'LT')),
  esperado numeric(18, 6) check (esperado is null or esperado > 0),
  vendible numeric(18, 6) not null check (vendible >= 0),
  rechazado numeric(18, 6) not null check (rechazado >= 0),
  merma_preparacion_gr numeric(18, 6) check (merma_preparacion_gr is null or merma_preparacion_gr >= 0),
  merma_coccion_gr numeric(18, 6) check (merma_coccion_gr is null or merma_coccion_gr >= 0),
  motivo text not null,
  responsable text not null,
  autor_id uuid references perfiles (id) on delete restrict,
  actualizado timestamptz not null default now(),
  primary key (ejecucion_id, receta_id)
);

-- ---------------------------------------------------------------------------
-- 7. Notas del equipo
-- ---------------------------------------------------------------------------
--  Una nota es para todo el equipo, para un area o para una persona: nunca para
--  dos destinos a la vez.

create table if not exists notas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id) on delete restrict,
  fecha date not null,
  tipo text not null check (tipo in ('tarea', 'pendiente', 'recomendacion', 'felicitacion')),
  texto text not null check (length(btrim(texto)) between 1 and 280),
  area text check (area is null or area in ('PASTELERÍA', 'PANADERÍA', 'GALLETAS')),
  persona_id uuid references perfiles (id) on delete restrict,
  hecha boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  responsable text not null,
  autor_id uuid references perfiles (id) on delete restrict,
  cambiada_por_id uuid references perfiles (id) on delete restrict,
  importacion_id uuid references importaciones (id) on delete restrict,
  historico boolean not null default false,
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  constraint notas_un_solo_destino check (area is null or persona_id is null)
);

-- ---------------------------------------------------------------------------
-- 8. Bitacora de lo que no mueve existencias
-- ---------------------------------------------------------------------------
--  Lo que mueve inventario ya queda en `movimientos`. Aqui va el resto: guardar
--  o eliminar un plan, ajustar una partida, empezar o cancelar una preparacion,
--  asignar, escribir o corregir una nota y medir un resultado. `datos` guarda el
--  cambio REDUCIDO (que cambio), no copias completas: ese fue el error del
--  documento local, donde cada consumo guardaba dos copias del lote entero.

create table if not exists eventos_operacion (
  id bigint generated always as identity primary key,
  sede_id uuid not null references sedes (id) on delete restrict,
  tipo text not null,
  fecha date,
  instante timestamptz not null default now(),
  responsable text not null,
  motivo text,
  autor_id uuid references perfiles (id) on delete restrict,
  referencia jsonb not null default '{}'::jsonb,
  datos jsonb not null default '{}'::jsonb,
  importacion_id uuid references importaciones (id) on delete restrict,
  historico boolean not null default false
);

-- ---------------------------------------------------------------------------
-- 9. Metas del panel, versionadas
-- ---------------------------------------------------------------------------

create table if not exists metas (
  sede_id uuid not null references sedes (id) on delete restrict,
  clave text not null check (clave in (
    'presupuestoMensual', 'cumplimientoPlan', 'rendimientoMinimo', 'rechazoMaximo',
    'coberturaMinima', 'avisoVencimiento', 'alzaPrecio')),
  vigente_desde timestamptz not null default now(),
  valor numeric(18, 4),
  responsable text not null,
  autor_id uuid not null references perfiles (id) on delete restrict,
  primary key (sede_id, clave, vigente_desde)
);

-- ---------------------------------------------------------------------------
-- 10. Idempotencia de las solicitudes
-- ---------------------------------------------------------------------------
--  Si la conexion se cae despues de guardar, el cliente reintenta con la MISMA
--  clave y recibe la misma ejecucion en vez de confirmar dos veces. Si reutiliza
--  una clave para otra cosa, se rechaza: por eso se guarda la huella de lo
--  pedido.

create table if not exists solicitudes (
  clave text primary key,
  sede_id uuid not null references sedes (id) on delete restrict,
  perfil_id uuid not null references perfiles (id) on delete restrict,
  operacion text not null,
  huella text not null,
  ejecucion_id uuid references ejecuciones (id) on delete restrict,
  resultado jsonb,
  creada timestamptz not null default now(),
  completada timestamptz
);

-- ---------------------------------------------------------------------------
-- 11. Indices de lo que se consulta a diario
-- ---------------------------------------------------------------------------

create index if not exists planes_sede_fecha on planes (sede_id, fecha desc);
create index if not exists plan_partidas_receta on plan_partidas (receta_id);
create index if not exists ejecuciones_sede_fecha on ejecuciones (sede_id, fecha desc);
create index if not exists ejecuciones_receta on ejecuciones (receta_id);
create index if not exists ejecucion_consumos_lote on ejecucion_consumos (lote_id);
create index if not exists ejecucion_consumos_ingrediente on ejecucion_consumos (ingrediente_id);
create index if not exists ejecucion_partidas_receta on ejecucion_partidas (receta_id);
create index if not exists resultados_receta on resultados (receta_id);
create index if not exists preparaciones_asignado on preparaciones (asignado_a) where asignado_a is not null;
create index if not exists notas_sede_fecha on notas (sede_id, fecha desc);
create index if not exists notas_persona on notas (persona_id) where persona_id is not null;
create index if not exists eventos_operacion_sede_instante on eventos_operacion (sede_id, instante desc);
create index if not exists eventos_operacion_fecha on eventos_operacion (sede_id, fecha);
create index if not exists lotes_ingrediente_vencimiento on lotes (ingrediente_id, vencimiento);
create index if not exists lotes_con_existencia on lotes (sede_id) where existencia > 0;
create index if not exists movimientos_ejecucion on movimientos (ejecucion_id) where ejecucion_id is not null;
create index if not exists equivalencias_lote_medida on equivalencias_lote (lote_id, medida);
create index if not exists importaciones_sede on importaciones (sede_id, creada desc);
create index if not exists metas_sede_clave on metas (sede_id, clave, vigente_desde desc);
create index if not exists solicitudes_ejecucion on solicitudes (ejecucion_id) where ejecucion_id is not null;

-- ---------------------------------------------------------------------------
-- 12. Seguridad por filas: se lee lo de la sede, con turno vigente
-- ---------------------------------------------------------------------------
--  Una sola politica de lectura por tabla (nada de politicas solapadas) y
--  NINGUNA de escritura: quien escribe es la funcion de 0016, `security
--  definer`, que valida rol, turno y revision. `privado.mi_sede()` ya exige
--  perfil activo y turno vigente (0009 y 0010).

alter table importaciones enable row level security;
alter table importacion_mapeos enable row level security;
alter table equivalencias_lote enable row level security;
alter table planes enable row level security;
alter table plan_partidas enable row level security;
alter table preparaciones enable row level security;
alter table ejecuciones enable row level security;
alter table ejecucion_partidas enable row level security;
alter table ejecucion_consumos enable row level security;
alter table resultados enable row level security;
alter table notas enable row level security;
alter table eventos_operacion enable row level security;
alter table metas enable row level security;
alter table solicitudes enable row level security;

drop policy if exists importaciones_lectura on importaciones;
create policy importaciones_lectura on importaciones for select to authenticated
  using (privado.es_mi_sede(sede_id) and privado.es_al_menos('gerencia'::rol));

drop policy if exists importacion_mapeos_lectura on importacion_mapeos;
create policy importacion_mapeos_lectura on importacion_mapeos for select to authenticated
  using (exists (select 1 from importaciones i
                 where i.id = importacion_mapeos.importacion_id
                   and privado.es_mi_sede(i.sede_id) and privado.es_al_menos('gerencia'::rol)));

drop policy if exists equivalencias_lote_lectura on equivalencias_lote;
create policy equivalencias_lote_lectura on equivalencias_lote for select to authenticated
  using (exists (select 1 from lotes l where l.id = equivalencias_lote.lote_id and privado.es_mi_sede(l.sede_id)));

drop policy if exists planes_lectura on planes;
create policy planes_lectura on planes for select to authenticated
  using (privado.es_mi_sede(sede_id));

drop policy if exists plan_partidas_lectura on plan_partidas;
create policy plan_partidas_lectura on plan_partidas for select to authenticated
  using (exists (select 1 from planes p where p.id = plan_partidas.plan_id and privado.es_mi_sede(p.sede_id)));

drop policy if exists preparaciones_lectura on preparaciones;
create policy preparaciones_lectura on preparaciones for select to authenticated
  using (privado.es_mi_sede(sede_id));

drop policy if exists ejecuciones_lectura on ejecuciones;
create policy ejecuciones_lectura on ejecuciones for select to authenticated
  using (privado.es_mi_sede(sede_id));

drop policy if exists ejecucion_partidas_lectura on ejecucion_partidas;
create policy ejecucion_partidas_lectura on ejecucion_partidas for select to authenticated
  using (exists (select 1 from ejecuciones e where e.id = ejecucion_partidas.ejecucion_id and privado.es_mi_sede(e.sede_id)));

drop policy if exists ejecucion_consumos_lectura on ejecucion_consumos;
create policy ejecucion_consumos_lectura on ejecucion_consumos for select to authenticated
  using (exists (select 1 from ejecuciones e where e.id = ejecucion_consumos.ejecucion_id
                 and privado.es_mi_sede(e.sede_id) and privado.es_al_menos('gerencia'::rol)));

drop policy if exists resultados_lectura on resultados;
create policy resultados_lectura on resultados for select to authenticated
  using (exists (select 1 from ejecuciones e where e.id = resultados.ejecucion_id and privado.es_mi_sede(e.sede_id)));

drop policy if exists notas_lectura on notas;
create policy notas_lectura on notas for select to authenticated
  using (privado.es_mi_sede(sede_id));

drop policy if exists eventos_operacion_lectura on eventos_operacion;
create policy eventos_operacion_lectura on eventos_operacion for select to authenticated
  using (privado.es_mi_sede(sede_id) and privado.es_al_menos('obrador'::rol));

drop policy if exists metas_lectura on metas;
create policy metas_lectura on metas for select to authenticated
  using (privado.es_mi_sede(sede_id));

drop policy if exists solicitudes_lectura on solicitudes;
create policy solicitudes_lectura on solicitudes for select to authenticated
  using (privado.es_mi_sede(sede_id) and perfil_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 13. Permisos: solo lectura, y el dinero aparte
-- ---------------------------------------------------------------------------
--  Los privilegios POR DEFECTO del esquema los define `supabase_admin` y
--  conceden TODO sobre cada tabla nueva a `anon` y `authenticated`, TRUNCATE
--  incluido, que la seguridad por filas no filtra (ver 0013). Por eso cada
--  tabla revoca primero y concede despues solo lo que necesita.
--
--  La seguridad por filas no oculta COLUMNAS: el costo total y el costeo
--  congelado se conceden columna a columna, y quien no es gerencia no recibe
--  siquiera el permiso de leerlas.

revoke all on table importaciones, importacion_mapeos, equivalencias_lote, planes, plan_partidas,
  preparaciones, ejecuciones, ejecucion_partidas, ejecucion_consumos, resultados, notas,
  eventos_operacion, metas, solicitudes from anon, authenticated;

grant select on table importaciones, importacion_mapeos, equivalencias_lote, planes, plan_partidas,
  preparaciones, ejecucion_partidas, ejecucion_consumos, resultados, notas,
  eventos_operacion, metas, solicitudes to authenticated;

--  De `ejecuciones`, todo el mundo ve que se produjo; el dinero, solo por la
--  vista de gerencia (0015 la publica con `privado.ejecuciones_costos()`).
grant select (id, sede_id, fecha, plan_revision, area, receta_id, instante, responsable,
  motivo, autor_id, importacion_id, id_origen, historico) on table ejecuciones to authenticated;
