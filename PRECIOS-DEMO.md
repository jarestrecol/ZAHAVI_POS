# Bodega de prueba Colombia · 22 de septiembre de 2026

En **Bodega → Cargar bodega demo Colombia completa** se preparan 159 ingredientes:
44 con una referencia de precio publicada, 113 con una estimación explícita y
2 aguas de proceso a costo cero. No son cotizaciones comerciales ni compras reales.
El catálogo completo, con presentación, COP, fuente y observación por ingrediente,
está en [precios-demo-colombia.json](data/precios-demo-colombia.json).

La carga incluye existencias para cinco tandas de cada receta del catálogo,
redondeadas a presentaciones completas. Precio de lote = precio de presentación ×
presentaciones; costo por gramo = precio de lote / gramos netos comprados.
Las cantidades se guardan en KG, GR, LT, ML, UND, TANDA o CM según la presentación.
Todas las fórmulas del recetario permanecen intactas.

Las fuentes públicas principales son [Todorapidas](https://todorapidas.com/es/categoria/insumos-panaderia),
[Dispropan Caribe](https://www.dispropancaribe.com/collections/productos-para-gastronomia),
[Lácteos Bomboná](https://www.tiendalacteosbombona.com/levapan/panaderia-y-reposteria/levadura/)
y [JRr Medellín](https://jrrmedellin.com/collections/all?constraint=bartender).
Las referencias de fruta de Agronet corresponden a mayo de 2026: sus valores se
clasifican como estimaciones, no como cotizaciones de septiembre. Los productos
agotados se identifican; no se afirma disponibilidad. No se suma transporte.

Los pesos de prueba son supuestos, separados del precio consultado: leche 1,03 g/ml,
aceite 0,92 g/ml, huevo 50 g/unidad, clara 30 g/unidad y yema 20 g/unidad, entre otros.
Cada factor ya registrado en Bodega prevalece sobre el supuesto demo. Si hay
factores contradictorios, la carga se detiene con el nombre del ingrediente.
El agua de proceso usa 1 ml ≈ 1 g y no descuenta inventario.

**Datos por revisar:** PAN CHALLA y PAN BRIOCHE contienen harina o mantequilla con
miles de UND. La demo usa paquetes de 1.000 g de harina y 500 g de mantequilla por
unidad salvo equivalencia existente. Esto produce consumos y costos muy grandes;
no se corrige la receta ni se interpreta silenciosamente que UND significa GR.
AGUA / LECHE supone mezcla 50/50. Los nombres genéricos y las preparaciones
internas tienen estimación, no un costeo de subreceta. Confirmar estas equivalencias
y productos antes de sacar conclusiones económicas reales.

En cada lote, **Referencia y pesos DEMO** muestra el precio por presentación,
su fuente, su clasificación y cuáles equivalencias se conservaron. Las compras
reales no se modifican. Si conviven con la demo, FEFO puede consumir ambas: revisar
la traza antes de confirmar producción. Esta función no crea un entorno aislado.
Los ejemplos antiguos sin correcciones manuales se sustituyen con trazabilidad.

**Retirar precios y lotes demo** retira únicamente los lotes de esta carga;
conserva compras reales, recetas y el historial con los costos ya confirmados.
No revierte producciones ni repone sus consumos. Solo gerencia y administración
pueden cargar o retirar la demo. La operación sigue siendo local al navegador.

Para probar: cargar la demo → Producción → día → Registrar producción → área →
cantidad propia de cada receta. Repetir Añadir/Sumar crea otra partida; Registradas
permite editar cada partida o el total de esa receta. Materiales suma gramos por
área o total; Costos muestra FEFO; Resultados del día permite revisar la salida real
después de confirmar. En ausencia de un navegador conectado, la carga debe hacerse
con el botón de Bodega en la sesión local del usuario.
