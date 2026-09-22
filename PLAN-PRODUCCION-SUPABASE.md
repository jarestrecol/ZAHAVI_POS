# Plan de trabajo: operación central y evolución de producción

Fecha: 22 de septiembre de 2026. Autor: Codex. Revisión de Claude: pendiente.

Prioridad previa autorizada: versionar el estado e historial del código en
`git@github.com:jarestrecol/ZAHAVI_POS.git`, rama `main`, excluyendo secretos,
datos operativos privados y artefactos regenerables. Después continuar fase 0.
GitHub conserva código y migraciones; no sustituye Supabase ni respalda localStorage.

Este plan responde al orden solicitado por el usuario: diagnóstico inicial, fases
1–5 de centralización y validación, y fases 6–10 de evolución funcional. Es una
entrega de planificación, no evidencia de una migración aplicada. Los datos del
recetario y los costos de producción ya confirmados se conservan.

## Estado comprobado y límites del diagnóstico

| Elemento | Evidencia actual | Qué falta comprobar |
|---|---|---|
| Esquema previsto | El repositorio contiene migraciones 0001–0012. La 0003 define proveedores, lotes, producciones, movimientos, consumos y precios. | Consultar el catálogo remoto, migraciones realmente aplicadas y datos existentes. |
| Operación de la aplicación | `src/app/produccion.js` llama a `transaccionOperacion`; `src/core/bitacora.js` guarda `zahavi_almacen_v1` con `storage.js` en el navegador. | Obtener el documento real de cada navegador usado en la operación, no las copias de las pruebas. |
| Auditoría SQL prevista | Movimientos inmutables y costos congelados están contemplados en 0003; las migraciones posteriores contienen permisos y funciones privadas. | Probar su comportamiento y revisar todos los permisos efectivos del servidor. |
| Reglas recientes | Conversiones por ingrediente/lote, partidas, resultados y demo existen en el cliente. | Extender el contrato SQL: el esquema antiguo no representa por sí solo toda la operación actual. |
| Informes | `src/core/bi/hechos.js` adapta la operación local al panel. | Proveer los mismos hechos desde el servidor, sin recalcular costos antiguos. |
| Acceso de esta sesión | No hay herramienta administrativa de Supabase disponible en el catálogo actual. | Habilitar acceso al proyecto para la auditoría remota; no pedir ni copiar secretos en el chat. |

Las entregas previas registran configuración remota de usuarios, equipo y recetas.
Son antecedentes, no una nueva comprobación del estado remoto. Tampoco se ha leído
el inventario real del navegador del usuario en esta planificación.

## Orden, entregables y puertas de avance

| Fase | Trabajo | Entregable para revisar | Condición de salida |
|---|---|---|---|
| 0 | Auditar Supabase y fuentes locales | Inventario de datos, diferencias y respaldo recuperable | Fuentes identificadas, acceso comprobado y conflictos enumerados |
| 1 | Separar demo y realidad | Clasificación, entorno de pruebas y reporte de casos mixtos | Ningún ejemplo entra inadvertidamente a inventario o indicadores reales |
| 2 | Preparar y ensayar la migración | Importador repetible y conciliación en entorno aislado | Saldos, costos, vínculos e historia coinciden; repetir no duplica |
| 3 | Confirmar y consumir en servidor | Operaciones transaccionales e integración del cliente | Sin duplicados ni saldos negativos bajo concurrencia |
| 4 | Probar dos dispositivos y permisos | Evidencia de pruebas y puesta en servicio controlada | Ambos equipos ven la misma operación; permisos efectivos en servidor |
| 5 | Consolidar historial y recuperación | Consultas por periodo, respaldo, restauración y monitoreo | Historia consultable y recuperación demostrada |
| 6 | Preparaciones y subrecetas | Producción y consumo de lotes intermedios | Costo por gramo y existencias sin doble descuento |
| 7 | Consumo previsto y real | Salidas adicionales, devoluciones y diferencias auditadas | Consumo y costo ajustado conciliados con cada ejecución |
| 8 | Producto terminado | Lotes vendibles con entradas y salidas | Saldo trazable desde elaboración hasta entrega |
| 9 | Costo completo | Desglose de materia prima, trabajo, energía y empaque | Reparto verificable sin duplicar costos |
| 10 | Cierre del día | Flujo de revisión, cierre y reapertura con motivo | Pendientes explícitos y cierre versionado |

La fase 2 importa primero en un entorno de ensayo o área de preparación sin uso
operativo. No habilita escrituras reales antes de las fases 3 y 4. La fase 5 amplía
el historial y su operación; los respaldos y garantías mínimas empiezan en fase 0.

## Fase 0 — Revisar lo existente y proteger las fuentes

1. Consultar el proyecto correcto: migraciones, tablas, columnas, restricciones,
   índices, funciones, vistas, políticas RLS, privilegios, usuarios activos y sede.
   Registrar cantidades y periodos de datos, evitando exponer datos personales.
2. Contrastar el remoto con las migraciones locales. Reutilizar tablas compatibles;
   proponer migraciones incrementales para las diferencias, sin recrear la base.
3. Inventariar cada origen utilizado: computador, celular, tableta, navegador y
   dirección. `localhost`, `127.0.0.1` y distintos puertos pueden contener copias
   separadas. Un login común no demuestra que compartan inventario.
4. Obtener una copia íntegra de cada operación: lotes, compras, equivalencias,
   planes, partidas, preparaciones, asignaciones, notas, ejecuciones, resultados,
   correcciones y eventos. Inventariar también metas del panel y versiones de receta.
   No incluir PIN, tokens de sesión ni claves en el paquete de migración.
5. Crear manifiesto con identificador de origen, versión, fecha, secuencia, conteos
   y huella del archivo. Guardar originales inmutables fuera de rutas públicas y
   del repositorio. Respaldar el destino y ensayar la recuperación en otra base.
6. Comparar ingredientes y recetas por identificadores y contenido. Mantener
   mapeos explícitos; no unir nombres similares ni autores homónimos automáticamente.
7. Emitir informe de diferencias: fechas, unidades, pesos, precios, duplicados,
   referencias ausentes y acciones necesarias. Incluir harina/mantequilla con miles
   de UND y equivalencias faltantes; no corregir fórmulas como parte de la migración.

**Aceptación:** todas las fuentes conocidas inventariadas; copia recuperable;
conteos por origen; conflictos visibles. Un dato inaccesible queda pendiente de
inspección, nunca se interpreta como una bodega vacía.

## Fase 1 — Separar demo de datos reales

- Clasificar en real, demo y pendiente de clasificación mediante metadatos y
  procedencia del historial. Un nombre de proveedor o un precio bajo no bastan.
- Recorrer dependencias: una producción puede haber consumido lotes reales y demo.
  Marcarla como mixta y conservar sus trazas; borrar el lote demo no resuelve esa
  mezcla ni devuelve lo consumido de un lote real.
- Presentar los casos ambiguos y mixtos para decisión concreta. Conservar la copia
  original y sus importes. No reconstruir costos reales utilizando precios demo.
- Mantener la demo en un entorno aislado, con configuración visible y credenciales
  separadas del entorno operativo. El aislamiento debe impedir consumos cruzados
  por servidor; un filtro o una etiqueta en la pantalla no son suficientes.
- Dejar los ejemplos de BI en memoria, como ahora. Excluir ejemplos y operaciones
  mixtas no conciliadas de indicadores reales, mostrando la cobertura excluida.
- Bloquear la carga de demo en el almacén real después del cambio de sistema.

**Aceptación:** cargar, producir y retirar demo no cambia saldos reales; toda
ejecución conserva sus vínculos. Ningún registro dudoso se borra o se presenta como
real por defecto. Los saldos reales afectados por pruebas se concilian con movimientos
explícitos y motivo, sin reescribir historia.

## Fase 2 — Migrar bodega, producción e historial en ensayo

**Contrato de datos que debe conservarse:**

| Origen local | Destino propuesto, ajustado tras la auditoría |
|---|---|
| Lotes y compras | Lotes con presentación y unidad de compra; factores versionados; movimientos de entrada, salida y corrección |
| Planes y partidas | Plan por sede/día, líneas de receta y partidas identificables, revisiones y fórmula congelada |
| Preparaciones y asignaciones | Estados, responsables y tiempos de preparación vinculados al plan |
| Ejecuciones y costeo | Confirmación, consumos por lote, gramos, fracción de unidad comprada, factores usados y costo histórico |
| Resultados | Esperado, obtenido, vendible, rechazado, mermas y revisiones vinculadas a la confirmación |
| Notas y eventos | Destinatarios, estados, fechas, motivos, actor declarado original y procedencia |
| Metas e informes | Metas versionadas y hechos compatibles con el panel existente |

El importador tendrá modo de diagnóstico sin escritura y modo de ensayo. Usará
un identificador de importación y correspondencias únicas de origen/entidad/id.
La misma entrada repetida no crea otra compra ni otro consumo. Dos copias de un
respaldo no cuentan como dos negocios distintos; se detectan huellas y ancestros
compartidos. Los cambios divergentes se concilian, no se suman ni se pisa el más viejo.

Los ids legibles locales, como L001, no son únicos entre dispositivos. Se conservará
su referencia original y se asignará identidad remota sin colisiones. Los vínculos
de fórmulas, lotes históricos retirados y resultados deben poder resolverse aunque
ya no estén en la lista actual del cliente.

Para saldos: reconstruir movimientos cuando exista evidencia completa y contrastar
con el saldo al corte. Si una apertura anterior no está documentada, registrar un
saldo inicial de migración con su origen y limitación. No cargar saldo actual como
entrada y volver a descontar sobre él todos los consumos históricos. Mantener la
historia importada separada de una apertura cuando no pueda reproducirse como libro.

Para costos: preservar valor y precisión originales. El esquema actual tiene
cantidades a tres decimales y costos calculados a dos; se debe definir precisión
decimal suficiente para equivalencias y fracciones pequeñas, y campos de valor
histórico importado cuando sea necesario. No recalcular ejecuciones con los precios
actuales ni aceptar diferencias silenciosas por redondeo.

Para autoría: conservar el responsable declarado en el origen y marcarlo como
histórico importado. Registrar aparte quién realiza la importación, autenticado
por el servidor. No atribuir autenticación retroactiva a eventos locales.

**Conciliación obligatoria:** conteos, referencias, saldos por lote en unidad de
compra y gramos cuando exista equivalencia, costos por ejecución/receta/día/área,
partidas pendientes y resultados. Todas las diferencias deben quedar explicadas;
ningún costo incompleto se convierte a cero. Repetir la importación y comprobar
cero duplicados. Corregir un precio actual y comprobar que el histórico no cambia.

## Fase 3 — Confirmación y descuento como una sola operación

Implementar una operación de base de datos que autentique al usuario, compruebe
sede, rol, turno y asignación, y valide la revisión del plan. El navegador solicita
la operación; no impone el costo, el actor ni un saldo calculado por él.

Dentro de una misma transacción:

1. Validar una clave de solicitud persistente y su contenido. Si ya fue completada,
   devolver la misma ejecución; si se reutiliza para otra solicitud, rechazarla.
2. Bloquear el plan/partida correspondiente y comprobar lo ya confirmado, también
   cuando dos solicitudes tengan claves distintas. Consumir solo la parte pendiente.
3. Serializar los cambios de inventario por sede/ingrediente y bloquear los lotes
   en orden estable. Compras, bajas, ajustes y demás escritores seguirán el mismo
   protocolo; no basta bloquear únicamente el botón de producción.
4. Recalcular gramos y FEFO con reglas equivalentes a las actuales. Excluir lotes
   vencidos, futuros y de otro entorno; agua de proceso sin salida de bodega.
   Equivalencias ausentes o contradictorias generan un error por ingrediente.
5. Comparar la proyección vigente cuando el costo o los lotes hayan cambiado y
   mostrar la diferencia antes de una nueva confirmación; no aceptar una vista vieja.
6. Crear ejecución, consumos, movimientos, costos congelados y auditoría juntos.
   Actualizar avance y revisión. Un error revierte todo el conjunto.

Si la conexión cae después de guardar, el cliente consulta o reintenta la misma
solicitud. No informa fracaso definitivo ni crea otra confirmación sin resolver
el estado anterior. La idempotencia evita repetir una solicitud y la validación
del estado del plan evita repetir la misma producción con otra clave.

Los permisos se prueban en API y base de datos. RLS limita lectura por sede/rol;
las columnas de dinero se protegen además mediante permisos y respuestas específicas.
RLS por sí sola no oculta columnas. Se cierran escrituras directas que permitan
eludir el procedimiento transaccional. Las funciones con privilegios elevados
requieren permisos mínimos, validaciones explícitas y `search_path` controlado.
Referencia: [funciones de Supabase](https://supabase.com/docs/guides/database/functions)
y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Integración:** casos de uso remotos para bodega, planes, asignaciones, notas y
resultados; lecturas paginadas; adaptador remoto para hechos de BI. El recetario
conserva sus datos y el plan congela su versión. Nunca se cambia de servidor a
escritura local automáticamente ante un error. Sin conexión: consulta de la última
copia indicando su fecha; confirmación y movimientos no disponibles. Los borradores
no se presentan como producción registrada.

**Aceptación:** stock insuficiente concurrente, doble toque, reintentos, revisión
vieja, fallo intermedio y cambios de equivalencia no generan saldos negativos,
costos parciales ni doble consumo. Se prueba contra PostgreSQL real de ensayo,
no únicamente contra simuladores de navegador. Los bloqueos deben cubrir todos
los escritores; referencia de [PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html).

## Fase 4 — Dos dispositivos, permisos y cambio de sistema

Probar dos sesiones independientes contra la misma base de ensayo y completar
la aceptación en dos dispositivos físicos. Los navegadores simulados no sustituyen
la prueba física ni se reportan como tal.

| Caso | Resultado esperado |
|---|---|
| A programa/asigna; B consulta | B ve datos confirmados del servidor y la persona ve su trabajo |
| A confirma; B actualiza | Mismo saldo, ejecución y costo según su rol |
| A y B confirman la misma partida | Una sola confirmación y un solo conjunto de consumos |
| Dos recetas compiten por el último lote | Nunca stock negativo; la segunda recibe faltante o conflicto |
| Se pierde la respuesta tras guardar | Reintento devuelve la ejecución existente |
| B edita una revisión antigua | Conflicto visible, sin sobrescribir cambios de A |
| Sesión vencida o perfil desactivado | Servidor rechaza cambios aunque el cliente siga abierto |
| Operario/obrador piden precios directamente | API no entrega importes; no basta ocultar una columna visual |
| Llamada de otra sede o sin sesión | Sin acceso a datos o acciones no autorizadas |
| Navegador sin conexión | Estado desactualizado visible; sin descuento local alternativo |

Matriz base: operario confirma lo asignado y registra su primer resultado según
las reglas existentes; obrador programa/asigna y gestiona la operación sin dinero;
gerencia/admin acceden a costos. El hallazgo de costos visibles al obrador en Bodega
se resuelve antes de activar. Si hay recepción física por obrador, separar cantidad
recibida de valoración por gerencia; no ampliar permisos de dinero por conveniencia.

El corte definitivo se realiza cuando las fases 1–4 pasen:

1. Registrar ventana y responsables; detener nuevas escrituras locales en todos
   los orígenes conocidos y cerrar clientes antiguos. Un servidor nuevo no puede
   impedir que una versión antigua siga guardando en su propio navegador.
2. Tomar respaldo final, verificar secuencias y repetir el ensayo con la última
   copia. Importar bajo modo de mantenimiento y conciliar antes de abrir escrituras.
3. Activar una sola fuente operativa: Supabase. Conservar el origen local como
   evidencia de solo lectura. Mostrar claramente conexión y versión vigentes.
4. Ejecutar comprobación controlada de lectura/operación y verificar desde el
   segundo equipo. Cualquier dato de prueba queda en el entorno aislado.
5. Mantener monitoreo de errores y una ruta de soporte durante el primer cierre.

**Recuperación:** antes de nuevas operaciones remotas, una importación fallida se
revierte como unidad o se restaura el destino de ensayo y se repite. Después de
operar en remoto, no volver a habilitar una copia local antigua: detener escrituras,
preservar los movimientos nuevos y reconciliar o recuperar hacia adelante. Una
restauración total requiere considerar todas las escrituras posteriores al respaldo.

## Fase 5 — Historial seguro, compartido y recuperable

- Consultar día, semana, mes y año con filtros de receta, área y responsable,
  paginación e índices. Conservar detalle de lotes y costos originales.
- Mantener una auditoría por evento/revisión y referencias estables, evitando
  duplicar documentos completos en cada movimiento.
- Conectar el panel de gestión al mismo origen; distinguir lo importado, lo medido
  y lo pendiente. Registrar cambios de metas con autor y fecha.
- Verificar respaldo disponible según el plan contratado, retención y permisos;
  programar exportación privada complementaria cuando corresponda. Si hay archivos
  adjuntos, incluirlos explícitamente: el respaldo SQL no incluye los objetos de
  Storage. Referencia: [respaldos de Supabase](https://supabase.com/docs/guides/platform/backups).
- Ensayar restauración fuera del entorno activo y comprobar conteos, permisos y
  costos. Acordar pérdida máxima tolerable de datos y tiempo de recuperación con
  gerencia; no prometer recuperación puntual sin verificar servicio y configuración.

**Aceptación:** mismo informe desde dos equipos, navegación de periodos amplios
sin cargar toda la historia, restauración demostrada y costos antiguos invariables.

## Fase 6 — Preparaciones internas y subrecetas

Identificar qué ingredientes son preparaciones internas y asociarlos explícitamente
a una fórmula versionada. Las fórmulas faltantes requieren datos de la panadería;
no se deducen del nombre ni se inventan cantidades. Los vínculos operativos se
guardan aparte y no alteran las recetas originales. Rechazar ciclos de subrecetas.

Cada elaboración intermedia consume sus materias primas una vez y genera un lote
con gramos útiles obtenidos, costo, fecha, conservación/vencimiento definidos por
el negocio y trazabilidad. Una receta final consume el lote intermedio, no vuelve
a descontar las materias primas que ya lo originaron. Mostrar disponible y faltante
por preparar, sin contabilizar dos veces lo preparado y lo pendiente.

**Aceptación:** elaborar 5.000 g de crema y consumir 800 g deja 4.200 g; el costo
unitario se calcula sobre rendimiento útil medido. Rechazo/merma y cero rendimiento
no producen división por cero. Una corrección posterior al consumo genera ajuste
trazable, no modifica silenciosamente el costo de productos ya confirmados.

## Fase 7 — Consumo previsto frente al real

Conservar la previsión original, registrar salidas adicionales y devoluciones por
lote con autorización/motivo, y mostrar la diferencia en gramos y COP. Una devolución
no supera lo realmente salido menos lo ya devuelto y debe identificar material
apto para reingresar. Un sobrante transformado no regresa como materia prima cruda.

No descontar otra vez una merma incluida en los ingredientes ya consumidos. La
evaporación medida es una pérdida de masa, no otra salida de agua o harina. Los
eventos de ajuste agregan efectos al costo de la ejecución conservando su costo
original y las revisiones. Al modificar rendimiento se revisan lotes derivados
ya consumidos o entregados antes de cambiar disponibilidades.

**Aceptación:** previsto 1.000 g, entrega adicional 100 g, devolución válida 50 g:
consumo neto 1.050 g. Cada ajuste usa el costo del lote correspondiente; se ve la
diferencia de 50 g y no se duplica merma ni producción.

## Fase 8 — Inventario de producto terminado

Generar entrada de vendibles al registrar/liberar el resultado, vinculada una sola
vez a la ejecución y a su revisión. Registrar lote, producto, medida de salida,
fecha de elaboración, vencimiento informado, ubicación, costo y estado disponible,
retenido o rechazado. No inventar vidas útiles.

Agregar entregas, transferencias, bajas y devoluciones autorizadas. No constituye
un módulo de ventas: se registra salida y destino, sin inventar ingresos. Las
correcciones de resultados generan diferencias auditadas y respetan lo ya entregado.

**Aceptación:** 100 obtenidos, 95 vendibles, 5 rechazados; entran 95. Entregar 30
deja 65 disponibles. Repetir el registro no duplica la entrada. Todo lote permite
llegar a la receta y a los lotes de ingredientes que lo originaron.

## Fase 9 — Costo completo de producción

Agregar tiempo y tarifa de trabajo, uso y tarifa de energía, empaques y otros
conceptos aprobados, con vigencia y criterio de reparto. Diferenciar presupuesto,
medición y estimación. No obtener tarifas laborales o eléctricas de supuestos demo.

Costo completo por vendible = (materia prima neta + trabajo + energía + empaque
+ otros costos definidos) / cantidad vendible. Si no hay vendibles, mostrar el
costo consumido sin dividir. Si el empaque ya fue descontado como insumo no se
agrega por segunda vez. Igual control para costos heredados de subrecetas.

Los gastos compartidos de horno/equipo se reparten por una base documentada; la
suma asignada debe coincidir con el gasto distribuido. Conservar por separado la
materia prima histórica y el costo completo, con revisiones justificadas.

**Aceptación:** desglose verificable por lote/receta/área/día; tarifas nuevas no
reescriben periodos cerrados; no confundir costo con margen o precio de venta.

## Fase 10 — Cierre del día

Una pantalla muestra programación, confirmaciones, resultados sin medir, diferencias,
materiales por conciliar, lotes terminados y responsables. Cada aviso abre el punto
de resolución. Clasificar impedimentos reales de cierre y observaciones permitidas;
un dato faltante no debe completarse automáticamente con cero o con lo planeado.

Cerrar guarda revisión, responsable, instante y totales de referencia. La reapertura
requiere rol autorizado y motivo, preservando el cierre anterior y mostrando qué
cambió. La regla de día operativo usa America/Bogota. Los cambios concurrentes se
validan antes de cerrar y no pueden entrar silenciosamente tras el cierre.

**Aceptación:** una producción sin resultado aparece pendiente; cierre y reapertura
son auditables; los saldos e importes coinciden con inventario e informes centrales.

## Ejecución, coordinación y evidencia

- Codex implementa el bloque asignado y registra evidencia en COORDINACION.md;
  Claude queda como revisor propuesto, pendiente de registrar su revisión real.
  Las responsabilidades pueden alternarse con reservas explícitas de archivos.
- Entregar cada fase con migraciones/scripts, recorrido de usuario, pruebas y
  problemas pendientes. Sin fechas ficticias: estimar esfuerzo después del
  inventario remoto y de conocer el volumen/calidad de las fuentes reales.
- Para SQL: `npm.cmd run verificar-sql` y `npm.cmd run probar-sql` en PostgreSQL
  de ensayo. El análisis de texto no sustituye pruebas de transacciones y RLS.
- Para reglas: pruebas de conversiones, producción, almacén, resultados, calendario
  e informes/BI; para interfaz: Playwright pertinente, build y capturas móvil,
  tableta y escritorio. Las pruebas del contrato de servidor deben enviar llamadas
  sin la interfaz y cubrir permisos denegados y concurrencia real.
- Los tres fallos documentales previos del verificador general se registran aparte
  y se coordinan con COORD-001; no se confunden con pruebas aprobadas de la migración.
- Preservar cambios ajenos, recetario y versiones históricas. Esta planificación
  no publica la aplicación, no hace push y no ha modificado servicios remotos.

## Próximo entregable

Informe de fase 0 con: inventario remoto verificado, inventario por navegador,
respaldo comprobado, mapa de correspondencias, clasificación demo/real/mixta,
brechas de esquema y contratos del importador. La auditoría local está iniciada;
la remota y los datos reales siguen pendientes de acceso. Con ese informe se
implementa la separación de fase 1 y el ensayo de fase 2 sin inventar datos.
