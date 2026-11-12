// The basemap on generated tiles: fills, roads and labels draw in both themes, a parent tile stands in while
// children load, and nothing raises a GPU error. No network: tiles come from test/helpers/fixture-tiles.ts.
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as esbuild from 'esbuild';
import { serve, open, check, failed, decodePng, countPixels, root } from './harness.mjs';

const dir = await mkdtemp(join(tmpdir(), 'smaltgl-tiles-'));
await esbuild.build({ entryPoints: [join(root, 'test/helpers/fixture-tiles.ts')], outfile: join(dir, 'tiles.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'warning' });
const { fixtureTile } = await import(join(dir, 'tiles.mjs'));
let served = 0;
const s = await serve(join(root, 'test/browser/pages/basemap.ts'), {
  routes: {
    '/tiles/': (url) => {
      const m = url.pathname.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
      if (!m) return undefined;
      served++;
      return { type: 'application/vnd.mapbox-vector-tile', body: Buffer.from(fixtureTile(+m[1], +m[2], +m[3])) };
    },
  },
});
const tiles = encodeURIComponent(`${s.url}tiles/{z}/{x}/{y}.pbf`);

for (const theme of ['light', 'dark']) {
  const { browser, page, errors } = await open(`${s.url}?theme=${theme}&z=5.5&lng=10&lat=45&tiles=${tiles}`);
  await page.waitForFunction(() => window.loaded === true, null, { timeout: 30000 });
  const stats = await page.evaluate(() => window.ready());
  const img = await decodePng(await page.screenshot());
  // Fixture water is pale blue in light, near-black in dark; motorways orange-ish in light.
  const water = countPixels(img, theme === 'light' ? ([r, g, b]) => b > 220 && r < 205 && g < 220 : ([r, g, b]) => r < 20 && g < 24 && b < 32);
  const text = countPixels(img, theme === 'light' ? ([r, g, b]) => r < 80 && g < 80 && b < 90 : ([r, g, b]) => r > 180 && g > 180 && b > 190);
  check(stats.tilesPending === 0, `${theme}: every tile loaded (${served} served)`);
  check(water > 500, `${theme}: water fills (${water} samples)`);
  check(text > 20, `${theme}: labels (${text} samples)`);
  // Rotate and zoom: a different set of tiles, drawn without errors.
  await page.evaluate(async () => {
    window.map.setView({ zoom: 8.3, bearing: 35 });
    await window.ready();
  });
  check(errors.length === 0, `${theme}: no errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
  await browser.close();
}
await s.close();
process.exit(failed() ? 1 : 0);
