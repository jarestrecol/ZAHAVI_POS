# Zahavi · Recetario

Recetario de panadería y pastelería. Se abre en el navegador, guarda las recetas
en el propio dispositivo y funciona sin conexión.

No tiene servidor, ni base de datos, ni cuentas de usuario. No hace ni una sola
petición a internet: no usa CDN, ni tipografías remotas, ni analítica.

## Cómo se usa

1. Abre el enlace publicado.
2. Entra con la contraseña inicial `zahavi2026`.
3. Toca la portada para abrir el libro.

Lo que puedes hacer: buscar por nombre, por código o por ingrediente; filtrar por
categoría; crear, editar y eliminar recetas; imprimir la ficha de una receta o el
índice completo en A4; exportar e importar respaldos.

### Cargar tu recetario

El sitio publicado trae solo unas recetas de demostración. Para trabajar con el
recetario real:

1. Abre **Ajustes → Importar respaldo**.
2. Elige tu archivo de respaldo `.json`.

Importar **reemplaza** todo el recetario de ese dispositivo. Exporta antes si
tienes cambios sin respaldar.

### Respaldos

Las recetas viven en el almacenamiento local del navegador. Eso significa que
**borrar los datos de navegación borra el recetario**. No hay copia en ningún
servidor.

Exporta un respaldo desde Ajustes con regularidad y guarda el archivo fuera del
equipo (una memoria USB, un correo a ti misma, la nube que uses). La aplicación
avisa cuando pasan más de 30 días desde el último respaldo.

## Dos almacenes distintos

Abrir el archivo desde el disco y abrir el sitio web **no comparten datos**. Son
dos almacenes separados del navegador. Una receta creada en uno no aparece en el
otro; el único puente es exportar el respaldo desde uno e importarlo en el otro.

Cuando el recetario se abre desde el disco, aparece un aviso en la cabecera para
recordarlo.

## Sobre la contraseña

**La contraseña es una cortina, no una cerradura.** Todo se comprueba dentro del
navegador. Sirve para que un cliente que se asome al mostrador no vea las
fórmulas. No protege frente a alguien que sepa lo que hace: con las herramientas
de desarrollo se salta en segundos.

Por eso este repositorio publica **recetas de demostración**, no fórmulas reales.
Un sitio en GitHub Pages es público: cualquiera puede descargar los archivos
directamente sin pasar por la pantalla de entrada. Las recetas reales se importan
en el dispositivo de la panadería y no salen de ahí.

## Estructura

```
index.html              Punto de entrada
assets/css/             tokens · base · book · views · dialogs · print
data/recipes.json       Recetas de demostración
src/lib/                dom (construcción de DOM sin innerHTML) · format · a11y
src/core/               storage · schema · repository · auth · store · router · search
src/views/              login · header · book · index-view · detail
                        editor · settings · confirm · window · print
src/main.js             Arranque y orquestación
scripts/                Generador de la versión de un solo archivo
```

Sin dependencias, sin compilación, sin `node_modules`. Es JavaScript con módulos
ES que el navegador ejecuta tal cual.

### Desarrollo

Los módulos ES necesitan servirse por HTTP; abrir `index.html` con doble clic no
funciona. Levanta un servidor en la carpeta del proyecto:

```
python -m http.server 8000
```

y abre `http://127.0.0.1:8000/`.

### Versión de un solo archivo

Para llevar el recetario en una memoria USB o usarlo con doble clic, sin servidor:

```
node scripts/build-standalone.mjs
```

Genera `dist/Zahavi-Recetario-offline.html`, un único archivo con todo dentro.

## Datos

```json
{
  "version": 2,
  "recipes": [
    {
      "id": "R001",
      "nombre": "TORTA DE BANANO X 2 UND",
      "categoria": "PASTELERÍA",
      "metodo": "1. ...\n2. ...",
      "componentes": [
        {
          "nombre": "MASA",
          "items": [{ "ingrediente": "HARINA DE TRIGO", "cantidad": "500", "unidad": "GR" }]
        }
      ]
    }
  ],
  "ingredientes": [{ "id": "I001", "nombre": "HARINA DE TRIGO", "unidad": "GR" }]
}
```

El sufijo `X 2 UND` del nombre se muestra aparte como rendimiento. El catálogo de
`ingredientes` alimenta el autocompletado del editor y propone la unidad habitual.

Los respaldos de versiones anteriores (un array de recetas sin envoltorio, o un
objeto con solo `recipes`) se aceptan y se convierten al formato actual.

## Accesibilidad

Contrastes verificados contra WCAG 2.2 AA. Navegación completa por teclado, con
foco visible, foco atrapado en los diálogos y `Escape` para cerrarlos. Tamaño
mínimo de letra de 12 px y objetivos táctiles de 24 px. Las animaciones del libro
se desactivan cuando el sistema pide menos movimiento.

## Limitaciones conocidas

- GitHub Pages no permite cabeceras HTTP propias, así que no se puede impedir que
  el sitio se incruste en un marco de otra página.
- El almacenamiento del navegador ronda los 5 MB. De sobra para miles de recetas,
  pero no para imágenes.
- No hay sincronización entre dispositivos. El respaldo es el único puente.

## Licencia

MIT para el código. Las recetas son de quien las escribe.
