# Zahavi · Recetario de Producción

Sistema de consulta y gestión de fórmulas para panadería, repostería y café.
Un solo enlace, la misma información en la panadería y en la casa de producción,
y funcionamiento garantizado sin conexión.

**Estado**: Fase 1 en producción · 121 recetas · 187 componentes · 1.282 líneas de ingrediente

> **¿Vas a usarlo, no a modificarlo?** Lo tuyo es **[MANUAL.md](MANUAL.md)**:
> dos caras impresas, sin nada técnico.

---

## Qué es

Las fórmulas vivían en un Excel que se copiaba por correo. Cada sede acababa con
una versión distinta y nadie sabía cuál era la buena. Esto lo sustituye por un
recetario único, consultable desde el móvil junto a la báscula, que además:

- **Escala una tanda** y recalcula todas las cantidades, sin tocar tiempos ni moldes.
- **Modo Pesar**: un ingrediente a la vez, cifra enorme, avance con la barra
  espaciadora para no tocar la pantalla con las manos sucias.
- **Plan del día**: varias recetas, la lista consolidada de la compra.
- **Catálogo de ingredientes**: en qué recetas entra cada producto y cuánto suma.
- **Imprime** en A4 exactamente lo que se está viendo, escalado incluido.
- **Funciona sin conexión** y se instala como aplicación en tableta y teléfono.
- **Se publica solo**: lo que se guarda sale hacia las demás sedes sin que nadie
  tenga que acordarse, y si no hay red se reintenta al volver.

Sin framework, sin compilación y sin una sola dependencia en tiempo de
ejecución. El motivo está en [docs/DECISIONES.md](docs/DECISIONES.md).

---

## Puesta en marcha

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # siete bloques de comprobación, sin navegador
npm run qa           # 50 pruebas en navegador (escritorio, celular, tableta)
```

Desplegar es conectar el repositorio a Vercel sin *build command* ni *output
directory*, y declarar cuatro variables de entorno:

| Variable | Valor | Para qué |
|---|---|---|
| `GITHUB_TOKEN` | Token con **Contents: Read and write** | Leer y escribir `data/recipes.json` |
| `GITHUB_REPO` | `usuario/repositorio` | Dónde escribir |
| `GITHUB_BRANCH` | `main` | En qué rama |
| `EDIT_PASSWORD` | La clave de publicación | La única protección real del sistema |

Después de cambiarlas hay que **volver a desplegar**: la función las lee al
construirse. El paso a paso, el diagnóstico de cada error y la configuración
completa están en **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**.

**Si algo no publica**, el propio recetario lo dice en Ajustes → Conexión, con
el mensaje exacto del servidor. No hace falta abrir la consola.

---

## Documentación

| Documento | Para quién |
|---|---|
| **[MANUAL.md](MANUAL.md)** | El equipo de la panadería. Cómo se usa, qué significa cada aviso y qué hacer si algo falla |
| **[QA.md](QA.md)** | Lista de verificación: 217 puntos manuales más las pruebas automáticas |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Instalar, desplegar, verificar y diagnosticar |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Capas, flujo de una carga, flujo de una publicación y modelo de datos |
| [docs/SEGURIDAD.md](docs/SEGURIDAD.md) | Las dos fronteras, qué protege cada una y qué no protege nada |
| [docs/DISENO.md](docs/DISENO.md) | Accesibilidad, rendimiento y sistema de diseño |
| [docs/DECISIONES.md](docs/DECISIONES.md) | Las decisiones no obvias, con su motivo. Leer antes de cambiarlas |
| [docs/HOJA-DE-RUTA.md](docs/HOJA-DE-RUTA.md) | Límites conocidos, incidencias de datos y qué viene en la Fase 2 |

---

## Lo que hay que saber antes de tocar nada

Cuatro cosas que no son obvias y salen caras si se descubren tarde. Todas están
desarrolladas en los documentos de arriba.

1. **Guardar y publicar no son lo mismo.** Guardar escribe en el equipo, también
   sin señal. Publicar envía el recetario **entero** al repositorio y es lo que
   ven las demás sedes.
2. **El contenido es público para quien tenga el enlace.** La clave de acceso es
   una cortina, no una cerradura: `data/recipes.json` y `/api/recipes` entregan
   las 121 fórmulas sin ninguna clave. La única protección real es
   `EDIT_PASSWORD`, que se comprueba en el servidor.
3. **El techo es el tamaño del archivo, no el número de recetas.** La API de
   GitHub deja de entregarlo a partir de 1 MB. Hoy son 225 KB, y el umbral para
   actuar son 700 KB.
4. **La verificación incluye el `sha` de las 121 fórmulas.** Si cambia sin que
   nadie haya editado una receta a propósito, hay que parar y averiguar por qué.

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

## Licencia

Código bajo licencia MIT (ver [LICENSE](LICENSE)).

Las fórmulas contenidas en `data/recipes.json` son propiedad de Zahavi y no
están cubiertas por esa licencia.
