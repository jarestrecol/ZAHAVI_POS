# Instalación, despliegue y verificación

> Parte de la documentación de [Zahavi · Recetario](../README.md).

### Requisitos

- Cuenta de GitHub con el repositorio.
- Cuenta de Vercel (el plan gratuito basta).
- Node.js únicamente para ejecutar los scripts de verificación. **No hace falta
  para desplegar ni para usar el sistema.**

### Versión de Node en el servidor

`package.json` fija **`"node": "24.x"`**, que es la versión por defecto de Vercel
y la misma que se usa en desarrollo.

Antes decía `">=18"`, y Vercel avisaba de ello con razón: un rango abierto se
sube solo cuando sale una versión mayor nueva. Eso significa que el servidor
puede cambiar de versión de Node sin que nadie lo haya decidido ni probado, en un
despliegue que solo cambiaba una línea de CSS. Fijar el mayor deja la
actualización donde debe estar: en una decisión consciente, con su verificación
detrás.

Las tres versiones disponibles hoy son 24.x, 22.x y 20.x. Solo se declara el
mayor: los parches los aplica Vercel por su cuenta, incluidos los de seguridad.

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

**Páginas de error.** `404.html` y `500.html` están en la raíz porque es donde
Vercel las busca en un despliegue estático. La de 500 lleva los marcadores
`::vercel:ERROR_CODE::` y `::vercel:REQUEST_ID::`, que la plataforma sustituye
al servirla: son lo único que permite decir por teléfono qué falló, así que no
se borran aunque parezcan texto raro.

**Comprobado en producción** el 19 de agosto de 2026: `/una-direccion-que-no-existe`
devuelve estado `404` con `Content-Type: text/html` y la página propia, no la de
la plataforma. Vercel la toma de la raíz sin necesidad de declararla en
`vercel.json`. El servidor local la sirve igual, y hay una prueba automática que
comprueba el estado y que la hoja de estilo se aplica bajo la CSP real.

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

**Lo primero, sin abrir nada técnico:** el propio recetario lo dice en
**Ajustes → Conexión**. Cuatro líneas que contestan la pregunta de siempre, "no
me guarda":

| Línea | Qué significa cuando va mal |
|---|---|
| Recetario compartido | "No disponible en este sitio" es un sitio sin la función. "Responde con error" es la función contestando que algo falla, **y debajo sale su mensaje exacto**: es lo que dice qué arreglar, y se corresponde con la tabla de abajo |
| Última lectura | Si está en `—`, este equipo nunca llegó a leer del servidor |
| Publicación automática | Dice por qué no está publicando sola |
| Sin conexión | "Listo" es que el equipo abre el recetario sin señal. "Se activa al recargar" es que todavía no |

Si el sitio no tiene la función configurada, además sale un aviso rojo en la
cabecera. Es deliberado que moleste: sin él se puede trabajar semanas creyendo
que lo guardado llega a la otra sede.

| Respuesta de `/api/recipes` | Significado |
|---|---|
| `200` con las recetas | Funciona |
| `500` "no tiene configurado el acceso al repositorio" | Faltan `GITHUB_TOKEN` o `GITHUB_REPO` |
| `500` "no tiene configurada la clave de edición" | Falta `EDIT_PASSWORD` |
| `502` "el repositorio rechazó la lectura" | El token no tiene permiso de Contents, o `GITHUB_REPO` está mal escrito |
| `404` con `{"error": …}` | `GITHUB_BRANCH` no coincide con la rama real. Que traiga mensaje propio es lo que lo distingue del 404 de un sitio sin la función desplegada |
| `403` "Vercel Security Checkpoint" | Firewall de Vercel interceptando: revisa **Firewall → Attack Challenge Mode** |

**Si los despliegues automáticos no se disparan** y GitHub muestra *"Git author
… must have access to the project on Vercel"*: la cuenta de GitHub que firma los
commits no es miembro del equipo de Vercel. Se resuelve invitándola en
**Team Settings → Members**, o alineando la identidad de git
(`git config user.email`) con la cuenta que sí tiene acceso.

---

## Desarrollo y verificación

### Servidor local

Los módulos ES necesitan servirse por HTTP; abrir `index.html` con doble clic no
funciona.

```bash
npm run servidor
```

Sirve en el puerto 8000 con **las cabeceras que aplica Vercel**, leídas del
propio `vercel.json`: misma CSP, mismos tipos de contenido. Un servidor de
desarrollo más permisivo esconde justo los fallos que solo aparecen publicados.
`python -m http.server 8000` sigue valiendo para mirar algo rápido.

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
| `check-css.mjs` | Valores CSS corrompidos, hexadecimales inválidos, llaves sin cerrar, tokens sin definir, clases sin estilo, y que todo módulo esté declarado en el service worker |
| `test-datos.mjs` | Arranque limpio, integridad, edición, borrado, recarga con cambios pendientes, conflicto de versiones, descarte y ausencia de red |
| `test-api.mjs` | Que el recetario real pasa la validación del servidor sin alterarse, que se rechazan los envíos que lo destruirían, y que cliente y servidor coinciden sobre los datos reales |
| `test-qa.mjs` | Alta y baja masiva (crea 20 recetas y 5 usuarios, comprueba que sobreviven a una recarga, los borra y verifica que el recetario vuelve a su estado inicial), más escalado, catálogo de ingredientes y plan de producción. Del plan se comprueba lo que no se puede romper: que **nunca** suma unidades distintas, que el desglose por receta **cuadra exactamente** con el total de cada línea, que las cantidades cero o negativas se descartan, y que consolidar no altera ni una cifra del recetario |

### Pruebas de navegador

```bash
npm run qa
```

Cincuenta pruebas en escritorio, celular y tableta, en unos doce
segundos. La suite levanta el servidor sola, con las cabeceras de producción.

Existen por una razón concreta: **la verificación anterior no abre ningún
navegador**, y hay una familia entera de fallos que solo se ve ahí. Los seis
defectos de la última revisión (el foco que no entraba en las ventanas, la hoja
del plan que se imprimía después de borrarse, la barra flotante atrapada bajo la
cabecera, el listado que se iba de lado en tableta, dos botones montados y un
control inalcanzable) pasaron por delante de siete bloques de pruebas en verde.

| Archivo | Qué fija |
|---|---|
| `tests/recorrido.spec.js` | Entrar, buscar, abrir una receta y escalar la tanda |
| `tests/dialogos.spec.js` | Que el foco entre en cada ventana y el teclado del Modo Pesar responda de inmediato |
| `tests/impresion.spec.js` | Que se imprima lo que se está mirando |
| `tests/celular.spec.js` | Acciones al alcance del pulgar y nada inalcanzable a 320 px |
| `tests/tableta.spec.js` | Listado en dos columnas sin desplazamiento lateral |
| `tests/resiliencia.spec.js` | Lo que pasa cuando algo va mal: la 404 con su estado y su estilo, el arranque roto que deja salida, la receta borrada que lo dice, el sitio sin servidor que lo anuncia y el recetario abriendo sin red |

Es la única dependencia del proyecto, y es de desarrollo: en tiempo de ejecución
el recetario sigue sin ninguna. `.github/workflows/verificacion.yml` ejecuta las
dos capas en cada envío.

La comprobación de integridad incluye el **sha256 del archivo de recetas**: si
una sola cifra de una sola fórmula cambiara sin querer, la verificación falla.

### Verificación manual

[QA.md](../QA.md) recoge la lista completa de comprobaciones que solo pueden
hacerse mirando la pantalla: 217 puntos organizados por área, más el historial de
defectos reales que estas pruebas han encontrado.

### Auditorías

El sistema se ha sometido a cuatro revisiones independientes, con el alcance y
los hallazgos que siguen. Se registran aquí porque un defecto encontrado y
corregido enseña más que la lista de lo que funciona.

| Revisión | Qué buscó | Resultado |
|---|---|---|
| **Calidad de código** | Pérdida de datos en el editor, estado desincronizado, regresiones en consumidores | Sin defectos críticos. Verificó contra las 121 recetas reales que abrir y guardar no altera ningún nombre |
| **Arquitectura** | Coste futuro de las decisiones, fronteras de capa, techo de escala | Cuatro hallazgos reales, tres corregidos (ver abajo) |
| **Seguridad** | Superficie de servidor, cabeceras, secretos, crecimiento del sistema | Sin secretos ni inyecciones. Un endurecimiento revertido por riesgo de rotura silenciosa |
| **Accesibilidad y diseño** | WCAG 2.2 AA sobre las tres superficies rediseñadas, contraste calculado | Un fallo de teclado grave y varios de etiquetado, todos corregidos |
| **QA con navegador** | Los 187 puntos de [QA.md](../QA.md) recorridos en un navegador real, en seis anchos de pantalla | Tres defectos que ninguna prueba automática podía ver, dos corregidos y uno anotado |

**Lo que encontraron y se corrigió**, por orden de gravedad:

1. **El teclado no activaba los botones del Modo Pesar.** El panel escuchaba la
   barra espaciadora y cancelaba la activación nativa del botón enfocado: Intro
   sobre "Salir" daba el ingrediente por pesado, y el "Salir" de la pantalla
   final estaba muerto. Invisible probando con ratón.
2. **El rendimiento impreso no se escalaba.** Con la tanda al triple, la hoja que
   se lleva al obrador decía "Rinde 2 und" con las cantidades ya multiplicadas
   debajo. La regla vivía dentro de una vista y por eso no llegaba al papel.
3. **14 recetas eran indistinguibles en cuatro listas.** Al mostrar solo el
   nombre base, un plan con dos "Pan Brioche" o una búsqueda de "sacher"
   ofrecían filas idénticas.
4. **El editor invitaba a duplicar el rendimiento** en las 15 recetas que lo
   llevan enterrado a mitad del nombre. Ahora avisa al abrirlas.
5. **Se podía publicar un recetario que después no se podría leer**: el tope de
   envío era cuatro veces mayor que el techo de lectura de GitHub.
6. **Colores y radios fuera del sistema de diseño**, y cifras desactualizadas en
   comentarios y documentación (pesos de JS y CSS, recuento de recetas con
   rendimiento, un módulo retirado que la documentación seguía citando).
7. **El foco no entraba en ninguna ventana.** El diálogo pedía el foco antes de
   estar montado, así que se quedaba en `<body>` y ninguna tecla llegaba al panel
   que las escucha: en Modo Pesar no respondían la barra espaciadora, las flechas
   ni Escape, justo lo que la propia pantalla anuncia. Y al cerrar, el foco
   volvía al principio de la página en vez de al botón de origen, porque ese
   botón ya no era el mismo nodo tras el repintado.
8. **Imprimir el plan del día sacaba la ficha de la receta abierta.** El código
   daba por hecho que la pantalla se repinta antes de volver de `setState`, y con
   la View Transitions API no es así: se imprimía la hoja anterior y el plan se
   borraba del estado justo después.
9. **La barra flotante del celular no llegaba abajo.** Se quedaba pegada bajo la
   cabecera de la receta, a 660 px del pulgar. El `backdrop-filter` de la
   cabecera la convierte en el bloque contenedor de sus descendientes `fixed`,
   así que el `bottom: 8px` de las acciones se medía desde ahí y no desde la
   pantalla. En celular la cabecera no es pegajosa, así que el desenfoque
   sobraba y se retiró.
10. **En tableta el listado se iba a diez columnas.** `columns` reparte por
    altura, y ese contenedor tiene la altura limitada: lo que no cabía abría
    columna nueva a la derecha, con 3.200 px de desplazamiento horizontal dentro
    del panel. Ahora es una rejilla de dos columnas que se lee por filas.
11. **A 320 px había controles inalcanzables**: las etiquetas de Recetas y Pesar
    se solapaban, y el ×4 de la tanda quedaba fuera del segmento, que va en
    `overflow: hidden`.

**Lo que se decidió NO hacer, y por qué**: adoptar Trusted Types en la CSP
(rompería el modo sin conexión en silencio y no se puede comprobar sin
navegador); extraer una abstracción compartida para las listas desplegables (dos
usos de forma distinta es generalizar antes de tiempo); y migrar el rendimiento a
un campo propio del esquema, que se analiza en la hoja de ruta.

### La versión de un solo archivo, retirada

Existió un empaquetador que metía CSS, JavaScript, datos y tipografías en un solo
HTML de 1 MB, para llevar el recetario en una memoria USB y abrirlo con doble
clic. **Se retiró**, y conviene saber por qué antes de que a alguien se le ocurra
volver a añadirlo:

- **Duplicaba el modo sin conexión** que ya da el service worker. La aplicación
  se instala y funciona con la red caída desde el propio sitio.
- **Costaba mantenimiento en dos sitios.** Cada módulo nuevo había que añadirlo
  al manifiesto del service worker **y** al del empaquetador. El propio
  `check-css.mjs` existía en parte para vigilar que las dos listas no divergieran,
  porque cuando lo hacían el fallo solo aparecía sin conexión o en el archivo
  suelto, que es justo donde nadie mira.
- **El artefacto nunca se versionaba**: `dist/` estaba en `.gitignore`, así que
  no era una entrega, era un archivo que alguien tenía que acordarse de generar.

Sigue en el historial de git por si algún día hace falta recuperarlo.

---

