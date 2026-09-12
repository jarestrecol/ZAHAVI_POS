/**
 * =============================================================================
 *  LAS 122 RECETAS REALES, VOLCADAS AL ESQUEMA RELACIONAL
 * =============================================================================
 *
 *  Lee `data/recipes.json` y escribe en la salida estandar el SQL que carga el
 *  catalogo de ingredientes, las recetas, sus componentes y sus 1.293 lineas.
 *
 *      node scripts/sembrar-recetas.mjs > semilla.sql
 *      node scripts/sembrar-recetas.mjs --informe    (solo el diagnostico)
 *
 *  POR QUE SE GENERA Y NO SE GUARDA ESCRITO
 *  ----------------------------------------
 *  Un archivo SQL con las recetas dentro seria una SEGUNDA copia del recetario,
 *  y el dia que la panaderia publique una receta las dos dejarian de coincidir
 *  sin que nada avisara. El recetario tiene una sola fuente, `data/recipes.json`,
 *  y esto es una proyeccion suya que se vuelve a calcular cada vez.
 *
 *  LA DECISION DIFICIL: QUE UNIDAD BASE LLEVA CADA INGREDIENTE
 *  -----------------------------------------------------------
 *  16 ingredientes se miden hoy de dos o tres formas. El esquema exige UNA
 *  unidad base por ingrediente, asi que hay que elegir, y elegir mal con dinero
 *  de por medio no es una imprecision.
 *
 *  Lo que hace esto:
 *    - Elige la unidad con MAS lineas. Es la que usa la panaderia de verdad.
 *    - En caso de empate, un orden fijo y escrito: GR, ML, UND, MG, CM. La masa
 *      primero porque un obrador pesa. Hay dos empates reales -CAFÉ LIQUIDO y
 *      AGUA ( CALIENTE )-, asi que esto no es un caso hipotetico.
 *
 *  Y lo que NO hace, que importa mas:
 *    - NO inventa conversiones. Podria crear la fila `AGUA desde ML factor 1` y
 *      acertaria, pero entonces tambien crearia `HUEVOS desde GR factor ?` y ahi
 *      no hay factor que valga: un huevo no son gramos hasta que alguien decida
 *      cuantos. Sin fila de conversion, la vista de costeo marca esas lineas
 *      como `sin_precio` / `sin_conversion` y lo dice en pantalla, que es la
 *      regla 24 de CLAUDE.md aplicada donde de verdad se paga.
 *
 *  El informe del final lista exactamente esas 16 decisiones pendientes para que
 *  las tome la panaderia, que es quien conoce la formula.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { splitYield } from '../src/lib/format.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const soloInforme = process.argv.includes('--informe');
// `--cifras` existe para que `verificar.mjs` no tenga que reimplementar la regla
// de la unidad base. Una segunda copia de esa regla sería una segunda respuesta
// posible a la misma pregunta, y el dia que discreparan no habria forma de saber
// cual manda.
const soloCifras = process.argv.includes('--cifras');

/**
 * Orden de desempate de la unidad base.
 *
 * Escrito y no alfabetico: un obrador pesa, asi que ante dos unidades con el
 * mismo numero de lineas gana la de masa. Cambiar este orden cambia el costo de
 * las recetas afectadas, asi que no es un detalle de implementacion.
 */
const PREFERENCIA = ['GR', 'ML', 'UND', 'MG', 'CM'];

/*
 * Unidad de rendimiento por defecto.
 *
 * Ocho recetas traen la cifra sin unidad: `SACHER TORTE x 5`, `DELICIAS DE
 * CHOCOLATE X 16`. El esquema no admite media cosa -o van cantidad y unidad, o
 * no va ninguna-, asi que o se les pone unidad o se pierde el 5.
 *
 * Se les pone `UND`, y esto NO es lo mismo que inventar un factor de
 * conversion: aqui la CIFRA es el dato y la unidad es la etiqueta con la que se
 * lee. No entra en ningun calculo de dinero. Tirar la cifra para no tener que
 * etiquetarla seria peor.
 *
 * Y hay una razon concreta: cuatro de esas ocho son las `SACHER TORTE`, que
 * segun la regla 6 de CLAUDE.md solo se distinguen entre si POR el rendimiento.
 * Dejarlas las cuatro en nulo daria cuatro filas identicas en cualquier listado
 * que muestre nombre y rendimiento, que es el defecto que esa regla existe para
 * evitar.
 *
 * El informe las lista una a una para que alguien lo confirme.
 */
const UNIDAD_RENDIMIENTO_POR_DEFECTO = 'UND';

/** Texto a literal SQL, con las comillas simples escapadas. @param {string} v */
const lit = (v) => "'" + String(v).replace(/'/g, "''") + "'";

/** Numero a literal SQL. Sin notacion exponencial. @param {number} n */
const num = (n) => Number(n).toFixed(3).replace(/\.?0+$/, '') || '0';

const datos = JSON.parse(readFileSync(join(root, 'data/recipes.json'), 'utf8'));

// ---------------------------------------------------------------------------
//  1. EL CATALOGO, CON SU UNIDAD BASE
// ---------------------------------------------------------------------------

/** @type {Map<string, Map<string, number>>} nombre -> unidad -> lineas */
const usos = new Map();

for (const receta of datos.recipes) {
  for (const componente of receta.componentes) {
    for (const item of componente.items) {
      const nombre = String(item.ingrediente || '').trim();
      if (!nombre) continue;
      const unidad = String(item.unidad || '').trim().toUpperCase();
      if (!usos.has(nombre)) usos.set(nombre, new Map());
      const porUnidad = usos.get(nombre);
      porUnidad.set(unidad, (porUnidad.get(unidad) || 0) + 1);
    }
  }
}

/**
 * @param {Map<string, number>} porUnidad
 * @returns {{base: string, empate: boolean}}
 */
function elegirBase(porUnidad) {
  const ordenadas = [...porUnidad].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const ia = PREFERENCIA.indexOf(a[0]);
    const ib = PREFERENCIA.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const empate = ordenadas.length > 1 && ordenadas[0][1] === ordenadas[1][1];
  return { base: ordenadas[0][0], empate };
}

const catalogo = [...usos]
  .map(([nombre, porUnidad]) => {
    const { base, empate } = elegirBase(porUnidad);
    return { nombre, base, empate, porUnidad };
  })
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

const ambiguos = catalogo.filter((c) => c.porUnidad.size > 1);

// ---------------------------------------------------------------------------
//  2. EL INFORME: LO QUE UNA PERSONA TIENE QUE DECIDIR
// ---------------------------------------------------------------------------

if (soloCifras) {
  const minoritarias = ambiguos.reduce(
    (n, c) => n + [...c.porUnidad].filter(([u]) => u !== c.base).reduce((m, [, k]) => m + k, 0),
    0,
  );

  const recetasAfectadas = new Set();
  const enUnaSolaReceta = new Map();
  let componentes = 0;
  let lineas = 0;

  for (const receta of datos.recipes) {
    componentes += receta.componentes.length;
    for (const componente of receta.componentes) {
      for (const item of componente.items) {
        const nombre = String(item.ingrediente || '').trim();
        if (!nombre) continue;
        lineas += 1;
        const unidad = String(item.unidad || '').trim().toUpperCase();
        const ficha = catalogo.find((c) => c.nombre === nombre);
        if (ficha && ficha.porUnidad.size > 1 && unidad !== ficha.base) {
          recetasAfectadas.add(receta.id);
        }
        if (!enUnaSolaReceta.has(nombre)) enUnaSolaReceta.set(nombre, new Set());
        enUnaSolaReceta.get(nombre).add(receta.id);
      }
    }
  }

  console.log(
    JSON.stringify({
      ingredientes: catalogo.length,
      recetas: datos.recipes.length,
      componentes,
      lineas,
      ambiguos: ambiguos.length,
      minoritarias,
      recetasAfectadas: recetasAfectadas.size,
      enUnaSolaReceta: [...enUnaSolaReceta.values()].filter((s) => s.size === 1).length,
    }),
  );
  process.exit(0);
}

if (soloInforme) {
  console.log('\nIngredientes que se miden de mas de una forma\n');
  console.log('  Estas lineas NO se van a poder costear hasta que alguien apruebe');
  console.log('  la conversion, o corrija la receta. El programa no lo decide.\n');

  for (const c of ambiguos) {
    const otras = [...c.porUnidad]
      .filter(([u]) => u !== c.base)
      .map(([u, n]) => `${u} (${n})`)
      .join(', ');
    const marca = c.empate ? '  <- EMPATE, decidido por el orden escrito' : '';
    console.log(`  ${c.nombre.padEnd(26)} base ${c.base.padEnd(4)} pendientes: ${otras}${marca}`);
  }

  const lineasPendientes = ambiguos.reduce(
    (n, c) => n + [...c.porUnidad].filter(([u]) => u !== c.base).reduce((m, [, k]) => m + k, 0),
    0,
  );
  console.log(`\n  ${ambiguos.length} ingredientes, ${lineasPendientes} lineas de receta afectadas.\n`);

  // La otra decision que el programa toma por su cuenta. Va en el mismo informe
  // porque quien revise esto tiene que ver las dos juntas.
  const supuestas = datos.recipes
    .map((r) => ({ codigo: r.id, nombre: r.nombre, ...splitYield(r.nombre) }))
    .filter((r) => r.cantidad !== '' && r.unidad === '');

  if (supuestas.length) {
    console.log('Recetas a las que se les supuso la unidad del rendimiento\n');
    console.log(`  Llevan la cifra pero no la unidad, y se les pone ${UNIDAD_RENDIMIENTO_POR_DEFECTO}.`);
    console.log('  Confirmar que son unidades y no porciones, cajas ni paquetes.\n');
    for (const r of supuestas) {
      console.log(`  ${r.codigo}  ${r.nombre.padEnd(40)} -> ${r.cantidad} ${UNIDAD_RENDIMIENTO_POR_DEFECTO}`);
    }
    console.log('');
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
//  3. EL SQL
// ---------------------------------------------------------------------------

const salida = [];
const w = (linea) => salida.push(linea);

w('-- GENERADO POR scripts/sembrar-recetas.mjs. No editar a mano.');
w('-- Fuente: data/recipes.json. Para regenerarlo, volver a ejecutar el script.');
w('');
w('begin;');
w('');

// ---- Ingredientes ----------------------------------------------------------
w('-- ' + catalogo.length + ' ingredientes. `on conflict` para poder sembrar dos veces.');
w('insert into ingredientes (nombre, unidad_base) values');
w(catalogo.map((c) => `  (${lit(c.nombre)}, ${lit(c.base)})`).join(',\n'));
w('on conflict (nombre) do update set unidad_base = excluded.unidad_base;');
w('');

// ---- Recetas ---------------------------------------------------------------
const recetas = datos.recipes.map((r) => {
  const { cantidad, unidad } = splitYield(r.nombre);
  const tieneRendimiento = cantidad !== '';
  return {
    codigo: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    cantidad: tieneRendimiento ? Number(String(cantidad).replace(',', '.')) : null,
    unidad: tieneRendimiento ? unidad || UNIDAD_RENDIMIENTO_POR_DEFECTO : null,
    metodo: r.metodo || '',
    componentes: r.componentes,
  };
});

w('-- ' + recetas.length + ' recetas. El rendimiento sale del nombre y pasa a dos columnas.');
w('insert into recetas (codigo, nombre, categoria, rendimiento_cantidad, rendimiento_unidad, metodo) values');
w(
  recetas
    .map((r) => {
      const cant = r.cantidad === null ? 'null' : num(r.cantidad);
      const uni = r.unidad === null ? 'null' : lit(r.unidad);
      return `  (${lit(r.codigo)}, ${lit(r.nombre)}, ${lit(r.categoria)}, ${cant}, ${uni}, ${lit(r.metodo)})`;
    })
    .join(',\n'),
);
w('on conflict (codigo) do update set');
w('  nombre = excluded.nombre,');
w('  categoria = excluded.categoria,');
w('  rendimiento_cantidad = excluded.rendimiento_cantidad,');
w('  rendimiento_unidad = excluded.rendimiento_unidad,');
w('  metodo = excluded.metodo;');
w('');

/*
 * Los componentes y las lineas pasan por una tabla temporal y se insertan con un
 * `join`, en vez de mil trescientas sentencias que busquen su padre una a una.
 *
 * No es solo velocidad: el `join` es lo que convierte un desajuste en un FALLO
 * VISIBLE. Si un ingrediente no cuadrara, esa linea simplemente no entraria, y
 * el recuento de abajo lo dice en vez de dejar una receta a medias en silencio.
 */

// ---- Componentes -----------------------------------------------------------
const filasComp = [];
for (const r of recetas) {
  r.componentes.forEach((c, i) => {
    filasComp.push({ codigo: r.codigo, orden: i + 1, nombre: String(c.nombre || 'PRINCIPAL').trim() || 'PRINCIPAL' });
  });
}

w('create temp table _comp (codigo text, orden smallint, nombre text) on commit drop;');
w('insert into _comp values');
w(filasComp.map((c) => `  (${lit(c.codigo)}, ${c.orden}, ${lit(c.nombre)})`).join(',\n') + ';');
w('');
w('insert into receta_componentes (receta_id, orden, nombre)');
w('select r.id, s.orden, s.nombre from _comp s join recetas r on r.codigo = s.codigo');
w('on conflict (receta_id, orden) do update set nombre = excluded.nombre;');
w('');

// ---- Lineas de ingrediente -------------------------------------------------
const filasItem = [];
for (const r of recetas) {
  r.componentes.forEach((c, i) => {
    c.items.forEach((item, j) => {
      const nombre = String(item.ingrediente || '').trim();
      if (!nombre) return;
      filasItem.push({
        codigo: r.codigo,
        comp: i + 1,
        ingrediente: nombre,
        cantidad: Number(item.cantidad),
        unidad: String(item.unidad || '').trim().toUpperCase(),
        orden: j + 1,
      });
    });
  });
}

w('create temp table _item (');
w('  codigo text, comp smallint, ingrediente text,');
w('  cantidad numeric(14, 3), unidad text, orden smallint');
w(') on commit drop;');
w('insert into _item values');
w(
  filasItem
    .map(
      (i) =>
        `  (${lit(i.codigo)}, ${i.comp}, ${lit(i.ingrediente)}, ${num(i.cantidad)}, ${lit(i.unidad)}, ${i.orden})`,
    )
    .join(',\n') + ';',
);
w('');
w('delete from receta_items where componente_id in (select id from receta_componentes);');
w('insert into receta_items (componente_id, ingrediente_id, cantidad, unidad, orden)');
w('select rc.id, ing.id, s.cantidad, s.unidad, s.orden');
w('from _item s');
w('join recetas r on r.codigo = s.codigo');
w('join receta_componentes rc on rc.receta_id = r.id and rc.orden = s.comp');
w('join ingredientes ing on ing.nombre = s.ingrediente;');
w('');

/*
 * LA COMPROBACION QUE JUSTIFICA TODO LO ANTERIOR.
 *
 * Una semilla que carga el 98% de las lineas y calla es peor que una que falla:
 * el recetario parece completo y una receta pesa de menos. Aqui se comparan las
 * cifras contra las que trae el archivo, y si no cuadran no se confirma nada.
 */
/*
 * Las lineas cuya unidad no es la base de su ingrediente, contadas AQUI, en
 * JavaScript, para que la base de datos las vuelva a contar por su cuenta.
 *
 * Son dos implementaciones independientes de la misma pregunta: esta recorre el
 * JSON y aquella hace un `join`. Si alguna vez discrepan, es que la regla de la
 * unidad base cambio en un sitio y no en el otro, que es exactamente el fallo
 * que nadie encuentra leyendo.
 */
const porNombre = new Map(catalogo.map((c) => [c.nombre, c.base]));
const pendientes = filasItem.filter((i) => i.unidad !== porNombre.get(i.ingrediente));
const recetasPendientes = new Set(pendientes.map((i) => i.codigo)).size;

w('do $$');
w('declare');
w('  n_ing integer; n_rec integer; n_comp integer; n_item integer;');
w('  n_pend integer; n_pend_rec integer;');
w('begin');
w('  select count(*) into n_ing from ingredientes;');
w('  select count(*) into n_rec from recetas;');
w('  select count(*) into n_comp from receta_componentes;');
w('  select count(*) into n_item from receta_items;');
w('');
w(`  if n_ing < ${catalogo.length} then`);
w(`    raise exception 'Faltan ingredientes: hay % y deberian estar los ${catalogo.length}', n_ing;`);
w('  end if;');
w(`  if n_rec < ${recetas.length} then`);
w(`    raise exception 'Faltan recetas: hay % y deberian estar las ${recetas.length}', n_rec;`);
w('  end if;');
w(`  if n_comp < ${filasComp.length} then`);
w(`    raise exception 'Faltan componentes: hay % y deberian estar los ${filasComp.length}', n_comp;`);
w('  end if;');
w(`  if n_item <> ${filasItem.length} then`);
w(`    raise exception 'Las lineas no cuadran: hay % y deberian ser ${filasItem.length}', n_item;`);
w('  end if;');
w('');
w(`  raise notice '  OK    % ingredientes, % recetas, % componentes, % lineas', n_ing, n_rec, n_comp, n_item;`);
w('');
w('  select count(*), count(distinct r.id) into n_pend, n_pend_rec');
w('  from receta_items ri');
w('  join ingredientes ing on ing.id = ri.ingrediente_id');
w('  join receta_componentes rc on rc.id = ri.componente_id');
w('  join recetas r on r.id = rc.receta_id');
w('  where ri.unidad <> ing.unidad_base;');
w('');
w(`  if n_pend <> ${pendientes.length} or n_pend_rec <> ${recetasPendientes} then`);
w(
  `    raise exception 'La regla de la unidad base no coincide: la base dice % lineas en % recetas y el generador dijo ${pendientes.length} en ${recetasPendientes}', n_pend, n_pend_rec;`,
);
w('  end if;');
w('');
w(
  `  raise notice '  OK    % lineas de % recetas esperan que alguien decida su unidad', n_pend, n_pend_rec;`,
);
w('end $$;');
w('');
w('commit;');
w('');

console.log(salida.join('\n'));
