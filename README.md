# Zahavi · Recetario

Sistema de consulta de recetas para panadería, repostería y café. Se abre desde
el mismo enlace en la panadería y en la casa de producción, funciona sin conexión
y está pensado para usarse de pie, en el obrador, con las manos ocupadas.

**Fase 1**: consultar, crear y editar recetas con sus componentes y métodos.
Producción, costos y escalado quedan para fases siguientes.

---

## Qué hace

- **Listado permanente** a la izquierda: saltar de una receta a otra es un clic.
- **Búsqueda** por nombre, código o ingrediente.
- **Ficha de receta** con los ingredientes a ancho completo y las cantidades como
  lectura de báscula: cifra grande, monoespaciada y alineada en columna.
- **Modo Pesar**: pantalla completa, un ingrediente a la vez, barra espaciadora
  para dar por pesado y avanzar sin tocar la pantalla.
- **Impresión A4** de la ficha o del índice completo.
- **Sin conexión**: el recetario abre igual y sigue consultándose.
- **Modo oscuro** automático, para las jornadas que empiezan de madrugada.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `/` | Ir al buscador |
| `↑` `↓` | Recorrer el listado |
| `E` | Editar la receta abierta |
| `Esc` | Salir del buscador o cerrar el diálogo |
| Espacio | En modo Pesar: dar por pesado y avanzar |

### En cada pantalla

| Tamaño | Comportamiento |
|---|---|
| **Celular** (< 768 px) | Listado y receta se turnan. Las acciones de la receta pasan a una barra fija abajo, al alcance del pulgar. Los diálogos ocupan la pantalla completa. Filtros deslizables en horizontal. |
| **Tablet** (768 – 991 px) | Listado a dos columnas para recorrerlo en la mitad de desplazamiento. Ingredientes a dos columnas. |
| **Escritorio** (≥ 992 px) | Listado y receta a la vez. |

Todo lo que se toca crece en pantallas táctiles, se detecte o no el tamaño.

---

## Cómo se guardan los datos

El recetario compartido vive en `data/recipes.json` **del propio repositorio**.
No hay base de datos.

Cuando el sitio corre en Vercel con las variables configuradas, la función
`/api/recipes` lee y escribe ese archivo por la API de GitHub. Entonces:

- Todos los dispositivos ven lo mismo al abrir el enlace.
- **Publicar** desde Ajustes hace un commit real y el cambio queda visible al
  instante en las demás sedes.
- Cada cambio queda en el historial de git, con opción de revertir.
- Si dos equipos editan a la vez, el segundo recibe un aviso de conflicto y
  **tiene que recargar** antes de poder publicar. No se puede pisar el trabajo
  del otro por insistir.

Mientras no se publica, lo editado se guarda en ese equipo y la cabecera muestra
*"N cambios sin publicar"*. Publicar requiere la **clave de edición**, que se
comprueba en el servidor: quien no la tenga puede consultar, pero no modificar lo
que ven los demás.

Si el sitio se sirve sin las funciones (alojamiento estático o archivo local),
todo sigue funcionando contra el archivo publicado y el almacenamiento del
equipo, y la publicación compartida no aparece.

---

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
**lectura y escritura** en Contents. No lo pongas nunca en el código.

**Tras añadir variables hay que redesplegar**: las que ya están desplegadas no
las recogen solas.

Sin esas variables el sitio despliega igual, pero sin publicación compartida.

### Diagnóstico de `/api/recipes`

| Respuesta | Qué significa |
|---|---|
| `200` con las recetas | Funciona |
| `500` "no tiene configurado el acceso al repositorio" | Faltan `GITHUB_TOKEN` o `GITHUB_REPO` |
| `500` "no tiene configurada la clave de edición" | Falta `EDIT_PASSWORD` |
| `502` "el repositorio rechazó la lectura" | El token no tiene permiso de Contents, o `GITHUB_REPO` está mal escrito |
| `404` | `GITHUB_BRANCH` no coincide con la rama real |
| `403` con "Vercel Security Checkpoint" | El firewall de Vercel está interceptando. Revisa **Firewall → Attack Challenge Mode** |

### Dominio

En Vercel, **Settings → Domains**, añade el dominio y usa los registros que
indique en ese momento. En Namecheap se cargan en **Advanced DNS**. El
certificado HTTPS lo emite Vercel.

---

## Desarrollo

Los módulos ES necesitan servirse por HTTP:

```
python -m http.server 8000
```

### Verificación

Un solo comando comprueba todo, y devuelve error si algo falla:

```
node scripts/verificar.mjs
```

```
Sintaxis de los modulos…        ok (27 archivos)
Resolucion de importaciones…    ok (24 modulos)
Coherencia del CSS…             ok (186 clases)
Capa de datos…                  ok (9 bloques)
Validacion del servidor…        ok (28 comprobaciones)
Integridad de las recetas…      ok (121 recetas, 187 componentes, 1282 items)
Archivo offline…                ok
```

Qué cubre cada paso:

| Script | Qué comprueba |
|---|---|
| `check-css.mjs` | Valores CSS corrompidos, hexadecimales inválidos, llaves sin cerrar, tokens sin definir, clases sin estilo, y que todo módulo esté en el service worker y en el empaquetador |
| `test-datos.mjs` | Arranque limpio, integridad, edición, borrado, recarga con pendientes, conflicto de versiones, descarte y ausencia de red |
| `test-api.mjs` | Que el recetario real pasa la validación del servidor sin alterarse, que se rechazan los envíos que lo destruirían, y que cliente y servidor coinciden sobre los datos reales |

### Versión de un solo archivo

Para llevar el recetario en una memoria USB y abrirlo con doble clic:

```
node scripts/build-standalone.mjs
```

---

## Estructura

```
index.html              Punto de entrada
vercel.json             Cabeceras de seguridad y caché
sw.js                   Service worker: funcionamiento sin conexión

api/
  recipes.js            Lectura y publicación contra GitHub
  _schema.js            Validación del servidor (rechaza lo dudoso)

assets/css/
  tokens.css            Colores, tipografías, ritmo. Nace del logo de la marca
  base.css              Reset, campos y botones
  layout.css            Barra, listado y estructura
  sheet.css             Ficha de receta y modo Pesar
  views.css             Entrada, avisos y estados
  dialogs.css           Ventanas modales
  print.css             Hojas A4
  responsive.css        Todos los ajustes por tamaño de pantalla

src/
  lib/                  dom (DOM sin innerHTML) · format · a11y
  core/                 storage · schema · repository · remote
                        auth · store · router · search
  app/commands.js       Casos de uso: guardar, eliminar, publicar,
                        descartar, importar
  views/                login · header · sidebar · detail · production
                        editor · settings · confirm · window · skeleton · print
  main.js               Arranque y orquestación

scripts/                Verificación, pruebas y empaquetador offline
data/recipes.json       Recetario publicado
```

Sin dependencias, sin compilación, sin `node_modules`. Tipografías del sistema:
ninguna petición externa.

### Cómo está organizado el código

Tres capas, con una regla simple: **cada una solo conoce la de abajo.**

```
  views/     construyen pantallas          no guardan nada
     ↓
  app/       casos de uso                  no construyen pantallas
     ↓
  core/      datos, estado y reglas        no saben que existe una pantalla
```

`main.js` es el único que las une: decide qué pintar y llama a los casos de uso.

Dos reglas más que conviene respetar al tocar el código:

1. **Nunca `innerHTML`.** Todo el DOM se construye con `src/lib/dom.js`, que solo
   escribe texto. Los nombres de receta y el método son texto libre y podrían
   traer marcado.
2. **Los errores se devuelven, no se lanzan.** Todo el núcleo usa la misma forma:
   `{ok: true, value}` o `{ok: false, code, message}`. El `message` ya viene
   redactado para mostrarse.

---

## Diseño

Dirección de obrador, no de libro de cocina: superficie clara de trabajo,
estructura oscura que enmarca, y el naranja de la marca como único acento.

La paleta nace del logo real, con los valores tomados del archivo: naranja
`#F68A1E`, dorado `#FCE00C`, blanco `#FCFCFC`.

Tres tipografías con papeles distintos, todas del sistema para que no haya
peticiones de red ni saltos de maquetación:

- **Sans** para la interfaz: es lo que la hace leerse como sistema y no como libro
- **Serif** para la marca y los títulos de receta
- **Monoespaciada tabular** para las cifras, que deben alinearse siempre

Contrastes verificados contra WCAG 2.2. El texto de lectura llega a AAA porque se
lee de pie y con posible reflejo. Dos decisiones que conviene conocer antes de
tocar los colores:

- **El naranja de marca no vale para texto**: sobre blanco da 2,4:1. Se usa como
  relleno, borde e icono; para texto existe `--amber-text`, oscurecido pero del
  mismo tono.
- **Galletas es oliva y no dorado**: en su tono original quedaba a 14° de
  Panadería y las dos se percibían como el mismo marrón en deuteranopía.

Navegación completa por teclado, foco visible, foco atrapado en los diálogos y
movimiento reducido respetado.

---

## Sobre los datos

Las 121 recetas se migraron sin alterar un solo valor. Las cantidades se
**muestran** con un decimal como máximo porque el origen trae ruido de coma
flotante del Excel (`283.33333333333297`), pero el valor guardado es el original.

Hay dos incidencias detectadas en los datos que **no se han corregido**, porque
son decisión del negocio:

- `SACHER TORTE x 8` lleva `CHOCOLATE 70%: 10008 GR`. Las variantes ×1, ×5 y ×6
  escalan exactas, así que el valor esperado sería `1008`.
- `BERLINAS` mide la leche en `MG` (miligramos). Muy probablemente sea `ML`.

El autor que aparece en cada commit es **declarativo**: lo envía el navegador y el
servidor no lo verifica. El historial sirve para saber qué cambió y cuándo, no
para atribuir responsabilidad.

---

## Limitaciones conocidas

- El contenido es público para quien tenga el enlace. La contraseña de entrada es
  un filtro visual; la que protege de verdad es la clave de edición del servidor.
- El almacenamiento del navegador ronda los 5 MB: de sobra para texto, no para
  imágenes.
- Borrar los datos de navegación de un equipo borra sus cambios sin publicar. Lo
  ya publicado se recupera solo al recargar.
- La API de contenidos de GitHub deja de entregar el archivo a partir de 1 MB.
  Hoy son unos 230 KB, pero llenar los 121 métodos añadiría bastante: conviene
  vigilarlo antes de la fase 2.
- Las recetas referencian ingredientes por nombre, no por código. Para costos
  (fase 2) conviene normalizarlo antes.

---

## Licencia

MIT para el código. Las recetas son de quien las escribe.
