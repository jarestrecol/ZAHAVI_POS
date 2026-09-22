# Mapa de consulta puntual

Abrir solo la fila relacionada con la tarea. Las rutas son desde la raíz.

| Necesidad | Código inicial | Prueba |
|---|---|---|
| Persistencia local y validación | src/core/{bitacora,storage}.js | scripts/test-produccion.mjs |
| Conversiones y gramos | src/core/{conversiones,materiales-produccion,costeo}.js | scripts/test-conversiones.mjs |
| Bodega y demo | src/app/almacen.js; src/core/{almacen,precios-demo}.js | scripts/test-almacen.mjs; scripts/test-precios-demo.mjs |
| Planes, partidas y confirmación | src/app/produccion.js; src/core/{produccion,preparacion}.js | scripts/test-produccion.mjs |
| Resultados y correcciones | src/core/resultados-produccion.js; src/views/produccion/resultados.js | scripts/test-resultados.mjs |
| UI de producción | src/views/produccion/; src/views/plan.js | tests/agenda.spec.js |
| Auth, sesión y equipo | src/core/{supabase,sesion,equipo}.js | tests/acceso.spec.js |
| SQL: lotes, consumos y costos | db/migraciones/0003_almacen_y_produccion.sql | npm.cmd run verificar-sql; npm.cmd run probar-sql |
| SQL: permisos actuales previstos | db/migraciones/0008–0012; catálogo remoto cuando accesible | db/local/pruebas.sql |
| Panel e historia | src/core/bi/hechos.js; src/app/resumen.js; src/views/historial.js | scripts/test-bi.mjs; tests/resumen-analisis.spec.js |
| Composición y build | src/{pantallas,main}.js; package.json; sw.js | npm.cmd run build; scripts/check-css.mjs |

Datos públicos de recetas: data/recipes.json (no leer entero para contexto).
Demo: PRECIOS-DEMO.md y data/precios-demo-colombia.json, solo para su tarea.
Reglas completas de una fase: `node scripts/contexto.mjs --fase N` (0–10).
No guardar respaldos privados bajo el servidor web ni dentro del repositorio.
