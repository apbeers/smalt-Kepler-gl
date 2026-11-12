/**
 * Points binned into hexagons or squares on the GPU. A compute pass sends every point that passes the filters to its
 * cell with an atomic add (count, and a weight sum in fixed point); a second pass turns sums into the chosen measure
 * and finds the largest; the map's pass draws one instanced cell per bin, coloured by its value over that maximum.
 * Moving a filter re-runs the binning on the GPU, with nothing read back to draw.
 */
import { BLEND_OVER, NO_STENCIL, VIEW_WGSL } from '../core/gpu.js';
import { bakeRamp, RAMPS, type RampName } from '../core/color.js';
import { metersToWorld, yToLat, type Projected } from '../core/mercator.js';
import { emptyStorage, FILTER_WGSL, filterUniforms, makeRamp, PICK_TARGET, storageOf, toProjected, type PointInput, type Ramp } from './common.js';
import { autoId, originOffset, RAMP_WGSL, type Frame, type GpuFilter, type Layer, type LayerGpu } from './layer.js';

export interface AggregateOptions {
  readonly id?: string;
  readonly data: PointInput;
  /** 'hexagon' (default) or 'square'. */
  readonly shape?: 'hexagon' | 'square';
  /** Cell size in metres: a hexagon's centre-to-corner radius, a square's side (default 500). */
  readonly cellSize?: number;
  /** A value per point, for 'sum' and 'mean'. */
  readonly weight?: ArrayLike<number>;
  /** What a cell shows (default 'count'). */
  readonly measure?: 'count' | 'sum' | 'mean';
  readonly ramp?: RampName | readonly string[];
  /** 'linear' (default) or 'log' colour scale. */
  readonly scale?: 'linear' | 'log';
  /** Fraction of the cell drawn (default 0.92): gaps show the map between cells. */
  readonly coverage?: number;
  readonly opacity?: number;
  readonly filters?: readonly GpuFilter[];
  readonly visible?: boolean;
}

const MAX_BINS = 1 << 22;
const SQRT3 = Math.sqrt(3);

const COMMON = /* wgsl */ `
struct G {
  cell: f32, hex: f32, cols: f32, rows: f32,
  col0: f32, row0: f32, scale: f32, measure: f32,
  fa: vec3f, hasWeight: f32,
  fb: vec3f, count: f32,
};
fn binOf(p: vec2f) -> i32 {
  if (g.hex > 0.5) {
    // Pointy-top hexagons: axial coordinates, rounded in cube coordinates.
    let q = (sqrt(3.0) / 3.0 * p.x - p.y / 3.0) / g.cell;
    let r = (2.0 / 3.0 * p.y) / g.cell;
    let s = -q - r;
    var rq = round(q); var rr = round(r); let rs = round(s);
    let dq = abs(rq - q); let dr = abs(rr - r); let ds = abs(rs - s);
    if (dq > dr && dq > ds) { rq = -rr - rs; } else if (dr > ds) { rr = -rq - rs; }
    let row = i32(rr);
    let col = i32(rq) + (row - (row & 1)) / 2;
    let c = col - i32(g.col0); let rw = row - i32(g.row0);
    if (c < 0 || rw < 0 || c >= i32(g.cols) || rw >= i32(g.rows)) { return -1; }
    return rw * i32(g.cols) + c;
  }
  let c = i32(floor(p.x / g.cell)) - i32(g.col0);
  let rw = i32(floor(p.y / g.cell)) - i32(g.row0);
  if (c < 0 || rw < 0 || c >= i32(g.cols) || rw >= i32(g.rows)) { return -1; }
  return rw * i32(g.cols) + c;
}
fn centreOf(bin: u32) -> vec2f {
  let c = i32(bin % u32(g.cols)) + i32(g.col0);
  let r = i32(bin / u32(g.cols)) + i32(g.row0);
  if (g.hex > 0.5) {
    let q = c - (r - (r & 1)) / 2;
    return vec2f(g.cell * (sqrt(3.0) * f32(q) + sqrt(3.0) / 2.0 * f32(r)), g.cell * 1.5 * f32(r));
  }
  return vec2f((f32(c) + 0.5) * g.cell, (f32(r) + 0.5) * g.cell);
}
`;

const BIN_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var<storage, read> pos: array<vec2f>;
@group(0) @binding(2) var<storage, read> weight: array<f32>;
@group(0) @binding(3) var<storage, read> filterA: array<f32>;
@group(0) @binding(4) var<storage, read> filterB: array<f32>;
@group(0) @binding(5) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> sums: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> values: array<f32>;
@group(0) @binding(8) var<storage, read_write> top: array<atomic<u32>, 2>;
${COMMON}
${FILTER_WGSL}
@compute @workgroup_size(256) fn bin(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) n: vec3u) {
  let i = id.x + id.y * n.x * 256u;
  if (i >= u32(g.count)) { return; }
  if (!passes(i, g.fa, g.fb)) { return; }
  let b = binOf(pos[i]);
  if (b < 0) { return; }
  atomicAdd(&counts[b], 1u);
  if (g.hasWeight > 0.5) { atomicAdd(&sums[b], u32(max(0.0, weight[i]) * g.scale + 0.5)); }
}
@compute @workgroup_size(256) fn finish(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) n: vec3u) {
  let b = id.x + id.y * n.x * 256u;
  if (b >= u32(g.cols * g.rows)) { return; }
  let c = atomicLoad(&counts[b]);
  var v = f32(c);
  if (g.measure > 0.5) {
    let s = f32(atomicLoad(&sums[b])) / g.scale;
    v = select(s, s / max(1.0, f32(c)), g.measure > 1.5);
  }
  values[b] = select(-1.0, v, c > 0u);
  if (c > 0u) {
    atomicMax(&top[0], bitcast<u32>(v));
    atomicAdd(&top[1], 1u);
  }
}
`;

const DRAW_WGSL = /* wgsl */ `
${VIEW_WGSL}
struct U { offset: vec2f, coverage: f32, opacity: f32, logScale: f32, slot: f32, highlight: f32, pad: f32 };
@group(1) @binding(0) var<uniform> u: U;
${RAMP_WGSL}
@group(1) @binding(3) var<uniform> g: G;
@group(1) @binding(4) var<storage, read> values: array<f32>;
@group(1) @binding(5) var<storage, read> top: array<u32, 2>;
${COMMON}
struct V { @builtin(position) p: vec4f, @location(0) @interpolate(flat) color: vec4f, @location(1) @interpolate(flat) id: u32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) b: u32) -> V {
  var o: V;
  let v = values[b];
  if (v < 0.0) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let centre = centreOf(b);
  var corner: vec2f;
  let k = vi % 3u;
  let tri = vi / 3u;
  if (g.hex > 0.5) {
    // Six triangles around the centre.
    if (k == 0u) { corner = vec2f(0.0); }
    else {
      let a = (f32(tri + k - 1u) * 60.0 + 30.0) * 3.14159265 / 180.0;
      corner = vec2f(cos(a), sin(a)) * g.cell;
    }
  } else {
    let sq = array<vec2f, 6>(vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(-0.5, 0.5), vec2f(-0.5, 0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5));
    corner = sq[min(vi, 5u)] * g.cell;
    if (vi >= 6u) { o.p = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  }
  var cov = u.coverage;
  if (f32(b) == u.highlight) { cov = 1.0; }
  o.p = pixelsToClip(toPixels(centre + corner * cov + u.offset));
  let mx = max(bitcast<f32>(top[0]), 1e-12);
  var t = v / mx;
  if (u.logScale > 0.5) { t = log(1.0 + v) / log(1.0 + mx); }
  var c = ramp(t);
  if (f32(b) == u.highlight) { c = vec4f(mix(c.rgb, vec3f(1.0), 0.35), 1.0); }
  o.color = vec4f(c.rgb, 1.0) * u.opacity;
  o.id = b;
  return o;
}
@fragment fn fs(v: V) -> @location(0) vec4f { return v.color; }
@fragment fn fsPick(v: V) -> @location(0) u32 { return (u32(u.slot) << 24u) | (v.id + 1u); }
`;

export class AggregateLayer implements Layer {
  readonly id: string;
  visible: boolean;
  readonly count: number;
  readonly bounds: Projected['bounds'];
  readonly data: Projected;
  filters: GpuFilter[];
  /** Cells in the grid, and how many hold points (after the last binning, read back for legends). */
  bins = 0;
  occupied = 0;
  /** The largest cell value (read back after each binning). */
  max = 0;
  private opts: AggregateOptions;
  private gpu?: LayerGpu;
  private dirty = true;
  private grid = { cell: 1, hex: 1, cols: 1, rows: 1, col0: 0, row0: 0, scale: 1 };
  private binPipe?: GPUComputePipeline;
  private finishPipe?: GPUComputePipeline;
  private drawPipe?: GPURenderPipeline;
  private pickPipe?: GPURenderPipeline;
  private computeGroup?: GPUBindGroup;
  private drawLayout?: GPUBindGroupLayout;
  private drawGroup?: GPUBindGroup;
  private drawVersion = -1;
  private gridBuf?: GPUBuffer;
  private counts?: GPUBuffer;
  private sums?: GPUBuffer;
  private values?: GPUBuffer;
  private top?: GPUBuffer;
  private readTop?: GPUBuffer;
  private readCounts?: GPUBuffer;
  private reading = false;
  private cpuCounts?: Uint32Array;
  private cpuValues?: Float32Array;
  private buffers: GPUBuffer[] = [];
  private ramp?: Ramp;
  private highlighted = -1;
  private redraw: () => void = () => {};

  constructor(options: AggregateOptions) {
    this.opts = options;
    this.id = options.id ?? autoId(options.shape === 'square' ? 'grid' : 'hexbin');
    this.visible = options.visible ?? true;
    this.data = toProjected(options.data);
    this.count = this.data.count;
    this.bounds = this.data.bounds;
    this.filters = [...(options.filters ?? [])];
  }

  get rampStops(): readonly string[] {
    const r = this.opts.ramp ?? 'smalt';
    return typeof r === 'string' ? RAMPS[r] : r;
  }

  /** Re-bins with new options (cell size, measure, shape); keeps the data on the GPU. */
  update(changes: Partial<Pick<AggregateOptions, 'cellSize' | 'measure' | 'shape' | 'coverage' | 'opacity' | 'scale'>>): void {
    const gridChanged = changes.cellSize !== undefined || changes.shape !== undefined;
    this.opts = { ...this.opts, ...changes };
    if (gridChanged && this.gpu) this.layoutGrid();
    this.dirty = true;
    this.redraw();
  }

  private layoutGrid(): void {
    const { device } = this.gpu!;
    const hex = (this.opts.shape ?? 'hexagon') === 'hexagon';
    const [a, b, c, d] = this.bounds;
    const [ox, oy] = this.data.origin;
    let cell = metersToWorld(this.opts.cellSize ?? 500, yToLat(oy));
    // Bins in local units (offsets from the origin).
    const span = (cellSize: number) => {
      const x0 = a - ox, x1 = c - ox, y0 = b - oy, y1 = d - oy;
      if (hex) {
        const row0 = Math.floor(y0 / (1.5 * cellSize)) - 1, row1 = Math.ceil(y1 / (1.5 * cellSize)) + 1;
        const col0 = Math.floor(x0 / (SQRT3 * cellSize)) - 2, col1 = Math.ceil(x1 / (SQRT3 * cellSize)) + 2;
        return { col0, row0, cols: col1 - col0 + 1, rows: row1 - row0 + 1 };
      }
      const col0 = Math.floor(x0 / cellSize) - 1, row0 = Math.floor(y0 / cellSize) - 1;
      return { col0, row0, cols: Math.ceil(x1 / cellSize) - col0 + 2, rows: Math.ceil(y1 / cellSize) - row0 + 2 };
    };
    let s = span(cell);
    // Too many cells for the data's extent: grow them until the grid fits.
    while (s.cols * s.rows > MAX_BINS) {
      cell *= 1.5;
      s = span(cell);
    }
    let total = 0;
    const w = this.opts.weight;
    if (w) for (let i = 0; i < w.length; i++) total += Math.max(0, w[i]);
    const scale = w ? Math.min(1e6, 4e9 / Math.max(1e-9, total)) : 1;
    this.grid = { cell, hex: hex ? 1 : 0, ...s, scale };
    this.bins = s.cols * s.rows;
    for (const buf of [this.counts, this.sums, this.values, this.readCounts]) buf?.destroy();
    const bytes = Math.max(16, this.bins * 4);
    this.counts = device.createBuffer({ label: 'bins counts', size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.sums = device.createBuffer({ label: 'bins sums', size: w ? bytes : 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.values = device.createBuffer({ label: 'bins values', size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.readCounts = device.createBuffer({ label: 'bins read', size: bytes * 2, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    this.computeGroup = undefined;
    this.drawGroup = undefined;
  }

  attach(gpu: LayerGpu, redraw: () => void): void {
    this.gpu = gpu;
    this.redraw = redraw;
    const { device } = gpu;
    const C = GPUShaderStage.COMPUTE, V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    const empty = emptyStorage(device);
    this.buffers = [
      storageOf(device, this.data.positions, empty, 'bins positions'),
      storageOf(device, this.opts.weight ? Float32Array.from(this.opts.weight) : undefined, empty, 'bins weight'),
      storageOf(device, this.filters[0]?.values, empty, 'bins filter A'),
      storageOf(device, this.filters[1]?.values, empty, 'bins filter B'),
      empty,
    ];
    this.gridBuf = device.createBuffer({ label: 'bins grid', size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.top = device.createBuffer({ label: 'bins top', size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.readTop = device.createBuffer({ label: 'bins top read', size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const computeModule = device.createShaderModule({ label: 'bins', code: BIN_WGSL });
    const computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: { type: 'uniform' } },
        ...[1, 2, 3, 4].map((b) => ({ binding: b, visibility: C, buffer: { type: 'read-only-storage' as const } })),
        ...[5, 6, 7, 8].map((b) => ({ binding: b, visibility: C, buffer: { type: 'storage' as const } })),
      ],
    });
    const cl = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });
    this.binPipe = device.createComputePipeline({ label: 'bins', layout: cl, compute: { module: computeModule, entryPoint: 'bin' } });
    this.finishPipe = device.createComputePipeline({ label: 'bins finish', layout: cl, compute: { module: computeModule, entryPoint: 'finish' } });
    this.computeLayout = computeLayout;
    this.drawLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
        { binding: 1, visibility: V | F, texture: { sampleType: 'float' } },
        { binding: 2, visibility: V | F, sampler: { type: 'filtering' } },
        { binding: 3, visibility: V, buffer: { type: 'uniform' } },
        { binding: 4, visibility: V, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: V, buffer: { type: 'read-only-storage' } },
      ],
    });
    const dm = device.createShaderModule({ label: 'bins draw', code: DRAW_WGSL });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.drawLayout] });
    this.drawPipe = device.createRenderPipeline({
      label: 'bins draw',
      layout: pl,
      vertex: { module: dm, entryPoint: 'vs' },
      fragment: { module: dm, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_OVER }] },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    });
    this.pickPipe = device.createRenderPipeline({
      label: 'bins pick',
      layout: pl,
      vertex: { module: dm, entryPoint: 'vs' },
      fragment: { module: dm, entryPoint: 'fsPick', targets: [PICK_TARGET] },
    });
    this.ramp = makeRamp(device, bakeRamp(this.rampStops));
    this.layoutGrid();
  }

  private computeLayout?: GPUBindGroupLayout;

  setFilter(index: number, range: [number, number]): void {
    const f = this.filters[index];
    if (f) f.range = range;
    this.dirty = true;
    this.redraw();
  }

  prepare(frame: Frame): void {
    if (!this.dirty || !this.count) return;
    this.dirty = false;
    const { device } = this.gpu!;
    const g = this.grid;
    const [fa0, fa1, fa2, fb0, fb1, fb2] = filterUniforms(this.filters);
    const measure = { count: 0, sum: 1, mean: 2 }[this.opts.weight ? (this.opts.measure ?? 'count') : 'count'];
    device.queue.writeBuffer(this.gridBuf!, 0, new Float32Array([g.cell, g.hex, g.cols, g.rows, g.col0, g.row0, g.scale, measure, fa0, fa1, fa2, this.opts.weight ? 1 : 0, fb0, fb1, fb2, this.count]));
    if (!this.computeGroup) {
      this.computeGroup = device.createBindGroup({
        layout: this.computeLayout!,
        entries: [
          { binding: 0, resource: { buffer: this.gridBuf! } },
          ...this.buffers.slice(0, 4).map((buffer, k) => ({ binding: k + 1, resource: { buffer } })),
          { binding: 5, resource: { buffer: this.counts! } },
          { binding: 6, resource: { buffer: this.sums! } },
          { binding: 7, resource: { buffer: this.values! } },
          { binding: 8, resource: { buffer: this.top! } },
        ],
      });
    }
    const enc = frame.encoder;
    enc.clearBuffer(this.counts!);
    if (this.opts.weight) enc.clearBuffer(this.sums!);
    enc.clearBuffer(this.top!);
    const cp = enc.beginComputePass({ label: 'bins' });
    cp.setBindGroup(0, this.computeGroup);
    cp.setPipeline(this.binPipe!);
    const [x1, y1] = dispatch(this.count);
    cp.dispatchWorkgroups(x1, y1);
    cp.setPipeline(this.finishPipe!);
    const [x2, y2] = dispatch(this.bins);
    cp.dispatchWorkgroups(x2, y2);
    cp.end();
    if (!this.reading) {
      enc.copyBufferToBuffer(this.top!, 0, this.readTop!, 0, 16);
      enc.copyBufferToBuffer(this.counts!, 0, this.readCounts!, 0, this.bins * 4);
      enc.copyBufferToBuffer(this.values!, 0, this.readCounts!, this.bins * 4, this.bins * 4);
      queueMicrotask(() => void this.readBack());
    }
  }

  /** Reads the maximum and the cells back for tooltips and legends, after the frame is submitted. */
  private async readBack(): Promise<void> {
    this.reading = true;
    try {
      const top = this.readTop!, cells = this.readCounts!;
      await Promise.all([top.mapAsync(GPUMapMode.READ), cells.mapAsync(GPUMapMode.READ)]);
      const t = new Uint32Array(top.getMappedRange().slice(0));
      this.max = new Float32Array(t.buffer)[0];
      this.occupied = t[1];
      const all = cells.getMappedRange(0, this.bins * 8).slice(0);
      this.cpuCounts = new Uint32Array(all, 0, this.bins);
      this.cpuValues = new Float32Array(all, this.bins * 4, this.bins);
      top.unmap();
      cells.unmap();
    } catch {
      // Destroyed or re-laid out while reading.
    } finally {
      this.reading = false;
    }
  }

  private group(): GPUBindGroup {
    const gpu = this.gpu!;
    if (!this.drawGroup || this.drawVersion !== gpu.arena.version) {
      this.drawGroup = gpu.device.createBindGroup({
        layout: this.drawLayout!,
        entries: [
          { binding: 0, resource: { buffer: gpu.arena.buffer, size: 256 } },
          { binding: 1, resource: this.ramp!.texture.createView() },
          { binding: 2, resource: this.ramp!.sampler },
          { binding: 3, resource: { buffer: this.gridBuf! } },
          { binding: 4, resource: { buffer: this.values! } },
          { binding: 5, resource: { buffer: this.top! } },
        ],
      });
      this.drawVersion = gpu.arena.version;
    }
    return this.drawGroup;
  }

  private uniforms(frame: Frame, slot: number): number[] {
    const [ox, oy] = originOffset(this.data.origin, frame.camera);
    return [ox, oy, this.opts.coverage ?? 0.92, this.opts.opacity ?? 0.85, this.opts.scale === 'log' ? 1 : 0, slot, this.highlighted, 0];
  }

  private vertices(): number {
    return this.grid.hex ? 18 : 6;
  }

  draw(pass: GPURenderPassEncoder, frame: Frame): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, 0));
    pass.setPipeline(this.drawPipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.group(), [off]);
    pass.draw(this.vertices(), this.bins);
  }

  pick(pass: GPURenderPassEncoder, frame: Frame, slot: number): void {
    if (!this.visible || !this.count) return;
    const off = this.gpu!.arena.push(this.uniforms(frame, slot));
    pass.setPipeline(this.pickPipe!);
    pass.setBindGroup(0, frame.viewGroup);
    pass.setBindGroup(1, this.group(), [off]);
    pass.draw(this.vertices(), this.bins);
  }

  describe(index: number): Record<string, unknown> {
    const out: Record<string, unknown> = { points: this.cpuCounts?.[index] ?? '…' };
    const m = this.opts.measure;
    if (this.opts.weight && m && m !== 'count') out[m] = this.cpuValues?.[index] ?? '…';
    return out;
  }

  highlight(index: number): void {
    this.highlighted = index;
  }

  get animating(): boolean {
    return false;
  }

  destroy(): void {
    for (const b of new Set(this.buffers)) b.destroy();
    for (const b of [this.counts, this.sums, this.values, this.top, this.readTop, this.readCounts, this.gridBuf]) b?.destroy();
    this.ramp?.texture.destroy();
  }
}

/** Workgroups of 256 for n items, split over two dimensions past the 65,535 limit. */
function dispatch(n: number): [number, number] {
  const groups = Math.max(1, Math.ceil(n / 256));
  if (groups <= 65535) return [groups, 1];
  const x = 65535;
  return [x, Math.ceil(groups / x)];
}

/** Points binned into hexagons. */
export const hexbin = (options: Omit<AggregateOptions, 'shape'>): AggregateLayer => new AggregateLayer({ ...options, shape: 'hexagon' });
/** Points binned into squares. */
export const grid = (options: Omit<AggregateOptions, 'shape'>): AggregateLayer => new AggregateLayer({ ...options, shape: 'square' });
