import { el } from './dom.js';

/** Exportación completa; los CSV son informes, no sustituyen este respaldo. */
export function descargarRespaldo(datos, nombre) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = el('a', { href: url, download: nombre, hidden: true });
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
