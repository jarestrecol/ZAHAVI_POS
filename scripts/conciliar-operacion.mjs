import { readFile, stat } from 'node:fs/promises';
import { conciliarOperacion } from './lib/conciliar-operacion.mjs';

async function leer(ruta) {
  const archivo = await stat(ruta);
  if (!archivo.isFile() || archivo.size > 64 * 1024 * 1024) throw new Error('tamano');
  return JSON.parse((await readFile(ruta, 'utf8')).replace(/^\uFEFF/, ''));
}
try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('uso');
  const [antes, despues] = await Promise.all(args.map(leer));
  const informe = conciliarOperacion(antes, despues);
  console.log(JSON.stringify(informe, null, 2));
  process.exitCode = informe.coincide ? 0 : 2;
} catch {
  // Ni rutas privadas ni fragmentos del JSON en mensajes de error.
  console.error('No se pudo conciliar. Usa dos capturas completas: node scripts/conciliar-operacion.mjs ANTES.json DESPUES.json');
  process.exitCode = 1;
}
