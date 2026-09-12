# Seguridad, en detalle

Referencia. El núcleo (`../CLAUDE.md`) lleva lo que es trampa: las dos claves no
son lo mismo, el contenido es público por decisión, y no hay secretos en el
repositorio. Aquí está el resto: la CSP, las cabeceras, la comparación en tiempo
constante, lo que el sistema NO hace y los riesgos aceptados.

### Dos fronteras, con niveles muy distintos

| | Qué protege | Dónde se comprueba | Fuerza real |
|---|---|---|---|
| **Clave de acceso** | Ver la interfaz en ese dispositivo | En el navegador | **Ninguna.** Es una cortina, no una cerradura |
| **Clave de edición** | Crear, modificar, eliminar y publicar | **En el servidor** | La única protección real del sistema |

**El contenido es público para quien tenga el enlace.**
`curl https://<el-sitio>/api/recipes` y `curl https://<el-sitio>/data/recipes.json`
devuelven las 122 fórmulas completas **sin ninguna clave**. Es una decisión
consciente, no un descuido. Si algún día las fórmulas pasan a considerarse secreto
industrial, la respuesta no es endurecer la clave de acceso: hay que poner una
puerta delante de todo el sitio (protección de despliegue de Vercel, de pago) o
autenticar la API de verdad, que es un cambio de arquitectura.

**Por qué la clave de acceso no puede validarse en el servidor.** Es la pregunta
que vuelve cada vez que alguien mira este código, y la respuesta cierra el espacio
de diseño entero: **el recetario tiene que abrir a las cinco de la mañana en un
obrador sin cobertura.** Si entrar exigiera hablar con el servidor, un corte de red
dejaría al equipo sin las fórmulas a media producción. De ahí se sigue todo lo
demás: la comprobación tiene que poder hacerse sin red, luego el material con el
que se compara está en el aparato, luego quien tenga el aparato puede leerlo, luego
no es una cerradura.

Lo que sí se puede hacer sin romper el requisito es **retirarla** desde el
servidor: `ACCESS_GENERATION`. El servidor no valida nada, solo anuncia un número,
y el aparato decide. Sin red se usa el último número conocido, así que un obrador
aislado nunca queda fuera.

**La clave de instalación** (`DEFAULT_PASSWORD` en `src/core/access.js`) ya no se
muestra en pantalla y el sistema obliga a cambiarla en el primer acceso de cada
equipo. Matiz honesto: la constante sigue estando en un archivo que el navegador
descarga. Cierra la lectura casual, no la deliberada; y como el contenido ya es
público por decisión consciente, no hay nada detrás que proteger.

### Medidas implementadas

- **CSP estricta**: `default-src 'none'`, sin `unsafe-inline` ni `unsafe-eval`, en
  cabecera HTTP y en `<meta>` de respaldo.
  **Y `connect-src` está hoy en `'self'`**, así que el día que la aplicación hable
  con la base de datos habrá que abrirla al dominio de Supabase —a ese y a ninguno
  más—, en los dos sitios. Conviene saberlo de antemano porque el síntoma engaña:
  la petición no falla con un error de red, la bloquea el navegador antes de
  salir, y en la pantalla parece que el servidor no responde.
- **Cero peticiones externas en el uso normal**: sin CDN, sin analítica, sin
  tipografías remotas. **La única excepción es el dictado por voz**, y va
  explicada abajo y en la [sección 11](#11-diseño-accesibilidad-y-rendimiento).
- **Sin un solo sumidero de HTML** en todo el proyecto: ni `innerHTML`, ni
  `outerHTML`, ni `insertAdjacentHTML`, ni `document.write`, ni `eval`, ni
  `new Function`. Verificado en auditoría sobre todo el árbol.
- **Traducción automática desactivada** (`translate="no"`): aquí el texto que se
  pinta **es el dato**. La unidad `und` es "and" en alemán, y el traductor la
  sustituía por `y` dentro de una página en español. El valor guardado nunca
  cambiaba, pero en la pantalla desde la que se pesa una tanda eso es un error de
  producción.
- **Comparación de la clave en tiempo constante sobre resúmenes SHA-256**
  (`safeEqual`). La versión anterior comparaba cadenas y salía antes si las
  longitudes no coincidían: el tiempo de respuesta revelaba la longitud exacta.
  Dos resúmenes miden siempre 32 bytes.
- **La clave de edición caduca a la media hora sin usarse.** Se queda en la sesión
  para que la publicación automática salga sola, pero en una tableta instalada como
  aplicación la sesión no termina al acabar el turno: puede tardar días. Sin
  caducidad quedaba una llave olvidada sobre el mostrador.
- **Cerrar sesión revoca la clave de edición** (`cerrarSesion`, y lo comprueban
  `verificar.mjs` y `test-qa.mjs`).
- **Limitación de intentos** en el servidor, identificando a quien llama por
  `x-real-ip` y, en su defecto, por el **último** elemento de `x-forwarded-for`.
  Tomar el primero era falsificable: los proxies añaden al final, así que el primer
  elemento es texto que manda quien llama, y con una IP inventada por petición cada
  llamada estrenaba contador.
- **Doble tope de tamaño**: sobre el cuerpo recibido y sobre **lo que de verdad se
  va a escribir** (con sangrado, que abulta más). Impide publicar un recetario que
  después no se podría volver a leer por el mismo camino.
- **Solo `PUT`** en la ruta de escritura, con `Content-Type: application/json`
  exigido: obliga a verificación previa de CORS y cierra la vía de un formulario de
  otro origen. La función no emite `Access-Control-Allow-Origin` en ninguna
  respuesta.
- **El autor del commit se limpia de saltos de línea** antes de recortarlo: va
  dentro del asunto, y un salto ahí convierte el resto en cuerpo del mensaje.
- **El micrófono está abierto solo para la propia página** (`microphone=(self)`
  en `Permissions-Policy`), y solo desde la v2.0.0, para el dictado del método.
  Cámara y geolocalización siguen cerradas. Antes estaba `microphone=()`, que lo
  bloqueaba **también para el propio sitio**: el dictado no habría funcionado
  nunca por bien escrito que estuviera el código. `Permissions-Policy` **no se
  puede declarar en una `<meta>`**, así que esa protección existe únicamente como
  cabecera HTTP y un despliegue sin cabeceras no la tiene.
- **El dictado por voz saca audio del aparato.** En Chrome y en Android,
  `SpeechRecognition` envía el audio del micrófono a un servidor del fabricante
  para transcribirlo. La petición **no la hace esta página** —la hace el
  navegador—, así que no pasa por la CSP ni aparece en el panel de red; pero el
  audio del obrador sale hacia un tercero, y eso hay que decirlo. Por eso el
  dictado es opcional, hay que pulsarlo cada vez, exige conexión, la interfaz lo
  advierte junto al botón, y **nunca es la única forma de escribir un método**: a
  las cinco de la mañana sin cobertura solo queda el teclado.
- **Cabeceras**: `Strict-Transport-Security`, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `frame-ancestors 'none'`, `object-src 'none'`, `upgrade-insecure-requests`.
- **Sin secretos en el repositorio ni en su historial.** Barrido de `ghp_`,
  `github_pat_`, `sk-`, `AKIA` y claves PEM sobre `git log --all -p`: cero
  coincidencias.

### Lo que este sistema NO hace

Se declara para que nadie construya sobre supuestos falsos:

- No cifra el contenido en reposo.
- No tiene control de acceso por roles ni sesiones de servidor.
- **No registra quién hizo cada cambio de forma verificable**: el autor de cada
  commit lo declara el navegador y el servidor no lo comprueba. El historial sirve
  para saber *qué* cambió y *cuándo*, no para atribuir responsabilidad.
- No permite exportar **las fórmulas** desde la interfaz, por decisión expresa:
  sacar una copia completa del recetario no debe poder hacerse desde el mostrador.
  **Matiz que hay que leer entero**, porque desde la v2.0.0 existe un botón de
  exportar: lo que sale de Ingredientes es el **catálogo de la compra** —nombre,
  unidad, total agregado, en cuántas recetas entra— y **nunca** las cantidades por
  receta ni el método. Con eso no se puede reconstruir ninguna fórmula, y
  `tests/exportar.spec.js` lo comprueba fila a fila. La frontera está donde
  estaba; lo que cambió es que ahora hay una herramienta que se queda de este
  lado de ella, porque el equipo necesitaba la lista para poner precios.

### Riesgos conocidos y aceptados

| Riesgo | Estado |
|---|---|
| **`EDIT_PASSWORD` se puede probar en bucle.** El freno retrasa (4 s máx.) pero no bloquea, y el contador vive en memoria de instancia: Vercel levanta varias en paralelo, cada una con sus intentos gratis | **Mitigación operativa obligatoria: que `EDIT_PASSWORD` sea aleatoria y de 20+ caracteres.** Es lo que más rinde por lo que cuesta. Una regla de tasa en el Firewall de Vercel sobre `PUT /api/recipes` vive en el borde y no depende del contador |
| **La clave de edición vive en claro en `sessionStorage`** y es compartida por las dos sedes | Acotado por la caducidad de 30 min y el borrado al cerrar sesión. La solución real es un testigo de corta vida ligado al origen en vez de la clave cruda: es cambio de arquitectura, está en la hoja de ruta |
| **Trusted Types evaluado y no adoptado** | El registro del service worker es uno de los sumideros que esa directiva intercepta, el fallo sería silencioso porque va dentro de un `catch` vacío, y romperlo significa perder el modo sin conexión sin que nadie lo note. La vía sin riesgo es una cabecera `Content-Security-Policy-Report-Only` adicional, que confirma o desmiente con datos reales sin romper nada |
| **El cuerpo se parsea antes de comprobar la clave** (`api/recipes.js`) | Un anónimo puede forzar el parseo de hasta 900 KB por petición. Coste, no seguridad. Pendiente |

---

