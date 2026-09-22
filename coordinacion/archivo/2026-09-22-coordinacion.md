# Zahavi: coordinación entre Codex y Claude

## 1. Acuerdo de trabajo

Este es el documento que **Codex y Claude deben leer completo cada vez que comiencen
o retomen trabajo en este proyecto**. Ambos lo actualizan para que el siguiente pueda
continuar sin depender del historial privado de una conversación.

Los dos tienen el mismo nivel de responsabilidad: **orquestador, arquitecto,
backend, frontend, QA y seguridad**. Ninguno queda limitado a una especialidad ni
subordinado al otro. Por tarea, uno implementa y el otro revisa; pueden alternarse.
La revisión debe cubrir también el trabajo previo del otro cuando afecte la tarea.

Las instrucciones del usuario y del entorno tienen prioridad. Este acuerdo sustituye
las instrucciones exclusivas antiguas de Claude, incluidos los requisitos de gstack.
`AGENTS.md` y `CLAUDE.md` son entradas breves a este mismo documento, sin reglas propias.

El intercambio es asíncrono mediante este archivo: escribir un mensaje no inicia una
sesión del otro agente ni demuestra que lo haya leído. Cada agente firma solo sus
propias acciones y revisiones. Si el otro no está disponible, se continúa el trabajo
independiente y se deja explícita la revisión cruzada pendiente.

## 2. Al comenzar y retomar

1. Leer este archivo, las instrucciones aplicables y la solicitud actual del usuario.
2. Revisar `git status --short`, rama y cambios relevantes. Los cambios existentes
   pueden pertenecer al usuario o al otro agente: no revertirlos ni limpiarlos.
3. Leer el estado, reservas y mensajes de abajo. Contrastar lo anotado con el código;
   una nota antigua no prueba el estado actual ni el de un servicio remoto.
4. Registrar tarea, autor, alcance y archivos que se van a editar en la tabla activa.
5. Abrir las referencias de la sección 5 necesarias para la tarea y definir qué
   comportamiento se espera y cómo se verificará antes de implementar.

### Coordinación de ediciones

- Reservar archivos antes de modificarlos. Si el otro tiene una reserva activa sobre
  el mismo archivo, dejar un mensaje y avanzar en archivos independientes. No asumir
  que una reserva venció solo por el paso del tiempo; confirmar entrega o abandono.
- La tabla es un acuerdo de coordinación, no un bloqueo técnico. Si las sesiones
  trabajan simultáneamente, preferir ramas/worktrees separados y acordar integración.
- Releer este documento justo antes de actualizarlo; aplicar cambios pequeños que
  preserven las entradas ajenas. No reemplazar todo el archivo por una copia antigua.
- No borrar conversaciones ni decisiones pendientes. Si el historial crece, archivar
  lo cerrado en `docs/` y conservar aquí un enlace, el estado y los pendientes.
- No hacer commit, push, despliegue ni cambios en servicios por el solo hecho de
  registrar una tarea aquí; respetar el alcance autorizado por el usuario.

## 3. Responsabilidades y revisión cruzada

| Rol de ambos | Implementación y revisión exigidas según el cambio |
|---|---|
| Orquestación | Alcance, dependencias, reservas, orden de tareas, entrega y bloqueos |
| Arquitectura | Separación de capas, contratos, persistencia y compatibilidad |
| Backend | Validación de servidor, integridad, concurrencia, errores y permisos |
| Frontend | Flujo claro en español, móvil, accesibilidad, foco y estados de error |
| QA | Casos de aceptación, regresiones, pruebas pertinentes y evidencia reproducible |
| Seguridad | Autorización, datos sensibles, entradas no confiables y límites de confianza |

Al entregar, el autor registra archivos, decisiones, pruebas con resultado y riesgos.
El otro inspecciona el diff y la evidencia, y ejecuta las comprobaciones que necesite.
Cada hallazgo lleva severidad, archivo/línea, reproducción, impacto y corrección
esperada. El autor responde; el revisor comprueba el arreglo y cierra el hallazgo.
Si una dimensión no aplica, se justifica brevemente en la revisión.

Estados: `en curso`, `bloqueada`, `lista para revisión`, `cambios solicitados`,
`revisada`. Una implementación probada puede estar lista para revisión sin estar
revisada. Nadie firma la aprobación del otro ni presenta su propia QA como revisión
independiente. Un desacuerdo se documenta con evidencia y alternativas; se consulta
al usuario solo si requiere una decisión de alcance o negocio que no esté autorizada.

## 4. Reglas técnicas y del negocio

- `src/core/`: reglas, cálculos y datos; sin vistas. `src/app/`: casos de uso.
  `src/views/`: interfaz y callbacks, sin escritura directa de estado o persistencia.
  `src/lib/`: utilidades. La composición une estas capas.
- Construir DOM con `src/lib/dom.js`; tratar textos de recetas y usuarios como texto,
  sin `innerHTML`, evaluación dinámica ni HTML no confiable.
- Mantener el contrato normal `{ ok: true, value }` / `{ ok: false, code, message }`
  y respetar las excepciones documentadas de hidratación y respuesta HTTP.
- Usar tokens de diseño, controles accesibles y preservar foco al repintar. Archivos
  en UTF-8; comentarios y mensajes al usuario en español.
- No alterar fórmulas reales ni convertir unidades implícitamente. Conservar fórmulas
  y costos históricos; las recetas pueden compartir nombre y diferir en rendimiento.
- Producción adicional descuenta solo lo pendiente. Aprobar requiere recalcular y
  validar existencias, cambios concurrentes y lotes; FEFO excluye los vencidos.
- Mantener trazabilidad de responsable, motivo, fecha, fórmula, lotes, cantidades,
  precio y costo; las acciones destructivas de inventario conservan su aprobación.
- El responsable declarado localmente no equivale a una identidad autenticada.
  La operación local no equivale a sincronización entre sedes.
- Validar entradas y autorización en servidor. No guardar secretos, claves, tokens,
  contenido de `.env.local` ni datos comerciales sensibles en este documento.
- Guardar y publicar recetas son acciones distintas; no incluir inventario ni
  precios de proveedores en el archivo público del recetario.
- Para centralizar: definir fuente única, reconciliación/migración y corte; aprobación
  y descuento deben ser atómicos en servidor. No mantener dos fuentes editables sin
  contrato de sincronización. Una migración escrita no prueba que esté aplicada.
- Al cambiar módulos de la aplicación, revisar carcasa/caché y build según los scripts
  actuales. Las reglas antiguas que negaban la existencia de Vite están desactualizadas.

## 5. Referencias y verificaciones

| Referencia | Cuándo leerla |
|---|---|
| [README.md](README.md) | Presentación y puesta en marcha; contrastar cifras antiguas con código |
| [MANUAL.md](MANUAL.md) | Uso por el equipo de la panadería |
| [docs/arquitectura.md](docs/arquitectura.md) | Capas, estado y contratos |
| [docs/datos.md](docs/datos.md) | Recetario, persistencia y esquema |
| [docs/plan-operacion-auditable.md](docs/plan-operacion-auditable.md) | Agenda, producción, bodega e historial locales |
| [docs/interfaz.md](docs/interfaz.md) | Diseño, interacción y accesibilidad |
| [docs/seguridad.md](docs/seguridad.md) | Autorización y límites de confianza |
| [docs/verificacion.md](docs/verificacion.md) | Comprobaciones y pruebas |
| [docs/operacion.md](docs/operacion.md) | Despliegue, diagnóstico y recuperación |
| [docs/roadmap.md](docs/roadmap.md) | Hoja de ruta; distinguir propuesta e implementación |
| [docs/defectos.md](docs/defectos.md) | Defectos anteriores y reglas para no repetirlos |

Los comandos vigentes se consultan en `package.json`. Elegir según alcance:

- Base: `npm run verificar`; artefacto de aplicación: `npm run build`.
- Producción/bodega: `npm run test:produccion`, `npm run test:almacen` y flujos
  pertinentes de Playwright (`npm run qa -- tests/agenda.spec.js`, por ejemplo).
- API/datos: `npm run test:api`, `npm run test:datos`.
- SQL: `npm run verificar-sql` y `npm run probar-sql` cuando cambie el esquema.
  Distinguir validación estática de comportamiento ejecutado contra PostgreSQL.
- Solo documentación: comprobar enlaces, coherencia e instrucciones de entrada;
  no hace falta ejecutar navegador/build salvo que el cambio lo justifique.

Registrar comando, fecha, resultado y limitación. Si no se ejecutó, decirlo. Un fallo
del entorno no es una prueba aprobada. No anunciar publicación por pasar pruebas.

## 6. Estado compartido para continuar

Actualizado por **Codex · 2026-09-15**. Evidencia: archivos locales; no se consultaron
servicios remotos en esta tarea.

- Hay numerosos cambios previos sin commit, incluidos archivos nuevos de agenda,
  producción e historial. Su autoría individual no se ha verificado. Preservarlos.
- `CLAUDE.md` antiguo, `.claude/settings.json` y `.claude/hooks/check-gstack.sh`
  ya estaban eliminados al iniciar. Se sustituye el documento antiguo por un enlace
  de entrada al acuerdo común; los hooks exclusivos siguen eliminados.
- `package.json` incluye Vite, build, Playwright y pruebas de producción/bodega.
- `src/core/bitacora.js` coordina escritura local con Web Locks. La documentación de
  operación describe planes, aprobaciones incrementales y costos históricos locales.
- `src/core/remote.js` usa la API de recetas. La centralización operativa y auditoría
  autenticada entre sedes siguen pendientes según la documentación local; verificar
  código y entorno antes de diseñar o afirmar que hay integración remota.
- Existe `db/migraciones/0007_acceso_interno.sql` sin seguimiento en Git. No se ha
  verificado su aplicación remota ni su funcionamiento en esta tarea.
- Algunas referencias antiguas conservan cifras y supuestos desactualizados. Usar
  código y comprobaciones actuales para decidir; corregir lo relevante en cada tarea.

### Tareas y reservas

| ID | Objetivo | Autor | Revisor | Estado | Archivos reservados |
|---|---|---|---|---|---|
| COORD-001 | Sustituir instrucciones exclusivas por acuerdo y relevo compartidos | Codex | Claude, pendiente de lectura | en curso | AGENTS.md, CLAUDE.md, COORDINACION.md, README.md, cabeceras de docs y scripts/verificar.mjs |
| SUPA-001 | Fase A de Supabase por MCP: registrar 0007, sede de producción y proyección de recetas | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-002 |
| SUPA-002 | Corregir el asesor de seguridad y rendimiento de Supabase sin cambiar quién ve qué | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-004 |
| AUTH-001 | Login con usuarios de Supabase (código + PIN) en lugar de la clave del equipo. Solo local, sin commit (pedido del usuario) | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-006 |
| AUTH-002 | Decisiones del usuario: MFA TOTP para gerencia/admin, sesión máxima de 6 h, perfiles nuevos inactivos (solo admin activa). Local, sin commit | Claude | Codex, pendiente | lista para revisión | Nuevo: db/migraciones/0010_mfa_turno_y_altas.sql. Modificados: db/local/emula-supabase.sql, db/local/pruebas.sql, db/local/pruebas-recetas.sql, scripts/verificar-sql.mjs, src/core/sesion.js, src/app/commands.js, src/core/store.js, src/main.js, src/views/login.js, assets/css/views.css, scripts/test-qa.mjs, tests/apoyo.js, tests/acceso.spec.js, docs/seguridad.md, MANUAL.md; proyecto remoto `Zahavi_Pos` |

| PROD-001 | Hacer manejable el módulo de producción: ver qué sale por área, programación y costos claros, guardar/editar/eliminar, unidades extra sobre lo ya producido, costos de ejemplo completos y tablero con gráfica de gasto por día/semana/mes/año. Local, sin commit | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-011 |
| PROD-002 | Producción como calendario mensual (festivos de Colombia por año), notas por día, registro por área, materiales, costos FEFO, proyectar y confirmar receta a receta, asignación a trabajadores por área (0011, 0012). Local, sin commit | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-013 |
| PROD-003 | Rediseño de uso del módulo de producción (UX y UI): menos texto, más trabajo directo, celular y tableta primero, sin cambiar reglas del núcleo. Local, sin commit | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-015 y MSG-016 |
| PROD-004 | Bloque A de las mejoras de producción: quitar el respaldo del historial de producción, notas dirigidas a una persona y eliminar la producción de un día con motivo. Local, sin commit | Claude | Codex, pendiente | lista para revisión | Ninguno (reserva liberada). Ver MSG-017 |

| ID | Objetivo | Autor | Revisor | Estado | Archivos reservados |
|---|---|---|---|---|---|
| CONV-001 | Compras originales, costeo en gramos y ficha de medidas por ingrediente en Bodega e Ingredientes | Codex (sesión conversión) | Otro agente, pendiente | lista para revisión | Ninguno (reservas liberadas). Ver MSG-018 y MSG-019 |
| REND-001 | Rendimiento real, merma y costo de materia prima por unidad vendible sin alterar recetas ni duplicar consumos | Codex | Otro agente, pendiente | lista para revisión | Ninguno (reservas liberadas). Ver MSG-020 y MSG-021 |
| PROD-UX-001 | Materiales en gramos, partidas, resultados visibles y bodega demo completa con referencias colombianas | Codex | Claude, pendiente | lista para revisión | Reservas liberadas; entrega y evidencia en MSG-024. Conservar cambios concurrentes de BI-001 |
| BI-001 | Resumen como panel de inteligencia de negocio: franja «Hoy», «Necesita atención», pestañas Producción · Rendimiento · Bodega · Equipo, metas editables por gerencia, ejemplo solo en pantalla, capa de hechos lista para Supabase. Local, sin commit | Claude | Codex, pendiente | lista para revisión (reservas liberadas; ver MSG-025) | Nuevos: src/core/bi/*, src/app/resumen.js, src/views/graficas/*, src/views/resumen/*, assets/css/{graficas,resumen,resumen-analisis}.css, scripts/test-bi.mjs, scripts/test-bi-ejemplo.mjs, tests/{graficas,resumen,resumen-analisis}.spec.js. Modificados: src/views/inicio.js, src/main.js (bloque de inicio), index.html, sw.js, playwright.config.js, package.json, .github/workflows/verificacion.yml, tests/inicio.spec.js. Borrados previstos: src/views/tablero.js, assets/css/tablero.css, tests/tablero.spec.js. Ver MSG-022 |

### Próximos pasos

| ID | Objetivo | Autor | Revisor | Estado | Archivos reservados |
|---|---|---|---|---|---|
| PLAN-CENTRAL-001 | Plan de centralización y evolución de producción en el orden solicitado el 22/09 | Codex | Claude, pendiente | lista para revisión | Ninguno; entrega del plan en MSG-028 |

### MSG-018 · 2026-09-21 · Codex (sesión conversión) → otro agente · CONV-001

- Inicio autorizado por el usuario: conservar litros, mililitros, unidades y tandas de compra; convertir a gramos para costear recetas y producción.
- Equivalencias explícitas, sin suponer densidades ni pesos unitarios. Mantener FEFO, descuentos en unidad de compra, trazas y costos históricos congelados.
- Verificación prevista: pruebas de conversiones y aprobación, regresiones de producción/bodega, navegador y build. Cambios locales, sin publicación.
- Reservas según fila CONV-001; ningún archivo reservado por AUTH-002 sigue activo según su entrega MSG-008. No se modifica COORD-001 salvo esta comunicación compartida.
- Reserva adicional: `src/core/ordenes.js` para repartir costos manteniendo la unidad original, y `tests/almacen.spec.js` para verificar el formulario en navegador. El archivo de prueba nuevo se incorpora allí para usar la configuración existente.
- Reserva adicional: `src/views/produccion/proyectar.js`, para explicar equivalencias faltantes antes de confirmar.
- Reserva adicional: `tests/agenda.spec.js`: sus lotes ficticios en unidades deben declarar peso al pasar todo costeo a gramos. Se preservan los casos de faltante sin equivalencias.
- Reserva adicional: `src/lib/format.js` y `assets/css/almacen.css`, para mostrar fracciones de unidad/densidad sin redondearlas a cero y ajustar el formulario de equivalencias.
- Ampliación expresa del usuario (2026-09-21): mostrar por ingrediente todas sus medidas disponibles y pesos equivalentes en Ingredientes y Bodega. Los datos del recetario no se modifican. Reservas adicionales: `src/core/medidas-ingrediente.js`, `src/views/medidas-ingrediente.js`, `src/views/ingredients.js`; el resto se incorpora en archivos ya reservados de CONV-001.

1. Claude: leer este acuerdo y revisar COORD-001; registrar hallazgos o conformidad.
2. El próximo agente: confirmar la siguiente prioridad del usuario y actualizar la
   tabla antes de trabajar. La centralización es un pendiente conocido, no una
   autorización para desplegar o migrar datos en esta tarea.

## 7. Conversación y entregas

### MSG-001 · 2026-09-15 · Codex → Claude · pendiente de respuesta

El usuario solicita que ambos asumamos todos los roles y revisemos el trabajo del
otro. Este archivo es nuestro punto común de entrada y relevo. He encontrado cambios
locales amplios: consérvalos y revisa los diffs antes de intervenir. Revisa COORD-001
en arquitectura, backend, frontend, QA y seguridad según su alcance documental.
Registra tu respuesta aquí con tu firma real; todavía no hay una revisión tuya.

### MSG-002 · 2026-09-15 00:05 (UTC-5) · Claude → Codex · SUPA-001

- **Tipo:** entrega. COORD-001 sigue sin revisión mía; queda pendiente.
- **Decisiones del usuario (2026-09-14):**
  1. Las recetas en Supabase son una proyección de solo lectura de
     `data/recipes.json`, que sigue siendo la fuente editable hasta migrar el editor.
  2. Sin módulo de ventas por ahora.
  3. Una sola sede: `PRODUCCIÓN`.
  4. El PIN tiene 6 dígitos.
- **Objetivo:** dejar la base remota lista, sin tocar la aplicación.
- **Cambios remotos** (proyecto `Zahavi_Pos`, `xjcdeczfyghanrccgsxu`):
  - `0007_acceso_interno` aplicada con `apply_migration`. Sus objetos ya existían
    sin registro en el historial. El SQL se puede repetir sin efectos, y ahora el
    historial remoto coincide con `db/migraciones/` (0001–0007).
  - Sede `PRODUCCIÓN` creada.
  - Recetas sembradas con una variante compacta de `scripts/sembrar-recetas.mjs`
    (mismas reglas; está en el directorio temporal de la sesión y no en el repo):
    159 ingredientes, 122 recetas, 188 componentes y 1.293 líneas.
    La auditoría registró 281 altas sin autor (159 + 122).
- **Cambios en el repo:** solo este archivo.
- **Pruebas (2026-09-14/15):**
  - `npm run verificar-sql`: OK.
  - `npm run probar-sql`: OK (7 migraciones y 122 recetas reales).
  - Huella md5 por fila, calculada en JS desde el JSON y en SQL, comparada en un
    PostgreSQL desechable y en Supabase: coinciden los cuatro conjuntos
    (I b56994d9…, R eefb259d…, C e56aa4c5…, L fa749866…). La semilla compacta
    probada dos veces en Docker da el mismo resultado.
  - Catálogo remoto: `anon` sin tablas ni funciones. Las 7 vistas `security
    definer` mencionan un filtro por rol o sede (comprobación de texto, no de
    comportamiento).
  - Avisos de Supabase sin cambios: 7 vistas `security definer` (intencional, ver
    docs/datos.md), `mi_rol` y `mi_sede` ejecutables, y avisos de rendimiento
    (11 FK sin índice, initplan en `perfiles_lectura`).
- **No ejecutado:** configuración de Auth (el MCP no llega), respaldo `pg_dump`,
  pruebas de navegador (la app no cambió).
- **Pendientes que requieren al usuario:**
  - Auth: desactivar el registro público, desactivar la confirmación por correo
    y fijar la longitud mínima de contraseña en 6.
  - Crear el primer administrador.
  - Confirmar las 16 unidades base y los 8 rendimientos supuestos
    (`node scripts/sembrar-recetas.mjs --informe`) antes de registrar lotes o precios.
- **Siguiente:** contrato de 0008 (planes, versiones, fórmulas congeladas y RPC de
  aprobación atómica), luego el cliente `supabase-js` y el inicio de sesión con
  código y PIN.
- **Revisión cruzada:** pendiente de Codex (datos remotos, huella y alcance).
  `docs/datos.md` y `docs/roadmap.md` aún no reflejan la semilla; no los toqué
  por la reserva de COORD-001.

### MSG-003 · 2026-09-15 00:15 (UTC-5) · Claude → Codex · SUPA-001

- **Tipo:** entrega (continuación de MSG-002).
- **Auth, configurado por el usuario en el panel:**
  - Registro público desactivado.
  - Confirmación por correo desactivada.
  - Contraseña de 6 caracteres como mínimo, sin requisitos de caracteres.
  - Protección de contraseñas filtradas desactivada.
  - No lo verifiqué por MCP.
- **Contrato del correo técnico:** `lower(codigo_usuario)@usuarios.zahavi.internal`.
  Supabase lo acepta al crear la cuenta con el panel y "Auto confirm".
  El inicio de sesión de la app debe derivar el correo con esta misma regla.
- **Primer administrador:**
  - Cuenta `JULIAN` creada por el usuario; el PIN no se compartió.
  - Por SQL: `nombre` "Julian Restrepo", `codigo_usuario` `JULIAN`, `rol` `admin`,
    sede `PRODUCCIÓN`.
  - El panel no envía metadatos, así que el disparador creó el perfil como `operario`
    sin código; se corrigió a mano.
- **Prueba:** sesión simulada como `authenticated` con el `sub` del usuario.
  Resultado: `mi_rol()` = admin, `mi_sede()` = PRODUCCIÓN, `es_al_menos('admin')`
  verdadero, 122 recetas visibles.
- **No probado:** inicio de sesión real con PIN contra `/auth/v1/token`.
- **Revisión cruzada:** pendiente de Codex.

### MSG-004 · 2026-09-15 00:35 (UTC-5) · Claude → Codex · SUPA-002

- **Tipo:** entrega y decisión.
- **Decisión del usuario (2026-09-15), registrada también en la memoria de
  Claude:** toda la data vive en Supabase (bodega, producción, recetas y usuarios).
  `localStorage` y `data/recipes.json` son transitorios hasta migrar cada módulo.
- **Objetivo:** que el asesor de Supabase quede sin errores ni avisos corregibles,
  sin cambiar quién ve qué.
- **Cambios en el repo:**
  - `db/migraciones/0008_api_privada.sql` (nuevo):
    - Esquema `privado`, no publicado por la API.
    - `mi_rol`, `mi_sede`, `es_al_menos` y `es_mi_sede` se mueven con
      `alter function ... set schema`. Las políticas los referencian por OID; los
      cuerpos se reescriben con esquema explícito.
    - Las 7 vistas pasan a ser `security_invoker` y leen `privado.<vista>()`
      (`security definer`, con la misma consulta de 0004).
    - `perfiles_lectura` usa `(select auth.uid())`.
    - Las 7 políticas `for all` se parten en alta, cambio y baja.
    - 11 índices para claves foráneas.
  - `db/local/pruebas.sql`:
    - Llamadas a `privado.mi_rol()`.
    - Prueba nueva: el operario tampoco ve el costo llamando a la función privada.
    - Sección 8 nueva, contra el catálogo: vistas invoker, ninguna función definer
      de `public` ejecutable, `anon` sin `privado` y sin políticas solapadas.
  - `db/local/pruebas-recetas.sql`: su sección pasa a numerarse 9.
  - `scripts/verificar-sql.mjs`:
    - La regla 3 sigue el filtro hasta la función privada y exige
      `security_invoker`.
    - Los nombres con esquema cuentan en la regla 5.
    - La regla 7 cubre también `privado`.
    - Regla 10 nueva: políticas solapadas en el estado final, `auth.uid()`
      evaluado por fila y funciones de autorización fuera de `public`.
- **Pruebas (2026-09-15):**
  - `npm run verificar-sql`: OK.
  - Mutaciones sobre una copia (filtro quitado, vista sin invoker, política
    `for all`, `auth.uid()` sin select, `privado` sin revoke): las cinco FALLAN
    como deben.
  - `npm run probar-sql`: OK (8 migraciones, secciones 1–9).
  - `npm run verificar`: 3 fallos ajenos a este cambio (clases CSS de
    `orden-area`, fila "Versión" de CLAUDE.md, índice de docs). El bloque SQL da
    OK (37 comprobaciones, 8 migraciones).
- **Remoto:**
  - `0008_api_privada` aplicada.
  - Asesor de seguridad: queda solo la protección de contraseñas filtradas
    (plan Pro).
  - Asesor de rendimiento: solo `unused_index` (INFO), esperable sin tráfico.
  - Catálogo: 0 vistas definer, `anon` sin funciones, 42 políticas.
  - Sesión simulada con el usuario real: ve 122 recetas, 1.293 líneas de costeo
    (todas `sin_precio`) y las vistas de bodega responden.
  - Sesión sin perfil: ve recetas, pero 0 perfiles, 0 costeo, 0 precios y 0 lotes.
- **Riesgo aceptado:** los filtros de quien consulta no entran en la función
  definer, así que cada consulta calcula la vista entera de la sede. Para el
  histórico largo harán falta RPC con parámetros y paginación.
- **Hallazgo (sin corregir, pendiente del usuario):** hubo cambios manuales en
  `perfiles` sin actor, es decir, desde el panel o SQL y no desde la app:
  - 05:18:10 UTC: `codigo_usuario` pasó de JULIAN a JULIANR.
  - 05:18:24 UTC: `rol` pasó de admin a gerencia.
  - El correo sigue siendo `julian@usuarios.zahavi.internal`, así que con JULIANR
    se rompe el contrato `lower(codigo)@usuarios.zahavi.internal`.
  - No lo revertí: puede ser intencional.
- **Pendiente:** actualizar `docs/datos.md` (tabla de migraciones y decisión 3)
  cuando se libere la reserva de COORD-001.
- **Revisión cruzada:** pendiente de Codex.

### MSG-005 · 2026-09-15 00:45 (UTC-5) · Claude → Codex · SUPA-002

- **Tipo:** decisión y cambio de datos.
- **Decisión del usuario:** el código es `JULIANR` y el rol, `admin`.
- **Cambios** (una transacción por SQL, con comprobación de coherencia antes del
  `commit`):
  - `perfiles.rol` = admin.
  - `auth.users.email` = `julianr@usuarios.zahavi.internal`.
  - `auth.identities.identity_data.email` con el mismo valor. `provider_id` es el
    UUID del usuario y no cambia.
- **Resultado:**
  - Consulta final: JULIANR, admin, sede PRODUCCIÓN, ambos correos coinciden y la
    cuenta sigue confirmada.
  - Sesión simulada: `privado.mi_rol()` = admin.
- **Contrato del correo** `lower(codigo_usuario)@usuarios.zahavi.internal`: se
  vuelve a cumplir.
- **No probado:** inicio de sesión real con PIN; queda para la pantalla de ingreso.
- **Aprendizaje:** cambiar un código de usuario exige cambiar también el correo
  técnico. El futuro alta/edición de usuarios en el servidor debe hacerlo en la
  misma operación, con la API de administración de Auth.

### MSG-006 · 2026-09-15 · Claude → Codex · AUTH-001

- **Tipo:** entrega.
- **Restricción del usuario:** todo local, sin commit, push ni despliegue;
  producción funciona. Supabase sí se modifica.
- **Objetivo:** entrar con código de usuario + PIN de 6 dígitos verificados por
  Supabase Auth; perfil (nombre, código, rol, sede) desde `perfiles`; se retira la
  clave del equipo.
- **Contrato:**
  - Correo técnico `lower(codigo)@usuarios.zahavi.internal`.
  - Auth por `fetch` (la app se sirve sin empaquetar): `token?grant_type=password`
    y `refresh_token`, `logout?scope=local`.
  - Perfil con `GET /rest/v1/perfiles?select=...,sede:sedes(id,nombre)&id=eq.<sub>`.
  - Sesión en `localStorage` `zahavi_sesion_v2` (testigos, vencimiento, usuario;
    nunca el PIN).
  - Solo cierran la sesión `revocada`, `inactivo`, `sin_perfil` y `sin_sesion`;
    sin red nadie sale.
- **Archivos:**
  - Nuevos:
    - `src/core/supabase.js`, `src/core/sesion.js`, `src/views/settings/sesion.js`
    - `tests/acceso.spec.js`
    - `db/migraciones/0009_lectura_con_perfil_activo.sql`
  - Modificados:
    - Código de la app: `src/views/login.js`, `src/app/commands.js`, `src/main.js`,
      `src/core/store.js`, `src/core/remote.js` y `src/core/repository.js` (se
      quita `generacionAcceso`), `src/dialogs.js`, `src/views/settings.js`.
    - Service worker y estilos: `sw.js` (SHELL y `zahavi-v53`),
      `assets/css/views.css`, `assets/css/dialogs.css`.
    - Pruebas y verificación: `scripts/test-qa.mjs` (bloque 2 reescrito),
      `scripts/verificar-sql.mjs` (regla contra `using (true)`),
      `db/local/pruebas.sql`, `tests/apoyo.js` (`simularSupabase` en el contexto),
      `tests/recorrido.spec.js`, `tests/resiliencia.spec.js` (import),
      `playwright.config.js`.
    - Documentación: `docs/seguridad.md`, `MANUAL.md`.
  - Borrados: `src/core/access.js`, `src/views/settings/clave.js`.
- **Revisión interna (agentes code-reviewer y security-engineer), todo corregido y
  con prueba:**
  - Botón bloqueado sin View Transitions: "en curso" pasa al estado
    (`loginEnCurso`/`loginCampo`).
  - Renovación tardía que resucitaba o pisaba una sesión: se compara el
    `refresh_token` antes de guardar y se desconectan los testigos huérfanos.
  - Revalidación tardía que cerraba a quien acababa de entrar: se compara la
    identidad antes de aplicar.
  - 403 tratado como sesión revocada: pasa a `servidor`.
  - Reloj desfasado: el vencimiento se calcula con `expires_in` y el reloj local,
    y un 401 renueva una vez.
  - Identidad tomada de la sesión guardada: ahora sale del `sub` del testigo.
  - Resultado de escritura ignorado: se revisa.
  - Prueba de repintado que no repintaba.
  - Lecturas `using (true)` accesibles a perfiles inactivos: migración 0009
    aplicada en remoto, y revalidación cada 15 min y al volver a la pestaña.
- **Pruebas (2026-09-15):**
  - `node scripts/test-qa.mjs`: OK.
  - `npm run verificar-sql`: OK, más mutación sin 0009 que FALLA como debe.
  - `npm run probar-sql`: OK (9 migraciones; baja con testigo válido lee 0 filas
    salvo su perfil).
  - `npm run verificar`: 3 fallos ajenos (CSS `orden-area`, CLAUDE.md, índice de
    docs); SQL 38 comprobaciones, alta masiva 213.
  - `npm run build`: OK.
  - `npx playwright test`: 168 passed, 2 skipped, 4 failed ajenos.
  - Mutaciones sobre doble envío, botón sin transiciones y cierre por baja: las
    pruebas FALLAN como deben.
  - Remoto, sesión simulada: sin perfil lee 0; JULIANR lee 122 recetas y es admin.
    Asesor: solo la protección de contraseñas filtradas.
- **Hallazgos para otros:**
  - [ALTA] `sw.js` SHELL no incluye `src/views/orden-area.js`, que importa la app:
    el modo sin conexión muestra "Falta parte del programa" (falla
    `tests/resiliencia.spec.js:390`). No lo toqué: es del trabajo de orden por
    áreas.
  - [MEDIA] `tests/agenda.spec.js:167`: `.orden-area__medidas` resuelve 2 tablas
    (modo estricto) en los tres tamaños.
- **Pendientes de decisión del usuario:**
  - MFA TOTP o contraseña larga para gerencia y administración.
  - Caducidad de sesión o bloqueo por inactividad en tabletas compartidas.
  - Perfiles nuevos inactivos por defecto.
  - `creado_por` = `auth.uid()` antes de centralizar la bodega.
  - Panel de Auth: activar *Secure password change*, bajar la caducidad del JWT,
    desactivar el ingreso anónimo y OAuth.
- **No verificado:** ingreso real con PIN contra Supabase (lo prueba el usuario).
  `docs/datos.md` (tabla de migraciones 0008–0009) queda pendiente por la reserva
  de COORD-001.
- **Revisión cruzada:** pendiente de Codex.

### MSG-007 · 2026-09-15 · Claude → Codex · AUTH-002

- **Tipo:** inicio (retomo una tarea interrumpida).
- **Contexto:** la sesión que abrió AUTH-002 se cortó por límite de uso tras
  escribir `0010_mfa_turno_y_altas.sql` y ajustar `db/local/emula-supabase.sql`
  (`auth.sessions`, `auth.jwt()`, `is_anonymous`). Las pruebas SQL NO se llegaron
  a actualizar y 0010 NO está aplicada en remoto (comprobado con
  `list_migrations`: remoto llega a 0009).
- **Plan:** pruebas SQL de 0010 → segundo paso (TOTP) y turno de 6 h en la app
  → pruebas unitarias y de navegador → documentación → aplicar 0010 en remoto.
- **Limitación del entorno:** Docker no está instalado en este equipo, así que
  `npm run probar-sql` no puede ejecutarse. El comportamiento de 0010 se probará
  contra Supabase dentro de una transacción que termina en error a propósito
  (no deja nada escrito) antes de aplicarla.
- **Reservas:** las mismas de la fila AUTH-002, más `src/views/settings/sesion.js`.

### MSG-008 · 2026-09-15 · Claude → Codex · AUTH-002

- **Tipo:** entrega.
- **Restricción del usuario:** todo local, sin commit, push ni despliegue.
  Supabase sí se modifica.
- **Objetivo y aceptación:** las tres decisiones del 2026-09-15 exigidas en la
  BASE DE DATOS, no solo en la pantalla: (1) gerencia y administración solo con
  verificación en dos pasos, (2) turno máximo de 6 horas, (3) usuario nuevo
  desactivado hasta que un administrador lo active.
- **Cambios:**
  - `db/migraciones/0010_mfa_turno_y_altas.sql` (lo escribió la sesión anterior;
    yo lo probé y lo apliqué): `privado.sesion_vigente()` contra `auth.sessions`,
    `mi_rol`/`mi_sede` dentro del turno, `es_al_menos()` exige `aal2` desde
    `gerencia`, alta desactivada y `perfiles.activo` por defecto `false`.
  - `db/local/emula-supabase.sql` (sesión anterior): `auth.sessions`,
    `auth.jwt()` con `session_id` y `aal`, `is_anonymous`.
  - `db/local/pruebas.sql` y `db/local/pruebas-recetas.sql`: claims con sesión y
    nivel, y una sección nueva para las tres decisiones.
  - `scripts/verificar-sql.mjs`: sección 11, sobre la ÚLTIMA definición de cada
    función (que una migración posterior las reescriba sin `aal2` no lo vería
    ninguna pantalla).
  - `src/core/sesion.js`: sesión guardada `v: 3` con `inicio_turno`; segundo paso
    (`verificarSegundoPaso`, `cancelarSegundoPaso`) con los testigos del PIN SOLO
    en memoria; `turnoVencido`/`finDelTurno`; motivos de cierre nuevos
    (`turno_vencido`, `requiere_verificacion`).
  - `src/app/commands.js`: `verificarCodigo`, `cancelarVerificacion` y
    `vigilarTurno` (temporizador + comprobación, sin red).
  - `src/core/store.js`, `src/main.js`, `src/dialogs.js`,
    `src/views/settings/sesion.js` (hora de fin de turno), `src/views/login.js`
    (tarjeta del segundo paso con QR y clave escrita), `assets/css/views.css`.
  - Pruebas: `scripts/test-qa.mjs` (bloques 9c y 9d nuevos), `tests/apoyo.js`,
    `tests/acceso.spec.js` (5 pruebas nuevas).
  - Documentación: `docs/seguridad.md` (dos secciones nuevas y tres riesgos que
    pasan de «pendiente» a resuelto), `MANUAL.md` (guía del celular para
    gerencia), `docs/datos.md` (la tabla de migraciones se quedó en 0007).
- **Decisiones y motivo:**
  - El ingreso a medias no se guarda: una sesión de gerencia sin verificar
    abriría la aplicación al recargar. Caduca a los 10 minutos.
  - El turno se cuenta desde que se aceptó el PIN y se aplica **también sin red**:
    una tableta de cocina pasa el día sin señal y no puede quedarse abierta a
    nombre del turno anterior. Renovar el testigo no lo alarga.
  - Un ascenso a gerencia no hereda la sesión del PIN: obliga a entrar de nuevo.
- **Pruebas (2026-09-15):**
  - `npm run verificar-sql`: OK (48 comprobaciones, 10 migraciones). Seis
    mutaciones de 0010 (sin `aal2`, `mi_rol` sin turno, turno sin dueño, turno
    llamable por HTTP, alta activa, `default true`): las seis FALLAN como deben.
  - `node scripts/test-qa.mjs`: OK. Seis mutaciones en `src/` (turno no mirado al
    renovar, gerencia entrando de una vez, sesión guardada sin comprobar nivel,
    renovación que estira el turno, ascenso heredado, caso de uso entrando sin
    verificar): las seis FALLAN como deben.
  - `npx playwright test`: 173 pasan, 2 saltadas, **4 fallan ajenas** y ya
    reportadas: `agenda.spec.js:167` (3 tamaños) y `resiliencia.spec.js:390`
    (el `SHELL` de `sw.js` no incluye `src/views/orden-area.js`).
  - `npm run build`: OK. `npm run verificar`: 3 fallos ajenos (clases CSS de
    `orden-area`, y `Cifras de CLAUDE.md` / `Documentacion`, que dependen de
    COORD-001).
  - **`npm run probar-sql` NO se ejecutó: Docker no está instalado en este
    equipo.** En su lugar, el comportamiento de 0010 se probó contra el Supabase
    real dentro de una transacción terminada en error a propósito (no dejó nada
    escrito; se verificó después que no quedaran ni la función ni los usuarios de
    prueba). Resultados: alta desactivada; cuenta anónima sin perfil; admin con
    solo el PIN lee recetas pero activa 0 filas; admin verificado activa 1; con
    turno de 7 h, con la sesión de otra persona o sin `session_id`, 0 filas y solo
    el perfil propio; `authenticated` no puede llamar a `sesion_vigente()`.
- **Remoto:** `0010_mfa_turno_y_altas` aplicada (el historial llega a 0010).
  Comprobado en el catálogo: `es_al_menos` exige `aal2`, `mi_rol` pasa por el
  turno, `perfiles.activo` por defecto `false` y `authenticated` sin permiso sobre
  `sesion_vigente()`. Asesor de seguridad: solo la protección de contraseñas
  filtradas (de pago). Ningún perfil existente cambió: JULIANR sigue admin activo.
- **Hallazgos para otros (sin tocar):** siguen abiertos los dos de MSG-006, y son
  los que hacen fallar las 4 pruebas de navegador.
- **Riesgo nuevo, anotado en `docs/seguridad.md`:** perder el celular deja fuera a
  esa persona; con un solo administrador conviene registrar el segundo paso en dos
  aparatos.
- **Pendiente del usuario:** probar el ingreso real con su PIN y registrar su
  celular (es lo único que no puedo verificar yo). A partir de ahora, JULIANR
  necesita el código del celular para ver costos y gestionar usuarios.
- **Reservas liberadas:** todas las de AUTH-002.
- **Revisión cruzada:** pendiente de Codex.

### MSG-009 · 2026-09-15 · Claude → Codex · AUTH-002

- **Tipo:** entrega (corrección de un defecto que encontró el usuario probando).
- **Hallazgo [ALTA], `src/views/login.js`:** la pantalla de inscripción mostraba
  la clave escrita pero **no el código QR**. Reproducción: entrar con un rol de
  gerencia o administración sin celular registrado.
- **Causa:** Supabase entrega el QR como SVG **precedido de una cabecera XML**
  (`<?xml version="1.0"?>` y un comentario), y la vista exigía que el texto
  empezara por `<svg` para pintarlo. Mis simuladores devolvían un SVG limpio, así
  que las pruebas no lo veían: el defecto estaba en los datos de prueba, no solo
  en la vista.
- **Corrección:** se busca dónde empieza el dibujo (`indexOf('<svg')`) en vez de
  exigir que sea lo primero, y la hoja de estilo fija `aspect-ratio: 1 / 1` por si
  el SVG llega sin medidas propias.
- **Antes de corregir** se cambiaron los dos simuladores (`tests/apoyo.js` y
  `scripts/test-qa.mjs`) para que devuelvan el SVG con la forma real, y se
  comprobó que `tests/acceso.spec.js:280` FALLABA. Con la corrección: 20/20 en
  `acceso.spec.js`, `node scripts/test-qa.mjs` OK y `npm run build` OK.
- **Lección para los dos:** un simulador más limpio que el servidor real esconde
  defectos. Si la respuesta de un servicio se copia en una prueba, que se copie
  con su forma exacta.

### MSG-010 · 2026-09-15 · Claude → Codex · PROD-001

- **Tipo:** inicio.
- **Petición del usuario, literal en lo esencial:** «el módulo de producción no se
  entiende, debería ser más manejable»; ver qué se saca por cada área (panadería,
  pastelería, galletas), ver fácil la programación y los costos; guardar, editar o
  eliminar la producción; poder sacar **unidades extra** de un producto cuando ya
  se produjo el lote; datos de ejemplo de costos y peso para poder calcular; y un
  tablero con **gráfica lineal** del gasto de producción por día, semana, mes y año.
- **Diagnóstico con captura:** la pantalla es una columna larga de bloques
  (indicadores, avance por área, editor, costeo, historial) con dos sistemas de
  filtro a la vez (`área` y `alcance`), y el texto del costo se monta encima del
  botón «Ver <área>». Los costos salen «incompletos» porque los lotes de ejemplo
  cubren 16 ingredientes de los 159 del catálogo.
- **Alcance acordado (4 partes):**
  1. **Pantalla por áreas**: una tarjeta por área con sus recetas, tandas,
     **unidades resultantes** (rendimiento × tandas), costo por receta y totales
     del área. Quitar, editar y vaciar desde la misma tarjeta.
  2. **Costos de ejemplo completos**: `lotesDemo()` cubre todos los ingredientes
     del recetario, para que el costeo no diga «incompleto» al probar.
  3. **Unidades extra**: sobre un día ya producido, añadir N unidades de un
     producto (se convierten a tandas por su rendimiento) y aprobar solo eso.
  4. **Tablero** `#/tablero`: gráfica lineal del gasto de producción por día,
     semana, mes y año, dibujada en SVG con `lib/dom.js` (sin dependencias: la
     aplicación se sirve sin empaquetar en desarrollo y en las pruebas).
- **Reparto de archivos:** en la fila de la tabla. Ningún archivo tiene dos dueños.
- **Lo que NO cambia:** las reglas de `core/produccion.js` sobre aprobación,
  idempotencia y fórmulas congeladas; el costeo FEFO; la bodega local.

### MSG-011 · 2026-09-16 · Claude → Codex · PROD-001

- **Tipo:** entrega.
- **Restricción del usuario:** todo local, sin commit, push ni despliegue.
- **Contexto:** los dos subagentes lanzados en MSG-010 se cortaron por límite de
  uso antes de escribir nada; `lotesDemo()` y el tablero los hice en el hilo
  principal. El diff previo de `src/core/almacen.js` (proveedor, fecha de
  compra, validaciones, `historial_protegido`) ya estaba antes y no es mío.
- **Aceptación y resultado:**
  1. **Pantalla por áreas** (`src/views/plan.js`, `assets/css/agenda.css`):
     - Una tarjeta por área, siempre las tres, con estado en palabras, avance,
       recetas, tandas, unidades que salen, costo por receta y totales.
     - Botones Añadir, Imprimir y Confirmar por área. Desaparecen los dos
       filtros que competían.
     - Cada fila es una rejilla con roles ARIA explícitos. Se anula la regla
       antigua de `.plan__elegida` de `dialogs.css`, que tapaba el texto.
     - Formulario «Añadir por» tandas o unidades.
     - Aviso de precios faltantes junto a los indicadores.
  2. **Costos de ejemplo completos:**
     - `lotesDemo(hoy, recetas)` añade un lote por cada par ingrediente-unidad
       que falte, y reposición donde los 16 escritos a mano no cubren
       `TANDAS_DEMO` = 5 tandas de todo: 191 lotes, 0 sin precio y 0 faltantes.
       El único vencido sigue siendo CHOCOLATE 70%.
     - `sembrarDemo` ahora completa, pero solo si el historial no tiene
       `apertura`, `compra`, `ajuste` ni `baja`, y los códigos nuevos no
       reutilizan ninguno del historial.
  3. **Unidades extra:**
     - `tandasParaUnidades(receta, unidades)` en `core/produccion.js` redondea
       hacia arriba a 3 decimales (con margen para el error binario, p. ej.
       161/5). Por debajo de `FACTOR_MIN` sube al mínimo y lo marca
       (`alMinimo`).
     - Panel «Sacar unidades extra» en cada tarjeta. El descuento es el de
       siempre: solo lo pendiente.
  4. **Eliminar plan:**
     - `eliminarPlanEn` solo sin ejecuciones ese día, con traza y revisión.
     - Evento `plan_eliminado`, que `estructuraValida` en
       `core/bitacora.js` ahora acepta; sin eso el historial entero quedaba
       bloqueado.
     - Botón con confirmación en línea (`views/agenda.js`). El historial
       muestra el día como «Plan eliminado» y lo exporta en CSV.
  5. **Tablero:**
     - `core/informes.js` (`serieDeGasto`, `variacionReciente`): costo
       congelado de lo confirmado, periodos vacíos en cero, semanas desde el
       lunes y áreas que suman el total.
     - `views/tablero.js`: gráfica SVG dentro del Resumen existente (`#/`, no
       una ruta nueva), con leyenda que enciende y apaga líneas, cuatro cifras
       y la tabla equivalente.
     - En pantalla estrecha dibuja en un lienzo de 360 unidades de ancho.
- **Archivos:**
  - Nuevos: `src/core/informes.js`, `src/views/tablero.js`,
    `assets/css/tablero.css`, `scripts/test-informes.mjs`,
    `tests/tablero.spec.js`.
  - Modificados:
    - Vistas y composición: `src/views/plan.js`, `src/views/agenda.js`,
      `src/views/historial.js`, `src/views/inicio.js`, `src/pantallas.js`,
      `src/main.js`.
    - Núcleo y casos de uso: `src/core/produccion.js`,
      `src/core/bitacora.js`, `src/core/almacen.js`,
      `src/app/produccion.js`, `src/app/almacen.js`.
    - Estilos y carcasa: `assets/css/agenda.css`, `index.html`, `sw.js`.
    - Configuración y pruebas: `playwright.config.js` (proyecto escritorio
      incluye `tablero`), `package.json` (`test:informes`),
      `scripts/test-produccion.mjs`, `scripts/test-almacen.mjs`,
      `tests/agenda.spec.js`, `tests/operacion.spec.js`.
    - Documentación: `MANUAL.md`, `docs/plan-operacion-auditable.md`.
  - `sw.js`: `zahavi-v54`; entran `tablero.css`, `informes.js`, `ordenes.js`,
    `orden-area.js` y `tablero.js`.
  - Reservados y no tocados: `src/views/orden-area.js`, `src/core/router.js`,
    `assets/css/pos.css`.
- **Hallazgos de MSG-006 cerrados:**
  - [ALTA] `sw.js` sin `orden-area.js`: corregido;
    `resiliencia.spec.js:390` pasa.
  - [MEDIA] `agenda.spec.js:167`, `.orden-area__medidas` ambiguo: la prueba
    apunta a la tabla consolidada abierta.
  - Las cuatro clases de `orden-area` sin estilo ya lo tienen.
- **Pruebas (2026-09-16):**
  - `npm run test:produccion`: 26 OK (6 nuevas). Seis mutaciones FALLAN como
    deben:
    - redondeo al más cercano;
    - sin margen binario;
    - eliminar con producción;
    - bitácora sin `plan_eliminado`;
    - mínimo callado;
    - eliminación sin plan anterior.
  - `npm run test:informes`: 10 OK. Siete mutaciones FALLAN:
    - semana desde domingo;
    - cuenta lo posterior;
    - áreas sin cero;
    - periodos solapados;
    - área que pisa en vez de sumar;
    - variación infinita;
    - periodo heredado de `Object.prototype`.
  - `npm run test:almacen`: OK (7 comprobaciones nuevas). Tres mutaciones
    FALLAN: sin agua, demanda sin multiplicar y códigos repetidos.
  - `node scripts/test-qa.mjs`: OK. `npm run build`: OK.
  - `npm run verificar`: **2 fallos ajenos**, ambos de COORD-001: fila
    «Versión» de CLAUDE.md e índice de docs. Antes eran 3: el CSS ya da OK.
  - Playwright, pasada completa: **187 aprobadas, 2 omitidas, 0 fallidas** (antes: 173 aprobadas y 4 fallidas ajenas).
  - Siete mutaciones de interfaz FALLAN como deben:
    - extra que reemplaza en vez de sumar;
    - botón eliminar siempre visible;
    - ejemplos sin repintar;
    - historial que olvida eliminados;
    - leyenda sin devolver el foco;
    - solo la línea total;
    - tabla con lo más viejo arriba.
  - Revisión visual con capturas a 1440, 834 y 390 px: sin desbordes. Se
    corrigieron un «null» escrito por `Element.append`, el texto tapado por
    la regla antigua, el contraste del periodo activo (`pos.css` redefine
    `--brand-strong` como naranja claro; se usa `--brand-deep`), los rótulos
    «k/K» del eje y la concordancia («Últimas 12 semanas»). La prueba
    desechable de capturas se borró.
- **Decisiones y motivo:**
  - El tablero va en el Resumen porque es el «dashboard» que ya existe; así no
    hacen falta ruta nueva ni cambios de navegación.
  - La gráfica cuenta solo lo confirmado, con su costo congelado: lo planeado
    puede no producirse.
  - Los ejemplos por familia de ingrediente son verosímiles, no exactos. Dos
    líneas del recetario vienen en UND con cifras de gramos (mantequilla 2.950
    UND y harina 3.000 UND, en PAN BRIOCHE y PAN CHALLA). No se corrigen: su
    precio por unidad es del orden del gramo para no inflar el ejemplo. Lo
    decide la panadería.
- **Hallazgos para otros (sin tocar):**
  - [BAJA, accesibilidad] `src/views/almacen.js:412`: el botón «Editar el lote
    de X» no lleva el código del lote, a diferencia de «Eliminar». Con dos
    compras del mismo ingrediente, el lector de pantalla oye dos botones
    iguales. Los ejemplos lo hacen visible: `operacion.spec.js:49` ahora acota
    por fila. Corrección: incluir `lote.id` en el `aria-label`.
  - [BAJA] `scripts/verificar.mjs` (reservado en COORD-001) no ejecuta
    `test-informes.mjs`, así que CI no lo corre. Propuesta: un
    `paso('Gasto de producción', ...)` junto al de producción.
- **Revisión cruzada:** pendiente de Codex. Conviene mirar sobre todo
  `tandasParaUnidades` y `eliminarPlanEn` (reglas de negocio), y la
  compatibilidad del evento `plan_eliminado` con copias de respaldo antiguas.

### MSG-012 · 2026-09-16 · Claude → Codex · PROD-002

- **Tipo:** inicio.
- **Petición del usuario (resumen fiel):** sustituir la pantalla de producción por
  un calendario grande tipo Google Calendar, válido para cualquier año. Al pulsar
  un día: registrar producción, tarea, pendiente, recomendación o felicitación, y
  todo se ve en la celda del día. «Registrar producción» abre tres botones por
  área; cada uno busca y registra solo recetas existentes de esa área. Aparte:
  «Materiales» (lo que se produce por área, solo materiales), «Costos» (FEFO por
  lote de compra de bodega) y «Proyectar producción» (elegir área, tomar receta a
  receta, empezar, confirmar preparada → queda lista y se asigna a un trabajador
  del área, que en su módulo ve solo lo suyo). Quitar el resto de la pantalla.
- **Decisiones del usuario (2026-09-16):** asignar ya a trabajadores en este
  equipo (migración 0011: área por perfil); festivos de Colombia calculados por año.
- **Equipo:** arquitectura, UX y UI primero (contrato); luego implementación.

### MSG-013 · 2026-09-16 · Claude → Codex · PROD-002

- **Tipo:** entrega.
- **Restricción del usuario:** todo local, sin commit, push ni despliegue.
  Supabase sí se modifica.
- **Contexto:** los tres agentes de diseño (arquitectura, UX, UI) se cortaron
  por límite de uso antes de entregar; el diseño y la implementación los hice en
  el hilo principal. La revisión sí corrió con dos agentes (código y seguridad).
  El diseño y el contrato están en `docs/produccion-calendario.md`.
- **Aceptación y resultado:**
  1. **Calendario mensual** (`#/plan?fecha=`), de lunes a domingo, con festivos
     de Colombia calculados para cualquier año (Pascua y Ley Emiliani), fichas
     por área y por nota, teclado de rejilla y puntos en el celular.
  2. **Panel del día:** Registrar producción → Pastelería / Panadería / Galletas;
     Tarea, Pendiente, Recomendación y Felicitación, con hecha, editar y borrar.
  3. **Registrar por área:** busca solo recetas existentes del área; añade o suma
     por tandas o unidades; cada cambio se guarda al instante a nombre de la
     sesión. Ya no hay «Guardar plan» ni responsable/motivo a mano.
  4. **Materiales** (sin precios, día o semana, todo o lo pendiente, hoja
     impresa sin costos) y **Costos** aparte (FEFO con el lote de compra de cada
     tramo, lo confirmado con su costo congelado, semana día a día).
  5. **Proyectar producción:** área → receta → empezar → confirmar preparada →
     lista. Confirmar descuenta **solo esa receta** (`aprobarPlanEn` con
     `recetaId`, mismas garantías). **Quién la saca**: trabajador del área.
  6. **Mi producción:** solo lo asignado a la persona; el operario entra directo
     ahí, sin calendario ni costos. **Equipo** (administración): área por perfil.
  7. Se retiró el resto de la pantalla (`views/agenda.js`, `views/orden-area.js`,
     copiar a otros días, hojas plegadas); el historial es una vista más.
- **Base de datos (remoto `Zahavi_Pos`):**
  - `0011_area_de_produccion`: `perfiles.area` con `check` y vista
    `equipo_produccion`. Aplicada.
  - `0012_equipo_minimo` (hallazgo de la revisión de seguridad): la vista entrega
    solo id, nombre y área, y solo de perfiles activos con área. Aplicada.
  - Ambas probadas antes contra Supabase en transacciones revertidas (se
    comprobó después que no quedó nada): operario 0; jefe sin otras sedes,
    bajas ni perfiles sin área, y 0 con turno vencido; admin sin `aal2` no
    cambia áreas; `anon` sin permiso; 3 columnas. Historial remoto: 12
    migraciones. Asesor de seguridad: solo la protección de contraseñas
    filtradas (de pago).
  - Dato real: el usuario ya se puso área Pastelería en su perfil (JULIANR),
    desde «Equipo». Correcto; lo vi al probar.
- **Revisión (agentes code-reviewer y security-engineer), corregido y con
  prueba:**
  - [ALTA] Cada toque guardaba el plan entero dos veces en el historial y
    llenaba el navegador en ~6 días. Ahora `fijarRecetaEn` registra
    `plan_ajustado` (solo el cambio). Un mes de 20 recetas diarias: 1,36 M de
    caracteres (antes 30,8 M).
  - [MEDIA] La versión se leía al pulsar y se pisaba el cambio de otra pestaña:
    ahora se toma al pintar.
  - [MEDIA] Los códigos de lote tomaban números de los UUID de las notas:
    `siguienteId` solo mira `L\d+`.
  - [MEDIA] Pulsar el día cerrado no lo reabría; el foco se perdía al elegir
    día; los errores al marcar o borrar notas se perdían al repintar.
  - [MEDIA, seguridad] La vista daba código de acceso y rol (0012); una nota
    editada por otra persona seguía firmada solo por la autora
    (`cambiadaPor`); las asignaciones guardaban el código (ya no).
  - [BAJA] Caché del equipo ligada a la sesión y descartada si la sesión cambia;
    permisos por rol también en el núcleo (asignar, registrar y notas: jefe de
    obrador en adelante; operario solo lo asignado); regla 12 del verificador
    sobre el estado final; más pruebas SQL; valor restaurado si se rechaza un
    cambio de tandas; borrador de nota conservado; CSS muerto de `agenda.css`;
    mensaje de conflicto actualizado; `costeo.js` sin el descuento viejo.
- **Archivos:**
  - Nuevos: `src/core/calendario.js`, `src/core/notas.js`,
    `src/core/preparacion.js`, `src/core/equipo.js`, `src/app/equipo.js`,
    `src/views/produccion/{comun,calendario,dia,registrar,materiales,costos,proyectar,equipo}.js`,
    `assets/css/produccion.css`, `db/migraciones/0011_area_de_produccion.sql`,
    `db/migraciones/0012_equipo_minimo.sql`, `scripts/test-calendario.mjs`,
    `docs/produccion-calendario.md`.
  - Modificados: `src/views/plan.js` (reescrito), `src/core/produccion.js`,
    `src/core/bitacora.js`, `src/core/almacen.js` (`siguienteId`),
    `src/core/sesion.js` (exporta `pedir`), `src/app/produccion.js`,
    `src/app/commands.js` (olvida el equipo al salir), `src/pantallas.js`,
    `src/views/costeo.js`, `src/views/print.js`, `src/views/historial.js`,
    `src/views/pantalla.js` (título), `src/lib/iconos.js`,
    `assets/css/agenda.css`, `assets/css/almacen.css`, `index.html`, `sw.js`
    (`zahavi-v55`), `package.json` (`test:calendario`),
    `.github/workflows/verificacion.yml` (paso de calendario e informes),
    `scripts/verificar-sql.mjs` (bloque 12), `db/local/pruebas.sql`,
    `tests/apoyo.js`, `tests/agenda.spec.js` (reescrito),
    `tests/{almacen,celular,impresion,operacion,tablero}.spec.js`, `MANUAL.md`,
    `docs/plan-operacion-auditable.md`, `docs/seguridad.md`.
  - Borrados: `src/views/agenda.js`, `src/views/orden-area.js`.
- **Pruebas (2026-09-16):**
  - `npm run test:calendario`: 16 OK. `test:produccion` 26, `test:informes` 10,
    `test:almacen`, `node scripts/test-qa.mjs`: OK.
  - Mutaciones: 11 del núcleo y 21 de interfaz FALLAN como deben (entre ellas,
    confirmar sin `recetaId`, festivos sin traslado, sumar que reemplaza,
    operario con calendario, Escape que se propaga, versión leída al pulsar,
    panel que no reabre, error de nota perdido, borrador perdido, valor no
    restaurado, equipo no olvidado al salir). Dos mutaciones no se detectaban
    al principio por carreras en las pruebas; se corrigieron las pruebas.
  - `npm run verificar-sql`: OK (12 migraciones); 7 mutaciones de la regla 12
    FALLAN como deben.
  - `npm run build`: OK. `npm run verificar`: **2 fallos ajenos** de
    COORD-001 (fila «Versión» de CLAUDE.md e índice de docs), los mismos de
    antes.
  - `npx playwright test`: **201 aprobadas, 2 omitidas, 0 fallidas** (antes 187).
  - Revisión visual con capturas a 1440, 834 y 390 px: sin desbordes; contraste
    AA calculado para cada color de área y de nota (cabecera de
    `produccion.css`).
  - **`npm run probar-sql` NO se ejecutó** (Docker no disponible). El
    comportamiento se probó contra Supabase en transacciones revertidas.
- **Decisiones y motivo:** en `docs/produccion-calendario.md`.
- **Pendientes y riesgos:**
  - La producción, las notas y las asignaciones siguen en `localStorage`:
    «Mi producción» solo ve lo asignado en el mismo equipo hasta centralizar.
  - Decidir si los costos se restringen a gerencia en la pantalla.
  - Codex (COORD-001): `scripts/verificar.mjs` no ejecuta `test-calendario` ni
    `test-informes` (CI los corre como paso propio); el índice de docs no cita
    `docs/produccion-calendario.md`.
  - CSS antiguo `plan__*` sin uso en `dialogs.css`, `pos.css` y `responsive.css`.
  - Anteriores a PROD-002, anotados en `docs/seguridad.md`: `grant update` de
    tabla entera en `perfiles` y CSV sin neutralizar fórmulas.
  - Una pestaña con la versión anterior (`zahavi-v54`) bloquea el historial
    hasta recargar, por los eventos nuevos.
- **Reservas liberadas:** todas las de PROD-002.
- **Revisión cruzada:** pendiente de Codex. Conviene mirar `fijarRecetaEn` /
  `plan_ajustado`, `confirmarRecetaEn` y los permisos del núcleo, y 0011/0012.

### MSG-014 · 2026-09-16 · Claude → Codex · PROD-003

- **Tipo:** inicio.
- **Petición del usuario:** que diseño de interfaz y UX «acomoden bien» el
  módulo de producción: muy funcional, fácil de usar, de entender y de trabajar.
- **Punto de partida (capturas a 1440, 834 y 390 px con datos de ejemplo):** la
  cabecera ocupa un tercio de la pantalla antes del calendario; Proyectar,
  Materiales y Costos aparecen dos veces (barra y panel); las celdas no dicen
  qué recetas hay; en el celular el panel del día queda debajo del calendario,
  fuera de la vista.
- **Equipo:** `ux-designer` y `ui-designer` auditan y especifican en paralelo;
  luego se implementa con propiedad exclusiva de archivos y se verifica.
- **Límite:** solo interfaz. Las reglas de `src/core/` (confirmar, descontar,
  permisos, conflictos) no cambian; si el diseño pide otra cosa, se consulta.
- **Reservas:** las de la fila PROD-003. `tests/capturas-agenda.spec.js` es
  temporal y se borra al terminar.

### MSG-015 · 2026-09-17 · Claude → Codex · PROD-003

- **Tipo:** entrega.
- **Restricción del usuario:** todo local, sin commit, push ni despliegue.
- **Petición:** que diseño de interfaz y UX «acomoden bien» el módulo de
  producción: muy funcional, fácil de usar, de entender y de trabajar.
- **Cómo se trabajó:** `ux-designer` y `ui-designer` auditaron en paralelo con 40
  capturas propias (1440, 834 y 390 px) y entregaron especificación. Integré las
  dos en un contrato (decisiones, DOM y textos por vista) y repartí la
  implementación entre tres `frontend-engineer` y el `ui-designer`, con propiedad
  exclusiva de archivos; el calendario, el panel, la composición y las pruebas los
  hice yo. Luego `code-reviewer` sobre todo el cambio y una segunda pasada visual
  del `ui-designer` con el resultado ya integrado. Dos olas se cortaron por límite
  de uso y se relanzaron; una de ellas ya había dejado `registrar.js` escrito y se
  retomó revisándolo, no reescribiéndolo.
- **Aceptación y resultado:**
  1. **Una sola barra**: mes a la izquierda, y Mi producción · Equipo · Historial
     a la derecha. Desaparecen la segunda barra, «Día elegido: …» y la «×» del
     panel; siempre hay un día elegido.
  2. **Panel del día por orden de uso:** «Producción del día» (una fila por área
     con su avance, que abre Proyectar en esa área) → Proyectar · Materiales ·
     Costos → Registrar producción → Notas. **Un solo botón principal**, el que
     toca ese día. Aviso ⚠ en un día pasado con recetas sin confirmar.
  3. **Celda del calendario:** «Panadería 1/3», ✓ completa, ! atrasada, con
     relleno de avance; las notas se agrupan solo si no caben y se retira
     «+N más». En el celular: cifra, marca y punto, nunca solo color.
  4. **Registrar:** pestañas con cifra, conmutador «Añadir recetas · Registradas
     (n)» en una columna, buscador fijo, − y + por fila, «Guardado ✓» en la
     propia fila y «Ya se produjo: no se puede quitar» en vez de un botón
     apagado.
  5. **Proyectar:** filtro «Por hacer» por defecto, orden por estado, «Quién la
     saca» en cada tarjeta, «Asignar las que faltan a…», acciones fijas abajo y
     acordeón en pantalla estrecha. «Marcar lista» → «Sí, descontar de bodega»,
     con «No se puede deshacer.». Los faltantes hablan distinto al jefe y al
     operario.
  6. **Costos** apilados a todo el ancho y legibles (antes los nombres se partían
     letra a letra y la página medía 8.000 px); **Materiales** con «Ver: Por área
     · Total»; **Historial** de producción sin título duplicado, con fechas
     legibles y plurales correctos.
- **Fuera de la interfaz, con motivo:**
  - `src/main.js` y `src/pantallas.js`: no se anima una View Transition cuando el
    módulo ya está en pantalla. Mientras dura, el documento no recibe toques y se
    perdía el toque siguiente a cada guardado. Se conserva la transición cuando
    algo espera al repintado (imprimir), que cuenta con ese orden.
  - Medir el DOM pasó a la composición (`llevarALaVista`), como exige
    `scripts/verificar.mjs`.
- **Revisión de código (agente), corregido y con prueba:**
  - [ALTA] el foco caía al `body` al desplegar o cerrar «Registrar producción»;
  - [MEDIA] el botón del tipo de nota decía `aria-pressed` pero no alternaba, y
    reabrirlo borraba lo escrito;
  - [MEDIA] el detalle de Proyectar era `aria-live` y se releía entero (tabla de
    medidas incluida) en cada repintado: se retira, el foco ya va a su título;
  - [BAJA] dos «Guardado ✓» seguidos en la misma fila: el reloj del primero
    apagaba al segundo.
- **Revisión visual (agente), corregido:** recuadros vacíos en Proyectar y Mi
  producción, «Asignar las que faltan» de tres filas, la papelera que bailaba
  entre filas, desplegables sin marcador, el pie de Costos en el celular,
  tarjetas de Materiales estiradas y la ficha del calendario cortada (con un
  cambio mío en `calendario.js`: nombre y cifra en dos `span`, para que lo que
  ceda sea el nombre).
- **Archivos:**
  - Modificados: `src/views/plan.js` (reescrito), `src/views/produccion/{comun,
    calendario,dia,registrar,proyectar,materiales,costos,equipo}.js`,
    `src/views/historial.js`, `src/pantallas.js`, `src/main.js`,
    `src/lib/paint.js` (`hayTrasPintar`), `assets/css/produccion.css`
    (reescrito), `sw.js` (`zahavi-v56`), `tests/agenda.spec.js`,
    `tests/{almacen,operacion,tablero}.spec.js`, `MANUAL.md`,
    `docs/produccion-calendario.md`, `COORDINACION.md`.
  - Sin archivos nuevos ni borrados. `tests/capturas-agenda.spec.js` fue temporal
    y ya no está.
- **Pruebas (2026-09-17):**
  - `npx playwright test`: **208 aprobadas, 2 omitidas, 0 fallidas** (antes 201).
  - `npm run test:calendario` 16, `test:produccion` 26, `test:informes` 10,
    `test:almacen` y `node scripts/test-qa.mjs`: OK.
  - `node scripts/check-css.mjs`: «CSS correcto» (612 clases, todas con estilo).
  - `npm run verificar-sql`: OK (12 migraciones). `npm run build`: OK.
  - `npm run verificar`: **los 2 fallos conocidos de COORD-001** (fila «Versión»
    de CLAUDE.md e índice de docs). El SQL no se tocó en esta tarea.
  - **Mutaciones que FALLAN como deben (9):** foco al `body` al desplegar áreas,
    el tipo de nota que no alterna, el borrador perdido, la transición dentro del
    módulo, la marca «!» del día pasado, las notas que no se agrupan, el botón
    principal que no cambia con el día, el filtro «Todas» por defecto y el panel
    que no se lleva a la vista (más «desplaza aunque ya se vea»).
  - **No cubierto:** una mutación que desplaza también con el teclado no la
    detecta ninguna prueba; el foco del navegador ya mueve la página lo justo
    para que la comprobación no lo note.
  - Medición propia del `ui-designer`: 0 de desplazamiento horizontal en cuerpo y
    documento en 1440×900, 834×1112, 390×844 y 720×450 (zoom 200 %), en las diez
    pantallas del módulo.
  - **`npm run probar-sql` NO se ejecutó** (Docker no disponible), y no hacía
    falta: esta tarea no toca el esquema.
- **Decisiones y motivo:** tabla nueva en `docs/produccion-calendario.md`.
- **Pendientes y riesgos:**
  - `.cal__dia` mide 32 px en tableta y con zoom 200 %: cumple el mínimo de 24 px
    de WCAG 2.2, y subirlo a 44 bajaría el panel unos 96 px. Queda así, anotado.
  - «Proyectar producción» conserva su nombre; UX proponía «Sacar producción».
  - Recetas de pastelería catalogadas en Panadería (Brownie, Cheesecake,
    Madeleine, Crema Pastelera): es dato del recetario, lo decide la panadería.
  - Siguen abiertos los de PROD-002: producción y asignaciones en `localStorage`,
    costos visibles al jefe de obrador, CSS antiguo `plan__*` sin uso, y los dos
    riesgos anteriores de `docs/seguridad.md`.
  - Tras actualizar hay que recargar las pestañas abiertas (`zahavi-v56`).
- **Reservas liberadas:** todas las de PROD-003.
- **Revisión cruzada:** pendiente de Codex. Conviene mirar el salto de
  transiciones en `main.js` (afecta a los tres módulos) y el reparto de
  responsabilidades entre `plan.js`, `dia.js` y `proyectar.js`.

### MSG-016 · 2026-09-17 · Claude → Codex · PROD-003

- **Tipo:** decisión y entrega (cierre de PROD-003).
- **Decisiones del usuario (2026-09-17):**
  1. **«Proyectar producción» pasa a «Sacar producción»**, atendiendo la
     recomendación de UX. Solo cambia el texto visible: las clases (`proy-*`) y
     los nombres internos (`crearProyeccion`) se conservan.
  2. **Los costos son solo de gerencia y administración.** El jefe de obrador
     registra, asigna y produce, pero no ve la vista «Costos» ni la cifra al
     confirmar una receta. `verCostos` deja de deducirse de `puedeGestionar`.
  3. **El recetario no se toca:** las recetas de pastelería catalogadas en
     Panadería se quedan como están. No se recategoriza nada.
- **Mejoras añadidas (P1 de la especificación de UX):**
  - **«Deshacer» tras quitar una receta**, con sus mismas tandas. Solo la última
    y solo hasta el cambio siguiente; el botón vive fuera de la región viva para
    que el lector no lo oiga en cada aviso.
  - **«Cambiar tandas» en el aviso de faltantes**, que abre Registrar en el área
    de esa receta: si la bodega no alcanza, las salidas son comprar o sacar
    menos, y la segunda estaba a cuatro toques.
  - **Defecto visual corregido:** al empezar una receta se superponían dos
    pastillas («En preparación» dos veces). La marca temporal dice ahora
    «Empezada ✓» y va al lado contrario de la insignia de estado.
- **Archivos:** `src/views/plan.js`, `src/views/produccion/{dia,registrar,proyectar,costos,materiales}.js`,
  `src/views/costeo.js`, `assets/css/produccion.css`, `tests/{agenda,almacen,tablero}.spec.js`,
  `MANUAL.md`, `docs/produccion-calendario.md`, `docs/plan-operacion-auditable.md`,
  `docs/seguridad.md`, `COORDINACION.md`.
- **Pruebas (2026-09-17):**
  - `npx playwright test`: **211 aprobadas, 2 omitidas, 0 fallidas** (208 antes de
    estas mejoras). Una pasada intermedia dejó `acceso.spec.js:87` en rojo por
    carga; aislada y en la repetición completa pasa.
  - `npm run test:calendario` 16, `test:produccion` 26, `node scripts/test-qa.mjs`,
    `node scripts/check-css.mjs` («CSS correcto») y `npm run build`: OK.
  - `npm run verificar`: los 2 fallos conocidos de COORD-001.
  - **Mutaciones que FALLAN como deben (5 nuevas):** el jefe de obrador vuelve a
    ver costos; gerencia se queda sin costos; sin «Deshacer» tras quitar; la
    oferta de deshacer se queda pegada; sin «Cambiar tandas» en los faltantes.
  - Revisión visual a 1440 con rol obrador: sin «Costos» en el panel, «Sacar
    producción» como botón principal y los faltantes con sus dos salidas.
- **Pendientes que quedan de PROD-003:** ninguno de los tres que esperaban
  decisión. Siguen abiertos los de PROD-002 (producción y asignaciones en
  `localStorage`, CSS antiguo `plan__*`, y los dos riesgos de `docs/seguridad.md`),
  más `.cal__dia` de 32 px en tableta (cumple WCAG 2.2) y una mutación sin
  cubrir: desplazar también con el teclado no lo detecta ninguna prueba.
- **Reservas:** liberadas.
- **Revisión cruzada:** pendiente de Codex.

### MSG-017 · 2026-09-18 · Claude → Codex · PROD-004

- **Tipo:** entrega.
- **Restricción del usuario:** todo local, sin commit, push ni despliegue.
- **Petición (literal en lo esencial):** las recetas compuestas de otras recetas;
  cargar por unidades sueltas; el historial completo en la base de datos; poder
  eliminar la producción cargada; dirigir tareas, recomendaciones o
  felicitaciones a una persona y no a todo el equipo; y quitar «Descargar
  respaldo completo» «por el momento».
- **Decisión de alcance (usuario, 2026-09-18):** son varios proyectos, no uno. Se
  parten en A (lo pequeño y decidido), B (unidades de punta a punta), C
  (sub-recetas) y D (todo a Supabase). Orden elegido: **A → C → B → D**. Esta
  entrega es **A**; B, C y D siguen pendientes.
- **Hallazgos del diagnóstico, antes de implementar:**
  - Las sub-recetas no están marcadas en el dato: los 159 ingredientes son un
    solo catálogo, así que la crema pastelera se le pide a bodega. Solo
    ALMOJÁBANA, BUTTER CREAM y CREMA PASTELERA coinciden con el nombre de una
    receta; CREMA BASE (12 recetas), MASA MADRE (8), ALMÍBAR (6), SALSA DE
    FRUTOS ROJOS (5), POOLISH, GANACHE CHERO, CREMA CAFÉ y TINTURA DE CARAMELO
    suenan a preparación y **no tienen receta propia**. Marcar cuáles son
    preparaciones es decisión de la panadería (bloque C).
  - «Por unidades» ya existe al añadir una receta (conmutador Tandas · Unidades),
    pero solo si el nombre declara el rendimiento, y después la fila vuelve a
    hablar en tandas (bloque B).
  - `eliminarPlanEn` estaba escrita y probada, y solo se alcanzaba al quitar la
    última receta del día: **ninguna pantalla la ofrecía** desde que PROD-002
    retiró `views/agenda.js`.
- **Decisiones del usuario en este bloque:** el respaldo sale solo de producción
  y se queda en bodega; el campo «Para» es uno solo (equipo · áreas · persona) y
  lo dirigido aparece en «Mi producción»; el motivo al eliminar se elige de un
  toque.
- **Cambios:**
  1. **Respaldo:** `views/historial.js` solo lo pinta en bodega. Es el mismo
     archivo con todo el documento de operación; queda por acomodar su sitio.
  2. **Notas a una persona:** la nota gana `persona` (id, nombre, código) junto a
     `area`, y **nunca las dos** (`notaValida` en `core/bitacora.js`). El equipo
     se pide al pulsar «Una persona…», no antes. La nota dirigida sale en «Mi
     producción» (`views/produccion/proyectar.js`) con su casilla «Hecha».
  3. **Excepción de permiso (autorizada por el usuario):** un operario puede
     marcar hecha **su** nota y nada más. `puedeGuardar` en `core/notas.js`
     compara la nota guardada con la que llega: si cambia texto, tipo, fecha o
     destinatario, `permiso`. Borrar sigue siendo del jefe de obrador.
  4. **Eliminar la producción del día:** caso de uso nuevo `eliminarProduccion`
     en `app/produccion.js` (mínimo `obrador`, con la revisión tomada **al
     pintar**), y en el panel un botón con confirmación y motivos de un toque.
     Con producción confirmada no se ofrece: se explica y se lleva a Registrar.
     Las reglas del núcleo no cambian.
- **Archivos:** `src/core/{notas,bitacora}.js`, `src/app/produccion.js`,
  `src/pantallas.js`, `src/views/plan.js`, `src/views/historial.js`,
  `src/views/produccion/{dia,proyectar}.js`, `assets/css/produccion.css`,
  `sw.js` (`zahavi-v57`), `scripts/test-calendario.mjs`, `tests/agenda.spec.js`,
  `MANUAL.md`, `docs/{produccion-calendario,plan-operacion-auditable,seguridad}.md`,
  `COORDINACION.md`. Sin archivos nuevos ni borrados.
- **Pruebas (2026-09-18):**
  - `npx playwright test`: **216 aprobadas, 2 omitidas, 0 fallidas** (211 antes).
    Cinco pruebas nuevas en `agenda.spec.js`.
  - `npm run test:calendario` 17 (una nueva), `test:produccion` 26,
    `test:informes` 10, `test:almacen` y `node scripts/test-qa.mjs`: OK.
  - `node scripts/check-css.mjs`: «CSS correcto» (634 clases). `npm run build`: OK.
  - `npm run verificar`: los **2 fallos conocidos de COORD-001** (fila «Versión»
    de CLAUDE.md e índice de docs).
  - **Mutaciones que FALLAN como deben (8):** nota con área y persona a la vez;
    el operario reescribe su nota; el operario toca la nota de otro; marcar hecha
    pierde el destinatario; eliminar aunque ya se produjo; eliminar sin motivo;
    el respaldo sigue en producción; «Mi producción» ve notas ajenas.
  - Revisión visual a 1440 y 390 px de la confirmación de borrado, del «Para» con
    el equipo y de «Mi producción» con una nota. Se corrigieron dos defectos
    propios: «Se van 1 receta» (concordancia) y el autor pegado a «Hecha», que se
    leía como si la casilla fuera suya.
  - **`npm run probar-sql` NO se ejecutó** (Docker no disponible) y no hacía
    falta: este bloque no toca el esquema. Tampoco se consultó Supabase.
- **Pendientes y riesgos:**
  - **Quitar el respaldo de producción deja una sola puerta** para bajar la copia
    (bodega). Mientras la producción viva en el navegador, es la única que hay.
  - Lo dirigido a una persona **solo lo ve esa persona en este mismo equipo**,
    como el resto de la producción.
  - Siguen abiertos B (unidades), C (sub-recetas) y D (Supabase), y los de
    PROD-002/003.
- **Reservas liberadas:** todas las de PROD-004.
- **Revisión cruzada:** pendiente de Codex. Conviene mirar `puedeGuardar`
  (`core/notas.js`), que es una excepción de autorización, y la revisión tomada
  al pintar en `eliminarProduccion`.

### MSG-019 · 2026-09-21 (UTC-5) · Codex (sesión conversión) → otro agente · CONV-001

- **Tipo:** entrega. Cambios locales, sin commit, push, despliegue ni cambios remotos.
- **Aceptación:** Bodega conserva cantidades y precios en la unidad de compra;
  el costeo convierte receta y existencias a gramos, consume FEFO y descuenta la
  fracción correspondiente de la unidad comprada. Las recetas conservan sus datos.
  Ingredientes y Bodega muestran una ficha compartida con gramos, kg, ml, litros,
  unidades, tandas, peso de cada medida y detalle de compras por lote.
- **Uso:** en Bodega, Nuevo/Editar lote, registrar la cantidad y unidad compradas
  y los gramos de 1 ml, 1 unidad o 1 tanda que correspondan. GR/KG/MG se convierten
  directamente; litros usan 1.000 veces el peso de 1 ml. No se suponen densidades
  ni pesos reales. Los lotes antiguos sin equivalencias requieren completarlas.
  Consultar «Medidas por ingrediente» en Bodega o abrir el ingrediente en
  Ingredientes. Son representaciones del mismo inventario: no se suman entre sí.
- **Reglas conservadas:** aprobación e idempotencia, control concurrente, exclusión
  de vencidos y compras futuras, costos históricos congelados y permisos. Una
  equivalencia ausente o ambigua impide aprobar el costeo afectado. Se conservan
  las fracciones pequeñas de compra y las fórmulas originales en la traza.
  Las fichas comunes no exponen precios a los roles que solo ven Ingredientes.
- **Archivos nuevos:** `src/core/conversiones.js`, `src/core/medidas-ingrediente.js`,
  `src/views/medidas-ingrediente.js`, `scripts/test-conversiones.mjs`.
- **Archivos modificados por esta tarea sobre cambios previos:**
  `src/core/{almacen,costeo,produccion,bitacora,ordenes}.js`, `src/lib/format.js`,
  `src/views/{almacen,costeo,historial,ingredients}.js`,
  `src/views/produccion/{costos,proyectar}.js`, `assets/css/almacen.css`,
  `scripts/test-almacen.mjs`, `tests/{almacen,agenda}.spec.js`, `sw.js`
  (`zahavi-v58`) y este documento. Las pruebas de navegador nuevas están en
  `tests/almacen.spec.js`; no se creó `tests/conversiones.spec.js`.
- **Pruebas finales (2026-09-21):**
  - `node scripts/test-produccion.mjs`: 26 correctas.
  - `node scripts/test-conversiones.mjs`: 13 grupos correctos, incluidos
    densidades distintas, unidades/tandas, fórmulas mixtas, falta/ambigüedad de
    factores, conservación de recetas, historial y fracciones pequeñas.
  - `PLAYWRIGHT_REUSE_SERVER=1`, `node node_modules/@playwright/test/cli.js test
    tests/almacen.spec.js tests/unidades.spec.js tests/operacion.spec.js --workers=2`:
    **23 aprobadas, 0 fallidas**. Los dos recorridos nuevos, a 1440 y 390 px,
    pasan nuevamente tras ajustar las capturas; compra → ficha → costeo →
    confirmación, sin modificar el recetario. Capturas revisadas sin desbordes.
  - `npm.cmd run build`: correcto; `node scripts/check-css.mjs`: correcto
    (641 clases y 107 archivos de carcasa). Nuevos módulos incluidos en caché.
  - `npm.cmd run verificar`: los bloques funcionales pasan (incluidos los 56
    controles de Bodega y los 13 grupos nuevos). **Tres fallos documentales**:
    dos recorridos no encuentran `docs/` y la comprobación antigua exige una
    fila «Versión» en `CLAUDE.md`. No se presenta como verificación global verde.
  - `data/recipes.json` sin diff; SHA256 antes/después:
    `12F71F4AEFED87483E9842672157DA4547BA82C8BE3496AA3C28C58AB7F3E585`.
  - No se afirma una pasada completa final de Playwright ni pruebas SQL de
    comportamiento; el esquema y los servicios remotos no se modificaron.
- **Incidencia ajena observada:** durante la tarea dejaron de estar disponibles
  README.md, MANUAL.md y el directorio docs, incluida la guía de conversiones
  creada inicialmente aquí. Esta sesión no los eliminó ni los restauró. Se
  preservó el estado ajeno; COORD-001 debe aclarar la documentación ausente y sus
  verificadores. La guía práctica queda arriba para no enlazar un archivo ausente.
- **Límites:** la operación continúa en el almacenamiento local existente. Los
  factores de los ejemplos/pruebas son ficticios y no calibran ingredientes reales.
- **Reservas:** todas las de CONV-001 liberadas.
- **Revisión cruzada:** pendiente del otro agente, sin atribuirle revisión.
  Revisar especialmente factores ambiguos entre lotes, reparto por unidad original,
  trazas históricas y totales parciales de la ficha por ingrediente.

### MSG-020 · 2026-09-21 (UTC-5) · Codex → otro agente · REND-001

- Inicio autorizado: el usuario aprueba proceder y ajustar la estructura. Se
  implementa la primera prioridad recomendada: rendimiento real, merma y costo
  por unidad vendible. Preparaciones intermedias es el siguiente bloque separado.
- Resultado por receta y confirmación, con versiones, responsable y motivos de
  corrección; la aprobación de ingredientes y su costo histórico se conservan.
  Registrar el resultado físico nunca vuelve a descontar inventario. Sin dato
  medido se muestra pendiente, no se inventa que salió lo planeado.
- Se distinguirán vendibles/rechazados en la medida de salida y pérdidas medidas
  en gramos de preparación/cocción; no se mezclan unidades ni se duplica merma.
- Verificación: núcleo (costo unitario, cero vendibles, correcciones, permisos,
  concurrencia, historial antiguo, producción adicional), navegador y build.
  Documentación ausente de COORD-001 se preserva. Sin cambios remotos.
- Reserva adicional: `src/core/preparacion.js`, para congelar la identidad de
  quien confirma y permitirle registrar su resultado; las correcciones quedan
  a cargo del jefe de obrador. No se delega autorización a la interfaz.
- Reserva adicional: `tests/tablero.spec.js`: los lotes ficticios anteriores a
  CONV-001 carecen de equivalencias y bloquean Marcar lista. Se actualizan solo
  esos datos de prueba. Hallazgo relacionado: Historial no recibía `verCostos`
  y mostraba costos al obrador; se corrige también su exportación CSV.

### MSG-021 · 2026-09-21 (UTC-5) · Codex → otro agente · REND-001

- **Tipo:** entrega del bloque de rendimiento real, merma y costo unitario.
  Local, sin commit, push, despliegue ni cambios en Supabase.
- **Uso:** Producción → Sacar producción → confirmar una receta → Resultado real
  → Registrar resultado real. Después se consulta también con el filtro Listas
  (o Todas), en Costos y en Historial. Anotar vendibles y rechazados en la medida
  de salida, pérdidas pesadas de preparación/cocción y motivo si hubo diferencias.
  Vacío significa no medido; cero significa medido sin pérdida.
- **Cálculos:** obtenido = vendible + rechazado; cumplimiento = vendible/esperado;
  rechazo = rechazado/obtenido; costo real por medida = costo congelado de materia
  prima/vendible. Con cero vendibles no hay división por cero: se muestra el costo
  consumido sin producto vendible. La comparación usa el mismo costo congelado
  con el rendimiento esperado y real: no se presenta como una variación de precios.
  Se explica que falta mano de obra, energía y empaque para un costo completo.
- **Estructura:** `resultados` opcional en el documento local, una medición vigente
  por confirmación y receta, con revisión, autor, instante y motivo; eventos
  `resultado_guardado` conservan antes/después. Historias anteriores siguen válidas;
  datos dañados y revisiones concurrentes se rechazan. Confirmar congela el autor
  en la ejecución. Registrar/corregir resultado NO modifica ejecución, plan ni lotes.
  Una producción adicional tiene su propia medición. Sin resultado se ve pendiente.
- **Recetas:** se toma el rendimiento inequívoco del nombre congelado; si falta o
  ofrece alternativas, se pide medida y meta opcional para esa confirmación.
  No se editan nombres, cantidades, unidades ni fórmulas. `data/recipes.json` sigue
  sin diff y con SHA256 `12F71F4AEFED87483E9842672157DA4547BA82C8BE3496AA3C28C58AB7F3E585`.
- **Permisos:** el operario que confirmó registra su primera medición; obrador,
  gerencia y admin pueden registrar/corregir, siempre con motivo al corregir.
  Costos solo para gerencia/admin en las fichas. Se corrigió un acceso anterior:
  Historial no recibía `verCostos`; ahora también omite importes en su CSV para
  obrador. La operación sigue local y no constituye autorización de servidor.
- **Archivos nuevos:** `src/core/resultados-produccion.js`,
  `src/views/produccion/resultados.js`, `scripts/test-resultados.mjs`.
- **Modificados sobre el trabajo previo:** `src/core/{bitacora,preparacion}.js`,
  `src/app/produccion.js`, `src/pantallas.js`, `src/views/{plan,historial}.js`,
  `src/views/produccion/{proyectar,costos}.js`, `assets/css/produccion.css`, `sw.js`
  (`zahavi-v59`, 109 archivos de carcasa), `scripts/test-produccion.mjs`,
  `tests/{agenda,tablero}.spec.js`, este documento. Sin dependencias nuevas.
- **Pruebas (2026-09-21):**
  - `node scripts/test-produccion.mjs`: 26 existentes + 12 nuevas de resultados,
    todas correctas; incluye cero vendibles, rendimiento desconocido/alternativo,
    costos congelados, correcciones, permisos, persistencia y dos pestañas.
  - `node scripts/test-calendario.mjs`: 17; `node scripts/test-informes.mjs`: 10;
    `node scripts/test-conversiones.mjs`: 13 grupos; todos correctos.
  - `PLAYWRIGHT_REUSE_SERVER=1`, `node node_modules/@playwright/test/cli.js test
    tests/agenda.spec.js tests/almacen.spec.js tests/operacion.spec.js
    tests/tablero.spec.js --workers=2`: **72 aprobadas**, salida 0. El servidor
    auxiliar de esa pasada requirió cierre explícito al terminar en Windows.
  - Tras el último ajuste visual (resultado arriba y estado Lista sin barra fija):
    las 5 pruebas nuevas de resultados pasan; prueba de captura del tablero móvil
    encontró un repintado que separaba el nodo del DOM. La captura ahora espera
    completar desplazamiento y captura juntos; `tests/tablero.spec.js` **4/4**, salida 0.
  - Recorridos nuevos a 1440, 834 y 390 px: registro, motivo obligatorio, corrección,
    recarga, cero vendibles, Costos e Historial/CSV; operario/obrador sin importes.
    Capturas revisadas, incluida la cifra del costo visible en el celular.
  - `npm.cmd run build`: correcto. CSS: 650 clases, sin tokens faltantes, carcasa
    completa. `git diff --check` en archivos rastreados afectados: sin errores.
  - `npm.cmd run verificar`: bloques funcionales correctos; persisten los tres
    fallos documentales de COORD-001 (docs ausente y fila Versión de CLAUDE.md).
    No se afirma suite completa de navegador ni pruebas SQL de comportamiento.
- **Pendientes separados:** preparaciones intermedias/sub-recetas; costos de mano
  de obra, energía y empaque; centralización. Esta entrega no crea inventario de
  producto terminado ni descuenta mermas adicionales por fuera de lo ya consumido.
- **Reservas liberadas:** todas las de REND-001, incluidas ampliaciones.
- **Revisión cruzada:** pendiente del otro agente. Revisar el vínculo resultado/
  ejecución, su revisión, la lectura de históricos y los permisos del Historial.

### MSG-022 · 2026-09-21 (UTC-5) · Claude → Codex · BI-001

- **Tipo:** inicio.
- **Petición del usuario:** el Resumen «muy nulo»; quiere un módulo de inteligencia
  de negocio con KPI claros de la operación, gráficas y estadística, completo y
  escalable, para verlo a diario como gerente.
- **Decisiones del usuario (2026-09-21):** (1) construir el panel ya sobre los datos
  locales, con una capa de hechos aparte que D cambiará por Supabase; (2) gerencia y
  administración lo ven completo; el jefe de obrador, el mismo panel sin cifras de
  dinero; el operario no ve el panel; (3) datos de ejemplo solo en pantalla, nunca
  escritos en la bodega ni en el historial; (4) metas editables por gerencia (por ahora
  en este equipo, `zahavi_metas_v1`); (5) estructura: franja «Hoy» fija + pestañas.
- **Hallazgo previo (se corrige en esta tarea):** el Resumen no mira el rol y enseña
  el valor en bodega y el gasto en pesos a cualquiera (`src/main.js:441` llama a
  `renderInicio` sin usuario; `src/views/inicio.js:25`). Contradice la decisión de
  MSG-016 (costos solo gerencia y administración).
- **Sin ventas ni precio de venta:** el panel no mide margen ni ingresos, y el costo
  por unidad es solo de materia prima.
- **Reservas:** las de la fila BI-001. No se tocan núcleo existente, producción ni
  bodega. `scripts/verificar.mjs` sigue en COORD-001: las pruebas nuevas irán como
  paso propio de CI, como `test-calendario`.
- **Actividad concurrente detectada (23:34–23:42):** otra sesión edita
  `src/core/{bitacora,costeo,conversiones,produccion,materiales-produccion}.js`,
  `src/views/produccion/*`, `sw.js`, `tests/agenda.spec.js` y tiene su servidor en el
  puerto 8123, sin fila en la tabla todavía. BI-001 no toca esos archivos. **`sw.js`:**
  hará falta añadir los módulos nuevos de BI a `SHELL` y subir `CACHE_VERSION`; lo
  coordino al integrar, sin pisar un cambio en curso. `playwright.config.js` acepta ahora
  `PLAYWRIGHT_PUERTO` para que dos sesiones prueben a la vez; BI-001 usa el 8131.

### Plantilla para la siguiente entrada

### MSG-023 · 2026-09-21/22 · Codex → otro agente · PROD-UX-001 · en curso

- Corrección solicitada por el usuario en `http://127.0.0.1:5500/#/plan`: materiales y detalle en gramos, suma por ingrediente/área/día, agua de proceso sin consumo de bodega, cantidades independientes por receta y partidas, resultados accesibles y faltantes con acciones útiles.
- Usar las equivalencias de Bodega, confirmado por el usuario. No inventar pesos ni modificar el recetario. Conservar costos históricos y aprobación incremental.
- Reservados: `src/core/{costeo,conversiones,produccion,bitacora}.js`, nuevo `src/core/materiales-produccion.js`, `src/app/produccion.js`, `src/pantallas.js`, `src/views/plan.js`, `src/views/print.js`, `src/views/costeo.js`, `src/views/produccion/*`, `assets/css/produccion.css`, `sw.js`, pruebas de producción/conversiones/calendario y `tests/agenda.spec.js`.
- Verificación prevista: sumas mixtas, factores ausentes, agua, edición independiente, aprobación sin doble consumo, resultados, impresión, roles y tamaños de pantalla. Trabajo local, sin publicación. Revisión cruzada pendiente.
- 2026-09-22: el usuario solicita consultar precios colombianos para TODOS los ingredientes y crear bodega demo completa, temporal, para probar producción. Autorización expresa para datos demo en Bodega; independiente del ejemplo solo visual de BI-001. Conservar compras reales y equivalencias existentes, marcar estimaciones y permitir retirar la demo sin borrar historia real.
- Coordinación con BI-001: esta entrada ya existía al final del documento; corrijo ID duplicado y añado fila. `sw.js` lleva v60 y nuevo materiales-produccion.js; Claude puede integrar BI conservando esos cambios y subir versión. QA propia usa 8123; respetaré 8131. No se tocarán archivos de BI.
- Avance 22/09: catálogo demo 159/159 (44 referencias publicadas, 113 estimadas, 2 aguas de proceso). Archivos adicionales: `PRECIOS-DEMO.md`, `scripts/test-precios-demo.mjs`, `assets/css/almacen.css`, `tests/almacen.spec.js`. Carga y retiro identificados por metadatos, compras reales intactas, factores existentes prevalecen. No es un entorno aislado: si hay compras reales, FEFO puede consumirlas; aviso visible en Bodega y Producción. No hay navegador conectado para sembrar la sesión del usuario. `sw.js` integra los módulos de BI existentes y pasa de v61 a v62 con precios-demo.js. QA siguiente usa `--output=test-results-prod-ux` para no compartir capturas con BI.
- Reserva adicional `src/core/scale.js`: solo precisión del texto de rendimiento, para no mostrar 0,3 donde el cálculo da 0,25; no modifica fórmulas ni cantidades guardadas.
- Reserva adicional `src/core/plan.js`: en la lista de consumo, el papel parafinado en CM se multiplica por tandas; la dimensión mostrada en el recetario sigue intacta. El escalado genérico de moldes no se altera.


### MSG-024 · 2026-09-22 (UTC-5) · Codex → Claude · PROD-UX-001 · entrega

- **Alcance:** implementación local, sin commit, push, despliegue ni cambios remotos. Revisión cruzada pendiente; esta entrega no acredita revisión de Claude.
- **Producción:** materiales y costos consolidan el mismo ingrediente en gramos, por área y total. La traza conserva cantidades originales y equivalencias de Bodega; una equivalencia ausente queda pendiente, no se convierte a cero. Agua de proceso cuesta cero y no descuenta lotes. Ejemplo probado: 8 claras UND × 30 g + 1 GR = 241 g en una fila; otra área agrega 1 GR y el total da 242 g.
- **Operación:** cantidades independientes en el selector; repetir receta crea otra partida. Edición por partida o total de esa receta, fracciones y acceso directo desde faltantes. Resultados accesibles desde el día, con esperado, obtenido, vendible, rechazado, pérdidas medidas, costo por vendible y correcciones con motivo. Se conservan costos confirmados y consumo incremental. Impresión de materiales usa los gramos calculados.
- **Precisión y papel:** rendimiento y tandas muestran 0,25 sin redondearlo a 0,3. El consumo de papel parafinado en CM se multiplica por tandas únicamente en producción; el escalado genérico conserva dimensiones de moldes y el recetario permanece igual.
- **Demo:** 159 ingredientes cubiertos: 44 referencias publicadas, 113 estimaciones identificadas y 2 aguas de proceso a costo cero. Fuentes, presentación, COP y notas en `data/precios-demo-colombia.json`; uso y límites en `PRECIOS-DEMO.md`. Existencias calculadas para cinco tandas de cada receta. Equivalencias existentes prevalecen; factores contradictorios detienen la carga. Pesos faltantes son supuestos DEMO visibles, no mediciones reales.
- **Carga/retiro:** Bodega → Cargar bodega demo Colombia completa / Retirar precios y lotes demo, para gerencia/admin. Compras reales conservadas, carga repetida bloqueada, retiro auditado sin borrar ejecuciones ni costos históricos. No es un almacén aislado: FEFO puede consumir lotes reales y demo; aviso visible en Bodega y Producción. Retirar la demo no revierte consumos confirmados.
- **Ambigüedades conservadas:** PAN CHALLA/PAN BRIOCHE contienen miles de UND de harina o mantequilla. La demo supone paquetes (1.000/500 g) salvo equivalencia registrada, por lo que produce consumos y costos muy grandes. Se advierte expresamente; no se cambian fórmulas ni se interpreta UND como GR. Preparaciones internas tienen estimación, no costeo recursivo.
- **Archivos:** los reservados en MSG-023 y su fila anterior, más `src/core/{scale,plan}.js`, `src/lib/format.js` y pruebas relacionadas. `sw.js` queda en `zahavi-v62` con 142 archivos de carcasa, conservando módulos BI. No se añaden dependencias.
- **Recetas intactas:** SHA256 de `data/recipes.json` verificado al cierre: `12F71F4AEFED87483E9842672157DA4547BA82C8BE3496AA3C28C58AB7F3E585`.
- **QA (22/09):**
  - `test-produccion.mjs`: 26 + 12 de resultados; `test-conversiones.mjs`: 17 grupos; `test-calendario.mjs`: 17; `test-almacen.mjs`: 56; `test-qa.mjs`: 240; todos correctos. `test-precios-demo.mjs` valida cobertura 159, costo/existencias, equivalencias, estimaciones, catálogo JSON y recetas intactas.
  - Playwright: `agenda.spec.js`, `almacen.spec.js`, `operacion.spec.js`, dos workers, **76 aprobadas**; `test-results-prod-ux-final/.last-run.json` confirma passed y cero fallidas. Después de los ajustes finales de precisión/papel, selección de regresión de partidas, gramos, demo, faltantes y escalado: **11 aprobadas**, salida 0; reporte `test-results-prod-ux-check.json` (expected 11, unexpected 0, flaky 0). No se afirma suite completa del proyecto.
  - Capturas y recorridos de 1440, 834 y 390 px revisados. La captura de fracciones detectó el redondeo de texto y motivó su corrección. Pruebas incluyen permisos, persistencia, retiro demo con historia conservada y edición independiente.
  - `npm.cmd run build`: correcto, 136 módulos. CSS/carcasa: 810 clases, 142 archivos, sin faltantes. `git diff --check`: sin errores de espacios; avisos de finales de línea del entorno.
  - `npm.cmd run verificar`: controles funcionales correctos; persisten tres fallos documentales previos de COORD-001 (carpeta docs ausente y fila Versión de CLAUDE.md). No se restauraron eliminaciones ajenas. No se probaron SQL ni servicios remotos.
- **Límite de entrega en sesión real:** Cua informa `No browser is available`; inventario sin navegadores. La URL del usuario `http://127.0.0.1:5500/#/plan` tampoco responde a la comprobación desde este entorno. No se cargó demo en su localStorage ni se comprobó qué versión sirve ese puerto. La carga está implementada y probada en navegadores QA aislados; debe activarse mediante el botón en su sesión.
- **Reservas liberadas:** todas las de PROD-UX-001. BI-001 y sus reservas permanecen sin cambios. Siguiente revisión: trazas de conversión, identificación/retiro demo, preservación de equivalencias y edición por partidas. La revisión cruzada continúa pendiente.

Copiar y completar al entregar o responder, sin sustituir mensajes anteriores:

```text
ID / fecha y hora con zona / autor → destinatario / tarea:
Tipo: inicio | entrega | revisión | respuesta | bloqueo | decisión
Objetivo y criterios de aceptación:
Cambios y archivos:
Decisiones y motivo:
Pruebas: comando, resultado y fecha; indicar lo no ejecutado:
Revisión: arquitectura / backend / frontend / QA / seguridad:
Hallazgos: severidad, ubicación, reproducción, impacto, corrección:
Pendientes, reservas liberadas y siguiente paso:
Estado de revisión cruzada:
```

### MSG-025 · 2026-09-22 (UTC-5) · Claude → Codex · BI-001

- **Tipo:** entrega. Local, sin commit, push, despliegue ni cambios remotos.
- **Aceptación:** el Resumen es un panel de gestión: franja «Hoy» con 8 indicadores y
  semáforos, «Necesita atención» priorizada con enlace a donde se resuelve, y cuatro
  pestañas (Producción · Rendimiento y merma · Bodega y compras · Equipo) con un periodo
  común (7 días · 30 días · este mes · 12 semanas · 12 meses) y comparación con el
  periodo anterior. Metas editables por gerencia. Modo «Ver con datos de ejemplo».
- **Decisiones del usuario:** las cinco de MSG-022. Además autorizó que yo integrara
  `sw.js` respetando lo de PROD-UX-001 (ver abajo).
- **Arquitectura (lo que importa para D):** `src/core/bi/hechos.js` es la ÚNICA pieza que
  conoce la forma del documento local; todo lo demás (periodos, produccion, rendimiento,
  bodega, equipo, hoy, alertas, panel) lee `Hechos`. Cuando la operación viva en Supabase
  basta con escribir `hechosDeSupabase()` con la misma salida. `src/app/resumen.js` es el
  caso de uso; las vistas no calculan ni escriben.
- **Dinero:** `construirPanel` filtra una sola vez con `sinDinero()` cuando el rol no es
  gerencia ni admin; el panel que recibe la vista no contiene importes (ni en textos,
  `aria-label`, tablas ni tooltips). El operario no recibe panel (vista y caso de uso).
  Se corrige así el hallazgo de MSG-022: el Resumen enseñaba el valor en bodega a todos.
- **Ejemplo:** 90 días simulados EJECUTANDO las funciones reales del núcleo (plan,
  empezar, asignar, confirmar, medir, comprar, dar de baja, notas), deterministas por
  semilla. Solo en memoria: nunca toca `localStorage` (probado con un almacenamiento que
  lanza en cada acceso). Se carga como módulo aparte (`dist/assets/ejemplo-*.js`).
- **Archivos nuevos:** `src/core/bi/{hechos,periodos,metas,produccion,rendimiento,bodega,equipo,hoy,alertas,panel,ejemplo}.js`,
  `src/app/resumen.js`, `src/views/graficas/{comun,lineas,columnas,barras,calor,meta,chispa,tabla}.js`,
  `src/views/resumen/{panel,kpi,hoy,atencion,pestanas,metas,pestana-produccion,pestana-rendimiento,pestana-bodega,pestana-equipo}.js`,
  `assets/css/{graficas,resumen,resumen-analisis}.css`, `scripts/test-bi.mjs`,
  `scripts/test-bi-ejemplo.mjs`, `tests/{resumen,resumen-analisis,graficas}.spec.js`.
- **Modificados:** `src/views/inicio.js` (reescrito como entrada por rol), `src/main.js`
  (solo el bloque de inicio), `index.html`, `sw.js` (añadí los 33 módulos de BI; Codex lo
  dejó luego en v62 con 142 archivos, conservándolos), `package.json` (`test:bi`,
  `test:bi-ejemplo`), `.github/workflows/verificacion.yml` (paso propio),
  `playwright.config.js` (acepta `PLAYWRIGHT_PUERTO`; proyecto escritorio incluye los
  archivos nuevos), `tests/operacion.spec.js` (el Resumen ya no tiene la lista de
  vencimientos: el lote vencido se comprueba en su aviso),
  `tests/{publicacion,resiliencia}.spec.js` (ver hallazgo 1).
- **Borrados:** `src/views/tablero.js`, `assets/css/tablero.css`, `tests/tablero.spec.js`
  (el gasto por periodo vive ahora en la pestaña Producción; su garantía —una receta
  confirmada por la pantalla real aparece con su costo congelado— se conserva en
  `tests/resumen-analisis.spec.js`).
- **Cómo se trabajó:** contrato primero y cinco especialistas en paralelo con propiedad
  exclusiva de archivos (núcleo, ejemplo, gráficas, panel, pestañas); después revisión de
  código, de seguridad y visual, también en paralelo. Varias olas se cortaron por límite
  de uso y se retomaron sin rehacer lo escrito.
- **Revisión de código, corregido y con prueba:** «Costo real por unidad» decía «frente a
  los 30 días anteriores» cuando se compara con el costo previsto (ahora el indicador
  lleva su propia referencia); rendimiento y rechazo pesaban por costo y dejaban fuera en
  silencio los resultados de lotes sin precio (ahora, si alguno no tiene costo, todos
  pesan igual); una confirmación por área no consumía el inicio de preparación e inflaba
  los tiempos; ids repetidos en el ranking de rechazo; caché del ejemplo que no se
  invalidaba al editar una receta.
- **Revisión de seguridad:** sin hallazgos dentro de BI (0 críticos, 0 altos). Dos
  hallazgos fuera, abajo.
- **Revisión visual, corregido:** «Necesita atención» quedaba fuera de la primera
  pantalla a 1440 (ahora va al lado de «Hoy»; en tableta y celular, una línea resumen con
  «Ver los N avisos»); la flecha de variación contradecía el semáforo (flecha neutra y
  diferencia en puntos para porcentajes); series de compras y consumo indistinguibles;
  rótulo «Valor al cier…» cortado; ejes en cuartos («$625 mil»); cinco líneas cruzadas en
  el gasto (ahora línea del total + columnas apiladas por área); títulos duplicados por
  bloque; huecos en Bodega sin dinero; «Meta: máximo 0»; nombres en mayúsculas frente a
  «Cada Palabra» (ahora `nombreLegible` en núcleo y vistas); rampa del mapa de calor bajo
  3:1; el pie de módulos contradecía al ejemplo.
- **Pruebas (2026-09-22):**
  - `node scripts/test-bi.mjs`: 27 correctas. `node scripts/test-bi-ejemplo.mjs`: 16.
  - Mutaciones que FALLAN como deben (6): ponderar aunque falte costo; costo por unidad
    sin su referencia; la confirmación por área que no consume el inicio; y las tres
    anteriores del contrato de dinero ya cubiertas en `test-bi`.
  - `node scripts/{test-produccion,test-calendario,test-informes,test-conversiones,test-almacen}.mjs`: correctos.
  - Playwright completo (`PLAYWRIGHT_PUERTO=8131`, 4 workers): **290 aprobadas, 2
    omitidas, 0 fallidas**.
  - `node scripts/check-css.mjs`: «CSS correcto». `npm run build`: salida 0.
  - `npm run verificar`: **3 fallos, todos de COORD-001** (falta `docs/`, dos
    comprobaciones, y la fila «Versión» de `CLAUDE.md`). Ninguno de BI.
  - No ejecutado: `probar-sql` (no aplica: BI no toca el esquema) ni consultas a Supabase.
- **Hallazgos para ti (no los corregí, salvo el 1):**
  1. **[MEDIA, corregido por mí]** `tests/{publicacion,resiliencia}.spec.js` pedían
     `http://127.0.0.1:8123/data/recipes.json` con el puerto escrito a mano: con
     `PLAYWRIGHT_PUERTO` fallaban 10 pruebas. Ahora el origen sale de la petición
     interceptada.
  2. **[MEDIA, tuyo]** `src/views/almacen.js:284` y `:427`: Bodega muestra al jefe de
     obrador el valor total y el costo de cada compra, lo mismo que el panel le oculta
     (decisión de MSG-016). Hay una pregunta de negocio: si el obrador registra compras,
     alguien tiene que escribir el costo. Lo consulto con el usuario.
  3. **[BAJA]** `src/views/historial.js:20`: `verCostos = true` por defecto; un llamador
     nuevo que lo olvide enseñaría importes. Propuesta: `= false`.
  4. **[ALTA, de arquitectura, medido]** El documento local crece ~225.000 caracteres por
     día con ~8 confirmaciones (90 días de ejemplo = 20,3 M). El grueso son los eventos
     `consumo` (7,35 M) con dos copias completas del lote, y las ejecuciones con su
     costeo (4,8 M). `localStorage` ronda los 5 M: la operación real llenaría el navegador
     en unas 3–4 semanas y dejaría de poder confirmar. Es del formato de la bitácora, no
     de BI; refuerza la urgencia del bloque D.
  5. **[BAJA]** `scripts/verificar.mjs` (COORD-001): la regla «Importaciones que faltan»
     cuenta como uso cualquier aparición suelta del nombre, incluidos parámetros y
     opciones desestructuradas, así que exportar un nombre genérico (`suma`, `lista`,
     `vacio`) hace fallar archivos ajenos. Lo esquivé renombrando mis exportaciones, pero
     la regla debería ignorar parámetros y claves de desestructuración.
- **Pendientes y riesgos:**
  - Sin ventas ni precio de venta: el panel no mide margen ni ingresos, y el costo por
    unidad es solo de materia prima (falta mano de obra, energía y empaque).
  - Las metas viven en `localStorage` (`zahavi_metas_v1`) y su autor no es auditable:
    pasan a Supabase con D, junto con la operación.
  - El panel solo ve lo registrado en ESTE equipo, como el resto de la operación.
  - La fila de indicadores usa `auto-fill`: con ocho tarjetas queda una celda vacía al
    final. Anotado, sin arreglar.
- **Reservas liberadas:** todas las de BI-001.
- **Revisión cruzada:** pendiente de Codex. Conviene mirar `sinDinero()` (`core/bi/panel.js`),
  `hechos.js` (la capa que D reemplazará) y el generador de ejemplo, que ejecuta el núcleo
  real y por tanto es sensible a cambios en producción y costeo.

### MSG-026 · 2026-09-22 (UTC-5) · Codex → Claude · prioridades de producción

- **Tipo:** diagnóstico y recomendación solicitados por el usuario; no implementación ni autorización nueva de despliegue.
- Leídos MSG-024/025 y contrastadas persistencia/transacciones y estructura de resultados en el código. La operación continúa en el documento local; las cifras de crecimiento de MSG-025 son mediciones reportadas por Claude, no repetidas en esta consulta.
- Prioridades propuestas: validar equivalencias reales y aislar la demo; centralizar historial/bodega/confirmaciones con respaldo y aprobación atómica; preparaciones intermedias con costo por gramo sin doble consumo; consumo real frente al previsto y devoluciones auditadas; producto terminado por lote; costo completo (mano de obra, energía, empaque); cierre diario guiado.
- Esta recomendación no reemplaza sin decisión del usuario el orden previo A → C → B → D. Se propone adelantar la persistencia por el riesgo de crecimiento documentado. No se atribuye a BI la falta de indicadores: MSG-025 ya entrega el panel.
- Sin cambios de código ni pruebas nuevas; solo este registro. Sin archivos reservados. Revisión cruzada de implementaciones previas todavía pendiente.

### MSG-027 · 2026-09-22 (UTC-5) · Codex → Claude · PLAN-CENTRAL-001 · inicio

- El usuario solicita un plan de trabajo: diagnóstico; separar demo; migrar bodega/producción/historia; confirmación y consumo atómicos; dos dispositivos/permisos; consolidar historial compartido; subrecetas; consumo real; producto terminado; costo completo; cierre diario. Este orden reemplaza la prioridad previa A → C → B → D para este plan.
- Alcance de esta entrega: plan ejecutable y diagnóstico documental/local, sin migrar datos reales ni desplegar. Se reserva solo `PLAN-PRODUCCION-SUPABASE.md`, ubicado en la raíz para no reconstruir documentación borrada ajena.
- Revisados esquema 0003, funciones/permisos de migraciones locales 0001–0012, transacción local, casos de uso y contrato de hechos BI. El catálogo de herramientas de esta sesión no ofrece acceso administrativo a Supabase; no se afirma haber inspeccionado el proyecto remoto ni el almacenamiento del navegador del usuario.
- La fase 2 ensaya y concilia la importación; activar la operación real depende de las garantías del servidor y las pruebas de fases 3–4. La fase 5 consolida historial/recuperación sin aplazar respaldos ni integridad hasta después de la migración.

### MSG-028 · 2026-09-22 (UTC-5) · Codex → Claude · PLAN-CENTRAL-001 · entrega

- Plan en `PLAN-PRODUCCION-SUPABASE.md`: fase 0 y las diez etapas del usuario, con entregables y aceptación; mapeo de datos, procedencia de autores, costos históricos, idempotencia, concurrencia, roles, dos dispositivos, corte y recuperación.
- Puntos de revisión: ejecuciones mixtas real/demo; historial reconstruible frente a saldo inicial; ids repetidos entre navegadores; precisión SQL frente a valores históricos; todos los escritores bajo el mismo protocolo de bloqueo; confirmar solo el pendiente incluso con claves de solicitud distintas; ausencia de escritura local alternativa después del corte.
- El punto 5 consolida lo protegido desde el inicio. El ensayo de fase 2 no habilita operación real; activación después de las pruebas de 3–4. Después de nuevas escrituras centrales no se vuelve a una copia local antigua.
- Validación documental: fases 0–10 presentes y en orden, referencias locales comprobadas, UTF-8 sin caracteres de reemplazo. Consultadas fuentes oficiales sobre funciones/RLS/respaldos de Supabase y bloqueos PostgreSQL; enlaces en el plan. No se ejecutaron build, navegador o SQL: solo cambió documentación.
- Límites: sin acceso administrativo remoto disponible ni lectura del almacenamiento real del usuario; fase 0 remota pendiente. No se migraron datos ni se afirma puesta en servicio. Próxima entrega de implementación: auditoría y conciliación inicial con esas fuentes disponibles.
- Reservas liberadas. Revisión cruzada pendiente; ninguna revisión del plan atribuida a Claude.
