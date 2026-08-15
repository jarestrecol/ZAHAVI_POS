# Lista de verificación de calidad

Guía para comprobar que el recetario funciona antes de darlo por bueno, después
de un cambio o antes de entregarlo a la panadería.

Dos partes:

- **Automática**: 56 comprobaciones que ejecuta la máquina en segundos.
- **Manual**: lo que solo se puede confirmar mirando la pantalla.

> **Regla que no se rompe nunca**: las pruebas manuales se hacen sobre recetas
> creadas para la prueba, con el prefijo `QA-TEST-`, y se borran al terminar.
> Las 121 recetas reales están auditadas: no se abren para editar, no se
> modifican y no se eliminan.

---

## 1. Verificación automática

```bash
node scripts/verificar.mjs
```

Resultado esperado:

```
Sintaxis de los modulos…        ok (29 archivos)
Resolucion de importaciones…    ok (26 modulos)
Coherencia del CSS…             ok (207 clases)
Capa de datos…                  ok (9 bloques)
Validacion del servidor…        ok (28 comprobaciones)
Alta y baja masiva…             ok (56 comprobaciones)
Integridad de las recetas…      ok (121 recetas, ... sha f0307204)
Archivo offline…                ok
```

**Si el resumen `sha` cambia sin que nadie haya editado una receta a propósito,
hay que parar y averiguar por qué.** Ese número es la huella de las 121 fórmulas:
si cambia una sola cifra de un solo ingrediente, cambia.

La prueba de alta y baja masiva (`scripts/test-qa.mjs`) cubre por sí sola:

| Bloque | Qué comprueba |
|---|---|
| Recetas | Crear 20, que se guarden con su contenido exacto, que sobrevivan a recargar, borrarlas todas y volver al estado inicial |
| Usuarios | Crear 5, entrar con cada uno, cambiar clave, borrarlos, y que las protecciones aguanten |
| Aislamiento | Que ninguna de las 121 recetas reales se toque en todo el proceso |

---

## 2. Verificación manual

Levantar el sitio en local, que **no** toca el sitio publicado:

```bash
python -m http.server 8000
```

Entrar con `zahavi` / `zahavi2026`.

### 2.1 Entrada

| # | Comprobación | Esperado |
|---|---|---|
| 1 | Entrar con usuario y clave correctos | Se abre el recetario |
| 2 | Entrar con clave incorrecta | Mensaje de error, sin decir si falló el usuario o la clave |
| 3 | Entrar con usuario inexistente | El mismo mensaje que el anterior |
| 4 | Recargar tras entrar | Sigue la sesión abierta, no vuelve a pedir clave |

### 2.2 Consulta y búsqueda

| # | Comprobación | Esperado |
|---|---|---|
| 5 | El listado muestra las 121 recetas | Contador arriba del listado coherente |
| 6 | Pulsar `/` | El cursor salta al buscador |
| 7 | Buscar por nombre parcial | Filtra según se escribe |
| 8 | Buscar por código (`R05`) | Encuentra por código |
| 9 | Buscar un ingrediente (`harina`) | **No** devuelve recetas que solo lo contienen: la búsqueda es por nombre y código |
| 10 | Buscar sin acentos (`azucar`) | Encuentra igual que con acento |
| 11 | Buscar algo inexistente | Mensaje claro y botón para limpiar |
| 12 | Flechas arriba y abajo | Recorren el listado |
| 13 | Filtrar por cada categoría | El recuento de cada chip cuadra con lo listado |
| 14 | Los tres colores de categoría | Se distinguen entre sí de un vistazo |
| 15 | Abrir una receta del final de la lista | **El listado no salta al principio** |
| 16 | La receta abierta | Se distingue del resto: fondo, negrita y barra lateral |

### 2.3 Ficha de receta

| # | Comprobación | Esperado |
|---|---|---|
| 17 | Cabecera | Código, categoría con su color y nombre |
| 18 | Ficha técnica | Rinde, componentes e ingredientes, cada dato en su columna |
| 19 | Ingredientes | Cantidades alineadas en columna, cifra grande y monoespaciada |
| 20 | Unidades de volumen (ml, l, cc) | Marcadas de forma distinta al peso |
| 21 | Receta de un solo componente | No muestra encabezado de componente redundante |
| 22 | Receta de varios componentes | Cada uno con su nombre y su color |
| 23 | Títulos de sección | Barra del color de la categoría y línea separadora |
| 24 | Receta sin método | Nota discreta con acción para escribirlo, no un error |

### 2.4 Botones de la ficha

| # | Comprobación | Esperado |
|---|---|---|
| 25 | Los cuatro botones tienen icono y texto | Balanza, impresora, lápiz, papelera |
| 26 | **Eliminar** está separado del resto | Línea vertical entre Editar y Eliminar |
| 27 | **Pesar** | Pantalla completa, un ingrediente a la vez |
| 28 | En Pesar, barra espaciadora | Da por pesado y avanza |
| 29 | En Pesar, flechas | Se mueve adelante y atrás |
| 30 | En Pesar, Escape o Salir | Vuelve a la ficha sin cambiar nada |
| 31 | Al terminar de pesar | Pantalla de "Todo pesado" |
| 32 | **Imprimir** | Vista previa con la ficha maquetada en A4 |
| 33 | Imprimir sin receta abierta | Sale el índice completo, respetando el filtro |
| 34 | **Editar** | Abre el editor con los datos cargados |

### 2.5 Crear y editar (con recetas `QA-TEST-`)

| # | Comprobación | Esperado |
|---|---|---|
| 35 | Crear receta con nombre `QA-TEST-01 …` | Se guarda y aparece en el listado |
| 36 | Guardar sin nombre | Error dentro del formulario, no un aviso del navegador |
| 37 | Escribir un ingrediente conocido | Propone su unidad habitual |
| 38 | Añadir componente | Aparece con una fila lista |
| 39 | Añadir ingrediente | El cursor salta a la fila nueva |
| 40 | Quitar la última fila de un componente | Queda una fila vacía, no un componente sin filas |
| 41 | Cancelar con cambios a medias | La receta queda como estaba |
| 42 | Clic fuera del editor | **No** cierra la ventana |
| 43 | Editar una `QA-TEST-` y guardar | El cambio se refleja en la ficha |
| 44 | Recargar la página | Los cambios siguen ahí |
| 45 | La cabecera avisa | "N cambios sin publicar en este equipo" |

### 2.6 Eliminar (solo sobre `QA-TEST-`)

| # | Comprobación | Esperado |
|---|---|---|
| 46 | Pulsar Eliminar | Paso 1 de 3: nombre, código y cuánto contiene |
| 47 | Paso 2 | Consecuencias, incluida la de las demás sedes |
| 48 | Paso 3 | Pide escribir el nombre de la receta |
| 49 | Botón de eliminar del paso 3 | Empieza **deshabilitado** |
| 50 | Escribir el nombre mal | Sigue deshabilitado |
| 51 | Escribir el nombre bien | Se habilita |
| 52 | Escribirlo sin acentos o en minúsculas | También se habilita |
| 53 | Clic fuera del diálogo | **No** lo cierra |
| 54 | Confirmar | La receta desaparece del listado |
| 55 | Volver atrás en cualquier paso | Regresa al paso anterior sin borrar |

### 2.7 Ajustes

| # | Comprobación | Esperado |
|---|---|---|
| 56 | Abrir Ajustes | Tres bloques: estado, quién puede entrar, mi clave |
| 57 | Estado del recetario | Número de recetas y versión publicada |
| 58 | Sin cambios pendientes | "Este equipo está igual que la versión publicada" |
| 59 | Con cambios pendientes | Detalla cuántas nuevas, modificadas y eliminadas |
| 60 | **Tras crear y borrar lo mismo** | Vuelve a "igual que la versión publicada", **no** "0 cambios" |
| 61 | Crear usuario `qa-test-1` | Aparece en la lista |
| 62 | Crear con nombre repetido | Error claro |
| 63 | Crear con clave corta | Error indicando el mínimo |
| 64 | Crear con claves que no coinciden | Error claro |
| 65 | Entrar con el usuario nuevo | Funciona |
| 66 | Quitar el propio usuario | No se ofrece la opción |
| 67 | Quedarse con un solo usuario | No se puede quitar el último |
| 68 | Cambiar la clave con la actual mal | Error, no cambia nada |
| 69 | Cambiar la clave correctamente | Confirma, y la nueva funciona al reentrar |
| 70 | Cerrar sesión | Vuelve a la pantalla de entrada |
| 71 | Tras cerrar sesión, reentrar y abrir Ajustes | **El campo de clave de edición está vacío** |
| 72 | No hay botón de descargar ni de cargar archivo | Correcto: está prohibido a propósito |

### 2.8 Publicación

> Estas pruebas escriben en el recetario **compartido**. Hacerlas solo con
> intención de publicar de verdad, nunca "para probar".

| # | Comprobación | Esperado |
|---|---|---|
| 73 | Publicar sin clave de edición | Pide la clave, no publica |
| 74 | Publicar con clave incorrecta | Error del servidor, no publica |
| 75 | Publicar con clave correcta | Confirma y el aviso de pendientes desaparece |
| 76 | Abrir en otro dispositivo | Se ve el cambio publicado |
| 77 | Publicar desde dos equipos a la vez | El segundo recibe aviso de conflicto y debe recargar |
| 78 | Descartar cambios de este equipo | Vuelve a la versión publicada |

### 2.9 Sin conexión

| # | Comprobación | Esperado |
|---|---|---|
| 79 | Cortar la red y recargar | El recetario abre igual |
| 80 | Consultar recetas sin red | Se ven completas |
| 81 | Editar sin red | Se guarda en el equipo, con aviso de sin conexión |
| 82 | Recuperar la red | El aviso desaparece |

### 2.10 Pantallas

| # | Comprobación | Esperado |
|---|---|---|
| 83 | Escritorio (≥ 992 px) | Listado y ficha a la vez |
| 84 | Tableta (768–991 px) | Se turnan; ingredientes a dos columnas |
| 85 | Celular (< 768 px) | Se turnan; al abrir una receta **entra como pantalla nueva**, no aparece comprimida abajo |
| 86 | Celular: acciones de la receta | Barra flotante abajo, al alcance del pulgar |
| 87 | Celular: diálogos | Suben desde el borde inferior como una hoja |
| 88 | Celular: filtros de categoría | Se deslizan en horizontal |
| 89 | Cualquier tamaño | Sin desplazamiento horizontal de la página |

### 2.11 Tema y accesibilidad

| # | Comprobación | Esperado |
|---|---|---|
| 90 | Interruptor de tema | Cambia entre claro y oscuro |
| 91 | Recargar tras elegir tema | Se mantiene, **sin destello del tema anterior** |
| 92 | Sistema operativo en oscuro, sin elección previa | Arranca en oscuro |
| 93 | Recorrer todo con `Tab` | Todo alcanzable, foco siempre visible |
| 94 | Abrir un diálogo y tabular | El foco no se escapa detrás |
| 95 | Cerrar un diálogo | El foco vuelve donde estaba |
| 96 | Activar "reducir movimiento" en el sistema | Sin animaciones |
| 97 | Consola del navegador | **Sin errores** |

---

## 3. Al terminar

1. Borrar todas las recetas `QA-TEST-` creadas.
2. Borrar todos los usuarios `qa-test-` creados.
3. Comprobar que el recetario vuelve a mostrar **121 recetas**.
4. Si quedó algún cambio local sin querer: Ajustes → *Descartar cambios de este
   equipo*.
5. Volver a ejecutar `node scripts/verificar.mjs` y confirmar que el `sha` sigue
   siendo el mismo.

---

## 4. Historial de defectos encontrados

Defectos reales detectados por estas pruebas, para que no vuelvan a aparecer sin
que nadie se dé cuenta.

| Defecto | Cómo se detectó | Estado |
|---|---|---|
| Al filtrar por una categoría y abrir una receta, el filtro se perdía y volvían a listarse las 121: los enlaces del listado se escribían a mano sin los parámetros de la dirección | Uso real | Corregido |
| Listado y ficha se veían a la vez en móvil y tableta, apretados: el atributo `data-view` se ponía en un elemento y el CSS lo buscaba en otro, así que la regla nunca se aplicaba | Diagnóstico del flujo móvil | Corregido |
| Cerrar sesión no borraba la clave de edición: quien entrara después podía publicar sin conocerla | Auditoría de seguridad | Corregido |
| El foco de los campos dependía de un borde naranja a 2,45:1, por debajo del mínimo exigido | Auditoría de accesibilidad | Corregido |
| Tras crear y borrar lo mismo, la cabecera anunciaba "0 cambios sin publicar" con el botón de publicar activo | Prueba de alta y baja masiva | Corregido |
| Al elegir una receta del final, el listado saltaba al principio | Uso real | Corregido |
| Los tres colores de categoría tenían luminancias casi idénticas y se leían como el mismo marrón | Revisión de diseño | Corregido |
