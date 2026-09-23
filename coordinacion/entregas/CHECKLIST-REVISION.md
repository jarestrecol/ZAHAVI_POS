# Checklist · Codex · 2026-09-22 · revisado
- Completadas omisiones del plan en CHECKLIST: correcciones 0014, registro 0013, ensayo protegido, recuperación tras recarga, catálogo/edición central, RLS por rol/sede y dependencias del corte.
- F0-5 hecha significa revisión entregada, no aprobación de SQL; F0-9 queda pendiente. F0-H certifica herramienta, F0-6 espera copias reales y corresponde a Claude por delegación del usuario.
- F3-1 de Claude continúa en curso; aceptación de sus casos depende de resolver F0-9. F3-6 sigue en curso hasta acordar contrato RPC.
- Panel remoto se prepara antes del corte; fases 6–10 dependen del cierre de 5 y de su predecesora. No se marcaron migración, respaldo ni QA real como completos.
- scripts/checklist.mjs rechaza entradas mal formadas, duplicadas, vacías, dependencias inexistentes/circulares y estados avanzados con requisitos pendientes; importarlo ya no ejecuta el CLI.
- Nuevas regresiones en scripts/test-checklist.mjs; pruebas de auditoría y cliente remoto incluidas en verificar. CI incluye suite Playwright remota con backend simulado; no se ejecutó GitHub Actions aquí.
- Validación: npm.cmd run verificar completo correcto; checklist de 40 entradas, 6 hechas, 2 en curso. UI/SQL no cambiaron en esta revisión.
- Próximo: Claude resuelve F0-9 y registra aceptación del contrato; copias reales y respaldo/restauración siguen pendientes. Fuentes y datos operativos intactos.
