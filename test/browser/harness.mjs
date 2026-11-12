// The browser test harness: bundles a page script with esbuild, serves it (and test fixtures) over http://localhost
// (WebGPU needs a secure context), and opens it in headless Chromium with WebGPU on SwiftShader, so the tests run
// without a GPU. Any GPU validation error, device loss, page error or console error fails the run.
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import * as esbuild from 'esbuild';
import { workerUrls } from '../../scripts/worker-urls.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json', '.json': 'application/json', '.pbf': 'application/vnd.mapbox-vector-tile' };

/** Chromium's flags for WebGPU on SwiftShader (no GPU needed). */
export const WEBGPU_ARGS = ['--enable-unsafe-webgpu', '--enable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--enable-unsafe-swiftshader'];

let failures = 0;
export function check(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.log(`  FAIL ${msg}`);
  }
  return cond;
}
export const failed = () => failures;

/**
 * Bundles `entry` (a page script) and serves it at /. `routes` maps extra paths to handlers
 * `(url) => ({ status, type, body }) | undefined` (for generated vector tiles).
 */
export async function serve(entry, { routes = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'smaltgl-browser-'));
  await esbuild.build({
    entryPoints: { page: entry },
    outdir: dir,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    sourcemap: 'inline',
    logLevel: 'warning',
    alias: { '@smaltworks/smaltcy': join(root, 'node_modules/@smaltworks/smaltcy/src/index.ts') },
    plugins: [workerUrls({ 'tile-worker.ts': 'tile-worker.js', 'worker.ts': 'data-worker.js' })],
  });
  // The tile and data workers, bundled on their own, as the package ships them.
  for (const [name, file] of [['tile-worker', 'src/basemap/tile-worker.ts'], ['data-worker', 'src/datasets/worker.ts']]) {
    await esbuild.build({ entryPoints: { [name]: join(root, file) }, outdir: dir, bundle: true, format: 'esm', target: 'es2022', platform: 'browser', logLevel: 'silent' }).catch(() => {});
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#fff}#map{position:absolute;inset:0}</style></head><body><div id="map"></div><script type="module" src="/page.js"></script></body></html>`;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.pathname.startsWith(prefix)) {
        const r = await handler(url);
        if (r) {
          res.writeHead(r.status ?? 200, { 'content-type': r.type ?? 'application/octet-stream', 'access-control-allow-origin': '*' });
          res.end(r.body);
          return;
        }
      }
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
      return;
    }
    try {
      const body = await readFile(join(dir, url.pathname));
      res.writeHead(200, { 'content-type': TYPES[extname(url.pathname)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    url: `http://localhost:${port}/`,
    async close() {
      server.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Launches Chromium with WebGPU and opens `url`; collects errors. */
/** Chromium flags that send outside requests through the session's HTTPS proxy, if there is one (real tiles). */
export function proxyArgs() {
  const p = process.env.HTTPS_PROXY;
  return p ? [`--proxy-server=${new URL(p).host}`, '--proxy-bypass-list=localhost;127.0.0.1', '--ignore-certificate-errors'] : [];
}

export async function open(url, { width = 800, height = 600, headed = false, args = [] } = {}) {
  const browser = await chromium.launch({ headless: !headed, args: [...WEBGPU_ARGS, ...args] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console error: ${m.text()}`);
  });
  // GPU validation errors and device loss become console errors.
  await page.addInitScript(() => {
    if (!navigator.gpu) return;
    const orig = GPUAdapter.prototype.requestDevice;
    GPUAdapter.prototype.requestDevice = async function (...a) {
      const device = await orig.apply(this, a);
      device.addEventListener('uncapturederror', (e) => console.error(`GPU error: ${e.error.message}`));
      return device;
    };
  });
  await page.goto(url);
  return { browser, page, errors };
}

/** Decodes an 8-bit RGB(A) PNG (Playwright's screenshots) into { width, height, px(x, y) → [r, g, b] }. */
export async function decodePng(buf) {
  const { inflateSync } = await import('node:zlib');
  let o = 8, width = 0, height = 0, type = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), kind = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      type = data[9];
    } else if (kind === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let p;
      if (f === 0) p = 0;
      else if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else {
        const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = (v + p) & 255;
    }
  }
  return { width, height, px: (x, y) => [px[y * stride + x * bpp], px[y * stride + x * bpp + 1], px[y * stride + x * bpp + 2]] };
}

/** Counts pixels in a decoded image that satisfy `test([r, g, b])`. */
export function countPixels(img, test, step = 2) {
  let n = 0;
  for (let y = 0; y < img.height; y += step) for (let x = 0; x < img.width; x += step) if (test(img.px(x, y))) n++;
  return n;
}
