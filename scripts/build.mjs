// Builds dist/: one ES module per entry point, the tile worker, and type declarations.
//   node scripts/build.mjs           the package
//   node scripts/build.mjs --minify  minified, for publishing
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { workerUrls } from './worker-urls.mjs';

const minify = process.argv.includes('--minify');
rmSync('dist', { recursive: true, force: true });

const entries = {
  smaltgl: 'src/index.ts',
  core: 'src/core/index.ts',
  basemap: 'src/basemap/index.ts',
  layers: 'src/layers/index.ts',
  data: 'src/data/index.ts',
  datasets: 'src/datasets/index.ts',
  'smaltgl-tile-worker': 'src/basemap/tile-worker.ts',
  'smaltgl-data-worker': 'src/datasets/worker.ts',
};

await esbuild.build({
  entryPoints: entries,
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  // No shared chunks: every entry sits next to the worker files its `new URL(…, import.meta.url)` names.
  plugins: [workerUrls({ 'tile-worker.ts': 'smaltgl-tile-worker.js', 'worker.ts': 'smaltgl-data-worker.js' })],
  minify,
  sourcemap: true,
  logLevel: 'warning',
});

execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
console.log(`built dist/ (${Object.keys(entries).length} entry points${minify ? ', minified' : ''})`);
