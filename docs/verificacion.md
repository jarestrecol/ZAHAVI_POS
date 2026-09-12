# Verificación, en detalle

Referencia. El núcleo (`../CLAUDE.md`) lleva los comandos y el contrato de
terminado. Aquí está qué fija exactamente cada script y cada prueba de navegador,
que es lo que hace falta para saber si una comprobación nueva ya existe.

### Qué comprueba cada script

| Script | Qué fija |
|---|---|
| `check-css.mjs` | Valores CSS corrompidos, hexadecimales inválidos, llaves sin cerrar, tokens sin definir, clases sin estilo, la carcasa del service worker en los dos sentidos, y que `/api/` quede fuera de la caché |
| `test-datos.mjs` | Arranque limpio, integridad, edición, borrado, recarga con cambios pendientes, conflicto de versiones, descarte y ausencia de red |
| `test-publicacion.mjs` | Publicación, conflictos entre sedes y el cerrojo |
| `test-api.mjs` | Que el recetario real pasa la validación del servidor sin alterarse y que se rechazan los envíos que lo destruirían |
| `test-qa.mjs` | Alta y baja masiva (20 recetas, sobreviven a una recarga, se borran y el recetario vuelve a su estado inicial), escalado, catálogo, plan del día, y que cerrar sesión revoca la clave de edición |
| `test-almacen.mjs` | FEFO (y que lo vencido **no** se consume), que las unidades nunca se convierten, que el costo se calcula lote a lote y no con un precio medio, que descontar no deja existencias negativas, y que los lotes de ejemplo existen de verdad en las 122 recetas con esa misma unidad |
| `verificar-sql.mjs` | Las fronteras del esquema relacional, leyendo las migraciones como texto: numeración sin huecos, seguridad por filas en toda tabla, que ninguna vista entregue filas sin filtrar, que las columnas con dinero no se concedan, que toda función `security definer` fije su `search_path`, y que el libro de movimientos no se pueda reescribir |
| `sembrar-recetas.mjs` | Proyecta las 122 recetas de `data/recipes.json` al esquema relacional. Con `--informe` imprime lo que una persona tiene que decidir (qué unidad base lleva cada ingrediente ambiguo, y qué recetas llevan rendimiento sin unidad); con `--cifras`, una línea JSON que es la **única** fuente de esas cantidades |
| `probar-sql.mjs` | Lo mismo, pero **ejecutándolo**: levanta un PostgreSQL desechable, aplica **todas** las migraciones de `db/migraciones/` —leídas de la carpeta, no enumeradas a mano— sobre una base vacía, corre `db/local/pruebas.sql` —que se pone en la piel de cada rol y mira qué ve y qué puede hacer— y borra el contenedor pase lo que pase. Necesita Docker, y por eso es un comando aparte y no un bloque de `verificar` |

### Las pruebas de navegador

Existen por una razón concreta: **la capa anterior no abre ningún navegador**, y
hay una familia entera de fallos que solo se ve ahí. Los seis defectos de una
revisión pasada pasaron por delante de siete bloques en verde.

| Archivo | Qué fija |
|---|---|
| `tests/recorrido.spec.js` | Entrar, buscar, abrir una receta, escalar la tanda, que el filtro activo se distinga de los demás, que el tamaño del texto alcance a la receta y a nada más, que la posición del listado pertenezca al filtro y que la receta abierta se distinga de las demás filas |
| `tests/dialogos.spec.js` | Que el foco entre en cada ventana y el teclado del Modo Pesar responda de inmediato; y, en las tres pantallas de módulo, que Escape lleve al menú y que abiertas desde una ficha se vuelva **a esa ficha** |
| `tests/impresion.spec.js` | Que se imprima lo que se está mirando |
| `tests/celular.spec.js` | Acciones al alcance del pulgar, nada inalcanzable a 320 px, que escribir en el buscador no reconstruya el campo ni le quite el foco, que volver de una receta deje el listado donde estaba y la deje marcada, y que una pantalla de módulo cubra el teléfono **exacto** con su pie a la vista |
| `tests/tableta.spec.js` | Listado en dos columnas sin desplazamiento lateral, y que volver de una receta deje el listado donde estaba y la deje marcada |
| `tests/unidades.spec.js` | Que las recetas de un ingrediente se separen por la unidad con que lo miden, con la minoritaria arriba |
| `tests/resiliencia.spec.js` | La 404 con su estado y su estilo, el arranque roto que deja salida, la receta borrada que lo dice, el sitio sin servidor que lo anuncia y el recetario abriendo sin red |
| `tests/movil-ajuste.spec.js` | Que la maqueta quepa **sin pellizcar** en cinco tamaños reales, que el documento no gane desplazamiento vertical, que el rebote esté cortado en la raíz y que el borde inferior de la pantalla lo pinte la aplicación y no el fondo |
| `tests/almacen.spec.js` | Alta, baja y edición de lotes, el valor por unidad derivado, el estado de vencimiento anunciado con texto, el cruce con el plan del día, y que descontar no deje existencias negativas |
| `tests/inicio.spec.js` | Que al entrar se llega **al menú y no al listado**, que cada tarjeta lleva a su módulo con una cifra real, que un enlace antiguo `#/receta/R001` sigue abriendo la receta, que una dirección ilegible cae en el menú sin romper el arranque, que la receta que se está leyendo **sobrevive al paso por el menú** hasta el módulo y de vuelta, que entrando desde el menú no se ofrece una vuelta que no existe, y que el menú avisa de los lotes vencidos |
| `tests/editor.spec.js` | Que el editor no deje guardar una línea de ingrediente incompleta —sin cantidad, sin unidad, con una cantidad que no es número, o con cero— y que lo diga **donde se está mirando**, no en otro sitio |
| `tests/publicacion.spec.js` | **La puerta de la clave de edición, que es la regla 11 ejercitada**: que se pida antes de tocar la receta y CADA VEZ, también al editar una que ya existe y antes incluso de la confirmación de borrado; que cancelar la puerta o salir con Escape no deje el permiso puesto; que sin recetario compartido no se pida, porque no hay a dónde publicar; y que un 200 que no es una publicación no se anuncie como publicado |
| `tests/exportar.spec.js` | Que el CSV se descarga bajo la CSP real, que empieza por el BOM de UTF-8 y usa `;`, que un ingrediente de dos unidades sale en dos filas, y que **no** lleva las cantidades por receta |

La suite levanta el servidor sola, con las cabeceras de producción: probar contra
un servidor más permisivo esconde justo lo que interesa mirar. Con `npm run qa:ver`
se ven ejecutarse. Los informes quedan en `playwright-report/`, fuera del
repositorio. Las pruebas **leen** las 122 recetas y no escriben ninguna.

### Verificación manual, cuando toca

Solo para lo que necesita un par de ojos: reparto de la pantalla, contraste real,
comportamiento del teclado con una báscula delante.

> **Regla que no se rompe nunca**: las pruebas manuales se hacen sobre recetas
> creadas para la prueba, con el prefijo `QA-TEST-`, y se borran al terminar. Las
> 122 recetas reales están auditadas: no se abren para editar, no se modifican y
> no se eliminan.

Al terminar: borrar las `QA-TEST-`, comprobar que vuelven a ser 122, y volver a
ejecutar `npm run verificar` confirmando que el `sha` sigue siendo el mismo.

**Antes de dar algo por terminado**: las dos capas en verde, ninguna receta real
tocada y `git status` sin restos. `.github/workflows/verificacion.yml` ejecuta las
dos capas en cada envío.

---

