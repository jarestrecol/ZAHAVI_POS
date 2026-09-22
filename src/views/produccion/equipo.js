/**
 * =============================================================================
 *  EQUIPO: AREA DE CADA PERSONA
 * =============================================================================
 *
 *  Solo administracion. El area decide a quien se le puede asignar cada
 *  receta y se guarda en Supabase (`perfiles.area`, 0011): la base de datos
 *  exige administrador con verificacion en dos pasos, diga lo que diga esta
 *  pantalla.
 */

import { el, clear } from '../../lib/dom.js';
import { announce } from '../../lib/a11y.js';
import { ROLES } from '../../core/sesion.js';
import { AREAS, botonAccion, cabeceraVista, marcarHecho, nombreArea, vacio } from './comun.js';

/**
 * @param {object} o
 * @param {() => Promise<object>} o.cargarPerfiles
 * @param {(id: string, area: string|null) => Promise<object>} o.onCambiarArea
 * @param {() => void} o.onVolver
 */
export function crearEquipo(o) {
  const estado = el('p', { class: 'prod-estado-texto', attrs: { role: 'status' } });
  const contenido = el('div', { class: 'equipo__contenido' });
  const { node: cabecera, titulo } = cabeceraVista({ titulo: 'Equipo de producción', fecha: null,
    detalle: 'Área de cada persona', onVolver: o.onVolver });
  const node = el('section', { class: 'prod-vista equipo' }, [
    cabecera,
    el('p', { class: 'equipo__ayuda', text: 'Cada receta solo se asigna a alguien de su área. Quien no tiene área no aparece para asignar.' }),
    estado,
    contenido,
  ]);

  /** Error de una persona, junto a su control; el anterior se retira. */
  function errorEn(fila, texto) {
    fila.querySelector(':scope > .prod-aviso')?.remove();
    if (texto) fila.appendChild(el('p', { class: 'prod-aviso', text: texto }));
  }

  async function cargar() {
    clear(contenido);
    contenido.setAttribute('aria-busy', 'true');
    contenido.appendChild(vacio({ texto: 'Cargando el equipo…' }));
    const r = await o.cargarPerfiles();
    contenido.removeAttribute('aria-busy');
    clear(contenido);
    if (!r.ok) {
      const motivo = String(r.message || '').replace(/\.+$/, '');
      contenido.appendChild(el('div', { class: 'prod-aviso', attrs: { role: 'alert' } }, [
        el('p', { text: `No se pudo cargar el equipo: ${motivo}.` }),
        // El boton desaparece al recargar: el foco pasa al titulo antes.
        botonAccion('Volver a intentar', () => { titulo.focus(); cargar(); }),
      ]));
      return;
    }
    if (r.value.length <= 1) {
      contenido.appendChild(vacio({ texto: 'Solo se ve tu propio usuario: para ver y cambiar el equipo hace falta entrar como administración con la verificación en dos pasos.' }));
    }
    contenido.appendChild(el('ul', { class: 'equipo__lista' }, r.value.map((p) => {
      const id = `equipo-area-${p.id}`;
      const campo = el('select', { class: 'field', id }, [
        el('option', { value: '', text: 'Sin área' }),
        ...AREAS.map((a) => el('option', { value: a, text: nombreArea(a) })),
      ]);
      campo.value = p.area || '';
      campo.addEventListener('change', async () => {
        const anterior = p.area || '';
        campo.disabled = true;
        campo.setAttribute('aria-busy', 'true');
        const res = await o.onCambiarArea(p.id, campo.value || null);
        campo.disabled = false;
        campo.removeAttribute('aria-busy');
        const texto = res.ok ? `${p.nombre}: ${campo.value ? nombreArea(campo.value) : 'sin área'}.` : res.message;
        if (res.ok) p.area = campo.value || null; else campo.value = anterior;
        // Arriba queda el ultimo mensaje; la respuesta se ve tambien junto a la persona.
        estado.textContent = texto;
        errorEn(fila, res.ok ? '' : `${p.nombre}: ${res.message}`);
        if (res.ok) marcarHecho(fila, '✓ Guardado');
        announce(texto, res.ok ? 'polite' : 'assertive');
        campo.focus();
      });
      const fila = el('li', { class: `equipo__persona${p.activo ? '' : ' equipo__persona--inactiva'}` }, [
        el('div', { class: 'equipo__datos' }, [
          el('strong', { text: p.nombre }),
          el('small', { text: [p.codigo, ROLES[p.rol] || p.rol, p.activo ? '' : 'desactivado'].filter(Boolean).join(' · ') }),
        ]),
        el('label', { for: id, class: 'equipo__campo' }, [el('span', { class: 'sr-only', text: `Área de ${p.nombre}` }), campo]),
      ]);
      return fila;
    })));
  }

  cargar();
  return { node, pintar: () => {}, enfocar: () => titulo.focus() };
}
