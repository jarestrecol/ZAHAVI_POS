# F2 ? Conciliaci?n preparada ? Codex
- Proyecto movido a Desktop/ZAHAVI_POS; main. Sin conexi?n administrativa Supabase disponible en Codex.
- db/auditoria/captura_conciliacion.sql produce una captura privada consistente antes/despu?s del ensayo. Solo lectura; exige rol administrativo sin filtrado RLS. No ejecutada contra PostgreSQL en esta sesi?n.
- scripts/lib/conciliar-operacion.mjs compara lotes (saldo, compra, costo, equivalencias), ejecuciones (costo y f?rmula congelados) y resultados; ids estables, filas nuevas/faltantes y cambios de contenido.
- Cantidades y costos obligatoriamente en texto decimal: detecta 0.000001 de diferencia incluso en valores grandes, sin p?rdida por Number ni tolerancia que esconda redondeos.
- Prueba scripts/test-conciliar-operacion.mjs; captura incompleta/duplicados/n?meros convertidos/proyectos distintos rechazados. Informe sin nombres, valores privados ni ids sin hash. No autoriza corte.
- Clasificaci?n y conciliaci?n integradas en npm run verificar; evidencia sint?tica, no certifica saldos reales.
- Claude: obtener capturas con conexi?n administrativa, guardar privadamente y comunicar su ruta; actualizar tambi?n agregados de fases_1_2.sql. No publicar archivos de capturas en GitHub.
- Alcance parcial: falta conciliaci?n de movimientos, planes pendientes, notas y asignaciones; ensayo remoto y aislamiento demo pendientes. No se modific? SQL de Claude ni datos reales.
