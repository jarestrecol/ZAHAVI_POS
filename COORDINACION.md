# Coordinación vigente

Actualizado: 2026-09-22. Codex y Claude tienen el mismo alcance; uno implementa y
el otro revisa. Este archivo reemplaza el protocolo largo anterior.

## Lectura mínima

- Leer este archivo una vez; si ya está en contexto, no repetirlo.
- Tomar solo la tarea propia en [ACTUAL.md](coordinacion/ACTUAL.md). Para estado breve:
  `node scripts/contexto.mjs`. Para una fase: `node scripts/contexto.mjs --fase 0`.
- Abrir código por símbolo/rango. No leer repositorio, recetario, plan ni historial
  completos para orientarse. No repetir búsquedas o pruebas sin cambios relevantes.
- Antes de editar: revisar solo reservas y diff de los archivos afectados. Antes
  de entregar: comprobar cambios concurrentes del tablero, no releer documentación.
- Salidas breves; guardar logs extensos en `test-results-coordinacion/` y mostrar
  resumen/errores. No adjuntar el contexto entero a otro agente: tarea, rutas,
  contrato y aceptación bastan. No crear subagentes para simples lecturas.

## Reglas que se conservan

- Sin commit, push ni despliegue implícitos. Respetar cambios ajenos; no limpiar
  archivos ni recuperar borrados anteriores. Reservar archivos antes de editar.
- Recetario intacto. Gramos para calcular, unidad de compra conservada; equivalencias
  explícitas, agua de proceso sin compra. FEFO y solo consumo pendiente.
- Costos confirmados congelados; ajustes con responsable, motivo y traza. Demo
  separada; no inventar equivalencias reales ni autoría autenticada del historial.
- Destino: operación central en Supabase, una fuente editable, confirmación y
  descuento atómicos, sin duplicados. Operación local actual no está sincronizada.
- Costos solo gerencia/admin; permisos en servidor. No registrar secretos ni datos
  privados en documentos, logs públicos o repositorio.
- `core`: reglas; `app`: casos de uso; `views`: DOM/callbacks; composición en
  `pantallas/main`. Usar `lib/dom.js`, sin HTML interpolado. Sin framework nuevo.
- Windows: `npm.cmd`. Pruebas proporcionales: núcleo, SQL real si cambia su contrato,
  navegador si cambia el flujo; build/caché si cambia la aplicación. No declarar
  pruebas no ejecutadas ni revisión ajena. QA Codex 8123, Claude 8131, outputs propios.

## Trabajo y relevo

- Git: `jarestrecol/ZAHAVI_POS`, base `main`; tareas en ramas separadas.
  Integrar cambios revisados; nunca force-push a main.
- El orden aprobado es fases 0–10 del [plan](PLAN-PRODUCCION-SUPABASE.md).
  Consultar solo la fase activa. El punto 5 consolida garantías iniciadas en 0–4.
- [ACTUAL.md](coordinacion/ACTUAL.md) contiene responsables, reservas, bloqueo real y siguiente
  acción. Cambiar la fila propia; no añadir conversaciones sucesivas aquí.
- Entrega: objetivo, archivos, prueba/resultado, riesgo y siguiente paso, máximo
  12 líneas. Lo cerrado va a una ficha en `coordinacion/entregas/`, solo bajo demanda.
- Estados: pendiente, en curso, bloqueada, lista para revisión, revisada. Asignar
  a Claude no inicia su sesión: toma/revisión pendientes hasta que él las registre.
- Límite automático: 4 KB por este archivo, 5 KB tablero, 500 B por entrada.
  Verificación: `node scripts/check-coordinacion.mjs`.

## Consulta solo cuando sea necesaria

- [Mapa de código](coordinacion/MAPA.md): módulo y prueba por tipo de tarea.
- [Archivo histórico](coordinacion/archivo/2026-09-22-coordinacion.md): decisiones y evidencia
  MSG-001–028, preservadas íntegramente; no son instrucciones vigentes ni lectura inicial.
- Riesgos abiertos: crecimiento del documento local; costos visibles al obrador en
  Bodega; `verCostos` permisivo por defecto en Historial; importaciones heurísticas
  del verificador. Detalle y revisión anterior en MSG-025 del archivo.
- Las entregas de conversión, producción, rendimiento y BI siguen pendientes de
  revisión cruzada. No repetirlas completas: revisar solo lo afectado por cada fase.
