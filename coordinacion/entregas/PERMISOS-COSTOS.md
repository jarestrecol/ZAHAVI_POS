# X-1/X-2 · Codex · 2026-09-23 · interfaz revisada
- Bodega recibe verCostos explícito desde rol de sesión: admin/gerencia. Sin permiso muestra cantidades, equivalencias y vencimientos; no importes, orden por valor, formulario de compras ni demo con precios.
- Compras/edición/baja quedan en gerencia en esta interfaz; obrador conserva consulta y exportación de cantidades. La ficha de medidas sigue disponible.
- Historial exige verCostos explícito (predeterminado false), incluidos movimientos y CSV de Bodega. Respaldo completo solo con acceso a costos, pues contiene el documento operativo entero.
- Plan y Bodega se reconstruyen al cambiar usuario o rol, evitando conservar una pantalla privilegiada tras el cambio. Sin cambios de identidad/rol se conservan formularios en curso.
- Caché v65. Pruebas: 17/17 tests/almacen.spec.js escritorio (incluye casos 390/1440px); dos regresiones nuevas verifican cambio de rol, CSV, respaldo y omisión segura de permiso.
- npm.cmd run verificar correcto; npm.cmd run build correcto. Se restauraron dependencias de desarrollo con npm ci en la carpeta nueva.
- Límite: esto controla la interfaz, no protege datos todavía almacenados en el navegador ni sustituye RLS/API. F3-11 continúa pendiente; no se afirma seguridad remota probada.
