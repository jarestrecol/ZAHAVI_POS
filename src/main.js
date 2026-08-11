/**
 * Arranque y orquestacion.
 *
 * Une el enrutador, el estado y las vistas. Es el unico archivo que decide que
 * se pinta; las vistas solo saben construir su propio trozo de DOM.
 */

import { el, clear } from './lib/dom.js';
import { announce, setInert } from './lib/a11y.js';
import * as repo from './core/repository.js';
import { getState, setState, subscribe, notify, clearNotice } from './core/store.js';
import { getRoute, navigate, onRouteChange, startRouter, ALL_CATEGORIES } from './core/router.js';
import { ensurePassword, isSignedIn, isUsingDefaultPassword } from './core/auth.js';
import { emptyRecipe } from './core/schema.js';
import { getEditKey, setEditKey } from './core/remote.js';
import { renderLogin } from './views/login.js';
import { renderHeader, renderBadges, SEARCH_ID } from './views/header.js';
import { renderSidebar } from './views/sidebar.js';
import { renderDetail, renderPlaceholder } from './views/detail.js';
import { openEditor } from './views/editor.js';
import { openSettings } from './views/settings.js';
import { openConfirmDelete } from './views/confirm.js';
import { openProduction } from './views/production.js';
import { renderRecipeSheet, renderIndexSheet } from './views/print.js';

const app = document.getElementById('app');
const printRoot = document.getElementById('print-root');

/** Dialogo abierto en este momento, si lo hay. */
let openDialog = null;

/** Identidad del dialogo abierto, para no reconstruirlo en cada render. */
let openDialogKey = null;

/** Indica si sigue vigente la contrasena de fabrica, para mostrar la pista. */
let usingDefaultPassword = false;

boot();

async function boot() {
  await ensurePassword();
  usingDefaultPassword = await isUsingDefaultPassword();
  setState({ authed: isSignedIn(), online: navigator.onLine !== false });

  const loaded = await repo.hydrate();
  setState({ ready: true, recipes: loaded.recipes, ingredientes: loaded.ingredientes });
  if (loaded.warning) notify(loaded.warning, 'info');

  subscribe(render);
  onRouteChange(render);
  startRouter();
  render();

  window.addEventListener('online', () => setState({ online: true }));
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('keydown', handleShortcuts);
  registerServiceWorker();
}

/**
 * Registra el service worker para que el recetario abra al instante y siga
 * funcionando sin señal. Se hace despues del primer render.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* sin trabajo sin conexion; la aplicacion funciona igual con red */
  });
}

/**
 * Atajos de teclado. Pocos y para lo que de verdad se repite: buscar, moverse
 * por la lista y abrir la receta en la que se esta.
 *
 * @param {KeyboardEvent} event
 */
function handleShortcuts(event) {
  const state = getState();
  if (!state.ready || !state.authed) return;
  if (openDialog || state.production) return;

  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

  if (event.key === '/' && !typing) {
    event.preventDefault();
    const field = document.getElementById(SEARCH_ID);
    if (field) field.focus();
    return;
  }

  if (event.key === 'Escape' && typing && target.id === SEARCH_ID) {
    target.blur();
    navigate({ name: 'index', id: null, query: '' }, { replace: true });
    return;
  }

  if (typing) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }

  const route = getRoute();
  if ((event.key === 'e' || event.key === 'E') && route.name === 'detail') {
    event.preventDefault();
    navigate({ name: 'edit', id: route.id });
  }
}

/**
 * Mueve la seleccion por la lista sin usar el raton.
 *
 * @param {number} delta
 */
function moveSelection(delta) {
  const links = Array.from(document.querySelectorAll('.recipe-link'));
  if (links.length === 0) return;
  const activeIndex = links.findIndex((link) => link.classList.contains('is-active'));
  const nextIndex = Math.min(links.length - 1, Math.max(0, activeIndex + delta));
  const next = links[activeIndex === -1 ? 0 : nextIndex];
  if (!next) return;
  next.click();
  next.scrollIntoView({ block: 'nearest' });
}

function render() {
  const state = getState();
  const route = getRoute();

  clear(app);

  if (!state.ready) {
    app.appendChild(renderSkeleton());
    return;
  }

  if (!state.authed) {
    renderDialogs(null);
    app.appendChild(renderLogin({ showDefaultHint: usingDefaultPassword }));
    clear(printRoot);
    return;
  }

  const recipe = route.name === 'detail' ? repo.findById(route.id) : null;
  const canEdit = true;

  app.dataset.view = recipe ? 'detail' : 'index';

  for (const badge of renderBadges({
    changes: repo.localChanges(),
    online: state.online,
    onOpenSettings: () => setState({ settingsOpen: true }),
  })) {
    app.appendChild(badge);
  }

  const shell = el('div', { class: 'app' }, [
    renderHeader({
      query: route.query,
      canEdit,
      onNewRecipe: () => navigate({ name: 'new', id: null }),
      onSettings: () => setState({ settingsOpen: true }),
    }),
    el('div', { class: 'workspace' }, [
      renderSidebar({
        recipes: state.recipes,
        query: route.query,
        category: route.category,
        selectedId: recipe ? recipe.id : null,
      }),
      el('div', { class: 'panel' }, [
        recipe
          ? renderDetail({ recipe, canEdit })
          : renderPlaceholder({
              count: state.recipes.length,
              withMethod: state.recipes.filter((r) => (r.metodo || '').trim()).length,
              categories: new Set(state.recipes.map((r) => r.categoria).filter(Boolean)).size,
              ingredients: state.ingredientes.length,
            }),
      ]),
    ]),
  ]);

  app.appendChild(shell);
  if (state.notice) app.appendChild(renderNotice(state));

  renderDialogs(shell);
  renderPrint(state, route, recipe);
}

/** Esqueleto de carga: comunica la estructura en lugar de una frase suelta. */
function renderSkeleton() {
  const lines = [];
  for (let i = 0; i < 9; i += 1) lines.push(el('div', { class: 'booting__line' }));

  return el('div', { class: 'booting', attrs: { 'aria-busy': 'true', 'aria-label': 'Cargando recetario' } }, [
    el('div', { class: 'booting__bar' }),
    el('div', { class: 'booting__body' }, [
      el('div', { class: 'booting__side' }, lines),
      el('div', { class: 'booting__main' }, [
        el('div', { class: 'booting__line', style: { width: '45%', height: '2rem' } }),
        el('div', { class: 'booting__line' }),
        el('div', { class: 'booting__line' }),
      ]),
    ]),
  ]);
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
 * Monta como maximo un dialogo. Si el que toca mostrar es el mismo que ya esta
 * abierto se deja tal cual: reconstruirlo destruiria el borrador a medio escribir.
 */
function renderDialogs(shell) {
  const state = getState();
  const route = getRoute();
  const key = dialogKey(state, route);

  if (key !== null && key === openDialogKey) {
    setInert(shell, true);
    return;
  }

  if (openDialog) {
    openDialog.close();
    openDialog = null;
    openDialogKey = null;
  }

  if (state.production) {
    const recipe = repo.findById(state.production);
    if (recipe) {
      openDialog = openProduction({ recipe, onClose: () => setState({ production: null }) });
    } else {
      setState({ production: null });
    }
  } else if (state.confirmDelete) {
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
          notify('Receta eliminada.', 'success');
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
      withMethod: state.recipes.filter((r) => (r.metodo || '').trim()).length,
      revision: repo.publishedRevision(),
      changes: repo.localChanges(),
      getPublishableFile: repo.toPublishableFile,
      canPublish: repo.canPublishToAll(),
      editKey: getEditKey(),
      onPublish: async (password) => {
        const result = await repo.publishToAll({ password, author: 'recetario' });
        if (result.ok) {
          setEditKey(password);
          setState({ recipes: repo.findAll() });
          notify(`Publicado para todas las sedes: ${result.value.count} recetas.`, 'success');
          announce('Recetario publicado.');
        }
        return result;
      },
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
        ingredientes: getState().ingredientes,
        onCancel: () => navigate(isNew ? { name: 'index', id: null } : { name: 'detail', id: route.id }),
        onSave: (recipe) => {
          const result = repo.save(recipe);
          if (!result.ok) {
            notify(result.message, 'error');
            return;
          }
          setState({ recipes: repo.findAll() });
          notify('Receta guardada en este equipo.', 'success');
          announce('Receta guardada.');
          navigate({ name: 'detail', id: recipe.id });
        },
      });
    }
  }

  openDialogKey = openDialog ? key : null;
  setInert(shell, Boolean(openDialog));
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
  if (state.production) return 'prod:' + state.production;
  if (state.confirmDelete) return 'delete:' + state.confirmDelete;
  if (state.settingsOpen) return 'settings';
  if (route.name === 'new') return 'new';
  if (route.name === 'edit') return 'edit:' + route.id;
  return null;
}

function renderPrint(state, route, recipe) {
  clear(printRoot);
  printRoot.appendChild(
    recipe
      ? renderRecipeSheet(recipe)
      : renderIndexSheet({ recipes: state.recipes, query: route.query, category: route.category }),
  );
}
