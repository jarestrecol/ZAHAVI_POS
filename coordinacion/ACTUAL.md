# Trabajo actual

Objetivo: ejecutar [el plan](../PLAN-PRODUCCION-SUPABASE.md) en orden 0–10.
Prioridad previa: **GIT-001, versionar en jarestrecol/ZAHAVI_POS**, autorizada por el usuario.
Después: fase 0 de Supabase. Ningún dato operativo migrado.

## Tareas y reservas

| ID | Responsable / revisor | Estado | Archivos reservados |
|---|---|---|---|
| GIT-001 | Codex / Claude pendiente | en curso | .gitignore, README.md, tablero y entrega; snapshot de cambios existentes, remoto y rama main |
| COORD-OPT | Codex / Claude pendiente | lista para revisión | Ninguno; entrega abajo |
| F0-LOCAL | Codex / Claude pendiente | pendiente | Ninguno hasta toma; futuros scripts/auditar-operacion-local.mjs, scripts/test-auditoria-local.mjs |
| F0-REMOTO | Claude, propuesta / Codex | pendiente de toma | Ninguno hasta toma; futuros db/auditoria/operacion.sql, coordinacion/entregas/F0-REMOTO.md |

No hay otras reservas activas del protocolo anterior: AUTH, PROD, CONV, REND, BI y
PLAN entregaron; revisiones pendientes en archivo. COORD-001 queda absorbida por
COORD-OPT en lo documental; no restaurar MANUAL/docs borrados ajenos. README nuevo autorizado en GIT-001.

## Codex: F0-LOCAL

- Construir diagnóstico de respaldo local, solo lectura: estructura, conteos,
  huella, ids repetidos, referencias huérfanas, demo/real/mixto/indeterminado.
- Leer `bitacora.js` (validación), `precios-demo.js` (metadatos), `produccion.js`
  (ejecuciones) y fase 0–2 solo si cambia el contrato; no escanear el recetario.
- No exportar sesiones/secretos ni imprimir datos comerciales. Entrada: copia
  elegida del documento de operación; salida: informe privado y resumen agregado.
- Probar copia íntegra, corrupta, duplicada, lotes retirados e historial mixto.
  Clasificación dudosa no equivale a real; diagnóstico no modifica el origen.
- Entrega: script, pruebas y `entregas/F0-LOCAL.md` con siguiente paso concreto.

## Claude: F0-REMOTO

- Tomar esta fila al empezar. Auditar con su acceso autorizado a Supabase, solo
  lectura: migraciones aplicadas, esquema, conteos, funciones, RLS y privilegios.
- Leer 0003 y consultar definiciones vigentes remotas; abrir otras migraciones solo
  por diferencia. No reaplicar 0001–0012, sembrar ni alterar la base por esta auditoría.
- Preparar consultas reproducibles y comparar el modelo remoto con partidas,
  conversiones, resultados y autoría local. Separar evidencia remota de inferencias.
- Entrega breve `entregas/F0-REMOTO.md`: fecha/proyecto verificado, diferencias,
  respaldo disponible y migraciones necesarias. Sin filas privadas, claves ni tokens.
- Si no hay conexión, registrar ese límite una vez y preparar SQL de lectura.
  No afirmar que está vacío ni repetir descubrimiento de herramientas cada turno.

## Dependencias y reparto siguiente

| Fases | Implementación propuesta | Revisión | Puerta |
|---|---|---|---|
| 1 demo; 2 importación de ensayo | Codex | Claude | F0 conciliada; clasificar mezclas sin borrar historia |
| 3 transacciones y permisos SQL | Claude | Codex | Contrato acordado de importación/precisión/idempotencia |
| 3 cliente remoto y 4 QA | Codex | Claude | API estable y pruebas SQL reales; luego dos dispositivos |
| 5 historia/recuperación | Claude servidor, Codex interfaz | Cruzada | Corte conciliado y restauración probada |
| 6–10 novedades | Repartir al activar cada fase | Otro agente | Fase anterior aceptada; fichas solo cuando se necesiten |

Los nombres de archivos futuros son propuesta; reservar antes de crearlos. El
plan largo es la especificación, este tablero solo mantiene el trabajo inmediato.

## Dependencias externas actuales

- Codex no tiene herramienta administrativa Supabase en esta sesión. La auditoría
  remota no está realizada; Claude debe verificar su propio acceso al tomar la tarea.
- Falta inspeccionar las copias operativas reales por navegador. Las pruebas QA
  no prueban sus saldos. Se puede preparar diagnóstico y SQL sin esos accesos.
- El corte real espera ensayo, respaldo, conciliación y pruebas de servidor. No
  activar dos fuentes editables ni volver a escritura local cuando falle la red.

## Última entrega

[COORD-OPT](entregas/COORD-OPT.md): inicio 96,5 % menor por bytes; historial íntegro;
verificador correcto y 11 comprobaciones del protocolo. Reservas liberadas.
