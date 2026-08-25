# Zahavi · Recetario de Producción

Las fórmulas de la panadería, la repostería y el café en un solo enlace: la misma
información en el obrador y en la casa de producción, consultable desde el móvil
junto a la báscula y funcionando aunque no haya señal.

**Versión 1.5.1 · Fase 1 en producción** · 121 recetas · 187 componentes · 1.282
líneas de ingrediente · 159 ingredientes en catálogo.

> **¿Vas a usarlo y no a modificarlo?** Lo tuyo es la sección *Manual de uso* de
> **[CLAUDE.md](CLAUDE.md)**: cómo se usa en el obrador, sin nada técnico.

---

## Qué es esto, y qué va a ser

Esto no es un recetario que después crecerá. Es **el primer módulo del sistema de
producción de la empresa**, y el recetario es por dónde se empieza porque es la
base de todo lo demás: no se puede calcular lo que cuesta producir algo hasta que
la fórmula de ese algo está escrita, es única y nadie discute cuál es la buena.

El recorrido previsto, por orden:

1. **Fase 1, el recetario.** Está en producción. Las fórmulas dejan de vivir en
   hojas de cálculo sueltas y pasan a tener una sola versión publicada.
2. **Fase 2, costos contra producción diaria.** Qué cuesta cada fórmula y qué se
   produjo de verdad ese día, para poder comparar lo uno con lo otro.
3. **Fases siguientes**, hasta que toda la producción de la empresa esté dentro
   del sistema.

Cada fase se apoya en la anterior y se añade como módulos nuevos sobre la misma
base. El sistema está construido para eso, no para reescribirse en cada fase:
las reglas viven en `core/`, las pantallas solo pintan, y un módulo nuevo entra
como un archivo más en cada capa sin tocar lo que ya funciona. Ese es el motivo
real de la separación en tres capas que se describe más abajo.

## El problema que resolvió la Fase 1

Las fórmulas vivían en una hoja de cálculo que se enviaba por correo. Cada sede
acababa con una versión distinta y nadie sabía cuál era la buena. Escalar una
tanda se hacía a mano, y una copia con un cero de más se quedaba en el archivo
para siempre.

Este proyecto sustituye ese circuito por un recetario único y editable, con una
sola fuente publicada y un historial completo de quién cambió qué.

## Qué hace hoy

- **Escala una tanda** y recalcula todas las cantidades, sin tocar tiempos ni
  moldes, que no se multiplican.
- **Modo Pesar**: un ingrediente a la vez, cifra enorme, avance con la barra
  espaciadora para no tocar la pantalla con las manos sucias.
- **Plan del día**: varias recetas a la vez y la lista consolidada de la compra,
  sin sumar nunca gramos con unidades.
- **Catálogo de ingredientes**: en qué recetas entra cada producto y cuánto suma.
- **Imprime en A4** exactamente lo que se está viendo, escalado incluido.
- **Funciona sin conexión** y se instala como aplicación en tableta y teléfono.
- **Se publica solo**: lo guardado sale hacia las demás sedes sin que nadie tenga
  que acordarse, y si no hay red se reintenta al volver.

---

## Quién entra y quién puede cambiar

**El sistema no tiene cuentas por persona. Hay un solo usuario para todo el
trabajo**, y esa es una decisión tomada a conciencia, no una simplificación
pendiente de arreglar.

Hubo usuarios con nombre y clave individuales, y se retiraron. Se guardaban en
cada aparato y no en el servidor, así que dar de alta a alguien en la panadería
no lo daba de alta en la casa de producción, y cada baja había que repetirla
equipo por equipo. Una lista de usuarios que nadie actualiza es peor que no
tenerla, porque aparenta un control que no existe.

Lo que hay en su lugar son **dos claves con propósitos distintos**, y conviene no
confundirlas:

| | Qué abre | Dónde se comprueba | Fuerza real |
|---|---|---|---|
| **Clave de acceso** | Ver el recetario en ese equipo | En el navegador | Ninguna. Es una cortina, no una cerradura |
| **Clave de edición** | Crear, modificar, eliminar y publicar | **En el servidor** | La única protección real del sistema |

La clave de acceso no puede validarse contra el servidor, y no es un descuido: el
recetario tiene que abrir a las cinco de la mañana aunque no haya cobertura. Lo
que hace es evitar que un cliente asomado al mostrador lea las fórmulas. No
protege frente a nadie decidido.

La clave de edición sí es real. Se comprueba en el servidor con una comparación
de tiempo constante, se pide **antes de cada cambio y cada vez** (no una vez al
día ni al final, al publicar), y caduca sola a la media hora sin usarse, para que
una tableta olvidada encendida en el obrador no siga siendo una llave abierta.

Cuando alguien deja el equipo, la variable `ACCESS_GENERATION` retira la clave de
acceso en todas las sedes a la vez, sin ir aparato por aparato.

**Leer no requiere clave de edición.** Consultar, buscar, escalar, imprimir y
pesar son de todo el obrador. Lo que se protege es lo que **cambia** una fórmula,
porque eso llega a las dos sedes.

---

## Versión y fases

La versión actual es **1.5.1**, y se lee dentro de la propia aplicación: abajo en
la pantalla de entrada y en la barra de título de Ajustes. Así, cuando una sede
dice que algo no le aparece, lo primero que hay que saber (si las dos están
mirando lo mismo) se comprueba sin llamar a nadie.

**El primer número es la fase de la hoja de ruta**, no un capricho de numeración:
quien vea `v1.5.1` sabe qué módulos tiene delante. El tercero sube con cada
corrección publicada.

| Fase | Alcance | Estado |
|---|---|---|
| **1.0** | Consulta, edición y publicación de fórmulas | En producción |
| **1.5** | Escalado de tandas, plan del día y catálogo de ingredientes | En producción |
| 2.x | **Costos por fórmula contra producción diaria** | Siguiente. Requiere precios por ingrediente y registro de lo producido |
| 3.x | Inventario y órdenes de producción | Requiere base de datos real |
| 4.x | Producción de la empresa completa | Por definir |

Con una advertencia dicha a tiempo: **la Fase 2 es el punto donde hay que revisar
la decisión de guardar en un archivo.** Los precios cambian a diario y la
producción se registra todos los días; ese patrón de escritura sí justifica una
base de datos, mientras que el de las fórmulas (que cambian de vez en cuando) no
la justificaba. El razonamiento completo está en [CLAUDE.md](CLAUDE.md),
sección 13.

La versión se declara una sola vez, en `src/core/version.js`, y la verificación
comprueba en cada ejecución que `package.json` dice lo mismo.

---

## Cómo está construido

### Principio rector

**Cero dependencias en tiempo de ejecución y cero compilación.** No hay
empaquetador ni framework: el navegador ejecuta exactamente los archivos que están
en el repositorio. La única dependencia declarada es Playwright, y es de
desarrollo.

No es minimalismo por gusto. Es lo que garantiza que el sistema siga funcionando
dentro de cinco años sin que nadie tenga que reparar una cadena de dependencias
que ya no compila. Una panadería no tiene equipo de mantenimiento. El razonamiento
completo está en [CLAUDE.md](CLAUDE.md), sección 1.

### Las tres capas

Cada capa solo conoce la de abajo.

```
views/   construyen pantallas          no guardan datos, no deciden reglas
app/     casos de uso                  orquestan, no construyen pantallas
core/    datos, estado y reglas        no saben que existe una pantalla
lib/     utilidades sin estado         DOM sin innerHTML, formato, accesibilidad
```

`main.js` es el único módulo que une las tres: decide qué pintar y llama a los
casos de uso. **Ningún módulo de `core/` importa nada de `views/`**, y esa es la
frontera que no se cruza nunca. Las vistas sí leen de `core/` (escalar o
consolidar son transformaciones de lectura, sin efectos), pero solo `main.js` y
`app/commands.js` guardan, publican o borran.

Cuando una regla de negocio se cuela en una vista, el síntoma aparece tarde y en
otro sitio: el rendimiento escalado vivió dentro de `views/detail.js` y la pantalla
decía "Rinde 6 und" mientras la hoja que se llevaba al obrador seguía diciendo
"Rinde 2 und" con las cantidades ya multiplicadas debajo.

### Qué pasa al abrir el recetario

```
1. main.js          prepara la sesión y pide las recetas
2. repository       servidor  →  si falla, el archivo publicado
                              →  si falla, la copia local del equipo
3. render()         pinta según el estado y la ruta
4. sw.js            registra el service worker para el uso sin conexión
```

Esa cadena de respaldos es la que sostiene la promesa de que el obrador nunca se
queda sin consultar. A partir de ahí, cualquier cambio de estado o de dirección
vuelve a llamar a `render()`.

### Qué pasa al publicar

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

La clave se pide **al principio y no al final**. Antes se pedía al publicar, y
con la publicación automática eso dejaba un hueco: eliminar una receta salía
hacia las dos sedes sin volver a preguntar nada, así que bastaba encontrarse una
tableta abierta. Pedirla delante cierra eso y de paso quita el gesto del final,
porque cuando toca publicar la clave ya está puesta.

El `sha` es obligatorio en cada envío: sin él, un envío ciego sobrescribiría el
recetario de las dos sedes sin comprobar nada. Y publicar nunca es requisito para
guardar: sin conexión se guarda igual en el equipo, que es lo que permite trabajar
cuando en el obrador no hay cobertura.

Hay una situación que el sistema **no** resuelve solo, a propósito: si otra sede
publicó mientras este equipo tenía cambios pendientes, publicar borraría su
trabajo, porque se envía el recetario entero y no la receta tocada. Ahí la
publicación automática se detiene y avisa en rojo para que decida una persona.

### Dónde vive cada dato

| Capa | Ubicación | Alcance |
|---|---|---|
| Publicado | `data/recipes.json` en el repositorio | Todas las sedes |
| Pendiente | `localStorage` del navegador | Solo ese dispositivo |
| Rescate | `localStorage`, clave aparte | Copia local dañada, apartada sin sobrescribir |
| Sesión | `localStorage` | Usuario activo en ese equipo |
| Clave de edición | `sessionStorage`, con caducidad | Esa pestaña, y media hora sin uso |

**No hay base de datos.** El recetario es un archivo JSON de 225 KB versionado en
git, con `version`, `revision`, `recipes[]` (cada una con sus componentes y sus
líneas) e `ingredientes[]`. Cada publicación es un commit real: el historial de
git *es* el registro de auditoría, y cualquier versión anterior se recupera desde
GitHub. Cliente y servidor validan con criterios distintos a propósito: **el
cliente repara** para que el obrador nunca se quede sin consultar, **el servidor
rechaza** para que nunca entre basura al archivo compartido.

Modelo completo y patrones aplicados en [CLAUDE.md](CLAUDE.md), secciones 3 y 7.

---

## Estructura

```
index.html                 Punto de entrada
404.html · 500.html        Páginas de fallo
sw.js                      Service worker: funcionamiento sin conexión
vercel.json                Cabeceras de seguridad y política de caché

api/                       Función de servidor: lectura y publicación en GitHub
assets/css/                Sistema de diseño y hojas por área
assets/fonts/              Tipografías propias (OFL), sin peticiones externas
data/recipes.json          Recetario publicado

src/
  main.js                  Arranque y orquestación
  salvavidas.js            Red de seguridad: aviso con salida si no arranca
  app/                     Casos de uso y publicación automática
  core/                    Datos, esquema, acceso, estado, rutas y cálculos puros
  lib/                     DOM sin innerHTML, formato y accesibilidad
  views/                   Cada pantalla del recetario

scripts/                   Verificación, pruebas de datos y servidor local
tests/                     Pruebas de navegador (npm run qa)
CLAUDE.md                  Toda la documentación del proyecto, en un solo archivo
```

---

## Puesta en marcha

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # once bloques de comprobación, sin navegador
npm run qa           # 66 pruebas en navegador (escritorio, celular, tableta)
```

Los módulos ES necesitan servirse por HTTP: abrir `index.html` con doble clic no
funciona.

**Desplegar** es conectar el repositorio a Vercel sin *build command* ni *output
directory*, y declarar las variables de entorno:

| Variable | Valor | Para qué |
|---|---|---|
| `GITHUB_TOKEN` | Token con **Contents: read and write** | Leer y escribir `data/recipes.json` |
| `GITHUB_REPO` | `usuario/repositorio` | Dónde escribir |
| `GITHUB_BRANCH` | `main` | En qué rama |
| `EDIT_PASSWORD` | La clave de publicación | La única protección real del sistema |
| `ACCESS_GENERATION` | Número entero, opcional | Retirar la clave de acceso en todas las sedes a la vez |

Después de cambiarlas hay que **volver a desplegar**: la función las lee al
construirse. Sin ellas el sitio despliega igual y funciona en modo consulta, pero
sin publicación compartida.

**Si algo no publica**, el propio recetario lo dice en Ajustes → Conexión, con el
mensaje exacto del servidor. No hace falta abrir la consola. El paso a paso y el
diagnóstico de cada error están en [CLAUDE.md](CLAUDE.md), sección 9.

## Verificación

Dos capas, y las dos corren en cada envío desde
`.github/workflows/verificacion.yml`:

- `npm run verificar` comprueba en segundos y sin navegador las cinco fronteras de
  arquitectura, la codificación de los archivos, la sintaxis de los módulos, la
  resolución de importaciones, la coherencia del CSS, la capa de datos, la
  publicación y sus conflictos, el validador del servidor, un alta y baja masiva
  de recetas, que la versión declarada sea una sola, y la integridad y el tamaño
  de las 121 fórmulas.
- `npm run qa` abre un navegador de verdad en tres tamaños y fija lo que la capa
  anterior no puede ver: el foco que no entra en una ventana, la hoja que se
  imprime antes de existir, la barra flotante atrapada, la lista que se desborda
  de lado.

La comprobación de integridad incluye el **sha256 del archivo de recetas**. Si
cambia sin que nadie haya editado una receta a propósito, hay que parar y
averiguar por qué: una sola cifra de un solo ingrediente basta para moverlo.

[CLAUDE.md](CLAUDE.md) recoge además la verificación manual y el historial de
defectos reales que estas pruebas han encontrado.

---

## Lo que hay que saber antes de tocar nada

Cinco cosas que no son obvias y salen caras si se descubren tarde.

1. **Guardar y publicar no son lo mismo.** Guardar escribe en el equipo, también
   sin señal. Publicar envía el recetario **entero** al repositorio y es lo que
   ven las demás sedes.
2. **El contenido es legible para quien tenga el enlace.** La clave de acceso es
   una cortina, no una cerradura: `data/recipes.json` y `/api/recipes` entregan las
   121 fórmulas sin ninguna clave. Es una decisión consciente, y cerrarla exigiría
   proteger el despliegue entero o autenticar la lectura, que rompería el arranque
   sin conexión. Lo que sí está protegido es **escribir**.
3. **Leer no puede tumbar el recetario compartido.** Cada lectura que llega al
   servidor consume cuota del token de GitHub, así que hay un tope por origen y
   una copia en memoria de diez segundos. Sin ese freno, cualquiera podía agotar
   la cuota desde fuera y dejar a las dos sedes sin poder consultar.
4. **El techo es el tamaño del archivo, no el número de recetas.** La API de
   contenidos de GitHub deja de entregarlo a partir de 1 MB. Hoy son 225 KB y el
   umbral para actuar son 700 KB. Es el límite que la Fase 2 tocará antes.
5. **Cada despliegue tiene su propia URL, y para el navegador es otro origen**:
   otro almacenamiento, otra sesión, otros cambios sin publicar. Se entra siempre
   por el dominio de producción.

---

## Documentación

**Todo el proyecto está documentado en un solo archivo: [CLAUDE.md](CLAUDE.md).**

Ahí están las capas y las fronteras, las reglas al tocar el código con el defecto
que originó cada una, el procedimiento para añadir un módulo nuevo, el modelo de
datos, la seguridad, el despliegue y su diagnóstico, la recuperación ante fallos,
el sistema de diseño, los límites conocidos, el historial de defectos y el manual
de uso para el equipo de la panadería.

Está en un solo archivo a propósito: repartida en siete documentos, las mismas
cifras aparecían en tres sitios con tres valores distintos y ninguno era el real.

---

## Licencia

Código bajo licencia MIT (ver [LICENSE](LICENSE)).

Las fórmulas contenidas en `data/recipes.json` son propiedad de Repostería Zahavi
Nir Am S.A.S. y no están cubiertas por esa licencia.
