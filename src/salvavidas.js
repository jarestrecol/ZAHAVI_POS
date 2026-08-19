/**
 * =============================================================================
 *  RED DE SEGURIDAD DEL ARRANQUE
 * =============================================================================
 *
 *  EL FALLO QUE CUBRE
 *  ------------------
 *  `index.html` pinta "Cargando recetario..." y confia en que `main.js` lo
 *  sustituya. Si `main.js` no llega a ejecutarse (un despliegue a medias, un
 *  archivo que la cache guardo roto, una politica de seguridad que bloquea el
 *  modulo, una version de navegador que no entiende algo), NADIE retira ese
 *  texto: la pantalla se queda cargando para siempre, sin explicacion y sin
 *  salida. En una panaderia a las cinco de la mañana eso es el recetario
 *  entero perdido.
 *
 *  POR QUE ES UN ARCHIVO APARTE Y NO UN SCRIPT DENTRO DEL HTML
 *  ----------------------------------------------------------
 *  La politica de seguridad del sitio declara `script-src 'self'`, que prohibe
 *  el codigo escrito dentro de la pagina. Un `<script>` con el codigo aqui
 *  dentro no llegaria a ejecutarse nunca.
 *
 *  POR QUE NO ES UN MODULO
 *  -----------------------
 *  Los modulos se ejecutan siempre despues del documento y comparten la suerte
 *  del resto de modulos. Este archivo tiene que estar en marcha ANTES de que
 *  `main.js` falle, y tiene que poder ejecutarse aunque el navegador no
 *  soporte lo que `main.js` usa. Por eso es un script clasico, sin `import` y
 *  sin sintaxis moderna.
 *
 *  LO QUE NO HACE
 *  --------------
 *  No arregla nada ni reintenta por su cuenta: solo cambia un final mudo por
 *  una pantalla que dice que ha pasado y ofrece dos salidas. La segunda, borrar
 *  la copia guardada, es la que resuelve el caso mas comun de todos, que es una
 *  version vieja o corrupta guardada por el service worker.
 */

(function () {
  'use strict';

  /**
   * Margen antes de dar el arranque por perdido.
   *
   * Tiene que ser MAYOR que el tiempo maximo que puede tardar la carga normal.
   * La lectura del recetario compartido corta a los 12 segundos por su cuenta
   * (`TIMEOUT_MS` en `core/remote.js`), asi que por debajo de eso este aviso
   * saltaria encima de una carga que iba a terminar bien.
   */
  var ESPERA_MS = 18000;

  var avisado = false;

  /** El arranque termino: `main.js` lo marca al final de `boot()`. */
  function arranco() {
    return document.documentElement.getAttribute('data-arranque') === 'listo';
  }

  /**
   * Sustituye la pantalla de carga por el aviso de fallo.
   *
   * @param {string} titulo
   * @param {string} explicacion
   * @param {string} detalle pista tecnica, o cadena vacia
   */
  function avisar(titulo, explicacion, detalle) {
    if (avisado || arranco()) return;

    var app = document.getElementById('app');
    if (!app) return;

    // Si la aplicacion ya pinto algo distinto de la pantalla de carga, no se
    // toca: puede estar funcionando aunque haya habido un error suelto por
    // detras, y borrarle la pantalla a alguien que esta trabajando seria peor
    // que el propio fallo.
    if (!app.querySelector('.booting')) return;

    avisado = true;

    var caja = document.createElement('div');
    caja.className = 'fallo';

    var interior = document.createElement('div');
    interior.className = 'fallo__inner';

    var marca = document.createElement('p');
    marca.className = 'fallo__brand';
    marca.textContent = 'Zahavi · Recetario';
    interior.appendChild(marca);

    var h1 = document.createElement('h1');
    h1.className = 'fallo__title';
    h1.textContent = titulo;
    interior.appendChild(h1);

    var p = document.createElement('p');
    p.className = 'fallo__text';
    p.textContent = explicacion;
    interior.appendChild(p);

    var acciones = document.createElement('div');
    acciones.className = 'fallo__actions';

    var reintentar = document.createElement('button');
    reintentar.type = 'button';
    reintentar.className = 'fallo__btn fallo__btn--primary';
    reintentar.textContent = 'Volver a intentarlo';
    reintentar.onclick = function () {
      window.location.reload();
    };
    acciones.appendChild(reintentar);

    var limpiar = document.createElement('button');
    limpiar.type = 'button';
    limpiar.className = 'fallo__btn';
    limpiar.textContent = 'Borrar la copia guardada y recargar';
    limpiar.onclick = function () {
      limpiar.disabled = true;
      limpiar.textContent = 'Borrando…';
      limpiarYRecargar();
    };
    acciones.appendChild(limpiar);

    interior.appendChild(acciones);

    var nota = document.createElement('p');
    nota.className = 'fallo__note';
    nota.textContent =
      'Las recetas guardadas en este equipo no se borran: lo que se borra es la copia del programa.';
    interior.appendChild(nota);

    if (detalle) {
      var tecnico = document.createElement('p');
      tecnico.className = 'fallo__detail';
      tecnico.textContent = detalle;
      interior.appendChild(tecnico);
    }

    caja.appendChild(interior);
    app.textContent = '';
    app.appendChild(caja);
  }

  /**
   * Borra el service worker y sus cachés, y recarga.
   *
   * Es la salida al caso mas frecuente: una version del programa guardada a
   * medias o corrupta que se sirve una y otra vez desde la copia local. NO toca
   * `localStorage`, que es donde viven las recetas y los cambios sin publicar.
   */
  function limpiarYRecargar() {
    var tareas = [];

    if (window.caches && window.caches.keys) {
      tareas.push(
        window.caches.keys().then(function (claves) {
          return Promise.all(
            claves.map(function (clave) {
              return window.caches.delete(clave);
            }),
          );
        }),
      );
    }

    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tareas.push(
        navigator.serviceWorker.getRegistrations().then(function (registros) {
          return Promise.all(
            registros.map(function (registro) {
              return registro.unregister();
            }),
          );
        }),
      );
    }

    Promise.all(tareas)
      .catch(function () {
        /* si algo no se pudo borrar, se recarga igual: peor es quedarse aqui */
      })
      .then(function () {
        // `reload` a secas puede volver a servir lo mismo desde la cache del
        // navegador; con un parametro distinto se fuerza una peticion nueva.
        window.location.replace(window.location.pathname + '?limpio=' + Date.now());
      });
  }

  // 1. Un recurso del arranque no se pudo cargar. El evento `error` de un
  //    `<script>` o un `<link>` no burbujea, asi que hay que escucharlo en
  //    fase de captura: sin el `true` final esto no se entera de nada.
  window.addEventListener(
    'error',
    function (evento) {
      var destino = evento.target;

      // Solo los SCRIPT. Una hoja de estilo que falta deja el recetario feo
      // pero utilizable, y taparlo con un aviso a pantalla completa seria peor
      // que el propio fallo. Si ademas impidiera arrancar, el temporizador de
      // mas abajo lo recoge igual.
      if (destino && destino !== window && destino.tagName === 'SCRIPT') {
        avisar(
          'No se pudo cargar el recetario',
          'Falta parte del programa. Suele pasar cuando la conexión se cortó a mitad de una actualización.',
          'No se pudo cargar: ' + (destino.src || 'un archivo del programa'),
        );
        return;
      }

      // 2. El codigo se cargo pero reventó al ejecutarse.
      if (evento.message) {
        avisar(
          'El recetario no pudo arrancar',
          'Hubo un error al poner en marcha el programa. Vuelve a intentarlo; si sigue igual, borra la copia guardada.',
          String(evento.message),
        );
      }
    },
    true,
  );

  // 3. Una promesa del arranque quedo rechazada sin capturar.
  window.addEventListener('unhandledrejection', function (evento) {
    var razon = evento && evento.reason;
    avisar(
      'El recetario no pudo arrancar',
      'Hubo un error al poner en marcha el programa. Vuelve a intentarlo; si sigue igual, borra la copia guardada.',
      razon ? String(razon.message || razon) : '',
    );
  });

  // 4. Nadie fallo, pero tampoco termino. Cubre lo que no lanza error: una
  //    peticion que nunca contesta, o un navegador que se queda a medias.
  window.setTimeout(function () {
    avisar(
      'El recetario está tardando demasiado',
      'La carga no ha terminado. Puede ser la conexión, o una copia guardada que quedó a medias.',
      '',
    );
  }, ESPERA_MS);
})();
