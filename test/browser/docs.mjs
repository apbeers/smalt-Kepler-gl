// Every runnable example in the docs, run on the built site: each must finish without an error, and draw its layers
// without a GPU validation error. Needs `npm run docs:build` first (test/browser/run.mjs does it).
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { root, check, failed } from './harness.mjs';
import { serveSite, openSite } from './site.mjs';

async function pagesWithExamples(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.')) out.push(...(await pagesWithExamples(p)));
    else if (e.name.endsWith('.md') && /^```js run/m.test(await readFile(p, 'utf8'))) out.push(relative(join(root, 'docs'), p).replace(/\.md$/, '').replace(/(^|\/)index$/, ''));
  }
  return out;
}

const site = await serveSite();
const { browser, context, errors, watch } = await openSite();
const pages = await pagesWithExamples(join(root, 'docs'));
let examples = 0;
for (const path of pages) {
  const page = await context.newPage();
  watch(page);
  await page.goto(site.url + path);
  await page.waitForSelector('.gl-run');
  const n = await page.locator('.gl-run').count();
  for (let i = 0; i < n; i++) {
    const ex = page.locator('.gl-run').nth(i);
    await ex.locator('[data-run="run"]').click();
    await page.waitForFunction((k) => {
      const el = document.querySelectorAll('.gl-run')[k];
      return el.hasAttribute('data-ran') || el.hasAttribute('data-error');
    }, i, { timeout: 120000 });
    const err = await ex.getAttribute('data-error');
    const layers = await page.evaluate(() => document.querySelectorAll('.gl-run canvas').length);
    check(!err && layers > 0, `${path || 'home'} example ${i + 1}${err ? `: ${err}` : ''}`);
    await page.evaluate(() => window.glRunStopAll());
    examples++;
  }
  await page.close();
}
check(examples >= 15, `ran ${examples} examples on ${pages.length} pages`);
check(errors.length === 0, `no page or GPU errors${errors.length ? ':\n' + errors.join('\n') : ''}`);
await browser.close();
site.close();
process.exit(failed() ? 1 : 0);
