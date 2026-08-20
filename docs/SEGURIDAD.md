# Seguridad

> Parte de la documentación de [Zahavi · Recetario](../README.md).

### Dos fronteras, con niveles muy distintos

| | Qué protege | Dónde se comprueba | Fuerza real |
|---|---|---|---|
| **Clave de usuario** | Ver la interfaz en ese dispositivo | En el navegador | **Ninguna.** Es una cortina, no una cerradura |
| **Clave de edición** | Publicar para todas las sedes | **En el servidor** | La única protección real del sistema |

Esta distinción está documentada en el propio código y en la interfaz, y es
importante no confundirla: **quien tenga el enlace puede ver el contenido**. La
clave de usuario evita que un cliente asomado al mostrador lea las fórmulas; no
protege frente a nadie decidido.

Conviene decirlo sin rodeos, porque es lo que hay que saber antes de decidir a
quién se le da el enlace: `curl https://<el-sitio>/api/recipes` y
`curl https://<el-sitio>/data/recipes.json` devuelven las 121 fórmulas
completas **sin ninguna clave**. Comprobado el 19 de agosto de 2026 contra el
sitio publicado. Si algún día las fórmulas pasan a considerarse secreto
industrial, la respuesta no es endurecer la clave de usuario: hay que poner una
puerta delante de todo el sitio (la protección de despliegue de Vercel, que
requiere plan de pago) o autenticar la API de verdad, que es un cambio de
arquitectura.

**La clave de instalación ya no se muestra en pantalla.** Estuvo escrita en la
pantalla de entrada para que nadie se quedara fuera el primer día, pero no era
cosa de un día: cada equipo nuevo empieza con ella y la volvía a mostrar, así
que cualquiera que abriera el enlace la leía. Ahora se comunica por fuera y el
sistema **obliga a cambiarla en el primer acceso de cada equipo**. Una clave
idéntica en todas las instalaciones no es una clave.

> **Matiz honesto, porque el resto de este documento lo es:** retirarla de la
> pantalla evita que se lea sin querer, pero la constante sigue estando en
> `src/core/access.js`, que el navegador descarga. Quien vaya a buscarla la
> encuentra. Cierra la lectura casual, no la deliberada — y como el contenido
> ya es público por decisión consciente, no hay nada detrás que proteger.

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
- **Traducción automática desactivada** (`translate="no"`). No es una preferencia
  de idioma: aquí el texto que se pinta **es el dato**. La unidad `und` es además
  "and" en alemán, así que el traductor del navegador la tomaba por palabra
  extranjera dentro de una página en español y la sustituía por `y`. El valor
  guardado nunca cambió, pero en la pantalla desde la que se pesa una tanda una
  unidad mal escrita es un error de producción. Lo mismo podía pasarle a un
  nombre de receta o de ingrediente.
- **Sin `innerHTML` en todo el proyecto**: `lib/dom.js` es la única vía de
  construcción de nodos y solo escribe texto.
- **Una sola clave para todo el equipo, retirable desde el servidor.** Hubo
  usuarios con nombre y clave por persona, y se retiraron: se guardaban EN CADA
  APARATO y no en el servidor, así que dar de alta a alguien en la panadería no
  lo daba de alta en la casa de producción, y cada baja había que repetirla
  equipo por equipo. Una lista de usuarios que nadie actualiza es peor que no
  tenerla, porque aparenta un control que no existe.

  Lo que la sustituyó primero fue una **caducidad semanal**, y también se
  retiró, porque tenía el defecto que venía a corregir. No revocaba: quien
  conocía la clave se la renovaba a sí mismo indefinidamente. Y no propagaba:
  cada aparato guarda su clave y rotaba por su cuenta, así que cuatro aparatos
  eran cuatro cambios que alguien tenía que coordinar por teléfono cada siete
  días. Una rotación por calendario que además empuja hacia `zahavi1`,
  `zahavi2`, `zahavi3`.

  Ahora hay una **generación de acceso**: la variable `ACCESS_GENERATION` que
  el servidor entrega junto al recetario. Cada equipo recuerda con qué
  generación guardó su clave; cuando el servidor anuncia una mayor, esa clave
  deja de valer y la siguiente carga pide una nueva. **Eso sí revoca y sí
  propaga**: subir el número una vez retira el acceso en las dos sedes y en
  todos los aparatos, y se hace cuando hay motivo, no porque toque.

  Sigue funcionando **sin conexión**, que era la condición innegociable: sin
  servidor se usa la última generación conocida, así que un obrador sin señal
  nunca queda fuera. Esa es también la razón de que la clave de acceso no pueda
  validarse en el servidor: el recetario tiene que abrir a las cinco de la
  mañana aunque no haya cobertura.
- **Credenciales con SHA-256**, nunca en claro.
- **Cierre de sesión revoca la clave de edición** en caché, para que quien entre
  después no herede capacidad de publicar.
- **Solo `PUT`** en la ruta de escritura: obliga a verificación previa de CORS,
  cerrando la vía de un formulario de otro origen. Se exige además
  `Content-Type: application/json`, que es defensa en profundidad para el día
  que se acepte algún método que sí pueda viajar sin esa verificación previa.
- **Comparación de la clave en tiempo constante sobre resúmenes SHA-256.** La
  versión anterior comparaba las cadenas y salía antes de tiempo si las
  longitudes no coincidían, así que el tiempo de respuesta revelaba la longitud
  exacta de la clave. Dos resúmenes miden siempre 32 bytes: no queda nada que
  medir.
- **Limitación de intentos** de clave fallidos en el servidor, con tope de
  orígenes vigilados para que el propio registro no sea un consumo de memoria
  que crezca solo.
- **Tope de publicación por debajo del techo de lectura** (900 KB frente al
  megabyte de la API de contenidos de GitHub): impide publicar un recetario que
  después no se podría volver a leer por el mismo camino.
- **Cabeceras**: `Strict-Transport-Security`, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `frame-ancestors 'none'`, `object-src 'none'` y `upgrade-insecure-requests`.

**Trusted Types, evaluado y no adoptado.** La CSP podría exigir
`require-trusted-types-for 'script'`, que haría que el navegador impusiera por su
cuenta la regla número uno del proyecto. Se descartó por ahora: el registro del
service worker es uno de los sumideros que esa directiva intercepta, el fallo
sería silencioso porque el registro va dentro de un `catch` vacío, y romperlo
significa perder el funcionamiento sin conexión sin que nadie lo note. Adoptarlo
exige declarar una política con nombre y **comprobarlo en un navegador real**;
hasta entonces la garantía la sostiene la arquitectura, que no tiene un solo
sumidero de HTML en todo el código.

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

