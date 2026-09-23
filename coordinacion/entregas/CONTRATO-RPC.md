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

## Acciones (v1: bodega; las demás llegan en las capas siguientes)
| accion | rol mínimo | revision | datos |
|---|---|---|---|
| `registrar_lote` | obrador | 0 | `ingrediente_id`, `unidad` (GR KG MG LT ML UND TANDA CM), `peso_compra` > 0, `costo_compra` ≥ 0, `origen` (`compra`\|`conteo_inicial`), y opcionales: `existencia` (solo en conteo inicial, ≤ peso), `presentacion`, `marca`, `proveedor`, `lote_proveedor`, `vencimiento`, `fecha_compra` (≤ hoy), `equivalencias` `{ML,UND,TANDA,CM: gramos>0}`, `motivo` |
| `ajustar_lote` | obrador | revisión del lote | `lote_id`, `existencia` (el conteo nuevo, 0 ≤ x ≤ peso), `tipo` (`ajuste`\|`merma`), `motivo` |
| `fijar_equivalencia` | obrador | revisión del lote | `lote_id`, `medida` (ML UND TANDA CM), `gramos` > 0, `motivo` |

- Una unidad de compra sin conversión a gramos se rechaza, igual que en `validarLote`: LT y ML necesitan `ML`; UND, TANDA y CM necesitan la suya.
- Dar de baja un lote es `ajustar_lote` con `existencia: 0` y su motivo. Un lote nunca se borra.

## Consultas (v1)
- `{tipo:'solicitud', id}` → `{version, tipo, solicitud: {id, accion, completada, resultado}|null}`. Solo devuelve solicitudes propias. `null` significa que nunca llegó a confirmarse y se puede reintentar con el mismo `id`.
- `{tipo:'bodega', con_existencia?: bool (por defecto true), despues?: codigo, limite?: 1–200 (por defecto 100)}` → `{version, tipo, lotes:[...], siguiente: codigo|null}`. Cada lote trae `id, codigo, revision, ingrediente_id, ingrediente, unidad, peso_compra, existencia, vencimiento, fecha_compra, presentacion, marca, proveedor, lote_proveedor, equivalencias{}`. Solo gerencia recibe además `costo_compra` y `valor_unitario`.
