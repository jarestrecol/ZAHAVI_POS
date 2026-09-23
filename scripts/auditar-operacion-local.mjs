import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditarOperacionLocal } from './lib/auditoria-operacion.mjs';

const raiz = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const dentro = (base, destino) => { const r = path.relative(base, destino); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
try {
  const [archivo, ...args] = process.argv.slice(2);
  const opciones = {};
  if (!archivo || args.length % 2) throw new Error('uso: archivo.json --origen equipo [--salida informe.json]');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--origen', '--salida'].includes(args[i]) || opciones[args[i]] !== undefined) throw new Error('opciones_invalidas');
    opciones[args[i]] = args[i + 1];
  }
  const fuente = await realpath(archivo);
  const datos = await stat(fuente);
  if (!datos.isFile() || datos.size > 64 * 1024 * 1024) throw new Error('archivo_invalido_o_demasiado_grande');
  const informe = auditarOperacionLocal(await readFile(fuente, 'utf8'), opciones['--origen']);
  if (opciones['--salida']) {
    const propuesto = path.resolve(opciones['--salida']);
    const destino = path.join(await realpath(path.dirname(propuesto)), path.basename(propuesto));
    if (dentro(raiz, destino)) throw new Error('informe_debe_quedar_fuera_del_proyecto');
    await writeFile(destino, JSON.stringify(informe, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ conteos: informe.conteos, archivoHuella: informe.archivoHuella,
    bloqueos: informe.bloqueos, revisiones: informe.revisiones, listoParaImportar: false }));
  process.exitCode = informe.bloqueos ? 2 : 0;
} catch (e) {
  // No devolver rutas privadas, fragmentos de JSON ni datos del archivo.
  console.error(e.code ? `auditoria_error_${e.code}` : e.message);
  process.exitCode = 1;
}
