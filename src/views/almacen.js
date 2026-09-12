/**
 * =============================================================================
 *  ALMACEN (BODEGA)
 * =============================================================================
 *
 *  La pantalla desde la que se administra lo que hay comprado: que ingrediente,
 *  como se compro, a que precio, cuanto queda y cuando vence.
 *
 *  QUE ENSEÑA CADA FILA, Y POR QUE ESAS COLUMNAS
 *  ---------------------------------------------
 *  Son las que el usuario pidio, en el orden en que se leen al hacer un
 *  inventario con el papel del proveedor delante: el ingrediente y su marca,
 *  como viene presentado, cuanto trae y cuanto costo, **el valor por unidad de
 *  medida** -que es la cifra que de verdad sirve para costear-, lo que queda, y
 *  la fecha con su estado.
 *
 *  El valor unitario NO se teclea: sale de dividir el costo entre el peso. Es la
 *  unica cifra derivada de la pantalla y se recalcula sola al cambiar cualquiera
 *  de las dos, asi que no puede quedarse desfasada.
 *
 *  LO QUE ESTA PANTALLA NO HACE
 *  ----------------------------
 *  No descuenta existencias. Eso ocurre desde el plan del dia, con una
 *  confirmacion, porque descontar es destructivo y tiene que ir pegado a la
 *  decision de producir. Ver `views/plan.js` y `app/almacen.js`.
 *
 *  Esta vista no escribe estado: todo sale por callbacks (regla 12).
 */

import { el, clear } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { comboboxIngrediente } from '../lib/combobox.js';
import { formatQty, normalize, pesos, fechaCorta } from '../lib/format.js';
import { UNITS } from '../core/schema.js';
import {
  PRESENTACIONES,
  estadoVencimiento,
  loteVacio,
  lotesOrdenadosFEFO,
  resumenAlmacen,
  valorUnitario,
} from '../core/almacen.js';
import { crearPantalla } from './pantalla.js';

/** Como se rotula cada estado de vencimiento. El color nunca va solo. */
const ROTULO_ESTADO = {
  vencido: 'Vencido',
  proximo: 'Vence pronto',
  ok: 'En fecha',
  sin_fecha: 'Sin fecha',
};

/** Clase de cada estado, para no construir nombres de clase concatenando. */
const CLASE_ESTADO = {
  vencido: 'almacen__estado--vencido',
  proximo: 'almacen__estado--proximo',
  ok: 'almacen__estado--ok',
  sin_fecha: 'almacen__estado--sinfecha',
};

/**
 * @param {Object} options
 * @param {() => Array<object>} options.leerLotes estado vigente del almacen
 * @param {Array<{nombre: string, unidad: string}>} options.ingredientes catalogo del recetario
 * @param {(lote: object) => object} options.onGuardar
 * @param {(id: string) => object} options.onEliminar
 * @param {() => object} options.onSembrarDemo
 * @param {() => void} options.onMenu
 * @param {() => void} options.onSalir
 * @returns {{node: HTMLElement, pintarAvisos: (nodos: Array<Node>) => void, close: () => void}}
 */
export function openAlmacen(options) {
  /*
   * TODO ESTO VIVE EN LA VENTANA Y NO EN EL ESTADO.
   *
   * El dialogo tiene clave fija en `src/dialogs.js`, asi que no se reconstruye
   * mientras esta abierto: si lo hiciera, borraria el formulario a medio
   * rellenar. Meter esto en el estado seria estado muerto, que cambia sin
   * repintar nada.
   */
  let orden = 'nombre';
  let editando = null;
  /** Listas de sugerencias vivas del formulario, para poder soltarlas. */
  let combosDelForm = [];

  const buscador = el('input', {
    type: 'search',
    id: 'alm-buscar',
    class: 'field',
    placeholder: 'Buscar ingrediente, marca o lote…',
    autocomplete: 'off',
    on: { input: () => dibujar() },
  });

  const resumenHost = el('div', { class: 'almacen__resumen' });
  const formHost = el('div', { class: 'almacen__form-host' });
  const tablaHost = el('div', { class: 'almacen__tabla' });
  const contador = el('p', { class: 'almacen__contador', attrs: { role: 'status' } });

  const botonesOrden = [
    { clave: 'nombre', texto: 'A–Z' },
    { clave: 'vence', texto: 'Vence antes' },
    { clave: 'valor', texto: 'Más valor' },
  ].map((op) =>
    el('button', {
      type: 'button',
      class: 'almacen__orden-btn',
      text: op.texto,
      dataset: { orden: op.clave },
      attrs: { 'aria-pressed': String(orden === op.clave) },
      on: {
        click: () => {
          orden = op.clave;
          for (const boton of botonesOrden) {
            boton.setAttribute('aria-pressed', String(boton.dataset.orden === orden));
          }
          dibujar();
        },
      },
    }),
  );

  const botonNuevo = el('button', {
    type: 'button',
    class: 'btn btn--accent',
    text: '+ Nuevo lote',
    on: { click: () => abrirFormulario(null) },
  });

  const cuerpo = el('div', { class: 'almacen' }, [
    resumenHost,
    el('div', { class: 'almacen__barra' }, [
      buscador,
      el('div', { class: 'almacen__orden' }, botonesOrden),
      botonNuevo,
    ]),
    formHost,
    contador,
    tablaHost,
  ]);

  /* =========================================================================
   *  PINTADO
   * ====================================================================== */

  function lotesVisibles() {
    const todos = options.leerLotes() || [];
    const aguja = normalize(buscador.value || '').trim();

    const filtrados =
      aguja === ''
        ? todos
        : todos.filter((l) =>
            [l.ingrediente, l.marca, l.lote, l.presentacion]
              .map((t) => normalize(t || ''))
              .join(' ')
              .includes(aguja),
          );

    if (orden === 'vence') return lotesOrdenadosFEFO(filtrados);
    if (orden === 'valor') {
      return [...filtrados].sort(
        (a, b) => valorRestante(b) - valorRestante(a) || a.ingrediente.localeCompare(b.ingrediente, 'es'),
      );
    }
    return [...filtrados].sort(
      (a, b) => a.ingrediente.localeCompare(b.ingrediente, 'es') || String(a.id).localeCompare(String(b.id)),
    );
  }

  function dibujar() {
    const todos = options.leerLotes() || [];
    pintarResumen(todos);

    const visibles = lotesVisibles();
    clear(tablaHost);

    if (todos.length === 0) {
      contador.textContent = '';
      tablaHost.appendChild(pintarVacio());
      return;
    }

    contador.textContent =
      visibles.length === todos.length
        ? `${todos.length} lotes en el almacén`
        : `${visibles.length} de ${todos.length} lotes`;

    tablaHost.appendChild(cabecera());
    for (const lote of visibles) tablaHost.appendChild(fila(lote));

    if (visibles.length === 0) {
      tablaHost.appendChild(
        el('p', { class: 'almacen__sin-resultados', text: 'Ningún lote coincide con esa búsqueda.' }),
      );
    }
  }

  function pintarResumen(lotes) {
    const r = resumenAlmacen(lotes);
    clear(resumenHost);

    const datos = [
      { cifra: pesos(r.valorTotal), rotulo: 'valor en bodega' },
      { cifra: String(r.lotes), rotulo: r.lotes === 1 ? 'lote' : 'lotes' },
      { cifra: String(r.ingredientes), rotulo: 'ingredientes' },
      { cifra: String(r.proximos), rotulo: 'vencen pronto' },
      { cifra: String(r.vencidos), rotulo: r.vencidos === 1 ? 'vencido' : 'vencidos' },
    ];

    for (const dato of datos) {
      resumenHost.appendChild(
        el('div', { class: 'almacen__dato' }, [
          el('span', { class: 'almacen__dato-cifra', text: dato.cifra }),
          el('span', { class: 'almacen__dato-rotulo', text: dato.rotulo }),
        ]),
      );
    }
  }

  /**
   * Pantalla vacia.
   *
   * Ofrece sembrar datos de ejemplo porque un almacen en blanco no enseña nada:
   * no se ve como se lee una fila, ni que significa un lote vencido, ni como
   * cruza con el plan del dia.
   */
  function pintarVacio() {
    return el('div', { class: 'almacen__vacio' }, [
      el('p', { text: 'El almacén de este equipo está vacío.' }),
      el('p', {
        class: 'almacen__vacio-nota',
        text:
          'Puedes empezar dando de alta tus compras reales, o cargar unos lotes de ejemplo para ver cómo funciona y borrarlos después.',
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        text: 'Cargar lotes de ejemplo',
        on: {
          click: () => {
            const r = options.onSembrarDemo();
            if (r && r.ok) {
              announce(`${r.value} lotes de ejemplo cargados.`);
              dibujar();
              // EL FOCO NO SE PUEDE QUEDAR EN EL AIRE.
              //
              // Este boton deja de existir en cuanto hay lotes, asi que el foco
              // caeria al `body` y la ventana dejaria de responder al teclado:
              // Escape no cerraria, y quien navega sin raton se quedaria fuera
              // de la pantalla que acaba de abrir. Se lleva a la accion que toca
              // ahora, que es dar de alta lo siguiente.
              botonNuevo.focus();
            }
          },
        },
      }),
    ]);
  }

  /*
   * Los rotulos se alinean como sus datos y NO llevan `almacen__num`.
   *
   * Esa clase trae ademas la tipografia monoespaciada y un tamaño mayor que el
   * del encabezado, asi que la linea de rotulos salia con dos tipografias y dos
   * tamaños mezclados. `almacen__head-num` solo alinea.
   *
   * La celda vacia del final tiene que seguir estando: es la que ocupa la
   * columna de acciones. Sin ella la rejilla del encabezado tendria seis
   * columnas y la de las filas siete.
   */
  function cabecera() {
    return el('div', { class: 'almacen__head', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { text: 'ingrediente' }),
      el('span', { text: 'presentación' }),
      el('span', { class: 'almacen__head-num', text: 'compra' }),
      // «valor / und» no lo entendia nadie, y con razon: no decia de que unidad
      // hablaba. Lo dice ahora cada celda, con la unidad de su propio lote.
      el('span', { class: 'almacen__head-num', text: 'costo por unidad' }),
      el('span', { class: 'almacen__head-num', text: 'existencia' }),
      el('span', { text: 'vence' }),
      el('span'),
    ]);
  }

  /**
   * El rótulo de un dato dentro de su celda.
   *
   * Va en el DOM y no en un `content: attr()` del CSS a propósito: aquí el
   * texto que se pinta ES el dato, y sacarlo a la hoja de estilos lo dejaría
   * fuera del árbol de accesibilidad en unos navegadores y dentro en otros. En
   * pantalla ancha lo esconde el CSS, que es donde hay encabezado y sobra.
   *
   * @param {string} texto
   * @returns {HTMLElement}
   */
  function rotulo(texto) {
    return el('span', { class: 'almacen__rotulo', text: texto });
  }

  function fila(lote) {
    const estado = estadoVencimiento(lote);
    const unitario = valorUnitario(lote);

    return el('div', { class: 'almacen__fila' }, [
      el('div', { class: 'almacen__ing' }, [
        el('span', { class: 'almacen__nombre', text: lote.ingrediente }),
        el('span', {
          class: 'almacen__marca',
          // La marca y el codigo de lote van juntos y en pequeño: son lo que
          // permite identificar el saco fisico en la estanteria.
          text: [lote.marca, lote.lote ? 'lote ' + lote.lote : ''].filter(Boolean).join(' · ') || lote.id,
        }),
      ]),
      el('span', { class: 'almacen__celda' }, [
        rotulo('presentación'),
        el('span', { text: lote.presentacion || '—' }),
      ]),
      el('span', { class: 'almacen__num' }, [
        rotulo('compra'),
        el('span', {
          text: `${formatQty(lote.pesoCompra)} ${lote.unidad} · ${pesos(lote.costoCompra)}`,
        }),
      ]),
      el('div', { class: 'almacen__num almacen__unitario' }, [
        rotulo('costo por unidad'),
        el('span', {
          // Tres decimales: un gramo de harina vale menos de un peso, y con cero
          // decimales toda la columna diria "$0" y no serviria para nada.
          text: unitario === null ? '—' : '$' + (Math.round(unitario * 1000) / 1000).toLocaleString('es-CO'),
        }),
        // La unidad, debajo y en letra pequeña. Es lo que contesta «¿costo por
        // que?» sin tener que ir a mirar la columna de la compra: la unidad
        // minima es 1 de lo que diga el bulto, y de ahi sale todo el costeo.
        unitario === null
          ? null
          : el('span', { class: 'almacen__unitario-und', text: `por 1 ${lote.unidad}` }),
      ]),
      el('span', { class: 'almacen__num' }, [
        rotulo('existencia'),
        el('span', { text: `${formatQty(lote.existencia)} ${lote.unidad}` }),
      ]),
      el('div', { class: 'almacen__vence' }, [
        rotulo('vence'),
        el('span', { text: fechaCorta(lote.vencimiento) }),
        el('span', {
          // El estado lleva SIEMPRE su texto: el color no puede ser la unica
          // señal, y menos en una tableta a contraluz en el obrador.
          class: 'almacen__estado ' + CLASE_ESTADO[estado],
          text: ROTULO_ESTADO[estado],
        }),
      ]),
      el('div', { class: 'almacen__acciones' }, [
        el('button', {
          type: 'button',
          class: 'btn-link',
          text: 'Editar',
          attrs: { 'aria-label': `Editar el lote de ${lote.ingrediente}` },
          on: { click: () => abrirFormulario(lote) },
        }),
        el('button', {
          type: 'button',
          class: 'btn-icon',
          text: '×',
          attrs: { 'aria-label': `Eliminar el lote ${lote.id} de ${lote.ingrediente}` },
          on: { click: () => pedirBaja(lote) },
        }),
      ]),
    ]);
  }

  /* =========================================================================
   *  ALTA Y EDICION
   * ====================================================================== */

  /**
   * Confirma la baja EN LA PROPIA FILA.
   *
   * Ni `confirm()` del navegador ni otro dialogo encima de este: el almacen ya
   * es una ventana modal, y apilar otra para una pregunta de una linea
   * desorienta. La pregunta aparece donde estaba la fila, que es donde la
   * persona esta mirando.
   */
  function pedirBaja(lote) {
    const aviso = el('div', { class: 'almacen__confirmar' }, [
      el('span', { text: `¿Eliminar el lote ${lote.id} de ${lote.ingrediente}?` }),
      el('button', {
        type: 'button',
        class: 'btn btn--destructive',
        text: 'Eliminar',
        on: {
          click: () => {
            const r = options.onEliminar(lote.id);
            if (r && r.ok) {
              dibujar();
              // La fila que tenia el foco ya no existe: se devuelve a la barra.
              botonNuevo.focus();
            }
          },
        },
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--quiet',
        text: 'Conservar',
        on: {
          click: () => {
            dibujar();
            botonNuevo.focus();
          },
        },
      }),
    ]);

    clear(formHost);
    formHost.appendChild(aviso);
    const boton = aviso.querySelector('button');
    if (boton) boton.focus();
  }

  function cerrarFormulario() {
    for (const combo of combosDelForm) combo.destruir();
    combosDelForm = [];
    editando = null;
    clear(formHost);
  }

  /**
   * Monta el formulario de alta o de edicion.
   *
   * @param {object|null} lote null para dar de alta
   */
  function abrirFormulario(lote) {
    cerrarFormulario();
    editando = lote ? { ...lote } : loteVacio('');

    const error = el('p', { class: 'form-error', attrs: { role: 'alert' } });

    /** Un campo del formulario, con su etiqueta. */
    const campo = (id, etiqueta, input) =>
      el('div', { class: 'almacen__campo' }, [
        el('label', { class: 'label', for: id, text: etiqueta }),
        input,
      ]);

    const texto = (id, clave, extra = {}) =>
      el('input', {
        type: 'text',
        id,
        class: 'field' + (extra.numerico ? ' field--num' : ''),
        value: editando[clave] === 0 ? '0' : String(editando[clave] || ''),
        inputMode: extra.numerico ? 'decimal' : undefined,
        autocomplete: 'off',
        on: {
          input: (evento) => {
            editando[clave] = extra.mayusculas
              ? evento.target.value.toUpperCase()
              : evento.target.value;
          },
        },
      });

    const campoIngrediente = texto('alm-ing', 'ingrediente', { mayusculas: true });
    const campoPresentacion = texto('alm-pres', 'presentación', { mayusculas: true });
    const campoUnidad = texto('alm-und', 'unidad', { mayusculas: true });

    const cajaIngrediente = el('div', { class: 'combo' }, [campoIngrediente]);
    const cajaPresentacion = el('div', { class: 'combo' }, [campoPresentacion]);
    const cajaUnidad = el('div', { class: 'combo' }, [campoUnidad]);

    /*
     * EL INGREDIENTE SE ELIGE DEL RECETARIO, NO SE TECLEA A CIEGAS.
     *
     * Es lo que hace que el cruce con el plan del dia funcione. El almacen y las
     * recetas se casan por NOMBRE Y UNIDAD (`claveDe`), asi que escribir
     * "HARINA" donde el recetario dice "HARINA DE TRIGO" deja ese lote invisible
     * para el costeo: no daria error, simplemente esa linea saldria sin precio y
     * nadie sabria por que.
     */
    combosDelForm.push(
      comboboxIngrediente({
        input: campoIngrediente,
        contenedor: cajaIngrediente,
        opciones: options.ingredientes || [],
        onElegir: (opcion) => {
          campoIngrediente.value = String(opcion.nombre).toUpperCase();
          editando.ingrediente = campoIngrediente.value;
          // Se propone la unidad con la que ese ingrediente se mide en las
          // recetas: es la que hace que el cruce encuentre el lote.
          if (opcion.unidad && campoUnidad.value.trim() === '') {
            campoUnidad.value = String(opcion.unidad).toUpperCase();
            editando.unidad = campoUnidad.value;
          }
        },
      }),
    );

    combosDelForm.push(
      comboboxIngrediente({
        input: campoPresentacion,
        contenedor: cajaPresentacion,
        opciones: PRESENTACIONES.map((p) => ({ nombre: p })),
        onElegir: (opcion) => {
          campoPresentacion.value = opcion.nombre;
          editando.presentacion = opcion.nombre;
        },
      }),
    );

    combosDelForm.push(
      comboboxIngrediente({
        input: campoUnidad,
        contenedor: cajaUnidad,
        opciones: UNITS.map((u) => ({ nombre: u })),
        onElegir: (opcion) => {
          campoUnidad.value = opcion.nombre;
          editando.unidad = opcion.nombre;
        },
      }),
    );

    const campoVence = el('input', {
      type: 'date',
      id: 'alm-vence',
      class: 'field',
      value: editando.vencimiento || '',
      on: { input: (evento) => { editando.vencimiento = evento.target.value; } },
    });

    const form = el('form', { class: 'almacen__form' }, [
      el('h3', {
        class: 'section-label',
        text: lote ? `Editar el lote ${lote.id}` : 'Nuevo lote',
      }),
      el('div', { class: 'almacen__campos' }, [
        campo('alm-ing', 'ingrediente', cajaIngrediente),
        campo('alm-marca', 'marca', texto('alm-marca', 'marca')),
        campo('alm-pres', 'presentación', cajaPresentacion),
        campo('alm-peso', 'peso de compra', texto('alm-peso', 'pesoCompra', { numerico: true })),
        campo('alm-und', 'unidad', cajaUnidad),
        campo('alm-costo', 'costo de compra', texto('alm-costo', 'costoCompra', { numerico: true })),
        campo('alm-exist', 'existencia', texto('alm-exist', 'existencia', { numerico: true })),
        campo('alm-lote', 'lote', texto('alm-lote', 'lote')),
        campo('alm-vence', 'vencimiento', campoVence),
      ]),
      error,
      el('div', { class: 'almacen__form-pie' }, [
        el('button', { type: 'submit', class: 'btn btn--accent', text: 'Guardar lote' }),
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Cancelar',
          on: { click: () => { cerrarFormulario(); botonNuevo.focus(); } },
        }),
      ]),
    ]);

    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const r = options.onGuardar(editando);
      if (!r.ok) {
        // El error se enseña DENTRO del formulario, donde se esta mirando, y se
        // anuncia. Nunca en un `alert()`.
        error.textContent = r.message;
        announce(r.message, 'assertive');
        return;
      }
      cerrarFormulario();
      dibujar();
      botonNuevo.focus();
    });

    formHost.appendChild(form);
    // El nodo ya esta en el documento: el foco se pide ahora y no antes
    // (regla 19).
    campoIngrediente.focus();
  }

  /* =========================================================================
   *  LA PANTALLA
   * ====================================================================== */

  dibujar();

  const pantalla = crearPantalla({
    modulo: 'almacen',
    subtitulo: 'almacén',
    // El costo por unidad se explica AQUI porque es la cifra que nadie teclea y
    // todo el mundo pregunta. Corto a proposito: en un telefono, cada renglon
    // de mas es un lote menos a la vista.
    meta:
      'Lo que hay comprado, a qué precio y cuándo vence. El costo por unidad sale de '
      + 'dividir lo que costó el bulto entre lo que trae. Se guarda solo en este equipo.',
    cuerpo,
    onMenu: options.onMenu,
    onVolver: options.onVolver,
    onSalir: options.onSalir,
  });

  return {
    node: pantalla.node,
    pintarAvisos: pantalla.pintarAvisos,
    enfocar: pantalla.enfocar,
    close: () => {
      // Las listas de sugerencias se sueltan antes de tirar la pantalla: si no,
      // quedarian oyentes colgando de campos que ya no estan en el documento.
      cerrarFormulario();
      pantalla.close();
    },
  };
}

/** Lo que vale lo que QUEDA de un lote, para poder ordenar por ahi. */
function valorRestante(lote) {
  const unitario = valorUnitario(lote);
  if (unitario === null) return 0;
  const queda = typeof lote.existencia === 'number' ? lote.existencia : parseFloat(lote.existencia) || 0;
  return unitario * queda;
}
