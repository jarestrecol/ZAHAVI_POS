# F2 · Conciliación preparada · Codex · 2026-09-23
- Proyecto en Desktop/ZAHAVI_POS, main. Codex sin conexión administrativa Supabase; Docker instalado con motor detenido. No se ejecutó SQL real.
- db/auditoria/captura_conciliacion.sql obtiene captura privada consistente de nueve grupos: lotes, libro, planes/partidas, preparaciones, notas, eventos, metas, ejecuciones y resultados. Solo lectura; requiere rol administrativo sin filtrado RLS.
- Comparador scripts/lib/conciliar-operacion.mjs preserva precisión decimal textual; detecta saldos, costos, equivalencias, fórmulas, partidas y resultados alterados, filas nuevas/faltantes y colecciones ausentes.
- Uso: node scripts/conciliar-operacion.mjs ANTES.json DESPUES.json. Capturas fuera del repositorio y webroot; informe sin nombres, importes ni ids en claro. Código 0 coincide, 2 diferencias, 1 entrada inválida. Nunca autoriza corte.
- Pruebas scripts/test-conciliar-operacion.mjs: diferencias de una millonésima incluso en cantidades grandes, formatos decimales equivalentes, costo histórico alterado, partidas/libro, entradas inválidas, privacidad y origen intacto.
- Clasificación F1 y conciliación F2 incluidas en npm run verificar. No se ha certificado la igualdad de saldos reales ni repetición de importación PostgreSQL.
- Corregida comprobación de coordinación para CRLF de Windows sin alterar archivo histórico; prueba adicional confirma que un cambio real de contenido todavía falla.
- Claude: obtener capturas con su conexión, guardarlas privadamente y comunicar rutas; actualizar agregados de fases_1_2.sql. No publicar capturas en GitHub.
- Pendientes: aislamiento efectivo demo, correcciones 0014, captura remota, ensayo en PostgreSQL, duplicados y conciliación real. Esta preparación no completa las fases operativas.
