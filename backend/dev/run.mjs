// build หลังบ้านจำลองด้วย esbuild แล้วรันบน Node
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = join(here, '..', '..', 'node_modules', '.cache', 'dev-api', 'server.mjs');

await build({
  entryPoints: [join(here, 'server.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'error',
});
await import(`file://${outfile.replace(/\\/g, '/')}`);
