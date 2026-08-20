# Decisiones de ingeniería

> Parte de la documentación de [Zahavi · Recetario](../README.md).

Las decisiones no obvias, con su motivo. Conviene leerlas antes de cambiarlas.

### Por qué no hay framework

Un framework habría ahorrado unas horas de desarrollo inicial a cambio de una
cadena de dependencias que hay que mantener durante años. Para una aplicación de
este tamaño (26 módulos, un solo tipo de entidad) el ahorro no compensa el
compromiso a largo plazo. El código que hay aquí funcionará igual dentro de una
década.

### Por qué el recetario es un archivo en git y no una base de datos

Para 121 recetas y dos sedes que editan de forma esporádica, una base de datos
añade un servicio que mantener, pagar y respaldar, a cambio de resolver un
problema de concurrencia que aquí casi no existe. Git ya aporta historial,
recuperación de versiones y control de escrituras simultáneas mediante el `sha`.

Conviene decir también lo que una base de datos **no** habría resuelto, porque
es donde estaba el riesgo de verdad: que alguien editara durante semanas sin
publicar. Eso no es un problema de dónde se guarda, es de cuándo sale el dato
del equipo, y la respuesta fue la publicación automática de `app/sync.js`. Con
una base de datos habría que tomar la misma decisión, y la respuesta fácil
—escribir en el servidor en cada guardado— convertiría la señal en un requisito
y dejaría el obrador sin recetario cada vez que se cae la conexión.

**Cuándo sí toca revisarlo**, con señales objetivas y no opiniones: cuando el
archivo pase de 700 KB (hoy son 225, el 32%); cuando entre el costeo, con
precios que cambian a diario, porque la captura diaria de 159 ingredientes llega
a 1 MB en unos dos meses y ahí la API de GitHub deja de entregar el archivo;
cuando haga falta saber quién cambió qué, que hoy lo declara el navegador y el
servidor no lo comprueba; cuando editen a la vez más de dos o tres sedes, porque
el `sha` es del archivo entero y dos personas en recetas distintas chocan igual;
o cuando hagan falta informes que no se puedan calcular en el navegador.

### Por qué la clave de acceso no puede validarse en el servidor

Es la pregunta que vuelve cada vez que alguien mira este código, y la respuesta
cierra el espacio de diseño entero, así que conviene tenerla escrita.

La clave de acceso se comprueba **dentro del navegador**, contra un resumen
guardado en el propio aparato. Eso tiene una consecuencia incómoda y asumida:
no es una cerradura, es una cortina (ver [SEGURIDAD.md](SEGURIDAD.md)). La
tentación evidente es moverla al servidor, donde sí podría ser real.

No se puede, y no por comodidad: **el recetario tiene que abrir a las cinco de
la mañana en un obrador sin cobertura.** Si entrar exigiera hablar con el
servidor, un corte de red dejaría al equipo sin las fórmulas a media
producción. Ese es el requisito número uno del sistema, por encima de todo lo
demás, y es también la razón de que exista el modo sin conexión.

De ahí se sigue todo lo demás. La comprobación tiene que poder hacerse sin red,
luego el material con el que se compara tiene que estar en el aparato, luego
quien tenga el aparato puede leerlo, luego no es una cerradura. La única
protección real del sistema es `EDIT_PASSWORD`, que sí se comprueba en el
servidor y sí controla lo único que importa: escribir.

Lo que sí se puede hacer sin romper el requisito es **retirar** la clave desde
el servidor, que es lo que hace `ACCESS_GENERATION`: el servidor no valida nada,
solo anuncia un número, y el aparato decide. Sin red se usa el último número
conocido, así que un obrador aislado nunca queda fuera; se entera cuando vuelva
la señal, igual que se entera de una receta nueva.

### Por qué la clave de edición se pide al guardar y no solo en Ajustes

Publicar necesita la clave de edición, y durante meses solo se pedía en Ajustes.
Sobre el papel bastaba: una vez por sesión y listo. El resultado real fue que
**no llegó a publicarse ni una sola vez** — el historial de `data/recipes.json`
no tiene un solo commit de la función de publicación.

La aplicación no mentía. Decía "Receta guardada en este equipo" y la cabecera
avisaba de los cambios sin publicar. Pero un paso obligatorio escondido detrás
de un menú no es un paso, es un muro: nadie descubre por su cuenta que hay que
ir a otra pantalla a escribir una segunda clave que además se llama parecido a
la de entrar.

Ahora se pide **en el momento del primer guardado de cada sesión**, con el
cambio ya a salvo en el aparato, y "Ahora no" deja todo como estaba. La clave
sigue **sin** guardarse en disco: vive en la sesión del navegador, así que al
día siguiente hay que escribirla otra vez. Guardarla de forma permanente
ahorraría ese gesto y dejaría la llave del repositorio escrita en un equipo del
mostrador, y eso no compensa.

### Por qué la red de seguridad del arranque es un script suelto y no un módulo

`src/salvavidas.js` existe porque `index.html` pinta "Cargando recetario…" y
confía en que `main.js` lo sustituya. Si `main.js` no llega a ejecutarse, nadie
retira ese texto: la pantalla se queda cargando para siempre, sin explicación y
sin salida. En una panadería a las cinco de la mañana eso es el recetario
entero perdido, y la causa habitual no es exótica: un despliegue a medias o una
copia guardada que quedó corrupta.

Sus tres rarezas son deliberadas:

- **Archivo aparte y no código dentro del HTML**, porque la política declara
  `script-src 'self'` y un `<script>` con el código dentro no se ejecutaría.
- **Script clásico y no módulo**, porque tiene que estar escuchando antes de que
  `main.js` falle y poder ejecutarse aunque el navegador no entienda lo que
  `main.js` usa. Por eso no lleva `import` ni sintaxis moderna.
- **Escucha en fase de captura** (`addEventListener('error', …, true)`), porque
  el evento `error` de un `<script>` o un `<link>` no burbujea: sin ese `true`
  no se enteraría de que falta un archivo.

Y una prudencia: si la aplicación ya pintó algo distinto de la pantalla de
carga, el aviso no aparece. Borrarle la pantalla a alguien que está trabajando
por un error suelto de fondo sería peor que el propio error.

### Por qué el borrado tiene tres pasos distintos y no cuatro avisos iguales

Encadenar ventanas idénticas no hace que nadie lea: entrena a pulsar "aceptar"
varias veces seguidas sin mirar. Lo que obliga a detenerse es que cada paso pida
algo distinto y que el último exija escribir el nombre de la receta a mano.

1. **Qué se va a borrar**: nombre, código y cuánto contiene.
2. **Qué consecuencias tiene**, incluida la de las demás sedes.
3. **Escribir el nombre** para activar el botón, que arranca deshabilitado.

### Por qué los ingredientes van en una tabla a ancho completo

Antes se repartían en varias columnas de texto (`columns`), que reparte por
altura. Con dos componentes de distinta longitud, el corto dejaba un hueco
muerto debajo y la ficha se leía como un folleto a medio maquetar. Y probar con
`grid` de dos columnas tampoco valía: 72 de las 121 recetas tienen un solo
componente, y una tabla sola en media pantalla es peor todavía.

Ahora cada componente es una tabla que ocupa el ancho, apiladas en el orden en
que se trabaja. Sin huecos en ningún caso, se lee de arriba abajo como se pesa,
y la columna de cantidades tiene medida declarada: todas las cifras del
recetario caen sobre la misma vertical.

### Por qué las filas se separan con líneas y no con franjas de color

Las franjas alternas resolvían un problema real —no perder el renglón entre el
nombre y una cifra que está al otro extremo— pero teñían media ficha de beige, y
sobre blanco ese beige se leía rosado. El renglón lo sujeta ahora la cuadrícula:
línea entre filas, línea entre la columna del nombre y la de la cifra, y el
cuadro cerrado alrededor. Tres referencias rectas en lugar de una banda de
color, que es como se lee una tabla en cualquier sistema de gestión.

### Por qué el cliente repara y el servidor rechaza

Son prioridades opuestas y ambas correctas en su sitio. En el obrador, quedarse
sin poder consultar una fórmula a media producción no es aceptable: el cliente
normaliza lo que pueda y sigue. En el archivo compartido, aceptar un dato dudoso
lo propaga a las dos sedes: el servidor rechaza y devuelve el motivo.

### Por qué la clave de usuario se declara insegura en la propia interfaz

Porque lo es, y ocultarlo llevaría a alguien a apoyarse en ella. Se comprueba en
el navegador, así que cualquiera con conocimientos puede saltársela. Decirlo
claramente empuja a proteger de verdad lo que importa: la escritura.

### Reglas al tocar el código

1. **Nunca `innerHTML`.** Todo el DOM se construye con `lib/dom.js`, que solo
   escribe texto. Los nombres de receta y el método son texto libre.
2. **Los errores se devuelven, no se lanzan.** Todo el núcleo usa
   `{ok: true, value}` o `{ok: false, code, message}`, con el mensaje ya
   redactado para mostrarse.
3. **Ningún color ni espaciado fuera de `tokens.css`.**
4. **Todo comentado en español**, explicando el porqué y no el qué.
5. **Una marca lateral en una fila va con `inset box-shadow`, nunca con
   `border-left`.** El borde forma parte del modelo de caja, así que ensancha esa
   fila y desplaza su contenido respecto a las demás: justo lo contrario de lo
   que busca una rejilla compartida. La sombra no participa. Ya se corrigió tres
   veces por separado (listado, validador, plan) antes de escribirlo aquí.
6. **Las columnas de una lista se declaran una vez.** El encabezado y las filas
   comparten una variable (`--ings-cols`, `--plan-cols`) y el sangrado izquierdo
   se aplica por igual a ambos. Es lo que mantiene los rótulos a plomo sobre sus
   cifras al recorrer la lista en vertical.
7. **Se puede reconstruir todo salvo lo que la persona está usando.** El
   repintado destruye nodos; si uno de ellos tiene el foco, se pierde. O se
   actualiza en el sitio, o se devuelve el foco después buscándolo por `data-*`.
8. **Un límite que el núcleo aplique en silencio tiene que ser público.** Si la
   interfaz deja escribir un valor que el núcleo va a recortar, o avisa antes o
   acabará enseñando una cifra y calculando otra.
9. **Una regla de negocio no vive en una vista.** Si vive, la aplicará esa
   pantalla y ninguna más. Así estuvo el rendimiento escalado: correcto en
   pantalla, falso en el papel que se lleva al obrador.
10. **El nombre base de una receta NO es único.** 14 de las 121 comparten base y
    solo se distinguen por el rendimiento; cuatro se llaman "Sacher Torte". Toda
    lista que muestre el nombre base tiene que mostrar también el rendimiento, o
    ofrecerá filas idénticas entre las que no hay forma de elegir.
11. **Un `aria-label` sustituye al contenido, no lo complementa.** Si se pone en
    un control con varias piezas de información visible, tiene que nombrarlas
    todas o esas piezas dejan de existir para quien no ve la pantalla.
12. **El foco se pide cuando el nodo ya está en el documento, no antes.** Un
    contenedor sin conectar no tiene ningún elemento enfocable, así que
    preguntárselo devuelve una lista vacía y el foco se queda donde estaba. Con
    el foco fuera de un diálogo, las teclas que escucha ese diálogo no le llegan:
    la pantalla anuncia atajos que no responden. Se decide dentro del
    `requestAnimationFrame`, no fuera (`lib/a11y.js`).
13. **Repintar no es síncrono.** Con la View Transitions API, `paint()` corre
    después de que `setState` haya vuelto, así que un `requestAnimationFrame`
    llega antes que la pantalla nueva. Quien necesite el DOM ya cambiado
    (imprimir, medir) usa `trasPintar` en `main.js`, que espera al pintado real.
14. **`backdrop-filter` cambia a quién obedece un `position: fixed`.** Un
    elemento que lo lleva pasa a ser el bloque contenedor de sus descendientes
    fijos, así que su `bottom` deja de medirse desde la pantalla. Es lo que
    dejaba la barra flotante del celular pegada arriba.
15. **`columns` reparte por altura, no por ancho.** En un contenedor con la
    altura limitada, lo que no cabe no baja: abre otra columna a la derecha y
    aparece un desplazamiento horizontal que nadie pidió. Para repartir una lista
    con desplazamiento vertical va una rejilla, no columnas de texto.

---

## 12. Limitaciones conocidas

Documentadas de forma explícita para que las decisiones futuras se tomen con
información completa.

| Limitación | Impacto | Cuándo actuar |
|---|---|---|
| El contenido es visible para quien tenga el enlace | La clave de usuario no protege el contenido | Si las fórmulas pasan a considerarse secreto industrial |
| La API de contenidos de GitHub deja de entregar el archivo a partir de 1 MB | Hoy son 230 KB | Antes de llenar los 121 métodos de preparación |
| El almacenamiento del navegador ronda los 5 MB | Suficiente para texto, no para imágenes | Si se añaden fotografías de producto |
| La clave es una sola para todo el equipo | No se sabe quién entró, solo que alguien con la clave lo hizo | Si hiciera falta trazabilidad por persona |
| Los ingredientes se referencian por nombre, no por código | Un cambio de nombre no propaga | Antes del costeo (Fase 2) |
| Borrar los datos de navegación borra los cambios sin publicar | Lo ya publicado se recupera al recargar. La publicación automática reduce mucho la ventana, pero no la cierra: hasta la primera publicación manual de cada sesión, lo guardado sigue solo en el equipo | Formar al equipo: publicar una vez al empezar la jornada |
| La clave de edición vive solo en la sesión del navegador | La primera publicación de cada sesión es manual | Es deliberado: guardarla en el disco dejaría la llave del repositorio en un equipo del mostrador |
| Ninguna de las 121 recetas tiene método escrito | El campo existe y está vacío en origen | Trabajo de contenido, no técnico |
| 34 de las 121 no declaran rendimiento legible | Para esas solo se ofrece el multiplicador, no "quiero 24 unidades" | Se puede completar desde el editor, receta a receta |
| En 15 de ellas el rendimiento está escrito **dentro** del nombre pero no al final | El separador no lo encuentra: `TORTA ... X 1 UND ( SIN AZUCAR )` | El editor avisa al abrirlas para que no quede duplicado |
| 14 recetas comparten nombre base con otra | Se distinguen solo por el rendimiento, que ahora se muestra al lado en todas las listas | Al normalizar nombres, si alguna vez se hace |

### Incidencias detectadas en los datos, no corregidas

Se reportan y **no se tocan**, porque corregir una fórmula es una decisión del
negocio, no de quien migró los datos. La segunda sigue siendo visible desde el
**Ingredientes**, que marca la leche como medida en tres unidades
distintas. La primera se detectó al migrar y se documenta aquí:

- `SACHER TORTE x 8` lleva `CHOCOLATE 70%: 10008 GR`. Las variantes escalan
  exactas (126 → 630 → 756), así que el valor esperado sería `1008`. Son nueve
  kilos de chocolate de diferencia, y es un cero de más al teclear.
- `BERLINAS` mide la leche en `MG` (miligramos). Es la **única línea en MG de
  las 1.282**; 160 mg son 0,16 gramos, imposible para 18 berlinas. Casi con
  seguridad debería ser `ML`.

El primero es también el mejor argumento de por qué existe el escalado: esa
variante solo se escribió a mano porque no había forma de multiplicar la tanda,
y en la copia se coló el error.

---

## 13. Hoja de ruta

| Fase | Alcance | Estado |
|---|---|---|
| **1** | Consulta, edición y publicación de fórmulas | **En producción** |
| **1.5** | Escalado de tandas, plan del día y catálogo de ingredientes | **En producción** |
| **2** | Costeo por receta y margen | Requiere precios por ingrediente y normalizar por código |
| **3** | Inventario y órdenes de producción | Requiere base de datos real |
| **4** | Control integral del restaurante | — |

El salto a la Fase 2 es el punto donde conviene revisar la decisión de almacenar
en un archivo: el costeo introduce precios que cambian a diario, y ese patrón de
escritura sí justifica una base de datos.

### La señal que hay que vigilar

El techo real no es el número de recetas, es el **tamaño del archivo**: la API de
contenidos de GitHub deja de entregarlo a partir de 1 MB. Hoy son 225 KB.

- Llenar los 121 métodos de preparación lo deja entre 330 y 470 KB. **No revienta
  el límite**, al contrario de lo que este documento suponía antes.
- Con la forma actual y métodos escritos, el techo llega hacia las 300 recetas.
- Lo que sí lo revienta es el **histórico de precios** de la Fase 2: 159
  ingredientes con captura diaria llegan a 1 MB en unos dos meses.

**Umbral de acción: 700 KB.** A partir de ahí quedan semanas de margen, y es el
momento de la base de datos, no antes. Conviene además que la respuesta de
publicación devuelva el tamaño resultante, para que Ajustes pueda mostrarlo: el
tamaño de un archivo en un repositorio no lo mira nadie por su cuenta.

### Tres trabajos que conviene hacer antes de la Fase 2

El primero ya está hecho; los otros dos son decisiones que no se pueden tomar
desde el código.

Salieron de la revisión de arquitectura y son baratos hoy, caros después:

1. ~~**Indexar el desglose del plan por `id` y no por nombre** (`core/plan.js`).~~
   **Hecho.** No era un riesgo futuro: el editor no impide repetir un nombre, así
   que ya se podía provocar. Con dos recetas llamadas igual en el plan, el total
   salía bien pero el desglose decía "de 1 receta" y atribuía a una sola lo que
   ponían dos, que es justo lo que el desglose existe para evitar. Ahora la clave
   es el `id` y cada aporte lleva su nombre para pintarlo.
2. **Decidir dónde viven los costes antes de que existan.** El recetario se
   entrega hoy sin control de lectura, y es una decisión consciente. Los costes de
   proveedor y los márgenes no admiten el mismo trato: o van a otro sitio con
   lectura autenticada, o el servidor devuelve solo agregados. Migrar eso después
   de haberlo publicado es mucho más caro que decidirlo antes.
3. **Credenciales por persona para publicar.** La clave única compartida es
   tolerable con dos sedes; con más gente, cada baja obliga a rotarla para todos,
   y el autor del commit lo declara hoy el navegador sin que el servidor lo
   compruebe. Con costes de por medio, saber quién cambió un margen deja de ser
   opcional.

### Migrar el rendimiento a un campo propio

Si alguna vez se decide, el orden importa y no admite atajos, porque **los dos
esquemas reconstruyen la receta con una lista blanca de campos**: un campo nuevo
lo descarta en silencio cualquier equipo que aún tenga el código antiguo en
caché, y basta con que ese equipo publique una vez para borrarlo de las 121.

1. Que ambos esquemas (`core/schema.js` y `api/_schema.js`) acepten el campo.
2. Desplegar y **subir la versión de caché del service worker**.
3. Confirmar que las dos sedes han cargado el código nuevo.
4. Solo entonces migrar los datos, en un commit propio y con aprobación
   explícita, porque cambia el sha del archivo auditado.

Antes de todo eso hay que arreglar las cuatro vistas que muestran únicamente el
nombre base, o cuatro recetas pasarían a llamarse igual.

Antes de entrar en la Fase 2 hay dos trabajos que no son de software:

1. **Escribir los métodos.** Las 121 recetas tienen el campo vacío. Sin ellos, el
   sistema entrega cantidades pero no consistencia.
2. **Reunir los precios.** Son 159 ingredientes, de los cuales 64 se usan en una
   sola receta: mantener esa lista tiene un costo operativo que conviene medir
   antes de comprometerse. El catálogo de ingredientes da hoy esas cifras.
3. **Unificar las unidades de 15 ingredientes** que hoy se miden de dos o tres
   formas distintas (la leche llega a tener tres). Sin eso no se les puede
   asignar un precio único.

---

