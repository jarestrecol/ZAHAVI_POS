/**
 * Construccion de DOM sin innerHTML.
 *
 * Todo el texto que entra aqui termina en textContent o en setAttribute, nunca
 * interpretado como marcado. Es la unica via permitida para crear nodos en esta
 * aplicacion: los nombres de receta, ingredientes y el metodo de preparacion son
 * texto libre escrito por el usuario y no deben poder inyectar HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Atributos que se escriben con setAttribute en lugar de asignarse como propiedad. */
const ATTRIBUTE_ONLY = new Set(['role', 'for', 'list', 'form', 'colspan', 'rowspan']);

/**
 * Crea un elemento HTML.
 *
 * @param {string} tag
 * @param {Object} [props] class, text, attrs, dataset, on, style y propiedades sueltas
 * @param {Array<Node|string|null|undefined|false>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendAll(node, children);
  return node;
}

/**
 * Crea un elemento SVG. Los atributos siempre van por setAttribute.
 *
 * @param {string} tag
 * @param {Object<string, string|number>} [attrs]
 * @param {Array<Node>} [children]
 * @returns {SVGElement}
 */
export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  appendAll(node, children);
  return node;
}

/**
 * Crea un nodo de texto plano. Atajo explicito para dejar claro en el codigo
 * que el contenido es texto y no marcado.
 *
 * @param {string} value
 * @returns {Text}
 */
export function text(value) {
  return document.createTextNode(value == null ? '' : String(value));
}

/**
 * Vacia un nodo. Mas rapido y mas seguro que asignar innerHTML = ''.
 *
 * @param {Node} node
 * @returns {Node} el mismo nodo, para encadenar
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Reemplaza todo el contenido de un nodo.
 *
 * @param {Node} node
 * @param {Array<Node|string|null|undefined|false>} children
 * @returns {Node}
 */
export function replaceChildren(node, children) {
  clear(node);
  appendAll(node, children);
  return node;
}

function applyProps(node, props) {
  // Las vistas pasan null cuando el elemento no lleva propiedades. El valor por
  // defecto del parametro solo cubre undefined, asi que se normaliza aqui.
  if (props === null || props === undefined) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = value;
      continue;
    }
    if (key === 'text') {
      node.textContent = String(value);
      continue;
    }
    if (key === 'style') {
      applyStyle(node, value);
      continue;
    }
    if (key === 'attrs') {
      for (const [name, attrValue] of Object.entries(value)) {
        if (attrValue === null || attrValue === undefined || attrValue === false) continue;
        node.setAttribute(name, attrValue === true ? '' : String(attrValue));
      }
      continue;
    }
    if (key === 'dataset') {
      for (const [name, dataValue] of Object.entries(value)) {
        if (dataValue === null || dataValue === undefined) continue;
        node.dataset[name] = String(dataValue);
      }
      continue;
    }
    if (key === 'on') {
      for (const [type, handler] of Object.entries(value)) {
        if (typeof handler === 'function') node.addEventListener(type, handler);
      }
      continue;
    }
    if (ATTRIBUTE_ONLY.has(key)) {
      node.setAttribute(key, String(value));
      continue;
    }
    if (key in node) {
      node[key] = value;
      continue;
    }
    node.setAttribute(key, String(value));
  }
}

function applyStyle(node, style) {
  if (typeof style === 'string') {
    node.style.cssText = style;
    return;
  }
  for (const [prop, value] of Object.entries(style)) {
    if (value === null || value === undefined) continue;
    if (prop.startsWith('--')) node.style.setProperty(prop, String(value));
    else node.style[prop] = value;
  }
}

function appendAll(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false || child === true) continue;
    parent.appendChild(child instanceof Node ? child : text(child));
  }
}
