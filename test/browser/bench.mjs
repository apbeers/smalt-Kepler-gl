// Frame times for each layer at growing sizes, in headless Chromium.
//   node test/browser/bench.mjs           small sizes (minutes on a software GPU)
//   node test/browser/bench.mjs --full    up to 10M rows (run it on a machine with a GPU, headed: --headed)
// Headless runs draw with SwiftShader, a GPU on the CPU: use the numbers to compare changes, not as speeds to quote.
// For real hardware, use the tech demo's Benchmark button.
import { join } from 'node:path';
import { serve, open, root } from './harness.mjs';

const full = process.argv.includes('--full');
const plan = [
  ['scatter', full ? [100_000, 1_000_000, 10_000_000] : [10_000, 100_000]],
  ['heatmap', full ? [100_000, 1_000_000, 10_000_000] : [10_000, 100_000]],
  ['hexbin', full ? [100_000, 1_000_000, 10_000_000] : [10_000, 100_000]],
  ['arcs', full ? [10_000, 100_000, 500_000] : [1_000, 5_000]],
  ['trips', full ? [100, 1_000, 5_000] : [50, 200]],
];
const s = await serve(join(root, 'test/browser/pages/bench.ts'));
const { browser, page, errors } = await open(s.url, { width: 1280, height: 800, headed: process.argv.includes('--headed') });
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const fmt = (n) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'));
console.log('| Layer | Rows | Objects | Generate ms | First frame ms | Frame ms |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const [kind, sizes] of plan)
  for (const n of sizes) {
    const r = await page.evaluate(([k, rows]) => window.bench(k, rows), [kind, n]);
    console.log(`| ${kind} | ${n.toLocaleString('en-US')} | ${r.objects.toLocaleString('en-US')} | ${fmt(r.generated)} | ${fmt(r.first)} | ${fmt(r.perFrame)} |`);
  }
if (errors.length) console.log(errors.join('\n'));
await browser.close();
await s.close();
process.exit(errors.length ? 1 : 0);
