/**
 * =============================================================================
 *  REGISTRAR PRODUCCION DE UN AREA
 * =============================================================================
 *
 *  Una sola area a la vista: buscar entre las recetas que YA existen en el
 *  recetario para esa area y añadirlas al dia, por tandas o por unidades.
 *  Al lado, lo registrado: subir o bajar tandas, escribirlas o quitar.
 *
 *  CADA CAMBIO SE GUARDA AL MOMENTO. No hay borrador ni «Guardar plan»: el
 *  responsable es la persona de la sesion y el motivo lo pone el sistema. Si
 *  otra pestaña cambio el dia entre tanto, el cambio se rechaza y la lista se
 *  vuelve a pintar con lo guardado.
 *
 *  Añadir una receta que ya esta SUMA: es como se sacan unidades extra de algo
 *  que ya salio. Al confirmar, solo se descuenta lo nuevo.
 *
 *  POR QUE LA RESPUESTA SALE EN LA FILA
 *  ------------------------------------
 *  En la cocina se registra deprisa y con la vista en la receta, no arriba de
 *  la pantalla. Por eso cada cambio deja «Añadida ✓» o «Guardado ✓» junto a lo
 *  que se toco, ademas del mensaje de arriba y del anuncio al lector.
 *
 *  POR QUE SE RECUERDA EL FOCO
 *  ---------------------------
 *  Cada cambio repinta las listas, y el control que tenia el foco deja de
 *  existir. Antes de repintar se anota que control era (receta y tipo) y
 *  despues se enfoca su sustituto; si quedo desactivado (el tope de «+»), va
 *  al campo de tandas de esa fila. Al quitar una receta, el foco va al
 *  buscador si esta a la vista (columna «Añadir recetas» elegida o dos
 *  columnas) y, si no, a la fila que ocupo su lugar. Se decide con el estado
 *  del conmutador, no midiendo la pagina. Asi el teclado nunca cae al `body`.
 *
 *  POR QUE LOS CAMBIOS VAN EN FILA Y ESPERAN AL DEDO
 *  -------------------------------------------------
 *  El campo guarda al salir. Si alguien escribe «5» y toca el «+» de otra fila,
 *  el guardado del campo termina entre el `pointerdown` y el `click`: repintar
 *  en ese momento cambia el boton bajo el dedo y el toque se pierde. Por eso
 *  el repintado espera a que se suelte el puntero (y a su `click`).
 *  Y el segundo cambio no puede salir con la version y las tandas que habia al
 *  pintar: el nucleo lo rechazaria como conflicto, o pisaria lo recien escrito.
 *  Los cambios pasan de uno en uno y cada uno calcula su cifra en su turno,
 *  con los datos que dejo el anterior.
 *
 *  POR QUE EL GRUPO DE TANDAS SE NOMBRA CON LA RECETA
 *  --------------------------------------------------
 *  El campo se llama «Tandas de {Receta}». Si el grupo que lo envuelve se
 *  llamara igual, buscar el campo por su nombre encontraria dos elementos. El
 *  grupo toma el nombre de la receta (`aria-labelledby`), y el lector oye
 *  «{Receta}, grupo» y despues «Tandas de {Receta}».
 *
 *  POR QUE UNA RECETA PRODUCIDA NO TIENE «QUITAR»
 *  ----------------------------------------------
 *  Con tandas ya confirmadas, quitarla borraria el contexto de un consumo de
 *  bodega que ya ocurrio. Un boton desactivado no explica por que; una frase
 *  si: «Ya se produjo: no se puede quitar.».
 */

import { el, clear } from '../../lib/dom.js';
import { announce } from '../../lib/a11y.js';
import { titleCase, formatMedida as formatQty, normalize } from '../../lib/format.js';
import { ICON_ELIMINAR, ICON_MAS } from '../../lib/iconos.js';
import { FACTOR_MIN, FACTOR_MAX, rendimientoEscalado, rendimientoBase } from '../../core/scale.js';
import { tandasParaUnidades } from '../../core/produccion.js';
import { recetasDelDia } from '../../core/preparacion.js';
import { hoyLocal } from '../../core/bitacora.js';
import { materialesEnGramos } from '../../core/materiales-produccion.js';
import {
  AREAS, botonAccion, cabeceraVista, claseArea, conEspera, insigniaEstado, marcarHecho,
  nombreArea, selector, tandas, vacio,
} from './comun.js';

const redondear = (n) => Math.round(n * 1000) / 1000;
const numero = (valor) => Number(String(valor ?? '').trim().replace(',', '.'));
const recetasTexto = (n) => `${n} ${n === 1 ? 'receta' : 'recetas'}`;
const fueraDeRango = () => `Indica entre ${formatQty(FACTOR_MIN)} y ${FACTOR_MAX} tandas. Para quitarla, usa Quitar.`;
const topeSuperado = () => `Con esto pasaría de ${FACTOR_MAX} tandas. Reparte en otro día.`;
const noBajar = (producido) => `Ya se hicieron ${tandas(producido)}: no se puede bajar de ahí.`;

/** Icono «−»: el de «+» sin su trazo vertical. */
const ICON_MENOS = ['M5 12h14'];

/** Controles que se repintan y cuyo foco hay que devolver. */
const CONTROLES = ['reg__anadir', 'reg__menos', 'reg__mas', 'reg__tandas', 'reg__quitar'];

/** Lo que se espera al `click` tras soltar el puntero, y el limite de la espera. */
const ESPERA_CLICK_MS = 300;
const ESPERA_MAXIMA_MS = 3000;

/**
 * @param {object} o
 * @param {string} o.fecha
 * @param {string} o.area
 * @param {Array<object>} o.recetas catalogo completo
 * @param {() => object|null} o.leerDatos
 * @param {(solicitud: {fecha, revision, recetaId, factor}) => Promise<object>} o.onFijar
 * @param {() => void} o.onVolver
 * @param {(area: string) => void} [o.onArea] avisa del cambio de area
 * @returns {{node: HTMLElement, enfocar: () => void}}
 */
export function crearRegistro(o) {
  let area = o.area;
  let modo = 'tandas';
  // Que columna se ve cuando solo cabe una. No cambia sola al añadir.
  let panel = o.recetaId ? 'registradas' : 'anadir';
  const cantidades = new Map();
  // Lo que la persona esta viendo: la version del dia y sus filas, tomadas al
  // pintar. Se envia ESA version, no la de ahora: si otra pestaña cambio el dia
  // mientras tanto, el nucleo lo rechaza en vez de pisar el cambio con cifras
  // viejas. Y el buscador no relee el almacenamiento en cada tecla.
  let revisionVista = 0;
  let filas = [];
  let delDia = [];
  const pasado = o.fecha < hoyLocal();

  const estado = el('p', { class: 'prod-estado-texto', attrs: { role: 'status' } });
  // Quitar es el unico cambio que no se arregla escribiendo otra cifra: se
  // ofrece volver atras. Vive FUERA de la region viva para que el lector no
  // oiga el boton cada vez que cambia el mensaje.
  const deshacer = el('div', { class: 'reg__deshacer' });
  const resultados = el('ul', { class: 'reg__resultados', attrs: { 'aria-label': 'Recetas del área' } });
  const lista = el('div', { class: 'reg__registradas' });
  const pestanas = el('div');
  const vista = el('div');
  const tituloDia = el('h3', { class: 'reg__subtitulo', id: 'reg-dia-titulo', attrs: { tabindex: '-1' } });
  const buscador = el('input', { type: 'search', class: 'field reg__buscar', id: 'reg-buscar', autocomplete: 'off',
    placeholder: 'Nombre de la receta', on: { input: () => buscar() } });
  const modos = el('div');
  const { node: cabecera, titulo } = cabeceraVista({ titulo: '', fecha: o.fecha, onVolver: o.onVolver });

  const node = el('section', { class: 'prod-vista reg' }, [
    cabecera,
    pestanas,
    pasado ? el('p', { class: 'reg__aviso', text: 'Este día ya pasó: lo que añadas queda pendiente de confirmar.' }) : null,
    el('div', { class: 'reg__mensaje' }, [estado, deshacer]),
    vista,
    el('div', { class: 'reg__columnas' }, [
      el('section', { class: 'reg__buscador', attrs: { 'aria-labelledby': 'reg-buscar-titulo' } }, [
        el('h3', { class: 'reg__subtitulo', id: 'reg-buscar-titulo', text: 'Añadir recetas' }),
        el('div', { class: 'reg__campos' }, [
          el('label', { for: 'reg-buscar', class: 'reg__campo reg__campo--buscar' }, [el('span', { text: 'Buscar' }), buscador]),
          el('div', { class: 'reg__campo' }, [el('span', { text: 'Añadir por' }), modos]),
        ]),
        resultados,
      ]),
      el('section', { class: 'reg__dia', attrs: { 'aria-labelledby': 'reg-dia-titulo' } }, [tituloDia, lista]),
    ]),
  ]);

  /** Relee el dia: su version, todas sus recetas y las del area. */
  function releer() {
    const datos = o.leerDatos();
    revisionVista = datos?.planes.find((p) => p.fecha === o.fecha)?.revision || 0;
    delDia = datos ? recetasDelDia(datos, o.fecha) : [];
    filas = delDia.filter((r) => r.recipe.categoria === area);
  }

  const filaActual = (id) => filas.find((f) => f.recipe.id === id) || null;

  // ---- Turnos y puntero ---------------------------------------------------------

  let cola = Promise.resolve();
  /** Un cambio detras de otro: cada uno ve lo que dejo el anterior. */
  function enCola(trabajo) {
    const turno = cola.then(trabajo);
    cola = turno.catch(() => {});
    return turno;
  }

  let punteroAbajo = false;
  let alSoltar = [];
  function liberarPuntero() {
    punteroAbajo = false;
    const pendientes = alSoltar;
    alSoltar = [];
    for (const seguir of pendientes) seguir();
  }
  node.addEventListener('pointerdown', () => {
    punteroAbajo = true;
    const fin = new AbortController();
    const opciones = { capture: true, signal: fin.signal };
    // El `click` llega despues de soltar: se espera a que su manejador corra.
    document.addEventListener('pointerup', () => {
      fin.abort();
      const listo = new AbortController();
      const reloj = setTimeout(() => { listo.abort(); liberarPuntero(); }, ESPERA_CLICK_MS);
      document.addEventListener('click', () => {
        listo.abort();
        clearTimeout(reloj);
        setTimeout(liberarPuntero, 0);
      }, { capture: true, signal: listo.signal });
    }, opciones);
    document.addEventListener('pointercancel', () => { fin.abort(); liberarPuntero(); }, opciones);
  }, true);

  /** Resuelve cuando repintar ya no puede robar un toque a medias. */
  function punteroLibre() {
    if (!punteroAbajo) return Promise.resolve();
    return new Promise((seguir) => {
      alSoltar.push(seguir);
      setTimeout(seguir, ESPERA_MAXIMA_MS);
    });
  }

  // ---- Foco ---------------------------------------------------------------------

  /** Que control tiene el foco, dicho de forma que sobreviva al repintado. */
  function claveDe(nodo) {
    if (!(nodo instanceof Element) || !node.contains(nodo)) return null;
    if (nodo.dataset.foco) return { foco: nodo.dataset.foco };
    const clase = CONTROLES.find((c) => nodo.classList.contains(c));
    const item = nodo.closest('[data-receta]');
    return clase && item ? { receta: item.dataset.receta, clase } : null;
  }

  function itemDe(receta, zona) {
    return node.querySelector(`.${zona}[data-receta="${CSS.escape(receta)}"]`);
  }

  /** Lo que queda a la vista cuando el control anotado ya no existe. */
  function respaldo() {
    if (panel === 'anadir') buscador.focus();
    else tituloDia.focus();
  }

  /** Enfoca el sustituto del control anotado; si quedo desactivado, el campo de su fila. */
  function devolverFoco(clave) {
    if (!clave) return;
    if (clave.foco) {
      (node.querySelector(`[data-foco="${CSS.escape(clave.foco)}"]`) || buscador).focus();
      return;
    }
    const item = itemDe(clave.receta, clave.clase === 'reg__anadir' ? 'reg__resultado' : 'reg__fila');
    let destino = item?.querySelector(`.${clave.clase}`);
    if (destino?.disabled) destino = item.querySelector('.reg__tandas');
    if (destino) destino.focus();
    else respaldo();
  }

  /**
   * Tras quitar una receta: el buscador si esta a la vista; si no, la fila que
   * ocupo su lugar (o la anterior), y sin filas, el titulo de la columna.
   */
  function focoTrasQuitar(indice) {
    if (panel === 'anadir') { buscador.focus(); return; }
    const restantes = lista.querySelectorAll('.reg__fila');
    const fila = restantes[Math.min(indice, restantes.length - 1)];
    const destino = fila?.querySelector('.reg__quitar') || fila?.querySelector('.reg__tandas');
    if (destino) destino.focus();
    else tituloDia.focus();
  }

  // ---- Selectores ---------------------------------------------------------------

  /**
   * Pinta un selector o, si ya existe con las mismas opciones, solo actualiza
   * su texto y cual esta elegida. Asi el boton que se esta tocando o que tiene
   * el foco no se sustituye por otro a mitad de camino.
   */
  function ponerSelector(contenedor, props) {
    const botones = [...(contenedor.firstElementChild?.children || [])];
    const mismas = botones.length === props.opciones.length
      && props.opciones.every(([clave], i) => botones[i].dataset.opcion === clave);
    if (!mismas) {
      clear(contenedor);
      contenedor.appendChild(selector(props));
      return;
    }
    props.opciones.forEach(([clave, texto, , nombre], i) => {
      const boton = botones[i];
      boton.setAttribute('aria-pressed', String(clave === props.valor));
      boton.firstElementChild.textContent = texto;
      if (nombre) boton.setAttribute('aria-label', nombre);
    });
  }

  function pintarPestanas() {
    ponerSelector(pestanas, {
      etiqueta: 'Área', valor: area, clase: 'prod-selector--areas',
      opciones: AREAS.map((a) => {
        const n = delDia.filter((r) => r.recipe.categoria === a).length;
        return [a, `${nombreArea(a)} · ${n}`, `area-tab area-tab--${claseArea(a)}`,
          `${nombreArea(a)}, ${n} ${n === 1 ? 'receta registrada' : 'recetas registradas'}`];
      }),
      onCambio: (nueva) => {
        if (nueva === area) return;
        area = nueva;
        o.onArea?.(nueva);
        pintar();
        pestanas.querySelector('[aria-pressed="true"]')?.focus();
      },
    });
    ponerSelector(modos, {
      etiqueta: 'Añadir por', valor: modo,
      opciones: [['tandas', 'Tandas'], ['unidades', 'Unidades']],
      onCambio: (nuevo) => {
        if (nuevo === modo) return;
        modo = nuevo;
        cantidades.clear();
        pintarPestanas();
        buscar();
      },
    });
  }

  /** «Ver»: que columna se muestra cuando solo cabe una (el CSS lo oculta en dos). */
  function pintarVista() {
    node.dataset.panel = panel;
    ponerSelector(vista, {
      etiqueta: 'Ver', valor: panel, clase: 'reg__vista',
      opciones: [['anadir', 'Añadir recetas'], ['registradas', `Registradas (${filas.length})`]],
      onCambio: (nuevo) => {
        if (nuevo === panel) return;
        panel = nuevo;
        pintarVista();
      },
    });
  }

  // ---- Buscador -----------------------------------------------------------------

  /** Cuantas tandas añade la cantidad escrita a una receta, o por que no. */
  function calculo(receta) {
    const valor = cantidades.get(receta.id) ?? '1';
    if (modo === 'unidades') {
      const r = tandasParaUnidades(receta, valor);
      if (!r.ok) return { error: r.code === 'sin_rendimiento' ? 'Sin rendimiento: añádela por tandas' : r.message };
      const { tandas: t, salen, unidad, alMinimo } = r.value;
      return { tandas: t, detalle: `${formatQty(salen)} ${unidad} = ${tandas(t)}${alMinimo ? ' (mínimo)' : ''}` };
    }
    const n = numero(valor);
    if (!Number.isFinite(n) || n < FACTOR_MIN || n > FACTOR_MAX) return { error: `Indica entre ${formatQty(FACTOR_MIN)} y ${FACTOR_MAX} tandas` };
    const t = redondear(n);
    const rinde = rendimientoEscalado(receta.nombre, t);
    return { tandas: t, detalle: `${tandas(t)}${rinde ? ` · salen ${rinde}` : ''}` };
  }

  function buscar() {
    clear(resultados);
    const escrito = buscador.value.trim();
    const texto = normalize(escrito);
    const delArea = o.recetas.filter((r) => r.categoria === area);
    const halladas = delArea
      .filter((r) => !texto || normalize(r.nombre).includes(texto))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!halladas.length) {
      const borrar = texto && delArea.length
        ? botonAccion('Borrar búsqueda', () => { buscador.value = ''; buscar(); buscador.focus(); },
          { dataset: { foco: 'borrar-busqueda' } })
        : null;
      resultados.appendChild(el('li', {}, [vacio({
        clase: 'reg__vacio',
        texto: borrar
          ? `Ninguna receta de ${nombreArea(area)} coincide con «${escrito}».`
          : `El recetario no tiene recetas de ${nombreArea(area)}.`,
        accion: borrar,
      })]));
      return;
    }
    for (const receta of halladas) {
      const c = calculo(receta);
      const existente = filaActual(receta.id);
      const nombre = titleCase(receta.nombre);
      const verbo = existente ? 'Sumar a' : 'Añadir';
      const boton = el('button', {
        type: 'button', class: 'btn btn--quiet reg__anadir', disabled: Boolean(c.error),
        attrs: { 'aria-label': `${verbo} ${nombre}: ${c.error || c.detalle}` },
        on: { click: () => conEspera(boton, () => anadir(receta)) },
      }, [el('span', { text: existente ? 'Sumar' : 'Añadir' })]);
      const detalle = el('small', { text: c.error || (existente ? `En el día: ${tandas(existente.factor)} · +${c.detalle}` : c.detalle) });
      const campoCantidad = el('input', { type: 'number', class: 'field reg__cantidad-receta',
        id: receta === halladas[0] ? 'reg-cantidad' : `reg-cantidad-${receta.id}`, value: cantidades.get(receta.id) ?? '1',
        min: modo === 'unidades' ? '1' : '0.05', step: modo === 'unidades' ? '1' : '0.001',
        attrs: { 'aria-label': `${modo === 'unidades' ? 'Unidades' : 'Tandas'} a añadir de ${nombre}` },
        on: { input: (e) => {
          cantidades.set(receta.id, e.target.value);
          const nuevo = calculo(receta);
          detalle.textContent = nuevo.error || nuevo.detalle;
          boton.disabled = Boolean(nuevo.error);
          boton.setAttribute('aria-label', `${verbo} ${nombre}: ${nuevo.error || nuevo.detalle}`);
        } } });
      resultados.appendChild(el('li', { class: 'reg__resultado', dataset: { receta: receta.id } }, [
        el('div', { class: 'reg__resultado-texto' }, [
          el('strong', { text: nombre }),
          detalle,
          el('label', { class: 'reg__cantidad-propia' }, [el('span', { text: modo === 'unidades' ? 'Unidades a añadir' : 'Tandas de esta partida (½ = 0,5)' }), campoCantidad]),
        ]),
        boton,
      ]));
    }
  }

  // ---- Guardar ------------------------------------------------------------------

  /** Un aviso que no se guardo: arriba, anunciado con prioridad. */
  function avisar(mensaje) {
    estado.textContent = mensaje;
    announce(mensaje, 'assertive');
  }

  function anadir(receta) {
    const nombre = titleCase(receta.nombre);
    return fijar(receta.id, () => {
      // En su turno: si otro cambio la acaba de añadir, esto ya es sumar.
      const existente = filaActual(receta.id);
      const c = calculo(receta);
      if (c.error) return { error: c.error };
      const nuevo = redondear((existente?.factor || 0) + c.tandas);
      if (nuevo > FACTOR_MAX) return { error: topeSuperado() };
      return {
        factor: nuevo,
        partidas: [...partidasDe(receta.id), c.tandas],
        mensaje: existente ? `Sumaste ${c.detalle} a ${nombre}. Queda en ${tandas(nuevo)}.` : `${nombre} registrada: ${c.detalle}.`,
        marca: { zona: 'reg__resultado', texto: existente ? 'Sumada ✓' : 'Añadida ✓' },
      };
    }, { foco: { receta: receta.id, clase: 'reg__anadir' } });
  }

  /**
   * Envia un cambio, en su turno, con la version que se pinto, y repinta.
   *
   * @param {string} recetaId
   * @param {() => ({factor: number, mensaje: string, marca?: object}|{error: string}|null)} preparar
   *   calcula el cambio en su turno, con los datos que dejo el anterior; `null`
   *   si ya no hay nada que hacer.
   * @param {{foco?: object|null, quitar?: number|null, alRechazar?: () => void}} [despues]
   *   `foco` es el control que debe quedar enfocado; sin el, se devuelve el que
   *   tenia el foco al terminar (por ejemplo, adonde se fue al salir del campo).
   *   `quitar` es la posicion de la fila que se quita.
   * @returns {Promise<boolean>} si se guardo
   */
  function fijar(recetaId, preparar, { foco = null, quitar = null, alRechazar = null } = {}) {
    clear(deshacer);
    return enCola(async () => {
      const paso = preparar();
      if (!paso) return false;
      if (paso.error) {
        avisar(paso.error);
        alRechazar?.();
        return false;
      }
      const r = await o.onFijar({ fecha: o.fecha, revision: revisionVista, recetaId, factor: paso.factor, partidas: paso.partidas });
      // Los datos se ponen al dia ya, para el siguiente turno; el DOM, cuando
      // el puntero no este a medio toque.
      if (r.ok) releer();
      await punteroLibre();
      const antes = claveDe(document.activeElement);
      if (!r.ok) {
        avisar(r.message);
        if (r.code === 'conflicto') {
          pintar();
          devolverFoco(foco || antes);
        } else {
          alRechazar?.();
        }
        return false;
      }
      estado.textContent = paso.mensaje;
      announce(paso.mensaje);
      repintar();
      if (quitar !== null) focoTrasQuitar(quitar);
      else devolverFoco(foco || antes);
      if (paso.marca) marcarHecho(itemDe(recetaId, paso.marca.zona), paso.marca.texto);
      return true;
    });
  }

  /**
   * Ofrece devolver al dia una receta recien quitada, con sus mismas tandas.
   *
   * No es un historial: solo la ultima, y desaparece con el cambio siguiente.
   * Quitar por error cuesta un toque deshacerlo, en vez de volver a buscar la
   * receta y escribir otra vez la cantidad.
   */
  function ofrecerDeshacer(recetaId, factor, nombre) {
    if (!factor) return;
    clear(deshacer);
    const boton = botonAccion('Deshacer', () => conEspera(boton, () => fijar(recetaId,
      () => ({ factor, mensaje: `${nombre} vuelve al día: ${tandas(factor)}.`,
        marca: { zona: 'dia', texto: 'Añadida ✓' } }),
      { foco: { receta: recetaId, clase: 'reg__tandas' } })), {
      clase: 'btn btn--quiet reg__deshacer-boton', etiqueta: `Deshacer: volver a añadir ${nombre}`,
    });
    deshacer.appendChild(boton);
  }

  // ---- Registradas --------------------------------------------------------------

  function pintarLista() {
    clear(lista);
    tituloDia.textContent = `Registradas (${filas.length})`;
    if (!filas.length) {
      lista.appendChild(vacio({ clase: 'reg__vacio',
        texto: `Todavía no hay recetas de ${nombreArea(area)} este día. Búscalas y pulsa Añadir.` }));
      return;
    }
    lista.appendChild(el('ul', { class: 'reg__filas' }, filas.map(filaDe)));
    const total = redondear(filas.reduce((s, f) => s + f.factor, 0));
    lista.appendChild(el('p', { class: 'reg__total', text: `Total: ${recetasTexto(filas.length)} · ${tandas(total)}` }));
  }

  function filaDe(fila, indice) {
    const nombre = titleCase(fila.recipe.nombre);
    const id = fila.recipe.id;
    const idNombre = `reg-fila-${indice}`;
    const piso = Math.max(FACTOR_MIN, fila.producido);
    const marcaGuardado = { zona: 'reg__fila', texto: 'Guardado ✓' };

    /** El campo vuelve a lo guardado: no puede quedar una cifra que no se guardo. */
    function restaurar() {
      if (!campo.isConnected) return;
      campo.value = String(filaActual(id)?.factor ?? fila.factor);
      campo.dataset.enviado = campo.value;
    }

    /** Un cambio de tandas validado en su turno contra lo que hay guardado. */
    function cambio(calcular) {
      return () => {
        const actual = filaActual(id);
        if (!actual) return null;
        const valor = calcular(actual);
        if (valor === null || valor === actual.factor) return null;
        if (!Number.isFinite(valor) || valor < FACTOR_MIN) return { error: fueraDeRango() };
        if (valor > FACTOR_MAX) return { error: topeSuperado() };
        if (valor < actual.producido) return { error: noBajar(actual.producido) };
        return { factor: valor, mensaje: `${nombre}: ${tandas(valor)}.`, marca: marcaGuardado };
      };
    }

    /** Guarda lo escrito en el campo (al salir o con Intro). */
    function guardarCampo(foco) {
      // Intro y el `change` posterior no guardan dos veces lo mismo.
      if (campo.dataset.enviado === campo.value) return;
      campo.dataset.enviado = campo.value;
      const valor = redondear(numero(campo.value));
      fijar(id, cambio(() => valor), { foco, alRechazar: restaurar });
    }

    const campo = el('input', {
      type: 'number', class: 'field reg__tandas', value: String(fila.factor),
      min: String(piso), max: String(FACTOR_MAX), step: '0.05', inputMode: 'decimal',
      dataset: { enviado: String(fila.factor) },
      attrs: { 'aria-label': `Tandas de ${nombre}` },
      on: {
        change: () => guardarCampo(null),
        keydown: (evento) => {
          if (evento.key !== 'Enter') return;
          evento.preventDefault();
          guardarCampo({ receta: id, clase: 'reg__tandas' });
        },
      },
    });

    const noBaja = redondear(fila.factor - 1) < piso;
    const noSube = redondear(fila.factor + 1) > FACTOR_MAX;
    const botonMenos = botonAccion('', () => conEspera(botonMenos,
      () => fijar(id, cambio((f) => redondear(f.factor - 1)), { foco: { receta: id, clase: 'reg__menos' } })), {
      clase: 'btn btn--quiet reg__menos', dibujo: ICON_MENOS, etiqueta: `Una tanda menos de ${nombre}`,
      disabled: noBaja,
      title: noBaja ? (fila.producido > 0 ? noBajar(fila.producido) : 'Para menos de una tanda, escribe la cifra en el campo.') : null,
    });
    const botonMas = botonAccion('', () => conEspera(botonMas,
      () => fijar(id, cambio((f) => redondear(f.factor + 1)), { foco: { receta: id, clase: 'reg__mas' } })), {
      clase: 'btn btn--quiet reg__mas', dibujo: ICON_MAS, etiqueta: `Una tanda más de ${nombre}`,
      disabled: noSube,
      title: noSube ? topeSuperado() : null,
    });

    let quitar;
    if (fila.producido > 0) {
      quitar = el('p', { class: 'reg__no-quitar', text: 'Ya se produjo: no se puede quitar.' });
    } else {
      let tandasQuitadas = 0;
      quitar = botonAccion('Quitar', () => conEspera(quitar, async () => {
        const hecho = await fijar(id, () => {
          const actual = filaActual(id);
          if (!actual) return null;
          tandasQuitadas = actual.factor;
          return { factor: 0, mensaje: `${nombre} quitada del día.` };
        }, { quitar: indice });
        if (hecho) ofrecerDeshacer(id, tandasQuitadas, nombre);
      }), {
        clase: 'btn btn--quiet reg__quitar', dibujo: ICON_ELIMINAR, etiqueta: `Quitar ${nombre}`,
      });
    }

    const rinde = rendimientoBase(fila.recipe.nombre) === null
      ? 'sin rendimiento'
      : `salen ${rendimientoEscalado(fila.recipe.nombre, fila.factor)}`;
    const hechas = fila.producido
      ? `${tandas(fila.producido)} ya ${fila.producido === 1 ? 'hecha' : 'hechas'}`
      : '';
    return el('li', { class: 'reg__fila', dataset: { receta: id } }, [
      el('div', { class: 'reg__fila-texto' }, [
        el('strong', { id: idNombre, text: nombre }),
        el('small', { text: [rinde, hechas,
          fila.preparacion?.asignado ? `Asignada a ${fila.preparacion.asignado.nombre}` : ''].filter(Boolean).join(' · ') }),
      ]),
      insigniaEstado(fila.estado, fila.parcial),
      el('div', { class: 'reg__fila-tandas', attrs: { role: 'group', 'aria-labelledby': idNombre } },
        [botonMenos, campo, botonMas]),
      quitar,
      el('p', { class: 'reg__ayuda-tandas', text: 'El campo superior cambia el total de esta receta. Abajo puedes editar cada partida por separado.' }),
      editorPartidas(fila),
      el('details', { class: 'reg__consumo' }, [el('summary', { text: 'Ver consumo total de esta receta en gramos' }),
        el('ul', {}, materialesEnGramos([{ recipe: fila.recipe, factor: fila.factor }], o.leerDatos()?.lotes || [], o.fecha).lineas.map((l) =>
          el('li', { text: `${titleCase(l.ingrediente)}: ${l.cantidad === null ? 'falta equivalencia en Bodega' : `${formatQty(l.cantidad)} g`}` }))),
      ]),
    ]);
  }

  function partidasDe(id) {
    const e = o.leerDatos()?.planes.find((p) => p.fecha === o.fecha)?.entradas.find((x) => x.recipe.id === id);
    const pendiente = filaActual(id)?.pendiente || 0;
    return e?.partidas ?? (pendiente > 0 ? [pendiente] : []);
  }

  function editorPartidas(fila) {
    const id = fila.recipe.id;
    return el('div', { class: 'reg__partidas' }, partidasDe(id).map((n, indice) => {
      const campo = el('input', { type: 'number', class: 'field', value: String(n), min: '0.05', max: '100', step: '0.001',
        dataset: { foco: `partida-${id}-${indice}` }, attrs: { 'aria-label': `Tandas de partida ${indice + 1} de ${titleCase(fila.recipe.nombre)}` } });
      const cambiar = (quitar = false) => fijar(id, () => {
        const partes = [...partidasDe(id)];
        if (quitar) partes.splice(indice, 1); else partes[indice] = numero(campo.value);
        if (partes.some((x) => !Number.isFinite(x) || x < FACTOR_MIN || x > FACTOR_MAX)) return { error: fueraDeRango() };
        return { factor: redondear((filaActual(id)?.producido || 0) + partes.reduce((s, x) => s + x, 0)), partidas: partes,
          mensaje: `Partidas de ${titleCase(fila.recipe.nombre)} actualizadas.` };
      }, { foco: { foco: `partida-${id}-${indice}` }, alRechazar: () => { campo.value = String(partidasDe(id)[indice] ?? n); } });
      campo.addEventListener('change', () => cambiar());
      return el('div', { class: 'reg__partida' }, [el('label', {}, [el('span', { text: `Partida ${indice + 1} · tandas` }), campo]),
        botonAccion('½ tanda', () => { campo.value = '0.5'; cambiar(); }),
        botonAccion('Quitar partida', () => cambiar(true)),
        el('small', { text: rendimientoEscalado(fila.recipe.nombre, n) || 'Rendimiento no declarado' })]);
    }));
  }

  /** Lo que cambia tras guardar: cifras, lista y resultados. */
  function repintar() {
    pintarVista();
    pintarPestanas();
    pintarLista();
    buscar();
  }

  function pintar() {
    titulo.textContent = `Registrar producción · ${nombreArea(area)}`;
    node.dataset.area = claseArea(area);
    releer();
    repintar();
  }

  pintar();
  return { node, enfocar: () => {
    const destino = o.recetaId ? itemDe(o.recetaId, 'reg__fila')?.querySelector('.reg__tandas') : null;
    (destino || buscador).focus();
    destino?.scrollIntoView?.({ block: 'nearest' });
  } };
}
