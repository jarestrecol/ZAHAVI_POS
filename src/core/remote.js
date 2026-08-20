/**
 * Acceso al recetario compartido del servidor.
 *
 * Cuando la aplicacion corre en Vercel existe `/api/recipes`, que lee y escribe
 * el archivo del repositorio: eso es lo que hace que la panaderia y la casa de
 * produccion vean lo mismo. Cuando no existe (archivo local, o servidor
 * estatico sin funciones) todo sigue funcionando contra el archivo publicado y
 * el almacenamiento del equipo.
 *
 * Todos los resultados usan la misma forma que el resto del nucleo:
 * `{ok: true, value}` o `{ok: false, code, message}`.
 */

const ENDPOINT = './api/recipes';

/** Clave de edicion guardada para la sesion del navegador. */
const KEY_STORAGE = 'zahavi_edit_key';

/** Milisegundos antes de dar por perdida una peticion. */
const TIMEOUT_MS = 12000;

/** Indica si el servidor ofrece el recetario compartido. */
let available = false;

/**
 * Ultimo resultado de hablar con el servidor, para poder decirlo en Ajustes.
 *
 * `available` solo distingue "hay servidor" de "no lo hay", y eso no basta para
 * diagnosticar: una funcion mal configurada y una caida de red se veian igual
 * desde fuera, y las dos acaban en "no me guarda".
 *
 *   desconocido  todavia no se ha intentado leer
 *   ok           el servidor respondio y entrego el recetario
 *   sin_api      este sitio no tiene la funcion: no hay a donde publicar
 *   error        la funcion existe pero fallo (variables sin poner, token
 *                caducado, GitHub caido)
 *   sin_red      no se pudo llegar al servidor
 *
 * @type {'desconocido'|'ok'|'sin_api'|'error'|'sin_red'}
 */
let serverState = 'desconocido';

/** Momento de la ultima lectura correcta, en hora local. @type {Date|null} */
let lastReadAt = null;

/**
 * Lo ultimo que dijo el servidor al fallar, con su codigo delante.
 *
 * Se guarda para poder enseñarlo en Ajustes. Es la diferencia entre "responde
 * con error", que no permite arreglar nada, y "500 · El servidor no tiene
 * configurado el acceso al repositorio", que dice exactamente que falta.
 */
let lastError = '';

/**
 * sha del archivo leido. Sin el no se puede publicar: es lo que permite al
 * servidor detectar que otro equipo escribio entre medias.
 * @type {string|null}
 */
let currentSha = null;

/**
 * Generacion de acceso que declara el servidor. Ver `core/access.js`.
 *
 * Empieza en 0 y solo sube cuando alguien la sube en la configuracion del
 * despliegue. Sin servidor se queda en 0, que significa "nunca se ha revocado":
 * un equipo sin red nunca queda fuera por esto, que es la condicion que hace
 * viable comprobar el acceso sin conexion.
 */
let accesoGen = 0;

/**
 * Se pone cuando el servidor rechaza por conflicto. Mientras siga en pie no se
 * puede volver a publicar: hay que recargar y aplicar los cambios sobre la
 * version nueva. Sin esto, un segundo clic en Publicar borraba el trabajo de la
 * otra sede.
 */
let staleSinceConflict = false;

/**
 * Indica si se puede publicar ahora mismo. Hace falta que el servidor responda,
 * que se haya leido el archivo (de ahi sale el sha) y que no haya un conflicto
 * pendiente de resolver.
 *
 * @returns {boolean}
 */
export function canPublish() {
  return available && currentSha !== null && !staleSinceConflict;
}

/**
 * Indica si hay un conflicto que obliga a recargar antes de publicar.
 * @returns {boolean}
 */
export function needsReload() {
  return staleSinceConflict;
}

/**
 * Diagnostico de la conexion con el recetario compartido.
 *
 * Existe para que Ajustes pueda contestar en una linea a "no me guarda" sin
 * abrir las herramientas del navegador.
 *
 * @returns {{state: string, readAt: Date|null, hasReference: boolean, conflict: boolean}}
 */
export function serverStatus() {
  return {
    state: serverState,
    readAt: lastReadAt,
    error: lastError,
    hasReference: currentSha !== null,
    conflict: staleSinceConflict,
  };
}

/**
 * Clave de edicion guardada en este navegador, si la hay.
 * @returns {string}
 */
/**
 * Generacion de acceso vigente segun el servidor.
 * @returns {number}
 */
export function generacionAcceso() {
  return accesoGen;
}

export function getEditKey() {
  try {
    return window.sessionStorage.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

/**
 * Guarda la clave de edicion para no volver a pedirla en esta sesion.
 * @param {string} value
 */
export function setEditKey(value) {
  try {
    if (value) window.sessionStorage.setItem(KEY_STORAGE, value);
    else window.sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    /* sin almacenamiento de sesion: se pedira cada vez */
  }
}

/**
 * Lee el recetario compartido.
 *
 * @returns {Promise<{ok: true, value: {recipes: Array, ingredientes: Array, revision: string, sha: string}} | {ok: false, code: string, message: string}>}
 */
export async function fetchShared() {
  try {
    const response = await withTimeout(fetch(ENDPOINT, { cache: 'no-store' }));

    if (!response.ok) {
      // Lo que el servidor tenga que decir se lee SIEMPRE. Es la unica pista
      // que distingue "faltan las variables de entorno" de "el token no tiene
      // permiso" o "la rama no existe", y antes se descartaba: quien miraba
      // Ajustes solo veia "responde con error", que no le sirve para arreglar
      // nada. De paso, leerlo cierra el flujo de la respuesta.
      const detalle = await leerError(response);

      // Un 404 con mensaje propio NO es un sitio sin recetario compartido: es
      // la funcion contestando que el archivo no esta en el repositorio, casi
      // siempre porque `GITHUB_BRANCH` apunta a una rama que no existe. Sin
      // esta distincion, ese caso se anunciaba como "no disponible en este
      // sitio" y mandaba a revisar justo donde no estaba el problema.
      const sinFuncion = (response.status === 404 || response.status === 405) && !detalle;

      if (sinFuncion) {
        available = false;
        serverState = 'sin_api';
        lastError = '';
        return { ok: false, code: 'sin_api', message: 'Este sitio no tiene recetario compartido.' };
      }

      // El servidor existe pero no pudo entregar: no hay sha, asi que no se
      // puede publicar aunque la API responda.
      available = true;
      currentSha = null;
      serverState = 'error';
      lastError = `${response.status} · ${detalle || 'sin detalle'}`;
      return {
        ok: false,
        code: 'servidor',
        message: detalle || 'El servidor no pudo entregar el recetario.',
      };
    }

    const data = await response.json();
    if (!Array.isArray(data.recipes) || typeof data.sha !== 'string') {
      available = true;
      currentSha = null;
      serverState = 'error';
      return { ok: false, code: 'formato', message: 'El servidor devolvió un recetario ilegible.' };
    }

    available = true;
    currentSha = data.sha;
    staleSinceConflict = false;
    serverState = 'ok';
    lastReadAt = new Date();

    // Solo se acepta hacia arriba. Un servidor que de pronto contesta 0 -una
    // variable borrada por error, un despliegue a medias- no debe poder
    // rebajar la generacion y reactivar claves que ya se habian retirado.
    const recibida = Number.parseInt(data.accesoGen, 10);
    if (Number.isFinite(recibida) && recibida > accesoGen) accesoGen = recibida;

    return {
      ok: true,
      value: {
        recipes: data.recipes,
        ingredientes: Array.isArray(data.ingredientes) ? data.ingredientes : [],
        revision: typeof data.revision === 'string' ? data.revision : '',
        sha: data.sha,
      },
    };
  } catch {
    serverState = 'sin_red';
    return { ok: false, code: 'sin_red', message: 'Sin conexión con el servidor.' };
  }
}

/**
 * Publica el recetario para todas las sedes.
 *
 * @param {{recipes: Array, ingredientes: Array, password: string, author?: string}} payload
 * @returns {Promise<{ok: true, value: {revision: string, count: number}} | {ok: false, code: string, message: string}>}
 */
export async function publishShared(payload) {
  if (currentSha === null) {
    return {
      ok: false,
      code: 'sin_referencia',
      message: 'Vuelve a cargar el recetario antes de publicar.',
    };
  }
  if (staleSinceConflict) {
    return {
      ok: false,
      code: 'recarga',
      message: 'Otro equipo publicó cambios. Recarga la página antes de volver a publicar.',
    };
  }

  try {
    const response = await withTimeout(
      fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: payload.password,
          recipes: payload.recipes,
          ingredientes: payload.ingredientes,
          author: payload.author,
          sha: currentSha,
        }),
      }),
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      return { ok: false, code: 'clave', message: data.error || 'Clave de edición incorrecta.' };
    }
    if (response.status === 409) {
      // No se adopta el sha del servidor: hacerlo permitia que un segundo clic
      // publicara encima del trabajo ajeno. Hay que recargar.
      staleSinceConflict = true;
      return {
        ok: false,
        code: 'conflicto',
        message: data.error || 'Otro equipo publicó antes. Recarga la página para ver su versión.',
      };
    }
    if (!response.ok) {
      return { ok: false, code: 'servidor', message: data.error || 'No se pudo publicar.' };
    }

    // UN 200 NO BASTA PARA DAR ALGO POR PUBLICADO.
    //
    // Hay que comprobar ademas que quien contesta es la funcion de publicacion
    // y que de verdad hizo el commit. Cualquier intermediario -un proxy de la
    // red del local, el cortafuegos de la plataforma, una pagina de sesion
    // caducada- puede devolver 200 con otra cosa, y entonces se anunciaba
    // "Publicado para todas las sedes" sin que se hubiera publicado nada.
    //
    // Es el fallo silencioso mas caro que puede tener este modulo: da por
    // salvado un trabajo que sigue solo en este equipo, borra el aviso de
    // cambios pendientes, y nadie vuelve a intentarlo. Se vio al revisar una
    // captura donde la respuesta no era la de la funcion y la pantalla decia
    // "Publicado para todas las sedes: 0 recetas".
    if (data.ok !== true || typeof data.revision !== 'string') {
      return {
        ok: false,
        code: 'formato',
        message: 'El servidor respondió algo que no es una publicación. Vuelve a intentarlo.',
      };
    }

    if (typeof data.sha === 'string') currentSha = data.sha;
    return { ok: true, value: { revision: data.revision, count: data.count || 0 } };
  } catch {
    return { ok: false, code: 'red', message: 'Sin conexión con el servidor. Inténtalo de nuevo.' };
  }
}

/**
 * Lo que el servidor dice al fallar, si dice algo aprovechable.
 *
 * La funcion de publicacion contesta `{"error": "..."}` con un texto ya
 * redactado para leerse tal cual. Cuando NO hay funcion, quien contesta es la
 * plataforma con su propia pagina, y ahi no hay nada que enseñar: por eso se
 * devuelve cadena vacia, y esa diferencia es justo la que permite distinguir
 * "este sitio no tiene recetario compartido" de "la funcion existe y falla".
 *
 * Leer el cuerpo ademas CIERRA el flujo. Sin consumirlo, y con el
 * `Cache-Control: no-store` que declara `/api/` en produccion, la peticion se
 * queda abierta hasta que el navegador la recoja por su cuenta: no se pierde
 * nada visible, pero cualquier medida de "la pagina terminó de cargar" espera
 * para siempre.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function leerError(response) {
  try {
    const texto = await response.text();
    if (!texto) return '';
    const datos = JSON.parse(texto);
    return datos && typeof datos.error === 'string' ? datos.error : '';
  } catch {
    // Ni JSON, ni cuerpo legible, o no lo escribio esta aplicacion.
    return '';
  }
}

/**
 * Corta una petición que no contesta.
 *
 * El temporizador SE LIMPIA pase lo que pase. Sin ese `finally` quedaba vivo
 * doce segundos por cada petición aunque la respuesta llegara en cien
 * milisegundos, y con la publicación automática reintentando se acumulaban
 * temporizadores pendientes sin ninguna utilidad.
 *
 * Lo que esto NO hace es cancelar el `fetch`: la petición sigue viajando y solo
 * se descarta su resultado. Cancelarla de verdad pediría un `AbortController`,
 * y aquí no compensa: la respuesta que se descarta ya no la espera nadie.
 *
 * @param {Promise} promise
 * @returns {Promise}
 */
function withTimeout(promise) {
  let temporizador = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      temporizador = setTimeout(() => reject(new Error('tiempo agotado')), TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (temporizador !== null) clearTimeout(temporizador);
  });
}
