# Trabajo actual

Objetivo: ejecutar [el plan](../PLAN-PRODUCCION-SUPABASE.md) en orden 0–10.
GitHub: **jarestrecol/ZAHAVI_POS**, rama `main`, ya publicado con historial.
Activa: **centralización Supabase**, rama `main` en `ZAHAVI_POS`. Migración operativa pendiente de verificar.

Pendientes en orden, con dueño y dependencias: [CHECKLIST.md](CHECKLIST.md)
(`node scripts/checklist.mjs` dice qué está libre ahora).

## Tareas y reservas

| ID | Responsable / revisor | Estado | Archivos reservados |
|---|---|---|---|
| GIT-001 | Codex / Claude pendiente | lista para revisión | Ninguno; subida verificada y reservas liberadas |
| COORD-OPT | Codex / Claude pendiente | lista para revisión | Ninguno; entrega abajo |
| F0-LOCAL | Codex / Claude pendiente | herramienta lista; conciliación pendiente | Ninguno; ver entregas/F0-LOCAL.md |
| F0-REMOTO | Claude / Codex pendiente | lista para revisión | Ninguno; ver entregas/F0-REMOTO.md |
| MIGRACION | Claude / Codex | F3-3: núcleo, bodega y plan aplicados (0018–0020); sigue confirmación (F3-4) | db/migraciones/0014_operacion.sql, db/migraciones/0015…0023_*.sql, db/local/pruebas-{operacion,api}.sql, entregas/CONTRATO-RPC.md, scripts/probar-sql.mjs, scripts/verificar-sql.mjs, scripts/{generar,test}-casos-costeo.mjs, db/pruebas/casos-costeo.json |
| CLIENTE-REMOTO | Codex / Claude | pausada por prioridad F1/F2 del usuario | Ninguno |
| F1-F2-PREP | Codex / Claude | clasificador probado; auditoría remota pendiente | Ninguno; ver entregas/F2-CONCILIACION.md |

No hay otras reservas activas del protocolo anterior: AUTH, PROD, CONV, REND, BI y
PLAN entregaron; revisiones pendientes en archivo. COORD-001 queda absorbida por
COORD-OPT en lo documental; no restaurar MANUAL/docs borrados ajenos. README nuevo autorizado en GIT-001.

## Codex: CLIENTE-REMOTO

- Siguiente: acordar [contrato RPC](entregas/CLIENTE-REMOTO.md) con Claude y conectar pantallas.
- [Revisión 0014](entregas/REVISION-0014.md): precisión, reimportación, demo y autoría pendientes. Claude conserva migración/importador; Codex revisión e interfaz.

- Diagnóstico local probado; Claude puede usarlo en su migración. Detalle en F0-LOCAL.
- No activar el cliente hasta verificar contrato, permisos y transacciones reales.

## Claude: MIGRACION

- Hecho: `0013`, `0014` y `0015` (responde a REVISION-0014) aplicadas y verificadas;
  `probar-sql` cubre la operación. Respaldo nocturno verificado; ensayo pendiente.
- Hecho: `privado.costear()` igual al cliente en los 14 casos (F3-1/F3-2).
- Sigue: funciones de escritura (F3-3). Espera: revisión de 0015–0017 (Codex).
- Detalle y orden completo en [CHECKLIST.md](CHECKLIST.md); fase en el plan.

## Dependencias y reparto siguiente

| Fases | Implementación propuesta | Revisión | Puerta |
|---|---|---|---|
| 1–2 demo e importación | — | — | Resueltas sin importar: operación local es demo (entregas/F1-D.md) |
| 3 transacciones y permisos SQL | Claude | Codex | Contrato acordado de importación/precisión/idempotencia |
| 3 cliente remoto y 4 QA | Codex | Claude | API estable y pruebas SQL reales; luego dos dispositivos |
| 5 historia/recuperación | Claude servidor, Codex interfaz | Cruzada | Corte conciliado y restauración probada |
| 6–10 novedades | Repartir al activar cada fase | Otro agente | Fase anterior aceptada; fichas solo cuando se necesiten |

Los nombres de archivos futuros son propuesta; reservar antes de crearlos. El
plan largo es la especificación, este tablero solo mantiene el trabajo inmediato.

## Dependencias externas actuales

- Claude entregó F0-REMOTO; Codex solo dispone de configuración pública, sin conexión admin.
- Docker sin motor activo; navegador no conectado a Codex. Auditoría remota de Claude;
  pruebas SQL de comportamiento y conciliación de copias locales todavía pendientes.
- Usuario declara toda la data en Supabase. Claude debe refrescar conteos/procedencia
  con db/auditoria/fases_1_2.sql; no exigir copia local antes de verificar esta fuente.
- El corte real espera ensayo, respaldo, conciliación y pruebas de servidor. No
  activar dos fuentes editables ni volver a escritura local cuando falle la red.

## Última entrega

[F0-REMOTO](entregas/F0-REMOTO.md): remoto auditado, operación vacía, cruce por código/nombre
verificado; TRUNCATE corregido por 0013 y respaldo del destino pendiente.

[F0-LOCAL](entregas/F0-LOCAL.md): diagnóstico y pruebas listos; falta copia operativa real.
