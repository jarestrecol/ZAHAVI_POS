# Modelo de datos, en detalle

Referencia. El núcleo (`../CLAUDE.md`) lleva la forma del recetario publicado,
quién posee cada dato y el estado de Supabase. Aquí está el resto: el almacén y
por qué vive aparte, las seis migraciones, las decisiones del esquema que no se
deshacen barato, y cómo entran las recetas en él.

```js
{
  version: 2,
  revision: "2026-08-12T14:22:31.004Z",   // sello de la última publicación
  recipes: [
    {
      id: "R001",                          // código estable, nunca se reutiliza
      nombre: "TORTA DE BANANO X 2 UND",
      categoria: "PASTELERÍA",             // una de las tres canónicas
      metodo: "",                          // texto libre, saltos preservados
      componentes: [
        {
          nombre: "MASA",
          items: [
            { ingrediente: "HARINA", cantidad: 1000, unidad: "GR" }
          ]
        }
      ]
    }
  ],
  ingredientes: [                          // catálogo para autocompletado
    { nombre: "HARINA", unidad: "GR" }
  ]
}
```

### Dónde vive cada cosa

| Capa | Ubicación | Alcance |
|---|---|---|
| **Publicado** | `data/recipes.json` en el repositorio | Todas las sedes |
| **Pendiente** | `localStorage` (`zahavi_recetario_v1`) | Solo ese dispositivo |
| **Rescate** | `localStorage`, clave aparte | Copia local dañada, apartada sin sobrescribir |
| **Sesión** | `localStorage` / `sessionStorage` | Usuario activo y clave de edición de la pestaña |
| **Almacén** | `localStorage` (`zahavi_almacen_v1`) | **Solo ese dispositivo.** Ver abajo |

**No hay base de datos.** Cada publicación es un commit real: el historial de git
*es* el registro de auditoría, y cualquier versión anterior se recupera desde
GitHub.

### El almacén vive aparte, y es una decisión

```js
{
  version: 1,
  revision: "2026-09-10T14:22:31.004Z",
  lotes: [
    {
      id: "L001",                  // código estable, nunca se reutiliza
      ingrediente: "HARINA DE TRIGO",  // se escribe IGUAL que en las recetas
      marca: "TRES CASTILLOS",
      presentacion: "BULTO",       // cómo se compra
      pesoCompra: 25000,           // cuánto trae, en `unidad`
      unidad: "GR",
      costoCompra: 120000,         // lo que costó la presentación completa
      lote: "H-2291",
      vencimiento: "2026-12-31",   // ISO, o '' si no aplica
      existencia: 25000            // lo que queda ahora
    }
  ]
}
```

`valorUnitario = costoCompra / pesoCompra` **no se guarda**: se deriva al leer.
Guardarlo sería la misma cifra en dos sitios, y el día que alguien corrigiera el
costo la copia mentiría.

**Por qué NO se publica con las recetas.** Es la decisión que la
[sección 13](#13-límites-conocidos-y-hoja-de-ruta) exigía tomar *antes* de que
existieran los costes. El recetario se sirve **sin control de lectura** —y es
deliberado—, pero los precios de proveedor y los márgenes no admiten ese trato:
publicarlos por el mismo camino los haría públicos para quien tenga el enlace, y
migrarlo después es mucho más caro. Hay además una razón técnica que apunta al
mismo sitio: `api/recipes.js` tiene `FILE_PATH` constante y un `sha` global, así
que dos personas editando módulos distintos se rechazarían con un 409.

**El precio que se paga, dicho claro: el almacén de cada aparato es suyo.** Lo
que se registre en la tableta del obrador no lo ve la casa de producción. Cuando
eso deje de bastar, la salida está escrita en la
[sección 5](#5-cómo-añadir-un-módulo-nuevo): un mapa de `dataset` en la API, con
lectura autenticada **solo** para este conjunto de datos.

**Validación en dos niveles, con criterios distintos a propósito.** El cliente
repara: si una receta llega con un campo raro, la normaliza y sigue, para que el
obrador nunca se quede sin poder consultar. El servidor rechaza: si algo no cuadra,
devuelve error y no escribe, para que nunca entre basura al archivo compartido.

**Los dos esquemas reconstruyen la receta con una lista blanca de campos.** Un
campo nuevo lo descarta en silencio cualquier equipo que aún tenga el código
antiguo en caché, y basta con que ese equipo publique una vez para borrarlo de las
122. Por eso el orden de una migración de esquema no admite atajos:

1. Que ambos esquemas (`core/schema.js` y `api/_schema.js`) acepten el campo.
2. Desplegar y **subir `CACHE_VERSION`**.
3. Confirmar que las dos sedes han cargado el código nuevo.
4. Solo entonces migrar los datos, en un commit propio y con aprobación explícita,
   porque cambia el `sha` del archivo auditado.

### La base de datos relacional: aplicada en Supabase, y la aplicación todavía sin conectar

En `db/` hay un esquema PostgreSQL completo para la Fase 3, y desde el 11 de
septiembre de 2026 **está aplicado en un proyecto real de Supabase**
(`Zahavi_Pos`, PostgreSQL 17.6). Lo que sigue sin pasar es lo otro: **ninguna
línea de `src/` habla con él**. El recetario sigue leyendo `data/recipes.json` y
el almacén sigue en el `localStorage` de cada aparato.

El orden es deliberado y conviene no invertirlo: el esquema es la decisión cara
—cuando ya hay datos dentro, cambiarlo cuesta—, así que primero se escribe, se
revisa, se **ejecuta** contra un PostgreSQL de verdad y se aplica a la nube; y
solo entonces se mueve un dato.

**Lo que hace falta para conectar la aplicación, cuando toque.** Ninguna de las
tres es trabajo de esquema, y por eso están aquí y no arriba:

| Qué | Dónde | Ojo con |
|---|---|---|
| Abrir la CSP al dominio de Supabase | `vercel.json` **y** el `<meta>` de `index.html` | `connect-src` está en `'self'`. El síntoma de olvidarlo engaña: el navegador bloquea la petición **antes de salir**, así que en pantalla parece que el servidor no responde |
| La clave publicable en el código | La que empieza por `sb_publishable_` | Es pública por diseño y va en el navegador. La `service_role` **no entra nunca**: es el rol que se salta la seguridad por filas entera |
| Un `pg_dump` periódico guardado fuera | Fuera de Supabase | En el plan gratuito no hay copia que restaurar. Ver el apartado de Supabase más abajo |

**Qué obligó a dar el paso, y no fue el tamaño.** Fue que el almacén introdujo
cuatro cosas que un archivo en git no sabe hacer:

| Lo que hace falta | Por qué un archivo no llega |
|---|---|
| Integridad referencial | Un ingrediente se referencia por nombre. Renombrarlo en una receta deja un lote huérfano y nadie se entera |
| Interfaces por rol | El costo de proveedor no lo puede ver todo el obrador, y ocultarlo en la pantalla no es ocultarlo: viaja igual por la red |
| Histórico de verdad | Gasto diario, mensual, trimestral y anual, y el inventario a lo largo del tiempo. Con captura diaria de 159 precios, el archivo revienta el techo de 1 MB en unos dos meses |
| Escritura concurrente | Publicar envía el recetario **entero**. Con dos sedes ya hay una situación en la que se pisa trabajo ajeno; con bodega y producción en marcha deja de ser tolerable |

**Las seis migraciones.**

| Archivo | Qué trae |
|---|---|
| `0001_base.sql` | El tipo `rol` (`operario` < `obrador` < `gerencia` < `admin`, y ese orden **es** la jerarquía), `sedes`, `perfiles`, y las cuatro funciones sobre las que se apoya toda política: `mi_rol()`, `mi_sede()`, `es_al_menos()`, `es_mi_sede()` |
| `0002_catalogo_y_recetas.sql` | `ingredientes` con unidad base, `conversiones` que hay que **aprobar** a mano, y las recetas con el rendimiento en su columna y no dentro del nombre |
| `0003_almacen_y_produccion.sql` | `lotes`, `producciones`, `movimientos` y `precios`. El valor unitario es columna generada, y dos precios del mismo ingrediente no pueden solaparse en el tiempo (`exclude using gist`) |
| `0004_vistas.sql` | La API de lectura: existencias por lote y por ingrediente, costo de cada producción, gasto por periodo y costo teórico de una receta |
| `0005_seguridad.sql` | Revocar todo primero, seguridad por filas en las 14 tablas, políticas por rol, y la tabla de auditoría con su disparador |
| `0006_endurecer_permisos.sql` | Los tres agujeros que solo aparecieron al aplicar el esquema contra un Supabase real: el `revoke` de funciones de 0005 que no revocaba nada, cuatro funciones sin `search_path` fijo, y `btree_gist` viviendo en el esquema que PostgREST publica |

**Las cuatro decisiones que no se deshacen barato**, y por qué se tomaron así:

1. **La existencia no es una columna: es la suma del libro de movimientos.** Una
   columna de existencia hay que mantenerla sincronizada, y el día que se
   desincroniza no hay forma de saber cuál de las dos cifras miente. Por eso
   `movimientos` solo admite inserciones —un disparador rechaza `update` y
   `delete`— y una corrección es un apunte al revés, como en contabilidad.
2. **El costo de un consumo se congela al consumir.** `produccion_consumos`
   guarda su propio `costo_unitario`. Calculado con el precio de hoy, el costo
   de una producción de marzo cambiaría al corregir un precio en septiembre, y
   el informe del trimestre dejaría de cuadrar consigo mismo sin que nadie
   tocara nada.
3. **El dinero se enmascara en la base de datos, nunca en la interfaz.** Las
   vistas son `security definer` a propósito: ocultar una **columna** a quien sí
   puede ver la fila no lo puede hacer la seguridad por filas, que es por filas.
   El precio de esa decisión es que la autorización de lectura vive dentro de
   cada vista, y por eso `verificar-sql.mjs` falla si una vista nueva se olvida
   de filtrar. Ocultarlo en la pantalla no serviría: el dato viajaría igual y
   basta con mirar la respuesta.
4. **`lotes` concede la lectura por columnas, no entera.** Una fila de lote
   mezcla lo que hay que saber para trabajar —qué ingrediente, cuánto trae,
   cuándo vence— con lo que costó. Revocarla entera protegía el dinero y rompía
   la política de `movimientos`, que necesita leer la sede del lote.

**Cómo se comprueba, y por qué hacen falta las dos capas.**

```bash
npm run verificar     # incluye las fronteras del esquema. No abre ninguna conexión
npm run probar-sql    # levanta un PostgreSQL y se pone en la piel de cada rol
```

**Y hay una tercera capa que solo existe desde que hay un proyecto de verdad:
preguntarle al catálogo de PostgreSQL quién puede qué.** No es lo mismo que las
otras dos y no se puede deducir de ellas. Las dos primeras leen el SQL del
repositorio; esta mira los permisos **efectivos** que quedaron, que es donde
aparecen las concesiones que PostgreSQL hace por su cuenta y que ningún archivo
del repositorio menciona. Los tres defectos de `0006` salieron exactamente de
ahí: de `has_function_privilege('anon', ...)`, no de releer `0005`.

La segunda existe porque la primera no puede verlo todo: que una política esté
escrita y bien redactada no dice que cubra el caso que se creía. Dos ejemplos
reales, los dos aparecidos al ejecutar y ninguno al leer:

- El `insert` en `movimientos` fallaba con *permission denied for table lotes*:
  la política necesitaba la sede del lote y la lectura estaba revocada entera.
  De ahí salió el permiso por columnas.
- La prueba de «el operario no puede cambiarse el rol» estaba **mal escrita** y
  se ponía roja con la seguridad intacta. PostgreSQL es asimétrico aquí, y
  conviene tenerlo presente al escribir la siguiente: un `insert` contra el
  `with check` de una política **lanza** un error, pero un `update` cuyo `using`
  no encaja con ninguna fila **no lanza nada**, simplemente no toca ninguna
  fila. La prueba esperaba una excepción. Ahora comprueba el efecto —cero filas
  y el rol intacto—, y se verificó **en las dos direcciones**: abriendo un
  agujero a propósito para confirmar que lo caza.

### Cómo entran las 122 recetas en el esquema

`scripts/sembrar-recetas.mjs` lee `data/recipes.json` y escribe el SQL que carga
el catálogo, las recetas, sus componentes y sus 1.293 líneas.

**El SQL no se guarda en el repositorio.** Un archivo con las recetas dentro sería
una segunda copia del recetario, y el día que la panadería publique una fórmula
las dos dejarían de coincidir sin que nada avisara. Hay una sola fuente y esto es
una proyección suya que se recalcula cada vez. Lo que sí está guardado es la
comprobación: `npm run probar-sql` genera la semilla, la mete en un PostgreSQL de
verdad y corre `db/local/pruebas-recetas.sql` encima.

**Las dos decisiones que el programa toma por su cuenta**, las dos declaradas y
las dos listadas por `--informe` para que alguien las confirme:

| Decisión | Regla | Por qué es aceptable |
|---|---|---|
| **Qué unidad base lleva cada ingrediente** | La que tiene más líneas; si empatan, un orden escrito: GR, ML, UND, MG, CM | Un obrador pesa, así que ante un empate gana la masa. Hay **dos empates reales** (`CAFÉ LIQUIDO` y `AGUA ( CALIENTE )`), no es un caso hipotético |
| **La unidad del rendimiento cuando falta** | `UND` | Ocho recetas traen la cifra sin unidad (`SACHER TORTE x 5`). El esquema no admite media cosa, así que o se etiqueta o se pierde el 5. Aquí la **cifra** es el dato y la unidad es la etiqueta: no entra en ningún cálculo de dinero |

Esa segunda no es cosmética. **Cuatro de esas ocho son las `SACHER TORTE`**, que
según la [regla 6](#4-reglas-que-no-se-negocian) solo se distinguen entre sí *por*
el rendimiento: dejarlas las cuatro en nulo daría cuatro filas idénticas en
cualquier listado que muestre nombre y rendimiento.

**Y lo que el programa NO hace, que importa más: no inventa conversiones.**
Podría crear `AGUA desde ML factor 1` y acertaría; pero entonces también crearía
`HUEVOS desde GR factor ?`, y ahí no hay factor que valga hasta que alguien
decida cuántos gramos pesa un huevo. Sin fila de conversión, el costeo marca esas
líneas y lo dice, que es la [regla 24](#4-reglas-que-no-se-negocian) aplicada
donde de verdad se paga.

**Está comprobado ejecutándolo, no razonándolo.** `db/local/pruebas-recetas.sql`
pone precio al `AGUA` y comprueba que las líneas en GR se costean y las 16 en ML
salen marcadas `sin_conversion`. Y la semilla hace que **PostgreSQL vuelva a
contar** las líneas pendientes con un `join`, comparándolo con lo que contó
JavaScript recorriendo el JSON: dos implementaciones independientes de la misma
pregunta, que fallan si alguna vez discrepan.

### Supabase sí, y por qué no es una atadura

La duda era legítima y hay que dejarla contestada por escrito: no hay garantía
de que el cliente quiera quedarse, no quiere gasto continuo, y quiere ser dueño
de lo suyo sin pagar infraestructura física. Lo que hace que la respuesta sea
Supabase no es el producto: son **cuatro restricciones que se aceptan de
antemano** y que mantienen la puerta abierta.

| Restricción | Qué protege |
|---|---|
| **Todo el esquema vive en `db/migraciones/`, en SQL plano** | Lo que corre en la nube está en el repositorio. No hay nada configurado a mano en un panel que el día de la mudanza haya que redescubrir |
| **Nada de Edge Functions ni de la capa de tiempo real** | Es lo específico del producto. Sin ellas, lo que se usa es PostgreSQL, PostgREST y GoTrue, los tres de código abierto y ejecutables en cualquier sitio |
| **`db/local/emula-supabase.sql` mide la dependencia exacta** | Sesenta líneas: `auth.users`, `auth.uid()` y dos roles. Eso es **todo** lo que habría que sustituir para mudarse a otro PostgreSQL. Conviene que no crezca, y por eso el archivo existe |
| **Un `pg_dump` periódico guardado fuera** | En el plan gratuito **no hay copia de seguridad que restaurar**: las copias diarias son de los planes de pago y el PITR es un complemento aparte. La propia documentación de Supabase le dice al proyecto gratuito que exporte sus datos y los guarde fuera. Así que esto no es prudencia: es la única copia, y de paso es la prueba de que la salida funciona |

Con eso, mudarse es levantar un PostgreSQL donde sea, aplicar las cinco
migraciones, restaurar el volcado y cambiar una dirección. **Lo que ataría de
verdad es justamente lo que se ha decidido no usar.**

Y la parte incómoda, dicha entera, porque es lo que decide si el plan gratuito
sirve o no:

- **Supabase suspende los proyectos gratuitos tras siete días de poca
  actividad.** Para una panadería que cierra en vacaciones eso no es
  hipotético. Se reanuda desde el panel y hay noventa días para hacerlo, pero
  mientras está suspendido la aplicación no responde. La operación diaria lo
  mantiene despierto: eso es una suposición sobre el uso, no una garantía del
  servicio.
- **En el plan gratuito no hay copias de seguridad restaurables.** Ni diarias
  ni descargables. De ahí que el `pg_dump` de la tabla de arriba no sea
  opcional.

Las dos desaparecen con el plan de pago. Son, exactamente, lo que se está
comprando el día que se decida pagarlo.

---

