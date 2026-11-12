// The data layers in headless Chromium: each draws (counted by colour in a screenshot), picking returns the object
// under the pointer, and no layer raises a GPU validation error.
import { serve, open, check, failed, decodePng, countPixels, root } from './harness.mjs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const shots = process.env.LAYER_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const s = await serve(join(root, 'test/browser/pages/layers.ts'));
const { browser, page, errors } = await open(s.url);
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 }).catch((e) => { console.log(errors.join('\n')); throw e; });

const coloured = ([r, g, b]) => !(r > 245 && g > 245 && b > 245);
const expect = { scatter: 2000, heatmap: 2000, hexbin: 2000, grid: 2000, arcs: 1000, greatCircle: 300, paths: 1000, trips: 300, polygons: 5000, hexbin3d: 2000, polygons3d: 5000 };
for (const kind of Object.keys(expect)) {
  console.log(kind);
  await page.evaluate((k) => window.show(k), kind);
  const png = await page.screenshot();
  if (shots) await page.screenshot({ path: join(shots, `${kind}.png`) });
  const n = countPixels(await decodePng(png), coloured);
  check(n > expect[kind] / 4, `${kind} draws (${n} coloured samples)`);
}

// Picking: hover the centre of the polygon grid's middle square.
await page.evaluate((k) => window.show(k), 'polygons');
const picked = await page.evaluate(async () => {
  const hit = new Promise((r) => window.map.on('hover', r));
  const c = window.map.canvas;
  const r = c.getBoundingClientRect();
  const [x, y] = [r.width / 2 + 10, r.height / 2 - 10];
  c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x, clientY: r.top + y, bubbles: true }));
  return await Promise.race([hit, new Promise((res) => setTimeout(() => res('timeout'), 5000))]);
});
check(picked && picked !== 'timeout' && picked.layer === 'l' && typeof picked.properties.value === 'number', `hover picks a polygon (${JSON.stringify(picked)})`);

check(errors.length === 0, `no GPU or page errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
await browser.close();
await s.close();
process.exit(failed() ? 1 : 0);
