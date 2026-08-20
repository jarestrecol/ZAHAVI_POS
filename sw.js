/**
 * Service worker del recetario.
 *
 * Objetivo: que el recetario abra al instante y siga funcionando cuando no hay
 * señal. En una cocina la conexión se cae, y quedarse sin las recetas a media
 * producción no es aceptable.
 *
 * Estrategia por tipo de recurso:
 *   - Carcasa (HTML, CSS, JS): primero la caché, porque no cambia salvo que se
 *     publique una versión nueva. Arranque inmediato.
 *   - Recetas (data/recipes.json): primero la red, para recoger enseguida una
 *     publicación nueva; si no hay red, la copia guardada.
 *
 * Al cambiar CACHE_VERSION se descarta la caché anterior por completo.
 */
const CACHE_VERSION = 'zahavi-v24';
const DATA_URL = 'data/recipes.json';
/** Carcasa de la aplicación: todo lo necesario para arrancar sin red. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png',
  './assets/logo-zahavi.png',
  './assets/css/fonts.css',
  './assets/css/tokens.css',
  './assets/css/base.css',
  './assets/css/layout.css',
  './assets/css/sheet.css',
  './assets/css/views.css',
  './assets/css/dialogs.css',
  './assets/css/print.css',
  './assets/css/fallback.css',
  './assets/css/responsive.css',
  './assets/fonts/plus-jakarta-sans-400.woff2',
  './assets/fonts/lora-500i.woff2',
  './assets/fonts/lora-600.woff2',
  './assets/fonts/ibm-plex-mono-400.woff2',
  './assets/fonts/ibm-plex-mono-500.woff2',
  './assets/fonts/ibm-plex-mono-600.woff2',
  './assets/fonts/ibm-plex-mono-700.woff2',
  './src/main.js',
  './src/salvavidas.js',
  './src/app/commands.js',
  './src/app/sync.js',
  './src/views/skeleton.js',
  './src/lib/dom.js',
  './src/lib/format.js',
  './src/lib/a11y.js',
  './src/core/storage.js',
  './src/core/schema.js',
  './src/core/repository.js',
  './src/core/access.js',
  './src/core/store.js',
  './src/core/router.js',
  './src/core/remote.js',
  './src/core/search.js',
  './src/core/scale.js',
  './src/core/plan.js',
  './src/core/ingredients.js',
  './src/core/version.js',
  './src/views/window.js',
  './src/views/login.js',
  './src/views/header.js',
  './src/views/sidebar.js',
  './src/views/detail.js',
  './src/views/editor.js',
  './src/views/settings.js',
  './src/views/publicar.js',
  './src/views/desbloquear.js',
  './src/views/confirm.js',
  './src/views/print.js',
  './src/views/production.js',
  './src/views/plan.js',
  './src/views/ingredients.js',
  './data/recipes.json',
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // addAll falla entero si un recurso falla; se piden de a uno para que un
      // archivo ausente no deje la aplicación sin caché.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // EL RECETARIO COMPARTIDO NO SE TOCA. Va a la red, siempre, sin pasar por
  // aqui: es lo que ven las dos sedes en vivo.
  //
  // Sin esta salida caia en `cacheFirst`, que es el destino por defecto de
  // todo lo que no es documento, CSS ni JS. Con la publicacion apagada no se
  // notaba, porque una respuesta de error no se guarda; en cuanto la API
  // empieza a contestar, el efecto es doble y el segundo es el malo:
  //
  //   1. Se veria el recetario de la lectura anterior, no el de ahora.
  //   2. El `sha` vendria de esa copia vieja, y publicar con un sha viejo lo
  //      rechaza el servidor con un 409 "otro equipo publico antes" aunque no
  //      haya publicado nadie.
  //
  // No se pierde el modo sin conexion: la copia para trabajar sin señal es la
  // de `localStorage`, que gestiona `core/repository.js`, no esta cache.
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.endsWith(DATA_URL) || url.pathname.endsWith('/recipes.json')) {
    event.respondWith(networkFirst(request));
    return;
  }
  // El documento y el codigo van por red primero: si se publica una version
  // nueva del sitio debe verse en la siguiente carga. Con cache primero, un
  // cambio de CSS o de vista no llegaba nunca al dispositivo.
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});
/**
 * Devuelve la copia guardada y, en paralelo, refresca la caché para la próxima vez.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) {
    refresh(request);
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Navegación sin red y sin copia: se sirve la portada, que sí está cacheada.
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Sin conexión y sin copia guardada.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
/**
 * Intenta la red primero para detectar una publicación nueva; si falla, sirve
 * la última copia guardada.
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Navegacion sin red y sin copia EXACTA de esa direccion: se sirve la
    // portada, que si esta guardada. Sin esto salia la pantalla de error del
    // navegador, y era facil llegar ahi: basta con abrir el recetario desde un
    // enlace con la direccion escrita de otra forma, o desde el acceso directo
    // instalado. La misma salida existia en `cacheFirst`, pero desde que las
    // navegaciones van por aqui esa red de seguridad habia dejado de aplicarse.
    if (request.mode === 'navigate') {
      const shell = (await caches.match('./index.html')) || (await caches.match('./'));
      if (shell) return shell;
    }

    throw new Error('sin red y sin copia de las recetas');
  }
}
function refresh(request) {
  fetch(request)
    .then((response) => {
      if (!response.ok) return;
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, response));
    })
    .catch(() => {
      /* sin red: se sigue con la copia guardada */
    });
}
