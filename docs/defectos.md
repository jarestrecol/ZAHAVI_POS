# Historial de defectos, y la historia de cada regla

Referencia, y memoria forense. Existe para que una «mejora» no reintroduzca un
defecto ya pagado: este proyecto tiene tres casos de una regla aplicada a medias
tres veces por no tener esto a mano.

Se consulta cuando algo parece raro, cuando vas a cambiar una regla del núcleo, o
cuando una decisión del código no se entiende. **Este archivo solo crece**, y por
eso vive fuera del núcleo: un archivo que solo crece no cabe en un presupuesto.

Defectos reales, para que no vuelvan sin que nadie se dé cuenta. Todos corregidos.

| Defecto | Cómo se detectó |
|---|---|
| Al filtrar por categoría y abrir una receta, el filtro se perdía: los enlaces se escribían a mano sin los parámetros | Uso real |
| Listado y ficha se veían a la vez en móvil: `data-view` se ponía en un elemento y el CSS lo buscaba en otro | Diagnóstico móvil |
| Cerrar sesión no borraba la clave de edición: quien entrara después podía publicar sin conocerla | Auditoría de seguridad |
| El foco de los campos dependía de un borde naranja a 2,45:1 | Auditoría de accesibilidad |
| Tras crear y borrar lo mismo, la cabecera anunciaba "0 cambios sin publicar" con el botón activo | Alta y baja masiva |
| Al elegir una receta del final, el listado saltaba al principio | Uso real |
| Los tres colores de categoría tenían luminancias casi idénticas | Revisión de diseño |
| **El foco no entraba en ninguna ventana**: en Modo Pesar no respondían ni la barra espaciadora, ni las flechas, ni Escape, aunque la pantalla las anunciara | QA con navegador |
| Al cerrar una ventana el foco volvía al principio de la página | QA con navegador |
| "Imprimir la lista" del plan sacaba la ficha de la receta abierta: la hoja no llegaba a montarse | QA con navegador |
| A 320 px las etiquetas de **Recetas** y **Pesar** se solapaban | QA con navegador |
| La barra flotante no llegaba abajo en celular: el `backdrop-filter` de la cabecera la convertía en bloque contenedor de sus hijos `fixed` | QA con navegador |
| En tableta el listado se repartía en diez columnas con 3.200 px de desplazamiento: `columns` reparte por altura | QA con navegador |
| A 320 px el botón **×4** quedaba fuera del segmento, que va en `overflow: hidden` | QA con navegador |
| El programa que no arrancaba dejaba "Cargando recetario…" para siempre, sin salida | Revisión de fallos |
| Sin conexión, abrir una dirección que no fuera la portada daba error del navegador: `networkFirst` no caía a la portada | Revisión de fallos |
| El enlace de una receta eliminada llevaba a la bienvenida sin decir nada | Revisión de fallos |
| Un despliegue sin variables de entorno se veía igual que uno correcto | Revisión de fallos |
| El aviso de `noscript` llevaba el estilo en el atributo, que `style-src 'self'` descarta | Revisión de la CSP |
| Un repintado mientras alguien escribía en el buscador le llevaba el cursor al final | Prueba inestable |
| Las respuestas de error de `/api/recipes` dejaban su cuerpo sin consumir | Prueba inestable |
| El rendimiento impreso no se escalaba: la regla vivía dentro de una vista | Auditoría de arquitectura |
| Se podía publicar un recetario que después no se podría leer: el tope de envío era mayor que el techo de lectura | Auditoría de seguridad |
| **Tres vistas escribían estado directamente**, cada una limpiando un conjunto distinto: un permiso de escritura sobrevivía a un cierre de sesión | Auditoría de arquitectura |
| **Un enlace con un hash mal formado** (`#/receta/%E0%A4%A`) impedía arrancar: `decodeURIComponent` lanza al evaluar el módulo, y recargar no salvaba porque el hash seguía ahí | Auditoría de seguridad |
| **El limitador de intentos era falsificable**: tomaba el primer elemento de `X-Forwarded-For`, que lo escribe quien llama | Auditoría de seguridad |
| **El tope de publicación medía el cuerpo recibido, no lo que se escribe** (que lleva sangrado y abulta más) | Auditoría de seguridad |
| Dos bloques de `verificar.mjs` escribían su cifra a mano y las dos mentían: 9 en vez de 29, y 28 en vez de 37 | Auditoría de deuda técnica |
| **En el teléfono el teclado se cerraba y se abría con cada tecla del buscador**: el repintado sacaba del documento el campo enfocado y le devolvía el foco un fotograma después, dentro de un `requestAnimationFrame` | Uso real, reportado por el obrador |
| **No se veía cuál de los cuatro filtros de categoría estaba puesto**: activo e inactivo se diferenciaban en 1,1:1 sobre el rail oscuro | Uso real, reportado por el obrador |
| **En celular y tableta, volver de una receta mandaba el listado arriba del todo**: la posición se leía del propio nodo justo antes de destruirlo, y ahí la lista está en `display: none`, así que se leía 0 y se escribía en el vacío | Uso real, reportado por el obrador |
| **Publicar una receta desde el obrador puso la verificación en rojo**: cuatro scripts y seis pruebas de navegador llevaban escritos a mano el total (121), el reparto por categoría (66/34/21), las líneas de ingrediente (1.282) y el catálogo (159/64/15/86). No había nada roto: solo había una receta más | Publicación real desde la panadería |
| **La fila de la receta abierta incumplía la regla 14**: iba con `border-left` y un `padding` que restaba los mismos píxeles. No se notaba porque la resta estaba bien puesta; se habría notado el día que alguien tocara el espaciado. De paso, las filas iban dos píxeles desalineadas respecto al separador de letra | Auditoría de arquitectura |
| **La prueba del tamaño de texto era inestable**: medía de una sola pasada justo después de poner el atributo en la raíz, y poner el atributo y recalcular el estilo son dos cosas distintas. Fallaba una de cada tantas ejecuciones en paralelo y nunca aislada, que es el peor tipo de fallo | Suite ejecutada en paralelo |
| **Y al volver no quedaba marcada ninguna fila**: la marca dependía de que hubiera una receta en la ruta, y al volver al listado ya no la hay. En una columna de 122 filas iguales, la altura correcta sin marca sigue sin decir cuál era | Uso real, reportado por el obrador |
| `CLAUDE.md` tenía 95 líneas con doble codificación y `verificar.mjs` imprimía basura en cada línea de su resumen | Auditoría de deuda técnica |
| **La aplicación instalada no cabía en la pantalla del teléfono y había que pellizcar para reducirla**, y al desplazar el listado aparecía "scroll infinito de fondo blanco". Eran el mismo defecto: `#app` no tenía **ni una regla de CSS**, y `main.js` mete ahí los avisos de contexto *encima* de un `.app` que medía `100dvh` por su cuenta. Medido en un Pixel 5: `#app` acababa en 963 px sobre una pantalla de 851, justo los 112 px del aviso. No era un caso raro —los avisos de sin conexión y de cambios sin publicar salen a diario— y además faltaba `overscroll-behavior` en la raíz, así que el rebote encadenaba al documento | Uso real, reportado por el obrador |
| **Las sugerencias de ingrediente no se veían al escribir desde el teléfono**: el navegador pinta las de un `<datalist>` dentro de la barra del teclado, cuyo alto depende del tamaño de letra configurado en el aparato. Con letra grande no caben. Esa barra no pertenece a la página, así que no había CSS que lo arreglara | Uso real, reportado por el obrador |
| **FEFO consumía primero el lote vencido**, que es exactamente lo contrario de lo que protege. Se vio al ejecutar el costeo con los datos de ejemplo, no leyendo el código | Prueba del módulo nuevo |
| **El foco caía al `body` tras dos acciones que destruyen su propio botón** (sembrar los datos de ejemplo, y descontar del almacén), y con el foco fuera la ventana dejaba de responder a Escape | QA con navegador |
| **`Permissions-Policy: microphone=()` bloqueaba el micrófono también para la propia página**, así que el dictado por voz no habría funcionado nunca | Auditoría de infraestructura |
| **Una prueba de móvil medía encima de la transición de vista**: mientras corre, el navegador pinta dos fotografías del documento en una capa aparte y `elementFromPoint` devuelve `<html>`. Daba un falso positivo de "hay superficie sin pintar" con la pantalla entera cubierta | Suite ejecutada en paralelo |
| **La pantalla de arranque del celular seguía mostrando el monograma** pese a tener el logotipo en `icon-512.png` y publicado. Desde Android 12 esa pantalla la dibuja el sistema con el icono del lanzador, y el `any` del manifiesto no interviene: la estrategia documentada solo era cierta hasta Android 11 | Prueba en un teléfono real, reportada por el obrador |
| **`movimientos` no se podía insertar en absoluto**: su política necesita leer la sede del lote para saber si el apunte es de tu casa, y a `lotes` se le había revocado la lectura entera para proteger el costo. La bodega quedaba inutilizable con la seguridad «bien» escrita. De ahí salió el permiso por columnas | Ejecución del esquema contra un PostgreSQL real |
| **Una prueba de seguridad se ponía roja con la seguridad intacta**: esperaba una excepción al intentar que el operario se subiera el rol, y PostgreSQL no lanza ninguna. Un `insert` contra el `with check` de una política falla, pero un `update` cuyo `using` no encaja con ninguna fila solo toca cero filas. Peor que el falso negativo era el arreglo evidente —dar por buena cualquier salida—, que la habría puesto verde con la seguridad rota | Ejecución del esquema contra un PostgreSQL real |
| **Pulsar una receta desde el catálogo de Ingredientes llevaba al listado, no a la ficha.** El manejador navegaba y acto seguido llamaba a cerrar la ventana; desde que cerrar también navega, la segunda llamada leía la ruta **anterior** —el cambio de hash aún no se había procesado—, no encontraba receta abierta y se iba al listado pisando el destino. Las dos llamadas no eran redundantes: eran una carrera | QA con navegador |
| **Con el plan del día abierto, los enlaces del listado apuntaban a `#/plan?r=R010`.** El listado construía sus enlaces heredando la ruta vigente, y con un módulo abierto encima la ruta vigente es la de ese módulo. Se corrigió en `navigate`, que es donde estaba la causa, y no en cada sitio que navega: en cada sitio hay que acordarse, y en uno solo no | QA con navegador |
| **El propio ayudante de las pruebas introdujo un fallo fantasma**: esperaba `('.app, .inicio').first()`, y el menú sigue en el documento unos milisegundos después de cambiar el hash porque el repintado va detrás de la transición de vista. Resolvía sobre el menú viejo y devolvía el control antes de tiempo, así que las cuatro pruebas de móvil medían una pantalla a medio cambiar. No había nada roto en la aplicación | Suite ejecutada en paralelo |
| **La tabla del almacén salía torcida con la regla 15 cumplida al pie de la letra.** El encabezado y las filas compartían `--almacen-cols`, como manda la regla, pero esa variable acababa en `auto` y son **dos rejillas distintas**: `auto` se resuelve dentro de cada una con lo que tenga dentro. En el encabezado la última celda es un `<span>` vacío (0 px) y en la fila son «Editar» y la equis (unos 100). Esos 100 px salían del reparto de los `fr`, así que ningún rótulo caía sobre su dato, y cuanto más a la derecha, peor. Con una medida fija no hay nada que resolver | Uso real, reportado por la panadería |
| **«valor / und» no lo entendía nadie, y la pregunta la hizo la panadería.** La columna no decía de qué unidad hablaba: un número suelto en una tabla de precios no dice si son pesos por gramo o por bulto. Ahora la columna se llama «costo por unidad» y **cada celda lleva su unidad escrita** (`$4,8` · `por 1 GR`), la del bulto que se compró. Apilada y no en una línea, porque la unidad cambia de fila a fila y escrita detrás del número desalinearía una columna que es tabular a propósito | Uso real, reportado por la panadería |
| **En el teléfono, la tarjeta de un lote eran tres cifras sin nombre.** El corte móvil esconde el encabezado —siete columnas no caben— y el comentario del CSS decía desde el primer día que «cada dato lleva su rótulo», pero los rótulos no existían: se veía `20000 GR · $168.000`, `$8,4 por 1 GR` y `14500 GR`, o sea lo que trae el bulto y lo que queda, en la misma unidad y sin distinguir | Uso real, reportado por la panadería |
| **Se entraba a un módulo y ya no había forma de salir sin ratón.** A un módulo se llega pulsando su tarjeta del menú, y ese pulsado destruye la tarjeta: el repintado se lleva el menú entero. El foco caía al `body`, y como quien escucha Escape es la propia pantalla y no el documento, no le llegaba ni una tecla. Es la **regla 26** por tercera vez, y el arreglo tuvo que ser síncrono —en la misma tarea que inserta la pantalla— porque entre eso y el `requestAnimationFrame` siguiente cabe una pulsación que se pierde (**regla 16**) | QA con navegador |
| **Al cerrar Ajustes el foco volvía al principio de la página.** `lib/a11y.js` reconoce al reemplazo del botón que abrió la ventana por `id` o por `aria-label`, porque el repintado ya lo sustituyó por otro nodo. El de la barra tenía `aria-label`; el del menú, recién nacido, no tenía ninguno de los dos | QA con navegador |
| **El ayudante de las pruebas volvió a inventarse un fallo fantasma, y por el mismo motivo de siempre.** `abrirModulo` decidía si tenía que pulsar «Menú» mirando si ese botón existe; con una transición de vista por medio, la barra anterior sigue en el documento unos milisegundos después de que el hash haya cambiado, así que encontraba un botón que se estaba yendo y fallaba con «element was detached from the DOM». La pregunta correcta no era «¿hay botón de Menú?» sino «¿está ya el menú?» | Suite ejecutada en paralelo |
| **El `revoke` de funciones de `0005` no revocaba absolutamente nada, y el archivo daba el acceso por cerrado.** `revoke all on all functions in schema public from anon, authenticated` parece cerrar la puerta y no la toca: en PostgreSQL una función **nace** con `execute` concedido a `PUBLIC`, y esos dos roles heredan de ahí, así que revocarles a ellos borra unas entradas que nunca existieron. Medido en el proyecto real: `anon` —sin sesión y sin token— podía ejecutar `mi_rol()`, `mi_sede()`, `es_al_menos()`, `es_mi_sede()` y `gasto_por_periodo()`. **No había fuga** —sin `auth.uid()` devuelven nulo y `false`, y el mismo `revoke` SÍ funciona sobre tablas, que no tienen concesión por defecto a `PUBLIC`—, y ese es justamente el peligro: el defecto no era una puerta abierta, era un archivo afirmando haber cerrado una que ni había tocado. La siguiente función `security definer` que haga trabajo de verdad nacería abierta a todo el mundo con esa línea encima | Preguntando al catálogo del Supabase real, no leyendo el SQL |
| **Cuatro funciones sin `search_path` fijo, y la comprobación daba verde con razón.** `verificar-sql.mjs` exigía `set search_path` a toda función `security definer`, y esas cuatro no lo son. El criterio era correcto por sus propios términos y demasiado estrecho: dos de ellas eran `es_al_menos()` y `es_mi_sede()`, que consultan **todas** las políticas y **todas** las vistas, así que desviarlas no se salta una comprobación sino todas a la vez. Ahora se exige a todas las funciones del esquema, admitiendo las dos formas de fijarlo —en la cabecera del `create` o con un `alter function` posterior— | Avisos del linter de Supabase, confirmado en el catálogo |
| **`btree_gist` metió unas 170 funciones suyas en `public`, que es el esquema que PostgREST publica como API.** No era desorden: era superficie expuesta. La extensión se instaló sin declarar esquema y `public` es el primero del `search_path`. Movida a `extensions` en `0006`, con `create schema if not exists` delante para que el archivo siga aplicándose igual en un PostgreSQL recién instalado. El índice de `precios_sin_solape` no se entera, porque apunta a su clase de operadores por identificador y no por nombre | Aviso `extension_in_public` de Supabase |
| **`probar-sql.mjs` llevaba la lista de migraciones escrita a mano y se quedó corta en cuanto hubo una nueva.** `0006` no se aplicaba, y la prueba seguía diciendo «el esquema se comporta como dice» sobre un esquema que no era el del repositorio. Se cazó por un detalle tonto —imprimía «Las 5 migraciones» habiendo seis— y es el mismo defecto que este documento ya registra dos veces con las cifras escritas a mano, solo que aquí no envejecía un número: envejecía la cobertura. Ahora lee la carpeta | La propia salida del comando, al no cuadrar con `ls` |
| **Dos fronteras del esquema daban `ok` sin mirar lo que decían vigilar**: una revisaba dos de las cuatro funciones `security definer` e informaba de dos; la otra exigía que `lotes` no concediera lectura y lo confirmaba porque su expresión solo reconocía `grant select on tabla` y el permiso se concede por columnas. Una comprobación que no ve lo que vigila es peor que no tenerla, porque además tranquiliza. Las dos se reescribieron y se probaron **adulterando el esquema a propósito** para verlas fallar | Revisión de las propias fitness functions |

---


---

# Las 26 reglas, con la historia completa de cada una

El núcleo lleva las reglas en imperativo con su causa en una cláusula. Esto es el
expediente: el defecto real del que salió cada una.
Cada una salió de un defecto real. El motivo va con la regla porque sin él la
regla se "mejora" y vuelve el defecto.

1. **Nunca `innerHTML`.** Todo el DOM sale de `lib/dom.js`, que solo escribe
   texto. Los nombres de receta y el método son texto libre.
2. **Los errores se devuelven, no se lanzan**: `{ok:true, value}` o
   `{ok:false, code, message}`, con el `message` ya redactado para la persona.
3. **Ni un color ni un espaciado fuera de `assets/css/tokens.css`.**
4. **Todo comentado en español**, explicando el porqué y no el qué.
5. **Una regla de negocio nunca vive en una vista.** Si vive, la aplica esa
   pantalla y ninguna más: así la ficha decía "Rinde 6 und" mientras el papel del
   obrador decía "Rinde 2 und" con las cantidades ya multiplicadas debajo.
6. **El nombre base de una receta NO es único.** 14 de las 122 comparten base y
   cuatro se llaman "Sacher Torte". Toda lista que muestre el nombre base tiene
   que mostrar también el rendimiento, o dará filas idénticas.
7. **El cliente repara, el servidor rechaza.** Son prioridades opuestas y ambas
   correctas: que el obrador nunca se quede sin consultar, y que nunca entre
   basura al archivo compartido.
8. **Guardar y publicar no son lo mismo.** Guardar escribe en el equipo, también
   sin señal. Publicar envía el recetario **entero** a las demás sedes.
9. **La versión se declara una sola vez**, en `src/core/version.js`.
   `package.json` tiene que decir lo mismo y la verificación lo comprueba. Al
   publicar un cambio de módulos **sube también `CACHE_VERSION` en `sw.js`**, o
   los equipos seguirán con la carcasa vieja en caché.
10. **Clave de acceso y clave de edición son cosas distintas.** La de acceso es
    local y es una cortina, no una cerradura; no puede validarse en el servidor
    porque el recetario tiene que abrir sin cobertura. La única protección real
    es `EDIT_PASSWORD`, que sí se comprueba en el servidor.
11. **Crear, modificar y eliminar piden la clave de edición ANTES y CADA VEZ.**
    El permiso vive en `state.autorizacion`, vale para una acción concreta y se
    retira al terminar o cancelar. **No lo ates a `getEditKey()`**: esa clave está
    en la sesión solo para que la publicación salga sola, y usarla como permiso
    convierte la primera comprobación del día en una llave que abre la jornada
    entera. La puerta se monta en un solo punto por acción —`renderDialogs` en
    `main.js`— y no en cada botón, para que cubra también los atajos de teclado y
    entrar por la dirección directa. Sin recetario compartido no se pide: no hay
    quien la valide ni a dónde publicar.
12. **Una vista no escribe estado.** Recibe callbacks. Cuando cada pantalla
    escribía por su cuenta, cada una tenía su propia idea de qué limpiar, y así un
    permiso de escritura sobrevivía a un cierre de sesión. Lo comprueba
    `verificar.mjs`.
13. **Cerrar sesión se hace con `cerrarSesion` de `app/commands.js`**, nunca con
    `signOut` a secas: la revocación de la clave de edición viaja con el cierre.
    Lo comprueba `verificar.mjs`.
14. **Una marca lateral en una fila va con `inset box-shadow`, nunca con
    `border-left`.** El borde forma parte del modelo de caja, así que ensancha esa
    fila y desplaza su contenido respecto a las demás. La sombra no participa. Se
    corrigió tres veces por separado antes de escribirlo.
    **Y la regla estaba incumplida donde más se ve.** `.recipe-link.is-active`
    llevaba `border-left` de 2 a 4 px con un `padding-left` que restaba
    exactamente esos 2 px. Funcionaba, y esa era la trampa: lo único que impedía
    que la fila abierta se desplazara respecto a las demás era una resta escrita
    a mano en otra propiedad, que el día que alguien tocara el espaciado dejaría
    de cuadrar en silencio. Ya no hay nada que compensar. Y lo que la regla
    protege de verdad —que la columna siga recta— lo mide
    `tests/recorrido.spec.js`, que es más honesto que prohibir una propiedad:
    cualquier técnica que mantenga la alineación pasa.
15. **Las columnas de una lista se declaran una vez.** El encabezado y las filas
    comparten una variable (`--ings-cols`, `--plan-cols`) y el sangrado izquierdo
    se aplica por igual a ambos.
16. **Se puede reconstruir todo salvo lo que la persona está usando.** El
    repintado destruye nodos; si uno tiene el foco, se pierde. O se actualiza en
    el sitio, o se devuelve el foco después buscándolo por `data-*`.
    **Y devolverlo tiene que ser síncrono, en la misma tarea que inserta el
    árbol nuevo.** Hacerlo en el `requestAnimationFrame` siguiente basta en un
    ordenador y no basta en un teléfono: entre medias cabe un fotograma, y en
    ese fotograma el sistema empieza a cerrar el teclado en pantalla. Escribir
    en el buscador desde el móvil era una pelea justo por eso. Donde se pueda,
    mejor todavía: **reutilizar el mismo nodo**, que se lleva su texto y su
    cursor consigo y no deja nada que restaurar (`campoBusqueda` en
    `views/sidebar.js`).
    **Y lo que se recuerde de un nodo se guarda FUERA del DOM, no leyéndoselo al
    nodo justo antes de destruirlo.** Un elemento oculto no tiene caja: leerle
    el `scrollTop` devuelve 0 y escribírselo no hace nada. Por donde iba el
    listado se guardaba así, y en celular y tableta —donde abrir una receta pone
    la lista en `display: none`— se perdía en cada consulta. Va en
    `listaScroll`, en `main.js`, con la clave del filtro al que pertenece.
17. **Un límite que el núcleo aplique en silencio tiene que ser público.** Si la
    interfaz deja escribir un valor que el núcleo va a recortar, o avisa antes o
    acabará enseñando una cifra y calculando otra.
18. **Un `aria-label` sustituye al contenido, no lo complementa.** Si se pone en
    un control con varias piezas visibles, tiene que nombrarlas todas.
19. **El foco se pide cuando el nodo ya está en el documento, no antes.** Un
    contenedor sin conectar no tiene elementos enfocables, así que la lista vuelve
    vacía y el foco se queda donde estaba: la pantalla anuncia atajos que no
    responden. Se decide dentro del `requestAnimationFrame` (`lib/a11y.js`).
20. **Repintar no es síncrono.** Con la View Transitions API, `paint()` corre
    después de que `setState` haya vuelto. Quien necesite el DOM ya cambiado
    (imprimir, medir) usa `trasPintar` en `main.js`.
21. **`backdrop-filter` cambia a quién obedece un `position: fixed`.** Un elemento
    que lo lleva pasa a ser el bloque contenedor de sus descendientes fijos, así
    que su `bottom` deja de medirse desde la pantalla.
22. **`columns` reparte por altura, no por ancho.** En un contenedor de altura
    limitada, lo que no cabe abre otra columna a la derecha y aparece un
    desplazamiento horizontal que nadie pidió. Para repartir una lista con
    desplazamiento vertical va una rejilla.
23. **Escribe los archivos en UTF-8.** Este mismo `CLAUDE.md` llegó a tener 95
    líneas con doble codificación (la `á` pasa a una `A` con tilde seguida de un ordinal), y `verificar.mjs` imprimía basura
    en cada línea de su resumen. Lo provoca guardar con `Set-Content` sin
    `-Encoding utf8` en PowerShell, o pasar código por una tubería que interpreta
    los escapes. **Ya no hace falta acordarse**: `verificar.mjs` tiene un bloque
    que lo detecta y dice el archivo y la línea.

24. **Las unidades NUNCA se convierten solas, y con dinero de por medio esto
    deja de ser una imprecisión.** Si el plan pide un ingrediente en `GR` y el
    almacén solo lo tiene en `UND`, esa línea sale **sin precio** y se dice en
    pantalla. No se busca en otra unidad ni se inventa un factor. Decidir si
    `AGUA` en GR y en ML son lo mismo —lo son— o si `MANTEQUILLA 1050 UND` es un
    error —lo es— exige conocer la fórmula, y eso lo decide la panadería, no el
    código. La cifra vive en la [sección 12](#12-datos-verificados) y no aquí,
    porque ya envejeció una vez: este párrafo decía «15 ingredientes en 67
    líneas», que era cierto hasta que la panadería publicó la receta 122.
25. **FEFO no puede consumir lo que ya venció.** "Lo que vence antes sale antes"
    aplicado a ciegas pone el lote caducado el primero de la fila, así que sería
    el primero en entrar en producción. En un almacén de alimentos eso no es un
    redondeo mal hecho: es mandar producto vencido al obrador. Se detectó
    ejecutándolo, con los datos de ejemplo: pedir 2.000 GR de `CHOCOLATE 70%`
    gastaba primero los 1.500 del lote vencido. Lo vencido queda fuera del
    cálculo **y se dice cuántos lotes se dejaron fuera**, o el plan diría que
    falta harina teniendo un bulto en la estantería y parecería un fallo del
    programa.
26. **Una acción que destruye su propio botón tiene que recolocar el foco.**
    Pasa más de lo que parece: "Cargar lotes de ejemplo" desaparece en cuanto hay
    lotes, y "Descontar del almacén" se sustituye por el resultado. Sin
    recolocarlo, el foco cae al `body`, la ventana deja de recibir el teclado y
    **Escape ya no cierra**: quien navega sin ratón se queda atrapado dentro. Se
    devuelve a la acción que toca ahora, o al propio mensaje de resultado con
    `tabindex="-1"`. Ocurrió dos veces en el mismo cambio, en dos pantallas
    distintas, y las dos las cazó la prueba de navegador y no la revisión.

---

