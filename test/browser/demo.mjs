// The tech demo on the built site: every dataset at its smallest size, every layer for each, a filter, playback and
// the benchmark, with no errors. Needs `npm run docs:build` first.
import { check, failed } from './harness.mjs';
import { serveSite, openSite } from './site.mjs';

const quick = process.argv.includes('--quick');
const site = await serveSite();
const { browser, context, errors, watch } = await openSite();
const page = await context.newPage();
watch(page);
await page.goto(site.url + 'demo?dataset=rides&size=0');
await page.waitForFunction(() => window.demo && window.demo.ready() && window.demo.stats.build !== undefined, null, { timeout: 120000 });

const settle = () =>
  page.waitForFunction(() => window.demo.ready() && !document.querySelector('.demo .busy'), null, { timeout: 180000 }).then(() => page.waitForTimeout(150));
const state = (patch) => page.evaluate((p) => Object.assign(window.demo.state, p), patch);
const info = () =>
  page.evaluate(() => ({
    layers: window.demo.map.getLayers().map((l) => l.id),
    objects: window.demo.map.getLayers().reduce((n, l) => n + l.count, 0),
    error: document.querySelector('.demo .error')?.textContent ?? '',
    rows: window.demo.stats.rows,
  }));

const ids = ['rides', 'flights', 'fleet', 'earthquakes', 'ships', 'districts', 'sql', 'graph'];
for (const id of ids) {
  // The smallest size.
  await page.evaluate((d) => window.demo.select(d, 0), id);
  await settle();
  const sizes = await page.evaluate(() => [...document.querySelectorAll('.demo .seg')[0].querySelectorAll('button')].map((b) => b.textContent));
  let r = await info();
  check(!r.error && r.layers.length > 0 && r.objects > 0, `${id}: ${r.objects} objects in ${r.layers.join(', ')} (${sizes.join(' ')})${r.error ? ` — ${r.error}` : ''}`);
  const layers = await page.evaluate(() => [...(document.querySelector('[data-test="layer"]')?.options ?? [])].map((o) => o.value));
  for (const kind of quick ? layers.slice(0, 2) : layers.slice(1)) {
    await state({ layer: kind });
    await settle();
    r = await info();
    check(!r.error && r.objects > 0, `${id} as ${kind}${r.error ? ` — ${r.error}` : ''}`);
  }
}

// A GPU filter and playback on the rides.
await page.evaluate(() => window.demo.select('rides', 0));
await settle();
await state({ layer: 'hexbin', filter: 'hour' });
await settle();
await state({ lo: 7, hi: 9 });
await page.waitForTimeout(300);
await state({ playing: true });
await page.waitForTimeout(1500);
const lo = await page.evaluate(() => window.demo.state.lo);
await state({ playing: false });
check(lo !== 7, `playback moves the hour filter (now ${lo.toFixed(2)})`);

// Trips playback.
await page.evaluate(() => window.demo.select('fleet', 0));
await settle();
await state({ playing: true });
await page.waitForTimeout(1500);
const playing = await page.evaluate(() => window.demo.map.getLayers()[0].animating);
await state({ playing: false });
check(playing, 'trips play');

// The benchmark.
await page.locator('[data-test="bench"]').click();
await page.waitForSelector('[data-test="bench-result"]', { timeout: 300000 });
check(/ms a frame/.test(await page.locator('[data-test="bench-result"]').textContent()), `benchmark: ${await page.locator('[data-test="bench-result"]').textContent()}`);

check(errors.length === 0, `no page or GPU errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
await browser.close();
site.close();
process.exit(failed() ? 1 : 0);
