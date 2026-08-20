# Zahavi · Recetario de Producción

Las fórmulas de la panadería, la repostería y el café en un solo enlace: la misma
información en el obrador y en la casa de producción, consultable desde el móvil
junto a la báscula y funcionando aunque no haya señal.

**Estado**: Fase 1 en producción · 121 recetas · 187 componentes · 1.282 líneas de
ingrediente · 159 ingredientes en catálogo.

> **¿Vas a usarlo y no a modificarlo?** Lo tuyo es **[MANUAL.md](MANUAL.md)**: dos
> caras impresas, sin nada técnico.

---

## El problema

Las fórmulas vivían en una hoja de cálculo que se enviaba por correo. Cada sede
acababa con una versión distinta y nadie sabía cuál era la buena. Escalar una
tanda se hacía a mano, y una copia con un cero de más se quedaba en el archivo
para siempre.

Este proyecto sustituye ese circuito por un recetario único y editable, con una
sola fuente publicada y un historial completo de quién cambió qué.

## Qué hace

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

## Cómo está construido

### Principio rector

**Cero dependencias en tiempo de ejecución y cero compilación.** No hay
empaquetador ni framework: el navegador ejecuta exactamente los archivos que están
en el repositorio. La única dependencia declarada es Playwright, y es de
desarrollo.

No es minimalismo por gusto. Es lo que garantiza que el sistema siga funcionando
dentro de cinco años sin que nadie tenga que reparar una cadena de dependencias
que ya no compila. Una panadería no tiene equipo de mantenimiento. El razonamiento
completo está en [docs/DECISIONES.md](docs/DECISIONES.md).

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

A partir de ahí, cualquier cambio de estado o de dirección vuelve a llamar a
`render()`.

### Qué pasa al publicar

```
Editor  →  repository.save()      guarda en el equipo y marca "pendiente"
        →  sync.js                publica en segundo plano, o se hace a mano
        →  api/recipes.js         valida la clave (comparación de tiempo constante)
                                  valida el contenido (rechaza, no repara)
                                  comprueba el sha contra GitHub
        →  GitHub Contents API    escribe data/recipes.json como un commit
        →  las demás sedes lo ven en su siguiente carga
```

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
| Sesión | `localStorage` / `sessionStorage` | Usuario activo y clave de edición de la pestaña |

**No hay base de datos.** El recetario es un archivo JSON de 225 KB versionado en
git, con `version`, `revision`, `recipes[]` (cada una con sus componentes y sus
líneas) e `ingredientes[]`. Cada publicación es un commit real: el historial de
git *es* el registro de auditoría, y cualquier versión anterior se recupera desde
GitHub. Cliente y servidor validan con criterios distintos a propósito: **el
cliente repara** para que el obrador nunca se quede sin consultar, **el servidor
rechaza** para que nunca entre basura al archivo compartido.

Modelo completo y patrones aplicados en
[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

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
docs/                      Documentación técnica
```

---

## Puesta en marcha

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # ocho bloques de comprobación, sin navegador
npm run qa           # 56 pruebas en navegador (escritorio, celular, tableta)
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
diagnóstico de cada error están en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

## Verificación

Dos capas, y las dos corren en cada envío desde
`.github/workflows/verificacion.yml`:

- `npm run verificar` comprueba en segundos y sin navegador la sintaxis de los
  módulos, la resolución de importaciones, la coherencia del CSS, la capa de
  datos, la publicación y sus conflictos, el validador del servidor, un alta y
  baja masiva de recetas, y la integridad de las 121 fórmulas.
- `npm run qa` abre un navegador de verdad en tres tamaños y fija lo que la capa
  anterior no puede ver: el foco que no entra en una ventana, la hoja que se
  imprime antes de existir, la barra flotante atrapada, la lista que se desborda
  de lado.

La comprobación de integridad incluye el **sha256 del archivo de recetas**. Si
cambia sin que nadie haya editado una receta a propósito, hay que parar y
averiguar por qué: una sola cifra de un solo ingrediente basta para moverlo.

[QA.md](QA.md) recoge además la verificación manual, la que solo puede hacerse
mirando la pantalla, con el historial de defectos reales que ha encontrado.

---

## Lo que hay que saber antes de tocar nada

Cuatro cosas que no son obvias y salen caras si se descubren tarde.

1. **Guardar y publicar no son lo mismo.** Guardar escribe en el equipo, también
   sin señal. Publicar envía el recetario **entero** al repositorio y es lo que
   ven las demás sedes.
2. **El contenido es público para quien tenga el enlace.** La clave de acceso es
   una cortina, no una cerradura: `data/recipes.json` y `/api/recipes` entregan las
   121 fórmulas sin ninguna clave. La única protección real es `EDIT_PASSWORD`,
   que se comprueba en el servidor.
3. **El techo es el tamaño del archivo, no el número de recetas.** La API de
   contenidos de GitHub deja de entregarlo a partir de 1 MB. Hoy son 225 KB y el
   umbral para actuar son 700 KB.
4. **Cada despliegue tiene su propia URL, y para el navegador es otro origen**:
   otro almacenamiento, otra sesión, otros cambios sin publicar. Se entra siempre
   por el dominio de producción.

---

## Documentación

| Documento | Para quién |
|---|---|
| **[MANUAL.md](MANUAL.md)** | El equipo de la panadería: cómo se usa, qué significa cada aviso y qué hacer si algo falla |
| **[CLAUDE.md](CLAUDE.md)** | Quien trabaje con asistencia de IA: la entrada única, con las reglas y el contrato de validación |
| [QA.md](QA.md) | Lista de verificación manual y historial de defectos |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Capas, flujos, patrones y modelo de datos |
| [docs/DECISIONES.md](docs/DECISIONES.md) | Las decisiones no obvias con su motivo, y las reglas al tocar el código |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Instalar, desplegar, verificar y diagnosticar |
| [docs/SEGURIDAD.md](docs/SEGURIDAD.md) | Las dos fronteras, qué protege cada una y qué no protege nada |
| [docs/DISENO.md](docs/DISENO.md) | Accesibilidad, rendimiento y sistema de diseño |
| [docs/HOJA-DE-RUTA.md](docs/HOJA-DE-RUTA.md) | Límites conocidos, incidencias de datos y qué viene en la Fase 2 |

---

## Licencia

Código bajo licencia MIT (ver [LICENSE](LICENSE)).

Las fórmulas contenidas en `data/recipes.json` son propiedad de Zahavi y no están
cubiertas por esa licencia.
