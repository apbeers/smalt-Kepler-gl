// The built docs site in headless Chromium with WebGPU: a static server for docs/.vitepress/dist under the site's base,
// and OpenFreeMap's tiles replaced by generated ones (test/helpers/fixture-tiles.ts), so the tests need no network.
import { createRequire } from 'node:module';
import { readFile, stat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import http from 'node:http';
import * as esbuild from 'esbuild';
import { root, WEBGPU_ARGS } from './harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const BASE = '/smalt-Kepler-gl/';
const dist = join(root, 'docs/.vitepress/dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

async function fixtures() {
  const dir = await mkdtemp(join(tmpdir(), 'smaltgl-fixtures-'));
  await esbuild.build({ entryPoints: [join(root, 'test/helpers/fixture-tiles.ts')], outfile: join(dir, 'tiles.mjs'), bundle: true, format: 'esm', platform: 'node', logLevel: 'warning' });
  return import(join(dir, 'tiles.mjs'));
}

export async function serveSite() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (!p.startsWith(BASE)) {
      res.writeHead(404);
      return res.end();
    }
    p = p.slice(BASE.length) || 'index.html';
    for (const cand of [p, `${p}.html`, join(p, 'index.html')]) {
      try {
        const file = join(dist, cand);
        if ((await stat(file)).isFile()) {
          res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
          return res.end(await readFile(file));
        }
      } catch {}
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://localhost:${server.address().port}${BASE}`, close: () => server.close() };
}

/** Chromium with WebGPU, tiles from fixtures and no outside requests. Collects page, console and GPU errors. */
export async function openSite({ width = 1280, height = 860 } = {}) {
  const { fixtureTile, TILEJSON } = await fixtures();
  const browser = await chromium.launch({ headless: true, args: WEBGPU_ARGS });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  await context.route(/^https?:\/\/(?!localhost)/, async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'tiles.openfreemap.org') {
      if (u.pathname === '/planet') return route.fulfill({ status: 200, contentType: 'application/json', body: TILEJSON });
      const m = u.pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
      if (m) return route.fulfill({ status: 200, contentType: 'application/vnd.mapbox-vector-tile', body: Buffer.from(fixtureTile(+m[1], +m[2], +m[3])) });
    }
    // Fonts and anything else outside: an empty answer.
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  await context.addInitScript(() => {
    if (!navigator.gpu) return;
    const orig = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...a) {
      const device = await orig.apply(this, a);
      device.addEventListener('uncapturederror', (e) => console.error(`GPU error: ${e.error.message}`));
      return device;
    };
  });
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(`${page.url()}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${page.url()}: console error: ${m.text()}`);
    });
  };
  return { browser, context, errors, watch };
}
