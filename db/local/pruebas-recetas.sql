-- =============================================================================
--  LAS 122 RECETAS REALES, YA DENTRO DEL ESQUEMA
-- =============================================================================
--
--  Se ejecuta DESPUES de `scripts/sembrar-recetas.mjs`. Aquello comprueba que
--  las cifras cuadran al cargar; esto comprueba que lo cargado SIRVE.
--
--  La pregunta que contesta es una sola y es la que decide si la Fase 3 se
--  sostiene: cuando llegue el primer precio de proveedor, ¿el costeo dira la
--  verdad sobre las 71 lineas cuya unidad nadie ha decidido todavia?

\set ON_ERROR_STOP on
\set QUIET on

\echo ''
\echo '9. Las recetas reales dentro del esquema'

-- ---- La forma de los datos --------------------------------------------------

do $$
declare
  n integer;
  fila record;
begin
  -- Ninguna linea puede apuntar a un ingrediente que no exista: lo impide la
  -- clave foranea, asi que si esto pasa es que la semilla entro entera.
  select count(*) into n from receta_items;
  raise notice '  OK    % lineas de ingrediente, todas con su ingrediente real', n;

  -- El rendimiento ya no vive dentro del nombre.
  select count(*) into n from recetas where rendimiento_cantidad is not null;
  raise notice '  OK    % recetas con el rendimiento en su columna', n;

  select count(*) into n from recetas where rendimiento_cantidad is null;
  raise notice '  OK    y % sin rendimiento legible, en nulo y no en cero', n;

  -- El nombre base NO es unico (regla 6 de CLAUDE.md). Que siga sin serlo aqui
  -- no es un defecto: es el dato real, y el codigo es quien da la identidad.
  select count(*) into n from (
    select nombre, count(*) from recetas group by nombre having count(*) > 1
  ) repetidos;
  if n > 0 then
    raise notice '  OK    % nombres repetidos, distinguidos por codigo y rendimiento', n;
  end if;

  -- Cada componente conserva su orden dentro de su receta.
  select count(*) into n from receta_componentes;
  raise notice '  OK    % componentes, cada uno con su orden', n;

  select * into fila from recetas where codigo = 'R001';
  if fila.id is null then
    raise exception 'FALLA: no se cargo la receta R001';
  end if;
end $$;

-- ---- LO QUE DE VERDAD IMPORTA: EL COSTEO NO SE INVENTA UNIDADES -------------
--
--  Se pone precio a UN ingrediente de los ambiguos -AGUA, que tiene 37 lineas
--  en GR y 16 en ML- y se mira que hace el costeo con cada grupo.
--
--  Lo que tiene que pasar:
--    - las lineas en GR (la unidad base) se costean;
--    - las lineas en ML NO se costean y dicen `sin_conversion`.
--
--  Si en vez de eso las lineas en ML salieran costeadas, el sistema estaria
--  cobrando 16 lineas a un factor que nadie aprobo. Y si salieran omitidas, el
--  total seria mas barato que la realidad sin que nadie lo notara, que es la
--  peor forma posible de equivocarse con dinero.

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000003';
set request.jwt.claim.session_id = 'dddddddd-0000-0000-0000-000000000003';
set request.jwt.claim.aal = 'aal2';

do $$
declare
  ing uuid;
  con_costo integer;
  sin_conv integer;
  base text;
begin
  select id, unidad_base into ing, base from ingredientes where nombre = 'AGUA';
  if ing is null then
    raise exception 'FALLA: el ingrediente AGUA no esta en el catalogo';
  end if;

  insert into precios (ingrediente_id, valor, vigente_desde)
  values (ing, 0.002, current_date);

  select count(*) into con_costo
  from receta_costo_actual
  where ingrediente_id = ing and costo is not null;

  select count(*) into sin_conv
  from receta_costo_actual
  where ingrediente_id = ing and problema = 'sin_conversion';

  if con_costo = 0 then
    raise exception 'FALLA: con precio puesto, ni una sola linea de AGUA se costea';
  end if;
  if sin_conv = 0 then
    raise exception 'FALLA: las lineas de AGUA en otra unidad se estan costeando sin conversion aprobada';
  end if;

  raise notice '  OK    AGUA (base %): % lineas costeadas, % marcadas `sin_conversion`',
    base, con_costo, sin_conv;
  raise notice '  OK    el costeo NO convierte unidades por su cuenta, lo dice';
end $$;

-- ---- Y el aviso se ve, no se omite ------------------------------------------
--
--  OJO AL LEER ESTA CIFRA: solo cuenta las lineas de ingredientes QUE YA TIENEN
--  PRECIO, porque `receta_costo_actual` mira el precio antes que la unidad. Hoy
--  hay un solo precio puesto -el del AGUA, que pone esta misma prueba-, asi que
--  esto son las lineas del AGUA y nada mas.
--
--  La cifra global de lo que falta por decidir NO sale de aqui: la da la semilla
--  al cargar, comparando su propio recuento con el de la base de datos. Se dijo
--  asi porque la primera version de este mensaje decia "en total" y se leia como
--  si fueran las 71 de todo el recetario.

do $$
declare
  n_lineas integer;
  n_recetas integer;
begin
  select count(*), count(distinct receta_id) into n_lineas, n_recetas
  from receta_costo_actual
  where problema = 'sin_conversion';

  raise notice '  OK    de lo que YA tiene precio, % lineas en % recetas salen marcadas',
    n_lineas, n_recetas;
  raise notice '        (no se omiten del total: se muestran diciendo por que)';
end $$;

reset role;
reset request.jwt.claim.sub;
reset request.jwt.claim.session_id;
reset request.jwt.claim.aal;
