# Zahavi · Recetario

Sistema de consulta de recetas para panadería y pastelería. Se abre desde el
mismo enlace en la panadería y en la casa de producción, funciona sin conexión y
está pensado para usarse de pie, en el obrador, con las manos ocupadas.

**Fase 1**: consultar, crear y editar recetas con sus componentes y métodos.
Producción, costos y escalado quedan para fases siguientes.

## Qué hace

- **Listado permanente** a la izquierda: saltar de una receta a otra es un clic.
- **Búsqueda** por nombre, código o ingrediente.
- **Ficha de receta** con los ingredientes a ancho completo y las cantidades como
  lectura de báscula: cifra grande, monoespaciada y alineada en columna.
- **Modo Pesar**: pantalla completa, un ingrediente a la vez, barra espaciadora
  para dar por pesado y avanzar sin tocar la pantalla.
- **Impresión A4** de la ficha o del índice completo.
- **Sin conexión**: el recetario abre igual y sigue consultándose.

### Atajos

| Tecla | Acción |
|---|---|
| `/` | Ir al buscador |
| `↑` `↓` | Moverse por el listado |
| `E` | Editar la receta abierta |
| `Esc` | Salir del buscador o cerrar el diálogo |
| Espacio | En modo Pesar: dar por pesado y avanzar |

## Cómo se guardan los datos

El recetario compartido vive en `data/recipes.json` **del propio repositorio**.
No hay base de datos.

Cuando el sitio corre en Vercel con las variables configuradas, la función
`/api/recipes` lee y escribe ese archivo por la API de GitHub. Entonces:

- Todos los dispositivos ven lo mismo al abrir el enlace.
- **Publicar** desde Ajustes hace un commit real y el cambio queda visible al
  instante en las demás sedes.
- Cada cambio queda en el historial de git: quién, cuándo y qué, con opción de
  revertir.
- Si dos equipos editan a la vez, el segundo recibe un aviso de conflicto en vez
  de pisar el trabajo del primero.

Mientras no se publica, lo editado se guarda en ese equipo y la cabecera muestra
*"N cambios sin publicar"*. Publicar requiere la **clave de edición**, que se
comprueba en el servidor: quien no la tenga puede consultar, pero no modificar lo
que ven los demás.

Si el sitio se sirve sin las funciones (alojamiento estático o archivo local),
todo sigue funcionando contra el archivo publicado y el almacenamiento del
equipo, y la publicación compartida no aparece.

## Despliegue en Vercel

Sitio estático con funciones. Al importar el repositorio:

- **Framework Preset**: `Other`
- **Build Command**: vacío
- **Output Directory**: vacío

### Variables de entorno

En **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `GITHUB_TOKEN` | Token de GitHub con permiso de contenido sobre este repositorio |
| `GITHUB_REPO` | `usuario/repositorio` |
| `GITHUB_BRANCH` | `main` |
| `EDIT_PASSWORD` | La clave que habilita publicar |

El token se crea en GitHub → Settings → Developer settings → Personal access
tokens → Fine-grained tokens, con acceso solo a este repositorio y permiso de
lectura y escritura en **Contents**. No lo pongas nunca en el código.

Sin esas variables el sitio despliega igual, pero sin publicación compartida.

### Dominio

En Vercel, **Settings → Domains**, añade el dominio y usa los registros que
indique en ese momento. En Namecheap se cargan en **Advanced DNS**. El
certificado HTTPS lo emite Vercel.

## Desarrollo

Los módulos ES necesitan servirse por HTTP:

```
python -m http.server 8000
```

Pruebas de la capa de datos:

```
node scripts/test-datos.mjs
```

Versión de un solo archivo, para memoria USB:

```
node scripts/build-standalone.mjs
```

## Estructura

```
index.html              Punto de entrada
vercel.json             Cabeceras y caché
sw.js                   Service worker
api/recipes.js          Lectura y publicación contra GitHub
assets/css/             tokens · base · layout · sheet · views · dialogs · print
data/recipes.json       Recetario publicado
src/lib/                dom (sin innerHTML) · format · a11y
src/core/               storage · schema · repository · remote · auth · store · router · search
src/views/              login · header · sidebar · detail · production
                        editor · settings · confirm · window · print
src/main.js             Arranque y orquestación
```

Sin dependencias, sin compilación, sin `node_modules`. Tipografías del sistema:
ninguna petición externa.

## Diseño

Dirección de obrador, no de libro de cocina: superficie clara de trabajo,
estructura oscura que enmarca, y un ámbar de corteza como único acento. Tres
tipografías con papeles distintos: sans del sistema para la interfaz, serif para
la marca y los títulos, monoespaciada tabular para las cifras.

Contrastes verificados contra WCAG 2.2. El texto de lectura llega a AAA porque se
lee de pie y con posible reflejo. Las categorías se separaron también en tono:
Galletas pasó a oliva porque en dorado quedaba a 14° de Panadería y las dos se
percibían iguales en deuteranopía.

Navegación completa por teclado, foco visible, foco atrapado en los diálogos y
movimiento reducido respetado.

## Sobre los datos

Las 121 recetas se migraron sin alterar un solo valor. Las cantidades se
**muestran** con un decimal como máximo porque el origen trae ruido de coma
flotante del Excel (`283.33333333333297`), pero el valor guardado es el original.

Hay dos incidencias detectadas en los datos que **no se han corregido**, porque
son decisión del negocio:

- `SACHER TORTE x 8` lleva `CHOCOLATE 70%: 10008 GR`. Las variantes ×1, ×5 y ×6
  escalan exactas, así que el valor esperado sería `1008`.
- `BERLINAS` mide la leche en `MG` (miligramos). Muy probablemente sea `ML`.

## Limitaciones

- El contenido es público para quien tenga el enlace. La contraseña de entrada es
  un filtro visual; la que protege de verdad es la clave de edición del servidor.
- El almacenamiento del navegador ronda los 5 MB: de sobra para texto, no para
  imágenes.
- Borrar los datos de navegación de un equipo borra sus cambios sin publicar. Lo
  ya publicado se recupera solo.

## Licencia

MIT para el código. Las recetas son de quien las escribe.
