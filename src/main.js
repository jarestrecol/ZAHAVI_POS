/**
 * Arranque y orquestacion.
 *
 * Une el enrutador, el estado y las vistas. Es el unico archivo que decide que
 * se pinta; las vistas solo saben construir su propio trozo de DOM.
 */

import { el, clear } from './lib/dom.js';
import { announce, setInert, prefersReducedMotion } from './lib/a11y.js';
import * as repo from './core/repository.js';
import { getState, setState, subscribe, notify, clearNotice } from './core/store.js';
import { getRoute, navigate, onRouteChange, startRouter, ALL_CATEGORIES } from './core/router.js';
import { ensurePassword, isSignedIn, signOut, isUsingDefaultPassword } from './core/auth.js';
import { emptyRecipe } from './core/schema.js';
import { renderLogin } from './views/login.js';
import { renderHeader, renderPendingBadge } from './views/header.js';
import { renderClosedBook, renderBookShell } from './views/book.js';
import { renderIndex } from './views/index-view.js';
import { renderDetail } from './views/detail.js';
import { openEditor } from './views/editor.js';
import { openSettings } from './views/settings.js';
import { openConfirmDelete } from './views/confirm.js';
import { renderRecipeSheet, renderIndexSheet } from './views/print.js';

/** Duracion de la apertura y del cierre del libro, en milisegundos. */
const OPEN_MS = 420;
const SHUT_MS = 620;

/** Duracion del giro de hoja y bloqueo entre giros consecutivos. */
const TURN_MS = 780;

const app = document.getElementById('app');
const printRoot = document.getElementById('print-root');

/** Dialogo abierto en este momento, si lo hay. */
let openDialog = null;

/**
 * Identidad del dialogo abierto, del tipo "edit:R012". Sirve para no
 * reconstruirlo en cada render: si se recreara, el editor perderia lo escrito y
 * el foco cada vez que cambiase cualquier otra cosa del estado.
 * @type {string|null}
 */
let openDialogKey = null;

/** Temporizadores de las animaciones del libro. */
let bookTimer = null;
let turnTimer = null;

/** Indica si sigue vigente la contrasena de fabrica, para mostrar la pista. */
let usingDefaultPassword = false;

boot();

async function boot() {
  await ensurePassword();
  usingDefaultPassword = await isUsingDefaultPassword();
  setState({ authed: isSignedIn() });

  const loaded = await repo.hydrate();
  setState({
    ready: true,
    recipes: loaded.recipes,
    ingredientes: loaded.ingredientes,
  });
  if (loaded.warning) notify(loaded.warning, 'info');

  subscribe(render);
  onRouteChange(handleRouteChange);
  startRouter();
  render();
  registerServiceWorker();
}

/**
 * Registra el service worker para que el recetario abra al instante y siga
 * funcionando sin señal. Se hace despues del primer render: si falla, la
 * aplicacion ya esta en pantalla y no pasa nada.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* sin trabajo sin conexion; la aplicacion funciona igual con red */
  });
}

function handleRouteChange(route, previous) {
  // Cambiar de vista mientras el libro esta cerrado lo abre solo.
  if (getState().authed && getState().book === 'closed' && route.name !== 'index') {
    openBook();
  }
  const direction = turnDirection(route, previous);
  if (direction && !prefersReducedMotion()) {
    startTurn(direction);
  } else {
    render();
  }
}

/**
 * Sentido del giro de hoja: avanzar al abrir una receta o al bajar de categoria,
 * retroceder al volver al indice.
 */
function turnDirection(route, previous) {
  if (!previous) return null;
  if (route.name === previous.name && route.id === previous.id && route.category === previous.category) {
    return null;
  }
  if (route.name === 'detail' && previous.name === 'index') return 'fwd';
  if (route.name === 'index' && previous.name === 'detail') return 'back';
  if (route.category !== previous.category) {
    return route.category === ALL_CATEGORIES ? 'back' : 'fwd';
  }
  return null;
}

function startTurn(direction) {
  clearTimeout(turnTimer);
  setState({ turning: direction });
  turnTimer = setTimeout(() => setState({ turning: null }), TURN_MS);
}

function openBook() {
  if (getState().book !== 'closed') return;
  clearTimeout(bookTimer);
  if (prefersReducedMotion()) {
    setState({ book: 'open' });
    return;
  }
  setState({ book: 'opening' });
  bookTimer = setTimeout(() => setState({ book: 'open' }), OPEN_MS);
}

function closeBook() {
  if (getState().book !== 'open') return;
  clearTimeout(bookTimer);
  if (prefersReducedMotion()) {
    setState({ book: 'closed' });
    return;
  }
  setState({ book: 'shutting' });
  bookTimer = setTimeout(() => setState({ book: 'closed' }), SHUT_MS);
}

function render() {
  const state = getState();
  const route = getRoute();

  clear(app);

  if (!state.ready) {
    app.appendChild(el('p', { class: 'booting', text: 'Cargando recetario…' }));
    return;
  }

  if (!state.authed) {
    renderDialogs(null);
    app.appendChild(renderLogin({ showDefaultHint: usingDefaultPassword }));
    clear(printRoot);
    return;
  }

  const screen = el('div', { class: 'screen' });
  const badge = renderPendingBadge(repo.localChanges(), () => setState({ settingsOpen: true }));
  if (badge) screen.appendChild(badge);

  if (state.book === 'open' || state.book === 'shutting') {
    screen.appendChild(
      renderHeader({
        query: route.query,
        showBack: route.name !== 'index',
        onCloseBook: closeBook,
        onNewRecipe: () => navigate({ name: 'new', id: null }),
        onSettings: () => setState({ settingsOpen: true }),
        onSignOut: () => {
          signOut();
          setState({ authed: false, book: 'closed', settingsOpen: false, draft: null });
          navigate({ name: 'index', id: null, query: '', category: ALL_CATEGORIES }, { replace: true });
        },
      }),
    );
    screen.appendChild(
      renderBookShell({
        content: renderPage(state, route),
        turning: state.turning,
        shutting: state.book === 'shutting',
      }),
    );
  }

  if (state.book !== 'open') {
    screen.appendChild(
      renderClosedBook({
        state: state.book === 'open' ? 'closed' : state.book,
        onOpen: openBook,
      }),
    );
  }

  if (state.notice) screen.appendChild(renderNotice(state));

  app.appendChild(screen);
  renderDialogs(screen);
  renderPrint(state, route);
}

function renderPage(state, route) {
  if (route.name === 'detail') {
    const recipe = repo.findById(route.id);
    if (recipe) return renderDetail({ recipe });
    return el('p', { class: 'page__empty', text: 'Esa receta ya no existe en este dispositivo.' });
  }
  return renderIndex({
    recipes: state.recipes,
    query: route.query,
    category: route.category,
    selectedId: route.name === 'detail' ? route.id : null,
  });
}

function renderNotice(state) {
  return el('div', { class: 'notice notice--' + state.noticeKind, attrs: { role: 'status' } }, [
    el('span', { text: state.notice }),
    el('button', {
      type: 'button',
      class: 'notice__close',
      text: '×',
      attrs: { 'aria-label': 'Cerrar el aviso' },
      on: { click: clearNotice },
    }),
  ]);
}

/**
 * Monta como maximo un dialogo. El fondo queda inerte mientras haya uno abierto.
 * Si el dialogo que toca mostrar es el mismo que ya esta abierto, se deja tal
 * cual: reconstruirlo destruiria el borrador a medio escribir.
 */
function renderDialogs(screen) {
  const state = getState();
  const route = getRoute();
  const key = dialogKey(state, route);

  if (key !== null && key === openDialogKey) {
    setInert(screen, true);
    return;
  }

  if (openDialog) {
    openDialog.close();
    openDialog = null;
    openDialogKey = null;
  }

  if (state.confirmDelete) {
    const recipe = repo.findById(state.confirmDelete);
    if (recipe) {
      openDialog = openConfirmDelete({
        recipe,
        onCancel: () => setState({ confirmDelete: null }),
        onConfirm: () => {
          const result = repo.remove(recipe.id);
          if (!result.ok) {
            notify(result.message, 'error');
            setState({ confirmDelete: null });
            return;
          }
          setState({ recipes: repo.findAll(), confirmDelete: null });
          announce('Receta eliminada.');
          navigate({ name: 'index', id: null });
        },
      });
    } else {
      setState({ confirmDelete: null });
    }
  } else if (state.settingsOpen) {
    openDialog = openSettings({
      recipeCount: state.recipes.length,
      revision: repo.publishedRevision(),
      changes: repo.localChanges(),
      getPublishableFile: repo.toPublishableFile,
      onDiscard: () => {
        const result = repo.discardLocalChanges();
        setState({ recipes: repo.findAll(), ingredientes: repo.allIngredients(), settingsOpen: false });
        notify(`Se descartaron los cambios. Vuelves a la versión publicada (${result.value} recetas).`, 'info');
        announce('Cambios locales descartados.');
        navigate({ name: 'index', id: null, query: '', category: ALL_CATEGORIES });
      },
      onImport: (backup) => {
        const result = repo.replaceAll(backup);
        if (!result.ok) {
          notify(result.message, 'error');
          return;
        }
        setState({ recipes: repo.findAll(), ingredientes: repo.allIngredients(), settingsOpen: false });
        notify(`Se cargaron ${result.value} recetas en este equipo.`, 'success');
        announce(`Se cargaron ${result.value} recetas.`);
        navigate({ name: 'index', id: null, query: '', category: ALL_CATEGORIES });
      },
      onClose: () => {
        setState({ settingsOpen: false });
        // La contrasena pudo cambiar dentro del dialogo: la pista del login
        // solo debe aparecer mientras siga vigente la de fabrica.
        isUsingDefaultPassword().then((isDefault) => {
          usingDefaultPassword = isDefault;
        });
      },
    });
  } else if (route.name === 'new' || route.name === 'edit') {
    const isNew = route.name === 'new';
    const source = isNew ? emptyRecipe(repo.nextId()) : repo.findById(route.id);
    if (!source) {
      navigate({ name: 'index', id: null }, { replace: true });
    } else {
      openDialog = openEditor({
        draft: source,
        isNew,
        ingredientes: state.ingredientes,
        onCancel: () => navigate(isNew ? { name: 'index', id: null } : { name: 'detail', id: route.id }),
        onSave: (recipe) => {
          const result = repo.save(recipe);
          if (!result.ok) {
            notify(result.message, 'error');
            return;
          }
          setState({ recipes: repo.findAll() });
          announce('Receta guardada.');
          navigate({ name: 'detail', id: recipe.id });
        },
      });
    }
  }

  openDialogKey = openDialog ? key : null;
  setInert(screen, Boolean(openDialog));
  if (openDialog) document.body.appendChild(openDialog.node);
}

/**
 * Identifica de forma estable el dialogo que corresponde al estado actual.
 *
 * @param {object} state
 * @param {object} route
 * @returns {string|null} null cuando no debe haber ningun dialogo
 */
function dialogKey(state, route) {
  if (state.confirmDelete) return 'delete:' + state.confirmDelete;
  if (state.settingsOpen) return 'settings';
  if (route.name === 'new') return 'new';
  if (route.name === 'edit') return 'edit:' + route.id;
  return null;
}

function renderPrint(state, route) {
  clear(printRoot);
  const recipe = route.name === 'detail' ? repo.findById(route.id) : null;
  printRoot.appendChild(
    recipe
      ? renderRecipeSheet(recipe)
      : renderIndexSheet({ recipes: state.recipes, query: route.query, category: route.category }),
  );
}
