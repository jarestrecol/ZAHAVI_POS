# Límites conocidos y hoja de ruta

> Parte de la documentación de [Zahavi · Recetario](../README.md).

## Limitaciones conocidas

Documentadas de forma explícita para que las decisiones futuras se tomen con
información completa.

| Limitación | Impacto | Cuándo actuar |
|---|---|---|
| El contenido es visible para quien tenga el enlace | La clave de usuario no protege el contenido | Si las fórmulas pasan a considerarse secreto industrial |
| La API de contenidos de GitHub deja de entregar el archivo a partir de 1 MB | Hoy son 230 KB | Antes de llenar los 121 métodos de preparación |
| El almacenamiento del navegador ronda los 5 MB | Suficiente para texto, no para imágenes | Si se añaden fotografías de producto |
| La clave es una sola para todo el equipo | No se sabe quién entró, solo que alguien con la clave lo hizo | Si hiciera falta trazabilidad por persona |
| Los ingredientes se referencian por nombre, no por código | Un cambio de nombre no propaga | Antes del costeo (Fase 2) |
| Borrar los datos de navegación borra los cambios sin publicar | Lo ya publicado se recupera al recargar. La publicación automática reduce mucho la ventana, pero no la cierra: hasta la primera publicación manual de cada sesión, lo guardado sigue solo en el equipo | Formar al equipo: publicar una vez al empezar la jornada |
| La clave de edición vive solo en la sesión del navegador | La primera publicación de cada sesión es manual | Es deliberado: guardarla en el disco dejaría la llave del repositorio en un equipo del mostrador |
| Ninguna de las 121 recetas tiene método escrito | El campo existe y está vacío en origen | Trabajo de contenido, no técnico |
| 34 de las 121 no declaran rendimiento legible | Para esas solo se ofrece el multiplicador, no "quiero 24 unidades" | Se puede completar desde el editor, receta a receta |
| En 15 de ellas el rendimiento está escrito **dentro** del nombre pero no al final | El separador no lo encuentra: `TORTA ... X 1 UND ( SIN AZUCAR )` | El editor avisa al abrirlas para que no quede duplicado |
| 14 recetas comparten nombre base con otra | Se distinguen solo por el rendimiento, que ahora se muestra al lado en todas las listas | Al normalizar nombres, si alguna vez se hace |

### Incidencias detectadas en los datos, no corregidas

Se reportan y **no se tocan**, porque corregir una fórmula es una decisión del
negocio, no de quien migró los datos. La segunda sigue siendo visible desde el
**Ingredientes**, que marca la leche como medida en tres unidades
distintas. La primera se detectó al migrar y se documenta aquí:

- `SACHER TORTE x 8` lleva `CHOCOLATE 70%: 10008 GR`. Las variantes escalan
  exactas (126 → 630 → 756), así que el valor esperado sería `1008`. Son nueve
  kilos de chocolate de diferencia, y es un cero de más al teclear.
- `BERLINAS` mide la leche en `MG` (miligramos). Es la **única línea en MG de
  las 1.282**; 160 mg son 0,16 gramos, imposible para 18 berlinas. Casi con
  seguridad debería ser `ML`.

El primero es también el mejor argumento de por qué existe el escalado: esa
variante solo se escribió a mano porque no había forma de multiplicar la tanda,
y en la copia se coló el error.

---

## Hoja de ruta

| Fase | Alcance | Estado |
|---|---|---|
| **1** | Consulta, edición y publicación de fórmulas | **En producción** |
| **1.5** | Escalado de tandas, plan del día y catálogo de ingredientes | **En producción** |
| **2** | Costeo por receta y margen | Requiere precios por ingrediente y normalizar por código |
| **3** | Inventario y órdenes de producción | Requiere base de datos real |
| **4** | Control integral del restaurante | — |

El salto a la Fase 2 es el punto donde conviene revisar la decisión de almacenar
en un archivo: el costeo introduce precios que cambian a diario, y ese patrón de
escritura sí justifica una base de datos.

### La señal que hay que vigilar

El techo real no es el número de recetas, es el **tamaño del archivo**: la API de
contenidos de GitHub deja de entregarlo a partir de 1 MB. Hoy son 225 KB.

- Llenar los 121 métodos de preparación lo deja entre 330 y 470 KB. **No revienta
  el límite**, al contrario de lo que este documento suponía antes.
- Con la forma actual y métodos escritos, el techo llega hacia las 300 recetas.
- Lo que sí lo revienta es el **histórico de precios** de la Fase 2: 159
  ingredientes con captura diaria llegan a 1 MB en unos dos meses.

**Umbral de acción: 700 KB.** A partir de ahí quedan semanas de margen, y es el
momento de la base de datos, no antes. Conviene además que la respuesta de
publicación devuelva el tamaño resultante, para que Ajustes pueda mostrarlo: el
tamaño de un archivo en un repositorio no lo mira nadie por su cuenta.

### Tres trabajos que conviene hacer antes de la Fase 2

El primero ya está hecho; los otros dos son decisiones que no se pueden tomar
desde el código.

Salieron de la revisión de arquitectura y son baratos hoy, caros después:

1. ~~**Indexar el desglose del plan por `id` y no por nombre** (`core/plan.js`).~~
   **Hecho.** No era un riesgo futuro: el editor no impide repetir un nombre, así
   que ya se podía provocar. Con dos recetas llamadas igual en el plan, el total
   salía bien pero el desglose decía "de 1 receta" y atribuía a una sola lo que
   ponían dos, que es justo lo que el desglose existe para evitar. Ahora la clave
   es el `id` y cada aporte lleva su nombre para pintarlo.
2. **Decidir dónde viven los costes antes de que existan.** El recetario se
   entrega hoy sin control de lectura, y es una decisión consciente. Los costes de
   proveedor y los márgenes no admiten el mismo trato: o van a otro sitio con
   lectura autenticada, o el servidor devuelve solo agregados. Migrar eso después
   de haberlo publicado es mucho más caro que decidirlo antes.
3. **Credenciales por persona para publicar.** La clave única compartida es
   tolerable con dos sedes; con más gente, cada baja obliga a rotarla para todos,
   y el autor del commit lo declara hoy el navegador sin que el servidor lo
   compruebe. Con costes de por medio, saber quién cambió un margen deja de ser
   opcional.

### Migrar el rendimiento a un campo propio

Si alguna vez se decide, el orden importa y no admite atajos, porque **los dos
esquemas reconstruyen la receta con una lista blanca de campos**: un campo nuevo
lo descarta en silencio cualquier equipo que aún tenga el código antiguo en
caché, y basta con que ese equipo publique una vez para borrarlo de las 121.

1. Que ambos esquemas (`core/schema.js` y `api/_schema.js`) acepten el campo.
2. Desplegar y **subir la versión de caché del service worker**.
3. Confirmar que las dos sedes han cargado el código nuevo.
4. Solo entonces migrar los datos, en un commit propio y con aprobación
   explícita, porque cambia el sha del archivo auditado.

Antes de todo eso hay que arreglar las cuatro vistas que muestran únicamente el
nombre base, o cuatro recetas pasarían a llamarse igual.

Antes de entrar en la Fase 2 hay dos trabajos que no son de software:

1. **Escribir los métodos.** Las 121 recetas tienen el campo vacío. Sin ellos, el
   sistema entrega cantidades pero no consistencia.
2. **Reunir los precios.** Son 159 ingredientes, de los cuales 64 se usan en una
   sola receta: mantener esa lista tiene un costo operativo que conviene medir
   antes de comprometerse. El catálogo de ingredientes da hoy esas cifras.
3. **Unificar las unidades de 15 ingredientes** que hoy se miden de dos o tres
   formas distintas (la leche llega a tener tres). Sin eso no se les puede
   asignar un precio único.

---

