/**
 * =============================================================================
 *  CASOS DE USO
 * =============================================================================
 *
 *  Aqui vive lo que la aplicacion SABE HACER, separado de lo que la aplicacion
 *  PINTA. Son las cuatro operaciones que tocan las 121 recetas de la panaderia:
 *
 *      guardar   ·   eliminar   ·   publicar   ·   descartar
 *
 *  Antes estaban escritas dentro de `main.js`, mezcladas con el codigo que
 *  construye la pantalla. Eso tenia dos problemas:
 *
 *    1. Cada una repetia la misma coreografia (llamar al repositorio, mirar el
 *       resultado, actualizar el estado, avisar, navegar) con pequenas
 *       variaciones, asi que era facil que una se desviara de las demas.
 *
 *    2. No se podian comprobar sin un navegador, justo siendo las operaciones
 *       donde se pueden perder los datos.
 *
 *  Ahora cada una es una funcion con nombre que devuelve siempre la misma forma
 *  de resultado, y `main.js` se limita a llamarlas.
 *
 *  FORMA DEL RESULTADO
 *  -------------------
 *  Todas devuelven lo mismo que el nucleo:
 *
 *      { ok: true,  value: <lo que sea> }
 *      { ok: false, code: 'motivo', message: 'texto para la persona' }
 *
 *  Quien llama solo tiene que mirar `ok`. El `message` ya viene redactado para
 *  mostrarse tal cual en pantalla.
 */

import * as repo from '../core/repository.js';
import { getState, setState, notify } from '../core/store.js';
import { navigate, ALL_CATEGORIES } from '../core/router.js';
import { announce } from '../lib/a11y.js';
import { setEditKey, getEditKey } from '../core/remote.js';
import {
  iniciarSesion,
  verificarSegundoPaso,
  cancelarSegundoPaso,
  terminarSesion,
  revalidarSesion,
  invalidaLaSesion,
  leerSesion,
  turnoVencido,
  finDelTurno,
  MENSAJE_TURNO_VENCIDO,
} from '../core/sesion.js';
import { guardarEscalaTexto } from '../core/preferencias.js';
import { publicarEnSegundoPlano, sePuedePublicarSolo } from './sync.js';
import { olvidarEquipo } from './equipo.js';

/**
 * Pide la clave de edicion si es lo unico que falta para publicar.
 *
 * SE COMPRUEBA LA CONDICION, NO EL MOTIVO QUE DEJO `sync.js`. El motivo cuenta
 * como acabo el ULTIMO intento, y eso no es lo mismo que lo que pasa ahora:
 * despues de publicar a mano, la clave ya esta puesta pero el motivo sigue
 * diciendo `sin_clave`, y el dialogo reaparecia en cada guardado siguiente
 * pidiendo algo que ya se habia dado.
 *
 * Las cuatro condiciones son las de publicar, en el orden en que dejan de
 * tener sentido:
 *
 *   sin cambios          no hay nada que enviar
 *   con conflicto        hay dos versiones y eso se decide en Ajustes, mirando
 *                        las dos; la clave no arregla nada
 *   sin servidor         no hay a donde publicar (archivo local, o despliegue
 *                        sin las variables puestas)
 *   con clave ya puesta  este equipo ya publica solo
 *
 * Sin red no se pide tampoco, porque `canPublishToAll()` exige haber leido el
 * recetario del servidor: sin esa lectura no hay referencia con la que publicar.
 */
function pedirClaveSiEsLoUnicoQueFalta() {
  const cambios = repo.localChanges();
  if (!cambios.dirty || cambios.conflict) return;
  if (!repo.canPublishToAll()) return;
  if (getEditKey()) return;
  setState({ pedirClave: true });
}

/**
 * Vuelca al estado lo que el repositorio tenga ahora mismo.
 *
 * Se llama tras cualquier operacion que cambie las recetas. Es una sola linea
 * repetida en cinco sitios, y tenerla aqui evita que alguna se olvide de
 * refrescar el catalogo de ingredientes ademas de las recetas.
 */
function refreshState() {
  setState({
    recetario: { recipes: repo.findAll(), ingredientes: repo.allIngredients() },
  });
}

// ---------------------------------------------------------------------------
//  GUARDAR UNA RECETA
// ---------------------------------------------------------------------------

/**
 * Guarda una receta nueva o modificada en este equipo.
 *
 * Guardar y publicar siguen siendo dos cosas distintas: esto escribe en el
 * equipo, siempre, tambien sin conexion. Lo que cambia es que, si se puede
 * publicar, no hace falta acordarse de pulsar nada: `sync.js` lo hace en
 * segundo plano. El mensaje dice cual de los dos casos ha ocurrido, porque la
 * diferencia importa: uno lo ven las demas sedes y el otro no.
 *
 * @param {object} recipe receta ya validada por el editor
 * @returns {{ok: true, value: object} | {ok: false, code: string, message: string}}
 */
export function saveRecipe(recipe) {
  const result = repo.save(recipe);

  if (!result.ok) {
    notify(result.message, 'error');
    return result;
  }

  refreshState();
  notify(
    sePuedePublicarSolo() ? 'Receta guardada. Publicando…' : 'Receta guardada en este equipo.',
    'success',
  );
  announce('Receta guardada.');
  // El permiso muere con la accion: volver a editar vuelve a pedir la clave.
  setState({ autorizacion: null });
  navigate({ modulo: 'recetario', name: 'detail', id: recipe.id });
  publicarEnSegundoPlano();
  pedirClaveSiEsLoUnicoQueFalta();

  return result;
}

// ---------------------------------------------------------------------------
//  ELIMINAR UNA RECETA
// ---------------------------------------------------------------------------

/**
 * Elimina una receta de este equipo.
 *
 * El dialogo de confirmacion ya se mostro antes de llegar aqui: esta funcion no
 * vuelve a preguntar.
 *
 * @param {string} id codigo de la receta, por ejemplo "R057"
 * @returns {{ok: true, value: undefined} | {ok: false, code: string, message: string}}
 */
export function deleteRecipe(id) {
  const result = repo.remove(id);

  if (!result.ok) {
    notify(result.message, 'error');
    // El permiso se retira tambien cuando el borrado FALLA: si no, un reintento
    // sobre la misma receta se saltaria la puerta.
    setState({ recetario: { confirmDelete: null }, autorizacion: null });
    return result;
  }

  refreshState();
  setState({ recetario: { confirmDelete: null }, autorizacion: null });
  notify(
    sePuedePublicarSolo() ? 'Receta eliminada. Publicando…' : 'Receta eliminada en este equipo.',
    'success',
  );
  announce('Receta eliminada.');
  navigate({ modulo: 'recetario', name: 'index', id: null });
  publicarEnSegundoPlano();
  pedirClaveSiEsLoUnicoQueFalta();

  return result;
}

// ---------------------------------------------------------------------------
//  PUBLICAR PARA TODAS LAS SEDES
// ---------------------------------------------------------------------------

/**
 * Envia el recetario de este equipo al servidor, para que lo vean la panaderia
 * y la casa de produccion.
 *
 * Es la unica operacion que sale del dispositivo, y la unica que necesita la
 * clave de edicion. La clave NO se comprueba aqui: viaja al servidor, que es
 * quien la valida. Si aqui se comprobara, bastaria con abrir las herramientas
 * del navegador para saltarsela.
 *
 * Cuando la publicacion sale bien, la clave se guarda para el resto de la
 * sesion, para no tener que escribirla en cada publicacion.
 *
 * @param {string} password clave de edicion escrita por la persona
 * @returns {Promise<{ok: true, value: {revision: string, count: number}} | {ok: false, code: string, message: string}>}
 */
export async function publish(password) {
  const result = await repo.publishToAll({ password, author: 'recetario' });

  if (!result.ok) {
    // El error se muestra dentro del propio dialogo de Ajustes, junto al campo
    // de la clave, que es donde la persona esta mirando.
    return result;
  }

  setEditKey(password);
  refreshState();
  notify(`Publicado para todas las sedes: ${result.value.count} recetas.`, 'success');
  announce('Recetario publicado.');

  return result;
}

// ---------------------------------------------------------------------------
//  DESCARTAR LOS CAMBIOS DE ESTE EQUIPO
// ---------------------------------------------------------------------------

/**
 * Tira los cambios sin publicar de este equipo y vuelve a la version publicada.
 *
 * Es una operacion destructiva y no se puede deshacer, asi que el boton que la
 * dispara esta marcado como peligroso en la interfaz.
 *
 * @returns {{ok: true, value: number} | {ok: false, code: string, message: string}}
 */
export function discardChanges() {
  const result = repo.discardLocalChanges();

  if (!result.ok) {
    notify(result.message, 'error');
    return result;
  }

  refreshState();
  setState({ settingsOpen: false });
  notify(`Se descartaron los cambios. Vuelves a la versión publicada (${result.value} recetas).`, 'info');
  announce('Cambios locales descartados.');
  // Al recetario y no al modulo que estuviera abierto: descartar cambios
  // recarga las recetas publicadas, asi que lo que hay que enseñar es el
  // listado que acaba de cambiar.
  navigate({ modulo: 'recetario', name: 'index', id: null, query: '', category: ALL_CATEGORIES });

  return result;
}

// ---------------------------------------------------------------------------
//  ABRIR Y CERRAR LA SESION DE ESTE EQUIPO
// ---------------------------------------------------------------------------

/*
 * Entrar y salir estaban escritos dentro de las vistas, y cada copia limpiaba
 * un conjunto distinto de claves: `views/settings.js` borraba `settingsOpen`,
 * `main.js` no, y ninguna de las dos retiraba `autorizacion`. Es decir, un
 * permiso de escritura podia sobrevivir a un cierre de sesion.
 *
 * Ahora la lista vive UNA sola vez, aqui, y los dos sitios llaman a lo mismo.
 */

/**
 * Todo lo que deja de tener sentido cuando ya no hay nadie dentro.
 *
 * `recipes` e `ingredientes` NO se tocan a proposito: son el recetario, no la
 * sesion, y borrarlos dejaria al siguiente turno sin nada que consultar
 * mientras vuelve a cargar. Los cambios sin publicar tampoco se pierden.
 */
const SESION_CERRADA = Object.freeze({
  authed: false,
  // Quien estaba dentro. Lo primero que deja de ser cierto.
  usuario: null,
  // Permiso de escritura: lo primero que hay que retirar.
  autorizacion: null,
  pedirClave: false,
  settingsOpen: false,
  loginError: '',
  loginCampo: '',
  loginEnCurso: false,
  loginPaso: '',
  loginQr: '',
  loginSecreto: '',
  turnoHasta: 0,
  // Ventanas y pantallas de trabajo del recetario: ninguna sobrevive al cambio
  // de persona. `recipes` e `ingredientes` NO se tocan (ver arriba).
  recetario: Object.freeze({
    confirmDelete: null,
    production: null,
    planPrint: null,
    factor: 1,
  }),
});

/**
 * Entra con el codigo de usuario y el PIN.
 *
 * El error se deja en el estado, y no solo en la pantalla, porque la pantalla
 * de entrada se repinta entera con cualquier cambio -llega el recetario, vuelve
 * la red- y un mensaje que viviera solo en el DOM desapareceria antes de leerse.
 *
 * @param {string} codigo
 * @param {string} pin
 * @returns {Promise<{ok: true, value: object} | {ok: false, code: string, message: string}>}
 */
export async function ingresar(codigo, pin) {
  // "Entrando…" vive en el ESTADO y no en la pantalla. La pantalla se repinta
  // entera, y a veces de forma sincrona dentro de este mismo `setState` (en los
  // navegadores sin transiciones de vista): una marca guardada en la vista
  // llegaba tarde y el formulario nuevo nacia con el boton desactivado para
  // siempre.
  if (getState().loginEnCurso) {
    return { ok: false, code: 'en_curso', message: 'Ya se está comprobando el ingreso.' };
  }
  setState({ loginEnCurso: true, loginError: '', loginCampo: '' });

  let result = null;
  try {
    result = await iniciarSesion(codigo, pin);
  } finally {
    // Si algo lanzara, el formulario no puede quedarse en "Entrando…".
    if (result === null) setState({ loginEnCurso: false });
  }

  if (!result.ok) {
    setState({
      loginEnCurso: false,
      loginError: result.message,
      loginCampo: result.code === 'codigo_vacio' || result.code === 'codigo_invalido' ? 'codigo' : 'pin',
    });
    return result;
  }

  // Gerencia y administracion: falta el codigo del celular. Nadie esta dentro
  // todavia, asi que `authed` NO cambia.
  if (result.value.estado !== 'dentro') {
    setState({
      loginEnCurso: false,
      loginError: '',
      loginCampo: '',
      loginPaso: result.value.estado,
      loginQr: result.value.qr || '',
      loginSecreto: result.value.secreto || '',
    });
    return result;
  }

  abrirSesion(result.value.usuario);
  return result;
}

/**
 * Completa el ingreso con el codigo de 6 numeros de la aplicacion autenticadora.
 *
 * @param {string} codigo
 * @returns {Promise<{ok: true, value: object} | {ok: false, code: string, message: string}>}
 */
export async function verificarCodigo(codigo) {
  if (getState().loginEnCurso) {
    return { ok: false, code: 'en_curso', message: 'Ya se está comprobando el código.' };
  }
  setState({ loginEnCurso: true, loginError: '', loginCampo: '' });

  let result = null;
  try {
    result = await verificarSegundoPaso(codigo);
  } finally {
    if (result === null) setState({ loginEnCurso: false });
  }

  if (!result.ok) {
    // Si el ingreso a medias ya no sirve, se vuelve al PIN con el motivo a la
    // vista; si solo fallo el codigo, se queda en el segundo paso para repetirlo.
    const volver = result.code === 'sin_ingreso';
    setState({
      loginEnCurso: false,
      loginError: result.message,
      loginCampo: volver ? 'pin' : 'verificacion',
      ...(volver ? { loginPaso: '', loginQr: '', loginSecreto: '' } : {}),
    });
    return result;
  }

  abrirSesion(result.value.usuario);
  return result;
}

/**
 * Abandona el segundo paso y vuelve a pedir el codigo y el PIN.
 *
 * @returns {{ok: true, value: undefined}}
 */
export function cancelarVerificacion() {
  cancelarSegundoPaso();
  setState({ loginPaso: '', loginQr: '', loginSecreto: '', loginError: '', loginCampo: '', loginEnCurso: false });
  return { ok: true, value: undefined };
}

/**
 * Deja dentro a quien ya paso todos los pasos, y pone en marcha su turno.
 *
 * @param {object} usuario
 */
function abrirSesion(usuario) {
  setState({
    authed: true,
    usuario,
    loginEnCurso: false,
    loginError: '',
    loginCampo: '',
    loginPaso: '',
    loginQr: '',
    loginSecreto: '',
  });
  vigilarTurno();
}

/** El temporizador que cierra la sesion al terminar el turno. */
let temporizadorTurno = null;

/**
 * Cierra la sesion si su turno termino, y si no, programa el cierre.
 *
 * Se llama al entrar, al arrancar y cada rato desde `main.js`, CON o SIN red:
 * el turno es una regla de este equipo. El temporizador solo no basta: una
 * pestaña en segundo plano o una tableta dormida lo retrasan, y por eso tambien
 * se comprueba al volver a la pantalla.
 *
 * @returns {{ok: true, value: boolean}} `true` si la sesion sigue abierta
 */
export function vigilarTurno() {
  if (temporizadorTurno !== null) {
    clearTimeout(temporizadorTurno);
    temporizadorTurno = null;
  }
  if (!getState().authed) return { ok: true, value: false };

  const sesion = leerSesion();
  if (!sesion) return { ok: true, value: true };

  if (turnoVencido(sesion)) {
    cerrarSesion(MENSAJE_TURNO_VENCIDO);
    return { ok: true, value: false };
  }

  const fin = finDelTurno(sesion);
  if (getState().turnoHasta !== fin) setState({ turnoHasta: fin });
  // Un segundo de mas para que al dispararse el turno ya este vencido y no
  // haya que volver a programarlo.
  temporizadorTurno = setTimeout(vigilarTurno, Math.max(0, fin - Date.now()) + 1000);
  return { ok: true, value: true };
}

/**
 * Comprueba contra el servidor que la sesion de este equipo sigue valiendo.
 *
 * Se llama al arrancar y al volver la conexion. Si el servidor ya no la
 * reconoce -baja del usuario, perfil desactivado, sesion cerrada en otro sitio-
 * se cierra aqui con el motivo a la vista. Si solo falta la red, no se toca
 * nada: quien ya estaba dentro sigue trabajando.
 *
 * @returns {Promise<{ok: boolean, code?: string, message?: string, value?: object}>}
 */
export async function revalidarSesionActual() {
  const inicio = getState();
  if (!inicio.authed || !inicio.usuario) {
    return { ok: false, code: 'sin_sesion', message: 'No hay una sesión abierta en este equipo.' };
  }

  const result = await revalidarSesion();

  // LA RESPUESTA PUEDE LLEGAR TARDE. Mientras se comprobaba, la persona pudo
  // salir o entrar otra. Aplicarla entonces cerraria la sesion de quien acaba
  // de entrar, o enseñaria un error a quien salio por su cuenta.
  const ahora = getState();
  if (!ahora.authed || !ahora.usuario || ahora.usuario.id !== inicio.usuario.id) return result;

  if (result.ok) {
    setState({ usuario: result.value });
    return result;
  }

  if (invalidaLaSesion(result)) cerrarSesion(result.message);
  else if (result.code === 'almacenamiento') notify(result.message, 'error');
  return result;
}

/**
 * Cambia el tamano del texto de las recetas en este aparato.
 *
 * No toca ninguna receta ni viaja a las demas sedes: es una preferencia de
 * pantalla, asi que no pide la clave de edicion ni marca nada como pendiente de
 * publicar.
 *
 * @param {string} clave una de las de `ESCALAS` en `core/preferencias.js`
 */
export function cambiarEscalaTexto(clave) {
  const guardado = guardarEscalaTexto(clave);

  // El estado se pone SIEMPRE, haya podido guardarse o no. Que este aparato no
  // pueda recordar la eleccion para manana no es razon para ignorarla ahora:
  // quien acaba de pulsar el boton espera ver el cambio.
  const escala = guardado.ok ? guardado.value : clave;
  setState({ escalaTexto: escala });

  if (!guardado.ok) notify(guardado.message, 'info');
}

/**
 * Cierra la sesion de este equipo.
 *
 * LA CLAVE DE EDICION SE REVOCA AQUI, y es lo primero que se hace. Sin eso,
 * quien entrara despues heredaba la clave que dejo guardada la persona anterior
 * y podia publicar sin conocerla: fue un defecto real, encontrado en una
 * auditoria de seguridad.
 *
 * @param {string} [motivo] por que se cierra, si no lo pidio la persona. Se
 *   enseña en la pantalla de entrada: sin el, alguien a quien sacan porque le
 *   desactivaron el usuario veria la pantalla de entrada sin saber por que.
 * @returns {{ok: true, value: undefined}}
 */
export function cerrarSesion(motivo = '') {
  setEditKey(null);
  if (temporizadorTurno !== null) {
    clearTimeout(temporizadorTurno);
    temporizadorTurno = null;
  }
  terminarSesion();
  // La lista del equipo es de quien estaba dentro: el siguiente turno la pide
  // de nuevo con su propio permiso, o no la ve.
  olvidarEquipo();
  setState({ ...SESION_CERRADA, loginError: typeof motivo === 'string' ? motivo : '' });
  return { ok: true, value: undefined };
}
