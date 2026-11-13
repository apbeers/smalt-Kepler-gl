// Builds dist/: one ES module per entry point, the tile worker, and type declarations.
//   node scripts/build.mjs           the package
//   node scripts/build.mjs --minify  minified, for publishing
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { workerUrls } from './worker-urls.mjs';
import { ENTRIES, WORKERS } from './entries.mjs';

const minify = process.argv.includes('--minify');
rmSync('dist', { recursive: true, force: true });

const entries = { ...ENTRIES, ...WORKERS };

await esbuild.build({
  entryPoints: entries,
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  // No shared chunks: every entry sits next to the worker files its `new URL(…, import.meta.url)` names.
  plugins: [workerUrls({ 'tile-worker.js': 'smaltgl-tile-worker.js', 'worker.ts': 'smaltgl-data-worker.js' })],
  minify,
  sourcemap: true,
  logLevel: 'warning',
});

execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], { stdio: 'inherit' });
console.log(`built dist/ (${Object.keys(entries).length} entry points${minify ? ', minified' : ''})`);
