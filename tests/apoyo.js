/**
 * Piezas comunes de las pruebas de navegador.
 *
 * Ninguna prueba crea, edita ni borra recetas reales: todas leen. Las que
 * necesitan escribir lo hacen sobre recetas con el prefijo `QA-TEST-`, que es
 * la misma regla que sigue la verificacion manual.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** El recetario publicado, para armar con el las cifras que las pruebas esperan. */
const PUBLICADO = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/recipes.json', import.meta.url)), 'utf8'),
);

/**
 * Cuantas recetas hay publicadas ahora mismo.
 *
 * SE CUENTA DEL ARCHIVO, NO SE ESCRIBE. Estaba a mano como 121 en cinco
 * pruebas, y la panaderia publico la receta 122 desde el obrador: las cinco se
 * pusieron rojas de golpe sin que nada estuviera roto. Lo que estas pruebas
 * comprueban no es cuantas recetas hay -eso lo decide la panaderia, no el
 * codigo- sino que el listado las muestre TODAS.
 */
export const TOTAL_RECETAS = PUBLICADO.recipes.length;

/**
 * Nombre accesible del boton de un filtro de categoria, tal y como lo escribe
 * `views/sidebar.js`: "galletas (22 recetas)".
 *
 * SE ARMA CON LA CIFRA REAL. Estaba escrito a mano -"galletas (21 recetas)"- en
 * dos pruebas, y bastó con que la panaderia publicara una galleta desde el
 * obrador para que las dos dejaran de encontrar el boton. Lo que se quiere
 * comprobar es que el filtro EXISTE y dice cuantas hay, no cuantas hay.
 *
 * @param {string} categoria en mayusculas, como viene en los datos
 * @returns {string}
 */
export function filtro(categoria) {
  const total = cuantasEn(categoria);
  return `${categoria.toLowerCase()} (${total} ${total === 1 ? 'receta' : 'recetas'})`;
}

/**
 * Cuantas recetas publicadas hay en una categoria. `TODAS` devuelve el total.
 *
 * @param {string} categoria en mayusculas, como viene en los datos
 * @returns {number}
 */
export function cuantasEn(categoria) {
  if (categoria === 'TODAS') return PUBLICADO.recipes.length;
  return PUBLICADO.recipes.filter((r) => r.categoria === categoria).length;
}

/* ===========================================================================
 *  SUPABASE SIMULADO
 *
 *  Cada persona entra con su codigo y su PIN, y quien los comprueba es Supabase
 *  Auth. Las pruebas NO hablan con el proyecto real: harian falta un PIN de
 *  verdad, gastarian intentos del limite de Auth y fallarian sin red. Se
 *  intercepta la direccion del proyecto y se contesta con los mismos formatos
 *  que devolvio el servidor real al medirlo.
 *
 *  La politica de seguridad de contenido sigue aplicandose: la peticion tiene
 *  que estar permitida por `connect-src` para llegar a interceptarse, asi que
 *  estas pruebas tambien vigilan que la aplicacion pueda hablar con Supabase.
 * ======================================================================== */

export const SUPABASE = 'https://xjcdeczfyghanrccgsxu.supabase.co';

/** Codigo y PIN de la persona de prueba. */
export const CODIGO = 'QA-TEST';
export const PIN = '246810';

/**
 * El codigo que "muestra" la aplicacion autenticadora.
 *
 * La persona de prueba es administradora, y desde `0010` ese rol entra en dos
 * pasos: PIN y codigo del celular. `entrar` lo escribe por las pruebas.
 */
export const CODIGO_TOTP = '135790';

/** El perfil que devuelve `perfiles` para esa persona. */
export const PERFIL = Object.freeze({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  nombre: 'QA-TEST Persona',
  codigo_usuario: CODIGO,
  rol: 'admin',
  activo: true,
  sede: Object.freeze({ id: 'bbbbbbbb-0000-4000-8000-000000000001', nombre: 'QA-TEST-SEDE' }),
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'apikey, authorization, content-type, accept, prefer',
  'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
};

/**
 * Los perfiles del equipo, como los ve administracion en `perfiles`. La vista
 * `equipo_produccion` (0012) entrega de ellos solo id, nombre y area, y solo de
 * quien tiene area: el simulador la contesta asi.
 */
export const EQUIPO = Object.freeze([
  Object.freeze({ id: 'aaaaaaaa-0000-4000-8000-000000000011', nombre: 'Ana Panadera', codigo_usuario: 'ANA', rol: 'operario', area: 'PANADERÍA' }),
  Object.freeze({ id: 'aaaaaaaa-0000-4000-8000-000000000012', nombre: 'Leo Galletas', codigo_usuario: 'LEO', rol: 'operario', area: 'GALLETAS' }),
  Object.freeze({ id: 'aaaaaaaa-0000-4000-8000-000000000013', nombre: 'Sin Área', codigo_usuario: 'SINAREA', rol: 'operario', area: null }),
]);

/** Un Supabase simulado por contexto: lo comparten todas sus pestañas. */
const simulaciones = new WeakMap();

/**
 * Instala el Supabase simulado en el contexto del navegador.
 *
 * Va en el CONTEXTO y no en la pagina: una segunda pestaña comparte la sesion
 * guardada y la vuelve a comprobar al abrir, y sin simulacion saldria a
 * preguntar al proyecto real con un testigo inventado.
 *
 * Devuelve el objeto de control. Cambiar `entrar`, `renovar` o `leerPerfil`
 * sustituye esa respuesta: `{status, datos}` contesta eso, `'sin_red'` corta la
 * conexion y `{demora}` responde lo normal pasado ese tiempo. `llamadas` guarda
 * lo que la aplicacion pidio, para comprobar lo que viajo.
 *
 * @param {import('@playwright/test').BrowserContext} context
 */
export async function simularSupabase(context) {
  if (simulaciones.has(context)) return simulaciones.get(context);

  const sim = {
    perfil: { ...PERFIL },
    entrar: null,
    renovar: null,
    leerPerfil: null,
    expiraEn: 3600,
    emitidos: 0,
    // La verificacion en dos pasos: que celulares tiene registrados la cuenta y
    // con que nivel se emiten los testigos (`aal2` tras verificar el codigo).
    factores: [{ id: 'factor-qa', factor_type: 'totp', status: 'verified' }],
    nivel: 'aal1',
    // Lo que contesta `equipo_produccion`; `leerEquipo` lo sustituye como las demas.
    equipo: EQUIPO.map((p) => ({ ...p })),
    leerEquipo: null,
    // El recetario vive en la base (0024): la API lo sirve con su `receta_id` y
    // su `revision`. `leerRecetario` sustituye la respuesta como las demas.
    recetario: PUBLICADO.recipes.map((r) => ({ ...structuredClone(r), receta_id: 'rid-' + r.id, revision: 1, activa: true })),
    leerRecetario: null,
    llamadas: [],
  };
  simulaciones.set(context, sim);

  await context.route(`${SUPABASE}/**`, async (route) => {
    const peticion = route.request();
    if (peticion.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const url = new URL(peticion.url());
    let cuerpo = null;
    try {
      cuerpo = peticion.postDataJSON();
    } catch {
      cuerpo = null;
    }
    sim.llamadas.push({
      ruta: url.pathname + url.search,
      method: peticion.method(),
      cuerpo,
      autorizacion: peticion.headers().authorization || '',
    });

    const json = (status, datos) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: datos === undefined ? '' : JSON.stringify(datos),
      });

    const responder = async (sustituto, normal) => {
      if (sustituto === 'sin_red') return route.abort('internetdisconnected');
      if (sustituto && sustituto.demora) await new Promise((listo) => setTimeout(listo, sustituto.demora));
      if (sustituto && sustituto.status) return json(sustituto.status, sustituto.datos);
      return normal();
    };

    // Con forma de JWT: la aplicacion lee del testigo el `sub`, para no fiarse de
    // la identidad guardada en el equipo, y el `aal`, que dice si la sesion paso
    // por el segundo paso. La firma no la mira nadie aqui.
    const jwt = (numero, aal) => {
      const parte = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
      return `${parte({ alg: 'HS256', typ: 'JWT' })}.${parte({ sub: PERFIL.id, n: numero, aal })}.firma-${numero}`;
    };

    const emitir = (aal = sim.nivel) => {
      sim.emitidos += 1;
      return {
        access_token: jwt(sim.emitidos, aal),
        refresh_token: `renovacion-${sim.emitidos}`,
        token_type: 'bearer',
        expires_in: sim.expiraEn,
        expires_at: Math.floor(Date.now() / 1000) + sim.expiraEn,
        user: { id: PERFIL.id, factors: sim.factores },
      };
    };

    const concesion = url.searchParams.get('grant_type');

    if (url.pathname === '/auth/v1/token' && concesion === 'password') {
      return responder(sim.entrar, () =>
        cuerpo && cuerpo.email === `${CODIGO.toLowerCase()}@usuarios.zahavi.internal` && cuerpo.password === PIN
          ? json(200, emitir())
          : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }),
      );
    }
    if (url.pathname === '/auth/v1/token' && concesion === 'refresh_token') {
      return responder(sim.renovar, () => json(200, emitir()));
    }
    if (url.pathname === '/auth/v1/logout') return json(204);

    // --- El segundo paso ----------------------------------------------------
    if (url.pathname.startsWith('/auth/v1/factors')) {
      const resto = url.pathname.slice('/auth/v1/factors'.length);

      if (peticion.method() === 'DELETE') {
        const id = resto.slice(1);
        sim.factores = sim.factores.filter((f) => f.id !== id);
        return json(200, { id });
      }
      if (resto === '') {
        sim.factores = [...sim.factores, { id: 'factor-nuevo', factor_type: 'totp', status: 'unverified' }];
        return json(200, {
          id: 'factor-nuevo',
          type: 'totp',
          totp: {
            qr_code: '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200"/></svg>',
            secret: 'ABCDEFGHIJKLMNOP',
            uri: 'otpauth://totp/Zahavi%20POS:qa-test?secret=ABCDEFGHIJKLMNOP',
          },
        });
      }
      if (resto.endsWith('/challenge')) {
        return json(200, { id: 'reto-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
      }
      if (resto.endsWith('/verify')) {
        if (!cuerpo || cuerpo.code !== CODIGO_TOTP) {
          return json(422, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
        }
        sim.factores = sim.factores.map((f) => ({ ...f, status: 'verified' }));
        sim.nivel = 'aal2';
        return json(200, emitir('aal2'));
      }
    }
    if (url.pathname === '/rest/v1/equipo_produccion') {
      return responder(sim.leerEquipo, () => json(200, sim.equipo
        .filter((p) => p.area)
        .map(({ id, nombre, area }) => ({ id, nombre, area }))));
    }
    // Como la base de datos: el area solo la cambia administracion con `aal2`,
    // y a los demas se les contesta 200 con cero filas, no un error.
    const administra = sim.perfil && sim.perfil.rol === 'admin' && sim.nivel === 'aal2';
    if (url.pathname === '/rest/v1/perfiles' && peticion.method() === 'PATCH') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const persona = sim.equipo.find((p) => p.id === id);
      if (!administra || !persona) return json(200, []);
      persona.area = cuerpo.area;
      return json(200, [{ id, area: persona.area }]);
    }
    if (url.pathname === '/rest/v1/perfiles' && !url.searchParams.has('id')) {
      const propio = { ...sim.perfil, area: null };
      return json(200, administra
        ? [propio, ...sim.equipo.map((p) => ({ ...p, activo: true }))]
        : [propio]);
    }
    if (url.pathname === '/rest/v1/perfiles') {
      return responder(sim.leerPerfil, () => json(200, sim.perfil ? [sim.perfil] : []));
    }
    // --- La API de operacion (0018/0024): solo el recetario ------------------
    if (url.pathname === '/rest/v1/rpc/operacion_leer') {
      const consulta = cuerpo && cuerpo.p_consulta;
      if (!consulta || consulta.tipo !== 'recetario') return json(422, { code: 'invalida', message: 'Consulta no simulada.' });
      return responder(sim.leerRecetario, () => json(200, {
        version: 1,
        tipo: 'recetario',
        recetas: sim.recetario.filter((r) => r.activa),
        ingredientes: PUBLICADO.ingredientes,
      }));
    }
    if (url.pathname === '/rest/v1/rpc/operacion_ejecutar') {
      const sol = cuerpo && cuerpo.p_solicitud;
      // Como el servidor: editar el recetario es del jefe de obrador en adelante.
      if (!['obrador', 'gerencia', 'admin'].includes(sim.perfil && sim.perfil.rol)) {
        return json(403, { code: 'sin_permiso', message: 'Tu rol no permite esta operación.' });
      }
      const d = sol.datos;
      let receta = d.receta_id ? sim.recetario.find((r) => r.receta_id === d.receta_id) : null;
      if (receta && receta.revision !== sol.revision) {
        return json(409, { code: 'conflicto', message: 'Esta receta cambió mientras la editabas. Vuelve a abrirla y repite el cambio.' });
      }
      if (sol.accion === 'activar_receta') {
        Object.assign(receta, { activa: d.activa, revision: receta.revision + 1 });
      } else if (sol.accion === 'guardar_receta') {
        if (!receta) {
          const mayor = Math.max(...sim.recetario.map((r) => Number(r.id.slice(1)) || 0));
          receta = { id: 'R' + String(mayor + 1).padStart(3, '0'), receta_id: 'rid-nueva-' + (mayor + 1), revision: 0, activa: true };
          sim.recetario.push(receta);
        }
        Object.assign(receta, { nombre: String(d.nombre).toUpperCase(), categoria: d.categoria, metodo: d.metodo || '',
          componentes: structuredClone(d.componentes), revision: receta.revision + 1 });
      } else {
        return json(422, { code: 'invalida', message: 'Acción no simulada.' });
      }
      return json(200, { version: 1, accion: sol.accion, solicitud: sol.id, repetida: false, resultado: { receta } });
    }
    return json(404, { message: 'ruta no simulada' });
  });

  return sim;
}

/**
 * Cuantas veces pidio la aplicacion una ruta de Supabase.
 *
 * @param {{llamadas: Array<{ruta: string}>}} sim
 * @param {string} prefijo
 * @returns {number}
 */
export function llamadasA(sim, prefijo) {
  return sim.llamadas.filter((l) => l.ruta.startsWith(prefijo)).length;
}

/** Receta de tres componentes y catorce ingredientes: la de las pruebas. */
export const RECETA = 'R016';

/**
 * Abre el recetario con la sesion iniciada.
 *
 * Deja fuera el service worker a proposito. Su trabajo es servir la copia
 * guardada, y eso es justo lo que no interesa aqui: una prueba tiene que ver
 * el codigo que se acaba de tocar, no el que quedo en la cache. Hay una prueba
 * aparte para el modo sin conexion.
 *
 * DESDE QUE HAY MENU DE MODULOS, entrar deja en el menu y no en el recetario.
 * Por eso el valor por defecto es `#/recetario` y no `#/`: casi todas las
 * pruebas quieren el listado, y hacerlas pasar por el menu a mano solo anadiria
 * ruido. La que quiera comprobar el menu pide `#/` explicitamente.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [hash] a donde ir despues de entrar
 */
export async function entrar(page, hash = '#/recetario') {
  await page.addInitScript(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => Promise.reject(new Error('sin sw en pruebas'));
    }
  });

  const sim = await simularSupabase(page.context());
  await page.goto('/index.html');

  // Hay que dejar que termine de cargar el recetario antes de escribir: la
  // pantalla de entrada se repinta cuando llegan los datos, y con ella el
  // campo del PIN, que no se conserva entre repintados.
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Código de usuario').fill(CODIGO);
  await page.getByLabel('PIN', { exact: true }).fill(PIN);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // El segundo paso, para los roles que lo piden. Se decide por el ROL del
  // perfil simulado y no esperando a ver que pantalla aparece: esperar a una de
  // dos pantallas es una carrera, y este proyecto ya la sufrio con el menu.
  if (sim.perfil && (sim.perfil.rol === 'gerencia' || sim.perfil.rol === 'admin')) {
    await page.getByLabel('Código de verificación').fill(CODIGO_TOTP);
    await page.getByRole('button', { name: 'Verificar' }).click();
  }

  // Lo primero que aparece es el menu de modulos.
  await page.locator('.inicio').waitFor();

  if (hash && hash !== '#/') {
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    /*
     * Se espera a la carcasa del modulo, y SOLO a ella.
     *
     * Hubo aqui un `('.app, .inicio').first()` para cubrir tambien las
     * direcciones ilegibles, que caen en el menu. Era una carrera: el menu
     * sigue en el documento unos milisegundos despues de cambiar el hash
     * -el repintado va detras de la transicion de vista-, asi que `.first()`
     * resolvia sobre el menu viejo y devolvia el control antes de tiempo. Las
     * pruebas de movil median entonces una pantalla a medio cambiar y fallaban
     * las cuatro.
     *
     * Quien necesite comprobar una direccion que no se entiende, que entre al
     * menu y cambie el hash por su cuenta: son dos lineas y no obligan a que
     * este ayudante adivine.
     *
     * Cual sea la carcasa depende del modulo, y por eso se deduce del hash en
     * vez de aceptar las dos: produccion, ingredientes y almacen son pantallas
     * completas (`.pantalla`) y ya no cuelgan de `.app`. Esperar `.app,
     * .pantalla` seria volver al `.first()` que hubo aqui y a su carrera.
     */
    await page.locator(carcasaDe(hash)).waitFor();
  }
}

/**
 * Que nodo anuncia que la pantalla de una direccion ya esta puesta.
 *
 * @param {string} hash
 * @returns {string} un selector
 */
function carcasaDe(hash) {
  // `[/?]` y no un limite de palabra: la direccion de un modulo puede traer
  // el parametro de la receta de fondo (`#/plan?r=R010`).
  const visto = /^#\/(plan|ingredientes|almacen)(?:[/?]|$)/.exec(hash);
  return visto ? `.pantalla[data-modulo="${visto[1]}"]` : '.app';
}

/**
 * Abre un modulo COMO SE ABRE DE VERDAD: por su tarjeta del menu.
 *
 * Antes cada prueba pulsaba el boton que ese modulo tenia en la barra del
 * recetario. Esos botones ya no existen -produccion, ingredientes y almacen
 * dejaron de ser ventanas que se abrian encima del recetario para ser pantallas
 * propias-, y el camino real pasa por el menu. Que las pruebas hagan el mismo
 * recorrido que una persona es justamente lo que hace que sirvan.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'plan'|'ingredientes'|'almacen'} modulo
 */
export async function abrirModulo(page, modulo) {
  /*
   * SE PREGUNTA SI YA SE ESTA EN EL MENU, NO SI HAY UN BOTON DE «Menú».
   *
   * Mirar el boton parece lo natural y es una carrera: con una transicion de
   * vista por medio, la barra anterior sigue en el documento unos milisegundos
   * despues de que el hash haya cambiado, asi que se encuentra un boton que se
   * esta yendo y pulsarlo falla con «element was detached from the DOM». Es el
   * mismo fallo fantasma que ya dio aqui el `('.app, .inicio').first()`.
   *
   * Y desde una pantalla de modulo «Menú» esta en su barra, desde el recetario
   * en la suya: el mismo boton en el mismo sitio, que es lo que se gano al
   * unificar la barra.
   */
  if (!(await page.locator('.inicio').count())) {
    await page.getByRole('button', { name: 'Menú', exact: true }).first().click();
  }

  const tarjeta = page.locator(`.inicio .modulo[data-tono="${modulo}"]`);
  await tarjeta.waitFor();
  await tarjeta.click();
  await page.locator(`.pantalla[data-modulo="${modulo}"]`).waitFor();
}

/**
 * Sale del modulo que este abierto y espera a que se haya ido.
 *
 * Escape es la salida, la misma que respetaban las ventanas modales.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function salirDelModulo(page) {
  await page.keyboard.press('Escape');
  await page.locator('.pantalla').waitFor({ state: 'detached' });
}

/**
 * Abre Ajustes, que vive en el menu desde que la barra del recetario se quedo
 * con lo justo: volver al menu y crear una receta.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function abrirAjustes(page) {
  // La misma pregunta que en `abrirModulo`, por el mismo motivo.
  if (!(await page.locator('.inicio').count())) {
    await page.getByRole('button', { name: 'Menú', exact: true }).first().click();
  }

  await page.locator('.inicio').waitFor();
  await page.getByRole('button', { name: 'Ajustes' }).click();
}

/**
 * Cambia lo que se manda a imprimir por una anotacion, y devuelve lo que se
 * habria impreso. Se mira DENTRO de `window.print`, que es el unico instante en
 * el que la hoja tiene que estar montada.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function interceptarImpresion(page) {
  await page.evaluate(() => {
    window.__hojaImpresa = null;
    window.print = () => {
      const hoja = document.querySelector('#print-root .sheet');
      window.__hojaImpresa = hoja
        ? {
            titulo: hoja.querySelector('.sheet__title')?.textContent || '',
              texto: document.querySelector('#print-root').innerText,
          }
        : null;
    };
  });
}

/**
 * Lo que quedo anotado en la ultima impresion, esperando a que ocurra.
 *
 * La impresion no es inmediata: espera a que la pantalla se haya repintado de
 * verdad, que es justo lo que se quiere comprobar.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function hojaImpresa(page) {
  await page.waitForFunction(() => window.__hojaImpresa !== null, null, { timeout: 7000 });
  return page.evaluate(() => window.__hojaImpresa);
}

/**
 * Cuanto se sale la pagina por los lados. Cero es lo unico aceptable: un
 * desplazamiento horizontal en un telefono esconde contenido sin avisar.
 *
 * @param {import('@playwright/test').Page} page
 */
export function desbordeHorizontal(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Desplaza el listado y abre una receta SIN mover la lista de sitio.
 *
 * Lo segundo es la mitad del asunto: `locator.click()` desplaza el elemento a la
 * vista antes de pulsarlo, asi que pulsar asi mueve justo lo que se quiere
 * medir. Aqui se pulsa desde la propia pagina, que no desplaza nada.
 *
 * Devuelve la altura a la que quedo el listado -contra la que hay que comparar
 * despues, porque la pedida puede no ser alcanzable si la lista es corta- y el
 * codigo de la receta que se abrio.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} alturaPedida
 * @returns {Promise<{altura: number, id: string}>}
 */
export async function abrirRecetaDesde(page, alturaPedida) {
  const lista = page.locator('.sidebar__list');
  await lista.evaluate((el, alto) => { el.scrollTop = alto; }, alturaPedida);
  const altura = await lista.evaluate((el) => el.scrollTop);

  // Una receta de las que SE VEN, comparando rectangulos: `offsetTop` no sirve,
  // porque la lista no esta posicionada y ese valor no es relativo a ella.
  const id = await lista.evaluate((el) => {
    const caja = el.getBoundingClientRect();
    const visible = [...el.querySelectorAll('.recipe-link')].find((enlace) => {
      const r = enlace.getBoundingClientRect();
      return r.top > caja.top + 60 && r.bottom < caja.bottom - 10;
    });
    return visible ? visible.dataset.id : null;
  });

  await page.locator(`.recipe-link[data-id="${id}"]`).evaluate((enlace) => enlace.click());
  return { altura, id };
}

/**
 * Altura actual del listado.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
export function alturaDelListado(page) {
  return page.locator('.sidebar__list').evaluate((el) => el.scrollTop);
}

/**
 * Contraste real entre los fondos de dos elementos.
 *
 * Compone el alfa contra lo que cada uno tiene detras: `getComputedStyle`
 * devuelve el color DECLARADO con su transparencia, no el que se acaba viendo,
 * y sin componerlo un blanco al 4 % sobre un rail oscuro se leeria como casi
 * blanco y la medida no diria nada.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selectorA
 * @param {string} selectorB
 * @returns {Promise<number>} la razon de contraste, de 1 a 21
 */
export function contrasteDeFondos(page, selectorA, selectorB) {
  return page.evaluate(([a, b]) => {
    const cifras = (valor) => valor.match(/[0-9.]+/g).map(Number);

    // Se sube por los ancestros hasta el primero que pinte de verdad, en vez de
    // dar por hecho cual es.
    const detras = (nodo) => {
      for (let n = nodo.parentElement; n; n = n.parentElement) {
        const color = cifras(getComputedStyle(n).backgroundColor);
        if (color.length < 4 || color[3] === 1) return color.slice(0, 3);
      }
      return [255, 255, 255];
    };

    const compuesto = (sel) => {
      const nodo = document.querySelector(sel);
      const [r, g, azul, alfa = 1] = cifras(getComputedStyle(nodo).backgroundColor);
      const fondo = detras(nodo);
      return [r, g, azul].map((canal, i) => canal * alfa + fondo[i] * (1 - alfa));
    };

    const canal = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminancia = ([r, g, azul]) =>
      0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(azul);

    const luzA = luminancia(compuesto(a));
    const luzB = luminancia(compuesto(b));
    return (Math.max(luzA, luzB) + 0.05) / (Math.min(luzA, luzB) + 0.05);
  }, [selectorA, selectorB]);
}
