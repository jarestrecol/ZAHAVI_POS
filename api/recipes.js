/**
 * Recetario compartido, guardado en el propio repositorio de GitHub.
 *
 * Sin base de datos: el archivo `data/recipes.json` del repositorio es el estado
 * compartido, y cada guardado es un commit real. Eso da sincronizacion inmediata
 * entre la panaderia y la casa de produccion, e historial completo de quien
 * cambio que y cuando, con posibilidad de revertir.
 *
 * GET  /api/recipes  -> devuelve el recetario y el sha del archivo
 * PUT  /api/recipes  -> valida clave y esquema, comprueba el sha y hace commit
 *
 * El sha actua como control de concurrencia: si alguien publico entre la lectura
 * y la escritura, GitHub rechaza el envio y aqui se responde 409 en lugar de
 * pisar el trabajo del otro.
 *
 * Variables de entorno necesarias en Vercel:
 *   GITHUB_TOKEN   token con permiso de contenido sobre el repositorio
 *   GITHUB_REPO    "usuario/repositorio"
 *   GITHUB_BRANCH  rama de publicacion (por defecto main)
 *   EDIT_PASSWORD  clave que habilita la edicion
 *
 * Y una opcional:
 *   ACCESS_GENERATION  numero entero. Subirlo obliga a TODAS las sedes a poner
 *                      una clave de acceso nueva en la siguiente carga. Ver
 *                      `src/core/access.js`.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { validatePayload, MAX_BYTES } from './_schema.js';

const FILE_PATH = 'data/recipes.json';
const API = 'https://api.github.com';

/**
 * Intentos fallidos por origen. Una funcion serverless no tiene estado
 * garantizado entre invocaciones, asi que esto no es un cortafuegos: solo
 * encarece la fuerza bruta mientras la instancia siga viva. La proteccion real
 * es que la clave sea larga.
 */
const attempts = new Map();

/** Intentos fallidos antes de empezar a retrasar la respuesta. */
const FREE_ATTEMPTS = 5;

/** Retraso maximo aplicado tras fallos repetidos. */
const MAX_DELAY_MS = 4000;

/** Ventana tras la cual se olvidan los intentos de un origen. */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Tope de origenes vigilados a la vez.
 *
 * Sin tope, el registro de intentos es memoria que crece sola: basta con enviar
 * claves incorrectas desde muchas direcciones distintas para llenar la
 * instancia. Al llegar al tope se descarta la entrada mas antigua, que es la
 * que menos informacion aporta.
 */
const MAX_TRACKED_ORIGINS = 5000;

/**
 * Lecturas por origen. Freno al barrido del recetario entero.
 *
 * La lectura es publica a proposito y eso no cambia aqui. Lo que se frena es
 * otra cosa: cada lectura que no venga de la copia en memoria es una peticion
 * real a GitHub con el token del servidor, y ese token tiene una cuota por
 * hora. Sin freno, cualquiera puede agotarla desde fuera en un bucle, y
 * entonces las dos sedes se quedan sin recetario compartido. El dano no es que
 * alguien lea las formulas: es que el obrador deje de poder leerlas.
 */
const lecturas = new Map();

/**
 * Lecturas permitidas por origen dentro de la ventana.
 *
 * Holgado a proposito: varias tabletas de una misma sede salen por la misma
 * direccion, asi que el limite tiene que dejar sitio a un turno entero
 * recargando. Sesenta por minuto no estorba a nadie que trabaje y convierte un
 * barrido de diez mil peticiones en casi tres horas.
 */
const MAX_LECTURAS = 60;

/** Ventana del contador de lecturas. */
const VENTANA_LECTURAS_MS = 60 * 1000;

/**
 * Copia del recetario en memoria, para no ir a GitHub en cada lectura.
 *
 * Diez segundos. Es corto a proposito: la promesa de que una publicacion nueva
 * se ve en la siguiente carga se mantiene porque al publicar se tira esta copia
 * (ver `commit`), y el unico caso que queda -alguien edita el archivo a mano en
 * GitHub- se corrige solo en esos diez segundos.
 *
 * @type {{at: number, value: {data: object, sha: string}}|null}
 */
let copia = null;

/** Tiempo que vale la copia en memoria. */
const COPIA_TTL_MS = 10 * 1000;

export default async function handler(request, response) {
  const config = readConfig();
  if (!config.ok) {
    return send(response, 500, { error: config.error });
  }

  if (request.method === 'GET') {
    return handleGet(request, response, config.value);
  }
  // Solo PUT: a diferencia de POST, siempre obliga a un preflight de CORS,
  // asi que un formulario de otro origen no puede alcanzar esta ruta sin que
  // el navegador lo bloquee antes. No hay ningun cliente real que use POST.
  if (request.method === 'PUT') {
    return handlePut(request, response, config.value);
  }

  response.setHeader('Allow', 'GET, PUT');
  return send(response, 405, { error: 'Método no permitido.' });
}

function readConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const password = process.env.EDIT_PASSWORD;

  if (!token || !repo) {
    return { ok: false, error: 'El servidor no tiene configurado el acceso al repositorio.' };
  }
  return { ok: true, value: { token, repo, branch, password, generacion: leerGeneracion() } };
}

/**
 * Generacion de acceso vigente.
 *
 * Es el sustituto de la caducidad semanal que llevaba la clave de acceso. Aquella
 * obligaba a cambiarla cada siete dias en CADA aparato por separado, y no
 * revocaba nada: quien conocia la clave se la renovaba a si mismo, y quien se
 * habia ido seguia dentro en cualquier equipo donde no tocara renovar todavia.
 * Era un ritual semanal con la apariencia de un control.
 *
 * Esto hace el trabajo que aquella prometia: subir el numero aqui invalida la
 * clave guardada en todos los aparatos a la vez, y la siguiente carga de cada
 * uno pide una nueva. Se dispara cuando hay motivo -alguien deja el equipo, la
 * clave corrio de boca en boca- y no por calendario.
 *
 * Ausente o ilegible vale 0, que es "no se ha revocado nunca": un despliegue sin
 * la variable se comporta como si la caducidad no existiera, que es justo lo que
 * se queria.
 *
 * @returns {number}
 */
function leerGeneracion() {
  const bruto = Number.parseInt(process.env.ACCESS_GENERATION || '0', 10);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 0;
}

async function handleGet(request, response, config) {
  if (excedeLecturas(clientKey(request))) {
    // 429 con `Retry-After`: al cliente de verdad esto no le pasa nunca, y a
    // quien barre se le dice cuanto esperar en lugar de dejarle reintentar en
    // vacio. El mensaje va redactado para la persona, como el resto.
    response.setHeader('Retry-After', String(VENTANA_LECTURAS_MS / 1000));
    return send(response, 429, {
      error: 'Demasiadas consultas seguidas. Espera un minuto y vuelve a intentarlo.',
    });
  }

  const file = await leerRecetario(config);
  if (!file.ok) {
    return send(response, file.status || 502, { error: file.error });
  }

  // Sin cache: una publicacion nueva debe verse en la siguiente carga.
  response.setHeader('Cache-Control', 'no-store, must-revalidate');
  return send(response, 200, {
    ...file.value.data,
    sha: file.value.sha,
    accesoGen: config.generacion,
  });
}

async function handlePut(request, response, config) {
  // Solo se acepta JSON declarado. Es defensa en profundidad, no el cierre de
  // un hueco abierto: hoy PUT nunca es una "peticion simple" de CORS, asi que
  // un envio cruzado ya obliga a un preflight que esta ruta no responde, y no
  // llega. Lo que protege esta comprobacion es el futuro: si algun dia se
  // aceptara POST, que SI puede ser peticion simple con `text/plain`, un
  // formulario de otro origen alcanzaria el manejador y el commit se habria
  // hecho aunque el atacante no pudiera leer la respuesta.
  //
  // El cliente real siempre declara JSON (`core/remote.js`), asi que exigirlo
  // no le quita nada.
  if (!esJson(request.headers['content-type'])) {
    return send(response, 415, { error: 'El envío debe declararse como application/json.' });
  }

  const body = await readBody(request);
  if (!body.ok) {
    return send(response, 400, { error: body.error });
  }

  const auth = await checkAuth(request, body.value, config);
  if (!auth.ok) {
    return send(response, auth.status, { error: auth.error });
  }

  // SOLO COMPROBAR LA CLAVE, SIN ESCRIBIR NADA.
  //
  // El recetario pide la clave de edicion antes de dejar crear, modificar o
  // eliminar una receta, y para eso necesita saber si es correcta ANTES de que
  // haya nada que publicar. Sin esto, la unica forma de comprobarla seria
  // intentar una publicacion de verdad.
  //
  // Va despues de `checkAuth`, asi que una clave incorrecta sigue contando
  // como intento fallido y sigue arrastrando el retraso creciente: esta puerta
  // no es un atajo para probar claves mas rapido que por la via normal.
  //
  // Y va ANTES de validar el recetario, porque una comprobacion no lleva
  // recetas dentro.
  if (body.value.verificar === true) {
    return send(response, 200, { ok: true, verificada: true });
  }

  // La validacion del navegador no cuenta aqui: quien llame a la API
  // directamente se la salta entera.
  const validated = validatePayload(body.value.recipes, body.value.ingredientes);
  if (!validated.ok) {
    return send(response, 400, { error: validated.error });
  }

  // El sha es obligatorio. Sin el no hay control de concurrencia posible, y un
  // envio ciego sobrescribiria el recetario de las dos sedes sin comprobar nada.
  if (typeof body.value.sha !== 'string' || body.value.sha === '') {
    return send(response, 400, {
      error: 'Vuelve a cargar el recetario antes de publicar: falta la referencia de la versión.',
    });
  }

  const current = await fetchFile(config);
  if (!current.ok) {
    return send(response, current.status || 502, { error: current.error });
  }

  if (body.value.sha !== current.value.sha) {
    return send(response, 409, {
      error:
        'Otro equipo publicó cambios mientras editabas. Vuelve a cargar el recetario y aplica tus cambios sobre la versión nueva.',
    });
  }

  return commit(response, config, validated.value, current.value.sha, body.value.author);
}

/**
 * Comprueba la clave de edicion, con retraso creciente tras fallos repetidos.
 *
 * @returns {Promise<{ok: true} | {ok: false, status: number, error: string}>}
 */
async function checkAuth(request, payload, config) {
  if (!config.password) {
    return { ok: false, status: 500, error: 'El servidor no tiene configurada la clave de edición.' };
  }

  const origin = clientKey(request);
  const failed = readAttempts(origin);

  if (typeof payload.password !== 'string' || !safeEqual(payload.password, config.password)) {
    registrarFallo(origin, failed);
    if (failed >= FREE_ATTEMPTS) {
      const delay = Math.min(MAX_DELAY_MS, 2 ** (failed - FREE_ATTEMPTS) * 250);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return { ok: false, status: 401, error: 'Clave de edición incorrecta.' };
  }

  attempts.delete(origin);
  return { ok: true };
}

/**
 * ¿La cabecera declara JSON? Acepta los parametros habituales del tipo, como
 * `application/json; charset=utf-8`.
 *
 * @param {string|undefined} header
 * @returns {boolean}
 */
function esJson(header) {
  if (typeof header !== 'string') return false;
  return header.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * Con que se identifica a quien llama, para el freno de intentos y de lecturas.
 *
 * NO se toma el PRIMER elemento de `x-forwarded-for`. Esa cabecera la puede
 * escribir cualquiera, y los proxies ANADEN al final en vez de reemplazar: el
 * primer elemento es, literalmente, texto que manda quien llama. Con el, una
 * peticion por IP inventada estrenaba contador cada vez, y las dos defensas del
 * servidor -el freno a la fuerza bruta contra `EDIT_PASSWORD` y el tope de
 * lecturas que protege la cuota del token- dejaban de existir.
 *
 * Se prefiere `x-real-ip`, que pone la plataforma y el cliente no puede
 * sustituir. Si no esta, se toma el ULTIMO elemento de la cadena, que es el que
 * escribio el proxy mas cercano y no quien llama.
 *
 * @param {object} request
 * @returns {string}
 */
function clientKey(request) {
  const real = request.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();

  const header = request.headers['x-forwarded-for'];
  if (typeof header === 'string' && header) {
    const partes = header.split(',');
    return partes[partes.length - 1].trim();
  }

  return 'desconocido';
}

/**
 * Anota un fallo, manteniendo el registro dentro de su tope.
 *
 * `Map` conserva el orden de insercion, asi que la primera clave es siempre la
 * mas antigua y basta con retirar esa.
 *
 * @param {string} origin
 * @param {number} failed intentos previos de ese origen
 */
function registrarFallo(origin, failed) {
  if (!attempts.has(origin) && attempts.size >= MAX_TRACKED_ORIGINS) {
    const masAntiguo = attempts.keys().next().value;
    if (masAntiguo !== undefined) attempts.delete(masAntiguo);
  }
  attempts.set(origin, { count: failed + 1, at: Date.now() });
}

function readAttempts(origin) {
  const record = attempts.get(origin);
  if (!record) return 0;
  if (Date.now() - record.at > ATTEMPT_WINDOW_MS) {
    attempts.delete(origin);
    return 0;
  }
  return record.count;
}

/**
 * Anota una lectura y dice si ese origen ya paso del limite.
 *
 * La ventana es fija y no deslizante: al vencer se empieza a contar de cero.
 * Es menos fino, pero cabe en unas pocas lineas sin estado externo, y para lo
 * que hace falta -que nadie vacie la cuota de GitHub en un bucle- sobra.
 *
 * Mismo tope de origenes vigilados que los intentos fallidos, y por el mismo
 * motivo: un registro sin tope es memoria que crece sola.
 *
 * @param {string} origin
 * @returns {boolean} true si hay que rechazar la peticion
 */
function excedeLecturas(origin) {
  const ahora = Date.now();
  const registro = lecturas.get(origin);

  if (!registro || ahora - registro.desde > VENTANA_LECTURAS_MS) {
    if (!lecturas.has(origin) && lecturas.size >= MAX_TRACKED_ORIGINS) {
      const masAntiguo = lecturas.keys().next().value;
      if (masAntiguo !== undefined) lecturas.delete(masAntiguo);
    }
    lecturas.set(origin, { count: 1, desde: ahora });
    return false;
  }

  registro.count += 1;
  return registro.count > MAX_LECTURAS;
}

/**
 * Lee el recetario, reutilizando la copia en memoria si sigue fresca.
 *
 * Solo se guarda la lectura buena: cachear un fallo lo convertiria en diez
 * segundos de fallo para todo el mundo, incluida la sede que no tiene culpa.
 *
 * @returns {Promise<{ok: true, value: {data: object, sha: string}} | {ok: false, status?: number, error: string}>}
 */
async function leerRecetario(config) {
  if (copia && Date.now() - copia.at < COPIA_TTL_MS) {
    return { ok: true, value: copia.value };
  }

  const file = await fetchFile(config);
  if (file.ok) copia = { at: Date.now(), value: file.value };
  return file;
}

async function commit(response, config, value, sha, rawAuthor) {
  const content = {
    version: 2,
    revision: new Date().toISOString().slice(0, 19).replace('T', ' '),
    recipes: value.recipes,
    ingredientes: value.ingredientes,
  };

  // EL TOPE SE MIDE SOBRE LO QUE SE VA A ESCRIBIR, no sobre el cuerpo recibido.
  // Lo que llega viene compacto y lo que se sube lleva sangrado de dos espacios
  // y un salto por linea, asi que el archivo escrito es bastante mayor que el
  // que se midio en `readBody`. Sin esta segunda medida se podia publicar un
  // recetario que despues la API de contenidos ya no entregaria, que es
  // exactamente el fallo que el tope existe para evitar.
  const serializado = JSON.stringify(content, null, 2) + '\n';
  if (Buffer.byteLength(serializado, 'utf8') > MAX_BYTES) {
    return send(response, 400, {
      error: 'El recetario resultante es demasiado grande para publicarse.',
    });
  }

  const encoded = Buffer.from(serializado, 'utf8').toString('base64');

  // Los saltos de linea se aplastan ANTES de recortar: el autor va dentro del
  // asunto del commit, y un salto ahi convierte todo lo que sigue en cuerpo del
  // mensaje. La atribucion ya no es verificable -la declara el navegador-, pero
  // eso no es razon para dejar escribir el historial a medida.
  const author =
    typeof rawAuthor === 'string' && rawAuthor.trim()
      ? rawAuthor.replace(/[\r\n]+/g, ' ').trim().slice(0, 60)
      : 'recetario';

  let committed;
  try {
    committed = await fetch(`${API}/repos/${config.repo}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: githubHeaders(config.token),
      body: JSON.stringify({
        message: `datos: actualiza el recetario (${content.recipes.length} recetas) desde ${author}`,
        content: encoded,
        sha,
        branch: config.branch,
      }),
    });
  } catch {
    return send(response, 502, { error: 'No se pudo contactar con el repositorio.' });
  }

  if (!committed.ok) {
    if (committed.status === 409) {
      return send(response, 409, { error: 'Conflicto al publicar. Vuelve a cargar y reintenta.' });
    }
    // El detalle del error de GitHub se queda en el registro del servidor: puede
    // llevar informacion de configuracion del repositorio.
    console.error('publicacion rechazada por GitHub', committed.status, await safeText(committed));
    return send(response, 502, { error: 'No se pudo publicar en el repositorio.' });
  }

  // El recetario acaba de cambiar: la copia en memoria ya no vale. Sin esto,
  // la sede que publica podria recargar y seguir viendo lo de antes durante
  // diez segundos, que es justo lo que la regla "una publicacion nueva se ve en
  // la siguiente carga" promete que no pasa.
  copia = null;

  const result = await committed.json();
  return send(response, 200, {
    ok: true,
    revision: content.revision,
    count: content.recipes.length,
    sha: result.content ? result.content.sha : null,
  });
}

async function fetchFile(config) {
  let res;
  try {
    res = await fetch(
      `${API}/repos/${config.repo}/contents/${FILE_PATH}?ref=${encodeURIComponent(config.branch)}`,
      { headers: githubHeaders(config.token) },
    );
  } catch {
    return { ok: false, status: 502, error: 'No se pudo contactar con el repositorio.' };
  }

  if (res.status === 404) {
    return { ok: false, status: 404, error: 'El archivo de recetas no existe en el repositorio.' };
  }
  if (!res.ok) {
    return { ok: false, status: 502, error: 'El repositorio rechazó la lectura.' };
  }

  const meta = await res.json();
  let data;
  try {
    data = JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'));
  } catch {
    return { ok: false, status: 502, error: 'El archivo de recetas del repositorio no es un JSON válido.' };
  }

  return { ok: true, value: { data, sha: meta.sha } };
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'zahavi-recetario',
  };
}

/**
 * Lee el cuerpo del envio. Vercel ya entrega `request.body` parseado cuando el
 * tipo es JSON, asi que el limite de tamano se comprueba sobre ese objeto y no
 * solo en la lectura manual, que en la practica no llega a usarse.
 */
async function readBody(request) {
  if (request.body && typeof request.body === 'object') {
    let size;
    try {
      // `length` cuenta unidades UTF-16, no bytes, y el tope existe para no
      // pasar del techo de GitHub, que se mide en bytes. Cada acento, cada ñ y
      // cada signo de apertura ocupan un byte mas de lo que esa cuenta dice, y
      // aqui el texto va en espanol: la medida tiene que ser la de verdad.
      size = Buffer.byteLength(JSON.stringify(request.body), 'utf8');
    } catch {
      return { ok: false, error: 'El cuerpo del envío no se pudo interpretar.' };
    }
    if (size > MAX_BYTES) return { ok: false, error: 'El envío es demasiado grande.' };
    return { ok: true, value: request.body };
  }

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BYTES) return { ok: false, error: 'El envío es demasiado grande.' };
      chunks.push(chunk);
    }
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { ok: false, error: 'El cuerpo del envío no es un JSON válido.' };
  }
}

/**
 * Comparacion en tiempo constante, sobre el RESUMEN de cada valor.
 *
 * La version anterior comparaba las cadenas directamente y salia antes de
 * tiempo cuando las longitudes no coincidian, asi que el tiempo de respuesta
 * revelaba la longitud exacta de la clave. Con longitud conocida el espacio de
 * busqueda de una fuerza bruta se reduce muchisimo.
 *
 * Comparar los SHA-256 lo resuelve de raiz: los dos resumenes miden siempre 32
 * bytes, asi que `timingSafeEqual` nunca puede fallar por longitud y no queda
 * nada que medir. `timingSafeEqual` es la comparacion en tiempo constante de la
 * biblioteca estandar, escrita para esto.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const resumenA = createHash('sha256').update(a, 'utf8').digest();
  const resumenB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(resumenA, resumenB);
}

async function safeText(res) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}

function send(response, status, payload) {
  response.status(status);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}
