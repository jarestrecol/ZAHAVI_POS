import assert from 'node:assert/strict';
import { crearOperacionRemota } from '../src/core/operacion-remota.js';

const solicitud = () => ({ id: '11111111-1111-4111-8111-111111111111', accion: 'confirmar', revision: 2, datos: { recetaId: 'R001' } });
const respuesta = (status, datos = { version: 1 }) => ({ ok: true, value: { status, datos } });
const llamadas = [], renovaciones = [];
const configurar = solicitar => crearOperacionRemota({ lectura: 'operacion_leer', comando: 'operacion_comando',
  token: async renovar => { renovaciones.push(renovar); return { ok: true, value: 'token-prueba' }; },
  solicitar: async (...args) => { llamadas.push(args); return solicitar(...args); } });
let intentos = 0;
let api = configurar(async () => ++intentos === 1 ? respuesta(401) : respuesta(200));
const original = solicitud();
const promesa = api.ejecutar(original);
original.datos.recetaId = 'R999';
assert.equal((await promesa).ok, true);
assert.deepEqual(renovaciones, [false, true]);
assert.equal(llamadas.length, 2);
assert.deepEqual(llamadas[0][1].body, llamadas[1][1].body);
assert.equal(llamadas[1][1].body.p_solicitud.datos.recetaId, 'R001');
assert.equal(llamadas[0][0], '/rest/v1/rpc/operacion_comando');
llamadas.length = 0;
api = configurar(async () => { throw new Error('detalle interno privado'); });
assert.equal((await api.ejecutar(solicitud())).code, 'confirmacion_pendiente');
assert.equal(llamadas.length, 1, 'No reintentar una escritura automáticamente tras perder conexión');
assert.equal((await api.leer({ fecha: '2026-09-22' })).code, 'sin_conexion');
for (const [status, codigo] of [[403, 'sin_permiso'], [409, 'conflicto'], [500, 'confirmacion_pendiente'], [401, 'revocada']]) {
  api = configurar(async () => respuesta(status));
  assert.equal((await api.ejecutar(solicitud())).code, codigo);
}
api = configurar(async () => respuesta(200, []));
assert.equal((await api.ejecutar(solicitud())).code, 'confirmacion_pendiente');
assert.equal((await api.leer({})).code, 'servidor');
// Los errores 4xx llegan con el mensaje que redacta el servidor, y la validación no es incierta.
for (const [status, codigo] of [[422, 'invalida'], [404, 'no_existe']]) {
  api = configurar(async () => respuesta(status, { code: codigo, message: 'Mensaje del servidor.' }));
  const r = await api.ejecutar(solicitud());
  assert.equal(r.code, codigo);
  assert.equal(r.message, 'Mensaje del servidor.');
}
api = configurar(async () => respuesta(409, { code: 'solicitud_reutilizada', message: 'Ya usada.' }));
assert.equal((await api.ejecutar(solicitud())).code, 'solicitud_reutilizada');
llamadas.length = 0;
assert.equal((await api.ejecutar({ ...solicitud(), id: 'otro' })).code, 'solicitud');
assert.equal(llamadas.length, 0);
assert.throws(() => crearOperacionRemota({ lectura: '../lotes', comando: 'c' }), /Contrato/);
api = crearOperacionRemota({ lectura: 'leer', comando: 'comando', token: async () => ({ ok: false, code: 'turno' }),
  solicitar: async () => { throw new Error('No debe ejecutarse'); } });
assert.equal((await api.ejecutar(solicitud())).code, 'turno');
console.log('Cliente remoto: sesión, conflictos, identidad estable, respuesta incierta y ausencia de reintento de red comprobados.');
