// smaltgl's smaltbi plugin, built (dist/smaltbi-plugin.js) and loaded the way smaltbi loads plugins: it registers
// its visuals, draws smaltbi-shaped data in the theme's colours, shows the host's selection, turns a click into
// smaltbi's select(row), and frees its map when smaltbi takes the frame out of the page.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, open, check, failed, decodePng, countPixels, root } from './harness.mjs';

const out = join(root, 'node_modules/.cache/smaltbi-plugin.js');
execFileSync(process.execPath, ['scripts/build-plugin.mjs', '--out', out], { cwd: root, stdio: 'inherit' });
const plugin = readFileSync(out);
check(!/^\s*import[\s{*]/m.test(plugin.toString()), `the plugin imports nothing (${(plugin.length / 1024).toFixed(0)} KB)`);

const s = await serve(join(root, 'test/browser/pages/smaltbi-host.ts'), { routes: { '/smaltbi-plugin.js': () => ({ type: 'text/javascript', body: plugin }) } });
const { browser, page, errors } = await open(s.url, { width: 800, height: 600 });
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 }).catch((e) => {
  console.log(errors.join('\n'));
  throw e;
});

const types = await page.evaluate(() => window.host.types());
check(['smaltgl.points', 'smaltgl.heatmap', 'smaltgl.hexbin', 'smaltgl.arcs', 'smaltgl.regions'].every((t) => types.includes(t)), `registers its visuals (${types.join(', ')})`);
const defs = await page.evaluate(() => window.host.defs());
check(defs.every((d) => d.selfInteractive && d.limit > 0), 'each is self-interactive with a row limit');

// Values use the theme's sequential ramp, which ends in #003399: the highest values are deep blue.
const deepBlue = ([r, g, b]) => b > 120 && r < 60 && g < 90;
check((await page.evaluate(() => window.host.points(400, null))) === 1, 'a points visual mounts once across renders');
const blue = countPixels(await decodePng(await page.screenshot()), deepBlue);
check(blue > 200, `draws in the theme's sequential colours (${blue} deep blue samples)`);

// The host's selection: rows 0–19 selected (the lowest values, pale), the rest dimmed.
await page.evaluate(() => window.host.points(400, Array.from({ length: 20 }, (_, i) => i)));
const dim = countPixels(await decodePng(await page.screenshot()), deepBlue);
check(dim < blue / 3, `selection dims the other rows (${dim} deep blue samples)`);

// A click on row 210's point: smaltbi's select(210, additive), additive with Ctrl.
const calls = await page.evaluate(() => window.host.clickRow(210));
const sel = calls.find((c) => c[0] === 'select');
check(!!sel && sel[1] === 210 && sel[2] === true, `a click selects its row (${JSON.stringify(calls)})`);

check((await page.evaluate(() => window.host.detach())) === 1, 'a frame taken out of the page frees its map');
check(errors.length === 0, `no errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
await browser.close();
await s.close();
process.exit(failed() ? 1 : 0);
