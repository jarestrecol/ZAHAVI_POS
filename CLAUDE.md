# ZAHAVI POS

**El núcleo: lo que hay que saber ANTES de escribir código.** Lo demás vive en
`docs/` y se abre por tarea; el índice del final dice qué contesta cada archivo y
qué no, para no tener que abrirlo para averiguarlo.

Si algo de aquí resulta falso, **corrígelo en el mismo cambio**. Este documento ya
ha mentido cuatro veces, y por eso `verificar.mjs` comprueba lo que afirma.

> **Presupuesto: 420 líneas / 24 KB, y lo hace cumplir el CI.** Lo que no quepa va
> a `docs/`, nunca al final. Añadir aquí obliga a quitar. Sin ese tope esto vuelve
> a las 2.099 líneas que tenía, porque cada línea que alguien añade tiene razón
> por separado. El margen es deliberadamente corto —unas ocho líneas— y el número
> está medido sobre este contenido, no elegido de antemano.

---

## 1. Qué es esto

Sistema de producción para una panadería con dos sedes: el obrador y la casa de
producción. Aplicación web **sin framework, sin compilación y sin una sola
dependencia en tiempo de ejecución**: el navegador ejecuta exactamente los
archivos del repositorio. La única dependencia declarada es Playwright, de
desarrollo.

Las fórmulas viven en `data/recipes.json`, versionado en git; publicar es un
commit contra GitHub a través de `api/recipes.js`. Funciona sin conexión y se
instala como aplicación. Son **cuatro módulos** sobre la misma base —recetario,
producción, ingredientes, almacén— y se entra **al menú**, no al recetario.
Producción: <https://zahavi-recetario.vercel.app>, repositorio
`jarestrecol/zahavi-recetario`; cada push a `main` despliega solo.

**Cero dependencias no es minimalismo por gusto**: garantiza que esto siga
funcionando dentro de cinco años sin que nadie repare una cadena de dependencias
que ya no compila, y una panadería no tiene equipo de mantenimiento. No propongas
una biblioteca, un empaquetador ni un framework.

---

## 2. Cifras verificadas: no las recalcules

`verificar.mjs` compara esta tabla con la realidad. Las del **programa** fallan
si mienten; las de **datos** solo avisan, porque cambian cuando la panadería
publica desde el obrador y ese commit no puede tocar este archivo.

**No abras `data/recipes.json`.** Para cualquier recuento, un `node -e` que
imprima solo la cifra.

| Dato | Valor |
|---|---|
| Recetas | 122 (Pastelería 67, Panadería 34, Galletas 21) |
| Componentes / líneas de ingrediente | 188 / 1.293 |
| Catálogo de ingredientes | 159 |
| `data/recipes.json` | 227 KB (232.393 bytes), `version: 2` |
| `sha` de integridad | `1add20b3` |
| Techo real | 1 MB (API de contenidos de GitHub). Umbral de acción: 700 KB, y la verificación falla ahí |
| Versión | 2.0.0 (Fase 2). El primer número es la fase de la hoja de ruta |
| `CACHE_VERSION` de `sw.js` | `zahavi-v47` |
| Node en el servidor | 24.x |
| Módulos en `src/` | 55 |
| Bloques de `verificar` / pruebas de `qa` | 17 / 144 |
| Ingredientes con más de una unidad | 16, en 71 líneas de 48 recetas |
| Migraciones SQL escritas y validadas | 6, con 26 fronteras y 22 pruebas de comportamiento |
| Proyecto Supabase | `Zahavi_Pos` (`xjcdeczfyghanrccgsxu`), PostgreSQL 17.6, `us-west-2`. Las 6 migraciones aplicadas |

**Discrepancia abierta, sin resolver:** `src/core/version.js` declara
`APP_FASE = 'Fase 1'` y **eso es lo que se pinta en la pantalla de acceso**,
mientras la hoja de ruta da la Fase 2 por terminada. Una de las dos está mal y lo
decide el negocio, no el código. `verificar.mjs` no lo vigila.

**Si el `sha` cambia sin que nadie haya editado una receta a propósito, para y
averigua por qué.** Es la huella de las 122 fórmulas.

---

## 3. Las reglas que no se negocian

Cada una salió de un defecto real, y va con su causa en una cláusula: sin la
causa, la regla se "mejora" y vuelve el defecto. El expediente completo de cada
una, en [docs/defectos.md](docs/defectos.md).

1. **Nunca `innerHTML`.** Todo el DOM sale de `lib/dom.js`, que solo escribe
   texto: los nombres de receta y el método son texto libre. Tampoco
   `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` ni `new Function`.
2. **Los errores se devuelven, no se lanzan**: `{ok:true, value}` o
   `{ok:false, code, message}`, con el `message` ya redactado para la persona.
3. **Ni un color ni un espaciado fuera de `assets/css/tokens.css`.**
4. **Todo comentado en español**, explicando el porqué y no el qué.
5. **Una regla de negocio nunca vive en una vista**, o la aplicará esa pantalla y
   ninguna más.
6. **El nombre base de una receta NO es único** (14 de las 122 lo comparten, y
   cuatro se llaman igual). Toda lista que muestre el nombre base tiene que
   mostrar también el rendimiento, o dará filas idénticas.
7. **El cliente repara, el servidor rechaza.** Son prioridades opuestas y ambas
   correctas: que el obrador nunca se quede sin consultar, y que nunca entre
   basura al archivo compartido.
8. **Guardar y publicar no son lo mismo.** Publicar envía el recetario **entero**
   a las demás sedes, no la receta que se acaba de tocar.
9. **La versión se declara una sola vez**, en `src/core/version.js`, y
   `package.json` dice lo mismo. Al publicar un cambio de módulos **sube
   `CACHE_VERSION` en `sw.js`**, o los equipos siguen con la carcasa vieja.
10. **Clave de acceso y clave de edición son cosas distintas.** La de acceso es
    local y es una cortina; no puede validarse en el servidor porque el recetario
    tiene que abrir sin cobertura. La de edición se comprueba en el servidor y es
    la única protección real.
11. **Crear, modificar y eliminar piden la clave de edición ANTES y CADA VEZ.**
    El permiso vive en `state.autorizacion` y se retira al terminar. **No lo ates
    a `getEditKey()`**: esa clave está en la sesión solo para que la publicación
    salga sola, y usarla como permiso convierte la primera comprobación del día
    en una llave que abre la jornada entera. La puerta se monta en un solo punto
    por acción —`renderDialogs` en `main.js`—, no en cada botón, para que cubra
    también los atajos y entrar por la dirección directa.
12. **Una vista no escribe estado.** Recibe callbacks. Lo comprueba `verificar.mjs`.
13. **Cerrar sesión se hace con `cerrarSesion` de `app/commands.js`**, nunca con
    `signOut` a secas: la revocación de la clave de edición viaja con el cierre.
14. **Una marca lateral en una fila va con `inset box-shadow`, nunca con
    `border-left`**: el borde forma parte del modelo de caja, así que ensancha esa
    fila y la desplaza respecto a las demás. La sombra no participa.
15. **Las columnas de una lista se declaran una vez** (`--ings-cols`,
    `--plan-cols`) **y la medida no puede ser `auto`**: encabezado y filas son dos
    rejillas distintas y `auto` se resuelve dentro de cada una con lo que tenga
    dentro, así que ningún rótulo cae sobre su dato.
16. **Se puede reconstruir todo salvo lo que la persona está usando.** Si un nodo
    tiene el foco, o se actualiza en el sitio o se le devuelve el foco después
    buscándolo por `data-*`. **Devolverlo tiene que ser síncrono**, en la misma
    tarea que inserta el árbol nuevo: un `requestAnimationFrame` después basta en
    un ordenador y no en un teléfono. Mejor todavía, reutilizar el mismo nodo. Y
    **lo que se recuerde de un nodo se guarda FUERA del DOM**: un elemento oculto
    no tiene caja, así que leerle el `scrollTop` devuelve 0.
17. **Un límite que el núcleo aplique en silencio tiene que ser público**, o la
    interfaz enseñará una cifra y calculará otra.
18. **Un `aria-label` sustituye al contenido, no lo complementa.** Si el control
    tiene varias piezas visibles, tiene que nombrarlas todas.
19. **El foco se pide cuando el nodo ya está en el documento**, no antes: un
    contenedor sin conectar no tiene elementos enfocables.
20. **Repintar no es síncrono.** Quien necesite el DOM ya cambiado —imprimir,
    medir— usa `trasPintar` de `main.js`.
21. **`backdrop-filter` cambia a quién obedece un `position: fixed`**: el elemento
    que lo lleva pasa a ser el bloque contenedor de sus descendientes fijos.
22. **`columns` reparte por altura, no por ancho.** Para repartir una lista con
    desplazamiento vertical va una rejilla.
23. **Escribe los archivos en UTF-8.** `verificar.mjs` detecta la doble
    codificación en el código, en este archivo y en `docs/`, y dice archivo y
    línea. Lo provoca `Set-Content` sin `-Encoding utf8` en PowerShell.
24. **Las unidades NUNCA se convierten solas**, y con dinero de por medio deja de
    ser una imprecisión: si el plan pide `GR` y el almacén solo tiene `UND`, esa
    línea sale **sin precio** y se dice en pantalla. Decidirlo exige conocer la
    fórmula, y eso lo decide la panadería.
25. **FEFO no puede consumir lo que ya venció**, o mandaría producto caducado al
    obrador. Lo vencido queda fuera del cálculo **y se dice cuántos lotes se
    dejaron fuera**.
26. **Una acción que destruye su propio botón tiene que recolocar el foco**, o cae
    al `body`, la ventana deja de recibir el teclado y Escape ya no cierra. Ha
    pasado tres veces.

### Decisiones cerradas: no las vuelvas a proponer

- **Trusted Types en la CSP**: rompería el modo sin conexión en silencio.
- **Un empaquetador o una versión de un solo archivo**: existió y se retiró.
- **Caducidad semanal de la clave de acceso**: no revocaba ni propagaba; la
  sustituyó `ACCESS_GENERATION`.
- **Lista de usuarios por persona**: vivía en cada aparato, así que un alta en una
  sede no era un alta en la otra.
- **Una abstracción para las listas desplegables**: dos usos distintos no son una
  generalización. **Optimizar el repintado**: medido, va sobrado.

---

## 4. Arquitectura mínima

```
views/   construyen pantallas · no guardan datos, no deciden reglas
app/     casos de uso · orquestan, no construyen pantallas
core/    datos, estado, reglas · no saben que existe una pantalla
lib/     utilidades sin estado, comprobables sin navegador
```

Y por encima, la **capa de composición**: los sueltos en `src/` (`main.js`,
`dialogs.js`, `pantallas.js`, `shortcuts.js`, `memoria-pantalla.js`), los únicos
que ven las tres capas a la vez porque su trabajo es unirlas.

**Las fronteras las comprueba la máquina** en cada `npm run verificar`:

| Frontera | Regla |
|---|---|
| Carpeta | `core/` no importa de `app/` ni de `views/` |
| Carpeta | `lib/` no importa de nadie |
| Carpeta | `app/` no importa de `views/` |
| Escritura | `setState` solo en la capa de composición y en `app/` |
| Responsabilidad | `signOut` solo desde `app/commands.js` |
| Importaciones | Ningún nombre del proyecto usado sin importar |
| Codificación | Nada de doble codificación UTF-8 |
| Carcasa | `sw.js` y los archivos reales, en los dos sentidos |

Dos matices, para que nadie los "arregle" mal:

- **`views/` LEE de `core/` directamente**: `escalarReceta` o `consolidar` son
  transformaciones de lectura sin efectos. Lo que no puede es guardar, publicar,
  borrar ni escribir estado.
- **Una vista sí importa `views/window.js`** (carcasa modal) y `pantalla.js` (la
  de módulo): son primitivas compartidas, no una vista llamando a otra.

**El contrato de errores, igual en `core/`, `app/` y `api/`:**

```js
{ ok: true,  value: <lo que sea> }
{ ok: false, code: 'motivo_en_snake_case', message: 'Texto ya redactado.' }
```

Quien llama solo mira `ok`. **Nunca se lanza una excepción en el flujo normal.**
Hay dos excepciones declaradas en el propio código: `hydrate()` de
`repository.js`, que no puede fallar porque el obrador tiene que poder abrir pase
lo que pase, y el `{error}` que `api/` emite en el cable, que `core/remote.js`
traduce al entrar.

**El estado tiene exactamente dos niveles**: lo transversal arriba y una clave por
módulo. `setState` reemplaza arriba y fusiona **un** nivel dentro de un módulo
declarado en `MODULOS`. Un módulo nuevo es una entrada en `MODULOS` y otra en
`INITIAL`, y no toca nada de lo que ya existe.

---

## 5. Mapa del repositorio

```
CLAUDE.md · docs/ · MANUAL.md   Núcleo, referencias y manual del obrador
README.md                       Presentación pública
index.html · 404.html · 500.html · manifest.webmanifest
sw.js                           Service worker (uso sin conexión)
vercel.json                     Cabeceras de seguridad y caché
api/recipes.js                  Lectura y publicación contra GitHub
api/_schema.js                  Validador del servidor (rechaza, no repara)
data/recipes.json               Recetario publicado. NO ABRIRLO ENTERO
assets/css/                     tokens.css manda. 13 hojas; una por módulo nuevo
assets/fonts/                   Tres familias auto-hospedadas (OFL)

src/main.js                     Arranque y pintado
src/dialogs.js · pantallas.js   Qué diálogo / qué pantalla de módulo toca montar
src/shortcuts.js                Atajos de teclado
src/memoria-pantalla.js         Lo que la pantalla recuerda entre repintados
src/salvavidas.js               Aviso con salida si no arranca
src/app/                        Casos de uso: commands, sync, almacen
src/core/                       schema, repository, remote, access, store, router,
                                search, scale, plan, ingredients, almacen, costeo
src/lib/                        dom (sin innerHTML), format, a11y, paint, combobox,
                                dictado, csv, iconos
src/views/                      Una pantalla por archivo; window.js es la carcasa
                                modal y pantalla.js la de módulo. settings/ aparte

db/migraciones/                 El esquema relacional, APLICADO en Supabase
db/local/                       Emulación de Supabase y pruebas de comportamiento
scripts/                        Verificación y servidor local
tests/                          13 pruebas de navegador (Playwright)
```

---

## 6. Los datos

```js
{ version: 2, revision: "<ISO de la última publicación>",
  recipes: [ { id: "R001", nombre, categoria, metodo,
               componentes: [ { nombre, items: [ {ingrediente, cantidad, unidad} ] } ] } ],
  ingredientes: [ { nombre, unidad } ] }
```

Lo **publicado** vive en el recetario del repositorio y lo ven las dos sedes. Lo
**pendiente** (`zahavi_recetario_v1`), la **sesión** y el **almacén**
(`zahavi_almacen_v1`) viven en el `localStorage` de un solo aparato.

**El almacén no se publica con las recetas, y es una decisión.** El recetario se
sirve sin control de lectura a propósito; los precios de proveedor no admiten ese
trato. El precio: lo que registra el obrador no lo ve la casa de producción.

**Hay un esquema PostgreSQL completo en `db/`, aplicado en un Supabase real, y
NINGUNA línea de `src/` habla con él todavía.** El recetario sigue leyendo el
archivo y el almacén sigue en `localStorage`. Falta abrir la CSP, el cliente con
la clave publicable y migrar los datos. La `service_role` **no entra nunca** en el
navegador. Detalle en [docs/datos.md](docs/datos.md).

**Ambos esquemas reconstruyen la receta con una lista blanca de campos**, así que
añadir uno tiene un orden que no admite atajos: que lo acepten `core/schema.js` y
`api/_schema.js` → desplegar y subir `CACHE_VERSION` → confirmar que las dos sedes
cargaron el código nuevo → y solo entonces migrar los datos. Saltárselo borra el
campo de las 122 recetas en cuanto un equipo con el código viejo publique una vez.

---

## 7. Cómo se trabaja

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # 17 bloques, sin navegador, segundos
npm run qa           # 144 pruebas en escritorio, móvil, celular y tableta
npm run probar-sql   # el esquema contra un PostgreSQL real (pide Docker)
```

**El contrato de terminado**: las dos capas en verde, ninguna receta real tocada,
`git status` sin restos, y el `sha` de la sección 2 sin moverse. En verde,
`verificar` termina con sus 17 líneas en `ok` y «Todo correcto».

**Añadir un módulo nuevo**, en orden y sin saltarse el 2:

1. Decide dónde vive cada pieza **antes** de escribir. ¿Lo necesita alguien sin
   navegador? Entonces `core/`.
2. **Añádelo a `SHELL` en `sw.js` y sube `CACHE_VERSION`.** Sin lo primero el
   módulo no existe sin conexión; sin lo segundo los equipos siguen con la vieja.
3. Los casos de uso van en `app/`, no en la vista. La vista recibe callbacks.
4. Si guarda datos propios, **no** los metas en `data/recipes.json`.
5. Una entrada en `MODULOS` (rutas), otra en `MODULOS` e `INITIAL` (estado), una
   hoja en `assets/css/`, y las dos capas de verificación en verde.

**Al añadir una comprobación, cuenta; no escribas la cifra.** Ninguna cifra se
escribe a mano, ni en el resumen ni dentro de la comprobación. El día que la
panadería publicó la receta 122, cuatro scripts y seis pruebas se pusieron rojos
sin que hubiera nada roto.

**Economía de contexto**: no abras `data/recipes.json`; no recalcules la sección
2; no relances `npm run qa` por una línea de CSS —`verificar` ya comprueba la
coherencia del CSS sin abrir navegador—; y no leas una referencia de `docs/` que
la tarea no nombre.

**Commits**: `<tipo>: <descripción>` (`feat`, `fix`, `refactor`, `docs`, `test`,
`chore`), en español, describiendo el efecto para quien usa el recetario y no el
archivo tocado. **Commit o push solo cuando el usuario lo pida.**

**Pruebas manuales**: sobre recetas con prefijo `QA-TEST-`, y se borran al
terminar. Las 122 reales están auditadas: no se abren para editar.

`gstack` es obligatorio y lo exige el hook `PreToolUse` sobre `Skill`; si falta,
el propio hook dice cómo instalarlo. Con él hay `/qa`, `/ship`, `/review`,
`/investigate` y `/browse` — usa `/browse` para toda navegación web.

---

## 8. Dónde está lo demás

Abre **solo** lo que la tarea nombre. Cada entrada dice qué contesta y qué no,
para que no haya que abrir dos archivos para descartar uno.

**[docs/arquitectura.md](docs/arquitectura.md) · 410 líneas**
Ábrelo si la tarea dice: módulo nuevo · ruta · hash · estado · `setState` ·
diálogo · pantalla · publicar · `sync` · conflicto entre sedes.
Contesta: los dos flujos completos · cuándo la publicación **no** sale sola y cuál
es el único caso que puede borrar trabajo ajeno · el enrutado por módulos y por
qué los enlaces antiguos valen · la forma del estado · qué hace cada archivo · qué
archivos han crecido de más.
No contesta: las claves → `seguridad.md` · desplegar → `operacion.md`.

**[docs/datos.md](docs/datos.md) · 280 líneas**
Ábrelo si la tarea dice: esquema · campo nuevo · almacén · lote · costeo ·
Supabase · migración · SQL · RLS · `pg_dump` · sembrar recetas.
Contesta: la forma del almacén y por qué no se publica · qué trae cada una de las
6 migraciones · las 4 decisiones del esquema que no se deshacen barato · por qué
las vistas son `security definer` · cómo entran las 122 recetas · qué ata a
Supabase y qué no. La CSP que hay que abrir, en `seguridad.md`.

**[docs/seguridad.md](docs/seguridad.md) · 140 líneas**
Ábrelo si la tarea dice: CSP · cabecera · clave · token · sesión · `vercel.json` ·
`api/recipes.js` · micrófono · dictado.
Contesta: por qué la clave de acceso no puede validarse en el servidor · qué mide
cada cabecera · `safeEqual`, el limitador de intentos y el doble tope de tamaño ·
lo que el sistema **no** hace · los riesgos aceptados. Las variables de entorno
están en `operacion.md`.

**[docs/operacion.md](docs/operacion.md) · 190 líneas**
Ábrelo si la tarea dice: desplegar · Vercel · variable de entorno · caché · 404 ·
500 · «no funciona» · restaurar · token caducado.
Contesta: las 5 variables y que hay que redesplegar · qué significa cada código de
`/api/recipes` · la política de caché y por qué `no-cache` no es «no guardar» ·
cómo restaurar un recetario equivocado. El porqué de cada cabecera, en
`seguridad.md`.

**[docs/verificacion.md](docs/verificacion.md) · 67 líneas**
Ábrelo **antes de añadir una comprobación**, o si la tarea dice: verificar · qa ·
Playwright · fitness function · `.spec`.
Contesta: qué fija exactamente cada script y cada una de las 13 pruebas de
navegador — o sea, si lo que ibas a escribir ya existe. Cómo se escribe un
bloque no está: eso se lee en `scripts/verificar.mjs`.

**[docs/interfaz.md](docs/interfaz.md) · 232 líneas**
Ábrelo si la tarea dice: color · contraste · token · tipografía · icono ·
manifiesto · pantalla de arranque · rendimiento.
Contesta: la paleta con sus contrastes medidos y por qué el naranja de marca no
vale para texto · las tres familias · por qué el logotipo no va en el icono de la
pantalla de inicio · cuánto cuesta un repintado, medido.

**[docs/roadmap.md](docs/roadmap.md) · 153 líneas**
Ábrelo si la tarea dice: fase · límite · hoja de ruta · cerrojo · qué falta.
Contesta: las limitaciones conocidas con su «cuándo actuar» · las incidencias de
datos reportadas y NO corregidas · las fases y en cuál va cada cosa · el diseño
del cerrojo de edición, decidido y sin implementar.

**[docs/defectos.md](docs/defectos.md) · 216 líneas**
Ábrelo si algo parece raro, si vas a cambiar una regla de la sección 3, o si una
decisión del código no se entiende.
Contesta: el expediente de cada uno de los defectos reales del proyecto, y la
historia completa de la que salió cada regla.
Este archivo **solo crece**, y por eso vive fuera del núcleo.

**[MANUAL.md](MANUAL.md) · 259 líneas**
El manual del equipo de la panadería. **No lo leas para programar**: ábrelo para
**escribirlo** cuando cambie algo que el obrador ve o usa.

### La regla que impide que esto se pudra

Si un cambio hace falsa una frase de una referencia, **se corrige en el mismo
cambio**; si no sabes en cuál está, `grep` en `docs/`. No se añade un archivo a
`docs/` sin su entrada aquí, y ninguna referencia repite una cifra de la sección
2: la cita o la escribe en palabras. Lo comprueba el bloque `Documentacion` de
`verificar.mjs`, que falla si el núcleo pasa del presupuesto, si un enlace no
resuelve, si sobra o falta una entrada, o si el número de líneas miente.
