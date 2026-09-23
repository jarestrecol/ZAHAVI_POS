/**
 * =============================================================================
 *  LOS CASOS DE COSTEO SIGUEN DICIENDO LO MISMO
 * =============================================================================
 *
 *  Corre `db/pruebas/casos-costeo.json` contra el nucleo actual y comprueba dos
 *  cosas distintas:
 *
 *    1. La SALIDA COMPLETA no cambio. Es una foto: si alguien toca una regla del
 *       costeo, aqui salta y hay que decidir si el cambio es querido (entonces se
 *       regenera el archivo) o si es un descuido.
 *    2. Las CIFRAS CLAVE calculadas A MANO en cada caso (`esperado`) se cumplen.
 *       Sin esto, una foto de un comportamiento equivocado quedaria bendecida.
 *
 *  Cuando exista `privado.costear()` en PostgreSQL (fase 3), el mismo archivo se
 *  correra contra la base y se comparara con estas salidas: es la prueba de que
 *  el servidor calcula igual que la aplicacion, que es lo que pide el plan.
 *
 *  Se ejecuta con:  node scripts/test-casos-costeo.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { costearPlan } from '../src/core/costeo.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivo = join(raiz, 'db', 'pruebas', 'casos-costeo.json');

let fallos = 0;
let total = 0;

function prueba(nombre, fn) {
  total += 1;
  try {
    fn();
    console.log(`OK ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.log(`FALLA ${nombre}`);
    console.log(`     ${error.message.split('\n').slice(0, 6).join('\n     ')}`);
  }
}

const datos = JSON.parse(readFileSync(archivo, 'utf8'));
assert.ok(Array.isArray(datos.casos) && datos.casos.length > 0, 'el archivo de casos esta vacio');

console.log(`\nCasos de costeo (${datos.casos.length}), dia fijo ${datos.hoy}\n`);

for (const caso of datos.casos) {
  prueba(`${caso.nombre}: ${caso.regla}`, () => {
    const salida = costearPlan(caso.lineas, caso.lotes, caso.hoy);

    // 1. Las cifras calculadas a mano.
    for (const [campo, valor] of Object.entries(caso.esperado || {})) {
      assert.equal(salida[campo], valor, `${campo}: ${salida[campo]} deberia ser ${valor}`);
    }

    // 2. La salida entera, tramo a tramo.
    assert.deepEqual(salida, caso.salida, 'la salida del costeo cambio respecto al contrato');
  });
}

// Reglas transversales: se comprueban sobre todos los casos a la vez, porque son
// invariantes del costeo, no de un escenario.
prueba('ningun faltante es negativo y ningun consumo supera lo pedido', () => {
  for (const caso of datos.casos) {
    for (const linea of caso.salida.lineas) {
      assert.ok(linea.faltante === null || linea.faltante >= 0, `${caso.nombre}: faltante negativo`);
      if (linea.cantidad !== null) {
        assert.ok(linea.consumo <= linea.cantidad + 1e-9, `${caso.nombre}: consumo mayor que lo pedido`);
      }
    }
  }
});

prueba('ningun tramo saca de un lote mas de lo que tenia', () => {
  for (const caso of datos.casos) {
    const existencias = new Map(caso.lotes.map((l) => [l.id, l.existencia]));
    const sacado = new Map();
    for (const linea of caso.salida.lineas) {
      for (const tramo of linea.origen) sacado.set(tramo.loteId, (sacado.get(tramo.loteId) || 0) + tramo.cantidad);
    }
    for (const [loteId, cantidad] of sacado) {
      assert.ok(cantidad <= existencias.get(loteId) + 1e-9,
        `${caso.nombre}: del lote ${loteId} salieron ${cantidad} y solo habia ${existencias.get(loteId)}`);
    }
  }
});

prueba('el costo total es la suma de las lineas', () => {
  for (const caso of datos.casos) {
    const suma = caso.salida.lineas.reduce((s, l) => s + l.costo, 0);
    assert.equal(caso.salida.costoTotal, suma, `${caso.nombre}: el total no cuadra con sus lineas`);
  }
});

console.log(`\n${total - fallos} de ${total} comprobaciones del contrato de costeo correctas.\n`);
process.exit(fallos === 0 ? 0 : 1);
