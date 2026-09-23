# Lista de trabajo

Una línea por cosa que hay que hacer, en el orden en que conviene hacerla.
`[ ]` libre · `[~] Dueño` en curso · `[x]` hecha. Antes de tomar una: escribe tu
nombre, y si toca archivos, resérvalos en [ACTUAL.md](ACTUAL.md). Al terminar, `[x]`.
Nadie toma algo cuyo `←` (lo que necesita) no esté en `[x]`. Detalle de cada fase
en el [plan](../PLAN-PRODUCCION-SUPABASE.md): `node scripts/contexto.mjs --fase N`.

Libres ahora mismo: `node scripts/checklist.mjs`.

## Por qué este orden

Nada se importa antes de saber qué hay (F0) y qué es demo (F1). Nada se escribe
desde la aplicación antes de que el servidor sepa descontar sin duplicar (F3).
El corte va al final, cuando existe respaldo y vuelta atrás probada (F5).
El respaldo del destino se verifica antes del ensayo que escriba datos reales.
F0-5 registra la revisión; F0-9 cierra sus hallazgos antes de activar el contrato.

## Fase 0 · Saber qué hay y proteger las fuentes

- [x] F0-1 · Auditar el remoto: esquema, permisos, conteos · Claude
- [x] F0-2 · Cerrar el TRUNCATE de auditoría (0013) · Claude
- [x] F0-3 · Esquema de la operación (0014), aplicado y verificado · Claude
- [x] F0-4 · Contrato de costeo FEFO en casos ejecutables · Claude
- [x] F0-5 · Revisar 0014; hallazgos en entregas/REVISION-0014.md · Codex ← F0-3
- [x] F0-H · Herramienta de diagnóstico local probada; no certifica copias reales · Codex
- [ ] F0-6 · Verificar fuente actual: usuario declara toda la operación en Supabase · Claude ← F0-H
- [~] F0-7 · Respaldo del destino: flujo listo; faltan secretos y ensayo · Usuario
- [ ] F0-8 · Conciliar F0-6 con F0-1: qué origen tiene qué · Claude ← F0-6, F0-1
- [x] F0-9 · 0015 corrige REVISION-0014; aplicada y verificada en remoto (entregas/F0-9.md) · Claude ← F0-5
- [x] F0-10 · 0013 registrada en el historial remoto (verificado) · Claude ← F0-2
- [x] F0-11 · Flujo de respaldo cifrado y ensayo de restauración (db/RESPALDO.md) · Claude

## Fase 1 y 2 · Separar lo real y ensayar la importación

- [x] F1-P · Preparar clasificación y manifiesto con casos sintéticos · Codex ← F0-H
- [ ] F1-1 · Distinguir demo de datos reales, sin borrar historia · Codex ← F0-8, F1-P
- [ ] F2-1 · Importador con modo diagnóstico y modo ensayo · Codex ← F1-1, F0-9
- [ ] F2-E · Ejecutar ensayo aislado con respaldo y restauración verificados · Claude ← F2-1, F0-7
- [ ] F2-2 · Conciliación: conteos, saldos, costos y diferencias explicadas ← F2-E
- [ ] F2-3 · Repetir la importación y comprobar cero duplicados ← F2-E

## Fase 3 · Confirmar y descontar como una sola operación

- [~] F3-1 · `privado.costear()`: gramos y FEFO en el servidor · Claude ← F0-3
- [ ] F3-2 · Probar F3-1 contra los 14 casos del contrato · Claude ← F3-1, F0-9
- [ ] F3-3 · Funciones de escritura (plan, notas, preparaciones, resultados, bodega) · Claude ← F0-9
- [ ] F3-4 · `confirmar_receta` atómica: bloqueo, idempotencia, revisión · Claude ← F3-2, F3-3
- [ ] F3-5 · Cerrar las escrituras directas que se saltarían la función · Claude ← F3-4
- [~] F3-6 · Cliente remoto: transporte, controlador y contrato RPC · Codex
- [ ] F3-7 · Casos de uso remotos y lecturas paginadas · Codex ← F3-6, F3-3
- [ ] F3-8 · Pruebas de concurrencia contra PostgreSQL real ← F3-4
- [ ] F3-9 · Recuperar confirmación por identidad tras recarga; aislar usuario y sede ← F3-4, F3-6
- [ ] F3-10 · Catálogo, recetas, precios, equivalencias y metas desde PostgreSQL; edición versionada ← F0-9, F3-6
- [ ] F3-11 · RLS y ausencia de costos con roles y sedes diferentes ← F3-5

## Fase 4 y 5 · Dos aparatos, corte y vuelta atrás

- [ ] F4-1 · Sin conexión: leer con fecha, no registrar; nunca volver a local ← F3-7
- [ ] F4-2 · QA en dos dispositivos con roles distintos ← F4-1, F3-8, F3-9, F3-11
- [ ] F5-1 · Corte: fuente única, copia final local y conciliación sin diferencias ← F4-2, F0-7, F0-10, F2-2, F2-3, F3-10, F5-2
- [ ] F5-2 · Preparar y probar panel desde servidor (`hechosDeSupabase`) · Claude ← F3-7, F3-10
- [ ] F5-3 · Historial recuperable y restauración probada ← F5-1

## Pendientes sueltos (no bloquean el plan)

- [ ] X-1 · Bodega muestra importes al jefe de obrador (`views/almacen.js`)
- [ ] X-2 · `renderHistorial` trae `verCostos = true` por defecto
- [ ] X-3 · Regla de importaciones del verificador cuenta parámetros como usos

## Después del corte (fases 6–10)

- [ ] F6 · Preparaciones internas y subrecetas ← F5-2, F5-3
- [ ] F7 · Consumo previsto frente al real ← F6
- [ ] F8 · Inventario de producto terminado ← F7
- [ ] F9 · Costo completo: mano de obra, energía y empaque ← F8
- [ ] F10 · Cierre del día ← F9
