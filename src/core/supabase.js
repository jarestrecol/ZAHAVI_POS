/**
 * =============================================================================
 *  PROYECTO DE SUPABASE
 * =============================================================================
 *
 *  La direccion del proyecto y su clave PUBLICABLE. Las dos son publicas por
 *  diseño: viajan al navegador de todo el que abre la aplicacion, y lo que
 *  protege los datos no es esconderlas sino la seguridad por filas de
 *  `db/migraciones/`. La clave secreta (`service_role` / `sb_secret_`) NO entra
 *  nunca aqui ni en ningun archivo de `src/`: se salta toda esa seguridad.
 *
 *  POR QUE CONSTANTES Y NO `import.meta.env`
 *  ----------------------------------------
 *  La aplicacion se sirve SIN empaquetar en desarrollo, en las pruebas y desde
 *  el disco (`index.html` carga `./src/main.js` directamente). `import.meta.env`
 *  solo existe cuando Vite compila, asi que leer la configuracion de ahi dejaria
 *  la aplicacion sin servidor en todos esos modos.
 *
 *  La misma direccion esta en la politica de seguridad de contenido, en
 *  `index.html` y en `vercel.json`: si cambia el proyecto, cambian los tres.
 */

export const SUPABASE_URL = 'https://xjcdeczfyghanrccgsxu.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_EzH07dbzg9cIixtLU3VN0g_quI_XqU3';

/**
 * Dominio del correo tecnico de cada cuenta.
 *
 * Supabase Auth exige un correo; el POS no. Cada cuenta lleva uno interno que
 * nadie escribe ni recibe: `lower(codigo_usuario)@usuarios.zahavi.internal`.
 * Es un contrato con la base de datos (ver `db/migraciones/0007`): cambiar un
 * codigo de usuario obliga a cambiar tambien este correo.
 */
export const DOMINIO_CORREO_INTERNO = 'usuarios.zahavi.internal';
