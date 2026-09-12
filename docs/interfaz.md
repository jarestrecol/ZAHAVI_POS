# Diseño, accesibilidad y rendimiento

Referencia. Lo que es trampa —ni un color fuera de `tokens.css`, la marca lateral
con `inset box-shadow`, `columns`, `backdrop-filter`, el foco— vive como regla en
el núcleo (`../CLAUDE.md`) y no se repite aquí. Esto es la paleta con sus
contrastes medidos, la tipografía, los iconos y las cifras de rendimiento.

### Dirección

Obrador de producción. Superficie clara de trabajo, estructura oscura que enmarca,
profundidad real con vidrio esmerilado y sombras de dos capas, y el naranja de la
marca como único acento. **Un solo tema**: hubo modo oscuro con interruptor y se
retiró (mantener dos paletas coherentes costaba el doble en cada cambio). La
estructura oscura no es el tema oscuro: es composición.

### Paleta

Nace del logotipo real: naranja `#F68A1E`, dorado `#FCE00C`, blanco `#FCFCFC`.

- **El naranja de marca no vale para texto**: sobre blanco da 2,4:1. Se usa como
  relleno, borde e icono; para texto existe `--amber-text`.
- **Las categorías se separan por tono, no por claridad**: el techo AAA las obliga
  a todas por debajo de 0,10 de luminancia, así que la distinción la carga el
  matiz (rosa 330°, ámbar 35°, verde 165°). Nunca son la única señal.
- **Un único relleno de marca en toda la pantalla**: `--brand-strong` (#995107).
  El naranja pleno es máxima saturación **y** máxima claridad a la vez, y por eso
  se leía como fluorescente aun sin degradado. Lo llevan las tres piezas que
  significan "esta es la elegida": el filtro **Todas**, la receta que se está
  mirando en el listado (`--rail-selected`, que es un alias de este mismo color)
  y el tamaño de texto activo en Ajustes. No es tres decisiones: es una,
  aplicada tres veces.
- **La fila de la receta que se está mirando lleva ese relleno, y antes no se
  veía.** Iba con `#4b2d18`, un ámbar profundo que sobre el rail da **1,43:1**
  (medido, no estimado). Ahora son **3,00:1**, el mínimo que la norma pide para
  que algo se lea como un objeto aparte, más la barra clara de 4 px del borde
  izquierdo, que contra el rail va a 9,2:1 y es en realidad la señal más fuerte
  de las tres. Subir más el naranja no es opción: `--brand-deep` daría 3,9:1
  contra el rail pero dejaría el texto blanco en 4,07:1, por debajo del 4,5:1
  que pide un renglón de 15 px. Se probó.
- **El filtro de categoría activo va relleno con su color, y es la excepción
  buscada al punto anterior.** No es relleno *de marca*: es el color que esa
  categoría ya tiene en todo el sistema. Iba como los demás con el fondo un poco
  más claro (0,14 de blanco contra 0,04), que sobre el rail oscuro son 1,1:1, y
  en la tableta del obrador a contraluz no se veía cuál estaba puesto. Relleno,
  es el único botón lleno de la columna y no hay que leer para encontrarlo. La
  tinta pasa a `--rail`: 7,1:1 sobre el rosa, 8,2:1 sobre el ámbar y sobre el
  verde. Lo mide `tests/recorrido.spec.js`, y no contra un color concreto sino
  exigiendo 3:1 entre el activo y un inactivo: cualquier paleta que lo cumpla
  vale.
- **Dos paletas con dos trabajos.** El color cálido dice qué es la receta
  (`--cat-*`); el frío dice en qué parte del trabajo estás (`--comp-1` a
  `--comp-4`). Son exactamente cuatro componentes porque el recetario nunca pasa de
  cuatro: 72 recetas tienen uno, 35 dos, 11 tres y 3 cuatro.
- **La línea es el material principal.** Cada zona va cerrada por un borde y cada
  tabla separa filas y columnas con `--line` y `--line-cell`. Los fondos se
  reservan a las cabeceras.
- **`--radius-control` (6px), aparte de los radios de superficie.** Un botón con el
  mismo radio que una ventana se lee como una pastilla, y una barra llena de
  pastillas no parece una herramienta de trabajo.
- **Un solo `--gutter`** para el aire entre el texto y el borde: 32px escritorio,
  24px tableta, 16px teléfono. Las cinco franjas de la ficha lo comparten.

### Tipografía

| Familia | Papel | Por qué |
|---|---|---|
| **Plus Jakarta Sans** | Interfaz | Hace que se lea como sistema y no como libro de cocina |
| **Lora** | Marca y títulos de receta | Carácter editorial al nombre del producto |
| **IBM Plex Mono** | Cifras | Tabular: las cantidades se alinean siempre en columna |

### Iconos y pantalla de arranque

Hay **dos trabajos distintos** y por eso hay dos imágenes distintas, aunque las
dos midan 512.

| Archivo | Dónde se usa | Qué lleva |
|---|---|---|
| `icon-maskable-512.png` | Pantalla de inicio de Android | El monograma: cuadro naranja, Z blanca |
| `icon-192.png` · `apple-touch-icon.png` | Pantalla de inicio en tamaños pequeños, y iOS | El monograma |
| `icon-512.png` | Instalación y catálogos (NO el arranque: ver abajo) | El logotipo completo sobre el naranja de marca |
| `favicon.svg` | Pestaña del navegador | El monograma |

**Por qué el logotipo NO va en el icono de la pantalla de inicio.** Es un
imagotipo horizontal, proporción 3,3 a 1, con la línea "PANADERÍA · REPOSTERÍA ·
CAFÉ" debajo. A los 48 px de una pantalla de inicio esa línea es una mancha, y
Android recorta el icono a círculo, así que le cortaría la Z y la I. El monograma
existe justamente para ese tamaño.

**En Android 12 y posteriores, la imagen del arranque NO se puede elegir.** Aquí
hubo escrito lo contrario —que el `maskable` iba a la pantalla de inicio y el
`any` al arranque, así que bastaba con poner el logotipo en el `any`— y se
comprobó en un teléfono real: no es cierto. Desde Android 12 el sistema dibuja la
pantalla de arranque de **todas** las aplicaciones, y la
[documentación de Android](https://developer.android.com/develop/ui/views/launch/splash-screen)
lo dice sin margen: *"The launcher icon is the default"*, con una animación de
entrada *"controlled by the system and isn't customizable"*. En una aplicación
instalada desde el navegador ese icono del lanzador sale del `maskable`, o sea el
monograma. El `icon-512.png` con el logotipo **no aparece ahí**.

Queda una sola palanca, y es el color: el `background_color` del manifiesto es el
fondo de esa pantalla. Está en `#f68a1e`, el naranja de marca, muestreado del
propio `icon-maskable-512.png` (246,138,30) para que el recorte circular del
icono se funda con el fondo y quede la Z blanca sobre naranja pleno. El
`theme_color` se queda oscuro (`#1a1714`, el mismo `--rail` que declara
`index.html`): ese controla la barra de estado durante toda la sesión, no el
arranque.

**El logotipo completo solo cabe ya dentro de la página**, en la portada de
arranque (`src/views/portada.js`), que comparte ese naranja para que el encendido
se lea como una sola pantalla y no como tres saltos de color.

**Y un icono ya instalado no se entera de nada de esto.** El navegador fija los
iconos y los colores al generar la aplicación instalada, y solo los renueva en una
actualización que puede tardar. Para ver un cambio de icono o de color de arranque
**hay que quitar el acceso directo y volver a añadirlo**. Publicar no basta, y esa
es la explicación de cualquier "lo cambiaste y sigue igual" en este apartado.

**Por qué el SVG salió del manifiesto.** Estaba declarado con `sizes: "any"`, que
lo hace candidato a cualquier tamaño, incluido el del arranque, y eso volvía el
resultado impredecible. Sigue siendo el icono de la pestaña por el
`<link rel="icon">` de `index.html`, que no depende del manifiesto.

**El logotipo original mide 254 × 78**, así que en `icon-512.png` va ampliado 1,57
veces con Lanczos. Aguanta porque es texto blanco de alto contraste sobre plano, y
porque en el teléfono se dibuja a un tamaño parecido o menor. **El día que
aparezca el logotipo en vectorial hay que rehacer ese archivo**: es un solo
comando y queda perfecto.

```bash
ffmpeg -f lavfi -i "color=c=0xF58B21:s=512x512" -i assets/logo-zahavi.png \
  -filter_complex "[1]scale=400:-1:flags=lanczos[l];[0][l]overlay=(W-w)/2:(H-h)/2" \
  -frames:v 1 -y assets/icon-512.png
```

El naranja `#F58B21` es el del propio archivo del logotipo, muestreado, y no el
token `--brand`: se elige así para que el rectángulo que el logotipo trae
incrustado se funda con el lienzo en vez de verse como una calcomanía pegada.

**iOS no usa nada de esto.** Safari ignora el manifiesto para el arranque. Tener
pantalla propia ahí exige `apple-touch-startup-image` con una imagen por
resolución de dispositivo, entre quince y veinte archivos, todos al precache. Se
decidió no hacerlo: esa pantalla dura menos de un segundo, porque no hay
compilación y el service worker sirve todo desde el aparato.

### Accesibilidad

Objetivo **WCAG 2.2 AA**, con AAA en el texto de lectura porque se lee de pie, a
distancia de brazo y con posible reflejo.

- Contrastes verificados y anotados en el código **contra la superficie real sobre
  la que se pinta**: un mismo tono no da lo mismo sobre blanco que sobre
  `--surface-sunk`.
- Navegación completa por teclado, foco visible de alto contraste, foco atrapado y
  restaurado en cada diálogo.
- **El foco sobrevive al repintado.** Las listas que se despliegan se reconstruyen
  enteras al abrir una fila; ambas devuelven el foco buscándolo por `data-*`.
- **Un botón enfocado se activa con su propia semántica.** El Modo Pesar escucha la
  barra espaciadora en todo el panel pero ignora la pulsación cuando el foco está
  sobre un botón: sin esa guarda, `preventDefault()` cancelaba la activación nativa
  e Intro sobre "Salir" daba el ingrediente por pesado.
- **Moverse anuncia qué hay que pesar, no solo cuántos van**, en un solo mensaje:
  la región viva es única y un segundo mensaje borra el primero.
- **Un botón que pierde su texto no pierde su nombre.** El nombre viaja siempre en
  `aria-label`: ocultar el texto con CSS lo borra también del árbol de
  accesibilidad.
- **Los objetivos táctiles se reducen donde toca y no en bloque**: la barra superior
  baja a 36px en teléfono (por encima de los 24 del criterio 2.5.8); el resto
  conserva los 44px de `--tap-min`.
- **Nada se corrige solo en silencio.** Cuando el plan rechaza o ajusta un número
  tecleado lo dice en un nodo visible que además es `role="status"`.
- `prefers-reduced-motion` respetado: toda la animación sale de variables CSS que
  la propia hoja deja en `0ms`.
- **El tamaño del texto de la ficha se ajusta por aparato**, en Ajustes, entre
  0,8 y 1,15. La tableta de pared se lee a un brazo de distancia y el teléfono
  del bolsillo a treinta centímetros: el tamaño que le sirve a una le estorba al
  otro, así que la preferencia es local y no se publica. **Alcanza a `.sheet-view`
  y a nada más**: barra, listado, diálogos, modo producción y hojas impresas se
  quedan como están. Y **los objetivos táctiles tampoco se mueven**, porque los
  44 px salen de una altura mínima en `rem` y no del tamaño de la letra. El
  recorrido no llega más lejos a propósito: por debajo de 0,8 la cantidad de un
  ingrediente baja de 14 px reales en un teléfono, que es el tamaño con el que
  alguien se equivoca al pesar; por encima de 1,15 los nombres largos se parten
  en tres líneas y la tabla deja de leerse como una tabla.

### Rendimiento

| Métrica | Valor real (medido) |
|---|---|
| Dependencias en tiempo de ejecución | 0 |
| Peticiones a terceros | 0 en el uso normal (ver la nota de abajo) |
| JavaScript `src/` (sin comprimir) | ~545 KB (55 módulos) |
| CSS | ~223 KB (13 hojas) |
| Tipografías (subconjunto latino) | ~145 KB (7 archivos) |
| Datos | 227 KB |
| Paso de compilación | Ninguno |

**La única excepción a "cero peticiones a terceros" es el dictado por voz.**
Mientras está activo, el navegador —no la página— envía el audio a un servicio de
reconocimiento del fabricante (Google en Chrome y Android, Apple en Safari). No
pasa por la CSP porque no es una petición de la página. Es opcional, hay que
pulsarlo cada vez y la interfaz lo dice antes de que nadie hable. Con el dictado
apagado, que es el estado por defecto, la cifra sigue siendo cero.

El repintado reconstruye el árbol completo en cada cambio. La única excepción son
los diálogos, que se conservan montados para no borrar lo que alguien está
escribiendo; y dentro de ellos, el campo de tandas del plan, que se actualiza
sobre sí mismo, y el buscador del listado, que es el mismo nodo entre repintados
para que el teclado del teléfono no parpadee.

**Cuánto cuesta ese repintado, medido y no supuesto.** Veinte cambios de receta
seguidos, cronometrando dentro de `paint()`:

| | Mediana | Peor caso | Nodos |
|---|---|---|---|
| Escritorio (1440×900) | 5,3 ms | 9,7 ms | 764 |
| Celular (Pixel 5) | 3,9 ms | 10,3 ms | 764 |

Son medidas en una máquina de desarrollo con Chromium sin ventana, así que la
tableta del obrador tardará bastante más. Aun multiplicando por cinco se queda
por debajo de tres fotogramas, que es el orden en que empieza a notarse.
**Reconstruirlo todo sigue siendo la decisión correcta a este tamaño**, y
optimizarlo hoy sería trabajo especulativo contra las reglas del propio proyecto.

**La señal a vigilar es la pendiente, no la cifra.** El coste crece con el número
de filas del listado: al triplicarse el recetario, se triplica. Si alguna vez
hace falta, la costura evidente es que el listado no se reconstruya cuando lo
único que cambió fue la receta abierta, porque las 122 filas son lo que domina la
medida.

---

