# Arquitectura, en detalle

Referencia. El núcleo (`../CLAUDE.md`) lleva las tres capas, las fronteras que
verifica la máquina y el contrato de errores. Aquí está el resto: los flujos, el
enrutado por módulos, la forma del estado, el papel de cada archivo y el
procedimiento largo para añadir un módulo.

### Las capas

```
┌────────────────────────────────────────────────────────┐
│  views/   construyen pantallas                         │
│           no guardan datos, no deciden reglas          │
├────────────────────────────────────────────────────────┤
│  app/     casos de uso                                 │
│           orquestan, no construyen pantallas           │
├────────────────────────────────────────────────────────┤
│  core/    datos, estado, reglas de negocio             │
│           no saben que existe una pantalla             │
└────────────────────────────────────────────────────────┘
                          │
                 ┌────────┴────────┐
                 │  lib/  utilidades sin estado
                 └─────────────────┘
```

Y por encima, una **capa de composición**: los archivos sueltos en `src/`. Son
los únicos que ven las tres capas a la vez, porque su trabajo es precisamente
unirlas.

| Archivo | Trabajo |
|---|---|
| `main.js` | Arranca y pinta |
| `dialogs.js` | Decide qué diálogo toca y lo monta |
| `pantallas.js` | Decide qué pantalla de módulo toca y la monta |
| `shortcuts.js` | Atajos de teclado |
| `memoria-pantalla.js` | Lo que la pantalla recuerda de un repintado al siguiente |

`dialogs.js` no está en `app/` ni en `views/` a propósito, y la razón vale para
cualquier módulo futuro: **construye pantallas**, así que no puede ser un caso de
uso (`app/` tiene prohibido importar de `views/`); y **decide cuál** construir
mirando el estado y la ruta, así que tampoco es una vista, porque las vistas
pintan lo que les dan.

`pantallas.js` es su hermano y está ahí por lo mismo, pero **la diferencia entre
los dos importa**, y por eso son dos archivos y no una tabla más larga. Un
diálogo es una interrupción sobre algo que sigue estando debajo: atrapa el foco,
oscurece el fondo y se cierra. Una pantalla de módulo no es eso: es a dónde has
ido, y no hay nada debajo salvo el menú. De ahí que no atrape el foco —atraparlo
impediría llegar con el teclado a la barra del navegador— y que no tenga botón
de cerrar con una equis: se sale por **Menú**, que está en el mismo sitio en los
cuatro módulos.

### Las cinco fronteras, y las comprueba la máquina

`scripts/verificar.mjs` las verifica en cada ejecución. No son buenas
intenciones: son un bloque que falla.

| Frontera | Regla | Por qué existe |
|---|---|---|
| **Carpeta** | `core/` no importa de `app/` ni `views/` | Es la que de verdad no se cruza nunca |
| **Carpeta** | `lib/` no importa de nadie | Utilidades puras, comprobables sin navegador |
| **Carpeta** | `app/` no importa de `views/` | Un caso de uso no construye pantallas |
| **Escritura** | `setState` solo en la capa de composición y en `app/` | Estaba escrita y rota a la vez en tres vistas |
| **Responsabilidad** | `signOut` solo desde `app/commands.js` | Cerrar sesión tiene que revocar además la clave de edición |
| **Importaciones** | Ningún nombre del proyecto usado sin importar | Sintaxis válida que solo falla en el navegador. Pasó al partir `main.js` y los once bloques siguieron en verde |
| **Codificación** | Nada de doble codificación UTF-8 | `CLAUDE.md` llegó a tener 95 líneas corruptas |
| **Carcasa** | `sw.js` y los archivos reales, en los dos sentidos | Un módulo fuera del precache no existe sin conexión; una ruta borrada rompe el `addAll` entero |

Dos matices que conviene enunciar como son, para que nadie los "arregle" mal:

- **`views/` LEE de `core/` directamente.** Una vista puede llamar a
  `escalarReceta` o a `consolidar`: son transformaciones de lectura sin efectos.
  Lo que no puede es guardar, publicar ni borrar, ni escribir estado.
- **Una vista sí importa `views/window.js`**, la carcasa modal, y `pantalla.js`,
  la de módulo. Son primitivas compartidas, no una vista llamando a otra.

### Flujo de una carga

```
1. main.js boot()   prepara el acceso y carga las recetas
2. repository       intenta el servidor → si falla, el archivo publicado
                                        → si falla, la copia local
3. render()         pinta según estado y ruta
4. sw.js            registra el service worker para el uso sin conexión
```

A partir de ahí, cualquier cambio de estado o de dirección vuelve a llamar a
`render()`.

### Flujo de una publicación

```
Puerta  →  api/recipes.js         comprueba la clave SIN escribir nada,
                                  antes de abrir el editor  (verificar: true)
Editor  →  repository.save()      guarda en el equipo y marca "pendiente"
        →  sync.js                publica en segundo plano, o se hace a mano
        →  api/recipes.js         valida la clave (comparación de tiempo constante)
                                  valida el contenido (rechaza, no repara)
                                  comprueba el sha contra GitHub
        →  GitHub Contents API    escribe data/recipes.json como un commit
        →  las demás sedes lo ven en su siguiente carga
```

El `sha` es obligatorio en cada envío. Sin él no hay control de concurrencia: un
envío ciego sobrescribiría el recetario de las dos sedes sin comprobar nada. El
servidor lo rechaza antes de tocar GitHub.

**Este camino está ejercitado de verdad, no solo probado.** El historial de
`data/recipes.json` está lleno de commits generados por la función (`datos:
actualiza el recetario (N recetas) desde recetario (automático)`), casi todos por
la publicación automática, y el más reciente es de septiembre de 2026.

**Aquí no va la cuenta, se cuenta.** Este párrafo existía porque la documentación
anterior afirmaba que no se había publicado nunca; se corrigió escribiendo «8
commits, siete automáticos, 20 de agosto», y esa cifra también envejeció sin que
nadie lo notara. Es la regla del proyecto —ninguna cifra se escribe a
mano— aplicada a la prosa y no solo a los scripts:

```bash
git log --format="%h %ad %s" --date=short -- data/recipes.json
```

**Publicar es automático; guardar no depende de ello.** `app/sync.js` intenta
publicar después de cada guardado o borrado; si no hay red, reintenta al volver la
conexión y cada 20 s. Lo que nunca hace es convertir la señal en un requisito.

| Cuándo no publica sola | Qué pasa |
|---|---|
| Todavía no se publicó a mano en esta sesión | Queda pendiente. Ajustes lo dice |
| Sin red | Queda pendiente, se reintenta al volver la conexión |
| El sitio no tiene la función (`/api/recipes` da 404) | Aviso rojo en la cabecera |
| La clave dejó de valer | Se borra la guardada, se avisa y **deja de reintentar** |
| Otra sede publicó antes | Se avisa del conflicto y hay que recargar |
| **Otra sede publicó mientras este equipo tenía cambios** | Se detiene y lo dice en rojo. Única situación en que publicar puede **borrar** trabajo ajeno, y por eso no lo decide un automatismo |

**Por qué ese último caso importa tanto.** Publicar envía el recetario **entero**
del equipo, no la receta que se acaba de tocar. Si otra sede publicó mientras este
equipo tenía cambios pendientes, este equipo se quedó en la versión anterior. El
`sha` no lo protege, porque al cargar se leyó la referencia nueva: el servidor
aceptaría el envío y el trabajo ajeno desaparecería en silencio.

### Las rutas van por módulos

Se entra **al menú**, no al recetario. Es el cambio que ordena todo lo demás: con
cuatro módulos, tres de ellos vivían detrás de un botón de la barra *dentro* de
otro módulo, así que quien no supiera que existen no los encontraba.

```
#/                              el menú
#/recetario                     listado
#/recetario/receta/R001         ficha
#/recetario/receta/R001/editar  editor
#/recetario/nueva               receta nueva
#/plan · #/ingredientes · #/almacen
```

Una ruta tiene **dos piezas**: `modulo` (a qué parte del sistema se entra) y
`name` (qué pantalla dentro de ella). Antes `name` codificaba las dos cosas, con
los literales `receta` y `nueva` escritos en `parseHash` y en `buildHash` a la
vez; cada módulo nuevo eran dos ediciones espejadas y había que acordarse de las
dos. **Un módulo nuevo es hoy una entrada en `MODULOS` y nada más**, salvo que
traiga pantallas propias, y hoy solo las trae el recetario.

Tres detalles que no son adorno:

- **Los enlaces antiguos siguen valiendo.** `#/receta/R001` y `#/nueva` se
  entienden igual que antes. Están pegados en conversaciones entre las dos sedes
  y guardados en la pantalla de inicio de los teléfonos: romperlos sería que a
  alguien deje de funcionarle un acceso directo sin haber tocado nada. No se
  reescriben solos; en cuanto se navega, `buildHash` ya emite la forma nueva.
- **La producción, el catálogo y el almacén son pantallas COMPLETAS, y aun así
  recuerdan de qué receta se venía** (`?r=R001`). Las dos mitades de esa frase
  costaron algo.

  Eran recuadros flotando encima del recetario, con el listado asomando por los
  bordes: eso decía, sin querer, que el recetario es la aplicación y lo demás son
  cosas que se consultan un momento. Cuando esos «momentos» son dar de alta una
  compra o costear una producción, el recuadro estorba dos veces — deja menos
  sitio del que la tarea necesita y sugiere una jerarquía que ya no existe. En la
  tableta del obrador la tabla del almacén se quedaba con unos 1.100 px de los
  1.280 de la pantalla para siete columnas.

  Lo que había que conservar al convertirlas es el fondo. Se consultan a media
  lectura de una fórmula, y volver al listado obliga a buscarla otra vez entre
  122. Antes se heredaba en un solo salto, porque se abrían desde un botón de la
  barra del recetario; ahora se llega por el menú, o sea en dos saltos, así que
  **el menú también lleva la receta** (`#/?r=R001`) y desde él pasa a la tarjeta
  de cada módulo. Dentro del módulo aparece entonces un botón de **Volver a la
  receta**, y solo entonces: entrando desde el menú no hay nada detrás, y una
  flecha de volver que lleva a un listado en el que no se ha estado promete algo
  que no es.
- **La pantalla pedida manda sobre el módulo heredado.** `navigate` hereda el
  módulo actual para que moverse dentro de uno no obligue a repetirlo, pero
  `detail`, `edit` y `new` solo existen en el recetario: pedirlas desde otro
  módulo construía una dirección imposible. Se resuelve en `navigate` y no en
  cada sitio que navega, porque en cada sitio hay que acordarse.

**Y la vista activa dejó de vivir en el estado.** `planOpen`, `ingredientsOpen` y
`almacenOpen` eran tres booleanos de `core/store.js` que decidían qué pantalla se
veía — justo lo que la cabecera de ese archivo dice que vive en el hash. La regla
estaba escrita y rota a la vez, y el precio no era teórico: esas tres pantallas no
se podían enlazar, no sobrevivían a una recarga, y el menú no tenía a dónde
apuntar.

### El estado va por módulos

`core/store.js` tiene exactamente **dos niveles**:

```js
{
  ready, authed, online, notice, autorizacion, …   // transversal
  recetario: { recipes, factor, planOpen, … }      // por módulo
}
```

`setState` **reemplaza** en el nivel de arriba y **fusiona un nivel** dentro de un
módulo declarado en `MODULOS`:

```js
setState({ ready: true })                  // reemplaza
setState({ recetario: { factor: 2 } })     // fusiona: no borra las recetas
```

No hay un tercer nivel a propósito: fusionar más obligaría a comparar en
profundidad, que es justo el coste que este diseño evita.

**Un módulo nuevo añade una entrada en `MODULOS` y otra en `INITIAL`, y no toca
nada de lo que ya existe.** Antes esto era una bolsa plana de dieciséis claves,
diez de ellas del recetario: con tres módulos habrían sido unas cuarenta
compitiendo por nombres en el mismo sitio. `test-qa.mjs` comprueba que todo
módulo del estado esté declarado, que la fusión no borre hermanos y que un cambio
que no cambia nada no repinte.

### El contrato de errores

Todo `core/`, `app/` y `api/` devuelve la misma forma:

```js
{ ok: true,  value: <lo que sea> }
{ ok: false, code: 'motivo_en_snake_case', message: 'Texto ya redactado para la persona.' }
```

Quien llama solo mira `ok`. El `code` es para decidir en código; el `message`
se muestra tal cual. **Nunca se lanza una excepción en el flujo normal.**

Dos excepciones, ambas declaradas en el propio código para que no se tomen como
precedente:

| Excepción | Dónde | Por qué |
|---|---|---|
| `hydrate()` devuelve `{recipes, ingredientes, source, warning}` | `core/repository.js` | **No puede fallar.** Siempre devuelve un recetario, aunque sea vacío, porque el obrador tiene que poder abrir la aplicación pase lo que pase. Lo que informa no es un error, sino de dónde salieron los datos y qué salió raro por el camino |
| La API responde `{error: '...'}` en el cable | `api/recipes.js`, `api/_schema.js` | Es el formato de red, no el interno. `core/remote.js` lo traduce al contrato al entrar |

Y un matiz: `app/sync.js` devuelve `{ok, code}` sin `message` a propósito. El
texto de la publicación automática depende del estado **actual** y no del momento
en que falló el último intento, así que lo redacta `estadoSincronizacion()`. Con
un `message` congelado, después de publicar a mano el diálogo seguía pidiendo una
clave que ya se había dado.

### Patrones aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Result** (`{ok, value}` / `{ok, code, message}`) | Todo `core/`, `app/` y `api/` | Los errores se devuelven, no se lanzan. El `message` viene redactado para la persona |
| **Repositorio** | `core/repository.js` | Única puerta entre la aplicación y el almacenamiento. Ninguna vista toca `localStorage` |
| **Concurrencia optimista** | `core/remote.js` + `api/recipes.js` | El `sha` de GitHub detecta escrituras simultáneas |
| **DOM sin `innerHTML`** | `lib/dom.js` | Todo el texto pasa por `textContent` |
| **Funciones puras** | `core/search.js`, `lib/format.js` | Se comprueban sin navegador |
| **Transformación de lectura** | `core/scale.js`, `core/plan.js` | Derivan una vista de los datos y no escriben nada: no pueden corromper el recetario |
| **Límites del núcleo, públicos** | `core/scale.js` (`FACTOR_MIN`, `FACTOR_MAX`) | `normalizarFactor` recorta en silencio; quien deje escribir un factor necesita esos números para avisar antes |

---


---

## Qué hace cada módulo

| Archivo | Papel |
|---|---|
| `core/storage.js` | Acceso a localStorage con resultados tipados |
| `core/schema.js` | Esquema, normalización, validación. **Fuente de `CATEGORIES` y `ALL_CATEGORIES`** |
| `core/repository.js` | Única puerta a los datos: almacén local + publicación |
| `core/remote.js` | Cliente de `/api/recipes` y custodia de la clave de edición |
| `core/access.js` | Clave del equipo, generación de acceso y sesión. **Local: no conoce la red** |
| `core/store.js` | Estado de la aplicación y suscripciones |
| `core/router.js` | Enrutado por hash |
| `core/search.js` | Filtrado, orden y recuentos (funciones puras) |
| `core/scale.js` | Escalado de tanda (transformación de lectura) |
| `core/plan.js` | Consolidación del plan de producción |
| `core/ingredients.js` | Catálogo, totales por unidad y reparto de recetas por unidad |
| `core/preferencias.js` | Lo que cada aparato decide para sí y no se publica. Hoy: el tamaño del texto |
| `core/almacen.js` | Lotes comprados: precio, peso, vencimiento y existencia. **Local, nunca se publica** |
| `core/costeo.js` | Cruce del plan del día con el almacén. Transformación de lectura: no escribe |
| `lib/combobox.js` | Sugerencias dentro de la página. Sustituye al `<datalist>`, invisible en el móvil |
| `lib/dictado.js` | Voz a texto para el método. Nunca lanza; si el navegador no sabe, no se pinta el botón |
| `lib/csv.js` | Exportación a CSV con BOM y `;`, que es lo que Excel en español necesita |
| `app/almacen.js` | Alta, baja y descuento de existencias. Único que escribe el módulo |
| `views/almacen.js` | La pantalla de la bodega |
| `views/pantalla.js` | La carcasa de una pantalla completa de módulo. Lo que `window.js` es para un diálogo |
| `views/costeo.js` | El panel de costo que se monta dentro del plan del día |
| `views/inicio.js` | **El menú de módulos: la pantalla a la que se entra.** Cada tarjeta enseña una cifra real del módulo, calculada al pintar |
| `lib/iconos.js` | Los trazados de los iconos. Datos puros: no importa nada, ni del proyecto |
| `lib/dom.js` | Construcción de DOM sin innerHTML |
| `lib/format.js` | Formato de texto y cifras |
| `lib/a11y.js` | Foco atrapado, región viva, inerte |
| `lib/paint.js` | Cola de trabajos que esperan al repintado real |
| `app/commands.js` | Guardar, eliminar, publicar, descartar, entrar, salir |
| `memoria-pantalla.js` | Lo que hay que recordar entre repintados y NO puede vivir en el DOM: por dónde iba el listado y qué receta se estuvo mirando |
| `app/sync.js` | Publicación automática con reintento |
| `views/*.js` | Una pantalla por archivo. `window.js` es la carcasa modal compartida y `pantalla.js` la de módulo |

---


---

## Añadir un módulo: el detalle
### Lo que ya está preparado

- Las cinco fronteras las comprueba la máquina: si el módulo nuevo las cruza, el
  CI se pone rojo antes de llegar a producción.
- `check-css.mjs` compara la carcasa del service worker con los archivos reales
  **en los dos sentidos**: un módulo que se olvide de `SHELL` falla, y una ruta
  cacheada que ya no exista también (esta última rompe el `addAll` entero y deja
  al equipo sin funcionamiento sin conexión).
- `verificar.mjs` avisa a los 700 KB de `data/recipes.json`, muy antes del techo
  de 1 MB de la API de contenidos de GitHub.
- El contrato `{ok, code, message}` es el mismo en las tres capas y en la API.
- Un bloque detecta el texto corrompido por doble codificación en los 68 archivos
  de código, y dice archivo y línea.

### El procedimiento

1. **Decide dónde vive cada pieza antes de escribir nada.** Reglas y cálculos en
   `core/`, orquestación en `app/`, pantallas en `views/`. Si dudas: ¿lo necesita
   alguien sin navegador? Entonces `core/`.
2. **Añade el módulo a `SHELL` en `sw.js` y sube `CACHE_VERSION`.** Sin lo primero
   el módulo no existe sin conexión; sin lo segundo los equipos siguen con la
   carcasa vieja.
3. **Los casos de uso van en `app/`, no en la vista.** La vista recibe callbacks.
4. **Si el módulo guarda datos propios, no los metas en `data/recipes.json`.**
   Ver el punto siguiente.
5. **Ejecuta las dos capas de verificación.** El `sha` de las recetas no debe
   moverse.

### Lo que ya está hecho

De la auditoría de arquitectura, estos seis ya no son deuda:

| Hecho | Qué cambió |
|---|---|
| **Estado por módulo** | `core/store.js`, dos niveles y fusión de uno. Un módulo nuevo es una entrada |
| **Diálogos declarativos** | `src/dialogs.js`: la clave y el constructor son el mismo renglón de una tabla, así que no pueden separarse |
| **`main.js` partido** | Los diálogos, los atajos y la cola de pintado salieron a sus propios archivos |
| **Categorías con una sola fuente** | `CATEGORIES` y `ALL_CATEGORIES` viven en `core/schema.js` |
| **`access.js` sin transporte** | La puerta local ya no arrastra `remote.js` |
| **El repositorio, única puerta de verdad** | El arranque ya no esquiva `repository.js` para hablar con `remote.js` |
| **Rutas por módulo** | `core/router.js` codificaba los literales `receta` y `nueva`, y cada módulo nuevo eran dos ediciones espejadas. Ahora la ruta es `{modulo, name, id, query, category}` con una tabla segmento↔módulo: un módulo es **una entrada** en `MODULOS`. Los enlaces antiguos (`#/receta/R001`) se siguen entendiendo, porque están repartidos por las conversaciones del equipo |
| **La vista activa, fuera del estado** | `planOpen`, `ingredientsOpen` y `almacenOpen` eran tres booleanos de `core/store.js` que decidían qué pantalla se veía — justo lo que la cabecera de ese archivo dice que vive en el hash. Ahora son rutas: se pueden enlazar, sobreviven a una recarga y el menú tiene a dónde apuntar |
| **Cuatro módulos, cuatro pantallas** | Producción, ingredientes y almacén dejaron de ser ventanas modales encima del recetario: son pantallas completas con su barra, su cuerpo y su pie (`views/pantalla.js` + `src/pantallas.js`). La barra es **la misma pieza** en los cuatro (`renderBarra`), con «Menú» siempre en el mismo sitio: es lo que convierte cuatro pantallas sueltas en un sistema |
| **La barra del recetario, con lo justo** | Se quedó con volver al menú y crear una receta. Los botones de los otros tres módulos se fueron al menú, que es de donde cuelgan; y Ajustes con ellos, que además gana algo: detrás de ese botón están publicar, descartar cambios y la clave del equipo, y no tienen por qué estar a un toque desde la pantalla en la que se pesa |

### Lo que queda, y por qué se dejó

Dos, y las dos por la misma razón: hoy no arreglan nada y tocan el camino de los
datos, que funciona en producción.

| Qué | Dónde | Por qué |
|---|---|---|
| Qué | Dónde | Por qué se dejó, y cuándo toca |
|---|---|---|
| **Un archivo por módulo en la API** | `api/recipes.js` | `FILE_PATH` es constante y el `sha` es global, así que dos personas editando módulos **distintos** se rechazarían con un 409. Hoy es especulativo: no existe un segundo conjunto de datos. Se hace **el día que exista**, con un mapa blanco `{recetas: 'data/recipes.json', costos: 'data/costos.json'}` elegido por un campo `dataset`. Es media hora entonces, y hoy tocaría el camino de publicación que funciona en producción sin ganar nada |
| **`createRepository`** | `core/repository.js`, que pasa de 650 líneas | Es un singleton cableado a recetas. Un módulo de costos tendría que copiarlo entero y con él los seis casos de pérdida de datos documentados dentro. La extracción es mecánica —salvo tres constantes y `nextId()`, nada del cuerpo sabe qué es una receta— pero toca el almacén, que es donde se pierde el trabajo de la gente. Se hace **al abrir la Fase 2**, con su propia ventana de pruebas y no en la misma tanda que otra cosa |

### Archivos a vigilar por tamaño

**`views/settings.js` ya está partido** (119 líneas): cada bloque vive en
`views/settings/` y este solo decide el orden y monta la ventana. Llegó a 543
líneas con seis bloques sin relación entre sí, y era el archivo al que **todo**
módulo nuevo iba a querer añadirle una fila. Ahora añadir uno es un archivo nuevo
y un renglón aquí.

**`src/main.js` también se partió**: la memoria del ciclo de
pintado salió a `memoria-pantalla.js`. No era solo tamaño. Eran tres variables
sueltas que nadie reconocía como un grupo, y es exactamente donde tiene que poner
sus cosas quien llegue con el costeo y necesite recordar algo entre repintados.

**Estas cifras envejecen solas, así que se cuentan en vez de creerse**, y la
última vez que se creyeron el documento decía 621 donde había 956:

```bash
wc -l src/*.js src/core/*.js src/views/*.js | sort -rn | head
```

Medido el 12 de septiembre de 2026:

- **`views/editor.js` (956) ya cruzó el umbral y lo dobla.** Es además de los
  archivos que más se tocan, así que es el que primero toca partir. La costura
  son las filas de ingrediente.
- **`views/plan.js` (604) acaba de cruzarlo.** La costura es el resultado del plan.
- `views/detail.js` (558) está justificado: son seis secciones ya separadas.
- `src/dialogs.js` (398) encogió, y volverá a crecer con cada módulo: cuando pase
  de unas 600, la costura es sacar los `build*` de cada módulo a su propio
  archivo y dejar aquí la tabla.

---

