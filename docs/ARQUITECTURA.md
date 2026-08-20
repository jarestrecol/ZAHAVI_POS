# Arquitectura y modelo de datos

> Parte de la documentación de [Zahavi · Recetario](../README.md).

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
casos de uso. **Ningún módulo de `core/` importa nada de `views/`**, y esa es la
frontera que de verdad no se cruza nunca.

Las otras dos reglas conviene enunciarlas como son y no como suenan mejor, para
que nadie las "arregle" mal:

- **`views/` lee de `core/` directamente; solo `main.js` y `app/commands.js`
  escriben.** Una vista puede llamar a `escalarReceta` o a `consolidar`, que son
  transformaciones de lectura sin efectos. Lo que no puede es guardar, publicar
  ni borrar.
- **Una vista sí importa `views/window.js`**, la carcasa de ventana modal, y lo
  hacen las cinco que abren diálogo. Es una primitiva compartida, no una vista
  llamando a otra.

Cuando una regla vive en una vista y no en `core/`, el síntoma aparece tarde y
en otro sitio: el rendimiento escalado estuvo escrito dentro de `views/detail.js`
y, por eso, la pantalla decía "Rinde 6 und" mientras la hoja impresa que se lleva
al obrador seguía diciendo "Rinde 2 und" con las cantidades ya multiplicadas
debajo. Hoy vive en `core/scale.js` y las dos superficies leen lo mismo.

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
       → sync.publicarEnSegundoPlano()   si se puede, sin esperar a nadie
       → commands.publish()     o a mano, desde Ajustes, con la clave
       → api/recipes.js         valida la clave (comparación de tiempo constante)
                                valida el contenido (rechaza, no repara)
                                comprueba el sha contra GitHub
       → GitHub Contents API    escribe data/recipes.json como un commit
       → las demás sedes ven el cambio en su siguiente carga
```

El `sha` es obligatorio en cada envío. Sin él no hay control de concurrencia
posible: un envío ciego sobrescribiría el recetario de las dos sedes sin
comprobar nada. El servidor lo rechaza antes de tocar GitHub.

**La publicación es automática, pero guardar sigue sin depender de ella.**
`app/sync.js` intenta publicar después de cada guardado o borrado; si no hay
red, reintenta al volver la conexión. Lo que nunca hace es convertir la señal en
un requisito: sin conexión se guarda igual en el equipo, que es lo que permite
trabajar cuando en el obrador no hay cobertura.

Hay una condición deliberada: la clave de edición vive solo en la sesión del
navegador, así que **la primera publicación de cada sesión se hace a mano** y a
partir de ahí el equipo publica solo. Guardarla de forma permanente ahorraría
ese paso a cambio de dejar la llave del repositorio en un equipo del mostrador.

| Cuándo no publica sola | Qué pasa |
|---|---|
| Todavía no se publicó a mano en esta sesión | Queda pendiente. Ajustes lo dice: "Pendiente de la primera publicación" |
| Sin red | Queda pendiente y se reintenta al volver la conexión, y cada 20 s |
| El sitio no tiene la función (`/api/recipes` responde 404) | Aviso rojo en la cabecera: lo guardado se queda en el equipo |
| La clave dejó de valer | Se borra la guardada, se avisa y **deja de reintentar**: insistir con una clave que el servidor rechaza no arregla nada |
| Otra sede publicó antes | Se avisa del conflicto y hay que recargar. No se reintenta: reintentar sería pisar su trabajo |
| **Otra sede publicó una versión nueva mientras este equipo tenía cambios** | Se detiene y lo dice en rojo en la cabecera. Es la única situación en la que publicar puede **borrar** trabajo ajeno, y por eso la decisión no la toma un automatismo |

**Por qué ese último caso importa tanto.** Publicar envía el recetario
**entero** del equipo, no la receta que se acaba de tocar. Si otra sede publicó
mientras este equipo tenía cambios pendientes, este equipo se quedó en la
versión anterior: lo que publicó la otra sede no está en su copia. El `sha` no
lo protege, porque al cargar se leyó la referencia nueva, así que el servidor
aceptaría el envío sin rechazar nada y el trabajo ajeno desaparecería en
silencio. Es el motivo de que `app/sync.js` se pare en seco ahí y deje elegir a
quien está delante, mirando las dos versiones en Ajustes.

### Patrones aplicados

| Patrón | Dónde | Por qué |
|---|---|---|
| **Result** (`{ok, value}` / `{ok, code, message}`) | Todo `core/` y `api/` | Los errores se devuelven, no se lanzan. El `message` viene ya redactado para mostrarse a la persona. |
| **Repositorio** | `core/repository.js` | Única puerta entre la aplicación y el almacenamiento. Ninguna vista toca `localStorage`. |
| **Concurrencia optimista** | `core/remote.js` + `api/recipes.js` | El `sha` de GitHub detecta escrituras simultáneas entre sedes. |
| **Construcción de DOM sin `innerHTML`** | `lib/dom.js` | Todo el texto pasa por `textContent`. Los nombres de receta y el método son texto libre. |
| **Funciones puras** | `core/search.js`, `lib/format.js` | Filtrado, orden y formato se comprueban sin navegador. |
| **Transformación de lectura** | `core/scale.js`, `core/plan.js` | Escalar una tanda y consolidar un plan no escriben nada: derivan una vista de los datos y viven solo mientras se miran. Por eso ninguna de las dos puede corromper el recetario. |
| **Límites del núcleo, públicos** | `core/scale.js` (`FACTOR_MIN`, `FACTOR_MAX`) | `normalizarFactor` recorta en silencio. Cualquier pantalla que deje escribir un factor a mano necesita esos números para avisar **antes** del recorte; si no, enseña una cifra y consolida otra. |

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
[Limitaciones](HOJA-DE-RUTA.md#limitaciones-conocidas) documenta cuándo dejará de servir.

### Validación en dos niveles

Cliente y servidor validan con criterios **distintos a propósito**:

- **El cliente repara**: si una receta llega con un campo raro, la normaliza y
  sigue. Prioridad: que el obrador nunca se quede sin poder consultar.
- **El servidor rechaza**: si algo no cuadra, devuelve error y no escribe.
  Prioridad: que nunca entre basura al archivo compartido.

---



## Cada archivo y su papel

```
index.html                 Punto de entrada
404.html                   Dirección que no existe
500.html                   Fallo de la plataforma (Vercel rellena sus marcadores)
package.json               Cero dependencias en tiempo de ejecución
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
    fallback.css           Pantallas de fallo: 404, 500 y arranque roto
    responsive.css         Todos los ajustes por tamaño de pantalla
  fonts/                   Plus Jakarta Sans, Lora, IBM Plex Mono (OFL)

src/
  main.js                  Arranque y orquestación
  salvavidas.js            Red de seguridad: aviso con salida si no arranca
  app/
    commands.js            Casos de uso: guardar, eliminar, publicar, descartar
    sync.js                Publicación automática con reintento
  core/
    storage.js             Acceso a localStorage con resultados tipados
    schema.js              Esquema, normalización y validación
    repository.js          Única puerta a los datos
    remote.js              Cliente de /api/recipes
    access.js              Clave del equipo, generación de acceso y sesión
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
    header.js              Barra superior: marca, acciones y avisos de estado
    sidebar.js             Listado y filtros de categoría
    detail.js              Ficha de receta
    editor.js              Editor de recetas
    production.js          Modo Pesar
    plan.js                Plan de producción del día
    ingredients.js         Catálogo y validación de ingredientes
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
  servidor.mjs             Servidor local con las cabeceras de producción

tests/                     Pruebas de navegador (npm run qa)
  apoyo.js                 Entrar, interceptar impresión, medir desbordes
  recorrido.spec.js        El camino de todos los días
  dialogos.spec.js         Foco y teclado de las ventanas
  impresion.spec.js        Que se imprima lo que se está mirando
  celular.spec.js          Lo que solo se rompe en un teléfono
  tableta.spec.js          Lo que solo se rompe en una tableta
  resiliencia.spec.js      Lo que pasa cuando algo va mal

QA.md                      Lista de verificación manual (217 puntos)
MANUAL.md                  Cómo se usa, para el equipo de la panadería
docs/                      Esta documentación técnica

data/
  recipes.json             Recetario publicado
```

---

