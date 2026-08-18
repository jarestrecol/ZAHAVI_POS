# Lista de verificación de calidad

Guía para comprobar que el recetario funciona antes de darlo por bueno, después
de un cambio o antes de entregarlo a la panadería.

Dos partes:

- **Automática**: siete bloques que ejecuta la máquina en segundos, con 161
  comprobaciones solo en la prueba de alta y baja.
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
Sintaxis de los modulos…        ok (32 archivos)
Resolucion de importaciones…    ok (29 modulos)
Coherencia del CSS…             ok (301 clases)
Capa de datos…                  ok (9 bloques)
Validacion del servidor…        ok (28 comprobaciones)
Alta y baja masiva…             ok (161 comprobaciones)
Integridad de las recetas…      ok (121 recetas, ... sha f0307204)
```

**Si el resumen `sha` cambia sin que nadie haya editado una receta a propósito,
hay que parar y averiguar por qué.** Ese número es la huella de las 121 fórmulas:
si cambia una sola cifra de un solo ingrediente, cambia.

La prueba de alta y baja masiva (`scripts/test-qa.mjs`) cubre por sí sola:

| Bloque | Qué comprueba |
|---|---|
| Recetas | Crear 20, que se guarden con su contenido exacto, que sobrevivan a recargar, borrarlas todas y volver al estado inicial |
| Acceso | Cambiar la clave, que la caducidad de 7 días cuente bien, y que nadie se quede fuera al migrar desde los modelos anteriores |
| Escalado | Que multiplique bien, que no toque la receta original y que no escale moldes ni tiempos |
| Rendimiento | Que abrir y guardar una receta sin tocar el rinde deje su nombre byte a byte igual |
| Ingredientes | Que los 159 totales cuadren con la suma cruda y que nunca se mezclen unidades |
| Plan del día | Que consolide bien y que **no sume** gramos con unidades |
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
| 22 | Receta de varios componentes | Ver 24a a 24e |
| 23 | Títulos de sección | Barra del color de la categoría y línea separadora |
| 24 | Receta sin método | Nota discreta con acción para escribirlo, no un error |
| 24a | Receta de varios componentes | Cada uno es una **tarjeta** con número de estación, nombre y cuántos ingredientes lleva |
| 24b | Dos componentes seguidos | Se distinguen por color: azul el 1, violeta el 2. Se ve dónde acaba uno y empieza el otro |
| 24c | Filas de ingrediente | **Franjas alternas**, no una lista plana; el texto alineado con el título del componente |
| 24d | Lo mismo en celular | Las franjas siguen alineadas con el encabezado, sin desplazamiento de 8px |
| 24e | Receta de un solo componente | **No** muestra tarjeta ni número: no hay nada que distinguir |

### 2.4 Botones de la ficha

| # | Comprobación | Esperado |
|---|---|---|
| 25 | Los botones tienen icono y texto | Flecha, balanza, impresora, lápiz, papelera |
| 25a | **Recetas** (volver) | Relleno **oscuro**, se distingue a la primera del resto |
| 25b | **Pesar** | Relleno **ámbar**, la única acción de marca de la barra |
| 25c | Los otros tres | Sobre blanco, con el color solo en el icono |
| 26 | **Eliminar** está separado del resto | Línea vertical entre Editar y Eliminar |
| 27 | **Pesar** | Pantalla completa, un ingrediente a la vez |
| 28 | En Pesar, barra espaciadora | Da por pesado y avanza, **sin pulsar Tab antes**: el foco entra solo al abrir |
| 29 | En Pesar, flechas | Se mueve adelante y atrás |
| 30 | En Pesar, Escape o Salir | Vuelve a la ficha sin cambiar nada |
| 31 | Al terminar de pesar | Pantalla de "Todo pesado" con marca de confirmación |
| 31a | **Tabular hasta "Salir" y pulsar Intro** | **Cierra**, no da por pesado el ingrediente |
| 31b | Tabular hasta "← Anterior" y pulsar Intro | Retrocede, no avanza |
| 31c | En "Todo pesado", tabular a "Salir" e Intro | Cierra la pantalla |
| 31d | Mirar bajo la cifra | Muestra "Después" con el siguiente ingrediente y su cantidad |
| 31e | Llegar al último paso | Dice "Es el último" en vez de dejar el hueco vacío |
| 31f | Volver con la flecha a un paso ya pesado | Insignia "✓ Pesado" y la **cifra sigue legible**, sin tachar |
| 31g | Imprimir con la tanda ×3 | La hoja dice el rendimiento **multiplicado**, igual que la pantalla |
| 31h | Pesar una receta de varios componentes | Cada paso muestra `1/3 MASA`, `2/3 RELLENO`… |
| 31i | Al cruzar de un componente al siguiente | **El marco del recuadro cambia de color** y se nota sin leer |
| 31j | Ese mismo cruce con lector de pantalla | Anuncia "Empieza Relleno, 2 de 3" antes del ingrediente |
| 31k | Volver a un paso ya pesado de otro componente | El rótulo y el chip se apagan igual que la cifra |
| 31l | Receta de un solo componente | **No** aparece ni chip ni rótulo de componente |
| 32 | **Imprimir** | Vista previa con la ficha maquetada en A4 |
| 33 | Imprimir sin receta abierta | Sale el índice completo, respetando el filtro |
| 34 | **Editar** | Abre el editor con los datos cargados |

### 2.4b Escalar la tanda

| # | Comprobación | Esperado |
|---|---|---|
| 34 | El módulo de cantidades frente a la ficha técnica | Se distinguen a la primera: es **tarjeta elevada con barra ámbar y sombra**, los datos son franja hundida |
| 34k | El rótulo del módulo | Dice **"Cantidades"**, no "Tanda" |
| 34l | El campo de cantidad concreta | Se lee **"Calcular [24] und"**, con la unidad de lo que rinde al lado |
| 34m | Ese campo con lector de pantalla | Anuncia también la unidad, no solo "Calcular" |
| 34n | Receta sin rendimiento declarado | No aparece el campo ni una unidad vacía |
| 34a | Pulsar ×2 en una receta | Todas las cantidades se duplican en pantalla |
| 34b | El rendimiento de la ficha técnica | También se duplica |
| 34c | Aviso de tanda escalada | Visible mientras el factor no sea el original |
| 34d | Receta con medida en `cm` (molde) | **No** se multiplica, y se avisa |
| 34e | Escribir una cantidad concreta en "Calcular" | El factor se calcula solo |
| 34f | Pulsar "Original" | Vuelve a las cifras de la fórmula |
| 34g | Abrir **Pesar** con la tanda escalada | Muestra las cantidades escaladas y el aviso `TANDA ×N` |
| 34h | **Imprimir** con la tanda escalada | La hoja lleva el aviso en recuadro negro |
| 34i | Cambiar a otra receta | El factor **vuelve solo** al original |
| 34j | Escribir 0 o un número negativo | Vuelve al original, no vacía la receta |

### 2.4d Plan del día

| # | Comprobación | Esperado |
|---|---|---|
| 34p | Pulsar "Plan del día" | Abre la ventana con las dos mitades |
| 34q | Buscar y añadir una receta | Aparece en la izquierda con 1 tanda |
| 34r | Añadir una segunda que comparta ingrediente | Ese ingrediente sale **sumado en una sola línea** |
| 34s | Subir las tandas de una receta | Las cantidades se recalculan |
| 34t | Un ingrediente con dos unidades distintas | **Dos líneas separadas**, marcadas, y el aviso **los nombra** |
| 34u | Imprimir la lista | Sale la hoja del plan (titulada **Producción del día**), no la receta abierta |
| 34u2 | Imprimir la ficha justo después | Vuelve a salir la receta, no el plan de antes |
| 34v | Cerrar y volver a abrir | El plan está vacío: no se guarda, y así se anuncia |
| 34w | Pulsar una línea de la lista consolidada | Despliega **de qué recetas sale** y cuánto pone cada una |
| 34x | Sumar a mano el desglose | Cuadra exactamente con el total de la línea |
| 34x2 | Dos recetas `QA-TEST-` con el **mismo nombre** en el plan | El desglose dice "de 2 recetas" y las lista por separado; no las funde en una |
| 34y | Volver a pulsar la misma línea | Se cierra y **el foco sigue en esa fila** |
| 34z | Vaciar el campo de tandas y salir | **No borra la receta**: vuelve al valor anterior y lo explica en pantalla |
| 34aa | Escribir 0 en las tandas | Igual que el anterior: nota visible remitiendo al botón de quitar |
| 34ab | Escribir 500 tandas | Se ajusta a 100 **a la vista**, con la nota del rango; las dos mitades muestran la misma cifra |
| 34ac | Escribir en el buscador | El recuento de coincidencias se anuncia (`role="status"`) |
| 34ad | Quitar una receta con el botón × | El foco vuelve al buscador, no al principio del documento |
| 34ae | Recorrer la ventana con `Tab` | Todo alcanzable; las flechas del campo de tandas no pierden el foco |

### 2.4e Ingredientes

| # | Comprobación | Esperado |
|---|---|---|
| 34af | Pulsar "Ingredientes" | Abre el catálogo con 159 ingredientes distintos |
| 34ag | Cifras de cabecera | 159 distintos · 1282 líneas · 64 en una sola receta · 15 con varias unidades |
| 34ah | Orden por defecto | Harina de trigo primera, en 86 recetas |
| 34ai | Pulsar "A–Z" | Se reordena alfabéticamente |
| 34aj | Buscar `azucar` sin acento | Encuentra "Azúcar" |
| 34ak | Un ingrediente con varias unidades (leche) | Muestra **un total por unidad**, nunca sumados, y avisa |
| 34al | Pulsar sobre un ingrediente | Despliega las recetas donde se usa |
| 34am | Volver a pulsarlo | Se cierra y **el foco sigue en esa fila** |
| 34an | Pulsar una de esas recetas | La abre y cierra el catálogo |
| 34ao | Ningún botón cambia datos | Es solo de consulta |
| 34ap | Mirar la lista desplegada | Todas las filas **a la misma altura y alineadas**, una línea por receta |
| 34aq | Un ingrediente que entre en varias "Sacher Torte" | Cada fila muestra su rendimiento (`×1`, `×5`…) y se distinguen |
| 34ar | Buscar la harina (86 recetas) | La rejilla se reparte en columnas sin filas torcidas |

### 2.4f Rendimiento en el editor

| # | Comprobación | Esperado |
|---|---|---|
| 34as | Abrir una receta con rendimiento (`ALMOJÁBANA X 15 UND`) | Nombre sin el rendimiento; "rinde" = 15; unidad = und |
| 34at | Guardar sin tocar nada | El nombre queda **exactamente igual**, incluida la `x` minúscula si la tenía |
| 34au | Cambiar el rinde a 20 y guardar | El nombre pasa a `... X 20 UND` |
| 34av | Abrir `BAGUEL NORMAL X 32 UND O 8 PAQ.` | La unidad compuesta aparece como opción y **no se pierde** al guardar |
| 34aw | Abrir una receta sin rendimiento | "rinde" vacío, unidad "sin unidad"; guardar no añade ninguna `X` |
| 34ax | Abrir `TORTA ... X 1 UND ( SIN AZUCAR )` | **Aviso** de que el nombre parece llevar el rendimiento dentro |
| 34ay | Crear una receta nueva con rinde 12 und | Se guarda como `NOMBRE X 12 UND` y el escalado por cantidad funciona |
| 34az | Escribir letras en el campo "rinde" | El campo no las admite: es numérico |

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
| 42a | Escape con el editor abierto | Cierra igual que *Cancelar*: no guarda nada y la receta queda como estaba |
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

### 2.7 Ajustes y clave

| # | Comprobación | Esperado |
|---|---|---|
| 55a | El botón de Ajustes de la barra superior | Es **solo un engranaje**, sin la palabra, en escritorio, tableta y celular |
| 55b | Dejar el cursor encima | Aparece "Ajustes" |
| 55c | Con lector de pantalla | Se anuncia como "Ajustes, botón" |
| 56 | Abrir Ajustes | **Dos** bloques: estado del recetario y clave de acceso |
| 56a | **No** hay ningún bloque de usuarios | Correcto: se retiró, hay una sola clave |
| 57 | Estado del recetario | Número de recetas y versión publicada |
| 58 | Sin cambios pendientes | "Este equipo está igual que la versión publicada" |
| 59 | Con cambios pendientes | Detalla cuántas nuevas, modificadas y eliminadas |
| 60 | **Tras crear y borrar lo mismo** | Vuelve a "igual que la versión publicada", **no** "0 cambios" |
| 61 | El bloque de clave | Dice cuántos días le quedan antes de caducar |
| 62 | Cambiar la clave con la actual mal | Error, no cambia nada |
| 63 | Cambiar poniendo la misma clave | Error: tiene que ser distinta de la actual |
| 64 | Cambiar con claves nuevas que no coinciden | Error claro |
| 65 | Cambiar correctamente | Confirma, y el contador vuelve a 7 días |
| 66 | Entrar con la clave nueva | Funciona |
| 67 | Entrar con la anterior | Ya no funciona |
| 70 | Cerrar sesión | Vuelve a la pantalla de entrada |
| 71 | Tras cerrar sesión, reentrar y abrir Ajustes | **El campo de clave de edición está vacío** |
| 72 | No hay botón de descargar ni de cargar archivo | Correcto: está prohibido a propósito |

### 2.7b Caducidad semanal de la clave

> Para probar sin esperar una semana: en la consola del navegador, editar
> `zahavi_acceso_v1` en `localStorage` y retrasar su campo `changedAt` ocho días.

| # | Comprobación | Esperado |
|---|---|---|
| 72a | Entrar con la clave caducada | Pide **renovarla antes de entrar**, no deja pasar |
| 72b | El aviso de esa pantalla | Explica que se cambia cada 7 días |
| 72c | Poner una clave nueva válida | Entra directamente, sin volver a pedir la anterior |
| 72d | Intentar poner la misma que tenía | La rechaza |
| 72e | Tras renovar, abrir Ajustes | El contador vuelve a marcar 7 días |
| 72f | Un equipo que venía de la versión con usuarios | Entra con la clave que tenía el usuario `zahavi`, no se queda fuera |

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
| 84a | Tableta: el listado | Dos columnas, la letra inicial a todo lo ancho y **sin desplazamiento horizontal** dentro del panel |
| 85 | Celular (< 768 px) | Se turnan; al abrir una receta **entra como pantalla nueva**, no aparece comprimida abajo |
| 86 | Celular: acciones de la receta | Barra flotante abajo, al alcance del pulgar: **pegada al borde inferior de la pantalla**, no debajo de la cabecera |
| 87 | Celular: diálogos | Suben desde el borde inferior como una hoja |
| 88 | Celular: filtros de categoría | Dos columnas, sin desplazamiento horizontal |
| 89 | Cualquier tamaño | Sin desplazamiento horizontal de la página |

### 2.10a Márgenes y barra superior

Probar en **Pixel (360 px)**, iPhone SE (375 px) y tableta (768–991 px).

| # | Comprobación | Esperado |
|---|---|---|
| 89a | Ancho 320 px | **Nada se sale por el borde**: sin desplazamiento lateral en ninguna pantalla |
| 89b | Ficha de receta en celular | Las cinco franjas (cabecera, datos, tanda, ingredientes, método) con **el mismo margen lateral**, 16 px |
| 89c | La misma ficha en tableta | Igual, pero con 24 px, y ninguna franja con un margen distinto |
| 89d | Listado en celular y tableta | Los nombres de receta **no tocan el borde** |
| 89e | Barra superior en celular | Solo iconos: plan, ingredientes, nueva receta y engranaje. Cabe en **una sola fila** |
| 89f | Altura de la barra en celular | Notablemente más baja que antes; los botones de la ficha **conservan su tamaño** |
| 89g | Los iconos de la barra con lector de pantalla | Cada uno se anuncia con su nombre completo |
| 89h | Barra flotante de la ficha en celular | **Recetas** y **Pesar** con texto; imprimir, editar y eliminar como iconos cuadrados |
| 89h2 | La misma barra a 320 px | Volver pasa a icono para que quepa; Pesar conserva su nombre y **nada se solapa** |
| 89k | Los cinco factores de la tanda a 320 px | Se ven y se pueden pulsar los cinco, incluido el **×4** |
| 89i | Esos tres iconos con lector de pantalla | "Imprimir la receta", "Editar la receta", "Eliminar la receta" |
| 89j | Modo Pesar en celular | Cabecera, cifra y pie con margen lateral, no pegados al borde |

### 2.11 Accesibilidad

| # | Comprobación | Esperado |
|---|---|---|
| 93 | Recorrer todo con `Tab` | Todo alcanzable, foco siempre visible |
| 93a | Abrir un diálogo con el ratón | El foco entra en él de inmediato: Escape cierra sin haber pulsado Tab antes |
| 94 | Abrir un diálogo y tabular | El foco no se escapa detrás, ni con `Tab` ni con `Mayús+Tab` |
| 95 | Cerrar un diálogo | El foco vuelve al botón que lo abrió, aunque la pantalla se haya repintado entera |
| 96 | Activar "reducir movimiento" en el sistema | Sin animaciones |
| 97 | Consola del navegador | **Sin errores** |
| 98 | Pedir al navegador "traducir esta página" | **No la traduce**: la página lleva `translate="no"` |
| 99 | Lista de unidades del editor | Dice `und`, `paq.`, `cajas`, `porciones`. **Nunca `y`** |
| 100 | Nombres de receta e ingredientes | Se leen tal como están escritos, sin palabras sustituidas |

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
| Al abrir cualquier ventana el foco se quedaba fuera de ella: en Modo Pesar no respondían ni la barra espaciadora, ni las flechas, ni Escape, aunque la pantalla las anunciara | Recorrido de QA con navegador | Corregido |
| Al cerrar una ventana el foco volvía al principio de la página en vez de al botón que la abrió | Recorrido de QA con navegador | Corregido |
| "Imprimir la lista" del plan del día sacaba la ficha de la receta abierta: la hoja del plan no llegaba a montarse | Recorrido de QA con navegador | Corregido |
| A 320 px de ancho, las etiquetas de **Recetas** y **Pesar** se salían de su botón y se solapaban | Recorrido de QA con navegador | Corregido |
| La barra flotante de la ficha no llegaba abajo en celular: se quedaba pegada bajo la cabecera, a 660 px del pulgar. El `backdrop-filter` de la cabecera la convertía en el bloque contenedor de sus hijos `fixed` | Recorrido de QA con navegador | Corregido |
| En tableta el listado se repartía en diez columnas con 3.200 px de desplazamiento horizontal dentro del panel: `columns` reparte por altura, y el contenedor tiene la altura limitada | Recorrido de QA con navegador | Corregido |
| A 320 px el botón **×4** de la tanda quedaba fuera del segmento, que va en `overflow: hidden`, así que no se podía pulsar de ninguna manera | Recorrido de QA con navegador | Corregido |
