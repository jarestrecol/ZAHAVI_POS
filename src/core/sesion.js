/**
 * =============================================================================
 *  SESION DE USUARIO
 * =============================================================================
 *
 *  Cada persona entra con SU codigo de usuario y SU PIN de 6 digitos, y quien
 *  lo comprueba es Supabase Auth, no el navegador. Sustituye a la clave unica
 *  del equipo, que era una cortina: se comprobaba dentro del propio aparato y
 *  no decia quien estaba delante.
 *
 *  QUE CAMBIA RESPECTO A LA CLAVE DEL EQUIPO
 *  -----------------------------------------
 *  - Dar de baja a alguien lo deja fuera en TODOS los equipos a la vez: basta
 *    con desactivar su perfil en la base de datos. Ya no hace falta la
 *    generacion de acceso ni cambiar la clave a todo el equipo.
 *  - El rol y la sede salen de `perfiles`, asi que la base de datos sabe quien
 *    hace cada cosa y la seguridad por filas puede aplicarse de verdad.
 *  - ENTRAR PIDE CONEXION. Es el precio, y se paga una vez: la sesion se guarda
 *    en el equipo, asi que quien ya entro sigue dentro aunque se caiga la red a
 *    las cinco de la mañana. Lo que no se puede sin red es entrar con OTRO
 *    usuario, porque eso solo lo puede decidir el servidor.
 *
 *  POR QUE `fetch` Y NO LA LIBRERIA DE SUPABASE
 *  --------------------------------------------
 *  La aplicacion se sirve sin empaquetar (ver `core/supabase.js`), y un
 *  navegador no resuelve `import '@supabase/supabase-js'`. Lo que hace falta de
 *  Auth son unas pocas llamadas HTTP -entrar, renovar, salir y las tres del
 *  segundo paso: inscribir, retar y verificar- y una lectura del perfil, y el
 *  proyecto no tiene dependencias en tiempo de ejecucion.
 *
 *  LO QUE SE GUARDA EN EL EQUIPO
 *  -----------------------------
 *  El testigo de acceso, el de renovacion, cuando vence el primero, cuando
 *  empezo el turno y el perfil (nombre, codigo, rol y sede). NUNCA el PIN. El
 *  perfil guardado es lo que permite abrir sin red; con red se vuelve a leer al
 *  arrancar, para que un cambio de rol o una baja lleguen sin esperar a que la
 *  persona salga.
 *
 *  GERENCIA Y ADMINISTRACION ENTRAN EN DOS PASOS
 *  ---------------------------------------------
 *  Decision del negocio (2026-09-15). Tras el PIN piden el codigo de 6 numeros
 *  de una aplicacion autenticadora del celular; la primera vez, antes, se
 *  inscribe esa aplicacion con un codigo QR. Mientras tanto la sesion abierta
 *  con el PIN vive SOLO en memoria (`pendiente`): nunca se guarda como sesion
 *  del equipo, asi que recargar la pagina a medias obliga a empezar de nuevo.
 *  Quien lo exige de verdad es la base de datos (`0010`): sin `aal2` no hay
 *  costos, informes ni usuarios, lo diga o no esta pantalla.
 *
 *  EL TURNO DURA 6 HORAS
 *  ---------------------
 *  Contadas desde que la persona escribio su PIN, y renovar el testigo no las
 *  alarga. Se cierra TAMBIEN SIN RED: una tableta compartida no puede quedarse
 *  abierta a nombre de quien entro por la mañana. La base de datos aplica el
 *  mismo plazo con la hora de su propia sesion.
 */

import { readJson, writeJson, removeKey, ok, err } from './storage.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, DOMINIO_CORREO_INTERNO } from './supabase.js';

/** Donde vive la sesion de este equipo. */
const SESION_KEY = 'zahavi_sesion_v2';

/**
 * Forma de la sesion guardada.
 *
 * La 2 no sabia cuando empezo el turno ni con que nivel se entro: una sesion de
 * esa forma se descarta y obliga a entrar otra vez, que es justo lo que tiene
 * que pasar el dia que empiezan a regir el turno y la verificacion.
 */
const VERSION_SESION = 3;

/**
 * Claves del modelo de la clave del equipo.
 *
 * Se borran al arrancar: guardaban el resumen de una clave que ya no abre nada,
 * y dejar credenciales muertas en el aparato solo sirve para confundir a quien
 * lo inspeccione.
 */
const CLAVES_RETIRADAS = Object.freeze([
  'zahavi_acceso_v1',
  'zahavi_sesion_v1',
  'zahavi_usuarios_v1',
  'zahavi_recetario_pwd_v2',
]);

/** El mismo formato que exige `perfiles_codigo_usuario_formato` en la base de datos. */
const FORMATO_CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** Seis digitos: la longitud minima de contraseña configurada en Supabase Auth. */
const FORMATO_PIN = /^\d{6}$/;

/**
 * Margen para renovar antes de que venza el testigo.
 *
 * Un testigo que vence mientras viaja la peticion hace fallar esa peticion con
 * un 401 que parece de permisos. Renovar un minuto antes lo evita.
 */
const MARGEN_RENOVACION_S = 60;

/**
 * Cuanto se espera al servidor antes de darlo por inalcanzable.
 *
 * Una red de cocina no falla limpia: se queda colgada. Sin limite, el boton de
 * Entrar se quedaria en "Entrando…" indefinidamente.
 */
const ESPERA_MAXIMA_MS = 15000;

/** Nombre visible de cada rol, en el orden de la jerarquia de `0001_base.sql`. */
export const ROLES = Object.freeze({
  operario: 'Operario',
  obrador: 'Jefe de obrador',
  gerencia: 'Gerencia',
  admin: 'Administrador',
});

/**
 * Roles que entran en dos pasos.
 *
 * El mismo corte que `privado.es_al_menos()` en `0010`: si difiriera, la
 * pantalla dejaria entrar a alguien a quien la base de datos luego niega todo,
 * o pediria el celular a quien no lo necesita.
 */
const ROLES_CON_VERIFICACION = new Set(['gerencia', 'admin']);

/** Duracion maxima de un turno. La misma que aplica `privado.sesion_vigente()`. */
export const TURNO_MAXIMO_S = 6 * 60 * 60;

/**
 * Cuanto puede esperar el segundo paso despues del PIN.
 *
 * El testigo de ese momento vale una hora, pero una pantalla de verificacion
 * abandonada en una tableta compartida no deberia servirle a quien llegue
 * despues: pasado este plazo hay que volver a escribir el PIN.
 */
const ESPERA_SEGUNDO_PASO_S = 10 * 60;

/**
 * Tolerancia a un reloj que se atrasa.
 *
 * Si el turno parece empezar en el futuro, alguien atraso el reloj del equipo
 * -o se atraso solo- y el turno se alargaria sin limite. Pasado este margen se
 * da por terminado; la base de datos, con su propio reloj, no se deja engañar.
 */
const MARGEN_RELOJ_S = 5 * 60;

/** Lo que muestra la aplicacion autenticadora junto al codigo. */
const EMISOR_VERIFICACION = 'Zahavi POS';

/** Seis digitos: lo que genera cualquier aplicacion autenticadora (TOTP). */
const FORMATO_VERIFICACION = /^\d{6}$/;

/**
 * Motivos por los que una sesion guardada deja de valer.
 *
 * Los demas fallos -sin red, servidor caido, demasiados intentos- NO cierran la
 * sesion: sacar a alguien a media tanda porque parpadeo el wifi seria peor que
 * esperar a la siguiente comprobacion. El turno vencido SI la cierra aunque no
 * haya red: ver la cabecera.
 */
const MOTIVOS_DE_CIERRE = new Set([
  'revocada',
  'inactivo',
  'sin_perfil',
  'sin_sesion',
  'turno_vencido',
  'requiere_verificacion',
]);

const MENSAJE_SIN_CONEXION =
  'No hay conexión con el servidor. Revisa internet e inténtalo de nuevo.';

export const MENSAJE_TURNO_VENCIDO =
  `Tu turno de ${TURNO_MAXIMO_S / 3600} horas terminó. Vuelve a entrar con tu código y tu PIN.`;

const MENSAJE_INGRESO_CADUCADO =
  'El ingreso caducó antes de verificar. Vuelve a escribir tu código y tu PIN.';

/* ===========================================================================
 *  CREDENCIALES
 * ======================================================================== */

/**
 * El codigo tal como lo guarda la base de datos: sin espacios y en mayusculas.
 *
 * @param {unknown} texto
 * @returns {string}
 */
export function normalizarCodigo(texto) {
  return String(texto ?? '').trim().toUpperCase();
}

/**
 * Correo tecnico de una cuenta. Ver `DOMINIO_CORREO_INTERNO`.
 *
 * @param {string} codigo ya normalizado
 * @returns {string}
 */
export function correoInterno(codigo) {
  return `${codigo.toLowerCase()}@${DOMINIO_CORREO_INTERNO}`;
}

/**
 * Comprueba la forma del codigo y del PIN ANTES de preguntar al servidor.
 *
 * No es seguridad -eso lo decide Supabase-: es no gastar un intento del limite
 * de Auth en algo que no puede ser correcto, y poder decir exactamente que esta
 * mal en vez de un "incorrecto" generico.
 *
 * @param {unknown} codigo
 * @param {unknown} pin
 * @returns {{ok: true, value: {codigo: string, correo: string, pin: string}} | {ok: false, code: string, message: string}}
 */
export function validarCredenciales(codigo, pin) {
  const normalizado = normalizarCodigo(codigo);
  const pinTexto = String(pin ?? '');

  if (!normalizado) return err('codigo_vacio', 'Escribe tu código de usuario.');
  if (!FORMATO_CODIGO.test(normalizado)) {
    return err(
      'codigo_invalido',
      'El código tiene de 3 a 32 caracteres: letras sin tilde, números, guion o guion bajo.',
    );
  }
  if (!pinTexto) return err('pin_vacio', 'Escribe tu PIN.');
  if (!FORMATO_PIN.test(pinTexto)) return err('pin_invalido', 'El PIN son 6 números.');

  return ok({ codigo: normalizado, correo: correoInterno(normalizado), pin: pinTexto });
}

/**
 * Indica si un rol entra en dos pasos. Ver `ROLES_CON_VERIFICACION`.
 *
 * @param {string} rol
 * @returns {boolean}
 */
export function exigeVerificacion(rol) {
  return ROLES_CON_VERIFICACION.has(rol);
}

/* ===========================================================================
 *  TRANSPORTE
 * ======================================================================== */

/**
 * Una peticion a Supabase que nunca lanza.
 *
 * Distingue dos cosas que la pantalla tiene que decir distinto: el servidor
 * contesto -con el estado que sea- o no se llego a hablar con el. Lo segundo
 * incluye la red caida, la espera agotada y la politica de contenido que
 * bloquea la peticion antes de salir.
 *
 * Se exporta para que las lecturas de datos (`core/equipo.js`) usen el mismo
 * transporte, con la misma espera maxima y el mismo mensaje sin red.
 *
 * @param {string} ruta a partir de la direccion del proyecto
 * @param {{method?: string, body?: object, token?: string, prefer?: string}} [opciones]
 * @returns {Promise<{ok: true, value: {status: number, datos: any}} | {ok: false, code: string, message: string}>}
 */
export async function pedir(ruta, { method = 'GET', body, token, prefer } = {}) {
  const controlador = typeof AbortController === 'function' ? new AbortController() : null;
  const temporizador = controlador ? setTimeout(() => controlador.abort(), ESPERA_MAXIMA_MS) : null;

  const cabeceras = { apikey: SUPABASE_PUBLISHABLE_KEY, Accept: 'application/json' };
  if (body !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  if (prefer) cabeceras.Prefer = prefer;

  try {
    const respuesta = await fetch(SUPABASE_URL + ruta, {
      method,
      headers: cabeceras,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controlador ? controlador.signal : undefined,
      cache: 'no-store',
      credentials: 'omit',
    });

    // Salir contesta 204 sin cuerpo, y un proxy intermedio puede devolver HTML
    // en un error. En los dos casos importa el estado, no el cuerpo.
    let datos = null;
    try {
      datos = await respuesta.json();
    } catch {
      datos = null;
    }

    return ok({ status: respuesta.status, datos });
  } catch {
    return err('sin_conexion', MENSAJE_SIN_CONEXION);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/**
 * Traduce una respuesta de Auth que no fue un exito.
 *
 * Los codigos salen de probar el proyecto real: credenciales incorrectas
 * contestan `400` con `error_code: invalid_credentials`, igual para un codigo
 * que no existe que para un PIN equivocado. Y asi debe llegar a la pantalla:
 * decir cual de los dos fallo le diria a un extraño que codigos existen.
 *
 * @param {number} status
 * @param {any} datos
 * @returns {{ok: false, code: string, message: string}}
 */
function falloDeAuth(status, datos) {
  const codigo = datos && typeof datos.error_code === 'string' ? datos.error_code : '';

  if (status === 429 || codigo === 'over_request_rate_limit') {
    return err(
      'demasiados_intentos',
      'Demasiados intentos seguidos. Espera unos minutos antes de volver a probar.',
    );
  }
  if (codigo === 'invalid_credentials') return err('credenciales', 'Código o PIN incorrectos.');
  if (codigo === 'user_banned') {
    return err('inactivo', 'Tu usuario está desactivado. Habla con el administrador.');
  }
  if (codigo === 'email_not_confirmed') {
    return err('sin_confirmar', 'Tu usuario todavía no está activado. Pídele al administrador que lo revise.');
  }

  // --- Segundo paso ---------------------------------------------------------
  // Un codigo equivocado se puede volver a intentar sin repetir el PIN. Los
  // demas fallos dejan el ingreso a medias inservible (`sin_ingreso`): quien
  // llama lo descarta y la pantalla vuelve a pedir el PIN.
  if (codigo === 'mfa_verification_failed' || codigo === 'mfa_challenge_expired') {
    return err(
      'verificacion_incorrecta',
      'Código incorrecto. Escribe el que se ve ahora en la aplicación: cambia cada 30 segundos.',
    );
  }
  if (codigo === 'mfa_ip_address_mismatch') {
    return err('sin_ingreso', 'La conexión cambió mientras registrabas el celular. Vuelve a entrar con tu código y tu PIN.');
  }
  if (codigo === 'mfa_factor_not_found' || codigo === 'session_not_found') {
    return err('sin_ingreso', MENSAJE_INGRESO_CADUCADO);
  }
  if (codigo === 'mfa_totp_enroll_not_enabled' || codigo === 'mfa_totp_verify_not_enabled') {
    return err('servidor', 'La verificación en dos pasos está desactivada en el servidor. Avisa al administrador.');
  }
  if (codigo === 'too_many_enrolled_mfa_factors') {
    return err('servidor', 'Tu usuario tiene demasiados celulares registrados. Pídele al administrador que los revise.');
  }
  if (status >= 500) {
    return err('servidor', 'El servidor no está respondiendo bien. Inténtalo de nuevo en unos minutos.');
  }
  return err('servidor', `El servidor rechazó el ingreso (${status}). Si se repite, avisa al administrador.`);
}

/**
 * Lo que se conserva de una respuesta de Auth con testigos.
 *
 * @param {any} datos
 * @returns {{access_token: string, refresh_token: string, expires_at: number, user_id: string}|null}
 */
function testigosDe(datos) {
  if (!datos || typeof datos.access_token !== 'string' || typeof datos.refresh_token !== 'string') {
    return null;
  }
  const userId = datos.user && typeof datos.user.id === 'string' ? datos.user.id : '';
  if (!userId || sujetoDe(datos.access_token) !== userId) return null;

  // EL VENCIMIENTO SE CUENTA CON EL RELOJ DE ESTE EQUIPO. `expires_at` es la
  // hora del servidor, y una tableta con el reloj atrasado una hora creeria
  // vigente un testigo ya vencido: nunca renovaria y cada lectura fallaria con
  // un 401 que parece una sesion revocada. `expires_in` es una duracion, y
  // sumada al reloj local da el vencimiento en el mismo reloj que lo compara.
  let expiraEn;
  if (Number.isFinite(datos.expires_in)) expiraEn = ahora() + datos.expires_in;
  else if (Number.isFinite(datos.expires_at)) expiraEn = datos.expires_at;
  else return null;

  return {
    access_token: datos.access_token,
    refresh_token: datos.refresh_token,
    expires_at: expiraEn,
    user_id: userId,
  };
}

/** Segundos desde la epoca, la unidad de `expires_at` en Auth. */
function ahora() {
  return Math.floor(Date.now() / 1000);
}

/**
 * El contenido firmado de un testigo de acceso.
 *
 * No se verifica la firma -eso lo hace el servidor en cada peticion-: sirve
 * para no fiarse de lo GUARDADO en el equipo, que cualquiera con el aparato en
 * la mano puede editar. Un testigo manipulado lo rechaza Supabase.
 *
 * @param {string} token
 * @returns {Record<string, unknown>} vacio si el testigo no tiene la forma de un JWT
 */
function contenidoDe(token) {
  const partes = typeof token === 'string' ? token.split('.') : [];
  if (partes.length !== 3) return {};
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const contenido = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return contenido && typeof contenido === 'object' ? contenido : {};
  } catch {
    return {};
  }
}

/**
 * A quien pertenece un testigo de acceso.
 *
 * @param {string} token
 * @returns {string} el `sub`, o '' si no lo tiene
 */
function sujetoDe(token) {
  const { sub } = contenidoDe(token);
  return typeof sub === 'string' ? sub : '';
}

/**
 * Con que nivel se identifico la sesion del testigo.
 *
 * Supabase escribe `aal2` cuando ademas del PIN se verifico el codigo del
 * celular. Un testigo sin la marca es de nivel 1, igual que en Supabase.
 *
 * @param {string} token
 * @returns {string}
 */
function nivelDe(token) {
  const { aal } = contenidoDe(token);
  return typeof aal === 'string' ? aal : 'aal1';
}

/* ===========================================================================
 *  PERFIL
 * ======================================================================== */

/**
 * Lee el perfil de quien acaba de identificarse.
 *
 * La politica `perfiles_lectura` deja leer SIEMPRE la fila propia, tambien
 * cuando esta inactiva, y eso es justo lo que permite decir "tu usuario esta
 * desactivado" en vez de un "no tienes perfil" que mandaria a buscar otra cosa.
 *
 * @param {string} token testigo de acceso
 * @param {string} userId
 * @returns {Promise<{ok: true, value: object} | {ok: false, code: string, message: string}>}
 */
async function cargarPerfil(token, userId) {
  const ruta =
    '/rest/v1/perfiles?select=id,nombre,codigo_usuario,rol,activo,sede:sedes(id,nombre)' +
    `&id=eq.${encodeURIComponent(userId)}`;

  const respuesta = await pedir(ruta, { token });
  if (!respuesta.ok) return respuesta;

  const { status, datos } = respuesta.value;

  // Solo el 401 dice que el servidor rechazo el testigo. Un 403 es un permiso
  // que falta -un GRANT retirado, una migracion a medias- y tratarlo como
  // sesion revocada sacaria a todas las tabletas a la vez por un fallo del
  // servidor que nadie en la cocina puede arreglar.
  if (status === 401) {
    return err('revocada', 'Tu sesión ya no es válida. Vuelve a entrar.');
  }
  if (status !== 200 || !Array.isArray(datos)) {
    return err('servidor', 'No se pudo leer tu perfil. Inténtalo de nuevo en unos minutos.');
  }
  if (datos.length === 0) {
    return err('sin_perfil', 'Tu usuario no tiene perfil en el sistema. Pídele al administrador que lo revise.');
  }

  const fila = datos[0];
  if (!fila.activo) {
    return err('inactivo', 'Tu usuario está desactivado. Habla con el administrador.');
  }
  if (!Object.hasOwn(ROLES, fila.rol)) {
    return err('servidor', 'Tu perfil tiene un rol que esta versión no reconoce. Avisa al administrador.');
  }

  return ok({
    id: String(fila.id),
    nombre: String(fila.nombre || ''),
    codigo: fila.codigo_usuario ? String(fila.codigo_usuario) : '',
    rol: fila.rol,
    sede: fila.sede && fila.sede.id ? { id: String(fila.sede.id), nombre: String(fila.sede.nombre || '') } : null,
  });
}

/* ===========================================================================
 *  LA SESION GUARDADA
 * ======================================================================== */

/**
 * La sesion de este equipo, o null si no hay ninguna utilizable.
 *
 * Una sesion guardada con otra forma -version anterior, archivo dañado- se
 * trata como ausente y se borra: intentar usarla acabaria en errores de
 * permisos sin explicacion.
 *
 * Una sesion de gerencia o administracion cuyo testigo no esta verificado en
 * dos pasos tampoco vale: no puede salir de `iniciarSesion`, asi que alguien la
 * escribio a mano en el equipo.
 *
 * NO mira el turno: una sesion vencida se sigue leyendo para poder cerrarla
 * diciendo por que (`turnoVencido`), en vez de dejar a la persona ante la
 * pantalla de entrada sin explicacion.
 *
 * @returns {{v: 3, access_token: string, refresh_token: string, expires_at: number, inicio_turno: number, usuario: object}|null}
 */
export function leerSesion() {
  const guardada = readJson(SESION_KEY, null);
  if (guardada === null) return null;

  const usuario = guardada && guardada.usuario;
  const valida =
    guardada.v === VERSION_SESION &&
    typeof guardada.access_token === 'string' &&
    typeof guardada.refresh_token === 'string' &&
    Number.isFinite(guardada.expires_at) &&
    Number.isFinite(guardada.inicio_turno) &&
    usuario &&
    typeof usuario.id === 'string' &&
    typeof usuario.nombre === 'string' &&
    Object.hasOwn(ROLES, usuario.rol) &&
    (!exigeVerificacion(usuario.rol) || nivelDe(guardada.access_token) === 'aal2');

  if (!valida) {
    removeKey(SESION_KEY);
    return null;
  }
  return guardada;
}

/**
 * @param {{access_token: string, refresh_token: string, expires_at: number}} testigos
 * @param {object} usuario
 * @param {number} inicioTurno segundos desde la epoca, con el reloj de este equipo
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
function guardarSesion(testigos, usuario, inicioTurno) {
  return writeJson(SESION_KEY, {
    v: VERSION_SESION,
    access_token: testigos.access_token,
    refresh_token: testigos.refresh_token,
    expires_at: testigos.expires_at,
    inicio_turno: inicioTurno,
    usuario,
  });
}

/**
 * Indica si el turno de una sesion ya termino. Ver `TURNO_MAXIMO_S`.
 *
 * @param {{inicio_turno: number}} sesion
 * @returns {boolean}
 */
export function turnoVencido(sesion) {
  const transcurrido = ahora() - sesion.inicio_turno;
  return transcurrido >= TURNO_MAXIMO_S || transcurrido < -MARGEN_RELOJ_S;
}

/**
 * Cuando termina el turno de una sesion, en milisegundos desde la epoca.
 *
 * En milisegundos porque lo usan `setTimeout` y `Date`, no Auth.
 *
 * @param {{inicio_turno: number}} sesion
 * @returns {number}
 */
export function finDelTurno(sesion) {
  return (sesion.inicio_turno + TURNO_MAXIMO_S) * 1000;
}

/**
 * Borra las credenciales del modelo de la clave del equipo. Ver `CLAVES_RETIRADAS`.
 */
export function retirarAccesoAnterior() {
  for (const clave of CLAVES_RETIRADAS) removeKey(clave);
}

/**
 * Indica si un fallo obliga a cerrar la sesion guardada. Ver `MOTIVOS_DE_CIERRE`.
 *
 * @param {{ok: boolean, code?: string}} resultado
 * @returns {boolean}
 */
export function invalidaLaSesion(resultado) {
  return !resultado.ok && MOTIVOS_DE_CIERRE.has(resultado.code);
}

/* ===========================================================================
 *  ENTRAR, RENOVAR Y SALIR
 * ======================================================================== */

/**
 * Pide al servidor que desconecte el testigo, sin esperar la respuesta.
 *
 * `pedir` no lanza, asi que no queda ninguna promesa rechazada sin atender. Si
 * no hay red, el testigo de acceso caduca solo en menos de una hora y el de
 * renovacion ya no existe en este equipo.
 *
 * @param {string} token
 */
function revocarEnServidor(token) {
  void pedir('/auth/v1/logout?scope=local', { method: 'POST', token });
}

const MENSAJE_SIN_ALMACENAMIENTO =
  'Este equipo no puede guardar la sesión. Revisa que el navegador permita guardar datos del sitio.';

/**
 * El ingreso a medias de quien ya dio el PIN y le falta el segundo paso.
 *
 * SOLO EN MEMORIA, a proposito: si se guardara, una sesion de gerencia sin
 * verificar abriria la aplicacion al recargar. Y uno solo por equipo: empezar
 * otro ingreso descarta el anterior y lo desconecta en el servidor.
 *
 * @type {null | {testigos: {access_token: string, refresh_token: string, expires_at: number, user_id: string},
 *   usuario: object, inicio_turno: number, factorId: string}}
 */
let pendiente = null;

/**
 * Olvida un ingreso a medias y cierra en el servidor la sesion que abrio el PIN.
 *
 * @param {typeof pendiente} ingreso
 */
function descartarIngreso(ingreso) {
  if (!ingreso) return;
  if (pendiente === ingreso) pendiente = null;
  revocarEnServidor(ingreso.testigos.access_token);
}

/**
 * Deja lista la inscripcion de la aplicacion autenticadora.
 *
 * Primero se borran las inscripciones que alguien empezo y no termino -cerro la
 * pantalla, se quedo sin bateria-: Auth limita cuantas puede tener una cuenta,
 * y sin limpiar, la tercera vez que alguien abandona el QR ya no podria entrar.
 * Una sesion de nivel 1 puede borrar las SIN verificar, nunca una verificada.
 *
 * @param {string} token testigo del PIN
 * @param {Array<any>} factores los que trae la cuenta al entrar
 * @returns {Promise<{ok: true, value: {factorId: string, qr: string, secreto: string}} | {ok: false, code: string, message: string}>}
 */
async function prepararInscripcion(token, factores) {
  const abandonados = factores.filter((f) => f && f.factor_type === 'totp' && f.status !== 'verified' && typeof f.id === 'string');
  for (const factor of abandonados) {
    await pedir(`/auth/v1/factors/${encodeURIComponent(factor.id)}`, { method: 'DELETE', token });
  }

  const respuesta = await pedir('/auth/v1/factors', {
    method: 'POST',
    token,
    body: { factor_type: 'totp', issuer: EMISOR_VERIFICACION },
  });
  if (!respuesta.ok) return respuesta;

  const { status, datos } = respuesta.value;
  if (status !== 200) return falloDeAuth(status, datos);

  const totp = datos && datos.totp;
  if (!datos || typeof datos.id !== 'string' || !totp || typeof totp.secret !== 'string' || !totp.secret) {
    return err('servidor', 'El servidor no entregó el código para registrar el celular. Inténtalo de nuevo.');
  }
  return ok({
    factorId: datos.id,
    qr: typeof totp.qr_code === 'string' ? totp.qr_code : '',
    secreto: totp.secret,
  });
}

/**
 * Entra con codigo y PIN.
 *
 * Tres resultados posibles, todos `ok`:
 * - `dentro`: la sesion quedo abierta y guardada.
 * - `verificar`: gerencia o administracion con el celular ya registrado; falta
 *   el codigo de la aplicacion (`verificarSegundoPaso`).
 * - `inscribir`: igual, pero es la primera vez: trae el QR y la clave para
 *   registrar la aplicacion, y despues el mismo `verificarSegundoPaso`.
 *
 * @param {unknown} codigo
 * @param {unknown} pin
 * @returns {Promise<{ok: true, value: {estado: 'dentro'|'verificar'|'inscribir', usuario: object, qr?: string, secreto?: string}}
 *   | {ok: false, code: string, message: string}>}
 */
export async function iniciarSesion(codigo, pin) {
  const credenciales = validarCredenciales(codigo, pin);
  if (!credenciales.ok) return credenciales;

  // Un ingreso nuevo invalida el que quedara a medias en este equipo.
  descartarIngreso(pendiente);

  const respuesta = await pedir('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: credenciales.value.correo, password: credenciales.value.pin },
  });
  if (!respuesta.ok) return respuesta;

  const { status, datos } = respuesta.value;
  if (status !== 200) return falloDeAuth(status, datos);

  const testigos = testigosDe(datos);
  if (!testigos) {
    return err('servidor', 'El servidor contestó sin una sesión válida. Inténtalo de nuevo.');
  }
  // El turno empieza al aceptar el PIN, no al terminar el segundo paso: es la
  // misma hora con la que la base de datos cuenta sus 6 horas.
  const inicioTurno = ahora();

  const perfil = await cargarPerfil(testigos.access_token, testigos.user_id);
  if (!perfil.ok) {
    // Auth acepto el PIN pero el POS no puede dejar entrar: la sesion que se
    // acaba de abrir en el servidor no debe quedar viva.
    revocarEnServidor(testigos.access_token);
    return perfil;
  }
  const usuario = perfil.value;

  if (!exigeVerificacion(usuario.rol)) {
    const guardado = guardarSesion(testigos, usuario, inicioTurno);
    if (!guardado.ok) {
      revocarEnServidor(testigos.access_token);
      return err('almacenamiento', MENSAJE_SIN_ALMACENAMIENTO);
    }
    return ok({ estado: 'dentro', usuario });
  }

  const factores = datos.user && Array.isArray(datos.user.factors) ? datos.user.factors : [];
  const registrado = factores.find(
    (f) => f && f.factor_type === 'totp' && f.status === 'verified' && typeof f.id === 'string',
  );

  if (registrado) {
    pendiente = { testigos, usuario, inicio_turno: inicioTurno, factorId: registrado.id };
    return ok({ estado: 'verificar', usuario });
  }

  const inscripcion = await prepararInscripcion(testigos.access_token, factores);
  if (!inscripcion.ok) {
    revocarEnServidor(testigos.access_token);
    return inscripcion;
  }
  pendiente = { testigos, usuario, inicio_turno: inicioTurno, factorId: inscripcion.value.factorId };
  return ok({ estado: 'inscribir', usuario, qr: inscripcion.value.qr, secreto: inscripcion.value.secreto });
}

/**
 * Completa el ingreso con el codigo de 6 numeros de la aplicacion autenticadora.
 *
 * Sirve igual para la primera vez (confirma la inscripcion) que para las
 * siguientes. Cada intento pide un reto nuevo justo antes de verificar, asi que
 * un reto no llega a caducar mientras la persona busca el celular.
 *
 * @param {unknown} codigo
 * @returns {Promise<{ok: true, value: {estado: 'dentro', usuario: object}} | {ok: false, code: string, message: string}>}
 *   con `sin_ingreso`, el ingreso a medias ya no sirve y hay que volver al PIN
 */
export async function verificarSegundoPaso(codigo) {
  const texto = String(codigo ?? '').replace(/\s+/g, '');
  if (!texto) return err('verificacion_vacia', 'Escribe el código de 6 números de la aplicación.');
  if (!FORMATO_VERIFICACION.test(texto)) return err('verificacion_invalida', 'El código de verificación son 6 números.');

  const ingreso = pendiente;
  if (!ingreso) return err('sin_ingreso', MENSAJE_INGRESO_CADUCADO);
  if (ahora() - ingreso.inicio_turno > ESPERA_SEGUNDO_PASO_S) {
    descartarIngreso(ingreso);
    return err('sin_ingreso', MENSAJE_INGRESO_CADUCADO);
  }

  const ruta = `/auth/v1/factors/${encodeURIComponent(ingreso.factorId)}`;
  const token = ingreso.testigos.access_token;

  const reto = await pedir(`${ruta}/challenge`, { method: 'POST', token, body: {} });
  if (!reto.ok) return reto;
  if (reto.value.status !== 200 || !reto.value.datos || typeof reto.value.datos.id !== 'string') {
    return falloDelSegundoPaso(ingreso, reto.value.status, reto.value.datos);
  }

  const respuesta = await pedir(`${ruta}/verify`, {
    method: 'POST',
    token,
    body: { challenge_id: reto.value.datos.id, code: texto },
  });
  if (!respuesta.ok) return respuesta;
  const { status, datos } = respuesta.value;

  // Mientras viajaba, la persona pudo pulsar Volver o empezar otro ingreso.
  // Lo que llegue ahora ya no es de nadie.
  if (pendiente !== ingreso) {
    const huerfanos = status === 200 ? testigosDe(datos) : null;
    if (huerfanos) revocarEnServidor(huerfanos.access_token);
    return err('sin_ingreso', MENSAJE_INGRESO_CADUCADO);
  }
  if (status !== 200) return falloDelSegundoPaso(ingreso, status, datos);

  const testigos = testigosDe(datos);
  if (!testigos || testigos.user_id !== ingreso.usuario.id || nivelDe(testigos.access_token) !== 'aal2') {
    descartarIngreso(ingreso);
    if (testigos) revocarEnServidor(testigos.access_token);
    return err('servidor', 'El servidor contestó sin una sesión verificada. Vuelve a entrar.');
  }

  pendiente = null;
  const guardado = guardarSesion(testigos, ingreso.usuario, ingreso.inicio_turno);
  if (!guardado.ok) {
    revocarEnServidor(testigos.access_token);
    return err('almacenamiento', MENSAJE_SIN_ALMACENAMIENTO);
  }
  return ok({ estado: 'dentro', usuario: ingreso.usuario });
}

/**
 * Traduce un fallo del segundo paso y descarta el ingreso si ya no sirve.
 *
 * @param {NonNullable<typeof pendiente>} ingreso
 * @param {number} status
 * @param {any} datos
 * @returns {{ok: false, code: string, message: string}}
 */
function falloDelSegundoPaso(ingreso, status, datos) {
  // El testigo del PIN vencio o la sesion se cerro en el servidor.
  const fallo = status === 401 ? err('sin_ingreso', MENSAJE_INGRESO_CADUCADO) : falloDeAuth(status, datos);
  if (fallo.code === 'sin_ingreso') descartarIngreso(ingreso);
  return fallo;
}

/**
 * Abandona el segundo paso: vuelve a pedir el PIN y cierra la sesion del PIN en
 * el servidor. Una inscripcion sin terminar se borra sola en el siguiente ingreso.
 */
export function cancelarSegundoPaso() {
  descartarIngreso(pendiente);
}

/**
 * Ejecuta con un cerrojo compartido entre pestañas.
 *
 * Supabase ROTA el testigo de renovacion: al usarlo, deja de valer. Dos
 * pestañas renovando a la vez gastarian el mismo testigo y una de las dos se
 * quedaria fuera. Con el cerrojo, la segunda espera y relee la sesion que dejo
 * la primera.
 *
 * Sin Web Locks se renueva sin cerrojo: Auth tolera la reutilizacion del mismo
 * testigo durante unos segundos, y quedarse sin poder renovar seria peor.
 *
 * @template T
 * @param {() => Promise<T>} trabajo
 * @returns {Promise<T>}
 */
function conCerrojo(trabajo) {
  const locks = typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
  if (locks && typeof locks.request === 'function') return locks.request('zahavi-sesion', trabajo);
  return trabajo();
}

const MENSAJE_SESION_CAMBIADA = 'La sesión de este equipo cambió mientras se comprobaba.';

/**
 * Un testigo de acceso vigente, renovandolo si esta por vencer.
 *
 * Es la puerta por la que pasara toda lectura y escritura de datos en Supabase.
 *
 * @param {boolean} [forzar] renovar aunque el testigo parezca vigente: lo pide
 *   quien acaba de recibir un 401 con el, que es la prueba de que no lo esta
 * @returns {Promise<{ok: true, value: string} | {ok: false, code: string, message: string}>}
 */
export function tokenVigente(forzar = false) {
  return conCerrojo(async () => {
    // Se relee DENTRO del cerrojo: otra pestaña pudo renovar mientras se esperaba.
    const sesion = leerSesion();
    if (!sesion) return err('sin_sesion', 'No hay una sesión abierta en este equipo.');

    // Antes que nada, y sin preguntar a nadie: un turno vencido no se renueva.
    if (turnoVencido(sesion)) return err('turno_vencido', MENSAJE_TURNO_VENCIDO);

    if (!forzar && sesion.expires_at - ahora() > MARGEN_RENOVACION_S) return ok(sesion.access_token);

    const respuesta = await pedir('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: sesion.refresh_token },
    });
    if (!respuesta.ok) return respuesta;

    const { status, datos } = respuesta.value;
    if (status === 429) return falloDeAuth(status, datos);
    // Un 400 o 401 aqui es que el servidor ya no reconoce la sesion: alguien la
    // cerro, se borro la cuenta, o el testigo se gasto en otro sitio.
    if (status === 400 || status === 401) {
      return err('revocada', 'Tu sesión ya no es válida. Vuelve a entrar.');
    }
    if (status !== 200) return falloDeAuth(status, datos);

    const testigos = testigosDe(datos);
    if (!testigos) {
      return err('servidor', 'El servidor contestó sin una sesión válida. Inténtalo de nuevo.');
    }

    // LA RENOVACION PUDO LLEGAR TARDE. Mientras viajaba, alguien pudo cerrar la
    // sesion -`terminarSesion` no espera al cerrojo- o entrar con otro usuario
    // en este mismo equipo. Guardar aqui sin mirar resucitaria una sesion
    // cerrada, o pisaria la de la persona nueva con los testigos de la
    // anterior y todo lo que registrara quedaria a nombre de otro. Si la sesion
    // guardada ya no es la que se renovo, los testigos recien emitidos no son
    // de nadie: se desconectan.
    const vigente = leerSesion();
    if (!vigente || vigente.refresh_token !== sesion.refresh_token) {
      revocarEnServidor(testigos.access_token);
      return err('sesion_cambiada', MENSAJE_SESION_CAMBIADA);
    }

    // Renovar conserva el nivel de la sesion en el servidor. Si de gerencia o
    // administracion vuelve un testigo sin `aal2`, guardarlo convertiria una
    // sesion verificada en una que `leerSesion` borra sin decir por que.
    if (exigeVerificacion(sesion.usuario.rol) && nivelDe(testigos.access_token) !== 'aal2') {
      revocarEnServidor(testigos.access_token);
      return err('requiere_verificacion', 'Tu sesión perdió la verificación en dos pasos. Vuelve a entrar.');
    }

    const guardado = guardarSesion(testigos, sesion.usuario, sesion.inicio_turno);
    if (!guardado.ok) return err('almacenamiento', MENSAJE_SIN_ALMACENAMIENTO);
    return ok(testigos.access_token);
  });
}

/**
 * Vuelve a comprobar la sesion guardada contra el servidor.
 *
 * Renueva el testigo si hace falta y relee el perfil, para que un cambio de rol
 * o una baja lleguen a este equipo sin esperar a que la persona salga. Quien
 * llama decide con `invalidaLaSesion` si hay que cerrarla.
 *
 * @returns {Promise<{ok: true, value: object} | {ok: false, code: string, message: string}>}
 */
export async function revalidarSesion() {
  let token = await tokenVigente();
  if (!token.ok) return token;

  // LA IDENTIDAD SALE DEL TESTIGO, NO DE LO GUARDADO. El `usuario.id` del
  // equipo se puede editar; el testigo lo firma el servidor. Si no coinciden,
  // alguien toco la sesion guardada.
  const guardada = leerSesion();
  const sujeto = sujetoDe(token.value);
  if (!guardada || !sujeto) return err('sin_sesion', 'No hay una sesión abierta en este equipo.');
  if (guardada.usuario.id !== sujeto) {
    return err('revocada', 'Tu sesión ya no es válida. Vuelve a entrar.');
  }

  let perfil = await cargarPerfil(token.value, sujeto);

  // Un 401 con un testigo que parecia vigente: el reloj del equipo miente o el
  // servidor lo invalido antes de tiempo. Se renueva UNA vez antes de concluir
  // que la sesion esta revocada, que es lo que sacaria a la persona.
  if (!perfil.ok && perfil.code === 'revocada') {
    token = await tokenVigente(true);
    if (!token.ok) return token;
    perfil = await cargarPerfil(token.value, sujeto);
  }
  if (!perfil.ok) return perfil;

  // UN ASCENSO NO HEREDA LA SESION DEL ROL ANTERIOR. Quien entro de obrador con
  // solo el PIN y ahora es gerencia tiene que verificar en dos pasos: guardarle
  // el rol nuevo le daria la pantalla de gerencia con una sesion que la base de
  // datos ya no acepta para eso.
  if (exigeVerificacion(perfil.value.rol) && nivelDe(token.value) !== 'aal2') {
    return err('requiere_verificacion', 'Tu rol ahora pide verificación en dos pasos. Vuelve a entrar.');
  }

  // Mientras se leia el perfil pudo cerrarse la sesion o entrar otra persona.
  // Escribir aqui resucitaria la anterior o pisaria la nueva.
  const actual = leerSesion();
  if (!actual || sujetoDe(actual.access_token) !== sujeto) {
    return err('sesion_cambiada', MENSAJE_SESION_CAMBIADA);
  }

  const guardado = guardarSesion(actual, perfil.value, actual.inicio_turno);
  if (!guardado.ok) {
    return err(
      'almacenamiento',
      'Tus datos de sesión cambiaron pero este equipo no puede guardarlos. Revisa que el navegador permita guardar datos del sitio.',
    );
  }
  return ok(perfil.value);
}

/**
 * Cierra la sesion de este equipo y la desconecta en el servidor.
 *
 * NO LLAMES A ESTO DIRECTAMENTE: usa `cerrarSesion` de `app/commands.js`, que
 * ademas revoca la clave de edicion guardada y limpia el estado de pantalla.
 */
export function terminarSesion() {
  const sesion = leerSesion();
  removeKey(SESION_KEY);
  if (sesion) revocarEnServidor(sesion.access_token);
  // Tambien lo que quedara a medias en la pantalla de verificacion.
  descartarIngreso(pendiente);
}
