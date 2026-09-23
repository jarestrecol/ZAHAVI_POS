# Respaldo de la base

El proyecto de Supabase está en plan gratuito: **no hay respaldos automáticos ni
vuelta atrás en el tiempo**, porque son de pago. Mientras la operación viva en la
base, perderla sería perder compras, confirmaciones y costos históricos que no
están en ningún archivo del repositorio.

Lo cubre el flujo `.github/workflows/respaldo.yml`: cada noche vuelca esquema y
datos, los cifra y guarda el archivo como artefacto del flujo, 30 días.

## Activarlo (una vez)

1. **Saca la cadena de conexión.** Botón **Connect**, arriba junto al nombre del
   proyecto (o `…/project/<ref>/settings/database`). Copia la de **Session
   pooler** y reemplaza la contraseña. Si no la recuerdas, ahí mismo se
   restablece.

   **No uses la conexión directa para GitHub.** En el plan gratuito
   `db.<ref>.supabase.co` solo responde por IPv6 y las máquinas de GitHub son
   IPv4: el respaldo fallaría cada noche. La del pooler de sesión tiene esta
   forma, con el identificador del proyecto pegado al usuario y puerto 5432:

   ```
   postgresql://postgres.<ref>:CLAVE@aws-0-<región>.pooler.supabase.com:5432/postgres
   ```

   Desde tu propio equipo sí puedes usar la directa.
2. **Inventa una contraseña de cifrado** y guárdala donde guardas las demás. Si la
   pierdes, el respaldo no se puede abrir: no hay forma de recuperarlo.
3. **Crea los dos secretos** en GitHub (`jarestrecol/ZAHAVI_POS` → *Settings →
   Secrets and variables → Actions → New repository secret*):
   - `SUPABASE_DB_URL` → la cadena del paso 1.
   - `RESPALDO_CLAVE` → la contraseña del paso 2.
4. **Pruébalo a mano:** pestaña *Actions* → «Respaldo de la base» → *Run workflow*,
   sin marcar la casilla de ensayo. Debe terminar en verde y dejar un artefacto
   `respaldo-<número>`. Si faltan secretos, se detiene y lo dice; no finge.

Efecto secundario útil: el plan gratuito duerme los proyectos inactivos, y esta
conexión diaria lo mantiene despierto.

## Ensayar la restauración (antes del corte, y de vez en cuando)

Un respaldo que nadie ha restaurado no es un respaldo, es un archivo.

1. Crea un **segundo proyecto** en Supabase (el plan gratuito permite dos), por
   ejemplo `Zahavi_Pos_Ensayo`. Debe estar vacío: el ensayo borra su esquema.
2. Guarda su cadena de conexión como secreto `SUPABASE_DB_URL_ENSAYO`.
3. *Actions* → «Respaldo de la base» → *Run workflow* → **marca la casilla de
   ensayo**.

El flujo restaura el respaldo recién hecho en esa base y compara el número de
filas de cada tabla contra la real. Si no coinciden, falla y lo dice. Antes de
tocar nada comprueba que el servidor de ensayo no sea el de producción.

## Restaurar de verdad, si algún día hace falta

1. Descarga el artefacto del día que quieras (*Actions* → esa ejecución → abajo).
2. Descífralo y ábrelo:

   ```bash
   gpg --batch --passphrase "TU_CLAVE" -d respaldo.tar.gz.gpg > respaldo.tar.gz
   tar -xzf respaldo.tar.gz
   ```

3. Cárgalo en la base destino (primero el esquema, después los datos), con la
   cadena del pooler de sesión o la directa, según desde dónde lo hagas:

   ```bash
   psql "$URL_DESTINO" -v ON_ERROR_STOP=1 -f esquema.sql
   psql "$URL_DESTINO" -v ON_ERROR_STOP=1 -f datos.sql
   ```

El archivo trae también `conteos.txt`, con cuántas filas tenía cada tabla ese día:
sirve para comprobar que la restauración quedó completa.

## Lo que este respaldo no cubre

- La configuración de autenticación del panel (registro, MFA, caducidad del
  testigo) y los usuarios de `auth`: se rehacen a mano.
- El almacenamiento de archivos, que hoy no se usa.
- Un respaldo diario deja hasta 24 horas de operación en riesgo. Si eso llega a
  ser demasiado, la respuesta es el plan Pro con vuelta atrás al minuto.
