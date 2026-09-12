-- =============================================================================
--  0004 · VISTAS: EXISTENCIAS, COSTOS E INFORMES POR PERIODO
-- =============================================================================
--
--  LA API SON ESTAS VISTAS, NO LAS TABLAS
--  --------------------------------------
--  Las tablas con dinero (`lotes`, `precios`, `produccion_consumos`) tienen el
--  permiso de lectura REVOCADO (ver 0005). Lo unico que se consulta desde fuera
--  es lo que hay en este archivo.
--
--  POR QUE NO SE USA `security_invoker`
--  ------------------------------------
--  Porque el requisito es ocultar COLUMNAS -el costo, el margen- a alguien que
--  SI puede ver la fila. Y eso no lo puede hacer la seguridad por filas, que es
--  por filas; ni los permisos por columna, porque en esta plataforma todas las
--  personas comparten el mismo rol de base de datos (`authenticated`) y el rol
--  de la aplicacion vive en `perfiles`.
--
--  La unica forma correcta es enmascarar en una vista que SI pueda leer la tabla
--  aunque quien pregunta no pueda. Eso es una vista `security definer`, que es
--  el comportamiento por defecto de PostgreSQL y por eso no se declara nada.
--
--  EL PRECIO, Y COMO SE PAGA
--  -------------------------
--  Una vista `definer` se salta la seguridad por filas de las tablas de abajo,
--  asi que la autorizacion de LECTURA vive aqui y no alli. La regla es entonces
--  absoluta y no admite excepciones:
--
--      TODA vista de este archivo filtra explicitamente con `es_mi_sede()` o
--      con `es_al_menos()`. Sin excepciones.
--
--  Y no se deja a la buena memoria: `scripts/verificar-sql.mjs` falla si alguna
--  vista no lo hace. La seguridad por filas de las tablas sigue activa y sigue
--  gobernando la ESCRITURA, que es donde si aplica.
--
--  El dinero se enmascara AQUI y nunca en la interfaz: ocultar una columna en la
--  pantalla no es ocultarla, porque sigue viajando por la red y basta con mirar
--  la respuesta.

-- -----------------------------------------------------------------------------
--  EXISTENCIA POR LOTE
-- -----------------------------------------------------------------------------
--
--  La existencia es la suma del libro de movimientos. No hay ninguna columna que
--  mantener sincronizada, asi que no puede desincronizarse.

create or replace view existencia_lotes as
select
  l.id as lote_id,
  l.codigo,
  l.ingrediente_id,
  i.nombre as ingrediente,
  i.unidad_base,
  l.sede_id,
  l.unidad,
  l.presentacion,
  l.lote_proveedor,
  l.proveedor_id,
  l.peso_compra,
  l.vencimiento,
  coalesce(sum(m.cantidad), 0) as existencia,

  case when es_al_menos('gerencia') then l.costo_compra end as costo_compra,
  case when es_al_menos('gerencia') then l.valor_unitario end as valor_unitario,
  case when es_al_menos('gerencia')
    then round(coalesce(sum(m.cantidad), 0) * l.valor_unitario, 2)
  end as valor_existencia,

  -- El estado se calcula aqui y no en el cliente: es una regla de negocio y
  -- tiene que dar lo mismo en la tableta del obrador, en el informe y en la hoja
  -- impresa. Treinta dias es el plazo con el que todavia da tiempo a colocar el
  -- producto en produccion.
  case
    when l.vencimiento is null then 'sin_fecha'
    when l.vencimiento < current_date then 'vencido'
    when l.vencimiento <= current_date + 30 then 'proximo'
    else 'ok'
  end as estado_vencimiento
from lotes l
join ingredientes i on i.id = l.ingrediente_id
left join movimientos m on m.lote_id = l.id
where es_mi_sede(l.sede_id)
group by l.id, i.nombre, i.unidad_base;

-- -----------------------------------------------------------------------------
--  EXISTENCIA POR INGREDIENTE
-- -----------------------------------------------------------------------------
--
--  Se agrupa por ingrediente Y UNIDAD, nunca solo por ingrediente. Es la misma
--  regla que ya aplicaba el recetario: 500 GR y 2 UND no son 502 de nada, y con
--  un precio de por medio esa suma dejaria de ser una imprecision para
--  convertirse en dinero mal contado.

create or replace view existencia_ingredientes as
select
  el.ingrediente_id,
  el.ingrediente,
  el.unidad,
  el.sede_id,
  sum(el.existencia) as existencia,
  -- Lo VENCIDO no cuenta como disponible. FEFO aplicado a ciegas pondria el lote
  -- caducado el primero de la fila y lo mandaria a produccion: en un almacen de
  -- alimentos eso no es un redondeo, es producto vencido en el obrador.
  sum(el.existencia) filter (where el.estado_vencimiento <> 'vencido') as disponible,
  count(*) filter (where el.existencia > 0) as lotes_con_existencia,
  count(*) filter (where el.estado_vencimiento = 'vencido' and el.existencia > 0) as lotes_vencidos,
  count(*) filter (where el.estado_vencimiento = 'proximo' and el.existencia > 0) as lotes_proximos,
  case when es_al_menos('gerencia') then sum(el.valor_existencia) end as valor_existencia
from existencia_lotes el
where es_mi_sede(el.sede_id)
group by el.ingrediente_id, el.ingrediente, el.unidad, el.sede_id;

-- -----------------------------------------------------------------------------
--  COSTO DE CADA PRODUCCION
-- -----------------------------------------------------------------------------
--
--  Sale de los consumos con su costo CONGELADO, asi que es un hecho historico y
--  no una estimacion que cambie al corregir un precio.

create or replace view produccion_costos as
select
  p.id as produccion_id,
  p.fecha,
  p.sede_id,
  p.receta_id,
  r.codigo as receta_codigo,
  r.nombre as receta,
  p.factor,
  p.estado,
  count(c.id) as lineas,
  case when es_al_menos('gerencia') then coalesce(sum(c.costo), 0) end as costo,
  case when es_al_menos('gerencia') and p.factor > 0
    then round(coalesce(sum(c.costo), 0) / p.factor, 2)
  end as costo_por_tanda
from producciones p
join recetas r on r.id = p.receta_id
left join produccion_consumos c on c.produccion_id = p.id
where es_mi_sede(p.sede_id)
group by p.id, r.codigo, r.nombre;

-- -----------------------------------------------------------------------------
--  EL GASTO A LO LARGO DEL TIEMPO
-- -----------------------------------------------------------------------------
--
--  Diario, mensual, trimestral y anual salen de UNA tabla y UNA funcion, no de
--  tablas de resumen por cada grano. Las tablas de resumen se desincronizan en
--  cuanto alguien corrige un dato viejo, y entonces el informe y el detalle
--  dejan de cuadrar sin que nadie sepa cual de los dos miente.

create or replace view gasto_diario as
select
  p.fecha,
  p.sede_id,
  sum(c.costo) as costo,
  count(distinct p.id) as producciones
from producciones p
join produccion_consumos c on c.produccion_id = p.id
where p.estado = 'terminada'
  -- El gasto es informacion de gerencia: sin el rol, la vista sale vacia en vez
  -- de fallar. Una pantalla sin datos se entiende; un error no.
  and es_al_menos('gerencia')
  and es_mi_sede(p.sede_id)
group by p.fecha, p.sede_id;

/*
 * El gasto agrupado por el periodo que se pida.
 *
 * `grano` se valida contra una lista blanca aunque `date_trunc` lo reciba como
 * parametro y no admita inyeccion: un valor no contemplado daria un error de
 * PostgreSQL en crudo, y lo que tiene que llegar a la pantalla es una frase que
 * se entienda.
 */
create or replace function gasto_por_periodo(
  grano text default 'month',
  desde date default null,
  hasta date default null,
  sede uuid default null
)
returns table (
  periodo date,
  sede_id uuid,
  costo numeric,
  producciones bigint
)
language plpgsql
stable
as $$
begin
  if grano not in ('day', 'week', 'month', 'quarter', 'year') then
    raise exception 'El periodo tiene que ser day, week, month, quarter o year (llego: %)', grano;
  end if;

  return query
  select
    date_trunc(grano, g.fecha)::date as periodo,
    g.sede_id,
    sum(g.costo)::numeric as costo,
    sum(g.producciones)::bigint as producciones
  from gasto_diario g
  where (desde is null or g.fecha >= desde)
    and (hasta is null or g.fecha <= hasta)
    and (sede is null or g.sede_id = sede)
  group by 1, 2
  order by 1, 2;
end $$;

-- -----------------------------------------------------------------------------
--  PRECIO VIGENTE Y COSTO TEORICO DE UNA RECETA
-- -----------------------------------------------------------------------------

create or replace view precio_vigente as
select
  p.ingrediente_id,
  p.valor,
  p.vigente_desde
from precios p
where (p.vigente_hasta is null or p.vigente_hasta > current_date)
  and es_al_menos('gerencia');

/*
 * Lo que costaria una receta con los precios de hoy.
 *
 * ES DISTINTO del costo de una produccion, que sale de lo que de verdad se
 * consumio. Este sirve para decidir precio de venta y comparar formulas; aquel
 * es el hecho contable.
 *
 * LA COLUMNA `problema` ES LA MAS IMPORTANTE DE LA VISTA. Una linea que no se
 * puede costear NO se omite ni se cuenta como cero: sale diciendo por que. Si se
 * omitiera, el total seria mas barato que la realidad y nadie lo notaria, que es
 * la peor forma posible de equivocarse con dinero.
 */
create or replace view receta_costo_actual as
select
  r.id as receta_id,
  r.codigo,
  r.nombre,
  ri.id as item_id,
  i.id as ingrediente_id,
  i.nombre as ingrediente,
  ri.cantidad,
  ri.unidad,
  i.unidad_base,
  -- La conversion a la unidad base: directa si ya coincide, aprobada si alguien
  -- la firmo, y nada si nadie lo ha hecho todavia.
  case
    when ri.unidad = i.unidad_base then 1::numeric
    when cv.aprobado_en is not null then cv.factor
  end as factor,
  case
    when ri.unidad = i.unidad_base then ri.cantidad
    when cv.aprobado_en is not null then ri.cantidad * cv.factor
  end as cantidad_base,
  pv.valor as precio_unitario,
  case
    when pv.valor is null then null
    when ri.unidad = i.unidad_base then round(ri.cantidad * pv.valor, 2)
    when cv.aprobado_en is not null then round(ri.cantidad * cv.factor * pv.valor, 2)
  end as costo,
  case
    when pv.valor is null then 'sin_precio'
    when ri.unidad <> i.unidad_base and cv.id is null then 'sin_conversion'
    when ri.unidad <> i.unidad_base and cv.aprobado_en is null then 'conversion_sin_aprobar'
  end as problema
from recetas r
join receta_componentes rc on rc.receta_id = r.id
join receta_items ri on ri.componente_id = rc.id
join ingredientes i on i.id = ri.ingrediente_id
left join conversiones cv
  on cv.ingrediente_id = i.id and cv.desde_unidad = ri.unidad
left join precio_vigente pv on pv.ingrediente_id = i.id
where es_al_menos('gerencia');

-- -----------------------------------------------------------------------------
--  HISTORICO DE MOVIMIENTOS, LEGIBLE
-- -----------------------------------------------------------------------------
--
--  El libro con nombres en vez de identificadores, que es como se audita.

create or replace view movimientos_historico as
select
  m.id,
  m.creado_en,
  m.tipo,
  m.cantidad,
  l.codigo as lote,
  l.sede_id,
  i.nombre as ingrediente,
  l.unidad,
  m.produccion_id,
  r.codigo as receta,
  m.motivo,
  pf.nombre as quien,
  case when es_al_menos('gerencia')
    then round(abs(m.cantidad) * l.valor_unitario, 2)
  end as valor
from movimientos m
join lotes l on l.id = m.lote_id
join ingredientes i on i.id = l.ingrediente_id
left join producciones p on p.id = m.produccion_id
left join recetas r on r.id = p.receta_id
left join perfiles pf on pf.id = m.creado_por
where es_mi_sede(l.sede_id);
