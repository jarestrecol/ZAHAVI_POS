# Zahavi · Recetario: instrucciones de trabajo

**Este archivo es la única entrada al proyecto.** Contiene lo que hay que saber
antes de tocar nada y el contrato de validación. Trabaja desde aquí: no explores
el repositorio para reconstruir lo que ya está escrito abajo, y no abras un
documento de `docs/` si la respuesta está en este archivo.

Si algo de aquí resulta ser falso, corrígelo aquí mismo en el mismo cambio. Un
índice desactualizado cuesta más que no tenerlo.

---

## 0. gstack (obligatorio, antes de cualquier trabajo)

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

Si sale `GSTACK_MISSING`: **detente y no sigas.** Di al usuario:

> gstack es obligatorio para todo el trabajo asistido por IA en este repositorio.
> Instálalo:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Y reinicia la herramienta.

`.claude/hooks/check-gstack.sh` bloquea el uso de skills si falta. No lo esquives.
Con gstack instalado quedan disponibles `/qa`, `/ship`, `/review`, `/investigate`
y `/browse`. Usa `/browse` para toda navegación web.

---

## 1. Qué es esto, en treinta segundos

Recetario de producción para una panadería con dos sedes. Aplicación web sin
framework, sin compilación y **sin una sola dependencia en tiempo de ejecución**:
el navegador ejecuta exactamente los archivos del repositorio. Las fórmulas viven
en `data/recipes.json`, versionado en git; publicar es un commit contra GitHub a
través de `api/recipes.js`. Funciona sin conexión y se instala como aplicación.

Producción: <https://zahavi-recetario.vercel.app> (repositorio
`jarestrecol/zahavi-recetario`, rama `main`). Cada push a `main` despliega solo.

---

## 2. Mapa del repositorio

```
index.html · 404.html · 500.html   Entrada y páginas de fallo
sw.js                              Service worker (uso sin conexión)
vercel.json                        Cabeceras de seguridad y caché
api/recipes.js · api/_schema.js    Lectura y publicación en GitHub, y su validador
data/recipes.json                  Recetario publicado (225 KB, no abrirlo entero)
assets/css/                        tokens.css manda: ni un color fuera de ahí
src/main.js                        Arranque y orquestación (une las tres capas)
src/app/                           Casos de uso: commands.js, sync.js
src/core/                          Datos, esquema, acceso, estado, rutas, cálculos
src/lib/                           dom.js (sin innerHTML), format.js, a11y.js
src/views/                         Una pantalla por archivo
scripts/                           Verificación y servidor local
tests/                             Pruebas de navegador (Playwright)
docs/                              Documentación técnica (ruta en la sección 7)
```

Tres capas con una sola regla: **cada una solo conoce la de abajo.** `views/`
construye pantallas, `app/` orquesta casos de uso, `core/` guarda los datos y las
reglas. Ningún módulo de `core/` importa nada de `views/`. Las vistas leen de
`core/` directamente, pero **solo `main.js` y `app/commands.js` escriben**.

---

## 3. Reglas que no se negocian

1. **Nunca `innerHTML`.** Todo el DOM sale de `lib/dom.js`, que solo escribe texto.
2. **Los errores se devuelven, no se lanzan**: `{ok:true, value}` o
   `{ok:false, code, message}`, con el `message` ya redactado para la persona.
3. **Ni un color ni un espaciado fuera de `assets/css/tokens.css`.**
4. **Todo comentado en español**, explicando el porqué y no el qué.
5. **Una regla de negocio nunca vive en una vista.** Si vive, la aplica esa
   pantalla y ninguna más: así la ficha decía "Rinde 6 und" y el papel del obrador
   "Rinde 2 und".
6. **El nombre base de una receta NO es único.** 14 de las 121 comparten base;
   toda lista que lo muestre tiene que mostrar también el rendimiento.
7. **El cliente repara, el servidor rechaza.** Es deliberado: que el obrador nunca
   se quede sin consultar, y que nunca entre basura al archivo compartido.
8. **Guardar y publicar no son lo mismo.** Guardar escribe en el equipo, también
   sin señal. Publicar envía el recetario **entero** a las demás sedes.
9. **La versión se declara una sola vez**, en `src/core/version.js`. `package.json`
   tiene que decir lo mismo y la verificación lo comprueba. Se muestra en la
   pantalla de entrada y en la barra de Ajustes. Al publicar un cambio de módulos
   sube también `CACHE_VERSION` en `sw.js`, o los equipos seguirán con la carcasa
   vieja en caché.
10. **Clave de acceso y clave de edición son cosas distintas.** La de acceso es
    local y es una cortina, no una cerradura, y no puede validarse en el
    servidor: el recetario tiene que abrir sin cobertura. La única protección
    real es `EDIT_PASSWORD`, que sí se comprueba en el servidor.
11. **Crear, modificar y eliminar piden la clave de edición ANTES y CADA VEZ**,
    no al publicar y no una vez por sesión. El permiso vive en
    `state.autorizacion`, vale para una acción concreta y se retira al terminar
    o cancelar. **No lo ates a `getEditKey()`**: esa clave está en la sesión
    solo para que la publicación salga sola, y usarla como permiso convierte la
    primera comprobación del día en una llave que abre la jornada entera.
    La puerta se monta en un solo punto por acción —`renderDialogs` en
    `main.js`, donde se decide qué diálogo toca— y no en cada botón, para que
    cubra también los atajos de teclado y entrar por la dirección directa. Si
    añades una vía nueva de escritura, pasa por ahí. La comprueba el servidor
    (`verificar: true`); comprobarla en el cliente sería teatro. Sin recetario
    compartido no se pide: no hay quien la valide ni a dónde publicar.
12. **La clave de edición caduca a la media hora sin usarse**
    (`KEY_IDLE_MS` en `core/remote.js`). `sessionStorage` promete menos de lo
    que su nombre sugiere: en una tableta instalada como aplicación la sesión no
    termina al acabar el turno, sino cuando alguien cierra la ventana, y en el
    obrador eso tarda días. La caducidad se comprueba **al leer**, no con un
    temporizador: un reloj no sobrevive a que el aparato se suspenda, y lo que
    hay que medir es el tiempo sin uso, no el tiempo con la pestaña abierta. Una
    marca de tiempo ausente o ilegible cuenta como vencida: ante la duda, se
    vuelve a pedir.
13. **Leer el recetario es público a propósito; agotarle la cuota a GitHub, no.**
    Cada lectura que no salga de la copia en memoria de `api/recipes.js` es una
    petición real a GitHub con el token del servidor, y ese token tiene cuota por
    hora. Por eso hay un freno de `MAX_LECTURAS` por origen y una copia de
    `COPIA_TTL_MS`. **El daño que evitan no es que alguien lea las fórmulas: es
    que las dos sedes se queden sin poder leerlas.** Al publicar se tira la copia
    (`copia = null` en `commit`), que es lo que sostiene la promesa de que una
    publicación nueva se ve en la siguiente carga. `handlePut` **nunca** usa la
    copia: el control de concurrencia necesita el `sha` de verdad, y comparar
    contra uno de hace diez segundos dejaría pisar el trabajo de la otra sede.
14. **Lo que se mide en bytes se mide con `Buffer.byteLength`, no con `.length`.**
    `String.length` cuenta unidades UTF-16, y aquí el texto va en español: cada
    tilde y cada ñ ocupan un byte más de lo que esa cuenta dice. El tope del
    envío existe para no pasar del techo de GitHub, que se mide en bytes.

Las quince reglas completas, con el defecto real que originó cada una, están en
`docs/DECISIONES.md`, sección "Reglas al tocar el código". Ábrela solo si vas a
tocar CSS, foco, impresión o diseño de listas.

---

## 4. Validar: el contrato de terminado

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # 10 bloques, sin navegador, segundos
npm run qa           # 66 pruebas en escritorio, celular y tableta
```

`npm run verificar` en verde termina así:

```
Fronteras de arquitectura… ok (3 de carpeta y 2 de responsabilidad)
Sintaxis de los modulos… ok (37 archivos)
Resolucion de importaciones… ok (34 modulos)
Coherencia del CSS… ok (312 clases)
Capa de datos… ok (29 comprobaciones)
Publicacion y conflictos… ok (22 comprobaciones)
Validacion del servidor… ok (37 comprobaciones)
Alta y baja masiva… ok (179 comprobaciones)
Version del proyecto… ok (v1.5.0)
Integridad de las recetas… ok (121 recetas, 187 componentes, 1282 items, 225 KB, sha f0307204)
```

**Si el `sha` cambia sin que nadie haya editado una receta a propósito, para y
averigua por qué.** Es la huella de las 121 fórmulas: cambia una cifra de un
ingrediente y cambia el `sha`.

Antes de dar algo por terminado: las dos capas en verde, ninguna receta real
tocada (las pruebas manuales usan el prefijo `QA-TEST-` y se borran al acabar) y
`git status` sin restos. `.github/workflows/verificacion.yml` ejecuta las dos
capas en cada envío.

---

## 5. Economía de contexto

- **No abras `data/recipes.json`.** Para cualquier recuento, un
  `node -e` con `require('./data/recipes.json')` que imprima solo la cifra.
- **No leas `QA.md` entero** (492 líneas). Localiza la sección con
  `grep -n "^## " QA.md` y lee solo esa.
- **No leas los seis documentos de `docs/`** para responder una pregunta: usa la
  ruta de la sección 7 y abre uno.
- **No relances la suite de navegador** para un cambio de una línea de CSS.
  `npm run verificar` ya comprueba la coherencia de estilos sin abrir navegador.
- **No vuelvas a calcular lo que ya está en la sección 6.**

---

## 6. Datos verificados (20 de agosto de 2026)

| Dato | Valor |
|---|---|
| Recetas | 121 (Pastelería 66, Panadería 34, Galletas 21) |
| Componentes / líneas de ingrediente | 187 / 1.282 |
| Catálogo de ingredientes | 159 |
| `data/recipes.json` | 225 KB, `version: 2` |
| Techo real | 1 MB (API de contenidos de GitHub). Umbral de acción: 700 KB |
| Versión | 1.5.0 (Fase 1). El primer número es la fase de la hoja de ruta |
| Node en el servidor | 24.x |
| Bloques de `verificar` / pruebas de `qa` | 10 / 66 |

Variables de entorno en Vercel: `GITHUB_TOKEN` (Contents: read and write),
`GITHUB_REPO`, `GITHUB_BRANCH` y `EDIT_PASSWORD` obligatorias, más
`ACCESS_GENERATION` opcional (subirla retira la clave de acceso en todas las
sedes a la vez). **Al cambiarlas hay que volver a desplegar**: la función las lee
al construirse.

Dos avisos que salen caros si se descubren tarde:

- La URL única de cada despliegue (`zahavi-recetario-<hash>.vercel.app`) es otro
  origen para el navegador: otro `localStorage`, otra sesión, otros cambios sin
  publicar. Para probar, entra siempre por el dominio de producción.
- Si la identidad de git que firma el commit no tiene acceso al proyecto en
  Vercel, el despliegue automático no se dispara. En este repositorio está fijada
  en local con la identidad de los commits anteriores.

### Estado de seguridad (auditado el 25 de agosto de 2026)

Auditoría completa de las dos superficies. **No queda ninguna vulnerabilidad
conocida explotable de forma remota.** El detalle está en `docs/SEGURIDAD.md`;
esto es lo que hay que saber antes de tocar nada.

Comprobado y sin hallazgos: sin secretos en el árbol ni en el historial de git;
ninguna variable de entorno viaja al cliente (`process.env` solo aparece en
`api/recipes.js`); ningún camino de escritura evita `checkAuth`; sin `innerHTML`,
`eval` ni `document.write` en todo `src/`; sin contaminación de prototipo
(los objetos se construyen campo a campo); sin SSRF (repo y rama vienen del
entorno, nunca de la petición); `npm audit` limpio con una sola dependencia de
desarrollo.

**La inyección SQL no aplica y no puede aplicar:** no hay base de datos ni una
sola sentencia SQL en el proyecto. El almacenamiento es `localStorage` y un
archivo JSON en git.

Tres cosas que **no** son un fallo por corregir, sino los límites del medio.
No intentes cerrarlas con código, porque no se puede:

1. **Las fórmulas son legibles para quien tenga el enlace.** Decisión consciente
   y documentada. `curl .../data/recipes.json` devuelve las 121 completas.
   Cerrarlo exige protección de despliegue de Vercel (plan de pago) o autenticar
   la lectura, que rompe el arranque sin conexión tal como está hoy.
2. **Los datos cargados se ven desde la consola del navegador.** Es cierto de
   toda aplicación web que muestre datos: para pintarlos hay que tenerlos.
3. **La clave de edición pasa por el navegador de quien la escribe.** Para
   validarla hay que enviarla. La regla 12 acota cuánto se queda; a cero no baja.

Lo que sí protege de verdad, y hay que conservar: `EDIT_PASSWORD` comprobada en
el servidor con `timingSafeEqual` sobre SHA-256 (nunca compares esa clave con
`===`), el retraso creciente ante intentos fallidos, `ACCESS_GENERATION` para
revocar el acceso de todas las sedes a la vez, y las cabeceras de `vercel.json`,
con una CSP `default-src 'none'` sin `unsafe-inline` que es la razón de que la
regla 1 no se negocie.

Detalle contraintuitivo, por si algún día se compra un dominio propio: hoy el
sitio **no aparece** en los registros públicos de transparencia de certificados
porque Vercel lo sirve bajo el comodín `*.vercel.app`. Un dominio propio genera
un certificado a su nombre, y ese nombre **sí** queda publicado. Comprarlo está
bien por otras razones; no lo compres esperando ocultación.

---

## 7. A qué documento ir (abre uno, no todos)

| Si la pregunta es sobre | Abre |
|---|---|
| Cómo se usa el recetario en la panadería | `MANUAL.md` |
| Capas, flujo de carga, flujo de publicación, modelo de datos | `docs/ARQUITECTURA.md` |
| Por qué algo está hecho así, y las 15 reglas de código | `docs/DECISIONES.md` |
| Desplegar, variables, diagnóstico, recuperación | `docs/DESPLIEGUE.md` |
| Claves, CSP, qué está protegido y qué no | `docs/SEGURIDAD.md` |
| Accesibilidad, rendimiento, tokens y sistema de diseño | `docs/DISENO.md` |
| Límites conocidos, incidencias de datos, Fase 2 | `docs/HOJA-DE-RUTA.md` |
| Lista de verificación manual e historial de defectos | `QA.md` |

---

## 8. Commits

Formato `<tipo>: <descripción>` (`feat`, `fix`, `refactor`, `docs`, `test`,
`chore`). En español, describiendo el efecto para quien usa el recetario y no el
archivo tocado. Commit o push solo cuando el usuario lo pida.
