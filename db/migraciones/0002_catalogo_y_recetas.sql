-- =============================================================================
--  0002 · CATALOGO DE INGREDIENTES Y RECETAS
-- =============================================================================
--
--  EL CAMBIO DE FONDO RESPECTO AL RECETARIO EN JSON
--  -----------------------------------------------
--  Hasta ahora un ingrediente era un NOMBRE escrito dentro de cada receta, y por
--  eso `CLAUDE.md` anotaba como deuda que "un cambio de nombre no propaga".
--  Aqui un ingrediente es una FILA con identidad propia, y las recetas apuntan a
--  ella. Renombrar "HARINA" pasa a ser un `update` de un solo registro en vez de
--  una busqueda y reemplazo sobre 1.293 lineas.
--
--  Es tambien lo que hace posible el costeo: no se puede poner precio a un texto.
--
--  LA UNIDAD BASE, QUE RESUELVE EL PROBLEMA DE LAS 67 LINEAS
--  --------------------------------------------------------
--  `CLAUDE.md` documenta que 15 ingredientes se miden hoy de dos o tres formas
--  distintas, en 67 lineas repartidas por 47 recetas, y que eso bloquea el
--  costeo. La solucion no es que el codigo adivine: es que cada ingrediente
--  declare UNA unidad base, y que cualquier otra forma de medirlo necesite una
--  conversion que UNA PERSONA aprobo y firmo.
--
--  Asi quedan separados los dos casos que hoy estan mezclados:
--    - AGUA en GR y en ML es lo mismo  -> conversion aprobada, factor 1
--    - MANTEQUILLA 1050 UND no existe  -> no hay conversion, la receta esta mal
--      y salta al intentar costearla, en vez de colarse con una cifra inventada.

-- -----------------------------------------------------------------------------
--  INGREDIENTES
-- -----------------------------------------------------------------------------

create table if not exists ingredientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- La unidad en la que se guarda TODO de este ingrediente: existencias,
  -- precios y consumos. Cualquier otra pasa antes por `conversiones`.
  unidad_base text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Sin distinguir mayusculas ni espacios de sobra: "Harina" y "HARINA " son el
  -- mismo producto en la despensa, y permitir las dos filas es exactamente como
  -- un catalogo de 159 se convierte en uno de 200 lleno de duplicados.
  constraint ingredientes_nombre_unico unique (nombre),
  constraint ingredientes_nombre_limpio check (nombre = btrim(nombre) and nombre <> ''),
  constraint ingredientes_unidad_limpia check (unidad_base = upper(btrim(unidad_base)))
);

create unique index if not exists ingredientes_nombre_normalizado_idx
  on ingredientes (upper(btrim(nombre)));

-- -----------------------------------------------------------------------------
--  CONVERSIONES ENTRE UNIDADES
-- -----------------------------------------------------------------------------
--
--  Siempre HACIA la unidad base, nunca entre dos unidades cualesquiera: con un
--  solo destino, N unidades necesitan N conversiones en vez de N por N, y no
--  puede haber dos caminos que den resultados distintos.
--
--  `aprobado_por` no es un adorno de auditoria: una conversion sin aprobar NO se
--  usa (ver la vista de costeo en 0004). Es lo que impide que alguien resuelva
--  el problema de las unidades tecleando un factor a ojo un viernes por la
--  tarde.

create table if not exists conversiones (
  id uuid primary key default gen_random_uuid(),
  ingrediente_id uuid not null references ingredientes (id) on delete cascade,
  desde_unidad text not null,
  -- Cuantas unidades base equivale UNA unidad de `desde_unidad`.
  -- Ejemplo: AGUA, desde ML, factor 1.0 -> 1 ML son 1 GR.
  factor numeric(18, 6) not null,
  nota text,
  aprobado_por uuid references perfiles (id) on delete restrict,
  aprobado_en timestamptz,
  creado_en timestamptz not null default now(),

  constraint conversiones_unicas unique (ingrediente_id, desde_unidad),
  constraint conversiones_factor_positivo check (factor > 0),
  constraint conversiones_unidad_limpia check (desde_unidad = upper(btrim(desde_unidad))),
  -- O esta aprobada del todo, o no lo esta: media aprobacion no existe.
  constraint conversiones_aprobacion_completa check (
    (aprobado_por is null and aprobado_en is null)
    or (aprobado_por is not null and aprobado_en is not null)
  )
);

create index if not exists conversiones_ingrediente_idx on conversiones (ingrediente_id);

-- -----------------------------------------------------------------------------
--  RECETAS
-- -----------------------------------------------------------------------------
--
--  El rendimiento sale del nombre y pasa a ser DOS COLUMNAS. En el recetario en
--  JSON vivia dentro del texto ("ALMOJABANA X 15 UND") y de ahi salieron los 13
--  nombres con `x` minuscula, las 34 recetas sin rendimiento legible y las 15
--  que lo llevan en medio del nombre. Como columna, o es un numero o no es nada.
--
--  El nombre se conserva tal cual estaba para no romper enlaces ni busquedas
--  guardadas, pero deja de ser el sitio donde vive el dato.

create table if not exists recetas (
  id uuid primary key default gen_random_uuid(),
  -- El codigo que ya usa la panaderia: R001, R002... Estable, nunca se reutiliza.
  codigo text not null unique,
  nombre text not null,
  categoria text not null,
  rendimiento_cantidad numeric(12, 3),
  rendimiento_unidad text,
  metodo text not null default '',
  activa boolean not null default true,
  creado_por uuid references perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_por uuid references perfiles (id) on delete restrict,
  actualizado_en timestamptz not null default now(),

  constraint recetas_categoria_valida
    check (categoria in ('PASTELERÍA', 'PANADERÍA', 'GALLETAS')),
  constraint recetas_rendimiento_positivo
    check (rendimiento_cantidad is null or rendimiento_cantidad > 0),
  -- El rendimiento va entero o no va: una cantidad sin unidad no se puede leer.
  constraint recetas_rendimiento_completo check (
    (rendimiento_cantidad is null and rendimiento_unidad is null)
    or (rendimiento_cantidad is not null and rendimiento_unidad is not null)
  )
);

create index if not exists recetas_categoria_idx on recetas (categoria) where activa;

-- -----------------------------------------------------------------------------
--  COMPONENTES (masa, relleno, cobertura...)
-- -----------------------------------------------------------------------------

create table if not exists receta_componentes (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references recetas (id) on delete cascade,
  nombre text not null default 'PRINCIPAL',
  orden smallint not null default 1,

  constraint componentes_orden_unico unique (receta_id, orden),
  constraint componentes_orden_positivo check (orden > 0)
);

create index if not exists componentes_receta_idx on receta_componentes (receta_id);

-- -----------------------------------------------------------------------------
--  LINEAS DE INGREDIENTE
-- -----------------------------------------------------------------------------
--
--  Aqui esta la clave foranea que justifica toda esta migracion: la linea apunta
--  al ingrediente por identidad, no por texto. La base de datos ya no deja que
--  una receta mencione un ingrediente que no existe.
--
--  `unidad` se conserva por linea porque una receta puede pedir un ingrediente
--  en una unidad distinta de su base (agua en ML aunque la base sea GR). La
--  conversion la resuelve el costeo, y si no hay conversion aprobada lo dice.

create table if not exists receta_items (
  id uuid primary key default gen_random_uuid(),
  componente_id uuid not null references receta_componentes (id) on delete cascade,
  ingrediente_id uuid not null references ingredientes (id) on delete restrict,
  cantidad numeric(14, 3) not null,
  unidad text not null,
  orden smallint not null default 1,

  constraint items_cantidad_positiva check (cantidad > 0),
  constraint items_unidad_limpia check (unidad = upper(btrim(unidad)))
);

create index if not exists items_componente_idx on receta_items (componente_id);
create index if not exists items_ingrediente_idx on receta_items (ingrediente_id);
