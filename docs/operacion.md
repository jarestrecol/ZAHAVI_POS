# Despliegue, diagnóstico y recuperación

Referencia. Nada de esto hace falta para escribir código; todo hace falta cuando
algo no funciona en producción. Se abre por el síntoma.

### Configuración en Vercel

| Campo | Valor |
|---|---|
| Framework Preset | `Other` |
| Root Directory | `./` |
| Build / Output / Install Command | *(los tres, vacíos)* |

No hay nada que compilar ni que instalar. Lo que Vercel muestra ahí es texto de
ejemplo, no un valor por defecto.

`404.html` y `500.html` están en la raíz porque es donde Vercel las busca. La de
500 lleva los marcadores `::vercel:ERROR_CODE::` y `::vercel:REQUEST_ID::`, que la
plataforma sustituye al servirla: son lo único que permite decir por teléfono qué
falló, así que no se borran aunque parezcan texto raro.

`package.json` fija `"node": "24.x"`. Solo el mayor: los parches los aplica Vercel,
incluidos los de seguridad. Un rango abierto (`>=18`) sube solo de versión mayor en
un despliegue que solo cambiaba una línea de CSS.

### Variables de entorno

| Variable | Valor | Para qué |
|---|---|---|
| `GITHUB_TOKEN` | Token fine-grained, **Contents: read and write**, solo este repo | Leer y escribir `data/recipes.json` |
| `GITHUB_REPO` | `usuario/repositorio` | Dónde escribir |
| `GITHUB_BRANCH` | `main` | Qué rama |
| `EDIT_PASSWORD` | Aleatoria, **20+ caracteres** | Autorizar la escritura. Única protección real |
| `ACCESS_GENERATION` | Entero, opcional | Retirar la clave de acceso en todas las sedes a la vez |

> **Tras cambiar cualquier variable hay que volver a desplegar.** La función las
> lee al construirse. Los despliegues existentes no las recogen solos.

Sin esas variables el sitio despliega igual y funciona en modo consulta, pero sin
publicación compartida.

**Retirar la clave de acceso de todas las sedes**: sube `ACCESS_GENERATION` en uno
(créala con `1` si no existe), vuelve a desplegar, y comunica la clave nueva. En la
siguiente apertura cada aparato cerrará sesión y pedirá la nueva, diciendo por qué.
Nadie se queda fuera: con la clave vieja se entra a la pantalla que pide poner la
nueva. Un aparato sin señal no se entera hasta que vuelva la red, y eso es
deliberado.

### Política de caché

Está en `vercel.json`, y cada línea responde a un motivo distinto:

| Ruta | Cabecera | Por qué |
|---|---|---|
| `/src/` y `/assets/css/` | `no-cache, must-revalidate` | El código y los estilos se revalidan **siempre** |
| `/assets/fonts/` | `max-age=31536000, immutable` | Las tipografías no cambian nunca |
| `/assets/` (imágenes) | `max-age=3600` | Cambian poco y no rompen nada si tardan |
| `/data/recipes.json` y `/sw.js` | `no-cache, must-revalidate` | Una publicación nueva debe verse en la siguiente carga |
| `/manifest.webmanifest` | `no-cache, must-revalidate` | Declara los iconos y los colores con los que se **instala** la aplicación, y el navegador solo lo mira en ese momento. Antes caía en la política por defecto, que no está declarada en ninguna parte |
| `/api/` | `no-store` | Nunca se guarda una respuesta del servidor |

El código llevaba `max-age=3600` y costó caro: un equipo con la página abierta
usaba su copia una hora **sin preguntar al servidor**, así que un despliegue
tardaba hasta sesenta minutos en llegarle. Peor, anulaba la estrategia del service
worker sin que se notara: `sw.js` pide el código por red primero, pero su `fetch`
respeta la caché del navegador.

> `no-cache` **no** significa "no guardar": significa guardar y **preguntar** antes
> de usar. Con el ETag que ya pone la plataforma, esa pregunta se contesta con un
> `304` vacío cuando nada cambió.

**`vercel.json` no admite comentarios ni propiedades inventadas.** Valida contra su
`$schema`, y una clave de más hace que la plataforma **ignore el archivo entero**:
el despliegue se completa, el sitio sigue vivo con la configuración anterior, y no
hay ningún error visible. Si cambias una cabecera y no la ves aplicada, comprueba
eso antes que nada:

```bash
curl -sI https://<el-sitio>/src/main.js | grep -i cache-control
```

### Diagnóstico

**Antes que nada, mira la barra de direcciones.** Es la comprobación más barata y
la que más veces acierta cuando alguien dice *"cambié la clave y al siguiente
despliegue ya no estaba"* o *"lo que guardé ha desaparecido"*. Cada despliegue de
Vercel tiene su **propia dirección única** (`zahavi-recetario-<algo>.vercel.app`),
que es la que abre el botón *Visit*. Para el navegador esa dirección es **otro
sitio distinto**: otra clave, otra sesión, otros cambios sin publicar. Se trabaja
**siempre desde la dirección de producción**.

**Lo segundo, sin abrir nada técnico**: el propio recetario lo dice en
**Ajustes → Conexión**, en cuatro líneas.

| Respuesta de `/api/recipes` | Significado |
|---|---|
| `200` con las recetas | Funciona |
| `500` "no tiene configurado el acceso al repositorio" | Faltan `GITHUB_TOKEN` o `GITHUB_REPO` |
| `500` "no tiene configurada la clave de edición" | Falta `EDIT_PASSWORD` |
| `502` "el repositorio rechazó la lectura" | El token no tiene permiso de Contents, o `GITHUB_REPO` mal escrito |
| `404` con `{"error": …}` | `GITHUB_BRANCH` no coincide con la rama real. Que traiga mensaje propio lo distingue del 404 de un sitio sin la función |
| `403` "Vercel Security Checkpoint" | Firewall de Vercel interceptando: revisa **Firewall → Attack Challenge Mode** |

**Si los despliegues automáticos no se disparan** y GitHub muestra *"Git author …
must have access to the project on Vercel"*: la cuenta que firma los commits no es
miembro del equipo de Vercel. Se resuelve invitándola en **Team Settings → Members**
o alineando `git config user.email` con la cuenta que sí tiene acceso.

### Servidor local

```bash
npm run servidor
```

Sirve en el puerto 8000 con **las cabeceras que aplica Vercel**, leídas del propio
`vercel.json`. Un servidor de desarrollo más permisivo esconde justo los fallos que
solo aparecen publicados. Los módulos ES necesitan servirse por HTTP: abrir
`index.html` con doble clic no funciona.

---


---

# Recuperación: cuando algo sale mal de verdad
### Alguien publicó un recetario equivocado

Es el caso más probable de los graves. **No se ha perdido nada**: cada publicación
es un commit sobre `data/recipes.json`.

1. En GitHub, abre `data/recipes.json` → **History**. Cada entrada es una
   publicación, con su fecha.
2. Abre la versión buena → **Raw** → copia todo.
3. Vuelve a `data/recipes.json`, edita, borra todo, pega la versión buena, confirma.
4. Vercel despliega solo. En el siguiente arranque, las dos sedes ven la versión
   restaurada.

Tarda unos tres minutos. Antes de darlo por bueno, ejecuta `npm run verificar` en
local sobre esa versión.

**Ojo con los equipos que tengan cambios sin publicar.** Al recargar verán el aviso
rojo de conflicto y deberán decidir en Ajustes qué conservar. No publiques desde un
equipo con cambios pendientes hasta resolver eso, o volverías a pisar la
restauración.

### El token de GitHub caducó o fue revocado

Síntoma: "Responde con error" en Ajustes → Conexión. El recetario **sigue
funcionando para consultar**; lo que se detiene es la publicación. Genera un token
nuevo con **Contents: Read and write**, reemplázalo en Vercel y **vuelve a
desplegar**. Mientras tanto nadie pierde trabajo: lo guardado espera en cada equipo.

### Un equipo no arranca

Que la persona pulse **"Borrar la copia guardada y recargar"** en la pantalla de
fallo. Ese botón borra la copia del programa, **no las recetas**. Si la pantalla de
fallo no llega a aparecer, el mismo efecto se consigue borrando los datos del sitio
desde el navegador, con una advertencia: **eso sí borra los cambios sin publicar de
ese equipo**. Pregunta antes si los hay.

### El día que los datos vivan en la base de datos, esto cambia

Conviene dejarlo escrito ahora y no el día del susto, porque **todo lo de arriba
depende de que cada publicación sea un commit**, y eso deja de ser cierto:

| Hoy | Con la base de datos |
|---|---|
| Restaurar es copiar una versión anterior de `data/recipes.json` desde el historial de GitHub | Restaurar es volver a un volcado. **En el plan gratuito no hay ninguno hecho por el proveedor**, así que se restaura del `pg_dump` propio y se pierde todo lo posterior a él. Con plan de pago hay copias diarias, y el PITR —un complemento de unos 100 USD al mes— baja la pérdida a minutos |
| El historial de git dice qué cambió y cuándo, pero **no quién**: el autor lo declara el navegador | La tabla `auditoria` guarda el actor de verdad, sacado del token, y nadie puede fabricar una fila porque no hay política de `insert` |
| Un equipo con cambios sin publicar puede pisar la restauración al publicar | No hay «publicar»: cada escritura va a su fila. El conflicto desaparece con el archivo único |

Lo que **no** cambia es la regla: antes de dar por buena una restauración, se
ejecuta la verificación en local sobre esa versión. Y se añade una más, porque
la de hoy no la cubre: `npm run probar-sql` contra el esquema restaurado.

**Las recetas seguirán, además, en git.** No por indecisión: es la copia de
seguridad que no depende del proveedor de base de datos, y es lo único que el
obrador necesita a las cinco de la mañana sin cobertura.

### Hay que dejar el recetario en manos de otro proveedor

Todo lo necesario está en el repositorio y no hay nada más: las 122 fórmulas en
JSON legible, el programa entero sin compilar ni ofuscar, y esta documentación. No
hay base de datos que exportar ni servicios de terceros que traspasar más allá de
la cuenta de Vercel y el repositorio de GitHub. Clonar y declarar las cuatro
variables reconstruye el sistema completo.

---

