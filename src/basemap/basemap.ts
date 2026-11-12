/**
 * The vector basemap: OpenStreetMap data in OpenMapTiles-schema vector tiles (OpenFreeMap by default), drawn with
 * WebGPU in the map's own render pass, under the data layers, with its labels over them.
 *
 * - Tiles load in a pool of workers that fetch, decode and build geometry; the main thread only uploads buffers.
 * - Polygons are filled through the stencil buffer: each ring's triangle fan counts its winding into the stencil
 *   (nonzero rule), then the same fan is drawn where the count isn't zero, clearing it. Concave shapes, holes and
 *   overlapping polygons come out right with no triangulation.
 * - Lines are segments drawn as rounded capsules, sized in pixels, anti-aliased in the fragment shader.
 * - Every draw is clipped to its tile in the fragment shader, so a parent tile can stand in for a missing child.
 */
import type { Camera } from '../core/camera.js';
import { bufferFrom, NO_STENCIL, BLEND_OVER, STENCIL_FORMAT, VIEW_WGSL } from '../core/gpu.js';
import { parseColor, type RGBA } from '../core/color.js';
import type { Frame, LayerGpu } from '../layers/layer.js';
import type { MapBasemap } from '../map/map.js';
import type { TileGeometry } from './build.js';
import { CollisionGrid, LabelAtlas } from './labels.js';
import { atZoom, FILL_GROUPS, LABEL_KINDS, LINE_GROUPS, THEMES, type Theme } from './style.js';
import { coverTiles, tileKey, type TileId } from './tiles.js';

export const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export interface BasemapOptions {
  /** 'light' (default), 'dark', or a theme of your own (style.ts). */
  readonly theme?: 'light' | 'dark' | Theme;
  /** A TileJSON URL, or a tile URL template with {z}, {x} and {y}. Default: OpenFreeMap's planet. */
  readonly tiles?: string;
  /** The deepest zoom the tile source has (default 14); the map zooms past it by scaling those tiles. */
  readonly maxTileZoom?: number;
  /** Workers decoding tiles (default: half the cores, 2 to 4). */
  readonly workers?: number;
  /** Creates a tile worker. Default: the package's own (`tile-worker.ts`). */
  readonly createWorker?: () => Worker;
  /** Labels on (default true). */
  readonly labels?: boolean;
  readonly attribution?: string;
}

interface TileEntry {
  readonly id: TileId;
  state: 'loading' | 'ready' | 'error';
  geometry?: TileGeometry;
  fillVB?: GPUBuffer;
  fillIB?: GPUBuffer;
  segVB?: GPUBuffer;
  used: number;
  request?: number;
  worker?: Worker;
}

const FILL_WGSL = /* wgsl */ `
${VIEW_WGSL}
struct T { origin: vec2f, k: f32, width: f32, clip: vec4f, color: vec4f };
@group(1) @binding(0) var<uniform> t: T;
struct V { @builtin(position) p: vec4f, @location(0) tile: vec2f };
@vertex fn vs(@location(0) p: vec2f) -> V {
  return V(pixelsToClip(toPixels(t.origin + p * t.k)), p);
}
fn clipped(p: vec2f) -> bool {
  return p.x < t.clip.x || p.y < t.clip.y || p.x > t.clip.z || p.y > t.clip.w;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  if (clipped(v.tile)) { discard; }
  return t.color;
}
`;

const LINE_WGSL = /* wgsl */ `
${VIEW_WGSL}
struct T { origin: vec2f, k: f32, width: f32, clip: vec4f, color: vec4f };
@group(1) @binding(0) var<uniform> t: T;
struct V {
  @builtin(position) p: vec4f,
  @location(0) local: vec2f,
  @location(1) tile: vec2f,
  @location(2) @interpolate(flat) len: f32,
};
const C = array<vec2f, 6>(vec2f(0, -1), vec2f(1, -1), vec2f(0, 1), vec2f(0, 1), vec2f(1, -1), vec2f(1, 1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) seg: vec4f) -> V {
  let a = toPixels(t.origin + seg.xy * t.k);
  let b = toPixels(t.origin + seg.zw * t.k);
  var d = b - a;
  let len = length(d);
  var dir = vec2f(1.0, 0.0);
  if (len > 1e-6) { dir = d / len; }
  let n = vec2f(-dir.y, dir.x);
  let hw = max(t.width, 1.0) * 0.5 + 1.0;
  let c = C[vi];
  let along = select(-hw, len + hw, c.x > 0.5);
  let side = c.y * hw;
  let px = a + dir * along + n * side;
  // Back to tile units, for clipping: the inverse of toPixels.
  let q = px - a;
  let inv = vec2f(q.x * view.cosr + q.y * view.sinr, -q.x * view.sinr + q.y * view.cosr) / (view.scale * t.k);
  var o: V;
  o.p = pixelsToClip(px);
  o.local = vec2f(along, side);
  o.tile = seg.xy + inv;
  o.len = len;
  return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  if (v.tile.x < t.clip.x || v.tile.y < t.clip.y || v.tile.x > t.clip.z || v.tile.y > t.clip.w) { discard; }
  var d = abs(v.local.y);
  if (v.local.x < 0.0) { d = length(v.local); }
  else if (v.local.x > v.len) { d = length(vec2f(v.local.x - v.len, v.local.y)); }
  let w = max(t.width, 1.0);
  let a = clamp(w * 0.5 - d + 0.5, 0.0, 1.0) * min(t.width, 1.0);
  if (a <= 0.0) { discard; }
  return t.color * a;
}
`;

const LABEL_WGSL = /* wgsl */ `
${VIEW_WGSL}
@group(1) @binding(0) var atlas: texture_2d<f32>;
@group(1) @binding(1) var samp: sampler;
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) alpha: f32 };
const C = array<vec2f, 6>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1, 1));
@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) rect: vec4f, @location(1) uv: vec4f, @location(2) alpha: f32) -> V {
  let c = C[vi];
  let px = rect.xy + c * rect.zw;
  return V(vec4f(px.x / view.half.x - 1.0, 1.0 - px.y / view.half.y, 0.0, 1.0), mix(uv.xy, uv.zw, c), alpha);
}
@fragment fn fs(v: V) -> @location(0) vec4f {
  return textureSampleLevel(atlas, samp, v.uv, 0.0) * v.alpha;
}
`;

const premul = ([r, g, b, a]: RGBA): RGBA => [r * a, g * a, b * a, a];

export class Basemap implements MapBasemap {
  private theme: Theme;
  private opts: BasemapOptions;
  private gpu?: LayerGpu;
  private redraw: () => void = () => {};
  private template?: Promise<string>;
  private templateValue?: string;
  private tiles = new Map<string, TileEntry>();
  private workers: Worker[] = [];
  private nextWorker = 0;
  private nextRequest = 1;
  private requests = new Map<number, TileEntry>();
  private frameNo = 0;
  private stencilPipe?: GPURenderPipeline;
  private coverPipe?: GPURenderPipeline;
  private linePipe?: GPURenderPipeline;
  private labelPipe?: GPURenderPipeline;
  private tileLayout?: GPUBindGroupLayout;
  private tileGroup?: GPUBindGroup;
  private tileGroupVersion = -1;
  private atlas?: LabelAtlas;
  private labelGroup?: GPUBindGroup;
  private labelBuffer?: GPUBuffer;
  private labelCapacity = 0;
  private shownLabels = new Set<string>();
  private errors = 0;
  private destroyed = false;

  constructor(options: BasemapOptions = {}) {
    this.opts = options;
    this.theme = typeof options.theme === 'object' ? options.theme : THEMES[options.theme ?? 'light'];
  }

  get dark(): boolean {
    return this.theme.dark;
  }

  get background(): RGBA {
    return parseColor(this.theme.background);
  }

  get attribution(): string {
    return this.opts.attribution ?? ATTRIBUTION;
  }

  get pending(): number {
    let n = 0;
    for (const t of this.tiles.values()) if (t.state === 'loading') n++;
    return n;
  }

  /** Every tile the view needs is drawn (or failed): nothing more will arrive until the view changes. */
  get idle(): boolean {
    return this.templateValue !== undefined && this.missing === 0;
  }

  private missing = 1;

  /** Tiles that failed to load since the basemap started. */
  get failures(): number {
    return this.errors;
  }

  /** Switches between themes; tiles stay loaded. */
  setTheme(theme: 'light' | 'dark' | Theme): void {
    this.theme = typeof theme === 'object' ? theme : THEMES[theme];
    this.atlas?.clear();
    this.redraw();
  }

  get themeName(): string {
    return this.theme.name;
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.gpu = gpu;
    this.redraw = redraw;
    const { device } = gpu;
    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    this.tileLayout = device.createBindGroupLayout({
      label: 'basemap tile',
      entries: [{ binding: 0, visibility: V | F, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 48 } }],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.tileLayout] });
    const fill = device.createShaderModule({ label: 'basemap fill', code: FILL_WGSL });
    const fillVertex: GPUVertexState = { module: fill, entryPoint: 'vs', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] };
    const ms = { count: gpu.samples };
    this.stencilPipe = device.createRenderPipeline({
      label: 'basemap stencil',
      layout,
      vertex: fillVertex,
      fragment: { module: fill, entryPoint: 'fs', targets: [{ format: gpu.format, writeMask: 0 }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: STENCIL_FORMAT,
        // Nonzero winding: rings wound one way count up, the other way down. Overlapping polygons of a group then
        // fill as their union, and holes (wound against their outer ring) cancel.
        stencilFront: { compare: 'always', passOp: 'increment-wrap', failOp: 'keep' },
        stencilBack: { compare: 'always', passOp: 'decrement-wrap', failOp: 'keep' },
        stencilReadMask: 0xff,
        stencilWriteMask: 0xff,
      },
      multisample: ms,
    });
    this.coverPipe = device.createRenderPipeline({
      label: 'basemap cover',
      layout,
      vertex: fillVertex,
      fragment: { module: fill, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: STENCIL_FORMAT,
        stencilFront: { compare: 'not-equal', passOp: 'zero', failOp: 'keep' },
        stencilBack: { compare: 'not-equal', passOp: 'zero', failOp: 'keep' },
        stencilReadMask: 0xff,
        stencilWriteMask: 0xff,
      },
      multisample: ms,
    });
    const line = device.createShaderModule({ label: 'basemap line', code: LINE_WGSL });
    this.linePipe = device.createRenderPipeline({
      label: 'basemap line',
      layout,
      vertex: { module: line, entryPoint: 'vs', buffers: [{ arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] },
      fragment: { module: line, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: NO_STENCIL,
      multisample: ms,
    });
    const label = device.createShaderModule({ label: 'basemap labels', code: LABEL_WGSL });
    const labelLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, texture: { sampleType: 'float' } },
        { binding: 1, visibility: F, sampler: { type: 'filtering' } },
      ],
    });
    this.labelPipe = device.createRenderPipeline({
      label: 'basemap labels',
      layout: device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, labelLayout] }),
      vertex: {
        module: label,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 36,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'float32' },
            ],
          },
        ],
      },
      fragment: { module: label, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: NO_STENCIL,
      multisample: ms,
    });
    this.atlas = new LabelAtlas(device, Math.min(2, globalThis.devicePixelRatio || 1));
    this.labelGroup = device.createBindGroup({
      layout: labelLayout,
      entries: [
        { binding: 0, resource: this.atlas.texture.createView() },
        { binding: 1, resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      ],
    });
    const n = this.opts.workers ?? Math.max(2, Math.min(4, Math.floor((globalThis.navigator?.hardwareConcurrency ?? 4) / 2)));
    for (let i = 0; i < n; i++) {
      const w = this.opts.createWorker ? this.opts.createWorker() : new Worker(new URL('./tile-worker.ts', import.meta.url), { type: 'module', name: 'smaltgl tiles' });
      w.onmessage = (e) => this.onTile(e.data);
      this.workers.push(w);
    }
  }

  private tileUrl(): Promise<string> {
    if (!this.template) {
      const src = this.opts.tiles ?? OPENFREEMAP;
      this.template = src.includes('{z}')
        ? Promise.resolve(src)
        : fetch(src)
            .then((r) => r.json())
            .then((j: { tiles: string[] }) => j.tiles[0]);
      this.template.then((t) => {
        this.templateValue = t;
        this.redraw();
      }, () => this.errors++);
    }
    return this.template;
  }

  private request(id: TileId): TileEntry {
    const entry: TileEntry = { id, state: 'loading', used: this.frameNo };
    this.tiles.set(tileKey(id), entry);
    const url = this.templateValue!.replace('{z}', String(id.z)).replace('{x}', String(id.x)).replace('{y}', String(id.y));
    const req = this.nextRequest++;
    const worker = this.workers[this.nextWorker++ % this.workers.length];
    entry.request = req;
    entry.worker = worker;
    this.requests.set(req, entry);
    worker.postMessage({ id: req, url, z: id.z });
    return entry;
  }

  private onTile(msg: { id: number; geometry?: TileGeometry; error?: string }): void {
    const entry = this.requests.get(msg.id);
    this.requests.delete(msg.id);
    if (!entry || this.destroyed) return;
    if (!msg.geometry) {
      if (msg.error === 'aborted') this.tiles.delete(tileKey(entry.id));
      else {
        entry.state = 'error';
        this.errors++;
      }
      return;
    }
    const g = msg.geometry;
    const device = this.gpu!.device;
    entry.geometry = g;
    if (g.fillIndex.length) {
      entry.fillVB = bufferFrom(device, g.fillVerts, GPUBufferUsage.VERTEX, 'tile fill vertices');
      entry.fillIB = bufferFrom(device, g.fillIndex, GPUBufferUsage.INDEX, 'tile fill indices');
    }
    if (g.segments.length) entry.segVB = bufferFrom(device, g.segments, GPUBufferUsage.VERTEX, 'tile segments');
    entry.state = 'ready';
    this.redraw();
  }

  private maxTileZoom(): number {
    return this.opts.maxTileZoom ?? 14;
  }

  /** The tiles to draw this frame, each with the region of it to draw (a parent can stand in for a missing tile). */
  private plan(camera: Camera): { tile: TileEntry; clip: TileId }[] {
    const want = coverTiles(camera, this.maxTileZoom());
    const out: { tile: TileEntry; clip: TileId }[] = [];
    if (!this.templateValue) {
      void this.tileUrl();
      return out;
    }
    const wanted = new Set(want.map(tileKey));
    // Cancel loads that scrolled away.
    for (const [key, t] of this.tiles)
      if (t.state === 'loading' && !wanted.has(key) && t.request !== undefined && this.frameNo - t.used > 2) {
        t.worker?.postMessage({ cancel: t.request });
        t.request = undefined;
      }
    let inflight = 0;
    for (const t of this.tiles.values()) if (t.state === 'loading') inflight++;
    this.missing = 0;
    for (const id of want) {
      const key = tileKey(id);
      let t = this.tiles.get(key);
      if (t?.state !== 'ready' && t?.state !== 'error') this.missing++;
      if (!t && inflight < 24) {
        t = this.request(id);
        inflight++;
      }
      if (t) t.used = this.frameNo;
      if (t?.state === 'ready') {
        out.push({ tile: t, clip: id });
        continue;
      }
      // A loaded ancestor, clipped to this tile's square.
      let found = false;
      for (let dz = 1; dz <= 6 && id.z - dz >= 0; dz++) {
        const a = this.tiles.get(tileKey({ z: id.z - dz, x: id.x >> dz, y: id.y >> dz }));
        if (a?.state === 'ready') {
          a.used = this.frameNo;
          out.push({ tile: a, clip: id });
          found = true;
          break;
        }
      }
      if (found) continue;
      // Loaded children, each in its own square.
      if (id.z < this.maxTileZoom())
        for (let k = 0; k < 4; k++) {
          const c = { z: id.z + 1, x: id.x * 2 + (k & 1), y: id.y * 2 + (k >> 1) };
          const ct = this.tiles.get(tileKey(c));
          if (ct?.state === 'ready') {
            ct.used = this.frameNo;
            out.push({ tile: ct, clip: c });
          }
        }
    }
    // Parents first: children drawn after them cover them.
    out.sort((a, b) => a.tile.id.z - b.tile.id.z);
    this.evict();
    return out;
  }

  private evict(): void {
    const max = 300;
    if (this.tiles.size <= max) return;
    const old = [...this.tiles.entries()].filter(([, t]) => t.state !== 'loading' && t.used < this.frameNo).sort((a, b) => a[1].used - b[1].used);
    for (const [key, t] of old.slice(0, this.tiles.size - max)) {
      t.fillVB?.destroy();
      t.fillIB?.destroy();
      t.segVB?.destroy();
      this.tiles.delete(key);
    }
  }

  private group(): GPUBindGroup {
    const gpu = this.gpu!;
    if (!this.tileGroup || this.tileGroupVersion !== gpu.arena.version) {
      this.tileGroup = gpu.device.createBindGroup({ layout: this.tileLayout!, entries: [{ binding: 0, resource: { buffer: gpu.arena.buffer, size: 48 } }] });
      this.tileGroupVersion = gpu.arena.version;
    }
    return this.tileGroup;
  }

  /** Uniforms for drawing `tile` clipped to `clip`: origin offset, tile units to world, line width, clip, colour. */
  private uniforms(camera: Camera, tile: TileId, clip: TileId, extent: number, width: number, color: RGBA): number[] {
    const n = 2 ** tile.z;
    const ox = tile.x / n - camera.x, oy = tile.y / n - camera.y;
    const k = 1 / n / extent;
    // The clip square in this tile's units.
    const s = 2 ** (clip.z - tile.z);
    const cx0 = ((clip.x / s - tile.x) * extent), cy0 = ((clip.y / s - tile.y) * extent);
    const cs = extent / s;
    return [ox, oy, k, width, cx0, cy0, cx0 + cs, cy0 + cs, ...color];
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (!this.gpu) return;
    this.frameNo++;
    const camera = frame.camera;
    const plan = this.plan(camera);
    if (!plan.length) return;
    const arena = this.gpu.arena;
    const z = camera.zoom;
    pass.setBindGroup(0, frame.viewGroup);
    const theme = this.theme;

    // Fills, group by group in style order; each group stencil then cover, tile by tile.
    for (let g = 0; g < FILL_GROUPS.length; g++) {
      const color = premul(parseColor(theme.fills[FILL_GROUPS[g]]));
      for (const { tile, clip } of plan) {
        const geom = tile.geometry!;
        const r = geom.fills.find((f) => f.group === g);
        if (!r || !tile.fillVB) continue;
        const off = arena.push(this.uniforms(camera, tile.id, clip, geom.extent, 0, color));
        pass.setBindGroup(1, this.group(), [off]);
        pass.setVertexBuffer(0, tile.fillVB);
        pass.setIndexBuffer(tile.fillIB!, 'uint32');
        pass.setPipeline(this.stencilPipe!);
        pass.setStencilReference(0);
        pass.drawIndexed(r.count, 1, r.start);
        pass.setPipeline(this.coverPipe!);
        pass.drawIndexed(r.count, 1, r.start);
      }
    }

    // Lines: every casing first, then every line, each in style order.
    pass.setPipeline(this.linePipe!);
    for (const casing of [true, false]) {
      for (let g = 0; g < LINE_GROUPS.length; g++) {
        const st = theme.lines[LINE_GROUPS[g]];
        if (z < (st.minZoom ?? 0) - 0.5) continue;
        if (casing && !st.casing) continue;
        const spec = casing ? st.casing! : st;
        // CSS pixels, like the rest of the view.
        const width = atZoom(spec.width, z);
        const color = premul(parseColor(spec.color));
        if (color[3] === 0) continue;
        for (const { tile, clip } of plan) {
          const geom = tile.geometry!;
          const r = geom.lines.find((l) => l.group === g);
          if (!r || !tile.segVB) continue;
          const off = arena.push(this.uniforms(camera, tile.id, clip, geom.extent, width, color));
          pass.setBindGroup(1, this.group(), [off]);
          pass.setVertexBuffer(0, tile.segVB);
          pass.draw(6, r.count, 0, r.start);
        }
      }
    }
    this.lastPlan = plan;
  }

  private lastPlan: { tile: TileEntry; clip: TileId }[] = [];

  drawLabels(pass: GPURenderPassEncoder, frame: Frame): void {
    if (this.opts.labels === false || !this.atlas || !this.lastPlan.length) return;
    const camera = frame.camera;
    const z = camera.zoom;
    const theme = this.theme;
    type Cand = { kind: number; rank: number; text: string; sx: number; sy: number; key: string };
    const cands: Cand[] = [];
    const seen = new Set<string>();
    for (const { tile, clip } of this.lastPlan) {
      const g = tile.geometry!;
      const n = 2 ** tile.id.z;
      const s = 2 ** (clip.z - tile.id.z);
      const cx0 = (clip.x / s - tile.id.x) * g.extent, cy0 = (clip.y / s - tile.id.y) * g.extent, cs = g.extent / s;
      for (const l of g.labels) {
        if (l.x < cx0 || l.y < cy0 || l.x >= cx0 + cs || l.y >= cy0 + cs) continue;
        const st = theme.labels[LABEL_KINDS[l.kind]];
        if (z < st.minZoom || (st.maxZoom !== undefined && z > st.maxZoom)) continue;
        const key = `${l.kind}|${l.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [sx, sy] = camera.worldToScreen(tile.id.x / n + l.x / g.extent / n, tile.id.y / n + l.y / g.extent / n);
        if (sx < -100 || sy < -40 || sx > camera.width + 100 || sy > camera.height + 40) continue;
        cands.push({ kind: l.kind, rank: l.rank, text: l.text, sx, sy, key });
      }
    }
    // Labels shown last frame first among equals: steadier as the map moves.
    const prev = this.shownLabels;
    cands.sort((a, b) => a.kind - b.kind || (prev.has(b.key) ? 1 : 0) - (prev.has(a.key) ? 1 : 0) || a.rank - b.rank);
    const grid = new CollisionGrid();
    const r = frame.pixelRatio;
    const atlasSize = this.atlas.size;
    const inst: number[] = [];
    const shown = new Set<string>();
    const gen = this.atlas.generation;
    for (const c of cands) {
      if (shown.size >= 400) break;
      const st = theme.labels[LABEL_KINDS[c.kind]];
      const e = this.atlas.get(c.text, st, theme.halo);
      if (!e || this.atlas.generation !== gen) break;
      const w = e.w / r, h = e.h / r;
      // Snap to device pixels so text stays crisp.
      const x = Math.round((c.sx - w / 2) * r) / r, y = Math.round((c.sy - h / 2) * r) / r;
      if (!grid.tryPlace([x + 2, y + 3, x + w - 2, y + h - 3])) continue;
      shown.add(c.key);
      inst.push(x, y, w, h, e.x / atlasSize, e.y / atlasSize, (e.x + e.w) / atlasSize, (e.y + e.h) / atlasSize, 1);
    }
    this.shownLabels = shown;
    if (!inst.length) return;
    const count = inst.length / 9;
    const device = this.gpu!.device;
    if (count > this.labelCapacity) {
      this.labelBuffer?.destroy();
      this.labelCapacity = Math.max(64, count * 2);
      this.labelBuffer = device.createBuffer({ label: 'labels', size: this.labelCapacity * 36, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    device.queue.writeBuffer(this.labelBuffer!, 0, new Float32Array(inst));
    pass.setPipeline(this.labelPipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.labelGroup!);
    pass.setVertexBuffer(0, this.labelBuffer!);
    pass.draw(6, count);
  }

  destroy(): void {
    this.destroyed = true;
    for (const w of this.workers) w.terminate();
    for (const t of this.tiles.values()) {
      t.fillVB?.destroy();
      t.fillIB?.destroy();
      t.segVB?.destroy();
    }
    this.tiles.clear();
    this.atlas?.destroy();
    this.labelBuffer?.destroy();
  }
}

/** The OpenStreetMap basemap, from OpenFreeMap unless `tiles` says otherwise. */
export const basemap = (options?: BasemapOptions): Basemap => new Basemap(options);
