/**
 * =============================================================================
 *  METAS DEL RESUMEN
 * =============================================================================
 *
 *  Las cifras contra las que el panel pinta sus semáforos: presupuesto del mes,
 *  cumplimiento del plan, rendimiento, rechazo, cobertura de bodega, aviso de
 *  vencimiento y alza de precio. Las fija gerencia o administración; el jefe
 *  de obrador las ve en solo lectura, con el motivo, para saber contra qué se
 *  le mide.
 *
 *  Es un panel dentro de la página y no una ventana: se consulta con el resumen
 *  delante («¿por qué está en rojo el rechazo?») y una ventana lo taparía.
 *
 *  LO ESCRITO NO SE PIERDE. Cada tecla se guarda en el borrador de la vista
 *  (`onCambio`); si la pantalla se repinta por otra causa, los campos vuelven
 *  con lo que se había escrito. El borrador vive en memoria, nunca en el
 *  almacenamiento: solo «Guardar» escribe, y lo valida el caso de uso.
 */

import { el } from '../../lib/dom.js';
import { formatear } from '../graficas/comun.js';

const CIFRA = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, useGrouping: false });
const PESOS = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const CUANDO = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });

/** Cómo se escribe una meta en su campo: «2.500.000», «12,5». */
function valorDeCampo(definicion, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (!Number.isFinite(valor)) return String(valor);
  return definicion.formato === 'pesos' ? PESOS.format(valor) : CIFRA.format(valor);
}

const UNIDAD = Object.freeze({ porcentaje: '%', dias: 'días' });

/** Qué campo nombra un mensaje de error de `validarMetas` («Rechazo máximo: …»). */
export function campoDelError(definicion, mensaje) {
  const texto = String(mensaje || '');
  return definicion.find((d) => texto.startsWith(`${d.nombre}:`))?.clave || null;
}

function lineaDeCambio(estado) {
  if (!estado.actualizado) return 'Aún no se han cambiado: se usan los valores de partida.';
  const cuando = CUANDO.format(new Date(estado.actualizado));
  return estado.autor?.nombre ? `Cambiadas el ${cuando} por ${estado.autor.nombre}.` : `Cambiadas el ${cuando}.`;
}

/**
 * @param {Object} opciones
 * @param {Object} opciones.estado lo que devuelve `estadoMetas()`
 * @param {Object<string,string>|null} opciones.borrador lo escrito y no guardado
 * @param {{clave: string|null, mensaje: string}|null} opciones.error último rechazo al guardar
 * @param {(clave: string, valor: string) => void} opciones.onCambio
 * @param {(entrada: Object<string,string>) => void} opciones.onGuardar
 * @param {() => void} opciones.onCancelar
 * @returns {HTMLElement}
 */
export function renderMetas({ estado, borrador, error, onCambio, onGuardar, onCancelar }) {
  const definicion = estado?.definicion || [];
  const metas = estado?.metas || {};
  const cabecera = el('div', { class: 'resumen-metas__cabecera' }, [
    el('h2', { id: 'resumen-metas-titulo', class: 'resumen__titulo-seccion', text: 'Metas' }),
    el('p', { class: 'resumen-metas__cambio', text: lineaDeCambio(estado || {}) }),
  ]);

  if (!estado?.puedeEditar) {
    return el('section', { class: 'resumen__seccion resumen-metas', id: 'resumen-metas', attrs: { 'aria-labelledby': 'resumen-metas-titulo' } }, [
      cabecera,
      el('p', { class: 'resumen-metas__solo-lectura', text: 'Las metas las fija gerencia o administración. Aquí ves las vigentes, que son contra las que el panel marca Bien, Atención o Fuera de meta.' }),
      el('dl', { class: 'resumen-metas__lista' }, definicion.map((d) => el('div', { class: 'resumen-metas__fila' }, [
        el('dt', { text: d.nombre }),
        el('dd', { class: 'resumen-metas__valor', text: metas[d.clave] === null || metas[d.clave] === undefined ? 'Sin meta' : formatear(metas[d.clave], d.formato) }),
        el('dd', { class: 'resumen-metas__ayuda', text: d.ayuda }),
      ]))),
      el('div', { class: 'resumen-metas__botones' }, [
        el('button', { type: 'button', class: 'btn btn--quiet', dataset: { foco: 'metas-cerrar' }, text: 'Cerrar', on: { click: onCancelar } }),
      ]),
    ]);
  }

  const errorGeneral = error && !error.clave ? error.mensaje : null;
  const campos = definicion.map((d) => {
    const id = `resumen-meta-${d.clave}`;
    const valor = borrador && Object.hasOwn(borrador, d.clave) ? borrador[d.clave] : valorDeCampo(d, metas[d.clave]);
    const suyo = error && error.clave === d.clave ? error.mensaje : null;
    const describe = [`${id}-ayuda`, suyo ? `${id}-error` : null].filter(Boolean).join(' ');
    return el('div', { class: 'resumen-meta', dataset: { invalida: suyo ? 'true' : null } }, [
      el('label', { class: 'resumen-meta__nombre', for: id, text: d.nombre }),
      el('p', { class: 'resumen-meta__ayuda', id: `${id}-ayuda`, text: d.ayuda }),
      el('div', { class: 'resumen-meta__entrada' }, [
        d.formato === 'pesos' ? el('span', { class: 'resumen-meta__unidad', attrs: { 'aria-hidden': 'true' }, text: '$' }) : null,
        el('input', {
          class: 'resumen-meta__campo', id, name: d.clave, type: 'text', value: valor,
          autocomplete: 'off',
          attrs: {
            inputmode: 'decimal', 'aria-describedby': describe,
            'aria-invalid': suyo ? 'true' : null,
            placeholder: d.base === null ? 'Sin presupuesto' : null,
          },
          on: { input: (evento) => onCambio(d.clave, evento.target.value) },
        }),
        UNIDAD[d.formato] ? el('span', { class: 'resumen-meta__unidad', attrs: { 'aria-hidden': 'true' }, text: UNIDAD[d.formato] }) : null,
      ]),
      suyo ? el('p', { class: 'resumen-meta__error', id: `${id}-error`, text: suyo }) : null,
    ]);
  });

  const formulario = el('form', {
    class: 'resumen-metas__formulario', noValidate: true,
    on: {
      submit: (evento) => {
        evento.preventDefault();
        const entrada = {};
        for (const d of definicion) entrada[d.clave] = formulario.elements[d.clave]?.value ?? '';
        onGuardar(entrada);
      },
      keydown: (evento) => {
        if (evento.key === 'Escape') { evento.preventDefault(); onCancelar(); }
      },
    },
  }, [
    el('div', { class: 'resumen-metas__campos' }, campos),
    errorGeneral ? el('p', { class: 'resumen-meta__error', attrs: { role: 'alert' }, text: errorGeneral }) : null,
    el('div', { class: 'resumen-metas__botones' }, [
      el('button', { type: 'submit', class: 'btn btn--primary', dataset: { foco: 'metas-guardar' }, text: 'Guardar metas' }),
      el('button', { type: 'button', class: 'btn btn--quiet', dataset: { foco: 'metas-cancelar' }, text: 'Cancelar', on: { click: onCancelar } }),
    ]),
  ]);

  return el('section', { class: 'resumen__seccion resumen-metas', id: 'resumen-metas', attrs: { 'aria-labelledby': 'resumen-metas-titulo' } }, [
    cabecera, formulario,
  ]);
}
