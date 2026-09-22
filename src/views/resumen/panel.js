/**
 * =============================================================================
 *  RESUMEN: PANEL DE GESTIÓN
 * =============================================================================
 *
 *  Lo que ve gerencia (y el jefe de obrador, sin dinero) al entrar: cómo va
 *  hoy, qué necesita atención y cuatro pestañas de análisis sobre un periodo.
 *
 *  LA VISTA NO CALCULA NI ESCRIBE. Pide el panel ya armado a `cargarPanel`
 *  (caso de uso, que decide qué cifras puede ver esta persona) y guarda metas
 *  con `onGuardarMetas`. Aquí solo se decide qué se mira.
 *
 *  ESTADO DE MIRADA A NIVEL DE MÓDULO, como el tablero anterior: pestaña,
 *  periodo, modo ejemplo y metas abiertas son preferencias de lectura. La
 *  aplicación reconstruye el inicio entero en cada repintado global, y el
 *  gerente no debe volver a «Producción · 30 días» cada vez que llega un aviso
 *  de sincronización. Si entra otra persona, la mirada se reinicia.
 *
 *  REPINTADO LOCAL. Cambiar de pestaña o de periodo repinta solo esta zona y
 *  devuelve el foco al control equivalente (se busca por `data-foco`). El panel
 *  calculado se guarda para la pestaña: cambiar de pestaña no recalcula.
 *
 *  EL EJEMPLO NO TOCA NADA. Se prepara con `prepararEjemplo` (asíncrono, lo
 *  genera en memoria) y se muestra con un aviso fijo. Sus enlaces de acción se
 *  desactivan: llevarían a la operación real, donde esos problemas no existen.
 */

import { el, replaceChildren } from '../../lib/dom.js';
import { announce } from '../../lib/a11y.js';
import { PERIODO_POR_DEFECTO } from '../../core/bi/periodos.js';
import { renderHoy } from './hoy.js';
import { renderAtencion } from './atencion.js';
import { renderAnalisis, seccionSegura, pestanaValida } from './pestanas.js';
import { renderMetas, campoDelError } from './metas.js';

export const AVISO_EJEMPLO = 'Estás viendo datos de ejemplo: 90 días simulados. No son de tu operación y no se guardan.';

const MIRADA_INICIAL = Object.freeze({
  pestana: 'produccion',
  periodo: PERIODO_POR_DEFECTO,
  ejemplo: false,
  metasAbiertas: false,
});

/** Mirada actual. Sobrevive a los repintados globales; no se guarda en ningún sitio. */
let mirada = { ...MIRADA_INICIAL, dueno: null, preparando: false, fallaEjemplo: null, borrador: null, errorMetas: null };

/** Repintado de la zona que está en pantalla ahora (la del último `renderResumen`). */
let repintarVivo = null;

function miradaDe(usuario) {
  const dueno = usuario?.id || null;
  if (mirada.dueno !== dueno) {
    mirada = { ...MIRADA_INICIAL, dueno, preparando: false, fallaEjemplo: null, borrador: null, errorMetas: null };
  }
  return mirada;
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });

/** Hay algo que mirar: alguna cifra de hoy, algún aviso o algo programado. */
function tieneOperacion(panel) {
  const cifras = (panel.hoyResumen?.indicadores || []).some((i) => Number.isFinite(i.valor) && i.valor !== 0);
  const programado = (panel.hoyResumen?.areas || []).some((a) => a.recetas > 0);
  const producido = (panel.calidad?.produccionesTotales || 0) > 0;
  return cifras || programado || producido || (panel.atencion || []).length > 0;
}

/**
 * @param {Object} options
 * @param {Object|null} options.usuario sesión (`state.usuario`)
 * @param {(o: {periodo: string, ejemplo: boolean}) => Object} options.cargarPanel
 * @param {() => Object} options.estadoMetas
 * @param {(entrada: Object) => Object} options.onGuardarMetas
 * @param {() => Promise<Object>} [options.prepararEjemplo] genera el ejemplo en memoria
 * @param {(destino: {modulo: string, fecha?: string}) => string} options.hrefDe
 * @param {Node} [options.modulos] fila de accesos a los módulos, para el pie
 * @returns {HTMLElement}
 */
export function renderResumen(options) {
  const { usuario, cargarPanel: pedirPanel, estadoMetas: leerEstadoMetas, onGuardarMetas, prepararEjemplo: prepararDatosEjemplo, hrefDe, modulos } = options;
  const m = miradaDe(usuario);
  if (!pestanaValida(m.pestana)) m.pestana = MIRADA_INICIAL.pestana;

  /** Último panel calculado, por periodo y modo. Cada renderResumen empieza sin él: los datos pueden haber cambiado. */
  let guardado = null;
  const leerPanel = () => {
    const clave = `${m.periodo}|${m.ejemplo}`;
    if (guardado?.clave !== clave) {
      let resultado;
      try {
        resultado = pedirPanel({ periodo: m.periodo, ejemplo: m.ejemplo });
      } catch (error) {
        console.error('Resumen: falló cargarPanel', error);
        resultado = { ok: false, code: 'fallo', message: 'Algo falló al calcular el resumen. Recarga la página; si sigue pasando, avisa a administración.' };
      }
      guardado = { clave, resultado };
    }
    return guardado.resultado;
  };

  const cuerpo = el('div', { class: 'resumen__cuerpo' });
  // Los accesos del pie cuentan la operación REAL («0 lotes registrados»). En
  // el ejemplo, sin aviso, contradecían a las cifras simuladas de arriba.
  const avisoPie = el('p', { class: 'resumen__pie-aviso', text: 'Estas cifras son de tu operación real, no del ejemplo.' });
  const raiz = el('div', { class: 'dashboard resumen' }, [
    cuerpo,
    el('footer', { class: 'resumen__pie' }, [
      el('h2', { class: 'resumen__pie-titulo', text: 'Módulos' }),
      avisoPie,
      modulos || null,
      el('p', { class: 'resumen__nota', text: 'Datos de este equipo: la producción y la bodega se guardan en este navegador; otro equipo no las ve.' }),
    ]),
  ]);

  function pintar(foco) {
    replaceChildren(cuerpo, contenido());
    // Después de pintar: si el ejemplo caducó, `contenido` volvió a lo real.
    avisoPie.hidden = !m.ejemplo;
    if (!foco) return;
    const destino = typeof foco === 'string' ? cuerpo.querySelector(`[data-foco="${foco}"]`) : foco();
    destino?.focus();
  }

  function contenido() {
    const resultado = leerPanel();
    // El ejemplo pudo caducar (cambió el día o el recetario): se vuelve a lo real y se dice.
    if (!resultado.ok && resultado.code === 'ejemplo_no_listo' && m.ejemplo) {
      m.ejemplo = false;
      m.fallaEjemplo = resultado.message;
      return contenido();
    }
    const panel = resultado.ok ? resultado.value : null;
    const hrefActivo = (destino) => (m.ejemplo ? null : hrefDe(destino));

    return [
      cabecera(),
      m.ejemplo ? el('p', { class: 'resumen__aviso-ejemplo', attrs: { role: 'status' }, text: AVISO_EJEMPLO }) : null,
      m.preparando ? el('p', { class: 'resumen__preparando', attrs: { role: 'status' }, text: 'Preparando 90 días de ejemplo…' }) : null,
      m.fallaEjemplo ? el('p', { class: 'resumen__fallo', attrs: { role: 'alert' }, text: m.fallaEjemplo }) : null,
      m.metasAbiertas ? seccionSegura('las metas', () => renderMetas({
        estado: leerEstadoMetas(),
        borrador: m.borrador,
        error: m.errorMetas,
        onCambio: (clave, valor) => { m.borrador = { ...(m.borrador || {}), [clave]: valor }; },
        onGuardar: guardarMetas,
        onCancelar: () => cerrarMetas(),
      })) : null,
      ...(panel ? cuerpoDelPanel(panel, hrefActivo) : [errorDelPanel(resultado)]),
    ];
  }

  function cabecera() {
    return el('header', { class: 'resumen__cabecera' }, [
      el('div', { class: 'resumen__titulos' }, [
        el('p', { class: 'eyebrow', text: 'ZAHAVI / OPERACIONES' }),
        el('h1', { class: 'resumen__titulo', text: 'Resumen' }),
        el('p', { class: 'resumen__fecha', text: FECHA_LARGA.format(new Date()) }),
      ]),
      el('div', { class: 'resumen__acciones' }, [
        el('button', {
          type: 'button', class: 'btn btn--quiet resumen__boton', dataset: { foco: 'metas' }, text: 'Metas',
          attrs: { 'aria-expanded': String(m.metasAbiertas), 'aria-controls': m.metasAbiertas ? 'resumen-metas' : null },
          on: { click: () => (m.metasAbiertas ? cerrarMetas() : abrirMetas()) },
        }),
        el('button', {
          type: 'button', class: m.ejemplo ? 'btn btn--accent resumen__boton' : 'btn btn--quiet resumen__boton', dataset: { foco: 'ejemplo' },
          text: m.preparando ? 'Preparando el ejemplo…' : m.ejemplo ? 'Salir del ejemplo' : 'Ver con datos de ejemplo',
          // aria-disabled y no disabled: un botón deshabilitado pierde el foco.
          attrs: { 'aria-disabled': m.preparando ? 'true' : null },
          on: { click: alternarEjemplo },
        }),
      ]),
    ]);
  }

  function cuerpoDelPanel(panel, hrefActivo) {
    const vacio = !m.ejemplo && !tieneOperacion(panel);
    return [
      vacio ? el('div', { class: 'resumen__vacio' }, [
        el('p', { class: 'resumen__vacio-titulo', text: 'Todavía no hay operación registrada en este equipo.' }),
        el('p', { text: 'Las cifras aparecen cuando se programa y se confirma producción, y cuando se registran compras en Bodega. Para ver cómo se lee el panel, míralo con datos de ejemplo.' }),
      ]) : null,
      // Hoy y lo que necesita atención van juntos: en escritorio, lado a lado,
      // para que la primera pantalla diga a la vez cómo va el día y qué es
      // urgente. En pantallas más estrechas se apilan, y la franja de hoy lleva
      // una línea con los avisos que lleva a la lista.
      el('div', { class: 'resumen__dia' }, [
        seccionSegura('la franja de hoy', () => renderHoy({
          hoyResumen: panel.hoyResumen,
          hrefProduccion: hrefActivo({ modulo: 'plan', fecha: panel.hoy }),
          alertas: panel.atencion,
          onVerAvisos: () => cuerpo.querySelector('#resumen-atencion-titulo')?.focus(),
        })),
        seccionSegura('la lista de avisos', () => renderAtencion({ alertas: panel.atencion, hrefDe, ejemplo: m.ejemplo })),
      ]),
      seccionSegura('el análisis', () => renderAnalisis({
        panel,
        pestana: m.pestana,
        periodo: m.periodo,
        onPestana: (clave) => { m.pestana = clave; pintar(`tab-${clave}`); },
        onPeriodo: (clave) => { m.periodo = clave; pintar(`periodo-${clave}`); },
      })),
    ];
  }

  function errorDelPanel(resultado) {
    return el('section', { class: 'resumen__seccion resumen__error', attrs: { role: 'alert' } }, [
      el('h2', { class: 'resumen__titulo-seccion', text: 'No se pudo armar el resumen' }),
      el('p', { text: resultado.message || 'Algo falló al leer la operación de este equipo.' }),
      el('button', {
        type: 'button', class: 'btn btn--quiet', dataset: { foco: 'reintentar' }, text: 'Volver a intentar',
        on: { click: () => { guardado = null; pintar('reintentar'); } },
      }),
    ]);
  }

  function abrirMetas() {
    m.metasAbiertas = true;
    m.borrador = null;
    m.errorMetas = null;
    pintar(() => cuerpo.querySelector('#resumen-metas input, #resumen-metas [data-foco="metas-cerrar"]'));
  }

  function cerrarMetas() {
    m.metasAbiertas = false;
    m.borrador = null;
    m.errorMetas = null;
    pintar('metas');
  }

  function guardarMetas(entrada) {
    m.borrador = { ...entrada };
    let resultado;
    try {
      resultado = onGuardarMetas(entrada);
    } catch (error) {
      console.error('Resumen: falló guardar metas', error);
      resultado = { ok: false, code: 'fallo', message: 'No se pudieron guardar las metas. Lo escrito sigue aquí; inténtalo de nuevo.' };
    }
    if (!resultado?.ok) {
      const clave = campoDelError(leerEstadoMetas().definicion || [], resultado?.message);
      m.errorMetas = { clave, mensaje: resultado?.message || 'No se pudieron guardar las metas.' };
      pintar(() => (clave ? cuerpo.querySelector(`#resumen-meta-${clave}`) : cuerpo.querySelector('[data-foco="metas-guardar"]')));
      return;
    }
    m.metasAbiertas = false;
    m.borrador = null;
    m.errorMetas = null;
    guardado = null; // los semáforos dependen de las metas
    pintar('metas');
    announce('Metas guardadas. El panel ya las usa.');
  }

  async function alternarEjemplo() {
    if (m.preparando) return;
    m.fallaEjemplo = null;
    if (m.ejemplo) {
      m.ejemplo = false;
      pintar('ejemplo');
      announce('Volviste a los datos de este equipo.');
      return;
    }
    if (typeof prepararDatosEjemplo === 'function') {
      m.preparando = true;
      pintar('ejemplo');
      let listo;
      try {
        listo = await prepararDatosEjemplo();
      } catch (error) {
        console.error('Resumen: falló preparar el ejemplo', error);
        listo = { ok: false, message: 'No se pudieron preparar los datos de ejemplo. Recarga la página e inténtalo de nuevo.' };
      }
      m.preparando = false;
      if (!listo?.ok) {
        m.fallaEjemplo = listo?.message || 'No se pudieron preparar los datos de ejemplo.';
        pintarSiSigue('ejemplo');
        return;
      }
    }
    m.ejemplo = true;
    pintarSiSigue('ejemplo');
  }

  /**
   * Tras esperar al ejemplo, la aplicación pudo reconstruir el inicio entero
   * (llega un aviso, se sincroniza). Se repinta la zona que esté en pantalla,
   * que es la de la última llamada a `renderResumen` y comparte esta mirada.
   */
  function pintarSiSigue(foco) {
    if (raiz.isConnected) pintar(foco);
    else if (repintarVivo) repintarVivo(foco);
  }

  repintarVivo = (foco) => {
    if (!raiz.isConnected) return;
    guardado = null;
    pintar(foco);
  };

  replaceChildren(cuerpo, contenido());
  avisoPie.hidden = !m.ejemplo;
  return raiz;
}
