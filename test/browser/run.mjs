// The browser tests, in order: the layers on their own, then the built site's examples and tech demo.
//   node test/browser/run.mjs           everything (builds the site first)
//   node test/browser/run.mjs --quick   fewer layer switches in the demo
import { execFileSync } from 'node:child_process';
const run = (file, ...args) => execFileSync(process.execPath, [file, ...args], { stdio: 'inherit' });
const quick = process.argv.includes('--quick') ? ['--quick'] : [];
run('test/browser/smoke.mjs');
run('test/browser/layers.mjs');
run('test/browser/basemap.mjs');
run('test/browser/smaltbi.mjs');
execFileSync(process.execPath, ['node_modules/vitepress/bin/vitepress.js', 'build', 'docs'], { stdio: 'inherit' });
run('test/browser/docs.mjs');
run('test/browser/demo.mjs', ...quick);
