/**
 * Pantalla de entrada.
 *
 * Cada persona entra con SU codigo de usuario y SU PIN de 6 digitos. Quien los
 * comprueba es Supabase, no esta pantalla: aqui solo se recogen, se revisa que
 * tengan la forma correcta y se enseña el resultado. Ver `core/sesion.js`.
 *
 * LO QUE SOBREVIVE A UN REPINTADO
 * -------------------------------
 * `main.js` reconstruye la pantalla entera con cualquier cambio de estado: un
 * error de ingreso, la red que vuelve, el recetario que termina de cargar. El
 * error viaja por el estado (`params.error`), pero el codigo que la persona ya
 * escribio no: se guarda en este modulo para no obligarla a teclearlo otra vez
 * tras un PIN equivocado. El PIN NUNCA se conserva.
 *
 * EL SEGUNDO PASO
 * ---------------
 * Gerencia y administracion, tras el PIN, ven una segunda tarjeta: la primera
 * vez con el QR para registrar la aplicacion autenticadora del celular, y las
 * siguientes solo con el campo del codigo. Que paso toca lo dice el estado
 * (`params.paso`); el codigo del celular tampoco se conserva entre repintados.
 */

import { el, replaceChildren } from '../lib/dom.js';
import { APP_VERSION, APP_FASE } from '../core/version.js';

/**
 * Lo que la persona ya tecleo, entre repintados. Solo el codigo: el PIN nunca.
 *
 * Que el ingreso este en curso y que campo hay que corregir NO viven aqui sino
 * en el estado (`loginEnCurso`, `loginCampo`): una marca de esta vista llegaba
 * tarde cuando la pantalla se repintaba de forma sincrona, y el formulario
 * nuevo nacia con el boton desactivado para siempre.
 */
const borrador = { codigo: '' };

/**
 * Pantalla de entrada.
 *
 * No escribe estado: avisa por callback y el caso de uso decide.
 *
 * @param {{
 *   error: string,
 *   campo: ''|'codigo'|'pin'|'verificacion',
 *   enCurso: boolean,
 *   online: boolean,
 *   paso: ''|'verificar'|'inscribir',
 *   qr: string,
 *   secreto: string,
 *   onIngresar: (codigo: string, pin: string) => Promise<{ok: boolean, code?: string, message?: string}>,
 *   onVerificar: (codigo: string) => Promise<{ok: boolean, code?: string, message?: string}>,
 *   onCancelarVerificacion: () => void,
 * }} params
 * @returns {HTMLElement}
 */
export function renderLogin(params) {
  const host = el('div', { class: 'login__host' });

  if (params.paso) {
    replaceChildren(host, [renderSegundoPaso(params)]);
    return envoltorio(host);
  }

  const codigo = el('input', {
    type: 'text',
    id: 'login-codigo',
    class: 'field login__codigo',
    value: borrador.codigo,
    autocomplete: 'username',
    attrs: {
      'aria-describedby': 'login-error',
      autocapitalize: 'characters',
      spellcheck: 'false',
      maxlength: '32',
    },
    on: {
      input: () => {
        borrador.codigo = codigo.value;
      },
    },
  });

  const pin = el('input', {
    type: 'password',
    id: 'login-pin',
    class: 'field',
    autocomplete: 'current-password',
    attrs: {
      'aria-describedby': 'login-pin-regla login-error',
      inputmode: 'numeric',
      maxlength: '6',
    },
  });

  // Mostrar el PIN: en una tableta con guantes o harina en los dedos, saber que
  // se tecleo evita gastar intentos del limite de Supabase.
  const mostrar = el('button', {
    type: 'button',
    class: 'btn btn--quiet login__mostrar',
    text: 'Mostrar',
    attrs: { 'aria-pressed': 'false', 'aria-controls': 'login-pin', 'aria-label': 'Mostrar el PIN' },
    on: {
      click: () => {
        const visible = pin.type === 'password';
        pin.type = visible ? 'text' : 'password';
        mostrar.textContent = visible ? 'Ocultar' : 'Mostrar';
        mostrar.setAttribute('aria-pressed', String(visible));
        mostrar.setAttribute('aria-label', visible ? 'Ocultar el PIN' : 'Mostrar el PIN');
        pin.focus();
      },
    },
  });

  const error = el('p', {
    class: 'login__error',
    id: 'login-error',
    attrs: { role: 'alert' },
    text: params.error,
  });

  const entrar = el('button', {
    type: 'submit',
    class: 'btn btn--primary btn--block',
    text: params.enCurso ? 'Entrando…' : 'Entrar',
    attrs: params.enCurso ? { disabled: true, 'aria-busy': 'true' } : {},
  });

  const submit = async (event) => {
    event.preventDefault();
    if (params.enCurso) return;

    borrador.codigo = codigo.value;
    // Este nodo se desactiva en el acto: el repintado con "Entrando…" puede
    // llegar un cuadro despues, y un segundo toque en ese hueco enviaria dos veces.
    entrar.disabled = true;

    const pinEscrito = pin.value;
    pin.value = '';

    const resultado = await params.onIngresar(codigo.value, pinEscrito);

    // El codigo no se deja escrito para quien llegue despues a este equipo: es
    // la mitad de la credencial. Si fallo, el caso de uso ya dejo el motivo y el
    // campo a corregir en el estado, y la pantalla se repinta con ellos.
    if (resultado.ok) borrador.codigo = '';
  };

  const form = el('form', { class: 'login__card', attrs: { novalidate: true }, on: { submit } }, [
    marca(),
    el('h2', { class: 'login__headline', text: 'Bienvenido a tu operación' }),

    // Sin red no se puede entrar, y decirlo ANTES de que alguien teclee su PIN
    // ahorra un intento y un mensaje de error.
    params.online
      ? null
      : el('p', { class: 'login__aviso', attrs: { role: 'status' } }, [
          el('strong', { text: 'Sin conexión.' }),
          ' Para entrar hace falta internet. Si ya habías entrado en este equipo, no hace falta volver a hacerlo.',
        ]),

    el('label', { class: 'label', for: 'login-codigo', text: 'Código de usuario' }),
    codigo,

    el('label', { class: 'label label--spaced', for: 'login-pin', text: 'PIN' }),
    el('div', { class: 'login__pin' }, [pin, mostrar]),
    el('p', { class: 'login__hint', id: 'login-pin-regla', text: 'Seis números.' }),

    error,
    entrar,

    el('p', {
      class: 'login__disclaimer',
      text: 'Tu código y tu PIN son personales: todo lo que registres queda a tu nombre. ¿Olvidaste el PIN? Pídele al administrador que lo restablezca.',
    }),
    pie(),
  ]);

  replaceChildren(host, [form]);

  // Tras un error, al dato que hay que corregir; si no, al primer campo vacio.
  if (params.error && params.campo === 'codigo') enfocar(codigo, host);
  else enfocar(borrador.codigo ? pin : codigo, host);

  return envoltorio(host);
}

/**
 * Lleva el foco a un campo recien montado.
 *
 * El nodo puede no estar todavia en el documento: entonces se espera al
 * siguiente cuadro, y solo se enfoca si nadie de esta pantalla tomo el foco
 * mientras tanto.
 *
 * @param {HTMLElement} campo
 * @param {HTMLElement} host contenedor de la tarjeta
 */
function enfocar(campo, host) {
  if (campo.isConnected) {
    campo.focus();
    return;
  }
  window.requestAnimationFrame(() => {
    if (campo.isConnected && !host.contains(document.activeElement)) campo.focus();
  });
}

/**
 * La tarjeta del segundo paso: registrar el celular o escribir su codigo.
 *
 * @param {Parameters<typeof renderLogin>[0]} params
 * @returns {HTMLElement}
 */
function renderSegundoPaso(params) {
  const inscribir = params.paso === 'inscribir';

  const codigo = el('input', {
    type: 'text',
    id: 'login-verificacion',
    class: 'field login__codigo-verificacion',
    // `one-time-code` deja que el teclado del telefono proponga el codigo si la
    // aplicacion autenticadora esta en el mismo aparato.
    autocomplete: 'one-time-code',
    attrs: {
      'aria-describedby': 'login-verificacion-regla login-error',
      inputmode: 'numeric',
      maxlength: '6',
      spellcheck: 'false',
    },
  });

  const error = el('p', {
    class: 'login__error',
    id: 'login-error',
    attrs: { role: 'alert' },
    text: params.error,
  });

  const verificar = el('button', {
    type: 'submit',
    class: 'btn btn--primary btn--block',
    text: params.enCurso ? 'Verificando…' : 'Verificar',
    attrs: params.enCurso ? { disabled: true, 'aria-busy': 'true' } : {},
  });

  const volver = el('button', {
    type: 'button',
    class: 'btn btn--quiet btn--block login__volver',
    text: 'Volver',
    attrs: params.enCurso ? { disabled: true } : {},
    on: { click: () => params.onCancelarVerificacion() },
  });

  const submit = async (event) => {
    event.preventDefault();
    if (params.enCurso) return;
    // Mismo motivo que en el PIN: el repintado puede llegar un cuadro tarde.
    verificar.disabled = true;
    const escrito = codigo.value;
    codigo.value = '';
    await params.onVerificar(escrito);
  };

  const explicacion = inscribir
    ? [
        el('p', {
          class: 'login__hint',
          text: 'Tu rol protege costos y usuarios, así que entras en dos pasos. Registra tu celular una sola vez:',
        }),
        el('ol', { class: 'login__pasos' }, [
          el('li', {
            text: 'Instala en el celular una aplicación autenticadora: Google Authenticator, Microsoft Authenticator u otra.',
          }),
          el('li', { text: 'Ábrela, elige añadir una cuenta y escanea este código.' }),
          el('li', { text: 'Escribe abajo los 6 números que muestra para Zahavi POS.' }),
        ]),
        imagenQr(params.qr),
        el('details', { class: 'login__manual' }, [
          el('summary', { text: '¿No puedes escanear? Escribe la clave a mano' }),
          el('p', { class: 'login__secreto', text: agrupar(params.secreto) }),
        ]),
      ]
    : [
        el('p', {
          class: 'login__hint',
          text: 'Abre la aplicación autenticadora de tu celular y escribe los 6 números de Zahavi POS.',
        }),
      ];

  const form = el('form', { class: 'login__card', attrs: { novalidate: true }, on: { submit } }, [
    el('h1', { class: 'login__headline', id: 'login-title', text: 'Verificación en dos pasos' }),
    ...explicacion,
    el('label', { class: 'label label--spaced', for: 'login-verificacion', text: 'Código de verificación' }),
    codigo,
    el('p', { class: 'login__hint', id: 'login-verificacion-regla', text: 'Seis números. Cambian cada 30 segundos.' }),
    error,
    verificar,
    volver,
  ]);

  // Al campo del codigo siempre: es lo unico que hay que hacer en esta tarjeta.
  window.requestAnimationFrame(() => {
    if (codigo.isConnected && !form.contains(document.activeElement)) codigo.focus();
  });

  return form;
}

/**
 * El QR que entrega Supabase, como imagen.
 *
 * Llega como texto SVG. Se enseña con `<img>` y una direccion `data:`, nunca
 * insertado en el documento: un SVG dentro de una imagen no ejecuta nada. Si no
 * tiene la forma esperada no se pinta, y queda la clave para escribirla a mano.
 *
 * EL SVG NO EMPIEZA POR `<svg`. Supabase lo genera con una cabecera XML y un
 * comentario delante (`<?xml version="1.0"?>`), asi que se busca donde empieza
 * el dibujo en vez de exigir que sea lo primero. Exigirlo dejaba la pantalla sin
 * codigo QR y solo con la clave escrita: la inscripcion seguia siendo posible,
 * pero tecleando dieciseis caracteres a mano.
 *
 * @param {string} qr
 * @returns {HTMLElement|null}
 */
function imagenQr(qr) {
  const texto = typeof qr === 'string' ? qr.trim() : '';
  let src = '';
  if (texto.startsWith('data:image/svg+xml')) {
    src = texto;
  } else {
    const dibujo = texto.indexOf('<svg');
    if (dibujo !== -1) {
      src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto.slice(dibujo))}`;
    }
  }
  if (!src) return null;

  return el('img', {
    class: 'login__qr',
    src,
    alt: 'Código QR para registrar Zahavi POS en la aplicación autenticadora',
    width: 200,
    height: 200,
  });
}

/**
 * La clave en grupos de cuatro, que es como se copia sin perderse.
 *
 * @param {string} secreto
 * @returns {string}
 */
function agrupar(secreto) {
  return String(secreto || '').replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * La marca, el mensaje de la izquierda y la tarjeta que toque.
 *
 * @param {HTMLElement} host
 * @returns {HTMLElement}
 */
function envoltorio(host) {
  return el('main', { class: 'login', id: 'contenido', attrs: { 'aria-labelledby': 'login-title' } }, [
    el('section', { class: 'login__story', attrs: { 'aria-label': 'Zahavi, gestión de producción' } }, [
      el('div', { class: 'login__story-brand', text: 'ZAHAVI' }),
      el('div', {}, [
        el('h2', {}, ['El detalle hace ', el('em', { text: 'la diferencia.' })]),
        el('p', { text: 'Cada receta, cada ingrediente, cada jornada. Tu operación en un solo lugar, con el cuidado que merece tu oficio.' }),
      ]),
      el('div', { class: 'login__story-footer', text: 'PANADERÍA · REPOSTERÍA · CAFÉ' }),
    ]),
    host,
  ]);
}

function marca() {
  return el('div', { class: 'login__brand' }, [
    el('img', {
      class: 'login__logo',
      src: './assets/logo-zahavi.png',
      alt: 'Zahavi, panadería, repostería y café',
      width: 254,
      height: 78,
    }),
    el('h1', { class: 'login__wordmark sr-only', id: 'login-title', text: 'Zahavi' }),
    // El sistema ya no es «el recetario»: el recetario es uno de sus
    // modulos. El nombre completo aparece aqui y en el menu, y el de cada
    // modulo en la barra de su pantalla (ZAHAVI · almacén).
    el('p', { class: 'login__tagline', text: 'ZAHAVI POS · sistema de producción' }),
  ]);
}

/**
 * Version, en letra pequeña bajo el formulario.
 *
 * Esta en la pantalla de entrada porque es la unica que ve todo el mundo.
 * Cuando una sede dice que algo "no le aparece", lo primero que hay que saber
 * es si las dos estan mirando la misma version.
 */
function pie() {
  return el('p', {
    class: 'login__version',
    text: `${APP_FASE} · v${APP_VERSION}`,
  });
}
