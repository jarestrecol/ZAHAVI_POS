# ZAHAVI POS · De recetario a sistema: almacén, producción y gerencia

**Fecha**: 12 de septiembre de 2026
**Estado**: aprobado, sin implementar
**Decide**: el propietario del proyecto. Lo marcado como *decidido* no se
reabre sin que él lo diga.

---

## 1. Qué se está construyendo, y qué no

El recetario deja de ser el sistema y pasa a ser su primer módulo. El flujo que
hay que cerrar es uno solo, y todo lo demás existe para sostenerlo:

```
Recetas ya cargadas  →  Plan del día  →  Descuento del almacén
                                         (materia prima Y dinero)
                                              ↓
                                    Producción contabilizada
                                              ↓
                                    Gerencia lo ve, en tiempo real
```

**Lo que NO se hace**: reescribir los 55 módulos que hoy están en producción.
Escalar no es rehacer. El recetario, el plan y las pantallas actuales están
medidos, probados y funcionando; lo nuevo se construye al lado y lo viejo se
migra solo cuando estorbe. Un sistema a medio reescribir es peor que los dos por
separado.

---

## 2. Decisiones tomadas

Todas son del propietario, y cambian restricciones que el proyecto defendía. Se
anotan con su motivo para que nadie las "corrija" más adelante.

| # | Decisión | Qué sustituye |
|---|---|---|
| D1 | **Se permiten dependencias en tiempo de ejecución** | La regla de cero dependencias se escribió para un recetario que debía sobrevivir cinco años sin mantenimiento. Un POS con usuarios y roles sí tiene quien lo mantenga. **Sustituto exigible**: pocas dependencias, aburridas, con versión fijada, y un bloque de CI que falle si una queda con vulnerabilidad conocida |
| D2 | **Se añade compilación (Vite), y el JavaScript plano se queda** | Sin framework. Lo nuevo se escribe con las herramientas nuevas; lo existente no se toca |
| D3 | **Sin señal, el apunte se encola y sube solo** | Un apunte es un hecho —la harina se usó—; negarse a registrarlo por falta de red sería perder el dato |
| D4 | **El consumo se registra al descontar la producción** | Es lo único que da varianza real contra la fórmula y una rotación que no es estimación |
| D5 | **Orden de las preguntas de gerencia**: 1º cuánto cuesta producir · 2º qué comprar y cuándo · 3º dónde se está yendo · 4º cuánto hay parado | El tablero se construye en ese orden |
| D6 | **Nada de Edge Functions ni capa de tiempo real** | Se mantiene. Es lo único que ataría de verdad a Supabase |

### Lo que NO cambia

- **La seguridad vive en la base, nunca en la pantalla.** Ocultar una columna en
  la interfaz no la oculta: viaja igual por la red.
- **El dinero se enmascara en vistas `security definer`**, y toda vista nueva
  filtra con `es_mi_sede()` o `es_al_menos()`. `verificar-sql.mjs` falla si no.
- **La `service_role` no entra jamás en el navegador.**
- **Las unidades nunca se convierten solas.** Sin conversión aprobada, la línea
  sale sin precio y se dice en pantalla.
- **El libro de movimientos es inmutable.** Corregir es un apunte al revés.

---

## 3. Hallazgo que reordena el trabajo

**El costo real de una producción no necesita la tabla de precios.** Sale de los
lotes que se gastaron (`costo_compra / peso_compra`, columna generada). Los 159
precios sin reunir solo bloquean el costo **teórico**, y ese se aproxima con el
último precio de compra hasta que existan los de verdad.

Consecuencia: **la prioridad número 1 no está bloqueada por el trabajo de datos**,
como parecía. Se puede entregar en cuanto el descuento escriba a la base.

---

## 4. Subproyecto 0 · Cimientos

### 4.1 Compilación

- `vite.config.js`; `npm run dev` para trabajar, `npm run build` a `dist/`.
- En Vercel: preset **Vite**, build `npm run build`, output `dist`. Las cabeceras
  de `vercel.json` no cambian.
- `package.json` conserva `"type": "module"`.

**La trampa del service worker.** Hoy `sw.js` precarga una lista de rutas escrita
a mano, y el empaquetador les pone un hash al nombre. Sin resolverlo, el obrador
pierde el funcionamiento sin conexión y nadie se entera hasta que falla la red.

> **La lista se genera del manifiesto del build**, no se escribe. Así la
> comprobación que ya existe —carcasa contra archivos reales, en los dos
> sentidos— sigue valiendo en lugar de morir en el cambio.

### 4.2 Dependencias

| Paquete | Versión | Para qué |
|---|---|---|
| `@supabase/supabase-js` | `2.116.0` | Base de datos y sesión. Es PostgREST y GoTrue por debajo; no ata |
| `chart.js` | `4.5.1` | Gráficos del tablero. Ligera, sobre lienzo, suficiente para series de tiempo en tableta |
| `vite` *(desarrollo)* | `8.3.0` | Compilación |

Nada más. Sin framework, sin librería de estado, sin librería de fechas: `Intl`
formatea en español. **Cada versión fijada.**

### 4.3 Seguridad

- La clave publicable va en el navegador; es pública por diseño.
- `connect-src` se abre **solo** al proyecto de Supabase, **en los dos sitios**:
  la cabecera de `vercel.json` y el `<meta>` de `index.html`. Olvidar uno engaña:
  el navegador bloquea la petición antes de que salga y parece que el servidor no
  responde.
- Dominio propio en Vercel.
- Toda escritura envía `Prefer: return=minimal`: las columnas con dinero no
  conceden lectura, y si PostgREST intenta devolver la fila escrita falla con lo
  que parece un error de permisos aunque la escritura haya ido bien.

### 4.4 Archivos

```
vite.config.js                   nuevo
scripts/generar-shell.mjs        nuevo · la lista del sw desde el manifiesto
src/core/supabase.js             nuevo · transporte. No sabe qué es una receta
src/core/sesion.js               nuevo · entrar, refrescar, salir
sw.js                            modificado · SHELL generado
vercel.json · index.html         modificados · connect-src
package.json                     modificado · dependencias y scripts
```

`src/core/supabase.js` devuelve el contrato de siempre —`{ok, value}` /
`{ok, code, message}`— y traduce los códigos de PostgREST al entrar, igual que
`core/remote.js` ya hace con la API de recetas.

---

## 5. Subproyecto 1 · Identidad y roles

### 5.1 El problema, y la salida

**Crear usuarios desde el navegador exige la clave que se salta toda la
seguridad**, y esa no puede viajar al cliente. Tampoco se resuelve con una Edge
Function, porque D6 las descarta.

> El gerente crea una **invitación** (rol, sede, caducidad, un solo uso). La
> persona se registra con ese código, y el disparador `crear_perfil_al_registrarse`
> que ya existe en `0001` le crea el perfil con su rol y su sede.

Todo en SQL. Migración nueva `0007_invitaciones.sql`.

### 5.2 Roles

| Nombre para el equipo | Rol en la base | Ve |
|---|---|---|
| Operario básico | `operario` | Solo el recetario |
| Administrador | `obrador` | Recetario, plan del día, almacén general |
| Gerente | `gerencia` | Todo, más usuarios y tableros |
| Técnico | `admin` | Además, lo técnico |

La jerarquía `operario < obrador < gerencia < admin` ya existe y **el orden es**
la jerarquía: `es_al_menos()` se apoya en él.

### 5.3 A un usuario no se le borra

Quien ha firmado movimientos y filas de auditoría no puede desaparecer, o el
histórico deja de cuadrar. **«Eliminar» es `perfiles.activo = false`**, y deja de
poder entrar. Las políticas comprueban `activo`.

### 5.4 Qué pasa con la clave de acceso de hoy

Convive durante la transición y **se retira al terminar el subproyecto 2**. Es una
cortina compartida; la sustituye identidad por persona, que es lo que el almacén
necesita para saber quién descuenta y quién ve dinero.

---

## 6. Subproyecto 2 · Almacén profesional

### 6.1 Migración del almacén local

Cada aparato tiene su propio almacén en `localStorage` y las dos sedes no se ven.
Importación **guiada, una sola vez por aparato**, asignando sede, con vista previa
de lo que va a entrar y sin borrar el local hasta confirmar.

### 6.2 Lo que ya está y no hay que rediseñar

- `lotes` guarda proveedor, presentación, peso, costo, vencimiento y sede, con
  `valor_unitario` como columna generada.
- `precios` tiene vigencia **sin solapes**, garantizada por la base.
- `movimientos` es el libro inmutable; la existencia es su suma.

### 6.3 Vistas nuevas · `0008_vistas_almacen.sql`

| Vista | Contesta |
|---|---|
| `almacen_periodo` | Cómo se comportó el almacén por día, semana, mes y año |
| `variacion_precios` | Cuánto cambió el precio de cada ingrediente de un periodo al siguiente, y con qué proveedor |
| `compras_por_proveedor` | Qué se le compró a quién, cuánto y a qué precio |
| `inversion_almacen` | Cuánto dinero hay parado hoy, por ingrediente y por sede |

Todas filtran por sede o por rol. Sin excepción.

---

## 7. Subproyecto 3 · Plan del día → descuento real

### 7.1 Una escritura que son tres

Descontar toca `producciones`, `produccion_consumos` y `movimientos`, y a medio
camino el libro queda inconsistente. PostgREST no da transacciones al cliente.

> **`registrar_produccion(...)`**, función `security definer` en
> `0009_registrar_produccion.sql`: escribe las tres de golpe, aplica FEFO,
> **excluye lo vencido** y congela el costo del consumo.

### 7.2 La cola sin señal

Como `app/sync.js` hace con las recetas. Con una precaución que en un libro
contable no es opcional:

> **Cada apunte lleva un identificador generado en el cliente.** Un reintento con
> el mismo identificador no descuenta dos veces. Sin esto, una red intermitente
> corrompe la existencia en silencio.

### 7.3 Existencia en negativo

Si dos sedes descuentan a la vez, la existencia puede quedar negativa. **El apunte
entra igual y se marca el descuadre**: la harina se usó. Lo resuelve un conteo.

### 7.4 Conteo físico · `0010_conteos.sql`

`conteos` (sesión: fecha, sede, quién) y `conteo_lineas` (lote, contado). Al
cerrar el conteo se generan los movimientos de `ajuste` con su motivo, que es lo
único que puede corregir el libro. La diferencia contra lo que el libro decía es
**merma no declarada**, y se valora en dinero.

---

## 8. Subproyecto 4 · Tablero de gerencia

Módulo nuevo `#/gerencia`, **cerrado por rol en la base y no en la pantalla**.
Diario, semanal, mensual y anual. Las vistas, en el orden de D5:

| Prioridad | Vista | Contesta |
|---|---|---|
| 1 | `produccion_varianza` | Qué costó cada tanda y cuánto se desvió de lo que la fórmula decía. **Es donde se ve si una tanda se pasó de harina** |
| 2 | `cobertura_ingredientes` | Cuántos días dura lo que hay al ritmo real, punto de pedido, y qué vence pronto |
| 3 | `merma_valorada` · `descuadres` | Dónde se está yendo, en dinero, y quién registró qué |
| 4 | `rotacion_ingredientes` | Qué rota y qué lleva meses sin moverse |

Las pantallas nuevas heredan lo ya pagado en móvil: sin rebote de scroll, sin
desplazamiento lateral, pie a la vista, objetivos táctiles de 44 px.
`tests/movil-ajuste.spec.js` se extiende a ellas.

---

## 9. Verificación

Se conservan los 17 bloques y se añaden:

| Comprobación | Falla si |
|---|---|
| Presupuesto de dependencias | Alguna dependencia queda con vulnerabilidad conocida o sin versión fijada |
| `service_role` fuera del cliente | Aparece esa cadena en `src/` |
| Carcasa generada | El `SHELL` de `sw.js` no corresponde al manifiesto del build |
| Fronteras SQL | Una vista nueva no filtra por sede o rol *(ya existe, cubre lo nuevo)* |
| Idempotencia de la cola | Un apunte reintentado descuenta dos veces |

`probar-sql.mjs` cubre las migraciones nuevas **sin tocarlo**: lee la carpeta.

Y el estándar del proyecto se mantiene: **una comprobación nueva no se da por
buena hasta haberla visto fallar** adulterando a propósito lo que vigila.

---

## 10. Consecuencias documentales

Esto vuelve falsas frases del `CLAUDE.md` recién reescrito. **Se corrigen en el
mismo cambio**, y el bloque `Documentacion` lo va a exigir:

- §1 «sin una sola dependencia en tiempo de ejecución» y «sin compilación».
- §3, decisiones cerradas: «un empaquetador… existió y se retiró».
- `docs/operacion.md`: «Build / Output / Install Command, los tres vacíos».
- §2: la fila de bloques de `verificar` sube con cada comprobación nueva.

---

## 11. Riesgos, dichos antes de empezar

| Riesgo | Confianza | Mitigación |
|---|---|---|
| El service worker deja de precargar bien y nadie lo nota hasta que falla la red | **Alta** — es el cambio más traicionero del subproyecto 0 | La lista se genera, y la comprobación de los dos sentidos se mantiene |
| La cola duplica apuntes con red intermitente | **Alta** si no se hace | Identificador por apunte, y una prueba que reintente a propósito |
| El equipo no cierra la producción cada día, y la varianza queda vacía | **Media** | El conteo físico da la red por debajo; el menú avisa si hay producciones sin cerrar |
| Los 159 precios no se reúnen y el costo teórico queda incompleto | **Media** | Se aproxima con el último precio de compra, y la pantalla dice que es aproximación |
| Migrar identidad rompe el acceso del obrador a las cinco de la mañana | **Media** | La clave de acceso convive hasta terminar el subproyecto 2 |

## 12. Fuera de alcance

- Reescribir los módulos existentes.
- Edge Functions y capa de tiempo real (D6).
- Facturación, clientes y punto de venta al público: eso es la fase 4.
- Resolver los 16 ingredientes con dos unidades: lo decide la panadería.
