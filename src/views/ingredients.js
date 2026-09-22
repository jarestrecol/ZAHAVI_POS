/**
 * =============================================================================
 *  VALIDADOR DE INGREDIENTES
 * =============================================================================
 *
 *  La lista de todos los ingredientes distintos que se usan en el recetario,
 *  con cuantas recetas los llevan y cuanto se gasta de cada uno.
 *
 *  Responde a preguntas que hasta ahora obligaban a abrir las recetas una por
 *  una:
 *
 *      ¿Cuantos productos distintos manejo de verdad?
 *      ¿Cuales son los que mas peso tienen en la produccion?
 *      ¿En que recetas entra este ingrediente?
 *      ¿Cuales se usan en una sola receta?
 *
 *  Es tambien la antesala del costeo: el total por unidad que se muestra aqui
 *  es justo la cifra que habra que multiplicar por el precio de cada producto.
 *
 *  Solo lee: no cambia ninguna receta ni guarda nada.
 */

import { el, clear } from '../lib/dom.js';
import { titleCase, splitName, formatQty, formatMedida, yieldLabel } from '../lib/format.js';
import { aCSV, descargarCSV, nombreConFecha } from '../lib/csv.js';
import { navigate } from '../core/router.js';
import {
  catalogoIngredientes,
  filtrarIngredientes,
  ordenarPorNombre,
  ordenarPorUso,
  recetasPorUnidad,
  resumenCatalogo,
} from '../core/ingredients.js';
import { crearPantalla } from './pantalla.js';
import { metric } from './navigation.js';
import { medidasDeIngrediente } from '../core/medidas-ingrediente.js';
import { fichaMedidasIngrediente } from './medidas-ingrediente.js';

/**
 * @param {{recipes: Array, onClose: () => void}} options
 * @returns {{node: HTMLElement, close: () => void}}
 */
export function openIngredients(options) {
  const catalogo = catalogoIngredientes(options.recipes);
  const cuenta = resumenCatalogo(catalogo);
  const medidas = new Map(catalogo.map((i) => [i.nombre, medidasDeIngrediente(i.nombre, options.lotes || [])]));
  const tieneStock = (ingrediente) => medidas.get(ingrediente.nombre).disponibles > 0;
  const stockTexto = (ingrediente) => medidas.get(ingrediente.nombre).originales
    .map((m) => `${formatMedida(m.cantidad)} ${m.unidad}`).join(' · ') || 'Sin stock';
  let filtro = 'todos';

  /** Orden vigente: por uso o alfabetico. */
  let orden = 'uso';

  /** Ingrediente cuyas recetas estan desplegadas, o null. */
  let abierto = null;

  const buscador = el('input', {
    type: 'search',
    id: 'ing-buscar',
    class: 'field',
    placeholder: 'Buscar ingrediente…',
    autocomplete: 'off',
    on: { input: () => dibujar() },
  });

  const lista = el('ul', { class: 'ings__lista' });
  const contador = el('p', { class: 'ings__contador', attrs: { role: 'status' } });
  const opcionesFiltro = [
    ['todos', 'Todos', () => true],
    ['stock', 'Con stock', tieneStock],
    ['sin_stock', 'Sin stock', (i) => !tieneStock(i)],
    ['unidades', 'Varias unidades', (i) => i.totales.length > 1],
    ['una_receta', 'Uso puntual', (i) => i.recetas === 1],
  ];
  const botonesFiltro = opcionesFiltro.map(([clave, nombre, acepta]) => el('button', {
    type: 'button', class: 'filter-tabs__button', dataset: { filtro: clave },
    attrs: { 'aria-pressed': String(clave === filtro) },
    on: { click: () => {
      filtro = clave;
      for (const boton of botonesFiltro) boton.setAttribute('aria-pressed', String(boton.dataset.filtro === filtro));
      dibujar();
    } },
  }, [el('span', { text: nombre }), el('span', { class: 'filter-tabs__count', text: String(catalogo.filter(acepta).length) })]));

  const botonUso = el('button', {
    type: 'button',
    class: 'ings__orden-btn',
    text: 'Más usados',
    attrs: { 'aria-pressed': 'true' },
    on: { click: () => cambiarOrden('uso') },
  });

  const botonAZ = el('button', {
    type: 'button',
    class: 'ings__orden-btn',
    text: 'A–Z',
    attrs: { 'aria-pressed': 'false' },
    on: { click: () => cambiarOrden('nombre') },
  });

  function cambiarOrden(nuevo) {
    orden = nuevo;
    botonUso.setAttribute('aria-pressed', String(nuevo === 'uso'));
    botonAZ.setAttribute('aria-pressed', String(nuevo === 'nombre'));
    dibujar();
  }

  /* ---------------------------------------------------------------------
   *  Pintado de la lista
   * ------------------------------------------------------------------ */

  function dibujar() {
    const acepta = opcionesFiltro.find(([clave]) => clave === filtro)[2];
    const filtrados = filtrarIngredientes(catalogo, buscador.value).filter(acepta);
    const ordenados = orden === 'uso' ? ordenarPorUso(filtrados) : ordenarPorNombre(filtrados);

    contador.textContent =
      ordenados.length === catalogo.length
        ? `${catalogo.length} ingredientes distintos`
        : `${ordenados.length} de ${catalogo.length}`;

    clear(lista);

    if (ordenados.length === 0) {
      lista.appendChild(
        el('li', { class: 'ings__vacio', text: 'Ningún ingrediente coincide con la búsqueda.' }),
      );
      return;
    }

    for (const ingrediente of ordenados) lista.appendChild(renderIngrediente(ingrediente));
  }

  /**
   * Una fila del catalogo.
   *
   * @param {object} ingrediente
   * @returns {HTMLElement}
   */
  function renderIngrediente(ingrediente) {
    const estaAbierto = abierto === ingrediente.nombre;
    const variasUnidades = ingrediente.totales.length > 1;
    const resumen = medidas.get(ingrediente.nombre);
    const gramos = resumen.cantidades.find((m) => m.unidad === 'GR');

    return el('li', { class: 'ings__item' + (variasUnidades ? ' ings__item--unidades' : '') }, [
      // Toda la fila es UN SOLO boton con tres columnas por dentro: nombre,
      // total y recetas. Antes el nombre y el recuento iban dentro del boton y
      // los totales en un parrafo aparte, asi que cada bloque se alineaba por
      // su cuenta y la lista se veia torcida al recorrerla en vertical. Con una
      // sola rejilla, las tres columnas quedan a plomo en las 159 filas.
      el(
        'button',
        {
          type: 'button',
          class: 'ings__fila',
          dataset: { nombre: ingrediente.nombre },
          attrs: {
            'aria-expanded': String(estaAbierto),
            // El `aria-label` SUSTITUYE al contenido del boton, asi que tiene
            // que decir las tres columnas. Antes se dejaba fuera el total por
            // unidad, que es justo la cifra que da sentido a esta pantalla y la
            // que sostiene el costeo: quien usa lector de pantalla oia el
            // nombre y el recuento, y la columna del medio no existia.
            'aria-label': `${ingrediente.nombre}, ${totalesTexto(ingrediente)}, en ${ingrediente.recetas} ${
              ingrediente.recetas === 1 ? 'receta' : 'recetas'
            }. Stock disponible: ${stockTexto(ingrediente)}. ${estaAbierto ? 'Ocultar' : 'Ver'} medidas y recetas`,
          },
          on: {
            click: () => {
              abierto = estaAbierto ? null : ingrediente.nombre;
              dibujar();
              enfocarFila(ingrediente.nombre);
            },
          },
        },
        [
          el('span', { class: 'ings__nombre', text: titleCase(ingrediente.nombre) }),

          // Total gastado, con una cifra por unidad. Nunca se suman entre si.
          el(
            'span',
            { class: 'ings__totales' },
            ingrediente.totales.map((t) =>
              el('span', { class: 'ings__total' }, [
                el('span', { class: 'ings__total-num', text: formatQty(t.total) }),
                el('span', { class: 'ings__total-unidad', text: t.unidad.toLowerCase() }),
              ]),
            ),
          ),

          // Cuantas recetas lo llevan: es la medida de su peso real en la
          // produccion, mas util que el numero de lineas.
          el('span', { class: 'ings__recetas' }, [
            el('span', { class: 'ings__recetas-num', text: String(ingrediente.recetas) }),
            el('span', {
              class: 'ings__recetas-label',
              text: ingrediente.recetas === 1 ? 'receta' : 'recetas',
            }),
          ]),
          el('span', { class: 'ings__stock' }, [
            el('span', { text: stockTexto(ingrediente) }),
            el('small', { text: gramos.sinConversion ? 'Gramos: equivalencia pendiente' : `Equivale a ${formatMedida(gramos.cantidad)} g` }),
            el('small', { class: 'status-pill', dataset: { tone: tieneStock(ingrediente) ? 'ok' : 'neutral' }, text: tieneStock(ingrediente) ? 'Con stock' : 'Sin stock' }),
          ]),
        ],
      ),

      // Marca de que este ingrediente se mide de dos formas distintas. Hoy es
      // informacion; para el costeo sera una decision obligatoria, porque no
      // se puede poner un precio sin saber a que unidad corresponde.
      variasUnidades
        ? el('p', {
            class: 'ings__aviso',
            text: `Se mide de ${ingrediente.totales.length} formas distintas. Consulta sus equivalencias; las fórmulas originales se conservan.`,
          })
        : null,

      estaAbierto ? fichaMedidasIngrediente(ingrediente.nombre, options.lotes || [], { resumen, totales: ingrediente.totales }) : null,
      estaAbierto ? renderRecetas(ingrediente) : null,
    ]);
  }

  /**
   * Devuelve el foco a la fila que se acaba de desplegar.
   *
   * Redibujar la lista destruye el boton pulsado. Sin esto el foco cae al
   * principio del documento y quien navega con teclado pierde el sitio entre
   * 159 filas justo despues de abrir una.
   *
   * @param {string} nombre
   */
  function enfocarFila(nombre) {
    for (const boton of lista.querySelectorAll('.ings__fila')) {
      if (boton.dataset.nombre === nombre) {
        boton.focus();
        return;
      }
    }
  }

  /**
   * Las recetas que usan un ingrediente, desplegadas bajo su fila.
   *
   * Cada entrada ocupa una fila de altura fija y una sola linea de texto. Antes
   * eran enlaces de alto libre repartidos en columnas: los nombres largos
   * pasaban a dos lineas, esa fila de la rejilla crecia, y el texto de las
   * entradas cortas quedaba centrado a media altura respecto a sus vecinas. El
   * resultado se leia torcido justo donde hace falta recorrer la lista deprisa.
   *
   * El nombre completo sigue siendo el contenido del boton, asi que el recorte
   * es solo visual: los lectores de pantalla lo anuncian entero.
   */
  function renderRecetas(ingrediente) {
    // Con una sola unidad no hay nada que separar: la lista de siempre.
    if (ingrediente.totales.length <= 1) {
      return listaDeRecetas(ingrediente.enRecetas);
    }

    // CON VARIAS UNIDADES SE AGRUPA, y ese es el objetivo entero de esta
    // pantalla de cara al costeo: el aviso decia que un ingrediente se mide de
    // dos formas, pero no DONDE, asi que la unica manera de encontrar las que se
    // salen era abrir recetas a mano. `recetasPorUnidad` pone la minoritaria
    // arriba, que es casi siempre la que hay que mirar.
    return el(
      'div',
      { class: 'ings__grupos' },
      recetasPorUnidad(ingrediente).map((grupo) =>
        el('div', { class: 'ings__grupo' }, [
          el('p', { class: 'ings__grupo-cab' }, [
            el('span', { class: 'ings__grupo-unidad', text: grupo.unidad }),
            el('span', {
              class: 'ings__grupo-cuenta',
              text: `${grupo.recetas.length} ${grupo.recetas.length === 1 ? 'receta' : 'recetas'}`,
            }),
          ]),
          listaDeRecetas(grupo.recetas),
        ]),
      ),
    );
  }

  /**
   * La lista de recetas propiamente dicha.
   *
   * Cada entrada ocupa una fila de altura fija y una sola linea de texto. Antes
   * eran enlaces de alto libre repartidos en columnas: los nombres largos
   * pasaban a dos lineas, esa fila de la rejilla crecia, y el texto de las
   * entradas cortas quedaba centrado a media altura respecto a sus vecinas.
   *
   * El nombre completo sigue siendo el contenido del boton, asi que el recorte
   * es solo visual: los lectores de pantalla lo anuncian entero.
   *
   * @param {Array<{id: string, nombre: string, categoria: string}>} recetas
   * @returns {HTMLElement}
   */
  function listaDeRecetas(recetas) {
    return el(
      'ul',
      { class: 'ings__recetas-lista' },
      recetas.map((receta) =>
        el('li', { class: 'ings__receta' }, [
          el('button', {
            type: 'button',
            class: 'ings__receta-btn',
            attrs: { 'data-category': receta.categoria },
            on: {
              click: () => {
                /*
                 * Navegar y NADA MAS. Antes habia ademas un `options.onClose()`
                 * detras, y hacia falta mientras el catalogo era una bandera
                 * del estado; ahora es una ruta, asi que salir de ella ya lo
                 * cierra.
                 *
                 * Dejar las dos llamadas no era redundante: era un fallo. La
                 * segunda leia la ruta ANTES de que el navegador procesara el
                 * cambio de la primera, no encontraba receta abierta, y
                 * navegaba al listado pisando el destino. Pulsar una receta
                 * desde el catalogo llevaba al listado en vez de a la ficha.
                 *
                 * `modulo` va escrito aunque `navigate` sepa deducirlo: aqui se
                 * cruza de modulo, y eso se lee mejor dicho que deducido.
                 */
                navigate({ modulo: 'recetario', name: 'detail', id: receta.id });
              },
            },
          }, [
            el('span', { class: 'ings__receta-dot', attrs: { 'aria-hidden': 'true' } }),
            el('span', {
              class: 'ings__receta-nombre',
              text: titleCase(splitName(receta.nombre).base),
            }),
            // El rendimiento distingue las que comparten nombre base. Sin el,
            // un ingrediente que entre en las cuatro Sacher Torte muestra
            // cuatro filas identicas y no hay forma de elegir.
            yieldLabel(receta.nombre)
              ? el('span', { class: 'ings__receta-rinde', text: yieldLabel(receta.nombre) })
              : null,
          ]),
        ]),
      ),
    );
  }

  dibujar();

  /* ---------------------------------------------------------------------
   *  Ventana
   * ------------------------------------------------------------------ */

  const body = el('div', { class: 'ings' }, [
    el('div', { class: 'ings__resumen' }, [
      metric(cuenta.distintos, 'Ingredientes', 'Catálogo consolidado de recetas', 'metric--featured'),
      metric(catalogo.filter(tieneStock).length, 'Con stock', 'Al menos una unidad con existencias'),
      metric(cuenta.conVariasUnidades, 'Varias unidades', 'Equivalencias para el costeo'),
      metric(cuenta.enUnaSolaReceta, 'Uso puntual', 'Presentes en una sola receta'),
    ]),
    el('div', { class: 'section-heading' }, [
      el('div', {}, [el('h2', { text: 'Materias primas' }), el('p', { text: 'Consulta dónde se utiliza cada ingrediente y su disponibilidad en bodega.' })]),
    ]),
    el('div', { class: 'filter-tabs', attrs: { role: 'group', 'aria-label': 'Filtrar ingredientes' } }, botonesFiltro),

    el('div', { class: 'ings__controles' }, [
      el('div', { class: 'ings__buscar' }, [
        el('label', { class: 'sr-only', for: 'ing-buscar', text: 'Buscar ingrediente' }),
        buscador,
      ]),
      el('div', { class: 'ings__orden', attrs: { role: 'group', 'aria-label': 'Ordenar' } }, [
        botonUso,
        botonAZ,
      ]),
    ]),

    contador,

    // Encabezado de columnas: comparte la misma rejilla que las filas, asi que
    // cada rotulo cae justo encima de su columna. Es lo que convierte una lista
    // de 159 lineas en algo que se lee como tabla.
    el('div', { class: 'ings__encabezado', attrs: { 'aria-hidden': 'true' } }, [
      el('span', { text: 'Ingrediente' }),
      el('span', { text: 'Total en fórmulas' }),
      el('span', { text: 'Recetas' }),
      el('span', { text: 'Stock disponible' }),
    ]),

    lista,
  ]);

  return crearPantalla({
    modulo: 'ingredientes',
    subtitulo: 'ingredientes',
    meta: `${cuenta.distintos} ingredientes en ${cuenta.lineas} líneas de receta. Stock por unidad, sin incluir lotes vencidos.`,
    cuerpo: body,
    onMenu: options.onMenu,
    onVolver: options.onVolver,
    onSalir: options.onSalir,
    pie: [
      el('p', {
        class: 'pantalla__nota',
        text: 'Abre un ingrediente para ver cantidades, equivalencias y compras. Las conversiones no modifican el recetario.',
      }),
      el('div', { class: 'pantalla__acciones' }, [
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Exportar a Excel',
          attrs: { title: 'Descarga la lista como archivo CSV, listo para abrir en Excel' },
          on: {
            click: () => {
              descargarCSV(nombreConFecha('zahavi-ingredientes'), catalogoCSV(catalogo));
            },
          },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn--quiet',
          text: 'Imprimir la lista',
          on: { click: () => options.onPrint(ordenarPorNombre(catalogo)) },
        }),
      ]),
    ],
  });
}

/**
 * Los totales de un ingrediente, en texto corrido para leerse en voz alta.
 *
 * Nunca los suma entre si, igual que la pantalla: "4.500 gr, 12 und" son dos
 * cifras distintas de la misma compra.
 *
 * @param {object} ingrediente
 * @returns {string}
 */
function totalesTexto(ingrediente) {
  if (!ingrediente.totales.length) return 'sin cantidad';
  return ingrediente.totales
    .map((t) => `${formatQty(t.total)} ${t.unidad.toLowerCase()}`)
    .join(', ');
}

/** Una cifra del resumen de cabecera. */
/**
 * El catalogo como tabla para Excel.
 *
 * UNA FILA POR INGREDIENTE **Y UNIDAD**, y esa es la decision que hace que esto
 * sirva de algo. El proposito declarado es poner precios, y un precio SOLO puede
 * existir por unidad de medida: no se puede pagar "por azucar", se paga por
 * gramo. Una fila por ingrediente obligaria a meter dos totales en una celda y
 * la columna de precio no tendria a que referirse.
 *
 * De paso hace visible el problema que `CLAUDE.md` seccion 13 declara como
 * bloqueante para el costeo: los 15 ingredientes que se miden de dos o tres
 * formas distintas aparecen aqui en dos o tres filas, imposibles de pasar por
 * alto, con una columna que dice cuantas unidades tiene cada uno.
 *
 * LAS TRES ULTIMAS COLUMNAS VAN VACIAS A PROPOSITO. Esto no es un informe, es
 * una PLANTILLA: se exporta para rellenar el precio, el proveedor y las notas, y
 * con eso alimentar la base de datos externa.
 *
 * LO QUE NO SE EXPORTA, Y NO ES UN OLVIDO
 * ---------------------------------------
 * No van las cantidades por receta. `CLAUDE.md` seccion 8 declara que sacar una
 * copia completa de las formulas no debe poder hacerse desde el mostrador, y esa
 * decision sigue en pie: aqui solo salen NOMBRES y TOTALES AGREGADOS, con los
 * que no se puede reconstruir ninguna formula. Es el catalogo de la compra, no
 * el recetario.
 *
 * @param {Array<object>} catalogo
 * @returns {string}
 */
function catalogoCSV(catalogo) {
  const cabeceras = [
    'Ingrediente',
    'Unidad',
    'Total usado',
    'Lineas de receta',
    'Recetas',
    'Unidades distintas',
    'Precio por unidad',
    'Proveedor',
    'Observaciones',
  ];

  const filas = [];
  for (const ingrediente of ordenarPorNombre(catalogo)) {
    // Un ingrediente sin ninguna cantidad legible tambien sale: hay que poder
    // verlo para corregirlo, y si se cayera de la lista nadie lo encontraria.
    const totales = ingrediente.totales.length
      ? ingrediente.totales
      : [{ unidad: '', total: '' }];

    for (const total of totales) {
      filas.push([
        ingrediente.nombre,
        total.unidad,
        // Coma decimal: es la que Excel en espanol espera. Con punto, la celda
        // entra como texto y no se puede multiplicar por el precio.
        typeof total.total === 'number' ? String(total.total).replace('.', ',') : '',
        ingrediente.lineas,
        ingrediente.recetas,
        ingrediente.totales.length,
        '',
        '',
        '',
      ]);
    }
  }

  return aCSV(filas, cabeceras);
}
