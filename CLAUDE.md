# Zahavi · Recetario: documento único del proyecto

**Este archivo es la única documentación del proyecto.** No hay `docs/`, ni
`MANUAL.md`, ni `QA.md`: todo lo que había en ellos está aquí, destilado. Lo que
falte, falta a propósito.

Trabaja desde aquí. No explores el repositorio para reconstruir lo que ya está
escrito abajo. Si algo de aquí resulta ser falso, **corrígelo aquí mismo en el
mismo cambio**: un índice desactualizado cuesta más que no tenerlo.

| Sección | Qué contesta |
|---|---|
| [0](#0-gstack-obligatorio) | El paso previo obligatorio |
| [1](#1-qué-es-esto-en-treinta-segundos) | Qué es esto y dónde vive |
| [2](#2-mapa-del-repositorio) | Dónde está cada cosa |
| [3](#3-arquitectura) | Capas, fronteras y flujos |
| [4](#4-reglas-que-no-se-negocian) | Las reglas, con el defecto que originó cada una |
| [5](#5-cómo-añadir-un-módulo-nuevo) | El procedimiento para crecer sin romper |
| [6](#6-validar-el-contrato-de-terminado) | Cuándo algo está terminado |
| [7](#7-modelo-de-datos) | El esquema y dónde vive cada dato |
| [8](#8-seguridad) | Qué está protegido y qué no |
| [9](#9-despliegue-variables-y-diagnóstico) | Desplegar y averiguar por qué algo falla |
| [10](#10-recuperación-cuando-algo-sale-mal-de-verdad) | Qué hacer cuando algo sale mal |
| [11](#11-diseño-accesibilidad-y-rendimiento) | Tokens, contraste, tipografía |
| [12](#12-datos-verificados) | Las cifras reales, medidas |
| [13](#13-límites-conocidos-y-hoja-de-ruta) | Hasta dónde llega y qué viene después |
| [14](#14-historial-de-defectos) | Lo que ya se rompió una vez |
| [15](#15-manual-de-uso-para-el-equipo-de-la-panadería) | Cómo se usa en el obrador |
| [16](#16-commits-y-economía-de-contexto) | Cómo commitear y cómo no gastar contexto |

---

## 0. gstack (obligatorio)

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

Si sale `GSTACK_MISSING`: **detente y no sigas.** Di al usuario:

> gstack es obligatorio para todo el trabajo asistido por IA en este repositorio.
> Instálalo:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Y reinicia la herramienta.

`.claude/hooks/check-gstack.sh` bloquea el uso de skills si falta. No lo esquives.
Con gstack quedan disponibles `/qa`, `/ship`, `/review`, `/investigate` y
`/browse`. Usa `/browse` para toda navegación web.

---

## 1. Qué es esto, en treinta segundos

Recetario de producción para una panadería con dos sedes: el obrador y la casa de
producción. Aplicación web sin framework, sin compilación y **sin una sola
dependencia en tiempo de ejecución**: el navegador ejecuta exactamente los
archivos del repositorio. Las fórmulas viven en `data/recipes.json`, versionado en
git; publicar es un commit contra GitHub a través de `api/recipes.js`. Funciona sin
conexión y se instala como aplicación.

Producción: <https://zahavi-recetario.vercel.app> (repositorio
`jarestrecol/zahavi-recetario`, rama `main`). Cada push a `main` despliega solo.

**Por qué cero dependencias.** No es minimalismo por gusto: es lo que garantiza
que el sistema siga funcionando dentro de cinco años sin que nadie tenga que
reparar una cadena de dependencias que ya no compila. Una panadería no tiene
equipo de mantenimiento. La única dependencia declarada es Playwright, y es de
desarrollo. `"type": "module"` en `package.json` existe para que Vercel trate
`api/` como módulos ES y no avise en cada despliegue.

**Por qué un archivo en git y no una base de datos.** Para 121 recetas y dos sedes
que editan de forma esporádica, una base de datos añade un servicio que mantener,
pagar y respaldar a cambio de resolver un problema de concurrencia que aquí casi
no existe. Git ya aporta historial, recuperación y control de escrituras
simultáneas mediante el `sha`. Cuándo toca revisarlo: [sección 13](#13-límites-conocidos-y-hoja-de-ruta).

---

## 2. Mapa del repositorio

```
CLAUDE.md                          Este archivo: la única documentación
README.md                          Presentación pública del repositorio
index.html · 404.html · 500.html   Entrada y páginas de fallo
sw.js                              Service worker (uso sin conexión)
vercel.json                        Cabeceras de seguridad y caché
manifest.webmanifest               Instalación como aplicación

api/recipes.js                     Lectura y publicación contra GitHub
api/_schema.js                     Validador del servidor (rechaza, no repara)

data/recipes.json                  Recetario publicado (225 KB, NO ABRIRLO ENTERO)

assets/css/                        tokens.css manda: ni un color fuera de ahí
assets/fonts/                      Tres familias auto-hospedadas (OFL)

src/main.js                        Arranque y pintado
src/dialogs.js                     Qué diálogo toca y cómo se monta
src/shortcuts.js                   Atajos de teclado
src/salvavidas.js                  Red de seguridad: aviso con salida si no arranca
src/app/                           Casos de uso: commands.js, sync.js
src/core/                          Datos, esquema, acceso, estado, rutas, cálculos
src/lib/                           dom.js (sin innerHTML), format.js, a11y.js, paint.js
src/views/                         Una pantalla por archivo

scripts/                           Verificación y servidor local
tests/                             Pruebas de navegador (Playwright)
```

### Qué hace cada módulo

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
| `core/ingredients.js` | Catálogo de ingredientes y totales por unidad |
| `lib/dom.js` | Construcción de DOM sin innerHTML |
| `lib/format.js` | Formato de texto y cifras |
| `lib/a11y.js` | Foco atrapado, región viva, inerte |
| `lib/paint.js` | Cola de trabajos que esperan al repintado real |
| `app/commands.js` | Guardar, eliminar, publicar, descartar, entrar, salir |
| `app/sync.js` | Publicación automática con reintento |
| `views/*.js` | Una pantalla por archivo. `window.js` es la carcasa modal compartida |

---

## 3. Arquitectura

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
| `shortcuts.js` | Atajos de teclado |

`dialogs.js` no está en `app/` ni en `views/` a propósito, y la razón vale para
cualquier módulo futuro: **construye pantallas**, así que no puede ser un caso de
uso (`app/` tiene prohibido importar de `views/`); y **decide cuál** construir
mirando el estado y la ruta, así que tampoco es una vista, porque las vistas
pintan lo que les dan.

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
- **Una vista sí importa `views/window.js`**, la carcasa modal, y lo hacen las
  cinco que abren diálogo. Es una primitiva compartida, no una vista llamando a
  otra.

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
`data/recipes.json` tiene 8 commits generados por la función (`datos: actualiza
el recetario (N recetas) desde recetario (automático)`, 20 de agosto de 2026),
siete de ellos por la publicación automática. Conviene saberlo porque la
documentación anterior afirmaba lo contrario —que no se había publicado ni una
vez— y esa afirmación dejó de ser cierta sin que nadie la corrigiera:

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

## 4. Reglas que no se negocian

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
6. **El nombre base de una receta NO es único.** 14 de las 121 comparten base y
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
15. **Las columnas de una lista se declaran una vez.** El encabezado y las filas
    comparten una variable (`--ings-cols`, `--plan-cols`) y el sangrado izquierdo
    se aplica por igual a ambos.
16. **Se puede reconstruir todo salvo lo que la persona está usando.** El
    repintado destruye nodos; si uno tiene el foco, se pierde. O se actualiza en
    el sitio, o se devuelve el foco después buscándolo por `data-*`.
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
    líneas con doble codificación (`á` → `Ã¡`), y `verificar.mjs` imprimía `â€¦`
    en cada línea de su resumen. Lo provoca guardar con `Set-Content` sin
    `-Encoding utf8` en PowerShell, o pasar código por una tubería que interpreta
    los escapes. **Ya no hace falta acordarse**: `verificar.mjs` tiene un bloque
    que lo detecta y dice el archivo y la línea.

---

## 5. Cómo añadir un módulo nuevo

El sistema está construido para crecer por módulos sobre la misma base —costeo,
inventario, pedidos, mermas— y no para reescribirse en cada fase. Este es el
procedimiento, y el orden importa.

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
| **`main.js` partido** | De 979 a 454 líneas: los diálogos, los atajos y la cola de pintado salieron a sus propios archivos |
| **Categorías con una sola fuente** | `CATEGORIES` y `ALL_CATEGORIES` viven en `core/schema.js` |
| **`access.js` sin transporte** | La puerta local ya no arrastra `remote.js` |
| **El repositorio, única puerta de verdad** | El arranque ya no esquiva `repository.js` para hablar con `remote.js` |

### Lo que queda, y por qué se dejó

Dos, y las dos por la misma razón: hoy no arreglan nada y tocan el camino de los
datos, que funciona en producción.

| Qué | Dónde | Por qué |
|---|---|---|
| Qué | Dónde | Por qué se dejó, y cuándo toca |
|---|---|---|
| **Un archivo por módulo en la API** | `api/recipes.js` | `FILE_PATH` es constante y el `sha` es global, así que dos personas editando módulos **distintos** se rechazarían con un 409. Hoy es especulativo: no existe un segundo conjunto de datos. Se hace **el día que exista**, con un mapa blanco `{recetas: 'data/recipes.json', costos: 'data/costos.json'}` elegido por un campo `dataset`. Es media hora entonces, y hoy tocaría el camino de publicación que funciona en producción sin ganar nada |
| **`createRepository`** | `core/repository.js` (636 líneas) | Es un singleton cableado a recetas. Un módulo de costos tendría que copiar las 636 líneas y con ellas los seis casos de pérdida de datos documentados dentro. La extracción es mecánica —salvo tres constantes y `nextId()`, nada del cuerpo sabe qué es una receta— pero toca el almacén, que es donde se pierde el trabajo de la gente. Se hace **al abrir la Fase 2**, con su propia ventana de pruebas y no en la misma tanda que otra cosa |
| **Rutas por módulo** | `core/router.js` | `parseHash`/`buildHash` codifican los literales `nueva`/`receta`. Cada módulo son dos ediciones espejadas. Debería ser `{modulo, name, id, params}` con una tabla segmento↔módulo. No corre prisa: es acotado y sin riesgo de datos |

### Archivos a vigilar por tamaño

`views/settings.js` (462 líneas) ya sostiene cinco bloques sin relación —estado,
publicar, cambios, clave, diagnóstico— y es el archivo al que **todo** módulo
nuevo querrá añadirle una fila. Partir por bloque antes de que llegue el segundo
módulo. `views/editor.js` (621) y `views/plan.js` (584) tienen costuras claras
(las filas de ingrediente y el resultado del plan, respectivamente).
`views/detail.js` (551) está justificado: son seis secciones ya separadas.
`src/dialogs.js` (445) crecerá con cada módulo: cuando pase de unas 600, la
costura es sacar los `build*` de cada módulo a su propio archivo y dejar aquí la
tabla.

---

## 6. Validar: el contrato de terminado

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # 12 bloques, sin navegador, segundos
npm run qa           # 66 pruebas en escritorio, celular y tableta
```

`npm run verificar` en verde termina así:

```
Fronteras de arquitectura... ok (3 de carpeta y 2 de responsabilidad)
Codificacion de los archivos... ok (71 archivos en UTF-8)
Sintaxis de los modulos... ok (40 archivos)
Resolucion de importaciones... ok (37 modulos)
Importaciones que faltan... ok (146 nombres del proyecto, todos importados donde se usan)
Coherencia del CSS... ok (312 clases)
Capa de datos... ok (29 comprobaciones)
Publicacion y conflictos... ok (22 comprobaciones)
Validacion del servidor... ok (37 comprobaciones)
Alta y baja masiva... ok (188 comprobaciones)
Version del proyecto... ok (v1.5.1)
Integridad de las recetas... ok (121 recetas, 187 componentes, 1282 items, 225 KB, sha f0307204)
```

**Si el `sha` cambia sin que nadie haya editado una receta a propósito, para y
averigua por qué.** Es la huella de las 121 fórmulas: cambia una cifra de un
ingrediente y cambia el `sha`.

**Ningún bloque escribe su cifra a mano.** Todos cuentan lo que de verdad
ejecutaron. Dos las tenían cableadas y las dos mentían: "Capa de datos" decía
9 y son 29, "Validación del servidor" decía 28 y son 37.

### Qué comprueba cada script

| Script | Qué fija |
|---|---|
| `check-css.mjs` | Valores CSS corrompidos, hexadecimales inválidos, llaves sin cerrar, tokens sin definir, clases sin estilo, la carcasa del service worker en los dos sentidos, y que `/api/` quede fuera de la caché |
| `test-datos.mjs` | Arranque limpio, integridad, edición, borrado, recarga con cambios pendientes, conflicto de versiones, descarte y ausencia de red |
| `test-publicacion.mjs` | Publicación, conflictos entre sedes y el cerrojo |
| `test-api.mjs` | Que el recetario real pasa la validación del servidor sin alterarse y que se rechazan los envíos que lo destruirían |
| `test-qa.mjs` | Alta y baja masiva (20 recetas, sobreviven a una recarga, se borran y el recetario vuelve a su estado inicial), escalado, catálogo, plan del día, y que cerrar sesión revoca la clave de edición |

### Las pruebas de navegador

Existen por una razón concreta: **la capa anterior no abre ningún navegador**, y
hay una familia entera de fallos que solo se ve ahí. Los seis defectos de una
revisión pasada pasaron por delante de siete bloques en verde.

| Archivo | Qué fija |
|---|---|
| `tests/recorrido.spec.js` | Entrar, buscar, abrir una receta y escalar la tanda |
| `tests/dialogos.spec.js` | Que el foco entre en cada ventana y el teclado del Modo Pesar responda de inmediato |
| `tests/impresion.spec.js` | Que se imprima lo que se está mirando |
| `tests/celular.spec.js` | Acciones al alcance del pulgar y nada inalcanzable a 320 px |
| `tests/tableta.spec.js` | Listado en dos columnas sin desplazamiento lateral |
| `tests/resiliencia.spec.js` | La 404 con su estado y su estilo, el arranque roto que deja salida, la receta borrada que lo dice, el sitio sin servidor que lo anuncia y el recetario abriendo sin red |

La suite levanta el servidor sola, con las cabeceras de producción: probar contra
un servidor más permisivo esconde justo lo que interesa mirar. Con `npm run qa:ver`
se ven ejecutarse. Los informes quedan en `playwright-report/`, fuera del
repositorio. Las pruebas **leen** las 121 recetas y no escriben ninguna.

### Verificación manual, cuando toca

Solo para lo que necesita un par de ojos: reparto de la pantalla, contraste real,
comportamiento del teclado con una báscula delante.

> **Regla que no se rompe nunca**: las pruebas manuales se hacen sobre recetas
> creadas para la prueba, con el prefijo `QA-TEST-`, y se borran al terminar. Las
> 121 recetas reales están auditadas: no se abren para editar, no se modifican y
> no se eliminan.

Al terminar: borrar las `QA-TEST-`, comprobar que vuelven a ser 121, y volver a
ejecutar `npm run verificar` confirmando que el `sha` sigue siendo el mismo.

**Antes de dar algo por terminado**: las dos capas en verde, ninguna receta real
tocada y `git status` sin restos. `.github/workflows/verificacion.yml` ejecuta las
dos capas en cada envío.

---

## 7. Modelo de datos

```js
{
  version: 2,
  revision: "2026-08-12T14:22:31.004Z",   // sello de la última publicación
  recipes: [
    {
      id: "R001",                          // código estable, nunca se reutiliza
      nombre: "TORTA DE BANANO X 2 UND",
      categoria: "PASTELERÍA",             // una de las tres canónicas
      metodo: "",                          // texto libre, saltos preservados
      componentes: [
        {
          nombre: "MASA",
          items: [
            { ingrediente: "HARINA", cantidad: 1000, unidad: "GR" }
          ]
        }
      ]
    }
  ],
  ingredientes: [                          // catálogo para autocompletado
    { nombre: "HARINA", unidad: "GR" }
  ]
}
```

### Dónde vive cada cosa

| Capa | Ubicación | Alcance |
|---|---|---|
| **Publicado** | `data/recipes.json` en el repositorio | Todas las sedes |
| **Pendiente** | `localStorage` (`zahavi_recetario_v1`) | Solo ese dispositivo |
| **Rescate** | `localStorage`, clave aparte | Copia local dañada, apartada sin sobrescribir |
| **Sesión** | `localStorage` / `sessionStorage` | Usuario activo y clave de edición de la pestaña |

**No hay base de datos.** Cada publicación es un commit real: el historial de git
*es* el registro de auditoría, y cualquier versión anterior se recupera desde
GitHub.

**Validación en dos niveles, con criterios distintos a propósito.** El cliente
repara: si una receta llega con un campo raro, la normaliza y sigue, para que el
obrador nunca se quede sin poder consultar. El servidor rechaza: si algo no cuadra,
devuelve error y no escribe, para que nunca entre basura al archivo compartido.

**Los dos esquemas reconstruyen la receta con una lista blanca de campos.** Un
campo nuevo lo descarta en silencio cualquier equipo que aún tenga el código
antiguo en caché, y basta con que ese equipo publique una vez para borrarlo de las
121. Por eso el orden de una migración de esquema no admite atajos:

1. Que ambos esquemas (`core/schema.js` y `api/_schema.js`) acepten el campo.
2. Desplegar y **subir `CACHE_VERSION`**.
3. Confirmar que las dos sedes han cargado el código nuevo.
4. Solo entonces migrar los datos, en un commit propio y con aprobación explícita,
   porque cambia el `sha` del archivo auditado.

---

## 8. Seguridad

### Dos fronteras, con niveles muy distintos

| | Qué protege | Dónde se comprueba | Fuerza real |
|---|---|---|---|
| **Clave de acceso** | Ver la interfaz en ese dispositivo | En el navegador | **Ninguna.** Es una cortina, no una cerradura |
| **Clave de edición** | Crear, modificar, eliminar y publicar | **En el servidor** | La única protección real del sistema |

**El contenido es público para quien tenga el enlace.**
`curl https://<el-sitio>/api/recipes` y `curl https://<el-sitio>/data/recipes.json`
devuelven las 121 fórmulas completas **sin ninguna clave**. Es una decisión
consciente, no un descuido. Si algún día las fórmulas pasan a considerarse secreto
industrial, la respuesta no es endurecer la clave de acceso: hay que poner una
puerta delante de todo el sitio (protección de despliegue de Vercel, de pago) o
autenticar la API de verdad, que es un cambio de arquitectura.

**Por qué la clave de acceso no puede validarse en el servidor.** Es la pregunta
que vuelve cada vez que alguien mira este código, y la respuesta cierra el espacio
de diseño entero: **el recetario tiene que abrir a las cinco de la mañana en un
obrador sin cobertura.** Si entrar exigiera hablar con el servidor, un corte de red
dejaría al equipo sin las fórmulas a media producción. De ahí se sigue todo lo
demás: la comprobación tiene que poder hacerse sin red, luego el material con el
que se compara está en el aparato, luego quien tenga el aparato puede leerlo, luego
no es una cerradura.

Lo que sí se puede hacer sin romper el requisito es **retirarla** desde el
servidor: `ACCESS_GENERATION`. El servidor no valida nada, solo anuncia un número,
y el aparato decide. Sin red se usa el último número conocido, así que un obrador
aislado nunca queda fuera.

**La clave de instalación** (`DEFAULT_PASSWORD` en `src/core/access.js`) ya no se
muestra en pantalla y el sistema obliga a cambiarla en el primer acceso de cada
equipo. Matiz honesto: la constante sigue estando en un archivo que el navegador
descarga. Cierra la lectura casual, no la deliberada; y como el contenido ya es
público por decisión consciente, no hay nada detrás que proteger.

### Medidas implementadas

- **CSP estricta**: `default-src 'none'`, sin `unsafe-inline` ni `unsafe-eval`, en
  cabecera HTTP y en `<meta>` de respaldo.
- **Cero peticiones externas**: sin CDN, sin analítica, sin tipografías remotas.
- **Sin un solo sumidero de HTML** en todo el proyecto: ni `innerHTML`, ni
  `outerHTML`, ni `insertAdjacentHTML`, ni `document.write`, ni `eval`, ni
  `new Function`. Verificado en auditoría sobre todo el árbol.
- **Traducción automática desactivada** (`translate="no"`): aquí el texto que se
  pinta **es el dato**. La unidad `und` es "and" en alemán, y el traductor la
  sustituía por `y` dentro de una página en español. El valor guardado nunca
  cambiaba, pero en la pantalla desde la que se pesa una tanda eso es un error de
  producción.
- **Comparación de la clave en tiempo constante sobre resúmenes SHA-256**
  (`safeEqual`). La versión anterior comparaba cadenas y salía antes si las
  longitudes no coincidían: el tiempo de respuesta revelaba la longitud exacta.
  Dos resúmenes miden siempre 32 bytes.
- **La clave de edición caduca a la media hora sin usarse.** Se queda en la sesión
  para que la publicación automática salga sola, pero en una tableta instalada como
  aplicación la sesión no termina al acabar el turno: puede tardar días. Sin
  caducidad quedaba una llave olvidada sobre el mostrador.
- **Cerrar sesión revoca la clave de edición** (`cerrarSesion`, y lo comprueban
  `verificar.mjs` y `test-qa.mjs`).
- **Limitación de intentos** en el servidor, identificando a quien llama por
  `x-real-ip` y, en su defecto, por el **último** elemento de `x-forwarded-for`.
  Tomar el primero era falsificable: los proxies añaden al final, así que el primer
  elemento es texto que manda quien llama, y con una IP inventada por petición cada
  llamada estrenaba contador.
- **Doble tope de tamaño**: sobre el cuerpo recibido y sobre **lo que de verdad se
  va a escribir** (con sangrado, que abulta más). Impide publicar un recetario que
  después no se podría volver a leer por el mismo camino.
- **Solo `PUT`** en la ruta de escritura, con `Content-Type: application/json`
  exigido: obliga a verificación previa de CORS y cierra la vía de un formulario de
  otro origen. La función no emite `Access-Control-Allow-Origin` en ninguna
  respuesta.
- **El autor del commit se limpia de saltos de línea** antes de recortarlo: va
  dentro del asunto, y un salto ahí convierte el resto en cuerpo del mensaje.
- **Cabeceras**: `Strict-Transport-Security`, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests`.
- **Sin secretos en el repositorio ni en su historial.** Barrido de `ghp_`,
  `github_pat_`, `sk-`, `AKIA` y claves PEM sobre `git log --all -p`: cero
  coincidencias.

### Lo que este sistema NO hace

Se declara para que nadie construya sobre supuestos falsos:

- No cifra el contenido en reposo.
- No tiene control de acceso por roles ni sesiones de servidor.
- **No registra quién hizo cada cambio de forma verificable**: el autor de cada
  commit lo declara el navegador y el servidor no lo comprueba. El historial sirve
  para saber *qué* cambió y *cuándo*, no para atribuir responsabilidad.
- No permite exportar el recetario desde la interfaz, por decisión expresa: sacar
  una copia completa de las fórmulas no debe poder hacerse desde el mostrador.

### Riesgos conocidos y aceptados

| Riesgo | Estado |
|---|---|
| **`EDIT_PASSWORD` se puede probar en bucle.** El freno retrasa (4 s máx.) pero no bloquea, y el contador vive en memoria de instancia: Vercel levanta varias en paralelo, cada una con sus intentos gratis | **Mitigación operativa obligatoria: que `EDIT_PASSWORD` sea aleatoria y de 20+ caracteres.** Es lo que más rinde por lo que cuesta. Una regla de tasa en el Firewall de Vercel sobre `PUT /api/recipes` vive en el borde y no depende del contador |
| **La clave de edición vive en claro en `sessionStorage`** y es compartida por las dos sedes | Acotado por la caducidad de 30 min y el borrado al cerrar sesión. La solución real es un testigo de corta vida ligado al origen en vez de la clave cruda: es cambio de arquitectura, está en la hoja de ruta |
| **Trusted Types evaluado y no adoptado** | El registro del service worker es uno de los sumideros que esa directiva intercepta, el fallo sería silencioso porque va dentro de un `catch` vacío, y romperlo significa perder el modo sin conexión sin que nadie lo note. La vía sin riesgo es una cabecera `Content-Security-Policy-Report-Only` adicional, que confirma o desmiente con datos reales sin romper nada |
| **El cuerpo se parsea antes de comprobar la clave** (`api/recipes.js`) | Un anónimo puede forzar el parseo de hasta 900 KB por petición. Coste, no seguridad. Pendiente |

---

## 9. Despliegue, variables y diagnóstico

### Configuración en Vercel

| Campo | Valor |
|---|---|
| Framework Preset | `Other` |
| Root Directory | `./` |
| Build / Output / Install Command | *(los tres, vacíos)* |

No hay nada que compilar ni que instalar. Lo que Vercel muestra ahí es texto de
ejemplo, no un valor por defecto.

`404.html` y `500.html` están en la raíz porque es donde Vercel las busca. La de
500 lleva los marcadores `::vercel:ERROR_CODE::` y `::vercel:REQUEST_ID::`, que la
plataforma sustituye al servirla: son lo único que permite decir por teléfono qué
falló, así que no se borran aunque parezcan texto raro.

`package.json` fija `"node": "24.x"`. Solo el mayor: los parches los aplica Vercel,
incluidos los de seguridad. Un rango abierto (`>=18`) sube solo de versión mayor en
un despliegue que solo cambiaba una línea de CSS.

### Variables de entorno

| Variable | Valor | Para qué |
|---|---|---|
| `GITHUB_TOKEN` | Token fine-grained, **Contents: read and write**, solo este repo | Leer y escribir `data/recipes.json` |
| `GITHUB_REPO` | `usuario/repositorio` | Dónde escribir |
| `GITHUB_BRANCH` | `main` | Qué rama |
| `EDIT_PASSWORD` | Aleatoria, **20+ caracteres** | Autorizar la escritura. Única protección real |
| `ACCESS_GENERATION` | Entero, opcional | Retirar la clave de acceso en todas las sedes a la vez |

> **Tras cambiar cualquier variable hay que volver a desplegar.** La función las
> lee al construirse. Los despliegues existentes no las recogen solos.

Sin esas variables el sitio despliega igual y funciona en modo consulta, pero sin
publicación compartida.

**Retirar la clave de acceso de todas las sedes**: sube `ACCESS_GENERATION` en uno
(créala con `1` si no existe), vuelve a desplegar, y comunica la clave nueva. En la
siguiente apertura cada aparato cerrará sesión y pedirá la nueva, diciendo por qué.
Nadie se queda fuera: con la clave vieja se entra a la pantalla que pide poner la
nueva. Un aparato sin señal no se entera hasta que vuelva la red, y eso es
deliberado.

### Política de caché

Está en `vercel.json`, y cada línea responde a un motivo distinto:

| Ruta | Cabecera | Por qué |
|---|---|---|
| `/src/` y `/assets/css/` | `no-cache, must-revalidate` | El código y los estilos se revalidan **siempre** |
| `/assets/fonts/` | `max-age=31536000, immutable` | Las tipografías no cambian nunca |
| `/assets/` (imágenes) | `max-age=3600` | Cambian poco y no rompen nada si tardan |
| `/data/recipes.json` y `/sw.js` | `no-cache, must-revalidate` | Una publicación nueva debe verse en la siguiente carga |
| `/api/` | `no-store` | Nunca se guarda una respuesta del servidor |

El código llevaba `max-age=3600` y costó caro: un equipo con la página abierta
usaba su copia una hora **sin preguntar al servidor**, así que un despliegue
tardaba hasta sesenta minutos en llegarle. Peor, anulaba la estrategia del service
worker sin que se notara: `sw.js` pide el código por red primero, pero su `fetch`
respeta la caché del navegador.

> `no-cache` **no** significa "no guardar": significa guardar y **preguntar** antes
> de usar. Con el ETag que ya pone la plataforma, esa pregunta se contesta con un
> `304` vacío cuando nada cambió.

**`vercel.json` no admite comentarios ni propiedades inventadas.** Valida contra su
`$schema`, y una clave de más hace que la plataforma **ignore el archivo entero**:
el despliegue se completa, el sitio sigue vivo con la configuración anterior, y no
hay ningún error visible. Si cambias una cabecera y no la ves aplicada, comprueba
eso antes que nada:

```bash
curl -sI https://<el-sitio>/src/main.js | grep -i cache-control
```

### Diagnóstico

**Antes que nada, mira la barra de direcciones.** Es la comprobación más barata y
la que más veces acierta cuando alguien dice *"cambié la clave y al siguiente
despliegue ya no estaba"* o *"lo que guardé ha desaparecido"*. Cada despliegue de
Vercel tiene su **propia dirección única** (`zahavi-recetario-<algo>.vercel.app`),
que es la que abre el botón *Visit*. Para el navegador esa dirección es **otro
sitio distinto**: otra clave, otra sesión, otros cambios sin publicar. Se trabaja
**siempre desde la dirección de producción**.

**Lo segundo, sin abrir nada técnico**: el propio recetario lo dice en
**Ajustes → Conexión**, en cuatro líneas.

| Respuesta de `/api/recipes` | Significado |
|---|---|
| `200` con las recetas | Funciona |
| `500` "no tiene configurado el acceso al repositorio" | Faltan `GITHUB_TOKEN` o `GITHUB_REPO` |
| `500` "no tiene configurada la clave de edición" | Falta `EDIT_PASSWORD` |
| `502` "el repositorio rechazó la lectura" | El token no tiene permiso de Contents, o `GITHUB_REPO` mal escrito |
| `404` con `{"error": …}` | `GITHUB_BRANCH` no coincide con la rama real. Que traiga mensaje propio lo distingue del 404 de un sitio sin la función |
| `403` "Vercel Security Checkpoint" | Firewall de Vercel interceptando: revisa **Firewall → Attack Challenge Mode** |

**Si los despliegues automáticos no se disparan** y GitHub muestra *"Git author …
must have access to the project on Vercel"*: la cuenta que firma los commits no es
miembro del equipo de Vercel. Se resuelve invitándola en **Team Settings → Members**
o alineando `git config user.email` con la cuenta que sí tiene acceso.

### Servidor local

```bash
npm run servidor
```

Sirve en el puerto 8000 con **las cabeceras que aplica Vercel**, leídas del propio
`vercel.json`. Un servidor de desarrollo más permisivo esconde justo los fallos que
solo aparecen publicados. Los módulos ES necesitan servirse por HTTP: abrir
`index.html` con doble clic no funciona.

---

## 10. Recuperación: cuando algo sale mal de verdad

### Alguien publicó un recetario equivocado

Es el caso más probable de los graves. **No se ha perdido nada**: cada publicación
es un commit sobre `data/recipes.json`.

1. En GitHub, abre `data/recipes.json` → **History**. Cada entrada es una
   publicación, con su fecha.
2. Abre la versión buena → **Raw** → copia todo.
3. Vuelve a `data/recipes.json`, edita, borra todo, pega la versión buena, confirma.
4. Vercel despliega solo. En el siguiente arranque, las dos sedes ven la versión
   restaurada.

Tarda unos tres minutos. Antes de darlo por bueno, ejecuta `npm run verificar` en
local sobre esa versión.

**Ojo con los equipos que tengan cambios sin publicar.** Al recargar verán el aviso
rojo de conflicto y deberán decidir en Ajustes qué conservar. No publiques desde un
equipo con cambios pendientes hasta resolver eso, o volverías a pisar la
restauración.

### El token de GitHub caducó o fue revocado

Síntoma: "Responde con error" en Ajustes → Conexión. El recetario **sigue
funcionando para consultar**; lo que se detiene es la publicación. Genera un token
nuevo con **Contents: Read and write**, reemplázalo en Vercel y **vuelve a
desplegar**. Mientras tanto nadie pierde trabajo: lo guardado espera en cada equipo.

### Un equipo no arranca

Que la persona pulse **"Borrar la copia guardada y recargar"** en la pantalla de
fallo. Ese botón borra la copia del programa, **no las recetas**. Si la pantalla de
fallo no llega a aparecer, el mismo efecto se consigue borrando los datos del sitio
desde el navegador, con una advertencia: **eso sí borra los cambios sin publicar de
ese equipo**. Pregunta antes si los hay.

### Hay que dejar el recetario en manos de otro proveedor

Todo lo necesario está en el repositorio y no hay nada más: las 121 fórmulas en
JSON legible, el programa entero sin compilar ni ofuscar, y esta documentación. No
hay base de datos que exportar ni servicios de terceros que traspasar más allá de
la cuenta de Vercel y el repositorio de GitHub. Clonar y declarar las cuatro
variables reconstruye el sistema completo.

---

## 11. Diseño, accesibilidad y rendimiento

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
  se leía como fluorescente aun sin degradado.
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

### Rendimiento

| Métrica | Valor real (medido) |
|---|---|
| Dependencias en tiempo de ejecución | 0 |
| Peticiones a terceros | 0 |
| JavaScript `src/` (sin comprimir) | ~355 KB (37 módulos) |
| CSS | ~169 KB (10 hojas) |
| Tipografías (subconjunto latino) | ~145 KB (7 archivos) |
| Datos | 225 KB |
| Paso de compilación | Ninguno |

El repintado reconstruye el árbol completo en cada cambio: con 121 recetas son unos
cientos de nodos y el navegador lo resuelve sin esfuerzo. La única excepción son los
diálogos, que se conservan montados para no borrar lo que alguien está escribiendo;
y dentro de ellos, el campo de tandas del plan, que se actualiza sobre sí mismo.

---

## 12. Datos verificados

Medidos el 25 de agosto de 2026. Para recontar, un `node -e` que imprima solo la
cifra: **no abras `data/recipes.json`**.

| Dato | Valor |
|---|---|
| Recetas | 121 (Pastelería 66, Panadería 34, Galletas 21) |
| Componentes / líneas de ingrediente | 187 / 1.282 |
| Catálogo de ingredientes | 159 |
| `data/recipes.json` | 225 KB (230.598 bytes), `version: 2` |
| `sha` de integridad | `f0307204` |
| Techo real | 1 MB (API de contenidos de GitHub). Umbral de acción: 700 KB, y la verificación falla ahí |
| Versión | 1.5.1 (Fase 1). El primer número es la fase de la hoja de ruta |
| `CACHE_VERSION` de `sw.js` | `zahavi-v37` |
| Node en el servidor | 24.x |
| Módulos en `src/` | 37 |
| Bloques de `verificar` / pruebas de `qa` | 12 / 66 |

---

## 13. Límites conocidos y hoja de ruta

### Limitaciones

| Limitación | Impacto | Cuándo actuar |
|---|---|---|
| El contenido es visible para quien tenga el enlace | La clave de acceso no protege el contenido | Si las fórmulas pasan a ser secreto industrial |
| La API de contenidos de GitHub corta a 1 MB | Hoy son 225 KB | La verificación avisa a los 700 KB |
| El almacenamiento del navegador ronda los 5 MB | Suficiente para texto, no para imágenes | Si se añaden fotografías de producto |
| Una sola clave para todo el equipo | No se sabe quién entró | Si hiciera falta trazabilidad por persona |
| Los ingredientes se referencian por nombre, no por código | Un cambio de nombre no propaga | Antes del costeo (Fase 2) |
| Borrar los datos de navegación borra los cambios sin publicar | Lo publicado se recupera al recargar. La publicación automática reduce la ventana pero no la cierra | Formar al equipo: publicar al empezar la jornada |
| La clave de edición vive solo en la sesión | La primera publicación de cada sesión es manual | Deliberado: guardarla en disco dejaría la llave del repositorio en el mostrador |
| Ninguna de las 121 recetas tiene método escrito | El campo existe y está vacío en origen | Trabajo de contenido, no técnico |
| 34 de las 121 no declaran rendimiento legible | Para esas solo se ofrece el multiplicador | Se puede completar desde el editor |
| En 15 el rendimiento está **dentro** del nombre pero no al final | El separador no lo encuentra | El editor avisa al abrirlas |
| 14 recetas comparten nombre base | Se distinguen solo por el rendimiento | Al normalizar nombres, si se hace |

### Incidencias en los datos, reportadas y NO corregidas

Corregir una fórmula es una decisión del negocio, no de quien migró los datos.

- `SACHER TORTE x 8` lleva `CHOCOLATE 70%: 10008 GR`. Las variantes escalan exactas
  (126 → 630 → 756), así que lo esperable sería `1008`. Son nueve kilos de
  diferencia: un cero de más al teclear. Es también el mejor argumento de por qué
  existe el escalado, porque esa variante se escribió a mano.
- `BERLINAS` mide la leche en `MG`. Es la **única línea en MG de las 1.282**;
  160 mg son 0,16 g, imposible para 18 berlinas. Casi con seguridad debería ser
  `ML`. Visible desde la pantalla de Ingredientes.

### Fases

| Fase | Alcance | Estado |
|---|---|---|
| **1** | Consulta, edición y publicación de fórmulas | **En producción** |
| **1.5** | Escalado de tandas, plan del día y catálogo de ingredientes | **En producción** |
| 2 | Costeo por receta y margen | Requiere precios por ingrediente y normalizar por código |
| 3 | Inventario y órdenes de producción | Requiere base de datos real |
| 4 | Control integral del restaurante | Por definir |

### La señal que hay que vigilar

El techo no es el número de recetas: es el **tamaño del archivo**.

- Llenar los 121 métodos lo deja entre 330 y 470 KB. **No revienta el límite.**
- Con la forma actual y métodos escritos, el techo llega hacia las 300 recetas.
- Lo que sí lo revienta es el **histórico de precios** de la Fase 2: 159
  ingredientes con captura diaria llegan a 1 MB en unos dos meses.

### Lo siguiente: el cerrojo de edición (v1.5.2)

**Decidido y pendiente de implementar.** Hoy el sistema usa concurrencia
optimista: dos personas pueden editar a la vez y el choque se detecta **al
publicar**, por el `sha`, con aviso en rojo. Nadie pierde trabajo en silencio,
pero el segundo se entera tarde.

Lo acordado es un cerrojo: quien llega segundo **espera**, y se le dice que está
ocupado.

| Decisión | Valor |
|---|---|
| Dónde vive | `data/lock.json` en el repositorio, archivo aparte |
| Por qué ahí | No añade servicios: sigue siendo GitHub + Vercel. El historial de `data/recipes.json` no se ensucia porque el cerrojo va en otro archivo |
| Coste asumido | Tomar y soltar el cerrojo son dos commits, y añade 1-2 s al abrir el editor |
| Forma | `{ dispositivo, nombre, desde, expira }` |
| Caducidad | **Obligatoria.** Sin ella, un editor abierto y olvidado deja el recetario bloqueado para siempre. Se renueva mientras se edita |
| Cuándo se toma | Al abrir el editor, en la misma llamada que ya comprueba la clave (`verificar: true`) |
| Cuándo se suelta | Al guardar, al cancelar, o sola al caducar |
| Respuesta si está tomado | `423`, con quién y desde cuándo, para que la pantalla diga "otro equipo está editando desde hace N minutos" |

**No sustituye al control del `sha`, lo complementa.** El cerrojo evita el choque
antes de que ocurra; el `sha` sigue siendo la red por debajo, para el caso de un
cerrojo caducado o un equipo que publique sin haberlo tomado.

### Antes de la Fase 2

Trabajos que no se pueden decidir desde el código:

1. **Decidir dónde viven los costes antes de que existan.** El recetario se entrega
   sin control de lectura, y es consciente. Los costes de proveedor y los márgenes
   no admiten el mismo trato: o van a otro sitio con lectura autenticada, o el
   servidor devuelve solo agregados. Migrarlo después de publicarlo es mucho más
   caro.
2. **Credenciales por persona para publicar.** La clave única es tolerable con dos
   sedes; con más gente, cada baja obliga a rotarla para todos. Con costes de por
   medio, saber quién cambió un margen deja de ser opcional. Es también la vía para
   sustituir la clave cruda en `sessionStorage` por un testigo de corta vida.
3. **Escribir los métodos.** Las 121 tienen el campo vacío.
4. **Reunir los precios.** 159 ingredientes, de los cuales 64 se usan en una sola
   receta: ese coste operativo conviene medirlo antes de comprometerse.
5. **Unificar las unidades de 15 ingredientes** que hoy se miden de dos o tres
   formas distintas (la leche llega a tener tres). Sin eso no se les puede asignar
   un precio único.

Y el trabajo técnico de la [sección 5](#5-cómo-añadir-un-módulo-nuevo).

### Lo que se decidió NO hacer

- **Trusted Types en la CSP**: rompería el modo sin conexión en silencio.
- **Una abstracción compartida para las listas desplegables**: dos usos de forma
  distinta es generalizar antes de tiempo.
- **La versión de un solo archivo.** Existió un empaquetador que metía todo en un
  HTML de 1 MB para llevarlo en una memoria USB. Se retiró porque duplicaba el modo
  sin conexión que ya da el service worker, costaba mantenimiento en dos sitios
  (cada módulo nuevo había que añadirlo a dos manifiestos), y el artefacto nunca se
  versionaba. Sigue en el historial de git.
- **La caducidad semanal de la clave de acceso.** No revocaba (quien la conocía se
  la renovaba a sí mismo) y no propagaba (cada aparato rotaba por su cuenta). Era un
  ritual semanal con la apariencia de un control. La sustituyó `ACCESS_GENERATION`.
- **La lista de usuarios por persona.** Se guardaba EN CADA APARATO, así que dar de
  alta a alguien en la panadería no lo daba de alta en la casa de producción. Una
  lista que nadie actualiza es peor que no tenerla: aparenta un control que no
  existe.

---

## 14. Historial de defectos

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
| `CLAUDE.md` tenía 95 líneas con doble codificación y `verificar.mjs` imprimía `â€¦` en cada línea | Auditoría de deuda técnica |

---

## 15. Manual de uso, para el equipo de la panadería

Esta sección está escrita para quien usa el recetario, no para quien lo programa.
No hace falta saber nada de informática.

### Lo primero

Se abre desde el navegador, en la dirección que os hayan dado. En la tableta y en
el teléfono conviene añadirlo a la pantalla de inicio la primera vez: se abre igual
que cualquier aplicación y va más rápido (Android: menú → *Añadir a pantalla de
inicio*. iPhone/iPad: compartir → *Añadir a pantalla de inicio*).

**La clave es una sola para todo el equipo y no caduca.** Se cambia cuando hace
falta: si alguien deja el equipo, o si la clave se ha sabido de más, se retira desde
el servidor y **todos los aparatos piden una nueva a la vez** la siguiente vez que
se abran. El recetario lo dice al entrar y explica por qué.

La primera vez que se abre en un aparato nuevo se entra con la **clave de
instalación**, que os habrán pasado aparte, y el sistema **no deja quedarse con
ella**: pide poner la del equipo antes de dejar pasar. Poned la misma que usan los
demás aparatos.

### Buscar una receta

Tres formas: escribir en el buscador (busca por **nombre** y por **código**, con
acentos o sin ellos), filtrar por categoría, o bajar por el listado alfabético.

El buscador **no busca por ingrediente**. Para saber en qué recetas entra un
producto está el botón **Ingredientes** de la barra de arriba: ahí se busca
"harina" y sale en cuántas recetas se usa y cuánta hace falta en total.

### Hacer una tanda más grande o más pequeña

Dentro de una receta están los multiplicadores **×1, ×2, ×3, ×4** y un campo para
escribir otra cantidad. Al elegir uno, **todas las cantidades se recalculan**. Lo
que no se toca son los tiempos, las temperaturas ni los moldes, porque esos no se
multiplican.

**Lo que se imprime es lo que se está viendo.** Si la pantalla está en ×3, la hoja
sale en ×3, con el rendimiento ya multiplicado. El multiplicador se pierde al
cambiar de receta, a propósito: así nadie se encuentra cantidades al triple sin
haberlo pedido.

### Pesar

La pantalla para usar con la báscula delante. Sale **un ingrediente cada vez** con
la cifra muy grande. **Barra espaciadora** para dar por pesado y pasar al siguiente,
así no hay que tocar la pantalla con las manos sucias. **Flechas** para moverse sin
marcar nada. Debajo se ve siempre qué viene después. Si la receta tiene varias
partes, el color del marco cambia al pasar de una a otra: es el momento de cambiar
de recipiente.

Lo marcado como pesado **no se guarda**: es una lista de control de esa tanda.

### Imprimir

El botón de la impresora saca la ficha de la receta que se está viendo, con las
cantidades tal como están en pantalla. Sin ninguna receta abierta, imprime el
**índice completo** con el filtro que esté puesto.

### Escribir o cambiar una receta

Con **Editar** dentro de una receta, o **Nueva receta** en la barra de arriba.

**Hace falta la clave de edición.** No es la clave con la que se entra: es la que
da la panadería para publicar, y la sabe menos gente a propósito. **Se pide cada
vez**: al crear, al editar y al eliminar. Es a propósito: si bastara con escribirla
una vez, quien se encontrara la tableta abierta podría cambiar fórmulas de las dos
sedes el resto de la jornada sin que nadie volviera a preguntarle nada.

Consultar, buscar, escalar la tanda, imprimir y el Modo Pesar **no** la piden: eso
es de todo el obrador.

**Sin señal no se puede crear ni cambiar una receta**, porque la clave la comprueba
el servidor. Todo lo demás sigue funcionando.

Al escribir un ingrediente, el recetario **sugiere** los que ya existen. Conviene
elegir el sugerido en vez de escribirlo de otra forma: así los totales de
Ingredientes y el plan del día siguen cuadrando. **El rendimiento se escribe en su
casilla**, no dentro del nombre.

### Qué significa cada aviso

| Lo que se ve arriba | Qué significa | Qué hacer |
|---|---|---|
| Nada | Todo en orden | Seguir trabajando |
| **Franja gris**: sin conexión | No hay señal. Se puede consultar igual | Nada. Lo guardado sale solo cuando vuelva la señal |
| **Franja ámbar**: cambios sin publicar | Hay trabajo que la otra sede todavía no ve | Suele publicarse solo. Si no, pulsar *Publicar* |
| **Franja roja** | Este equipo **no puede** publicar | Avisar a quien lleva el sistema. No es un fallo del equipo |

**Guardar** deja la receta en este aparato. **Publicar** la manda a las dos sedes, y
normalmente ocurre solo.

### Si algo va mal

- **La pantalla se queda cargando.** Esperad unos segundos: el recetario avisa y
  ofrece dos botones. Primero *Volver a intentarlo*. Si sigue igual, *Borrar la
  copia guardada y recargar*, que **no borra ninguna receta**: solo la copia del
  programa.
- **Sale una página que dice que la dirección no existe.** El enlace está mal
  copiado. Pulsad *Ir al recetario*.
- **Un enlace dice "Esta receta no está aquí".** Esa receta se eliminó o cambió de
  código. Buscadla por su nombre.
- **No entra con la clave.** Si el recetario pide cambiarla, es normal: se escribe
  la actual y se pone una nueva.
- **Para cualquier otra cosa**, en *Ajustes* hay un apartado **Conexión** con cuatro
  líneas. Leedlas por teléfono a quien lleve el sistema.

### Dos reglas que no conviene romper

1. **Publicar antes de terminar la jornada.** Mientras algo esté sin publicar, vive
   solo en ese aparato.
2. **No borrar una receta por si acaso.** Borrar es definitivo y afecta a las dos
   sedes. Ante la duda, preguntad primero.

---

## 16. Commits y economía de contexto

### Commits

Formato `<tipo>: <descripción>` (`feat`, `fix`, `refactor`, `docs`, `test`,
`chore`). En español, describiendo el efecto para quien usa el recetario y no el
archivo tocado. **Commit o push solo cuando el usuario lo pida.**

### Economía de contexto

- **No abras `data/recipes.json`.** Para cualquier recuento, un `node -e` con
  `require('./data/recipes.json')` que imprima solo la cifra.
- **No vuelvas a calcular lo que ya está en la [sección 12](#12-datos-verificados).**
- **No relances la suite de navegador** para un cambio de una línea de CSS.
  `npm run verificar` ya comprueba la coherencia de estilos sin abrir navegador.
- **Este archivo es la única documentación.** No busques `docs/`, `MANUAL.md` ni
  `QA.md`: no existen, y lo que decían está aquí.
