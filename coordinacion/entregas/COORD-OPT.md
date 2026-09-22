# COORD-OPT · Codex · 2026-09-22 · lista para revisión

- Objetivo: contexto mínimo y reparto ejecutable del plan central, sin cambiar operación.
- Inicio común: COORDINACION pasa de 108.487 a 3.799 bytes; archivo original preservado con SHA256.
- AGENTS/CLAUDE iguales, sin importación automática; tablero por tarea y mapa bajo demanda.
- `contexto.mjs` muestra estado, tarea o fase; no imprime el historial. Logs QA fuera del contexto habitual.
- Verificador: sustituye tablas/documentos antiguos por límites, enlaces e integridad del archivo.
- Validación: `npm.cmd run verificar` salida 0; `test-coordinacion.mjs` 11 comprobaciones, incluidas mutaciones que deben fallar.
- Sin cambios de aplicación, recetas, Supabase ni publicación; no requiere build/navegador/SQL real por este alcance.
- Siguiente Codex: F0-LOCAL. Siguiente Claude propuesto: F0-REMOTO, solo auditoría de lectura, todavía sin toma.
- Reservas COORD-OPT liberadas. Revisión de Claude pendiente; este archivo no inicia su sesión.
