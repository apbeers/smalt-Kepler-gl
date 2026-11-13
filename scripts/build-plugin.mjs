// Builds dist/smaltbi-plugin.js: smaltgl's map visuals as one smaltbi plugin file with nothing to import, the tile
// worker inlined (smaltbi loads a plugin from a blob URL after checking its hash, so it can't fetch siblings).
//   node scripts/build-plugin.mjs [--out <file>]
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const argv = process.argv.slice(2);
const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'dist/smaltbi-plugin.js';

const worker = await esbuild.build({ entryPoints: ['src/basemap/tile-worker.ts'], bundle: true, format: 'esm', target: 'es2022', platform: 'browser', minify: true, write: false, logLevel: 'warning' });
const workerCode = worker.outputFiles[0].text;

const plugin = await esbuild.build({
  entryPoints: ['src/hosts/smaltbi.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  write: false,
  define: { __SMALTGL_TILE_WORKER__: JSON.stringify(workerCode) },
  legalComments: 'none',
  logLevel: 'warning',
});
const code = plugin.outputFiles[0].text;
if (/^\s*import[\s{*]/m.test(code) || /\bimport\(\s*['"]/.test(code)) throw new Error('The plugin must not import anything');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `// smaltgl map visuals for smaltbi (plugin API 1). MIT License. Built from github.com/apbeers/smalt-Kepler-gl.\n${code}`);
console.log(`built ${out} (${(code.length / 1024).toFixed(0)} KB, tile worker ${(workerCode.length / 1024).toFixed(0)} KB inlined)`);
