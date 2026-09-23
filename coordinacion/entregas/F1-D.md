# F1-D · Decisión del usuario · 2026-09-23 · no se importa la operación local
- Decisión (usuario): todo lo de bodega, planes, producción, resultados, notas y metas guardado en los navegadores es demo y no se importa. Lo único real son las recetas.
- Verificado por Claude: Supabase tiene 122 recetas y 1293 líneas, con huella md5 de (código, nombre, categoría, n.º de componentes, n.º de líneas) = `c7afef6e…42fb`, igual que `data/recipes.json` en HEAD y en origin/main (última publicación: 9-sep). La suma de cantidades difiere en 0,001 por el redondeo a 3 decimales.
- Pendiente del usuario: revisar en Ajustes de cada equipo que no queden cambios de recetas sin publicar.
- Consecuencia: salen F0-L, F0-8, F1-1, F2-1, F2-E, F2-2 y F2-3. Las tablas de importación de 0015 se quedan sin uso y no estorban.
- Nuevo F5-0: el día del corte, la bodega real arranca con un conteo físico cargado por la función de alta (F3-3). Nada se borra de los navegadores: el corte hace que la app deje de leerlos.
- Codex: el diagnóstico y el conciliador (F0-H, F1-P, F2-P) quedan como herramientas; su siguiente tarea es el cliente remoto (F3-6/F3-7).
