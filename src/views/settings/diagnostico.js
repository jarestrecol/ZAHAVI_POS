/**
 * =============================================================================
 *  AJUSTES · CONEXION
 * =============================================================================
 *
 *  Cuatro lineas que se leen por telefono a quien lleva el sistema cuando algo
 *  no va. Es lo primero que hay que mirar y por eso no dice nada tecnico: cada
 *  linea nombra una capacidad y dice si esta o no esta.
 */

import { el } from '../../lib/dom.js';

/* ===========================================================================
 *  1b. DIAGNOSTICO
 * ======================================================================== */

/**
 * Estado real del enlace con el recetario compartido.
 *
 * EXISTE PARA CONTESTAR UNA SOLA PREGUNTA: "no me guarda, ¿que pasa?". Antes,
 * responderla obligaba a abrir las herramientas del navegador y mirar si la
 * peticion a `/api/recipes` contestaba, algo que no puede hacer quien esta
 * detras del mostrador. Cuatro lineas evitan esa llamada de telefono.
 *
 * Se muestra tal cual, sin suavizarlo: si este equipo no publica, hay que
 * poder leerlo aqui en una linea.
 */
export function renderDiagnosisBlock(options) {
  const server = options.server || { state: 'desconocido', readAt: null };
  const sync = options.sync || { motivo: '', texto: '' };

  return el('section', { class: 'settings__row settings__row--diagnostico' }, [
    el('h3', { class: 'section-label', text: 'Conexión' }),

    el('dl', { class: 'diag' }, [
      ...linea('Recetario compartido', estadoDelServidor(server.state)),
      ...linea('Última lectura', horaCorta(server.readAt)),
      ...linea('Publicación automática', estadoDeLaPublicacion(options, sync)),
      // "Sin conexion: Listo" era la peor linea de la ventana: la etiqueta
      // nombra una averia y el valor una preparacion, asi que el par entero se
      // leia como "no tiene usted conexion". Lo que describe es una capacidad.
      ...linea('Uso sin señal', modoSinConexion()),
    ]),

    // El texto exacto del servidor, cuando lo hay. Es lo que convierte
    // "responde con error" en algo que se puede arreglar: dice si faltan las
    // variables de entorno, si el token no tiene permiso o si la rama no
    // existe. Va debajo de la tabla y no dentro, porque es una frase entera.
    server.error
      ? el('p', { class: 'diag__error', attrs: { role: 'status' } }, [
          el('strong', { text: 'El servidor responde: ' }),
          server.error,
        ])
      : null,

    sync.texto ? el('p', { class: 'settings__help', text: sync.texto }) : null,
  ]);
}

/**
 * Una fila del diagnostico.
 *
 * @param {string} etiqueta
 * @param {string} valor
 * @returns {Array<HTMLElement>}
 */
function linea(etiqueta, valor) {
  return [
    el('div', { class: 'diag__row' }, [
      el('dt', { class: 'diag__label', text: etiqueta }),
      el('dd', { class: 'diag__value', text: valor }),
    ]),
  ];
}

function estadoDelServidor(estado) {
  switch (estado) {
    case 'ok':
      return 'Conectado';
    case 'sin_api':
      // "Sitio" aqui es el despliegue, pero en la panaderia un sitio es una
      // sede: quien lee esto en Panaderia entiende "no disponible en esta sede".
      return 'No configurado';
    case 'error':
      return 'Responde con error';
    case 'sin_red':
      return 'Sin conexión';
    default:
      return 'Sin comprobar';
  }
}

function estadoDeLaPublicacion(options, sync) {
  if (!options.canPublish) return 'No disponible';
  if (sync.motivo === 'sin_clave') return 'Pendiente de la primera publicación';
  if (sync.motivo === 'clave') return 'Detenida: la clave dejó de valer';
  if (sync.motivo === 'conflicto') return 'Detenida: hay que recargar';
  if (sync.motivo === 'conflicto_version') return 'Detenida: hay dos versiones';
  if (sync.pendiente) return 'Pendiente de conexión';
  return 'Activa';
}

/**
 * Si este equipo puede abrir el recetario sin señal.
 *
 * `controller` es la prueba de que el service worker no solo esta registrado,
 * sino sirviendo ya esta pagina: registrado pero sin controlar todavia significa
 * que hoy, sin red, no habria recetario.
 */
function modoSinConexion() {
  if (!('serviceWorker' in navigator)) return 'No disponible en este navegador';
  return navigator.serviceWorker.controller ? 'Listo' : 'Se activa al recargar';
}

function horaCorta(fecha) {
  if (!(fecha instanceof Date)) return 'Todavía no';
  // `'es'` a secas, igual que la fecha de las hojas impresas (`views/print.js`):
  // el recetario esta en español de principio a fin y no depende de la region
  // que tenga configurada cada equipo.
  return fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}
