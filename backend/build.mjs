// build หลังบ้านเป็นไฟล์เดียวสำหรับ Apps Script แล้วสร้าง doGet/doPost แบบ global ที่ Apps Script เรียกได้
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'dist');

// ฟังก์ชันที่ต้องเรียกได้จาก Apps Script (web app และปุ่ม Run ใน editor)
const globals = ['doGet', 'doPost', 'checkScriptProperties', 'createFirstAdministrator'];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile: join(outDir, 'Code.js'),
  bundle: true,
  format: 'iife',
  globalName: 'App',
  target: 'es2019',
  charset: 'utf8',
  footer: {
    js: globals.map((name) => `function ${name}(e) { return App.${name}(e); }`).join('\n'),
  },
});

copyFileSync(join(here, 'appsscript.json'), join(outDir, 'appsscript.json'));
console.log('backend built →', outDir);
