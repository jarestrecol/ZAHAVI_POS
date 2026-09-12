# Límites conocidos y hoja de ruta

Referencia. Lo único de aquí que sube al núcleo es «lo que se decidió NO hacer»,
porque son propuestas que vuelven solas. El resto se consulta al planificar, no
al programar.

### Limitaciones

| Limitación | Impacto | Cuándo actuar |
|---|---|---|
| El contenido es visible para quien tenga el enlace | La clave de acceso no protege el contenido | Si las fórmulas pasan a ser secreto industrial |
| La API de contenidos de GitHub corta a 1 MB | Hoy son 227 KB | La verificación avisa a los 700 KB |
| El almacenamiento del navegador ronda los 5 MB | Suficiente para texto, no para imágenes | Si se añaden fotografías de producto |
| Una sola clave para todo el equipo | No se sabe quién entró | Si hiciera falta trazabilidad por persona |
| Los ingredientes se referencian por nombre, no por código | Un cambio de nombre no propaga | Antes del costeo (Fase 2) |
| Hay ingredientes que se miden de más de una forma (cifra en la [sección 12](#12-datos-verificados)) | Sin unidad única no se les puede poner precio | **La pantalla de Ingredientes ya dice en qué recetas se mide de cada forma.** Queda decidir cada caso |
| Borrar los datos de navegación borra los cambios sin publicar | Lo publicado se recupera al recargar. La publicación automática reduce la ventana pero no la cierra | Formar al equipo: publicar al empezar la jornada |
| La clave de edición vive solo en la sesión | La primera publicación de cada sesión es manual | Deliberado: guardarla en disco dejaría la llave del repositorio en el mostrador |
| Ninguna de las 122 recetas tiene método escrito | El campo existe y está vacío en origen | Trabajo de contenido, no técnico |
| 34 de las 122 no declaran rendimiento legible | Para esas solo se ofrece el multiplicador | Se puede completar desde el editor |
| En 15 el rendimiento está **dentro** del nombre pero no al final | El separador no lo encuentra | El editor avisa al abrirlas |
| 14 recetas comparten nombre base | Se distinguen solo por el rendimiento | Al normalizar nombres, si se hace |
| **El almacén no se comparte entre sedes** | Lo que registra el obrador no lo ve la casa de producción | Es deliberado: los precios no pueden salir por el mismo camino público que las recetas. Cuando haga falta, `dataset` en la API con lectura autenticada |
| El dictado por voz necesita conexión | Sin señal solo queda el teclado | Deliberado: el reconocimiento lo hace un servicio externo del navegador |

### Incidencias en los datos, reportadas y NO corregidas

Corregir una fórmula es una decisión del negocio, no de quien migró los datos.

- `SACHER TORTE x 8` lleva `CHOCOLATE 70%: 10008 GR`. Las variantes escalan exactas
  (126 → 630 → 756), así que lo esperable sería `1008`. Son nueve kilos de
  diferencia: un cero de más al teclear. Es también el mejor argumento de por qué
  existe el escalado, porque esa variante se escribió a mano.
- `BERLINAS` mide la leche en `MG`. Es la **única línea en MG de las 1.293**;
  160 mg son 0,16 g, imposible para 18 berlinas. Casi con seguridad debería ser
  `ML`. Visible desde la pantalla de Ingredientes.

### Fases

| Fase | Alcance | Estado |
|---|---|---|
| **1** | Consulta, edición y publicación de fórmulas | **En producción** |
| **1.5** | Escalado de tandas, plan del día y catálogo de ingredientes | **En producción** |
| **2** | Almacén, costo de la producción del día y descuento de existencias | **En producción, local por aparato** |
| 2.5 | Costeo por receta y margen | Requiere los precios reunidos y las unidades unificadas |
| 3 | Base de datos relacional, roles e histórico | **Esquema aplicado en Supabase** (`db/`, 6 migraciones). Falta conectar la aplicación: CSP, cliente y migración de los datos |
| 3.5 | Inventario y órdenes de producción | Encima de la Fase 3 |
| 4 | Control integral del restaurante | Por definir |

### La señal que hay que vigilar

El techo no es el número de recetas: es el **tamaño del archivo**.

- Llenar los 122 métodos lo deja entre 330 y 470 KB. **No revienta el límite.**
- Con la forma actual y métodos escritos, el techo llega hacia las 300 recetas.
- Lo que sí lo revienta es el **histórico de precios** de la Fase 2: 159
  ingredientes con captura diaria llegan a 1 MB en unos dos meses.

### El cerrojo de edición

**Decidido y pendiente de implementar.** Estuvo etiquetado como «v1.5.2» y esa
versión ya pasó sin él: sigue pendiente, sin fecha. Hoy el sistema usa concurrencia
optimista: dos personas pueden editar a la vez y el choque se detecta **al
publicar**, por el `sha`, con aviso en rojo. Nadie pierde trabajo en silencio,
pero el segundo se entera tarde.

Lo acordado es un cerrojo: quien llega segundo **espera**, y se le dice que está
ocupado.

| Decisión | Valor |
|---|---|
| Dónde vive | `data/lock.json` en el repositorio, archivo aparte |
| Por qué ahí | No añade servicios: sigue siendo GitHub + Vercel. El historial de `data/recipes.json` no se ensucia porque el cerrojo va en otro archivo |
| Coste asumido | Tomar y soltar el cerrojo son dos commits, y añade 1-2 s al abrir el editor |
| Forma | `{ dispositivo, nombre, desde, expira }` |
| Caducidad | **Obligatoria.** Sin ella, un editor abierto y olvidado deja el recetario bloqueado para siempre. Se renueva mientras se edita |
| Cuándo se toma | Al abrir el editor, en la misma llamada que ya comprueba la clave (`verificar: true`) |
| Cuándo se suelta | Al guardar, al cancelar, o sola al caducar |
| Respuesta si está tomado | `423`, con quién y desde cuándo, para que la pantalla diga "otro equipo está editando desde hace N minutos" |

**No sustituye al control del `sha`, lo complementa.** El cerrojo evita el choque
antes de que ocurra; el `sha` sigue siendo la red por debajo, para el caso de un
cerrojo caducado o un equipo que publique sin haberlo tomado.

### Trabajos que no decide el código

Se titulaban «antes de la Fase 2» y la Fase 2 se cerró sin ellos, así que dos
—reunir los precios y unificar las unidades— están hoy bloqueando la 2.5:

1. **Decidir dónde viven los costes antes de que existan.** El recetario se entrega
   sin control de lectura, y es consciente. Los costes de proveedor y los márgenes
   no admiten el mismo trato: o van a otro sitio con lectura autenticada, o el
   servidor devuelve solo agregados. Migrarlo después de publicarlo es mucho más
   caro.
2. **Credenciales por persona para publicar.** La clave única es tolerable con dos
   sedes; con más gente, cada baja obliga a rotarla para todos. Con costes de por
   medio, saber quién cambió un margen deja de ser opcional. Es también la vía para
   sustituir la clave cruda en `sessionStorage` por un testigo de corta vida.
3. **Escribir los métodos.** Las 122 tienen el campo vacío.
4. **Reunir los precios.** 159 ingredientes, de los cuales **63** se usan en una
   sola receta: ese coste operativo conviene medirlo antes de comprometerse.
5. **Unificar las unidades de los ingredientes** que hoy se miden de dos o tres
   formas distintas (la leche llega a tener tres). La cifra exacta está en la
   [sección 12](#12-datos-verificados) y la lista, con la unidad que el sistema
   propone para cada uno, la imprime un comando:

   ```bash
   node scripts/sembrar-recetas.mjs --informe
   ```

   Sin eso no se les puede asignar un precio único.

   **La herramienta ya está**: en Ingredientes, al desplegar uno de esos 16, las
   recetas salen agrupadas por unidad, con la minoritaria arriba y cada fila
   enlazando a su receta.

   Lo que la máquina **no** puede hacer es decidir. Hay dos casos distintos
   mezclados bajo el mismo aviso, y separarlos exige conocer la fórmula:

   | Caso | Ejemplo | Qué hacer |
   |---|---|---|
   | **Equivalencia real** | `AGUA` en GR (37 líneas) y ML (16). 1 g = 1 ml | Ninguna receta está mal: solo hay que **elegir una** para el precio |
   | **Unidad mal escrita** | `MANTEQUILLA 1050 UND`, `HARINA 3000 UND` | La receta **sí** está mal y hay que corregirla |

   Se intentó clasificarlos por magnitud y **no funciona**: marca `AGUA 2025 ML`
   como sospechosa (es legítima, una tanda de 10 panes) y deja pasar
   `MANTEQUILLA 1050 UND`. Por eso la pantalla solo muestra y no marca nada como
   error: sugerir una corrección equivocada sobre una fórmula es peor que no
   sugerir ninguna.

Y el trabajo técnico de la [sección 5](#5-cómo-añadir-un-módulo-nuevo).

### Lo que se decidió NO hacer

- **Trusted Types en la CSP**: rompería el modo sin conexión en silencio.
- **Una abstracción compartida para las listas desplegables**: dos usos de forma
  distinta es generalizar antes de tiempo.
- **La versión de un solo archivo.** Existió un empaquetador que metía todo en un
  HTML de 1 MB para llevarlo en una memoria USB. Se retiró porque duplicaba el modo
  sin conexión que ya da el service worker, costaba mantenimiento en dos sitios
  (cada módulo nuevo había que añadirlo a dos manifiestos), y el artefacto nunca se
  versionaba. Sigue en el historial de git.
- **La caducidad semanal de la clave de acceso.** No revocaba (quien la conocía se
  la renovaba a sí mismo) y no propagaba (cada aparato rotaba por su cuenta). Era un
  ritual semanal con la apariencia de un control. La sustituyó `ACCESS_GENERATION`.
- **La lista de usuarios por persona.** Se guardaba EN CADA APARATO, así que dar de
  alta a alguien en la panadería no lo daba de alta en la casa de producción. Una
  lista que nadie actualiza es peor que no tenerla: aparenta un control que no
  existe.

---

