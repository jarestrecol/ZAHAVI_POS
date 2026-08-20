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
11. **Crear, modificar y eliminar piden la clave de edición ANTES**, no al
    publicar. La puerta se monta en un solo punto por acción —`renderDialogs`
    en `main.js`, donde se decide qué diálogo toca— y no en cada botón, para
    que cubra también los atajos de teclado y entrar por la dirección directa.
    Si añades una vía nueva de escritura, pasa por ahí. La comprueba el
    servidor (`verificar: true`); comprobarla en el cliente sería teatro.
    Sin recetario compartido no se pide: no hay quien la valide ni a dónde
    publicar.

Las quince reglas completas, con el defecto real que originó cada una, están en
`docs/DECISIONES.md`, sección "Reglas al tocar el código". Ábrela solo si vas a
tocar CSS, foco, impresión o diseño de listas.

---

## 4. Validar: el contrato de terminado

```bash
npm install          # solo Playwright, y solo para las pruebas
npm run servidor     # sirve en :8000 con las cabeceras de producción
npm run verificar    # 9 bloques, sin navegador, segundos
npm run qa           # 58 pruebas en escritorio, celular y tableta
```

`npm run verificar` en verde termina así:

```
Sintaxis de los modulos… ok (37 archivos)
Resolucion de importaciones… ok (34 modulos)
Coherencia del CSS… ok (310 clases)
Capa de datos… ok (9 bloques)
Publicacion y conflictos… ok (22 comprobaciones)
Validacion del servidor… ok (28 comprobaciones)
Alta y baja masiva… ok (163 comprobaciones)
Version del proyecto… ok (v1.5.0)
Integridad de las recetas… ok (121 recetas, 187 componentes, 1282 items, sha f0307204)
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
| Bloques de `verificar` / pruebas de `qa` | 9 / 58 |

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
