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

import { el, clear, icon } from '../lib/dom.js';
import { announce } from '../lib/a11y.js';
import { ICON_ELIMINAR, ICON_NUEVA } from '../lib/iconos.js';
import { aCSV, descargarCSV, nombreConFecha } from '../lib/csv.js';
import { comboboxIngrediente } from '../lib/combobox.js';
import { formatMedida as formatQty, normalize, pesos, fechaCorta } from '../lib/format.js';
import { UNIDADES_COMPRA, factorGramos, normalizarEquivalencias } from '../core/conversiones.js';
import {
  PRESENTACIONES,
  estadoVencimiento,
  loteVacio,
  lotesOrdenadosFEFO,
  resumenAlmacen,
  valorUnitario,
} from '../core/almacen.js';
import { crearPantalla } from './pantalla.js';
import { metric } from './navigation.js';
import { renderHistorial } from './historial.js';
import { hoyLocal } from '../core/bitacora.js';
import { fichaMedidasIngrediente } from './medidas-ingrediente.js';
import { esLoteDemo, PRECIOS_DEMO } from '../core/precios-demo.js';

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
  let filtro = 'todos';
  let editando = null;
  /** Listas de sugerencias vivas del formulario, para poder soltarlas. */
  let combosDelForm = [];
  const responsable = el('input', { type: 'text', class: 'field', placeholder: 'Nombre de quien registra', attrs: { 'aria-label': 'Responsable de bodega' } });
  const avisoOperacion = el('p', { class: 'historial__alerta', attrs: { role: 'status' } });
  const historial = renderHistorial({ leerDatos: options.leerDatos, tipo: 'bodega' });

  const buscador = el('input', {
    type: 'search',
    id: 'alm-buscar',
    class: 'field',
    placeholder: 'Buscar ingrediente, marca o lote…',
    autocomplete: 'off',
    attrs: { 'aria-label': 'Buscar ingrediente, marca o lote' },
    on: { input: () => dibujar() },
  });

  const resumenHost = el('div', { class: 'almacen__resumen' });
  const demoHost = el('section', { class: 'almacen__demo', attrs: { 'aria-label': 'Bodega demo Colombia' } });
  const formHost = el('div', { class: 'almacen__form-host' });
  const tablaHost = el('div', { class: 'almacen__tabla' });
  const medidasHost = el('div', { class: 'almacen__por-ingrediente' });
  const contador = el('p', { class: 'almacen__contador', attrs: { role: 'status' } });
  const filtros = el('div', { class: 'filter-tabs', attrs: { role: 'group', 'aria-label': 'Filtrar lotes' } });
  const opcionesFiltro = [
    ['todos', 'Todos'], ['disponibles', 'Con existencias'], ['proximo', 'Por vencer'],
    ['vencido', 'Vencidos'], ['agotados', 'Agotados'], ['sin_fecha', 'Sin fecha'],
  ];
  const botonesFiltro = opcionesFiltro.map(([clave, nombre]) => el('button', {
    type: 'button', class: 'filter-tabs__button', dataset: { filtro: clave },
    attrs: { 'aria-pressed': String(clave === filtro) },
    on: { click: () => {
      filtro = clave;
      for (const boton of botonesFiltro) boton.setAttribute('aria-pressed', String(boton.dataset.filtro === filtro));
      dibujar();
    } },
  }, [el('span', { text: nombre }), el('span', { class: 'filter-tabs__count' })]));
  for (const boton of botonesFiltro) filtros.appendChild(boton);

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
    on: { click: () => abrirFormulario(null) },
  }, [icon(ICON_NUEVA, { class: 'btn__icon' }), el('span', { class: 'btn__label', text: 'Nuevo lote' })]);

  const cuerpo = el('div', { class: 'almacen' }, [
    resumenHost,
    demoHost,
    el('div', { class: 'historial__filtros' }, [el('label', {}, ['Responsable de los movimientos', responsable]),
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Actualizar bodega', on: { click: dibujar } })]),
    avisoOperacion,
    el('div', { class: 'section-heading' }, [
      el('div', {}, [el('h2', { text: 'Inventario de lotes' }), el('p', { text: 'Compras, existencias y trazabilidad de tus materias primas.' })]),
      botonNuevo,
    ]),
    filtros,
    el('div', { class: 'almacen__barra' }, [
      buscador,
      el('div', { class: 'almacen__orden' }, botonesOrden),
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Exportar inventario', on: { click: exportar } }),
    ]),
    formHost,
    medidasHost,
    contador,
    tablaHost,
    historial.node,
  ]);

  /* =========================================================================
   *  PINTADO
   * ====================================================================== */

  function lotesVisibles() {
    const todos = (options.leerLotes() || []).filter((lote) => coincideFiltro(lote, filtro));
    const aguja = normalize(buscador.value || '').trim();

    const filtrados =
      aguja === ''
        ? todos
        : todos.filter((l) =>
            [l.ingrediente, l.marca, l.proveedor, l.lote, l.presentacion]
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
    historial.actualizar();
    const todos = options.leerLotes() || [];
    pintarDemo(todos);
    pintarResumen(todos);
    for (const boton of botonesFiltro) {
      boton.querySelector('.filter-tabs__count').textContent = String(todos.filter((lote) => coincideFiltro(lote, boton.dataset.filtro)).length);
    }

    const visibles = lotesVisibles();
    clear(tablaHost);
    clear(medidasHost);
    const nombres = [...new Set(visibles.map((l) => l.ingrediente))].sort((a, b) => a.localeCompare(b, 'es'));
    if (nombres.length) medidasHost.appendChild(el('details', {}, [
      el('summary', { text: `Medidas por ingrediente (${nombres.length})` }),
      el('p', { text: 'Consulta todos los lotes de cada ingrediente encontrado y sus cantidades equivalentes.' }),
      ...nombres.map((nombre) => {
        const contenido = el('div');
        return el('details', { on: { toggle: (e) => {
          if (e.currentTarget.open && !contenido.childElementCount) contenido.appendChild(fichaMedidasIngrediente(nombre, todos));
        } } }, [el('summary', { text: nombre }), contenido]);
      }),
    ]));

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
        el('p', { class: 'almacen__sin-resultados', text: 'Ningún lote coincide con los filtros seleccionados.' }),
      );
    }
  }

  function pintarDemo(todos) {
    clear(demoHost);
    if (!options.onDemoColombia) return;
    const activos = todos.filter(esLoteDemo), reales = todos.length - activos.length;
    demoHost.append(el('h3', { text: activos.length ? `DEMO activa · ${activos.length} ingredientes` : 'Probar producción con bodega completa' }),
      el('p', { text: `${PRECIOS_DEMO.length} ingredientes del recetario: precios en COP, presentaciones de compra y pesos de prueba. Referencias consultadas el 22/09/2026; los valores sin cotización se marcan como estimados.` }),
      el('p', { text: 'Se conservan las equivalencias existentes. Los pesos que falten serán supuestos DEMO visibles. Harina y mantequilla tienen recetas en UND que requieren revisión antes de operar con datos reales.' }));
    if (activos.length && reales) demoHost.append(el('p', { text: 'Hay compras reales junto a la demo: la producción utiliza ambos inventarios según FEFO. Revisa los lotes de origen antes de confirmar.' }));
    const estado = el('p', { attrs: { role: 'status' } });
    const boton = el('button', { type: 'button', class: 'btn btn--accent',
      text: activos.length ? 'Retirar precios y lotes demo' : 'Cargar bodega demo Colombia completa',
      on: { click: async () => {
        boton.disabled = true;
        try {
          const r = await (activos.length ? options.onRetirarDemo() : options.onDemoColombia());
          if (!r.ok) { estado.textContent = r.message; return; }
          avisoOperacion.textContent = activos.length ? 'Demo retirada; las compras reales y los costos ya confirmados se conservan.' : `${r.value} ingredientes demo cargados. Puedes probar Producción.`;
          dibujar(); demoHost.querySelector('button')?.focus();
        } catch { estado.textContent = 'No se pudo completar la carga. Inténtalo otra vez.'; }
        finally { boton.disabled = false; }
      } } });
    demoHost.append(boton, estado, el('small', { text: 'Retirar borra únicamente estos lotes demo disponibles. Las pruebas ya confirmadas conservan su historial y costo.' }));
  }

  function pintarResumen(lotes) {
    const r = resumenAlmacen(lotes);
    clear(resumenHost);

    for (const nodo of [
      metric(pesos(r.valorTotal), 'Valor en bodega', 'Valor de las existencias · COP', 'metric--featured'),
      metric(r.lotes, 'Lotes registrados', `${r.ingredientes} ingredientes / unidades`),
      metric(r.proximos, 'Vencen pronto', 'En los próximos 30 días'),
      metric(r.vencidos, 'Lotes vencidos', `${r.sinExistencia} lotes agotados`, r.vencidos ? 'metric--attention' : ''),
    ]) resumenHost.appendChild(nodo);
  }

  function coincideFiltro(lote, clave) {
    if (clave === 'todos') return true;
    if (clave === 'agotados') return !(lote.existencia > 0);
    if (clave === 'disponibles') return lote.existencia > 0;
    return estadoVencimiento(lote) === clave;
  }

  function exportar() {
    // Prefijo de texto para que nombres y códigos no se ejecuten como fórmulas en Excel.
    const seguro = (valor) => /^[\s]*[=+@-]/.test(String(valor || '')) ? "'" + valor : valor;
    const filas = lotesVisibles().map((lote) => [
      lote.id, seguro(lote.ingrediente), seguro(lote.marca), seguro(lote.lote),
      seguro(lote.presentacion), lote.pesoCompra, seguro(lote.unidad), lote.costoCompra,
      valorUnitario(lote), lote.existencia, valorRestante(lote), lote.vencimiento, ROTULO_ESTADO[estadoVencimiento(lote)],
      factorGramos(lote.unidad, lote.equivalencias) ?? '',
      factorGramos(lote.unidad, lote.equivalencias) === null ? '' : lote.existencia * factorGramos(lote.unidad, lote.equivalencias),
    ]);
    descargarCSV(nombreConFecha('zahavi-inventario'), aCSV(filas, [
      'ID', 'Ingrediente', 'Marca', 'Lote', 'Presentación', 'Compra', 'Unidad', 'Costo compra',
      'Costo unitario', 'Existencia', 'Valor restante', 'Vencimiento', 'Estado',
      'Gramos por unidad de compra', 'Existencia en gramos',
    ]));
    announce(`${filas.length} lotes exportados.`);
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
      el('h3', { text: 'Registra tu primera compra' }),
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
          click: async (evento) => {
            evento.currentTarget.disabled = true;
            const r = await options.onSembrarDemo();
            if (!r.ok) { avisoOperacion.textContent = r.message; dibujar(); }
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
    const factor = factorGramos(lote.unidad, lote.equivalencias);

    return el('div', { class: 'almacen__fila', dataset: { estado } }, [
      el('div', { class: 'almacen__ing' }, [
        el('span', { class: 'almacen__nombre', text: lote.ingrediente }),
        el('span', {
          class: 'almacen__marca',
          // La marca y el codigo de lote van juntos y en pequeño: son lo que
          // permite identificar el saco fisico en la estanteria.
          text: [lote.marca, lote.lote ? 'lote ' + lote.lote : ''].filter(Boolean).join(' · ') || lote.id,
        }),
        esLoteDemo(lote) ? el('details', {}, [
          el('summary', { text: 'Referencia y pesos DEMO' }),
          el('p', { text: `${lote.demo.tipo} · ${pesos(lote.demo.precio)} por ${formatQty(lote.demo.cantidad)} ${lote.demo.unidad}. ${lote.demo.nota}` }),
          el('p', { text: lote.demo.notaPesos }),
          lote.demo.fuente && /^https:\/\//.test(lote.demo.fuente) ? el('a', { text: 'Consultar referencia de precio', attrs: { href: lote.demo.fuente, target: '_blank', rel: 'noopener noreferrer' } }) : null,
        ]) : null,
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
        el('small', { text: factor === null ? 'Falta equivalencia en gramos'
          : `1 ${lote.unidad} = ${formatQty(factor)} g · $${((unitario || 0) / factor).toLocaleString('es-CO', { maximumFractionDigits: 6 })}/g` }),
      ]),
      el('span', { class: 'almacen__num almacen__stock' }, [
        rotulo('existencia'),
        el('span', { text: `${formatQty(lote.existencia)} ${lote.unidad}` }),
        factor === null ? null : el('small', { text: `${formatQty(lote.existencia * factor)} g disponibles` }),
        el('progress', { class: 'stock-meter', value: Number(lote.existencia) || 0, max: Number(lote.pesoCompra) || 1,
          attrs: { 'aria-label': 'Existencia restante respecto a la compra' } }),
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
          attrs: { 'aria-label': `Eliminar el lote ${lote.id} de ${lote.ingrediente}` },
          on: { click: () => pedirBaja(lote) },
        }, [icon(ICON_ELIMINAR, { class: 'icon--control' })]),
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
    cerrarFormulario();
    const motivoBaja = el('input', { type: 'text', class: 'field', placeholder: 'Merma, devolución, corrección…', attrs: { 'aria-label': 'Motivo de la baja' } });
    const aviso = el('div', { class: 'almacen__confirmar' }, [
      el('span', { text: `¿Eliminar el lote ${lote.id} de ${lote.ingrediente}?` }),
      motivoBaja,
      el('button', {
        type: 'button',
        class: 'btn btn--destructive',
        text: 'Eliminar',
        on: {
          click: async (evento) => {
            const boton = evento.currentTarget;
            boton.disabled = true;
            const r = await options.onEliminar(lote.id, { antes: lote, responsable: responsable.value, motivo: motivoBaja.value });
            boton.disabled = false;
            if (!r.ok) avisoOperacion.textContent = r.message;
            if (r && r.ok) {
              cerrarFormulario();
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
            cerrarFormulario();
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
    editando.equivalencias = { ...editando.equivalencias };
    if (!lote) editando.fechaCompra = hoyLocal();
    const motivoCambio = el('input', { type: 'text', class: 'field', attrs: { 'aria-label': 'Motivo del movimiento' }, placeholder: lote ? 'Explica la corrección' : 'Recepción de compra' });

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
    const campoPresentacion = texto('alm-pres', 'presentacion', { mayusculas: true });
    const campoUnidad = texto('alm-und', 'unidad', { mayusculas: true });

    const cajaIngrediente = el('div', { class: 'combo' }, [campoIngrediente]);
    const cajaPresentacion = el('div', { class: 'combo' }, [campoPresentacion]);
    const cajaUnidad = el('div', { class: 'combo' }, [campoUnidad]);

    /*
     * EL INGREDIENTE SE ELIGE DEL RECETARIO, NO SE TECLEA A CIEGAS.
     *
     * Es lo que hace que el cruce con el plan del dia funcione. El almacen y las
     * recetas se casan por NOMBRE del ingrediente, asi que escribir
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
          // La unidad de compra puede diferir de la receta; solo se sugiere.
          if (opcion.unidad && campoUnidad.value.trim() === '') {
            campoUnidad.value = String(opcion.unidad).toUpperCase();
            editando.unidad = campoUnidad.value;
          }
          actualizarConversion();
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
        opciones: UNIDADES_COMPRA.map((u) => ({ nombre: u })),
        onElegir: (opcion) => {
          campoUnidad.value = opcion.nombre;
          editando.unidad = opcion.nombre;
          actualizarConversion();
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

    const vistaConversion = el('p', { class: 'historial__nota', attrs: { role: 'status' } });
    function actualizarConversion() {
      const factor = factorGramos(editando.unidad, normalizarEquivalencias(editando.equivalencias));
      const compra = Number(String(editando.pesoCompra).replace(',', '.'));
      const costo = Number(String(editando.costoCompra).replace(',', '.'));
      vistaConversion.textContent = factor === null
        ? 'Completa el peso neto equivalente de la unidad de compra para calcular en gramos.'
        : `1 ${editando.unidad} = ${formatQty(factor)} g.` + (compra > 0 && Number.isFinite(compra * factor)
          ? ` Compra: ${formatQty(compra * factor)} g. Costo: $${(costo / (compra * factor)).toLocaleString('es-CO', { maximumFractionDigits: 6 })} por g.` : '');
    }
    const equivalencias = el('fieldset', { class: 'almacen__equivalencias' }, [
      el('legend', { text: 'Conversión a gramos del ingrediente' }),
      el('p', { text: 'Registra el peso neto aprovechable. Completa las medidas que uses en compras o recetas. Los gramos y kilogramos se convierten automáticamente; un litro contiene 1.000 ml.' }),
      el('div', { class: 'almacen__campos' }, [
        ['ML', 'Gramos de 1 ml (densidad)'], ['UND', 'Gramos de 1 unidad'],
        ['TANDA', 'Gramos de 1 tanda'], ['CM', 'Gramos de 1 cm'],
      ].map(([u, etiqueta]) => campo(`alm-gramos-${u}`, etiqueta, el('input', {
        id: `alm-gramos-${u}`, type: 'text', inputMode: 'decimal', class: 'field field--num',
        value: String(editando.equivalencias[u] ?? ''),
        on: { input: (e) => { editando.equivalencias[u] = e.target.value; actualizarConversion(); } },
      })))),
      vistaConversion,
    ]);

    const form = el('form', { class: 'almacen__form' }, [
      el('h3', {
        class: 'section-label',
        text: lote ? `Editar el lote ${lote.id}` : 'Nuevo lote',
      }),
      el('div', { class: 'almacen__campos' }, [
        campo('alm-ing', 'ingrediente', cajaIngrediente),
        campo('alm-marca', 'marca', texto('alm-marca', 'marca')),
        campo('alm-proveedor', 'proveedor', texto('alm-proveedor', 'proveedor')),
        campo('alm-fecha-compra', 'fecha de compra', el('input', { type: 'date', id: 'alm-fecha-compra', class: 'field', value: editando.fechaCompra,
          max: hoyLocal(), on: { input: (e) => { editando.fechaCompra = e.target.value; } } })),
        campo('alm-pres', 'presentación', cajaPresentacion),
        campo('alm-peso', 'cantidad de compra', texto('alm-peso', 'pesoCompra', { numerico: true })),
        campo('alm-und', 'unidad', cajaUnidad),
        campo('alm-costo', 'costo de compra', texto('alm-costo', 'costoCompra', { numerico: true })),
        campo('alm-exist', 'existencia', texto('alm-exist', 'existencia', { numerico: true })),
        campo('alm-lote', 'lote', texto('alm-lote', 'lote')),
        campo('alm-vence', 'vencimiento', campoVence),
      ]),
      equivalencias,
      motivoCambio,
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
    form.addEventListener('input', () => { error.textContent = ''; actualizarConversion(); });
    actualizarConversion();

    form.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const guardar = form.querySelector('button[type="submit"]');
      if (guardar.disabled) return;
      guardar.disabled = true;
      const r = await options.onGuardar({ ...editando }, { antes: lote, responsable: responsable.value, motivo: motivoCambio.value });
      guardar.disabled = false;
      if (!r.ok) {
        // El error se enseña DENTRO del formulario, donde se esta mirando, y se
        // anuncia. Nunca en un `alert()`.
        error.textContent = r.message;
        announce(r.message, 'assertive');
        return;
      }
      avisoOperacion.textContent = r.value.alertas?.length ? 'Cambio detectado: ' + r.value.alertas.join(' ') : 'Movimiento registrado. Puedes consultarlo en el historial del producto.';
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
    meta: 'Controla compras, costos y vencimientos. Inventario guardado en este equipo.',
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
