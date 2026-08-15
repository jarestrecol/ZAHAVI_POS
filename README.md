# Zahavi · Recetario de Producción

Sistema de consulta y gestión de fórmulas para panadería, repostería y café.
Un solo enlace, la misma información en la panadería y en la casa de producción,
y funcionamiento garantizado sin conexión.

**Estado**: Fase 1 en producción · 121 recetas · 187 componentes · 1.282 líneas de ingrediente

---

## Índice

1. [Qué resuelve](#1-qué-resuelve)
2. [Capacidades](#2-capacidades)
3. [Arquitectura](#3-arquitectura)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Seguridad](#5-seguridad)
6. [Accesibilidad y rendimiento](#6-accesibilidad-y-rendimiento)
7. [Sistema de diseño](#7-sistema-de-diseño)
8. [Instalación y despliegue](#8-instalación-y-despliegue)
9. [Desarrollo y verificación](#9-desarrollo-y-verificación)
10. [Estructura del repositorio](#10-estructura-del-repositorio)
11. [Decisiones de ingeniería](#11-decisiones-de-ingeniería)
12. [Limitaciones conocidas](#12-limitaciones-conocidas)
13. [Hoja de ruta](#13-hoja-de-ruta)

---

## 1. Qué resuelve

Una panadería con dos sedes trabajaba sus fórmulas en un archivo de hoja de
cálculo que viajaba por correo. El resultado previsible: cada sede terminaba con
una versión distinta, nadie sabía cuál era la buena, y una corrección hecha en un
sitio no llegaba nunca al otro.

Este sistema sustituye ese flujo por un único punto de consulta:

| Antes | Ahora |
|---|---|
| Un archivo por sede, divergiendo en silencio | Una sola versión publicada, idéntica en todas partes |
| Sin historial: un cambio pisaba al anterior | Cada publicación queda registrada y es recuperable |
| Buscar una fórmula obligaba a recorrer pestañas | Búsqueda por nombre o código |
| Imprimir daba una tabla ilegible en el obrador | Ficha A4 diseñada para leerse de pie |
| Sin conexión, sin recetas | Funciona igual con la red caída |

**Alcance de la Fase 1**: consultar, crear y editar recetas con sus componentes,
ingredientes y métodos; escalar tandas y planear la producción del día. El
costeo y el control de inventario quedan fuera de esta fase por decisión de
producto: ambos necesitan datos (precios, existencias) que hoy no están en
ningún sitio.

---

## 2. Capacidades

### Consulta

- **Listado permanente** en el panel izquierdo, sobre estructura oscura: cambiar
  de receta es un clic, sin navegación intermedia.
- **Filtro por categoría** con recuento en vivo: pastelería (66), panadería (34),
  galletas (21).
- **Búsqueda** por nombre o código, sin distinguir mayúsculas ni acentos. Va
  junto a los filtros, encima del listado, porque buscar y filtrar son la misma
  tarea. No busca dentro de los ingredientes: escribir "leche" devolvía decenas
  de recetas que solo la llevaban como un renglón más y enterraba la que se
  buscaba por su nombre.
- **Ficha de receta** con los ingredientes a ancho completo y las cantidades
  tratadas como lectura de báscula: cifra grande, monoespaciada y alineada en
  columna, para localizarla sin leer el renglón entero.
- **Marcado de unidades de volumen** (ml, l, cc) con un indicador propio:
  confundirlas con peso es el error clásico del oficio.

### Producción

- **Escalar la tanda**: multiplicador (×0,5 a ×4) o cantidad concreta, y las
  cifras se recalculan. Es una transformación de lectura: **no modifica ninguna
  receta**, y el factor se pierde al cambiar de receta. Lo heredan el Modo Pesar
  y la impresión, ambos con aviso permanente de que la tanda está escalada. Las
  medidas de molde y los tiempos no se multiplican.
- **Modo Pesar**: pantalla completa, un ingrediente a la vez, cifra gigante. La
  barra espaciadora da por pesado y avanza, para no tocar la pantalla con las
  manos ocupadas.
- **Plan del día**: se eligen varias recetas con sus tandas y sale una lista
  consolidada de todo lo que hay que pesar, con cada ingrediente sumado una sola
  vez. **Nunca suma unidades distintas**: 500 gr de harina y 2 und de huevo van
  en líneas separadas, y se avisa cuando un ingrediente aparece con dos unidades.
- **Impresión A4** de la ficha individual, del índice completo o del plan del
  día, con la maquetación calculada aparte de la pantalla.

### Validador de ingredientes

- **Catálogo de ingredientes**: los 159 productos distintos que se usan en las
  1.282 líneas del recetario, con en cuántas recetas entra cada uno y cuánto se
  gasta en total. Se despliega para ver en qué recetas se usa, que es la
  búsqueda por ingrediente puesta donde corresponde.
- **Totales por unidad, nunca mezclados**: si un ingrediente se mide en gramos
  en una receta y en unidades en otra, lleva dos totales separados. Hoy son
  **15 los ingredientes en esa situación** y están marcados: es lo primero que
  habrá que resolver para poder ponerles precio.
- Es la **base del costeo**: el total por unidad es exactamente la cifra que
  habrá que multiplicar por el precio de cada producto.

### Edición

- **Editor de recetas** con componentes múltiples y autocompletado desde el
  catálogo de 159 ingredientes ya existentes.
- **Publicación explícita**: lo editado queda en el equipo hasta que alguien
  publica. La cabecera indica en todo momento cuántos cambios hay pendientes.
- **Control de concurrencia**: si otra sede publicó mientras tanto, el sistema
  obliga a recargar antes de permitir publicar. Es imposible pisar el trabajo
  ajeno por insistir.
- **Borrado en tres pasos** con confirmación escrita a mano.

### Plataforma

- **Sin conexión**: la aplicación arranca y se consulta con la red caída.
- **Instalable** como aplicación (PWA) en escritorio y móvil.
- **Adaptado** a escritorio, tableta y teléfono, con recorridos distintos en cada
  uno, no un simple reajuste de anchos.

---

## 3. Arquitectura

### Principio rector

**Cero dependencias, cero compilación.** No hay `node_modules`, ni empaquetador,
ni framework. El navegador ejecuta exactamente los archivos que están en el
repositorio.

El `package.json` existe pero **no declara ni una sola dependencia**: solo
`"type": "module"`, que le dice a Vercel que las funciones de `api/` son módulos
ES y no CommonJS. Sin esa línea, Vercel las convierte a CommonJS por su cuenta y
avisa de ello en cada despliegue. Los dos `scripts` que incluye son atajos a los
comandos de verificación; no hay ningún script de compilación, y `npm install`
no tiene nada que instalar.

Esto no es minimalismo por gusto: es la decisión que garantiza que el sistema
siga funcionando dentro de cinco años sin que nadie tenga que actualizar una
cadena de dependencias que ya no compila. Una panadería no tiene equipo de
mantenimiento.

### Capas

Tres capas con una única regla: **cada una solo conoce la de abajo.**

```
┌──────────────────────────────────────────────────────────┐
│  views/          construyen pantallas                    │
│                  no guardan datos, no deciden reglas     │
├──────────────────────────────────────────────────────────┤
│  app/            casos de uso                            │
│                  orquestan, no construyen pantallas      │
├──────────────────────────────────────────────────────────┤
│  core/           datos, estado, reglas de negocio        │
│                  no saben que existe una pantalla        │
└──────────────────────────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │  lib/  utilidades sin estado
                   └─────────────────┘
```

`main.js` es el único módulo que une las tres: decide qué pintar y llama a los
casos de uso. Ninguna vista importa nada de otra vista; ningún módulo de `core/`
importa nada de `views/`.

### Flujo de una carga

```
1. main.js boot()   prepara usuarios y carga las recetas
2. repository       intenta el servidor → si falla, el archivo publicado
                                        → si falla, la copia local
3. render()         pinta según estado y ruta
4. sw.js            registra el service worker para el uso sin conexión
```

A partir de ahí, cualquier cambio de estado o de dirección vuelve a llamar a
`render()`.

### Flujo de una publicación

```
Editor → repository.save()      guarda en localStorage, marca "pendiente"
       → commands.publish()     envía a /api/recipes con la clave de edición
       → api/recipes.js         valida la clave (comparación de tiempo constante)
                                valida el contenido (rechaza, no repara)
                                comprueba el sha contra GitHub
       → GitHub Contents API    escribe data/recipes.json como un commit
       → las demás sedes ven el cambio en su siguiente carga
```

El `sha` es obligatorio en cada envío. Sin él no hay control de concurrencia
posible: un envío ciego sobrescribiría el recetario de las dos sedes sin
comprobar nada. El servidor lo rechaza antes de tocar GitHub.

### Patrones aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Result** (`{ok, value}` / `{ok, code, message}`) | Todo `core/` y `api/` | Los errores se devuelven, no se lanzan. El `message` viene ya redactado para mostrarse a la persona. |
| **Repositorio** | `core/repository.js` | Única puerta entre la aplicación y el almacenamiento. Ninguna vista toca `localStorage`. |
| **Concurrencia optimista** | `core/remote.js` + `api/recipes.js` | El `sha` de GitHub detecta escrituras simultáneas entre sedes. |
| **Construcción de DOM sin `innerHTML`** | `lib/dom.js` | Todo el texto pasa por `textContent`. Los nombres de receta y el método son texto libre. |
| **Funciones puras** | `core/search.js`, `lib/format.js` | Filtrado, orden y formato se comprueban sin navegador. |

---

## 4. Modelo de datos

### Esquema

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
| **Pendiente** | `localStorage` del navegador | Solo ese dispositivo |
| **Rescate** | `localStorage`, clave aparte | Copia local dañada, apartada sin sobrescribir |
| **Sesión** | `localStorage` / `sessionStorage` | Usuario activo y clave de edición de la pestaña |

**No hay base de datos.** El recetario es un archivo JSON de 230 KB versionado en
git. Cada publicación es un commit real: el historial de git *es* el registro de
auditoría, y cualquier versión anterior se recupera desde GitHub.

Esta elección es deliberada para el volumen actual. La sección
[Limitaciones](#12-limitaciones-conocidas) documenta cuándo dejará de servir.

### Validación en dos niveles

Cliente y servidor validan con criterios **distintos a propósito**:

- **El cliente repara**: si una receta llega con un campo raro, la normaliza y
  sigue. Prioridad: que el obrador nunca se quede sin poder consultar.
- **El servidor rechaza**: si algo no cuadra, devuelve error y no escribe.
  Prioridad: que nunca entre basura al archivo compartido.

---

## 5. Seguridad

### Dos fronteras, con niveles muy distintos

| | Qué protege | Dónde se comprueba | Fuerza real |
|---|---|---|---|
| **Clave de usuario** | Ver la interfaz en ese dispositivo | En el navegador | **Ninguna.** Es una cortina, no una cerradura |
| **Clave de edición** | Publicar para todas las sedes | **En el servidor** | La única protección real del sistema |

Esta distinción está documentada en el propio código y en la interfaz, y es
importante no confundirla: **quien tenga el enlace puede ver el contenido**. La
clave de usuario evita que un cliente asomado al mostrador lea las fórmulas; no
protege frente a nadie decidido.

Lo que sí está protegido de verdad es la escritura. `EDIT_PASSWORD` vive como
variable de entorno en el servidor, se compara con un algoritmo de tiempo
constante (`safeEqual`) para no filtrar información por la duración de la
respuesta, y sin ella no se puede modificar lo que ven las demás sedes.

### Medidas implementadas

- **Política de seguridad de contenido estricta**: `default-src 'none'`, sin
  `unsafe-inline` ni `unsafe-eval`, declarada tanto en cabecera HTTP como en
  etiqueta `<meta>` de respaldo.
- **Cero peticiones externas**: sin CDN, sin analítica, sin tipografías remotas.
  Las tres familias tipográficas están auto-hospedadas.
- **Sin `innerHTML` en todo el proyecto**: `lib/dom.js` es la única vía de
  construcción de nodos y solo escribe texto.
- **Credenciales con SHA-256**, nunca en claro.
- **Cierre de sesión revoca la clave de edición** en caché, para que quien entre
  después no herede capacidad de publicar.
- **Solo `PUT`** en la ruta de escritura: obliga a verificación previa de CORS,
  cerrando la vía de un formulario de otro origen.
- **Limitación de intentos** de clave fallidos en el servidor.
- **Cabeceras**: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`.

### Lo que este sistema NO hace

Se declara explícitamente para que nadie construya sobre supuestos falsos:

- No cifra el contenido en reposo.
- No tiene control de acceso por roles ni sesiones de servidor.
- No registra quién hizo cada cambio de forma verificable: el autor de cada
  commit lo declara el navegador y el servidor no lo comprueba. El historial
  sirve para saber *qué* cambió y *cuándo*, no para atribuir responsabilidad.
- No permite exportar el recetario a un archivo desde la interfaz, por decisión
  expresa: sacar una copia completa de las fórmulas no debe poder hacerse desde
  el mostrador.

---

## 6. Accesibilidad y rendimiento

### Accesibilidad

Objetivo **WCAG 2.2 nivel AA**, con AAA en el texto de lectura porque se lee de
pie, a distancia de brazo y con posible reflejo.

- Contrastes verificados y anotados en el propio código, valor por valor.
- Los tres colores de categoría se reparten el círculo cromático (rosa 330°,
  ámbar 35°, verde 165°) y nunca son la única señal: siempre van acompañados del
  nombre.
- Navegación completa por teclado, con foco visible de alto contraste.
- Foco atrapado y restaurado en cada diálogo.
- Región viva para anunciar el resultado de guardar, eliminar y publicar.
- `prefers-reduced-motion` respetado: toda la animación sale de variables CSS que
  la propia hoja de estilos deja en `0ms`, sin comprobaciones dispersas.

### Rendimiento

| Métrica | Valor |
|---|---|
| Dependencias en tiempo de ejecución | 0 |
| Peticiones a terceros | 0 |
| JavaScript (sin comprimir) | ~165 KB |
| CSS (sin comprimir) | ~87 KB |
| Tipografías (subconjunto latino) | ~290 KB |
| Datos | 230 KB |
| Paso de compilación | Ninguno |

El repintado reconstruye el árbol completo en cada cambio. Con 121 recetas son
unos cientos de nodos y el navegador lo resuelve sin esfuerzo, así que no hace
falta comparar árboles ni llevar registro de qué cambió. La única excepción son
los diálogos, que se conservan montados para no borrar lo que alguien está
escribiendo.

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
oscura, distintos de los del área de trabajo.

### Un solo tema

Hubo un modo oscuro con interruptor propio y **se retiró**: mantener dos paletas
coherentes costaba el doble de trabajo en cada cambio y duplicaba cada valor de
color en el archivo de tokens.

La estructura oscura (barra superior y listado lateral) **no era el tema oscuro**
y se queda: no es una preferencia, es una decisión de composición.

---

## 8. Instalación y despliegue

### Requisitos

- Cuenta de GitHub con el repositorio.
- Cuenta de Vercel (el plan gratuito basta).
- Node.js únicamente para ejecutar los scripts de verificación. **No hace falta
  para desplegar ni para usar el sistema.**

### Configuración en Vercel

Al importar el repositorio:

| Campo | Valor |
|---|---|
| Framework Preset | `Other` |
| Root Directory | `./` |
| Build Command | *(vacío)* |
| Output Directory | *(vacío)* |
| Install Command | *(vacío)* |

Los campos de compilación se dejan **en blanco**: no hay nada que compilar ni que
instalar. Lo que Vercel muestra ahí es texto de ejemplo, no un valor por defecto.
El `package.json` del proyecto no declara dependencias ni script de compilación,
así que aunque Vercel lo detecte no hay nada que ejecutar.

### Variables de entorno

En **Settings → Environment Variables**, las cuatro son obligatorias para que
funcione la publicación compartida:

| Variable | Valor | Para qué |
|---|---|---|
| `GITHUB_TOKEN` | Token de acceso personal | Leer y escribir `data/recipes.json` |
| `GITHUB_REPO` | `usuario/repositorio` | Dónde escribir |
| `GITHUB_BRANCH` | `main` | Qué rama |
| `EDIT_PASSWORD` | Clave larga y aleatoria | Autorizar la publicación |

El token se crea en GitHub → Settings → Developer settings → Personal access
tokens → Fine-grained tokens, con acceso **solo a este repositorio** y permiso de
**lectura y escritura en Contents**. Nunca debe aparecer en el código.

> **Tras añadir variables hay que volver a desplegar.** Los despliegues ya
> existentes no las recogen solos.

Sin esas variables el sitio despliega igual y funciona en modo consulta, pero sin
publicación compartida.

### Dominio propio

En **Settings → Domains**, añade el dominio y usa los registros DNS que Vercel
indique en ese momento. En Namecheap se cargan en **Advanced DNS**. El
certificado HTTPS lo emite Vercel automáticamente.

### Diagnóstico

| Respuesta de `/api/recipes` | Significado |
|---|---|
| `200` con las recetas | Funciona |
| `500` "no tiene configurado el acceso al repositorio" | Faltan `GITHUB_TOKEN` o `GITHUB_REPO` |
| `500` "no tiene configurada la clave de edición" | Falta `EDIT_PASSWORD` |
| `502` "el repositorio rechazó la lectura" | El token no tiene permiso de Contents, o `GITHUB_REPO` está mal escrito |
| `404` | `GITHUB_BRANCH` no coincide con la rama real |
| `403` "Vercel Security Checkpoint" | Firewall de Vercel interceptando: revisa **Firewall → Attack Challenge Mode** |

**Si los despliegues automáticos no se disparan** y GitHub muestra *"Git author
… must have access to the project on Vercel"*: la cuenta de GitHub que firma los
commits no es miembro del equipo de Vercel. Se resuelve invitándola en
**Team Settings → Members**, o alineando la identidad de git
(`git config user.email`) con la cuenta que sí tiene acceso.

---

## 9. Desarrollo y verificación

### Servidor local

Los módulos ES necesitan servirse por HTTP; abrir `index.html` con doble clic no
funciona.

```bash
python -m http.server 8000
```

### Verificación

Un solo comando comprueba todo y devuelve código de error si algo falla:

```bash
node scripts/verificar.mjs
```

```
Sintaxis de los modulos…        ok (33 archivos)
Resolucion de importaciones…    ok (30 modulos)
Coherencia del CSS…             ok (253 clases)
Capa de datos…                  ok (9 bloques)
Validacion del servidor…        ok (28 comprobaciones)
Alta y baja masiva…             ok (126 comprobaciones)
Integridad de las recetas…      ok (121 recetas, 187 componentes, 1282 items)
Archivo offline…                ok
```

| Script | Qué comprueba |
|---|---|
| `check-css.mjs` | Valores CSS corrompidos, hexadecimales inválidos, llaves sin cerrar, tokens sin definir, clases sin estilo, y que todo módulo esté declarado en el service worker y en el empaquetador |
| `test-datos.mjs` | Arranque limpio, integridad, edición, borrado, recarga con cambios pendientes, conflicto de versiones, descarte y ausencia de red |
| `test-api.mjs` | Que el recetario real pasa la validación del servidor sin alterarse, que se rechazan los envíos que lo destruirían, y que cliente y servidor coinciden sobre los datos reales |
| `test-qa.mjs` | Alta y baja masiva (crea 20 recetas y 5 usuarios, comprueba que sobreviven a una recarga, los borra y verifica que el recetario vuelve a su estado inicial), más escalado, revisión de datos y plan de producción. Las pruebas de la revisión están **ancladas a los dos errores reales conocidos**: si un cambio dejara de detectarlos, falla |

La comprobación de integridad incluye el **sha256 del archivo de recetas**: si
una sola cifra de una sola fórmula cambiara sin querer, la verificación falla.

### Verificación manual

[QA.md](QA.md) recoge la lista completa de comprobaciones que solo pueden
hacerse mirando la pantalla: 97 puntos organizados por área, más el historial de
defectos reales que estas pruebas han encontrado.

### Versión de un solo archivo

Para llevar el recetario en una memoria USB y abrirlo con doble clic, sin
servidor:

```bash
node scripts/build-standalone.mjs
```

Genera `dist/Zahavi-Recetario-offline.html` con CSS, JavaScript, datos y
tipografías incrustados. No comparte almacenamiento con el sitio web.

---

## 10. Estructura del repositorio

```
index.html                 Punto de entrada
package.json               Solo "type": "module". Cero dependencias
vercel.json                Cabeceras de seguridad y política de caché
sw.js                      Service worker: funcionamiento sin conexión
manifest.webmanifest       Instalación como aplicación

api/
  recipes.js               Lectura y publicación contra GitHub
  _schema.js               Validación del servidor (rechaza lo dudoso)

assets/
  css/
    fonts.css              Declaraciones @font-face
    tokens.css             Sistema de diseño: color, texto, ritmo, tema
    base.css               Reinicio, campos, botones, transiciones de vista
    layout.css             Barra superior, listado y estructura
    sheet.css              Ficha de receta y modo Pesar
    views.css              Entrada, avisos y estados
    dialogs.css            Ventanas modales
    print.css              Hojas A4
    responsive.css         Todos los ajustes por tamaño de pantalla
  fonts/                   Plus Jakarta Sans, Lora, IBM Plex Mono (OFL)

src/
  main.js                  Arranque y orquestación
  app/
    commands.js            Casos de uso: guardar, eliminar, publicar, descartar
  core/
    storage.js             Acceso a localStorage con resultados tipados
    schema.js              Esquema, normalización y validación
    repository.js          Única puerta a los datos
    remote.js              Cliente de /api/recipes
    users.js               Usuarios y sesión de este dispositivo
    store.js               Estado de la aplicación y suscripciones
    router.js              Enrutado por hash
    search.js              Filtrado, orden y recuentos (funciones puras)
    scale.js               Escalado de tanda (transformación de lectura)
    plan.js                Consolidación del plan de producción
    ingredients.js         Catálogo de ingredientes y totales por unidad
  lib/
    dom.js                 Construcción de DOM sin innerHTML
    format.js              Formato de texto y cifras
    a11y.js                Foco atrapado, región viva, inerte
  views/
    login.js               Pantalla de entrada
    header.js              Barra superior: marca, tema y acciones
    sidebar.js             Listado y filtros de categoría
    detail.js              Ficha de receta
    editor.js              Editor de recetas
    production.js          Modo Pesar
    plan.js                Plan de producción del día
    ingredients.js         Validador de ingredientes
    settings.js            Ajustes
    confirm.js             Confirmación de borrado en tres pasos
    window.js              Carcasa de ventana modal
    skeleton.js            Esqueleto de carga
    print.js               Hojas de impresión

scripts/
  verificar.mjs            Verificación completa en un comando
  check-css.mjs            Coherencia de hojas de estilo y manifiestos
  test-datos.mjs           Pruebas de la capa de datos
  test-api.mjs             Pruebas del validador del servidor
  test-qa.mjs              Alta y baja masiva de recetas y usuarios
  build-standalone.mjs     Empaquetador de un solo archivo

QA.md                      Lista de verificación manual (97 puntos)

data/
  recipes.json             Recetario publicado
```

---

## 11. Decisiones de ingeniería

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

### Por qué el borrado tiene tres pasos distintos y no cuatro avisos iguales

Encadenar ventanas idénticas no hace que nadie lea: entrena a pulsar "aceptar"
varias veces seguidas sin mirar. Lo que obliga a detenerse es que cada paso pida
algo distinto y que el último exija escribir el nombre de la receta a mano.

1. **Qué se va a borrar**: nombre, código y cuánto contiene.
2. **Qué consecuencias tiene**, incluida la de las demás sedes.
3. **Escribir el nombre** para activar el botón, que arranca deshabilitado.

### Por qué los ingredientes usan multicolumna y no cuadrícula

Con `grid` cada celda era un componente entero, y 72 de las 121 recetas tienen
uno solo: una receta larga de un componente reservaba dos o tres columnas y
volcaba toda la lista en la primera, dejando el resto en blanco. `columns`
reparte el contenido con independencia de cuántos bloques haya.

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

---

## 12. Limitaciones conocidas

Documentadas de forma explícita para que las decisiones futuras se tomen con
información completa.

| Limitación | Impacto | Cuándo actuar |
|---|---|---|
| El contenido es visible para quien tenga el enlace | La clave de usuario no protege el contenido | Si las fórmulas pasan a considerarse secreto industrial |
| La API de contenidos de GitHub deja de entregar el archivo a partir de 1 MB | Hoy son 230 KB | Antes de llenar los 121 métodos de preparación |
| El almacenamiento del navegador ronda los 5 MB | Suficiente para texto, no para imágenes | Si se añaden fotografías de producto |
| Los usuarios son de cada dispositivo, no del servidor | Hay que dar de alta a cada persona en cada equipo | Si el número de personas o equipos crece |
| Los ingredientes se referencian por nombre, no por código | Un cambio de nombre no propaga | Antes del costeo (Fase 2) |
| Borrar los datos de navegación borra los cambios sin publicar | Lo ya publicado se recupera al recargar | Formar al equipo: publicar al terminar |
| Ninguna de las 121 recetas tiene método escrito | El campo existe y está vacío en origen | Trabajo de contenido, no técnico |

### Incidencias detectadas en los datos, no corregidas

Se reportan y **no se tocan**, porque corregir una fórmula es una decisión del
negocio, no de quien migró los datos. Las dos las señala hoy **Ajustes →
Revisión de datos** de forma automática:

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

## Licencia

Código bajo licencia MIT (ver [LICENSE](LICENSE)).

Las fórmulas contenidas en `data/recipes.json` son propiedad de Zahavi y no están
cubiertas por esa licencia.
