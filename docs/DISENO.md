# Accesibilidad, rendimiento y sistema de diseño

> Parte de la documentación de [Zahavi · Recetario](../README.md).

## Accesibilidad y rendimiento

### Accesibilidad

Objetivo **WCAG 2.2 nivel AA**, con AAA en el texto de lectura porque se lee de
pie, a distancia de brazo y con posible reflejo.

- Contrastes verificados y anotados en el propio código, valor por valor, **contra
  la superficie real sobre la que se pinta**: un mismo tono no da lo mismo sobre
  blanco que sobre `--surface-sunk`, y el panel derecho del plan es hundido.
- Los tres colores de categoría se reparten el círculo cromático (rosa 330°,
  ámbar 35°, verde 165°) y nunca son la única señal: siempre van acompañados del
  nombre.
- Navegación completa por teclado, con foco visible de alto contraste.
- Foco atrapado y restaurado en cada diálogo.
- **El foco sobrevive al repintado.** Las listas que se despliegan (plan del día,
  ingredientes) se reconstruyen enteras al abrir una fila, lo que destruye el
  botón pulsado. Ambas lo devuelven a su sitio buscándolo por `data-*` después de
  redibujar. Sin eso, abrir una fila entre 159 manda el foco al principio del
  documento.
- **Un botón enfocado se activa con su propia semántica.** El Modo Pesar escucha
  la barra espaciadora en todo el panel para dar por pesado y avanzar, pero
  ignora la pulsación cuando el foco está sobre un botón. Sin esa guarda,
  `preventDefault()` cancelaba la activación nativa: pulsar Intro sobre "Salir"
  daba el ingrediente por pesado en vez de cerrar, y el "Salir" de la pantalla
  final se quedaba muerto. Con ratón no se notaba nada.
- **Moverse anuncia qué hay que pesar, no solo cuántos van.** Las flechas del
  Modo Pesar cambian ingrediente y cifra, y ninguno de los dos vive en una
  región viva. Se anuncian juntos, en un solo mensaje: la región viva es única y
  un segundo mensaje borra el primero antes de que termine de leerse.
- **Una etiqueta accesible dice todas las columnas que sustituye.** El
  `aria-label` de una fila del catálogo de ingredientes reemplaza a su contenido,
  así que nombra el ingrediente, **sus totales por unidad** y en cuántas recetas
  entra. Antes se dejaba fuera el total, que es la cifra que da sentido a esa
  pantalla.
- **Un botón que pierde su texto no pierde su nombre.** En el teléfono, la barra
  superior y tres acciones de la ficha se quedan solo con el icono para que
  quepan. El nombre viaja siempre en `aria-label`, nunca únicamente en el texto
  visible: ocultar ese texto con CSS lo borra también del árbol de
  accesibilidad, y el botón se quedaría sin nombre.
- **Los objetivos táctiles se reducen donde toca y no en bloque.** La barra
  superior baja a 36px en el teléfono; el resto de la aplicación conserva los
  44px de `--tap-min`. 36 sigue muy por encima de los 24 que exige el criterio
  2.5.8, y es lo que permite encoger la barra sin encoger nada más.
- **Nada se corrige solo en silencio.** Cuando el plan rechaza o ajusta un número
  tecleado, lo dice en un nodo visible que además es `role="status"`: el mismo
  texto sirve para quien lo ve y para quien lo escucha, sin duplicar el mensaje.
  Un aviso que solo existe en la región viva deja sin explicación a quien ve el
  valor volver atrás.
- Región viva para anunciar el resultado de guardar, eliminar y publicar.
- `prefers-reduced-motion` respetado: toda la animación sale de variables CSS que
  la propia hoja de estilos deja en `0ms`, sin comprobaciones dispersas.

### Rendimiento

| Métrica | Valor |
|---|---|
| Dependencias en tiempo de ejecución | 0 |
| Peticiones a terceros | 0 |
| JavaScript (sin comprimir) | ~247 KB |
| CSS (sin comprimir) | ~118 KB |
| Tipografías (subconjunto latino) | ~290 KB |
| Datos | 225 KB |
| Paso de compilación | Ninguno |

El repintado reconstruye el árbol completo en cada cambio. Con 121 recetas son
unos cientos de nodos y el navegador lo resuelve sin esfuerzo, así que no hace
falta comparar árboles ni llevar registro de qué cambió. La única excepción son
los diálogos, que se conservan montados para no borrar lo que alguien está
escribiendo.

Dentro de esos diálogos hay una excepción más, y no es por rendimiento: el campo
de tandas del plan se actualiza **sobre sí mismo** en vez de redibujar su fila.
Redibujarla destruía el control que tenía el foco, así que cada pulsación de las
flechas del contador se llevaba por delante la flecha que se estaba pulsando. La
regla que sale de ahí es general: se puede reconstruir todo salvo lo que la
persona está usando en ese instante.

---

## 7. Sistema de diseño

**Dirección**: obrador de producción. Superficie clara de trabajo, estructura
oscura que enmarca, profundidad real con vidrio esmerilado y sombras de dos
capas, y el naranja de la marca como único acento.

### Paleta

Nace del logotipo real, con los valores tomados del archivo: naranja `#F68A1E`,
dorado `#FCE00C`, blanco `#FCFCFC`.

Dos decisiones que conviene conocer antes de tocar los colores:

- **El naranja de marca no vale para texto**: sobre blanco da 2,4:1. Se usa como
  relleno, borde e icono; para texto existe `--amber-text`, oscurecido pero del
  mismo tono.
- **Las categorías se separan por tono, no por claridad**: el techo de contraste
  AAA las obliga a todas por debajo de una luminancia de 0,10, así que la
  distinción la carga el matiz.

### Tipografía

Tres familias con papeles distintos, auto-hospedadas en `assets/fonts/`
(subconjunto latino, que cubre todo el español):

| Familia | Papel | Por qué |
|---|---|---|
| **Plus Jakarta Sans** | Interfaz | Es lo que hace que se lea como sistema y no como libro de cocina |
| **Lora** | Marca y títulos de receta | Da carácter editorial al nombre del producto |
| **IBM Plex Mono** | Cifras | Tabular: las cantidades deben alinearse siempre en columna |

### Zonas

La pantalla se reparte en dos planos que no se pueden confundir, y esa
separación es el eje del diseño:

| Zona | Tratamiento | Por qué |
|---|---|---|
| **Estructura** (barra superior, filtros, buscador, listado) | Oscura | Es navegación: enmarca, no compite |
| **Trabajo** (ficha de receta) | Superficie clara | Es donde se lee y se pesa |

Por eso la receta abierta destaca de verdad: es la única pieza cálida, en
naranja de marca, sobre una columna oscura.

### Tokens

Todo el sistema vive en `assets/css/tokens.css`: color, tipografía, ritmo,
radios, sombras, duraciones. Ningún valor de color o espaciado está escrito a
mano fuera de ese archivo.

Los colores del listado (`--rail-*`, `--cat-*-rail`) son los de esa estructura
oscura, distintos de los del área de trabajo. Lo mismo vale para la confirmación:
`--ok` está pensado para leerse sobre blanco y sobre el rail desaparece, así que
existe `--ok-on-rail` para el Modo Pesar.

### Controles: geometría propia y un solo acento

Dos decisiones que separan esto de una página de producto y lo acercan a una
herramienta de gestión:

- **`--radius-control` (6px), aparte de los radios de superficie.** Un botón de
  tres centímetros con el mismo radio que una ventana de setenta rem se lee como
  una pastilla, y una barra de herramientas llena de pastillas no parece una
  herramienta de trabajo. Botones y campos comparten esta geometría: pertenecen
  a la misma familia. Las superficies mantienen su propia escala, hoy corta —de
  3 a 12px—: lo que ordena la pantalla son las líneas, y una línea recta no gira.
- **La línea es el material principal.** Cada zona va cerrada por un borde y
  cada tabla separa sus filas y sus columnas con `--line` y `--line-cell`. No
  hay fondos de color haciendo de separador: los fondos se reservan a las
  cabeceras, que es donde dicen algo.
- **Un único relleno de marca en toda la pantalla.** `--brand-strong` (#995107)
  sustituyó al naranja de marca en la acción principal. El naranja pleno es un
  color de máxima saturación **y** máxima claridad a la vez: quitarle el
  degradado no bajó ninguna de las dos, y por eso seguía leyéndose como
  fluorescente. El tono profundo conserva el matiz, admite texto blanco a 5,9:1
  y deja de gritar. Los tres botones de la barra oscura pasaron de ámbar a
  neutro, y "Pesar" pasó a relleno de tinta: cuatro reclamos simultáneos hacían
  que ninguno significara nada.

El botón responde cambiando de superficie, no moviéndose de sitio: el
levantamiento de un píxel al pasar el cursor convertía cada barrido del ratón
por la barra en una fila de piezas saltando.

### Dos paletas con dos trabajos

**El color cálido dice qué es la receta. El color frío dice en qué parte del
trabajo estás.** Son dos preguntas distintas y por eso son dos paletas, no dos
usos de la misma.

- **Categorías** (`--cat-*`): pastelería, panadería, galletas. Identidad del
  producto. Viven en la cabecera, en el sello de rendimiento y en las barras de
  los títulos de sección.
- **Componentes** (`--comp-1` a `--comp-4`): masa, relleno, cobertura. Estación
  de trabajo. Viven en la tarjeta de cada componente y en el modo Pesar.

Son **exactamente cuatro** porque el recetario nunca pasa de cuatro componentes:
72 recetas tienen uno, 35 dos, 11 tres y 3 cuatro. No hay repetición posible
dentro de una ficha.

El orden de los cuatro no es casual. Galletas es la única categoría fría (verde,
165°), y el teal de esta familia queda a 24° de ese verde. Por eso el teal es la
estación **3** y no la 2: ninguna receta de galletas pasa de dos componentes, así
que los dos nunca coinciden. De paso, el par que más se ve (estación 1 junto a la
2, en 35 recetas) pasa de 24° de separación a 65°.

El color nunca va solo: cada estación lleva su número, su nombre y su recuento de
ingredientes en texto.

### Qué significa cada relleno

Tres piezas de la barra de la ficha llevan relleno, y cada una dice algo
distinto. No es decoración repartida:

| Relleno | Significa | Dónde |
|---|---|---|
| **Oscuro** (`--rail`) | Navegación: salir de aquí | Volver al listado |
| **Ámbar** (`--brand-strong`) | Acción principal | Pesar, Nueva receta |
| **Sin relleno**, color solo en el icono | Acción secundaria | Imprimir, Editar, Eliminar |

El oscuro es el mismo de la estructura y del listado al que devuelve, así que el
botón de volver se reconoce por su color antes de leerlo. Importa sobre todo en
el teléfono, donde las cinco acciones viven en una barra flotante y se reparten
el ancho: allí, un botón de salir con el aspecto de Imprimir es indistinguible.

### El canalón

Un solo token, `--gutter`, para el aire entre el texto y el borde de la
pantalla: **32px** en escritorio, **24px** en tableta y **16px** en teléfono.

Las cinco franjas de la ficha (cabecera, ficha técnica, tanda, ingredientes y
método) lo comparten. Antes cada una declaraba el suyo, y los cortes de tableta y
teléfono volvían a declararlos uno por uno: bastaba olvidar una regla para que esa
franja quedara pegada al borde mientras las de arriba y abajo respiraban. El
token lleva `max()` con `env(safe-area-inset-left)`, que hoy vale cero y queda
listo para el día que se declare `viewport-fit=cover`.

### Un solo tema

Hubo un modo oscuro con interruptor propio y **se retiró**: mantener dos paletas
coherentes costaba el doble de trabajo en cada cambio y duplicaba cada valor de
color en el archivo de tokens.

La estructura oscura (barra superior y listado lateral) **no era el tema oscuro**
y se queda: no es una preferencia, es una decisión de composición.

---

