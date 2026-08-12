/**
 * Tema claro u oscuro, elegido a mano.
 *
 * Sin ninguna eleccion, el tema sigue la preferencia del sistema operativo
 * (`prefers-color-scheme`, resuelta en tokens.css). Este modulo guarda una
 * eleccion explicita en este dispositivo, que gana siempre sobre esa
 * preferencia: ver el selector `:root[data-theme]` en tokens.css.
 *
 * El primer pintado tambien tiene que llevar el tema correcto, antes de que
 * este modulo llegue a ejecutarse: por eso `theme-init.js`, en la raiz del
 * sitio, repite esta misma lectura de `localStorage` en un script sin
 * modulos que se ejecuta antes que el CSS. Si cambia la clave de
 * almacenamiento aqui, hay que cambiarla alli tambien.
 */

const STORAGE_KEY = 'zahavi.tema';

/**
 * Lee la eleccion guardada en este dispositivo.
 *
 * @returns {'light'|'dark'|null} null cuando no hay eleccion y se sigue el sistema
 */
export function getTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    // Almacenamiento no disponible (privacidad estricta, disco lleno...): se
    // sigue la preferencia del sistema sin guardar nada.
    return null;
  }
}

/**
 * Tema que se ve ahora mismo, haya o no una eleccion guardada.
 *
 * @returns {'light'|'dark'}
 */
export function effectiveTheme() {
  return getTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
}

/**
 * Fija una eleccion explicita, o la borra para volver a seguir el sistema.
 *
 * @param {'light'|'dark'|null} value
 */
export function setTheme(value) {
  if (value === 'light' || value === 'dark') {
    document.documentElement.dataset.theme = value;
  } else {
    delete document.documentElement.dataset.theme;
  }

  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* el tema sigue funcionando para esta visita, solo no se recuerda */
  }
}

/** Pasa de claro a oscuro o de oscuro a claro, partiendo de lo que se ve ahora. */
export function toggleTheme() {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

function systemPrefersDark() {
  return Boolean(window.matchMedia) && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
