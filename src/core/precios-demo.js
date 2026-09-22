/** Referencias públicas consultadas el 22/09/2026. Solo para demostración.
 * Los pesos netos propuestos NO son mediciones del negocio ni modifican recetas.
 */
import { consolidar } from './plan.js';
import { factorGramos, esAguaDeProceso } from './conversiones.js';
import { claveDe, normalizarLote } from './almacen.js';

export const VERSION_DEMO = 'colombia-2026-09-22';
export const FUENTES_DEMO = Object.freeze({
  pan: 'https://todorapidas.com/es/categoria/insumos-panaderia',
  gastronomia: 'https://www.dispropancaribe.com/collections/productos-para-gastronomia',
  frutos: 'https://www.dispropancaribe.com/collections/frutos-secos',
  secos: 'https://www.dispropancaribe.com/collections/frutas-deshidratadas',
  semillas: 'https://www.dispropancaribe.com/collections/semillas',
  conservantes: 'https://www.dispropancaribe.com/collections/conservantes',
  crema: 'https://www.dispropancaribe.com/collections/crema-de-leche',
  esencias: 'https://www.dispropancaribe.com/collections/esencias',
  harinas: 'https://www.dispropancaribe.com/collections/harinas',
  cocoa: 'https://www.dispropancaribe.com/collections/cocoa',
  gelatina: 'https://www.dispropancaribe.com/collections/gelatinas',
  condensada: 'https://www.dispropancaribe.com/collections/all/1-categoria_productos-para-reposteria?page=11',
  levadura: 'https://www.tiendalacteosbombona.com/levapan/panaderia-y-reposteria/levadura/',
  tegral: 'https://www.dispropancaribe.com/collections/premezclas-reposteria/1-categoria_productos-para-reposteria',
  agraz: 'https://www.momorganics.co/frutas/agraz-detail',
  licores: 'https://jrrmedellin.com/collections/all?constraint=bartender',
  frutas: 'https://agronet.gov.co/sites/default/files/2026-05/Bogot%C3%A1%2C%20D.C.%2C%20Corabastos-13-05-2026.pdf',
});

// Nombre(s), COP por presentación, cantidad, medida, fuente, tipo, observación.
// «estimado» nunca se presenta como precio encontrado. No incluye transporte.
const referencias = [
  ['HARINA DE TRIGO', 58732, 25, 'KG', 'pan', 'publicado', 'San Miguel, bulto de 25 kg.'],
  ['HARINA TORTA', 12000, 2.5, 'KG', 'harinas', 'publicado', 'Elite para tortas.'],
  ['HARINA INTEGRAL', 11500, 2.5, 'KG', 'harinas', 'publicado', 'Vitalbran integral.'],
  ['HARINA AMARILLA', 3600, 1, 'KG', 'harinas', 'publicado', 'P.A.N amarilla; publicada como agotada.'],
  ['HARINA DE CENTENO', 14000, 1, 'KG', 'harinas', 'estimado', 'Harina especial; sin cotización comparable.'],
  ['AZÚCAR|AZÚCAR ( ALMENDRAS )|AZÚCAR ( CLARAS )|AZÚCAR ( YEMAS )', 4500, 1, 'KG', 'pan', 'estimado', 'Azúcar blanca; precio redondeado de prueba.'],
  ['AZÚCAR MORENA', 5500, 1, 'KG', 'pan', 'estimado', 'Azúcar morena; confirmar proveedor.'],
  ['AZÚCAR PULVERIZADA', 3920, 500, 'GR', 'pan', 'publicado', 'Manuelita.'],
  ['BICARBONATO', 4585, 500, 'GR', 'pan', 'publicado', 'Presentación de 500 g.'],
  ['AREQUIPE', 66867, 5, 'KG', 'pan', 'publicado', 'Tory milhoja.'],
  ['BUTTER CREAM', 14448, 500, 'GR', 'pan', 'publicado', 'Las Masas del Chef; producto comparable.'],
  ['HUEVOS', 16500, 30, 'UND', 'gastronomia', 'publicado', 'Kikes AA; peso neto demo 50 g/unidad.'],
  ['CLARAS DE HUEVO|HUEVOS ( CLARAS )', 9900, 30, 'UND', 'gastronomia', 'estimado', 'Asignación demo del 60% del costo del huevo; 30 g por clara.'],
  ['YEMAS DE HUEVO|HUEVOS ( YEMAS )', 6600, 30, 'UND', 'gastronomia', 'estimado', 'Asignación demo del 40% del costo del huevo; 20 g por yema.'],
  ['MANTEQUILLA', 29500, 500, 'GR', 'gastronomia', 'publicado', 'Alpina sin sal. UND se representa como paquete de 500 g en la demo: revisar recetas con miles de UND.'],
  ['QUESO CREMA', 88000, 4, 'KG', 'gastronomia', 'publicado', 'Colanta.'],
  ['ACEITE VEGETAL', 13500, 900, 'ML', 'gastronomia', 'publicado', 'Girasol Z; densidad demo 0,92 g/ml.'],
  ['CANELA', 6000, 60, 'GR', 'gastronomia', 'publicado', 'Canela en polvo.'],
  ['NUEZ MOSCADA', 11000, 60, 'GR', 'gastronomia', 'publicado', 'Molida; publicada como agotada.'],
  ['CLAVOS', 12000, 60, 'GR', 'gastronomia', 'publicado', 'Clavo molido.'],
  ['JENGIBRE', 5000, 50, 'GR', 'gastronomia', 'publicado', 'Referencia en polvo; confirmar forma usada en receta.'],
  ['ALMENDRAS', 25000, 500, 'GR', 'frutos', 'publicado', 'Almendra entera.'],
  ['NOGAL', 48000, 1, 'KG', 'frutos', 'estimado', 'Presentación de la oferta no confirmada; estimación demo.'],
  ['CRAMBERRIES', 17000, 500, 'GR', 'secos', 'publicado', 'Arándano deshidratado. Se conserva la ortografía del recetario.'],
  ['CIRUELAS', 12500, 500, 'GR', 'secos', 'publicado', 'Ciruela seca sin carozo.'],
  ['COCO DESHIDRATADO', 17500, 500, 'GR', 'secos', 'publicado', 'Coco sin azúcar.'],
  ['DATILES', 26000, 1, 'KG', 'secos', 'estimado', 'Oferta desde un importe, peso no confirmado.'],
  ['PASAS|UVAS PASAS', 18000, 1, 'KG', 'secos', 'estimado', 'Pasas secas, estimación de prueba.'],
  ['AJONJOLI|SEMILLA DE AJONJOLI', 9500, 500, 'GR', 'semillas', 'publicado', 'Ajonjolí descortezado.'],
  ['AMAPOLA|SEMILLAS DE AMAPOLA', 38000, 500, 'GR', 'semillas', 'publicado', 'Prodelagro.'],
  ['CHIA|SEMILLA DE CHIA', 19000, 500, 'GR', 'semillas', 'publicado', 'Prodelagro.'],
  ['GIRASOL|SEMILLA DE GIRASOL', 13000, 500, 'GR', 'semillas', 'publicado', 'Salugran.'],
  ['LINAZA', 7500, 500, 'GR', 'semillas', 'publicado', 'Salugran.'],
  ['SEMILLA DE QUINUA', 13500, 500, 'GR', 'semillas', 'publicado', 'Salugran.'],
  ['SEMILLA DE CEBADA PERLADA|SEMILLA DE TRIGO', 9000, 1, 'KG', 'semillas', 'estimado', 'Cereal para panadería; referencia de familia.'],
  ['SEMILLA DE MINJO|SEMILLA DE MIYO', 14000, 1, 'KG', 'semillas', 'estimado', 'Nombre comercial pendiente de confirmar; supuesto demo de mijo.'],
  ['ANTIMOHO', 45000, 1, 'KG', 'conservantes', 'publicado', 'RO-MO-NO.'],
  ['CRÉMOR TÁRTARO ( LIMÓN )', 15000, 500, 'GR', 'conservantes', 'publicado', 'Referencia de crémor tártaro; no se sustituye por limón.'],
  ['CREMA DE LECHE', 22000, 1, 'LT', 'crema', 'publicado', 'Parmalat; densidad demo 1 g/ml.'],
  ['CREMA BASE', 19000, 1, 'LT', 'crema', 'estimado', 'Referencia comparable: Versatié. Confirmar qué base usa el negocio.'],
  ['VAINILLA|ESENCIA DE VAINILLA|ESCENCIA DE ALMENDRA', 18500, 500, 'ML', 'esencias', 'estimado', 'Precio de esencia Levapan; sabor específico no confirmado.'],
  ['COLOR ROJO ( COLORANTE JG )', 10000, 30, 'GR', 'esencias', 'estimado', 'Gel rojo; marca/presentación JG no encontrada.'],
  ['CACAO', 15000, 200, 'GR', 'cocoa', 'publicado', 'Cacao en polvo sin azúcar.'],
  ['COCOA', 66000, 1, 'KG', 'cocoa', 'publicado', 'Corona.'],
  ['GELATINA SIN SABOR', 23000, 500, 'GR', 'gelatina', 'publicado', 'Gelco.'],
  ['LECHE CONDENSADA', 58000, 5, 'KG', 'condensada', 'publicado', 'La Vaquita.'],
  ['LEVADURA', 6500, 500, 'GR', 'levadura', 'publicado', 'Levapan fresca. La receta no especifica fresca/seca: supuesto demo.'],
  ['TEGRAL BISCUIT', 68000, 5, 'KG', 'tegral', 'publicado', 'Biscuit Plus; publicado como agotado.'],
  ['AGRAZ', 12000, 250, 'GR', 'agraz', 'publicado', 'Agraz fresco.'],
  ['LICOR DE AMARETTO', 45500, 1, 'LT', 'licores', 'publicado', 'Bartender.'],
  ['TRIPLE SECO', 45500, 1, 'LT', 'licores', 'publicado', 'Bartender.'],
  ['WHISKEY', 82000, 1, 'LT', 'licores', 'publicado', 'Bartender.'],
  ['LICOR DE CACAO|LICOR', 50000, 1, 'LT', 'licores', 'estimado', 'Licor genérico de repostería; tipo/marca pendientes.'],
  ['VINO DULCE', 22000, 750, 'ML', 'licores', 'estimado', 'Vino para repostería.'],
  ['BANANOS', 2500, 1, 'KG', 'frutas', 'estimado', 'Referencia mayorista mayo 2026; precio demo redondeado.'],
  ['FRESAS', 13000, 1, 'KG', 'frutas', 'estimado', 'Referencia mayorista mayo 2026, no cotización actual.'],
  ['GUANÁBANA', 6000, 1, 'KG', 'frutas', 'estimado', 'Referencia mayo 2026 de fruta entera; confirmar pulpa/rendimiento.'],
  ['GUAYABA', 6400, 1, 'KG', 'frutas', 'estimado', 'Referencia mayo 2026; redondeo de canastilla.'],
  ['MORA', 6700, 1, 'KG', 'frutas', 'estimado', 'Referencia mayo 2026; redondeo de caja.'],
  ['ARANDANOS', 7000, 125, 'GR', 'frutas', 'estimado', 'Fruta fresca, referencia mayorista mayo 2026.'],
  ['MANZANAS', 1800, 1, 'UND', 'frutas', 'estimado', '200 g netos por unidad solo para prueba.'],
  ['LIMONES', 4000, 1, 'KG', 'frutas', 'estimado', 'Fruta entera, redondeo demo.'],
  ['NARANJA EN JUGO', 8000, 1, 'LT', 'frutas', 'estimado', 'Jugo exprimido; 1 ml=1,04 g; 1 naranja aporta 100 g de jugo, solo demo.'],
  ['BREVAS', 12000, 1, 'KG', 'frutas', 'estimado', 'Precio demo, presentación fresca supuesta.'],
  ['PIÑA', 5000, 1, 'KG', 'frutas', 'estimado', 'Precio demo de pulpa limpia.'],
  ['UCHUVAS', 12000, 1, 'KG', 'frutas', 'estimado', 'Precio demo de fruta limpia.'],
  ['FRUTOS ROJOS', 18000, 1, 'KG', 'frutas', 'estimado', 'Mezcla demo, composición no especificada.'],
  ['ZANAHORIA', 3000, 1, 'KG', 'frutas', 'estimado', 'Precio demo redondeado.'],
  ['CILANTRO', 1500, 100, 'GR', 'frutas', 'estimado', 'Hierba fresca; estimación.'],
  ['ESPINACA', 5000, 500, 'GR', 'frutas', 'estimado', 'Hoja fresca; estimación.'],
  ['CHAMPIÑONES', 10000, 250, 'GR', '', 'estimado', 'Sin precio colombiano comparable verificado.'],
  ['TOMATES SECOS', 18000, 250, 'GR', '', 'estimado', 'Sin precio colombiano comparable verificado.'],
  ['SAL', 2500, 1, 'KG', '', 'estimado', 'Sal refinada; estimación demo.'],
  ['ARROZ', 4500, 1, 'KG', '', 'estimado', 'Arroz blanco; estimación demo.'],
  ['AVENA', 6000, 500, 'GR', '', 'estimado', 'Avena en hojuelas; estimación demo.'],
  ['ALMIDON|FÉCULA|MAICENA', 12000, 1, 'KG', '', 'estimado', 'Almidón alimentario; confirmar origen (maíz/yuca).'],
  ['LECHE', 4500, 1, 'LT', '', 'estimado', 'Leche entera; densidad demo 1,03 g/ml.'],
  ['LECHE EN POLVO', 36000, 1, 'KG', '', 'estimado', 'Leche entera en polvo; estimación demo.'],
  ['CREMA AGRIA', 13000, 500, 'GR', '', 'estimado', 'Estimación demo.'],
  ['YOGURT', 12000, 1, 'LT', '', 'estimado', 'Natural; densidad demo 1,03 g/ml.'],
  ['QUESO CAMPESINO|QUESO CAMPESINO ( RALLADO )', 23000, 1, 'KG', 'gastronomia', 'estimado', 'Queso fresco; precio demo.'],
  ['QUESO CUAJADA', 19000, 1, 'KG', 'gastronomia', 'estimado', 'Cuajada; precio demo.'],
  ['QUESO MOZZARELLA', 30000, 1, 'KG', 'gastronomia', 'estimado', 'Mozzarella; precio demo.'],
  ['MARGARINA', 70825, 15, 'KG', 'pan', 'publicado', 'Rendipan; publicada como agotada.'],
  ['POLVO DE HORNEAR', 18000, 1, 'KG', '', 'estimado', 'Sin precio comparable verificado.'],
  ['CHOCOLATE 70%', 90000, 1, 'KG', 'cocoa', 'estimado', 'Cobertura industrial 70%; no se usa precio de chocolatina al detal.'],
  ['CHOCOLATE BLANCO', 48000, 1, 'KG', 'cocoa', 'estimado', 'Cobertura blanca.'],
  ['CHIPS DE CHOCOLATE|CHOCOLATE CHUNKS', 42000, 1, 'KG', 'cocoa', 'estimado', 'Chocolate para hornear; porcentaje sin especificar.'],
  ['CHOCOLYNE', 48000, 1, 'KG', 'cocoa', 'estimado', 'Marca/producto exactos pendientes; valor de prueba.'],
  ['MANTECA DE CACAO', 95000, 1, 'KG', 'cocoa', 'estimado', 'Manteca alimentaria, sin cotización comparable.'],
  ['CAFÉ SOLUBLE', 26000, 200, 'GR', '', 'estimado', 'Café instantáneo; estimación demo.'],
  ['CAFÉ LIQUIDO', 5000, 1, 'LT', '', 'estimado', 'Preparación interna estimada, 1 g/ml; no compra real.'],
  ['ANIS', 6000, 100, 'GR', 'gastronomia', 'estimado', 'Semilla de anís, no licor.'],
  ['CARDAMOMO', 18000, 100, 'GR', 'gastronomia', 'estimado', 'Especia molida; estimación demo.'],
  ['PIMIENTA DULCE|PIMIENTA|ESPECIAS', 7000, 100, 'GR', 'gastronomia', 'estimado', 'Especia/mezcla; composición pendiente.'],
  ['SPLENDA|ESPLENDA', 28000, 100, 'GR', '', 'estimado', 'Edulcorante granulado; no asumir equivalencia de dulzor.'],
  ['GLUCOSA', 14000, 1, 'KG', '', 'estimado', 'Jarabe de glucosa, estimación demo.'],
  ['MALTO DEXTRINA', 12000, 1, 'KG', 'conservantes', 'estimado', 'Proveedor exige cotización; valor demo.'],
  ['POLI DEXTROSA', 20000, 1, 'KG', '', 'estimado', 'Polidextrosa alimentaria; valor demo redondeado.'],
  ['EMULSIFICANTE', 22000, 1, 'KG', '', 'estimado', 'Emulsificante de pastelería; confirmar producto.'],
  ['OTENTI', 60000, 1, 'KG', '', 'estimado', 'Nombre del recetario; supuesto O-tentic, sin cotización colombiana comparable.'],
  ['DUBOR', 35000, 1, 'LT', '', 'estimado', 'Desmoldante alimentario; densidad demo 0,92 g/ml.'],
  ['MIEL', 25000, 1, 'KG', '', 'estimado', 'Miel de abejas; estimación demo.'],
  ['MIEL MAPLE', 45000, 500, 'GR', '', 'estimado', 'Maple, no sustituto de sabor maple; estimación.'],
  ['MELASA', 9000, 1, 'KG', '', 'estimado', 'Melaza; estimación.'],
  ['VINAGRE BLANCO', 4000, 1, 'LT', '', 'estimado', 'Vinagre alimentario; 1 g/ml demo.'],
  ['NUTELLA', 28000, 350, 'GR', '', 'estimado', 'Sin cotización comparable verificada.'],
  ['BOCADILLO DE GUAYABA', 14000, 1, 'KG', '', 'estimado', 'Pasta de guayaba; estimación.'],
  ['CEREZAS', 25000, 500, 'GR', '', 'estimado', 'Cereza para repostería en conserva, peso neto supuesto.'],
  ['POLLO', 22000, 1, 'KG', '', 'estimado', 'Pechuga deshuesada, peso neto supuesto.'],
  ['TOCINETA', 38000, 1, 'KG', '', 'estimado', 'Estimación demo.'],
  ['PAPEL PARAFINADO', 10000, 1000, 'CM', '', 'estimado', 'Rollo de 10 m; ancho no especificado, 0,1 g/cm solo demo.'],
  ['MEZCLA ALMOJÁBANA', 16000, 1, 'KG', '', 'estimado', 'Premezcla comercial estimada.'],
  ['ALMOJÁBANA', 24000, 1, 'KG', '', 'estimado', 'Preparación terminada estimada.'],
  ['ALMÍBAR|QUEMADO DE PANELA|TINTURA DE CARAMELO', 6000, 1, 'KG', 'pan', 'estimado', 'Preparación interna estimada; no costo derivado de subreceta.'],
  ['CREMA PASTELERA|CREMA CAFÉ', 16000, 1, 'KG', 'crema', 'estimado', 'Preparación interna estimada; no costo derivado de subreceta.'],
  ['GANACHE CHERO', 40000, 1, 'KG', 'cocoa', 'estimado', 'Preparación interna estimada; composición pendiente.'],
  ['MASA MADRE|POOLISH', 3000, 1, 'TANDA', 'pan', 'estimado', 'Tanda demo de 1000 g; preparación interna.'],
  ['BIZCOCHUELO DESMENUZADO|GALLETA TRITURADA|MIGAS', 14000, 1, 'KG', 'pan', 'estimado', 'Preparación interna estimada; no doble descuento de subreceta.'],
  ['CONFITURA DE NARANJA|NARANJA CONFITADA|SALSA DE FRUTOS ROJOS', 18000, 1, 'KG', 'frutas', 'estimado', 'Preparación interna estimada.'],
  ['PULPA DE FRUTA', 14000, 1, 'KG', 'frutas', 'estimado', 'Fruta no especificada; estimación.'],
  ['JUGO DE LIMÓN', 12000, 1, 'LT', 'frutas', 'estimado', 'Jugo exprimido; rendimiento demo.'],
  ['CASCARA DE NARANJA|RALLADURA DE NARANJA|RALLADURA DE LIMÓN', 20000, 1, 'KG', 'frutas', 'estimado', 'Subproducto; asignación demo de costo, no costo de fruta completo.'],
  ['AGUA / LECHE', 2250, 1, 'LT', '', 'estimado', 'Mezcla demo 50/50: supuesto visible, receta intacta; 1,015 g/ml.'],
  ['HIELO', 3000, 1, 'KG', '', 'estimado', 'Hielo comprado; el agua de proceso tiene otro tratamiento.'],
  ['AGUA|AGUA ( CALIENTE )', 0, 1, 'LT', '', 'servicio', 'Agua de proceso, sin compra ni descuento de bodega.'],
];

const clave = (nombre) => claveDe(nombre, 'GR');
export const PRECIOS_DEMO = Object.freeze(referencias.flatMap(([nombres, precio, cantidad, unidad, fuente, tipo, nota]) =>
  nombres.split('|').map((ingrediente) => Object.freeze({ ingrediente, precio, cantidad, unidad, tipo, nota,
    fuente: FUENTES_DEMO[fuente] || '', fecha: '2026-09-22', moneda: 'COP' }))));

export function referenciaDemo(nombre) {
  return PRECIOS_DEMO.find((r) => clave(r.ingrediente) === clave(nombre)) || {
    ingrediente: nombre, precio: 20000, cantidad: 1, unidad: 'KG', tipo: 'estimado', fuente: '',
    fecha: '2026-09-22', moneda: 'COP', nota: 'Ingrediente adicional de bodega sin referencia: valor genérico exclusivamente demo.',
  };
}

export function esLoteDemo(lote) { return lote?.demo?.catalogo === VERSION_DEMO; }

function pesosDemo(nombre) {
  const n = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const ml = /ACEITE|DUBOR/.test(n) ? 0.92 : n === 'LECHE' || n === 'YOGURT' ? 1.03
    : n === 'AGUA / LECHE' ? 1.015 : /NARANJA EN JUGO/.test(n) ? 1.04 : /LICOR|WHISKEY|VINO|TRIPLE/.test(n) ? 0.95 : 1;
  const und = /CLARAS/.test(n) ? 30 : /YEMAS/.test(n) ? 20 : n === 'HUEVOS' ? 50 : n === 'MANZANAS' ? 200
    : n === 'MANTEQUILLA' ? 500 : n === 'HARINA DE TRIGO' ? 1000 : n === 'RALLADURA DE NARANJA' ? 5
      : n === 'NARANJA EN JUGO' ? 100 : undefined;
  const liquido = /ACEITE|DUBOR|LECHE|YOGURT|AGUA|JUGO|VAINILLA|ESENCIA|ESCENCIA|LICOR|WHISKEY|VINO|TRIPLE|VINAGRE|CAFE LIQUIDO|CREMA BASE/.test(n);
  return { ...(liquido ? { ML: ml } : {}), ...(und ? { UND: und } : {}),
    ...(/^(MASA MADRE|POOLISH)$/.test(n) ? { TANDA: 1000 } : {}), ...(n === 'PAPEL PARAFINADO' ? { CM: 0.1 } : {}) };
}

/** Un lote por ingrediente; cobertura de cinco tandas de todo el recetario.
 * Mantiene los factores previamente registrados. Ambigüedad real => rechazo explícito.
 */
export function prepararLotesDemo(recetas, existentes, hoy) {
  const demanda = consolidar(recetas.map((recipe) => ({ recipe, factor: 5 })));
  const nombres = new Set([...PRECIOS_DEMO.map((r) => r.ingrediente), ...demanda.lineas.map((l) => l.ingrediente), ...existentes.map((l) => l.ingrediente)]);
  return [...nombres].map((nombre) => {
    const ref = referenciaDemo(nombre), propios = existentes.filter((l) => clave(l.ingrediente) === clave(nombre));
    const equivalencias = pesosDemo(nombre), conservadas = [];
    for (const u of ['ML', 'UND', 'TANDA', 'CM']) {
      const valores = [...new Set(propios.flatMap((l) => l.equivalencias?.[u] ? [l.equivalencias[u]] : []))];
      if (valores.length > 1) throw new Error(`${nombre}: hay equivalencias distintas de ${u} en Bodega. Unifícalas antes de cargar la demo.`);
      if (valores.length === 1) { equivalencias[u] = valores[0]; conservadas.push(u); }
    }
    const gramos = demanda.lineas.filter((l) => clave(l.ingrediente) === clave(nombre)).reduce((s, l) => {
      const f = factorGramos(l.unidad, equivalencias);
      if (f === null) throw new Error(`${nombre}: falta el peso demo de ${l.unidad}.`);
      return s + l.cantidad * f;
    }, 0);
    const pesoPresentacion = factorGramos(ref.unidad, equivalencias) * ref.cantidad;
    const paquetes = Math.max(1, Math.ceil(gramos / pesoPresentacion));
    const lote = normalizarLote({ id: '', ingrediente: nombre, marca: 'DEMO · ' + ref.tipo,
      proveedor: 'DEMO Colombia · ' + (ref.fuente ? new URL(ref.fuente).hostname : 'estimación interna'),
      fechaCompra: hoy, presentacion: ref.tipo === 'servicio' ? 'SERVICIO SIN COMPRA' : ref.unidad === 'TANDA' ? 'TANDA' : 'PAQUETE',
      pesoCompra: ref.cantidad * paquetes, existencia: ref.cantidad * paquetes,
      unidad: ref.unidad, equivalencias, costoCompra: ref.precio * paquetes,
      lote: VERSION_DEMO, vencimiento: '', registrado: new Date().toISOString() });
    lote.demo = { catalogo: VERSION_DEMO, ...ref, conservadas, paquetes,
      notaPesos: 'Pesos de prueba, salvo equivalencias conservadas de Bodega: ' + (conservadas.join(', ') || 'ninguna') };
    // Agua visible como servicio, nunca se consume ni participa en FEFO.
    if (esAguaDeProceso(nombre)) lote.demo.tipo = 'servicio';
    return lote;
  });
}
