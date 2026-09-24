# Contrato RPC de operación · Claude · 2026-09-23 · v1 (para el cliente de Codex)

Responde a [CLIENTE-REMOTO](CLIENTE-REMOTO.md) y conserva su forma. El cliente solo habla con dos RPC y nunca escribe directamente en las tablas.

## Rutas
- `POST /rest/v1/rpc/operacion_ejecutar` con cuerpo `{ "p_solicitud": { id, accion, revision, datos } }`.
- `POST /rest/v1/rpc/operacion_leer` con cuerpo `{ "p_consulta": { tipo, ... } }`.
- `crearOperacionRemota({ lectura: 'operacion_leer', comando: 'operacion_ejecutar' })`.

## Solicitud
- `id`: un UUID por cada intención del usuario. Se conserva entre reintentos.
- `accion`: una de las de la tabla. Cualquier otra devuelve 422.
- `revision`: la revisión que la pantalla leyó de lo que va a cambiar; 0 si se crea algo nuevo.
- `datos`: un objeto. El servidor **ignora** el autor, la sede, los costos y el costeo que vengan del navegador, porque los obtiene de la sesión y de la base.

## Respuesta correcta (HTTP 200)
`{ version: 1, accion, solicitud: id, repetida: bool, resultado: {...} }`. `repetida = true` significa que esa solicitud ya estaba hecha y se devuelve el mismo resultado, sin repetir nada. Quien no es gerencia recibe el resultado **sin dinero**: se quitan costos, precios y costeo, aunque la solicitud se hubiera hecho con otro rol.

## Errores
Cuerpo `{ code, message }`, con un `message` listo para mostrar.
| HTTP | code | Qué hace el cliente |
|---|---|---|
| 401 | `sin_sesion` | Sesión caducada o perfil inactivo. Renueva una vez; si sigue, pide volver a entrar. |
| 403 | `sin_permiso` | El rol no alcanza. Muestra el mensaje y no reintenta. |
| 404 | `no_existe` | Lo que se quería cambiar ya no existe. Relee. |
| 409 | `conflicto` | La revisión cambió. Relee y deja que el usuario repita. |
| 409 | `solicitud_reutilizada` | Ese `id` ya se usó con otros datos. Es un fallo del cliente: crea otro `id`. |
| 422 | `invalida` | Validación. Muestra `message` y no reintenta. **Hoy el transporte lo trata como `servidor`: falta mapearlo.** |

Un fallo de red o un 5xx en un comando deja el resultado **incierto**. Se consulta con `{tipo:'solicitud', id}` antes de ofrecer repetirlo.

## Acciones (v1 completa)
| accion | rol mínimo | revision | datos |
|---|---|---|---|
| `registrar_lote` | obrador | 0 | `ingrediente_id` o `ingrediente` (nombre; si no está en el catálogo entra con la unidad de compra, 0026), `unidad` (GR KG MG LT ML UND TANDA CM), `peso_compra` > 0, `costo_compra` ≥ 0, `origen` (`compra`\|`conteo_inicial`), y opcionales: `existencia` (solo en conteo inicial, ≤ peso), `presentacion`, `marca`, `proveedor`, `lote_proveedor`, `vencimiento`, `fecha_compra` (≤ hoy), `equivalencias` `{ML,UND,TANDA,CM: gramos>0}`, `motivo` |
| `ajustar_lote` | obrador | revisión del lote | `lote_id`, `existencia` (el conteo nuevo, 0 ≤ x ≤ peso), `tipo` (`ajuste`\|`merma`), `motivo` |
| `corregir_lote` | obrador (el costo, solo gerencia) | revisión del lote | `lote_id`, `motivo`, y lo que cambie: `marca`, `proveedor`, `presentacion`, `lote_proveedor`, `vencimiento`, `fecha_compra` (≤ hoy), `costo_compra` (403 si no es gerencia). Peso, ingrediente y unidad no se corrigen: se registra otro lote. El costo nuevo solo cuenta para lo que se costee después (0026) |
| `fijar_equivalencia` | obrador | revisión del lote | `lote_id`, `medida` (ML UND TANDA CM), `gramos` > 0, `motivo` |
| `fijar_receta` | obrador | revisión del plan (0 si el día no tiene) | `fecha`, `receta_id`, `tandas` (0 la quita; 0,05–100 con 3 decimales; nunca menos de lo producido), `partidas?` [tandas que sumen lo pendiente], `motivo?` |
| `iniciar_preparacion` | operario (solo lo asignado; obrador y superiores, cualquiera) | 0 | `fecha` (≤ hoy), `receta_id` |
| `cancelar_preparacion` | operario (misma regla) | 0 | `fecha`, `receta_id` |
| `asignar_preparacion` | obrador | 0 | `fecha`, `receta_id`, `persona_id` (null = sin asignar; activo, de la sede y del área de la receta) |
| `confirmar_receta` | operario (misma regla que iniciar) | revisión del plan (la de la cotización) | `fecha` (≤ hoy), `receta_id`, `huella` (la de la cotización), `motivo?` |
| `guardar_nota` | operario (crear/cambiar: obrador; quien la tiene asignada solo cambia `hecha`) | revisión de la nota (0 si es nueva) | `id?`, `fecha`, `tipo` (tarea pendiente recomendacion felicitacion), `texto` (1–280), `area?` o `persona_id?` (nunca los dos), `hecha?` |
| `eliminar_nota` | obrador | revisión de la nota | `id` |
| `guardar_resultado` | operario (su primera medición; corregir o la de otro: obrador) | revisión del resultado (0 si es nuevo) | `ejecucion_id`, `receta_id`, `vendible`, `rechazado`, `unidad?` y `esperado?` (se ignoran si el nombre dice «X n UND»), `merma_preparacion_gr?`, `merma_coccion_gr?`, `motivo` (obligatorio si hay pérdida, diferencia o corrección) |
| `guardar_receta` | obrador | revisión de la receta (0 si es nueva) | `receta_id?`, `nombre`, `categoria`, `metodo?` (texto con saltos de línea), `componentes` [{`nombre?`, `items` [{`ingrediente` (nombre), `cantidad` > 0 (3 decimales), `unidad`}]}], `motivo?`. Reemplaza la receta entera y deja una versión. Un ingrediente nuevo entra al catálogo |
| `activar_receta` | obrador | revisión de la receta | `receta_id`, `activa` (bool), `motivo` |
| `fijar_meta` | gerencia | 0 | `clave` (presupuestoMensual cumplimientoPlan rendimientoMinimo rechazoMaximo coberturaMinima avisoVencimiento alzaPrecio), `valor` (en su rango; solo el presupuesto admite null) |

- `confirmar_receta` va en **una sola transacción**: bloquea el plan y los lotes, recalcula, crea la ejecución con el costeo congelado, un consumo y una salida por lote, descuenta saldos y marca las partidas. Si la huella no coincide, 409, y hay que volver a cotizar. Si faltan ingredientes o equivalencias, 422, y no se toca nada. El resultado trae `ejecucion_id`.
- El plan guarda cada receta **congelada** en sus partidas. Una partida con `ejecucion_id` ya está producida. Un día sin recetas y sin producción no conserva plan.
- Una unidad de compra sin conversión a gramos se rechaza, igual que en `validarLote`: LT y ML necesitan `ML`; UND, TANDA y CM necesitan la suya.
- Dar de baja un lote es `ajustar_lote` con `existencia: 0` y su motivo. Un lote nunca se borra.

## Consultas (v1)
- `{tipo:'solicitud', id}` → `{version, tipo, solicitud: {id, accion, completada, resultado}|null}`. Solo devuelve solicitudes propias. `null` significa que nunca llegó a confirmarse y se puede reintentar con el mismo `id`.
- `{tipo:'bodega', con_existencia?: bool (por defecto true), despues?: codigo, limite?: 1–200 (por defecto 100)}` → `{version, tipo, lotes:[...], siguiente: codigo|null}`. Cada lote trae `id, codigo, revision, ingrediente_id, ingrediente, unidad, peso_compra, existencia, vencimiento, fecha_compra, presentacion, marca, proveedor, lote_proveedor, equivalencias{}`. Solo gerencia recibe además `costo_compra` y `valor_unitario`.
- `{tipo:'dia', fecha}` → `{version, tipo, fecha, plan: null | {id, fecha, revision, responsable, motivo, actualizado, recetas:[{receta_id, codigo, nombre, categoria, tandas, producido, pendiente, partidas[], estado: pendiente|en_preparacion|lista, preparacion: {iniciada, iniciada_por, asignado:{id,nombre,area}}|null}]}}`.
- `{tipo:'cotizacion', fecha, receta_id}` → `{version, tipo, fecha, receta_id, plan_revision, pendiente, costeo, huella, listo}`. Tiene la misma forma que `costearPlan`, calculado por el servidor sin bloquear. Quien no es gerencia la recibe sin dinero, pero con la misma `huella`. `listo = false` significa que no se puede confirmar.
- `{tipo:'notas', fecha}` → `{version, tipo, fecha, notas:[{id, fecha, tipo, texto, area, persona, hecha, revision, creada, actualizada, autor, cambiada_por}]}`, en el orden del panel.
- `{tipo:'producido', fecha}` → `{version, tipo, fecha, ejecuciones:[{id, instante, receta_id, nombre, area, tandas, responsable, autor_id, rendimiento_previsto:{cantidad,unidad}, resultado|null, costo_total (solo gerencia)}]}`.
- `{tipo:'metas'}` → `{version, tipo, metas:{clave:{valor, fijada, desde, responsable}}}`. Lo que nunca se fijó trae el valor base. `presupuestoMensual` y `alzaPrecio` solo llegan a gerencia.
- `{tipo:'recetario', incluir_inactivas?}` → `{version, tipo, recetas:[{id (código R###), nombre, categoria, metodo, componentes, receta_id, revision, activa, actualizado}], ingredientes:[{id, nombre, unidad}]}`. Tiene la misma forma que `recipes.json` y **sustituye a `data/recipes.json` y a «Publicar»**.
- `{tipo:'operacion', desde, hasta}` (operario; rango ≤ 400 días) → el documento que ya usa el núcleo del cliente: `{version:1, operacionVersion:1, secuencia:0, desde, hasta, lotes, planes[{fecha, revision, responsable, motivo, actualizado, entradas[{recipe, factor, partidas}]}], ejecuciones[{id, fecha, planRevision, instante, responsable, motivo, area, recetaId, autor, costeo, entradas[{recipe, factor}]}], resultados, notas, preparaciones, eventos}`. Los lotes llevan la forma de `normalizarLote`; las compras se derivan como eventos `compra`. Quien no es gerencia lo recibe sin `costoCompra` ni `costeo`: el cliente debe tomar `costeo` ausente como `{costoTotal: 0, lineas: []}` (0026).
- `{tipo:'versiones_receta', receta_id}` (obrador) → `{version, tipo, receta_id, versiones:[{version, creada, responsable, motivo, contenido}]}`.
