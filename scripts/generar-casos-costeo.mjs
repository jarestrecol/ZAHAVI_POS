/**
 * =============================================================================
 *  CASOS DE COSTEO: EL CONTRATO QUE LA BASE DE DATOS TENDRA QUE CUMPLIR
 * =============================================================================
 *
 *  La fase 3 del plan exige que el servidor recalcule gramos y FEFO «con reglas
 *  equivalentes a las actuales». Eso hay que PODER DEMOSTRARLO: no basta con
 *  escribir la funcion en SQL y que parezca igual.
 *
 *  Este script congela el comportamiento de `costearPlan` (src/core/costeo.js)
 *  en un archivo de casos: cada caso lleva su bodega, sus lineas de receta, el
 *  dia en que se costea, y la salida completa que produce hoy la aplicacion.
 *
 *  Se usa dos veces:
 *
 *    1. AHORA, con `test-casos-costeo.mjs`, que vuelve a correr los casos
 *       contra el nucleo local: si alguien cambia una regla sin querer, salta.
 *    2. EN LA FASE 3, para correr los MISMOS casos contra `privado.costear()`
 *       en PostgreSQL y comparar linea a linea. Una diferencia de un peso o de
 *       un gramo es un fallo, no un redondeo aceptable.
 *
 *  Cada caso dice QUE REGLA vigila. Si un caso se vuelve imposible de cumplir,
 *  la conversacion es sobre la regla, no sobre el archivo.
 *
 *  Se ejecuta con:  node scripts/generar-casos-costeo.mjs
 *  (solo hace falta al añadir o cambiar casos; el archivo se versiona)
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { costearPlan } from '../src/core/costeo.js';
import { normalizarLote } from '../src/core/almacen.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(raiz, 'db', 'pruebas', 'casos-costeo.json');

/** Dia de referencia de todos los casos. Fijo: un caso no puede caducar. */
export const HOY = '2026-06-15';

const lote = (datos) => normalizarLote({
  marca: 'QA', proveedor: 'QA Proveedor', presentacion: 'BOLSA',
  fechaCompra: '2026-06-01', registrado: `${datos.fechaCompra || '2026-06-01'}T07:00:00.000Z`,
  ...datos,
});

/**
 * Los casos. `regla` explica que se vigila; si un caso falla, ahi esta el porque.
 */
export const CASOS = [
  {
    nombre: 'fefo-simple',
    regla: 'Se consume primero el lote que vence antes, aunque se haya comprado despues.',
    lotes: [
      lote({ id: 'L001', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 1000, costoCompra: 2000, existencia: 1000, vencimiento: '2026-12-31' }),
      lote({ id: 'L002', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 1000, costoCompra: 3000, existencia: 1000, vencimiento: '2026-07-01' }),
    ],
    lineas: [{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 1500 }],
    // 1.000 g del lote que vence en julio (3 $/g) + 500 g del otro (2 $/g).
    esperado: { costoTotal: 4000 },
  },
  {
    nombre: 'vencido-se-ignora',
    regla: 'Un lote vencido no se consume aunque tenga existencia; queda contado aparte.',
    lotes: [
      lote({ id: 'L010', ingrediente: 'AZUCAR', unidad: 'GR', pesoCompra: 500, costoCompra: 1000, existencia: 500, vencimiento: '2026-06-14' }),
      lote({ id: 'L011', ingrediente: 'AZUCAR', unidad: 'GR', pesoCompra: 500, costoCompra: 2000, existencia: 500, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'AZUCAR', unidad: 'GR', cantidad: 300 }],
    esperado: { costoTotal: 1200, lotesVencidosIgnorados: 1 },
  },
  {
    nombre: 'compra-futura-no-existe-todavia',
    regla: 'Un lote comprado despues del dia que se costea no se puede usar ese dia.',
    lotes: [
      lote({ id: 'L020', ingrediente: 'SAL', unidad: 'GR', pesoCompra: 1000, costoCompra: 1000, existencia: 1000, fechaCompra: '2026-06-20', vencimiento: '2027-01-01' }),
    ],
    lineas: [{ ingrediente: 'SAL', unidad: 'GR', cantidad: 100 }],
    esperado: { costoTotal: 0, lineasSinPrecio: 1 },
  },
  {
    nombre: 'equivalencia-ml',
    regla: 'La receta pide ml y el lote se compro en litros: se convierte con los gramos de 1 ml.',
    lotes: [
      lote({ id: 'L030', ingrediente: 'LECHE', unidad: 'LT', pesoCompra: 2, costoCompra: 8000, existencia: 2, equivalencias: { ML: 1.03 }, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'LECHE', unidad: 'ML', cantidad: 500 }],
    // 500 ml = 515 g; el litro pesa 1.030 g y cuesta 4.000 $ -> 2.000 $.
    esperado: { costoTotal: 2000 },
  },
  {
    nombre: 'equivalencia-unidad',
    regla: 'La receta pide unidades y el lote se compro por unidades con su peso declarado.',
    lotes: [
      lote({ id: 'L040', ingrediente: 'HUEVO', unidad: 'UND', pesoCompra: 30, costoCompra: 15000, existencia: 30, equivalencias: { UND: 50 }, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'HUEVO', unidad: 'UND', cantidad: 4 }],
    esperado: { costoTotal: 2000 },
  },
  {
    nombre: 'sin-equivalencia',
    regla: 'Sin el peso de la unidad no se inventa densidad: la linea queda sin conversion y no cuesta.',
    lotes: [
      lote({ id: 'L050', ingrediente: 'MIEL', unidad: 'LT', pesoCompra: 1, costoCompra: 20000, existencia: 1, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'MIEL', unidad: 'ML', cantidad: 100 }],
    esperado: { costoTotal: 0, lineasSinConversion: 1 },
  },
  {
    nombre: 'equivalencias-contradictorias',
    regla: 'Dos lotes con pesos distintos para la misma medida: no se elige uno al azar, se para.',
    lotes: [
      lote({ id: 'L060', ingrediente: 'CREMA', unidad: 'LT', pesoCompra: 1, costoCompra: 10000, existencia: 1, equivalencias: { ML: 1 }, vencimiento: '2026-12-31' }),
      lote({ id: 'L061', ingrediente: 'CREMA', unidad: 'LT', pesoCompra: 1, costoCompra: 12000, existencia: 1, equivalencias: { ML: 1.2 }, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'CREMA', unidad: 'ML', cantidad: 200 }],
    esperado: { costoTotal: 0, lineasSinConversion: 1 },
  },
  {
    nombre: 'agua-de-proceso',
    regla: 'El agua no se compra ni descuenta bodega, y cuesta cero.',
    lotes: [],
    lineas: [{ ingrediente: 'AGUA', unidad: 'ML', cantidad: 1000 }],
    esperado: { costoTotal: 0, lineasConFaltante: 0 },
  },
  {
    nombre: 'faltante-parcial',
    regla: 'Si no alcanza, se consume lo que hay y el faltante es la diferencia exacta, nunca negativo.',
    lotes: [
      lote({ id: 'L070', ingrediente: 'MANTEQUILLA', unidad: 'GR', pesoCompra: 200, costoCompra: 4000, existencia: 200, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'MANTEQUILLA', unidad: 'GR', cantidad: 500 }],
    esperado: { costoTotal: 4000, lineasConFaltante: 1 },
  },
  {
    nombre: 'dos-lineas-mismo-ingrediente',
    regla: 'Dos lineas del mismo ingrediente no gastan dos veces la misma existencia.',
    lotes: [
      lote({ id: 'L080', ingrediente: 'CACAO', unidad: 'GR', pesoCompra: 100, costoCompra: 5000, existencia: 100, vencimiento: '2026-12-31' }),
    ],
    lineas: [
      { ingrediente: 'CACAO', unidad: 'GR', cantidad: 80 },
      { ingrediente: 'CACAO', unidad: 'GR', cantidad: 80 },
    ],
    esperado: { costoTotal: 5000, lineasConFaltante: 1 },
  },
  {
    nombre: 'fraccion-pequena-de-bulto',
    regla: 'Una pizca de un bulto grande conserva decimales: no se redondea a cero ni a un gramo.',
    lotes: [
      lote({ id: 'L090', ingrediente: 'LEVADURA', unidad: 'KG', pesoCompra: 25, costoCompra: 250000, existencia: 25, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'LEVADURA', unidad: 'GR', cantidad: 0.5 }],
    esperado: { costoTotal: 5 },
  },
  {
    nombre: 'residuo-de-medio-miligramo',
    regla: 'Un faltante diminuto NO se perdona: pedir 100,0004 g cuando hay 100 deja faltante, no «cubierto».',
    lotes: [
      lote({ id: 'L120', ingrediente: 'CANELA', unidad: 'GR', pesoCompra: 100, costoCompra: 1000, existencia: 100, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'CANELA', unidad: 'GR', cantidad: 100.0004 }],
    esperado: { costoTotal: 1000, lineasConFaltante: 1 },
  },
  {
    nombre: 'lote-sin-precio',
    regla: 'Un lote sin costo no se convierte en cero silencioso: la linea se marca sin precio.',
    lotes: [
      lote({ id: 'L100', ingrediente: 'VAINILLA', unidad: 'GR', pesoCompra: 100, costoCompra: 0, existencia: 100, vencimiento: '2026-12-31' }),
    ],
    lineas: [{ ingrediente: 'VAINILLA', unidad: 'GR', cantidad: 10 }],
    esperado: { costoTotal: 0 },
  },
  {
    nombre: 'varios-lotes-y-tramos',
    regla: 'El costo se reparte por tramos, cada uno con su lote y su precio de compra.',
    lotes: [
      lote({ id: 'L110', ingrediente: 'HARINA', unidad: 'GR', pesoCompra: 300, costoCompra: 600, existencia: 300, vencimiento: '2026-07-10' }),
      lote({ id: 'L111', ingrediente: 'HARINA', unidad: 'KG', pesoCompra: 1, costoCompra: 4000, existencia: 1, vencimiento: '2026-08-10' }),
    ],
    lineas: [{ ingrediente: 'HARINA', unidad: 'GR', cantidad: 800 }],
    // 300 g a 2 $/g = 600; 500 g del kilo a 4 $/g = 2.000.
    esperado: { costoTotal: 2600 },
  },
];

/** Corre un caso con el nucleo actual. */
export function costearCaso(caso) {
  return costearPlan(caso.lineas, caso.lotes, HOY);
}

if (process.argv[1] && process.argv[1].endsWith('generar-casos-costeo.mjs')) {
  const casos = CASOS.map((caso) => ({
    nombre: caso.nombre,
    regla: caso.regla,
    hoy: HOY,
    lotes: caso.lotes,
    lineas: caso.lineas,
    esperado: caso.esperado,
    salida: costearCaso(caso),
  }));
  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, `${JSON.stringify({ version: 1, hoy: HOY, casos }, null, 2)}\n`, 'utf8');
  console.log(`${casos.length} casos escritos en db/pruebas/casos-costeo.json`);
}
