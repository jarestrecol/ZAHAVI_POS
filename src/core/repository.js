/**
 * Repositorio de recetas: unica puerta entre la aplicacion y el recetario.
 *
 * EL RECETARIO VIVE EN LA BASE (Supabase, migracion 0024)
 * -------------------------------------------------------
 * Se lee con `operacion_leer({tipo: 'recetario'})` y se escribe con
 * `operacion_ejecutar` (`guardar_receta`, `activar_receta`). Cada cambio deja
 * una version en el servidor, con quien y por que. Ya no hay «Publicar», ni
 * cambios locales pendientes, ni commits desde el navegador: lo que se guarda
 * lo ven todas las sedes en cuanto el servidor contesta (decision F1-D).
 *
 * SIN CONEXION NO HAY RECETARIO (F4-1)
 * ------------------------------------
 * No se guarda copia en el equipo. Sin sesion o sin red, `hydrate` devuelve un
 * recetario vacio con el motivo redactado, y la pantalla lo dice. Las copias
 * que dejo la version anterior en `localStorage` se borran al cargar: eran la
 * segunda fuente editable que el plan prohibe.
 *
 * QUIEN PUEDE EDITAR lo decide el servidor (jefe de obrador en adelante); la
 * pantalla solo esconde lo que no se puede usar.
 */
import { crearOperacionRemota } from './operacion-remota.js';
import { ok, err } from './storage.js';

/** Claves que usaba el recetario local y la publicacion a GitHub. Se borran. */
const CLAVES_ANTERIORES = Object.freeze([
  'zahavi_recetario_v1',
  'zahavi_recetario_rescate',
  'zahavi_recetario_rescate_crudo',
  'zahavi_edit_key',
  'zahavi_edit_key_desde',
]);

const VACIO = Object.freeze({ recipes: [], ingredientes: [] });

let remoto = crearOperacionRemota({ lectura: 'operacion_leer', comando: 'operacion_ejecutar' });

/** Lo que se muestra: exactamente lo ultimo que devolvio el servidor. */
let current = VACIO;

/**
 * Solicitud cuyo resultado quedo incierto (se cayo la red tras enviarla). Si la
 * misma receta se vuelve a guardar igual, se reenvia con el MISMO id: el
 * servidor devuelve lo que ya hizo en vez de crear la receta dos veces.
 *
 * @type {{clave: string, huella: string, id: string}|null}
 */
let incierta = null;

/** Solo para pruebas: sustituye el transporte. */
export function usarTransporte(transporte) {
  remoto = transporte;
}

/** Borra las copias locales de la version anterior. Nunca falla. */
function olvidarCopiasLocales() {
  try {
    for (const clave of CLAVES_ANTERIORES) globalThis.localStorage?.removeItem(clave);
  } catch {
    // Sin almacenamiento disponible no hay nada que borrar.
  }
}

/**
 * Carga el recetario del servidor.
 *
 * No falla: devuelve siempre un recetario (vacio si no se pudo leer) y, si algo
 * salio mal, el motivo ya redactado en `warning`.
 *
 * @returns {Promise<{recipes: Array, ingredientes: Array, source: 'servidor'|'sin_datos', warning?: string}>}
 */
export async function hydrate() {
  olvidarCopiasLocales();
  const r = await remoto.leer({ tipo: 'recetario' });
  if (!r.ok) {
    current = VACIO;
    return { ...current, source: 'sin_datos', warning: r.message };
  }
  current = { recipes: r.value.recetas || [], ingredientes: r.value.ingredientes || [] };
  return { ...current, source: 'servidor' };
}

/** Al cerrar sesion: nada del recetario queda en memoria. */
export function vaciar() {
  current = VACIO;
  incierta = null;
}

/** @returns {Array} */
export function findAll() {
  return current.recipes;
}

/** Catalogo de ingredientes, para autocompletar en el editor. */
export function allIngredients() {
  return current.ingredientes;
}

/**
 * @param {string} id codigo de la receta, por ejemplo "R057"
 * @returns {object|null}
 */
export function findById(id) {
  return current.recipes.find((recipe) => recipe.id === id) || null;
}

/**
 * Codigo provisional para una receta nueva mientras se edita. El definitivo lo
 * asigna el servidor al guardar.
 */
export function nextId() {
  const numeros = current.recipes
    .map((r) => /^R(\d+)$/.exec(r.id))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const siguiente = (numeros.length ? Math.max(...numeros) : 0) + 1;
  return 'R' + String(siguiente).padStart(3, '0');
}

/** Cantidad tal como la escribio la persona, convertida a numero para la API. */
function cantidad(valor) {
  if (typeof valor === 'number') return valor;
  const n = Number(String(valor ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : valor;
}

/** La receta del editor, en la forma que pide `guardar_receta`. */
function datosDe(recipe, existente, motivo) {
  return {
    ...(existente ? { receta_id: existente.receta_id } : {}),
    nombre: recipe.nombre,
    categoria: recipe.categoria,
    metodo: recipe.metodo || '',
    componentes: (recipe.componentes || []).map((c) => ({
      nombre: c.nombre,
      items: (c.items || []).map((i) => ({ ingrediente: i.ingrediente, cantidad: cantidad(i.cantidad), unidad: i.unidad })),
    })),
    ...(motivo ? { motivo } : {}),
  };
}

/** Pone en memoria la receta que devolvio el servidor, o la quita si se retiro. */
function aplicar(receta) {
  const sinEsta = current.recipes.filter((r) => r.receta_id !== receta.receta_id);
  const recipes = receta.activa === false ? sinEsta : [...sinEsta, receta].sort((a, b) => (a.id < b.id ? -1 : 1));
  const nuevos = (receta.componentes || []).flatMap((c) => c.items || [])
    .filter((i) => !current.ingredientes.some((x) => x.nombre === i.ingrediente))
    .map((i) => ({ id: '', nombre: i.ingrediente, unidad: i.unidad }));
  current = { recipes, ingredientes: nuevos.length ? [...current.ingredientes, ...nuevos] : current.ingredientes };
}

/**
 * Envia una solicitud, reutilizando el id si la anterior igual quedo incierta.
 */
async function enviar(clave, accion, revision, datos) {
  const huella = JSON.stringify({ accion, revision, datos });
  const id = incierta && incierta.clave === clave && incierta.huella === huella ? incierta.id : crypto.randomUUID();
  const r = await remoto.ejecutar({ id, accion, revision, datos });
  if (!r.ok && r.code === 'confirmacion_pendiente') {
    incierta = { clave, huella, id };
    return err('confirmacion_pendiente',
      'No sabemos si el servidor alcanzó a guardar. Vuelve a guardar cuando haya conexión: no se duplicará.');
  }
  if (incierta && incierta.clave === clave) incierta = null;
  return r;
}

/**
 * Guarda una receta nueva o modificada en el servidor.
 *
 * @param {object} recipe receta ya validada por el editor
 * @param {string} [motivo]
 * @returns {Promise<{ok: true, value: object} | {ok: false, code: string, message: string}>}
 */
export async function save(recipe, motivo) {
  const existente = findById(recipe.id);
  const r = await enviar(existente ? existente.receta_id : 'nueva:' + recipe.id, 'guardar_receta',
    existente ? existente.revision : 0, datosDe(recipe, existente, motivo));
  if (!r.ok) return r;
  const guardada = r.value.resultado.receta;
  aplicar(guardada);
  return ok(guardada);
}

/**
 * Retira una receta del recetario. No se borra: los planes y la produccion que
 * la citan la conservan, y el servidor guarda la version.
 *
 * @param {string} id codigo de la receta
 * @param {string} [motivo]
 */
export async function remove(id, motivo = 'Retirada del recetario') {
  const receta = findById(id);
  if (!receta) return err('not_found', 'La receta ya no existe.');
  const r = await enviar(receta.receta_id, 'activar_receta', receta.revision,
    { receta_id: receta.receta_id, activa: false, motivo });
  if (!r.ok) return r;
  aplicar(r.value.resultado.receta);
  return ok(undefined);
}
