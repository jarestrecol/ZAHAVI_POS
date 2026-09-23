# Respaldo visible · Codex · 2026-09-23
- Botón Descargar respaldo completo movido del historial al inicio de Bodega, sección Respaldo de la operación; explica JSON frente a CSV y rol necesario.
- Gerencia/admin descarga toda la operación leída, sin filtros y sin modificar almacenamiento; error de lectura/descarga visible. Obrador conserva aviso, sin acceso al respaldo con costos.
- Caché v66; tres pruebas de navegador correctas (descarga real JSON íntegro, roles y omisión segura), verificar y build correctos.
- Servidor 127.0.0.1:5500 estaba inaccesible; iniciado oculto con scripts/servidor.mjs, PID 19392. GET del módulo devuelve 200 y nueva sección. Mantener ese origen para leer el almacenamiento del navegador original.
- No se accedió a la sesión real ni se exportó su operación; usuario debe descargar desde su navegador con gerencia/admin. No borrar localStorage.
