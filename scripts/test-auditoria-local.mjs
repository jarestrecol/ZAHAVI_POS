import assert from 'node:assert/strict';
import { auditarOperacionLocal as auditar } from './lib/auditoria-operacion.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base = () => ({ version: 1, operacionVersion: 1, secuencia: 0, lotes: [], planes: [], ejecuciones: [], eventos: [], notas: [], preparaciones: [], resultados: [] });
const lote = { id: 'l1', ingrediente: 'INGREDIENTE PRIVADO', unidad: 'GR', pesoCompra: 100, existencia: 50, costoCompra: 300 };
const ejecutar = d => auditar(JSON.stringify(d), 'equipo-prueba');
const d = base();
assert.equal(ejecutar(d).bloqueos, 0);
assert.equal(ejecutar(d).listoParaImportar, false);
assert.throws(() => auditar('{', 'equipo'), /json_invalido/);
assert.throws(() => ejecutar({ ...d, secreto: { access_token: 'no mostrar' } }), /credenciales/);
assert.notEqual(auditar(JSON.stringify(d), 'a').archivoHuella, auditar(JSON.stringify(d, null, 2), 'a').archivoHuella);
assert.equal(auditar(JSON.stringify(d), 'a').contenidoHuella, auditar(JSON.stringify(d, null, 2), 'a').contenidoHuella);
d.lotes.push(structuredClone(lote));
assert.equal(ejecutar(d).clasificacion.lotes.indeterminado, 1);
d.eventos.push({ id: 'e1', tipo: 'compra', despues: lote });
assert.equal(ejecutar(d).clasificacion.lotes.real_declarado, 1);
d.lotes[0].demo = { catalogo: 'prueba' };
assert.equal(ejecutar(d).clasificacion.lotes.mixto, 1);
d.lotes.push(structuredClone(lote));
assert.ok(ejecutar(d).hallazgos.some(h => h.codigo === 'identidad_duplicada'));
d.lotes = [];
d.ejecuciones.push({ id: 'p1', entradas: [{ recipe: { id: 'r1', componentes: [] }, factor: 1 }], costeo: {
  costoTotal: 12, lineas: [{ costo: 12, origen: [{ loteId: 'l1', cantidad: 4, costo: 12 }] }] } });
assert.equal(ejecutar(d).lotesHistoricosRetirados, 1);
assert.equal(ejecutar(d).bloqueos, 0);
d.lotes.push({ ...lote, costoCompra: 9999 });
assert.equal(ejecutar(d).conciliacion.costoHistoricoDeclarado, 12);
d.resultados.push({ produccionId: 'p1', recetaId: 'r1', vendible: 1, rechazado: 0 });
d.ejecuciones[0].entradas = {};
assert.ok(ejecutar(d).hallazgos.some(h => h.codigo === 'resultado_huerfano'));
d.ejecuciones[0].costeo.lineas[0].origen[0].loteId = 'inexistente';
assert.ok(ejecutar(d).hallazgos.some(h => h.codigo === 'lote_origen_no_encontrado'));
assert.ok(ejecutar({ version: 1, lotes: [] }).revisiones > 0);

const temporal = mkdtempSync(path.join(tmpdir(), 'zahavi-auditoria-'));
try {
  const archivo = path.join(temporal, 'respaldo.json');
  const crudo = JSON.stringify(d);
  writeFileSync(archivo, crudo);
  const cli = fileURLToPath(new URL('./auditar-operacion-local.mjs', import.meta.url));
  const correr = (...args) => spawnSync(process.execPath, [cli, archivo, '--origen', 'prueba', ...args], { encoding: 'utf8' });
  const resultado = correr();
  assert.equal(resultado.status, 2);
  assert.ok(!resultado.stdout.includes(lote.ingrediente));
  assert.equal(readFileSync(archivo, 'utf8'), crudo);
  assert.equal(correr('--salida', archivo).status, 1);
  assert.equal(readFileSync(archivo, 'utf8'), crudo);
  assert.equal(correr('--salida', fileURLToPath(new URL('../informe-prohibido.json', import.meta.url))).status, 1);
  assert.equal(correr('--salida', path.join(temporal, 'informe.json')).status, 2);
} finally {
  if (path.dirname(temporal) !== path.resolve(tmpdir()) || !path.basename(temporal).startsWith('zahavi-auditoria-')) throw new Error('ruta_temporal_insegura');
  rmSync(temporal, { recursive: true });
}
console.log('Auditoría local: estructura, procedencia, historial, privacidad y lectura intacta comprobados.');
