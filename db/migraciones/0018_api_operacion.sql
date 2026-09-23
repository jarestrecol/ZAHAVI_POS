-- =============================================================================
--  0018 · LA PUERTA DE LA OPERACION: DOS RPC Y NADA MAS
-- =============================================================================
--
--  El navegador ya no guarda operacion: la pide. Toda escritura entra por
--  `public.operacion_ejecutar(p_solicitud)` y toda lectura por
--  `public.operacion_leer(p_consulta)`. Contrato completo para el cliente en
--  `coordinacion/entregas/CONTRATO-RPC.md`.
--
--  QUE HACE ESTE NUCLEO (y ninguna accion tiene que repetir)
--  ---------------------------------------------------------
--  1. Quien pide lo dice la SESION, no el cuerpo: perfil activo, sede y turno
--     vigente (0009/0010). Sin eso, 401.
--  2. Solo existen las acciones registradas en `privado.acciones`, cada una con
--     su rol minimo, comprobado con la misma `es_al_menos()` que usa RLS (con
--     verificacion en dos pasos para gerencia). Una accion desconocida es 422;
--     un rol corto, 403.
--  3. Idempotencia: la clave de la solicitud y la huella de lo pedido quedan en
--     `solicitudes` DENTRO de la misma transaccion que la escritura. Si algo
--     falla no queda nada, y el reintento es limpio. Si ya se completo, se
--     devuelve el mismo resultado sin repetir la escritura. Si la clave vuelve
--     con otros datos, 409.
--  4. Errores con estado HTTP (PostgREST `PGRST`): el cliente distingue sesion,
--     permiso, conflicto y validacion sin interpretar texto.
--  5. El dinero sale proyectado por el rol de AHORA, tambien al repetir una
--     solicitud que se hizo con otro rol.
--
--  Las acciones concretas (bodega, plan, notas...) se registran en las
--  migraciones siguientes. Este archivo no conoce ninguna.
--
--  Se puede aplicar dos veces sin efectos.

-- ---------------------------------------------------------------------------
-- 1. Errores que PostgREST convierte en estado HTTP
-- ---------------------------------------------------------------------------

--  `volatile` a proposito: una funcion inmutable con argumentos constantes se
--  puede evaluar al planificar, y lanzaria el error aunque la rama no se tome.
create or replace function privado.fallar(codigo text, mensaje text, estado integer)
returns void
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  raise sqlstate 'PGRST'
    using message = json_build_object('code', codigo, 'message', mensaje)::text,
          detail = json_build_object('status', estado, 'headers', json_build_object())::text;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Quien pide
-- ---------------------------------------------------------------------------

create or replace function privado.contexto()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'perfil', p.id,
    'sede', p.sede_id,
    'rol', p.rol,
    'responsable', case when coalesce(p.codigo_usuario, '') = '' then p.nombre
                        else p.nombre || ' (' || p.codigo_usuario || ')' end,
    'gerencia', privado.es_al_menos('gerencia'::rol),
    'hoy', (now() at time zone 'America/Bogota')::date)
  from public.perfiles p
  where p.id = auth.uid() and p.activo and p.sede_id is not null and privado.sesion_vigente()
$$;

-- ---------------------------------------------------------------------------
-- 3. Lectura de `datos`: estricta y con el campo en el mensaje
-- ---------------------------------------------------------------------------
--  La API recibe JSON tipado: un numero llega como numero, no como texto con
--  coma. Lo que no cumple se rechaza con 422 diciendo que campo fallo.

create or replace function privado.dato_texto(d jsonb, campo text, obligatorio boolean default false,
                                              maximo integer default 200)
returns text
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  v jsonb := d -> campo;
  t text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    t := null;
  elsif jsonb_typeof(v) <> 'string' then
    perform privado.fallar('invalida', format('El campo «%s» tiene que ser texto.', campo), 422);
  else
    t := nullif(regexp_replace(btrim(v #>> '{}'), '\s+', ' ', 'g'), '');
  end if;
  if t is null and obligatorio then
    perform privado.fallar('invalida', format('Falta el campo «%s».', campo), 422);
  end if;
  if length(t) > maximo then
    perform privado.fallar('invalida', format('El campo «%s» no puede pasar de %s caracteres.', campo, maximo), 422);
  end if;
  return t;
end $$;

create or replace function privado.dato_numero(d jsonb, campo text, obligatorio boolean default false,
                                               decimales integer default 6)
returns numeric
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  v jsonb := d -> campo;
  n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if obligatorio then
      perform privado.fallar('invalida', format('Falta el campo «%s».', campo), 422);
    end if;
    return null;
  end if;
  if jsonb_typeof(v) <> 'number' then
    perform privado.fallar('invalida', format('El campo «%s» tiene que ser un número.', campo), 422);
  end if;
  n := (v #>> '{}')::numeric;
  if n <> round(n, decimales) then
    perform privado.fallar('invalida', format('El campo «%s» admite como máximo %s decimales.', campo, decimales), 422);
  end if;
  return n;
end $$;

create or replace function privado.dato_uuid(d jsonb, campo text, obligatorio boolean default false)
returns uuid
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  t text := privado.dato_texto(d, campo, obligatorio, 36);
begin
  if t is null then
    return null;
  end if;
  if t !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    perform privado.fallar('invalida', format('El campo «%s» no es un identificador válido.', campo), 422);
  end if;
  return t::uuid;
end $$;

create or replace function privado.dato_fecha(d jsonb, campo text, obligatorio boolean default false)
returns date
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  t text := privado.dato_texto(d, campo, obligatorio, 10);
begin
  if t is null then
    return null;
  end if;
  if t !~ '^\d{4}-\d{2}-\d{2}$' then
    perform privado.fallar('invalida', format('El campo «%s» tiene que ser una fecha AAAA-MM-DD.', campo), 422);
  end if;
  begin
    return t::date;
  exception when others then
    perform privado.fallar('invalida', format('El campo «%s» no es una fecha que exista.', campo), 422);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4. El dinero, solo para quien hoy puede verlo
-- ---------------------------------------------------------------------------
--  Se quita por NOMBRE de campo y en cualquier profundidad: es la red de
--  seguridad para los resultados guardados y las consultas. Cada accion,
--  ademas, construye su respuesta sabiendo el rol.

create or replace function privado.sin_dinero(j jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  r jsonb;
  k text;
  v jsonb;
begin
  if jsonb_typeof(j) = 'object' then
    r := '{}';
    for k, v in select * from jsonb_each(j) loop
      if k <> all (array['costo', 'costo_total', 'costoTotal', 'costo_compra', 'costoCompra',
                         'valor_unitario', 'valorUnitario', 'precio_unitario', 'precioUnitario',
                         'precioPorGramo', 'precioMedio', 'costeo', 'valor_existencia',
                         'presupuestoMensual']) then
        r := r || jsonb_build_object(k, privado.sin_dinero(v));
      end if;
    end loop;
    return r;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(privado.sin_dinero(e) order by n)
                     from jsonb_array_elements(j) with ordinality x(e, n)), '[]'::jsonb);
  end if;
  return j;
end $$;

create or replace function privado.proyectar(ctx jsonb, j jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case when (ctx ->> 'gerencia')::boolean then j else privado.sin_dinero(j) end
$$;

-- ---------------------------------------------------------------------------
-- 5. Bitacora de lo que cambia, en la misma transaccion
-- ---------------------------------------------------------------------------

create or replace function privado.anotar(ctx jsonb, p_tipo text, p_fecha date, p_motivo text,
                                          p_referencia jsonb, p_datos jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.eventos_operacion (sede_id, tipo, fecha, responsable, motivo, autor_id, referencia, datos)
  values ((ctx ->> 'sede')::uuid, p_tipo, p_fecha, ctx ->> 'responsable', p_motivo,
          (ctx ->> 'perfil')::uuid, coalesce(p_referencia, '{}'), coalesce(p_datos, '{}'))
$$;

-- ---------------------------------------------------------------------------
-- 6. Lo que se puede pedir
-- ---------------------------------------------------------------------------
--  El despachador solo llama funciones que esten aqui, y cada una con su rol
--  minimo. Una fila nueva es una accion nueva: no hay forma de invocar otra
--  funcion de `privado` a traves de la API.

create table if not exists privado.acciones (
  accion text primary key check (accion ~ '^[a-z][a-z0-9_]{0,62}$'),
  funcion text not null check (funcion ~ '^privado\.[a-z][a-z0-9_]{0,62}$'),
  rol_minimo rol not null,
  descripcion text not null
);

create table if not exists privado.consultas (
  tipo text primary key check (tipo ~ '^[a-z][a-z0-9_]{0,62}$'),
  funcion text not null check (funcion ~ '^privado\.[a-z][a-z0-9_]{0,62}$'),
  rol_minimo rol not null,
  descripcion text not null
);

alter table privado.acciones enable row level security;
alter table privado.consultas enable row level security;
revoke all on table privado.acciones, privado.consultas from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Ejecutar
-- ---------------------------------------------------------------------------

create or replace function privado.ejecutar(p_solicitud jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '5s'
as $$
declare
  ctx jsonb := privado.contexto();
  v_id text;
  v_revision integer;
  v_datos jsonb;
  v_huella text;
  v_resultado jsonb;
  a privado.acciones%rowtype;
  s public.solicitudes%rowtype;
begin
  if ctx is null then
    perform privado.fallar('sin_sesion', 'Tu sesión terminó o tu usuario no está activo. Vuelve a entrar.', 401);
  end if;

  if jsonb_typeof(p_solicitud) is distinct from 'object'
     or coalesce(p_solicitud ->> 'id', '') !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
     or jsonb_typeof(p_solicitud -> 'accion') is distinct from 'string'
     or jsonb_typeof(p_solicitud -> 'revision') is distinct from 'number'
     or (p_solicitud ->> 'revision') !~ '^\d{1,9}$'
     or jsonb_typeof(p_solicitud -> 'datos') is distinct from 'object' then
    perform privado.fallar('invalida', 'La solicitud no tiene la forma esperada (id, accion, revision, datos).', 422);
  end if;

  v_id := lower(p_solicitud ->> 'id');
  v_revision := (p_solicitud ->> 'revision')::integer;
  v_datos := p_solicitud -> 'datos';

  select * into a from privado.acciones where accion = p_solicitud ->> 'accion';
  if not found then
    perform privado.fallar('invalida', 'Esa acción no existe.', 422);
  end if;
  if not privado.es_al_menos(a.rol_minimo) then
    perform privado.fallar('sin_permiso', 'Tu rol no permite esta operación.', 403);
  end if;

  v_huella := md5(jsonb_build_object('accion', a.accion, 'revision', v_revision, 'datos', v_datos)::text);

  insert into public.solicitudes (clave, sede_id, perfil_id, operacion, huella)
  values (v_id, (ctx ->> 'sede')::uuid, (ctx ->> 'perfil')::uuid, a.accion, v_huella)
  on conflict (clave) do nothing;

  if not found then
    -- Ya existe: la otra transaccion termino (esperamos su bloqueo) y se completo.
    select * into s from public.solicitudes where clave = v_id for update;
    if s.perfil_id <> (ctx ->> 'perfil')::uuid or s.operacion <> a.accion or s.huella <> v_huella then
      perform privado.fallar('solicitud_reutilizada',
        'Esa solicitud ya se usó para otra operación. Vuelve a intentarlo desde la pantalla.', 409);
    end if;
    return jsonb_build_object('version', 1, 'accion', a.accion, 'solicitud', v_id, 'repetida', true,
                              'resultado', privado.proyectar(ctx, s.resultado));
  end if;

  execute format('select %s($1, $2, $3)', a.funcion) into v_resultado using ctx, v_revision, v_datos;

  update public.solicitudes
     set resultado = v_resultado, completada = now(),
         ejecucion_id = nullif(v_resultado ->> 'ejecucion_id', '')::uuid
   where clave = v_id;

  return jsonb_build_object('version', 1, 'accion', a.accion, 'solicitud', v_id, 'repetida', false,
                            'resultado', privado.proyectar(ctx, v_resultado));
end $$;

-- ---------------------------------------------------------------------------
-- 8. Leer
-- ---------------------------------------------------------------------------

create or replace function privado.leer(p_consulta jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  ctx jsonb := privado.contexto();
  c privado.consultas%rowtype;
  v jsonb;
begin
  if ctx is null then
    perform privado.fallar('sin_sesion', 'Tu sesión terminó o tu usuario no está activo. Vuelve a entrar.', 401);
  end if;
  if jsonb_typeof(p_consulta) is distinct from 'object' or jsonb_typeof(p_consulta -> 'tipo') is distinct from 'string' then
    perform privado.fallar('invalida', 'La consulta no tiene la forma esperada.', 422);
  end if;
  select * into c from privado.consultas where tipo = p_consulta ->> 'tipo';
  if not found then
    perform privado.fallar('invalida', 'Esa consulta no existe.', 422);
  end if;
  if not privado.es_al_menos(c.rol_minimo) then
    perform privado.fallar('sin_permiso', 'Tu rol no permite esta consulta.', 403);
  end if;

  execute format('select %s($1, $2)', c.funcion) into v using ctx, p_consulta;
  return jsonb_build_object('version', 1, 'tipo', c.tipo) || privado.proyectar(ctx, coalesce(v, '{}'));
end $$;

--  La consulta que salva una confirmacion incierta: tras una recarga o una
--  caida de red, el cliente pregunta por SU solicitud. Nula significa que no se
--  completo nunca y se puede reintentar con el mismo id.
create or replace function privado.consultar_solicitud(ctx jsonb, q jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := privado.dato_uuid(q, 'id', true);
  s public.solicitudes%rowtype;
begin
  select * into s from public.solicitudes
   where clave = v_id::text and perfil_id = (ctx ->> 'perfil')::uuid;
  if not found then
    return jsonb_build_object('solicitud', null);
  end if;
  return jsonb_build_object('solicitud', jsonb_build_object(
    'id', s.clave, 'accion', s.operacion, 'completada', s.completada, 'resultado', s.resultado));
end $$;

insert into privado.consultas (tipo, funcion, rol_minimo, descripcion) values
  ('solicitud', 'privado.consultar_solicitud', 'operario', 'Estado de una solicitud propia, para resolver una respuesta incierta')
on conflict (tipo) do update
  set funcion = excluded.funcion, rol_minimo = excluded.rol_minimo, descripcion = excluded.descripcion;

-- ---------------------------------------------------------------------------
-- 9. Lo que publica la API
-- ---------------------------------------------------------------------------
--  Las dos funciones de `public` son `security invoker`: no saltan nada por su
--  cuenta. Llaman a las de `privado`, que si son `definer` y viven fuera del
--  esquema publicado (misma regla que las vistas de 0008).

create or replace function public.operacion_ejecutar(p_solicitud jsonb)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select privado.ejecutar(p_solicitud)
$$;

create or replace function public.operacion_leer(p_consulta jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select privado.leer(p_consulta)
$$;

revoke all on function public.operacion_ejecutar(jsonb), public.operacion_leer(jsonb) from public, anon;
grant execute on function public.operacion_ejecutar(jsonb), public.operacion_leer(jsonb) to authenticated;

revoke all on function privado.fallar(text, text, integer), privado.contexto(),
  privado.dato_texto(jsonb, text, boolean, integer), privado.dato_numero(jsonb, text, boolean, integer),
  privado.dato_uuid(jsonb, text, boolean), privado.dato_fecha(jsonb, text, boolean),
  privado.sin_dinero(jsonb), privado.proyectar(jsonb, jsonb),
  privado.anotar(jsonb, text, date, text, jsonb, jsonb),
  privado.ejecutar(jsonb), privado.leer(jsonb), privado.consultar_solicitud(jsonb, jsonb)
  from public, anon, authenticated;

--  Solo las dos puertas. Todo lo demas lo llaman ellas, como su dueño.
grant execute on function privado.ejecutar(jsonb), privado.leer(jsonb) to authenticated;
