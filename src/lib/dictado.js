/**
 * =============================================================================
 *  DICTADO POR VOZ
 * =============================================================================
 *
 *  POR QUE EXISTE
 *  --------------
 *  Ninguna de las 122 recetas tiene el metodo escrito (`CLAUDE.md` §13), y no
 *  es por dejadez: en el obrador no hay tiempo de teclear media pagina de
 *  texto con las manos en la masa. Lo pidio el usuario asi:
 *
 *      "no da el tiempo dentro de la produccion y interfaz de usuario de
 *       registrar de manera manual los metodos, quisiera introducir un
 *       activador de microfono... y de esa forma poder agilizar el registro de
 *       este texto que puede ser bastante largo"
 *
 *  AVISO DE PRIVACIDAD, Y NO ES LETRA PEQUENA
 *  ------------------------------------------
 *  En Chrome y en Android, `SpeechRecognition` **envia el audio del microfono a
 *  un servidor del fabricante** para transcribirlo. Safari hace lo equivalente
 *  con los de Apple.
 *
 *  El matiz tecnico es que esa peticion NO la hace esta pagina: la hace el
 *  navegador por dentro, asi que no pasa por la CSP, no aparece en el panel de
 *  red y `connect-src 'self'` no la impide. Pero desde el punto de vista de
 *  quien usa el recetario, el audio del obrador sale del aparato hacia un
 *  tercero, y eso contradice el "cero peticiones a terceros" que el proyecto
 *  declara como metrica.
 *
 *  De ahi se siguen tres decisiones, y las tres son deliberadas:
 *    1. El dictado NUNCA es la unica forma de escribir un metodo. El teclado
 *       sigue ahi, porque a las cinco de la manana sin cobertura esto no existe.
 *    2. Hay que pulsarlo cada vez. No se queda escuchando.
 *    3. La interfaz lo dice junto al boton, ANTES de que nadie hable.
 *
 *  ESTE MODULO NO SABE QUE EXISTE UNA PANTALLA.
 *  Devuelve estados y texto por callbacks; quien llama decide que pintar y que
 *  anunciar. Vive en `lib/` y no importa de `core/`, `app/` ni `views/`.
 *
 *  Y NUNCA LANZA. Un fallo del microfono no puede tumbar el editor con una
 *  receta a medio escribir dentro.
 */

/** Idioma por defecto. La panaderia esta en Colombia. */
const IDIOMA = 'es-CO';

/**
 * Cuantas veces seguidas se puede reenganchar el reconocedor sin haber oido
 * nada antes de rendirse.
 *
 * Hace falta un tope: en Android el reconocimiento se corta solo tras unos
 * segundos de silencio, y el reenganche automatico es lo unico que permite
 * dictar un parrafo largo con pausas. Pero si el microfono esta mudo -tapado,
 * sin permiso real, o roto- ese mismo reenganche se vuelve un bucle que
 * consume bateria sin que nadie lo note.
 */
const REENGANCHES_EN_VACIO = 3;

/** Ventana en la que se cuentan esos reenganches. */
const VENTANA_MS = 2000;

/**
 * Textos de error, ya redactados para la persona.
 *
 * Ninguno lleva el codigo crudo, ninguno culpa a quien dicta, y todos dicen que
 * hacer a continuacion. El de `no-speech` promete ademas que no se ha perdido
 * nada, porque es el miedo inmediato de quien acaba de dictar tres minutos.
 */
const MENSAJES = {
  'not-allowed':
    'No se pudo usar el micrófono: el navegador no dio permiso. Ábrelo en los ajustes del sitio y vuelve a pulsar Dictar.',
  'service-not-allowed':
    'No se pudo usar el micrófono: el navegador no dio permiso. Ábrelo en los ajustes del sitio y vuelve a pulsar Dictar.',
  'no-speech':
    'No se oyó nada. Acerca el aparato y vuelve a pulsar Dictar. No se ha borrado nada de lo dictado.',
  network: 'El dictado necesita conexión y ahora no hay. Puedes escribir el método a mano.',
  'audio-capture': 'Este aparato no tiene micrófono disponible.',
};

/** El que se usa cuando el navegador devuelve un codigo que no conocemos. */
const MENSAJE_GENERICO =
  'El dictado se detuvo por un problema del micrófono. Puedes volver a pulsar Dictar o escribir a mano.';

/**
 * Constructor del reconocedor, o null si este navegador no lo trae.
 *
 * @returns {Function|null}
 */
function constructor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Indica si se puede dictar en este navegador.
 *
 * Quien llama usa esto para decidir si PINTA el boton. No se pinta y se
 * deshabilita: un control muerto invita a tocarlo y a preguntarse que pasa.
 *
 * @returns {boolean}
 */
export function dictadoDisponible() {
  return constructor() !== null;
}

/**
 * Crea un dictado.
 *
 * @param {Object} options
 * @param {string} [options.idioma]
 * @param {(texto: string) => void} [options.onTexto] tramo CONFIRMADO
 * @param {(texto: string) => void} [options.onParcial] tramo aun provisional
 * @param {(estado: 'pidiendo'|'escuchando'|'detenido') => void} [options.onEstado]
 * @param {(mensaje: string) => void} [options.onError] mensaje ya redactado
 * @returns {{iniciar: () => void, detener: () => void, activo: () => boolean}}
 */
export function crearDictado(options = {}) {
  const Reconocedor = constructor();

  // Sin soporte se devuelve un objeto que no hace nada, en vez de null. Asi
  // quien llama no tiene que comprobar antes de cada uso, y si se le olvidara
  // pintar el boton, pulsarlo no romperia nada.
  if (!Reconocedor) {
    return { iniciar() {}, detener() {}, activo: () => false };
  }

  let reconocedor = null;
  /** Lo ha pedido la persona, frente a "esta corriendo ahora mismo". */
  let queriendo = false;
  /** Reenganches seguidos sin haber confirmado nada. */
  let vacios = 0;
  /** Cuando empezo la racha de reenganches en vacio. */
  let desde = 0;

  const avisar = (estado) => {
    if (typeof options.onEstado === 'function') options.onEstado(estado);
  };

  const fallar = (mensaje) => {
    if (typeof options.onError === 'function') options.onError(mensaje);
  };

  function construir() {
    const r = new Reconocedor();
    r.lang = options.idioma || IDIOMA;
    // `continuous` pide que no se pare en la primera pausa. Android lo ignora a
    // medias y por eso existe el reenganche de mas abajo.
    r.continuous = true;
    // Los provisionales son los que permiten ver que la cosa va escribiendo.
    // Sin ellos el dictado parece colgado hasta que se confirma la frase.
    r.interimResults = true;

    r.onresult = (evento) => {
      let confirmado = '';
      let provisional = '';

      // Se recorre DESDE `resultIndex`, no desde cero. El evento trae la lista
      // acumulada de la sesion, y volver a leerla entera desde el principio es
      // exactamente como se duplica el texto: cada tanda reescribiria todo lo
      // anterior otra vez.
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i];
        const trozo = resultado[0] ? resultado[0].transcript : '';
        if (resultado.isFinal) confirmado += trozo;
        else provisional += trozo;
      }

      if (confirmado.trim() !== '') {
        vacios = 0;
        if (typeof options.onTexto === 'function') options.onTexto(confirmado.trim());
      }

      // Lo provisional se REEMPLAZA, nunca se acumula: es una vista previa de
      // la frase en curso, y acumularla escribiria cada palabra varias veces.
      if (typeof options.onParcial === 'function') options.onParcial(provisional.trim());
    };

    r.onerror = (evento) => {
      const codigo = evento && evento.error;

      // Lo detuvo la persona: no es un error y no se dice nada.
      if (codigo === 'aborted') return;

      // `no-speech` en medio de un dictado largo es normal -una pausa para
      // pensar- y el reenganche lo cubre. Solo se cuenta como error cuando la
      // racha se agota, mas abajo.
      if (codigo === 'no-speech') return;

      queriendo = false;
      fallar(MENSAJES[codigo] || MENSAJE_GENERICO);
      avisar('detenido');
    };

    r.onend = () => {
      if (!queriendo) {
        avisar('detenido');
        return;
      }

      // REENGANCHE. Aqui es donde se sostiene un dictado largo en Android.
      const ahora = Date.now();
      if (ahora - desde > VENTANA_MS) {
        desde = ahora;
        vacios = 0;
      }
      vacios += 1;

      if (vacios > REENGANCHES_EN_VACIO) {
        queriendo = false;
        fallar('El dictado se detuvo solo. Pulsa Dictar para seguir donde ibas.');
        avisar('detenido');
        return;
      }

      try {
        r.start();
      } catch {
        // `start()` lanza si el reconocedor aun no termino de soltarse. No es
        // recuperable desde aqui y tampoco es grave: se da por detenido y la
        // persona vuelve a pulsar.
        queriendo = false;
        avisar('detenido');
      }
    };

    r.onstart = () => {
      avisar('escuchando');
    };

    return r;
  }

  return {
    iniciar() {
      if (queriendo) return;
      queriendo = true;
      vacios = 0;
      desde = Date.now();
      avisar('pidiendo');

      try {
        reconocedor = construir();
        reconocedor.start();
      } catch {
        // Pasa al pulsar dos veces muy seguido, y tambien si la plataforma lo
        // bloquea por cabecera (`Permissions-Policy: microphone=()`).
        queriendo = false;
        fallar(MENSAJE_GENERICO);
        avisar('detenido');
      }
    },

    detener() {
      queriendo = false;
      if (!reconocedor) {
        avisar('detenido');
        return;
      }
      try {
        // `stop()` y no `abort()`: `stop` entrega lo ultimo que oyo antes de
        // cerrar, y `abort` lo tira. Al soltar el boton, lo que se acaba de
        // decir tiene que llegar al texto.
        reconocedor.stop();
      } catch {
        avisar('detenido');
      }
    },

    activo() {
      return queriendo;
    },
  };
}
