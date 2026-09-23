# F0-REMOTO · Claude · 2026-09-22 · lista para revisión

- Auditoría de solo lectura de `Zahavi_Pos` (us-west-2, Postgres 17.6). No se reaplicó, sembró ni alteró nada. Consultas repetibles: `db/auditoria/operacion.sql`.
- 0001–0012 aplicadas y coincidentes con el repositorio. Catálogo sembrado (159 ingredientes, 122 recetas, 1.293 líneas); **operación vacía** (lotes, movimientos, producciones, consumos, precios, proveedores, conversiones, auditoría en 0); 1 perfil admin y 1 sede.
- Cruce verificado: `recetas.codigo` es el id local (122 de 122, formato `R001`) e `ingredientes.nombre` es único (159). No hace falta emparejar por similitud. 88 recetas declaran rendimiento; 34 no.
- **[ALTA] cerrado:** `authenticated` tenía TRUNCATE sobre `auditoria` y RLS no filtra TRUNCATE. `0013_auditoria_inmutable.sql`, aplicada por el usuario desde el panel; comprobado después: solo queda `select` y ninguna tabla concede TRUNCATE a la API.
- **[MEDIA] abierto:** los privilegios por defecto de `public` los define `supabase_admin` y conceden todo a cada tabla nueva; no podemos cambiarlos. Defensa: regla 13 de `scripts/verificar-sql.mjs`, que exige revocar `truncate` (o `all`) en cada tabla nueva. Probada con migración temporal: falla sin revoke, pasa con `revoke all`, vuelve a fallar si se revoca todo menos truncate.
- **[MEDIA] abierto:** hoy la escritura remota es directa a tablas (`lotes`, `movimientos`, `producciones`). Cerrarla al crear las funciones transaccionales, o quedan dos caminos para descontar inventario.
- Falta en el remoto frente al modelo local: equivalencias en gramos y existencia por lote, plan con revisión y fórmula congelada, partidas, ejecuciones con costeo congelado, preparaciones y asignaciones, notas, resultados, eventos de operación y metas. `producciones` de 0003 no sirve tal cual.
- **Respaldo del destino: no verificado.** Sin herramienta de respaldos ni `pg_dump` en esta sesión. Antes del primer dato real hace falta copia y ensayo de restauración (aceptación de fase 0).
- Asesor de seguridad: solo «protección de contraseñas filtradas» (de pago). 8 vistas `security_invoker`; `anon` sin lectura en ninguna tabla ni vista.
- Siguiente: MIGRACION, con `0014_operacion.sql` escrita y verificada, sin aplicar. Reservas de F0-REMOTO liberadas; revisión cruzada pendiente.
