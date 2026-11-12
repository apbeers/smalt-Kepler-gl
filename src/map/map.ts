/**
 * The map: one canvas, one WebGPU device, one render pass per frame. Frames are drawn only when something changed
 * (the view, a layer, a tile arriving) or while a layer animates, so a still map costs nothing.
 */
import { Camera, type ViewState } from '../core/camera.js';
import { initGpu, SAMPLES, STENCIL_FORMAT, UniformArena, type Gpu } from '../core/gpu.js';
import type { Bounds } from '../core/mercator.js';
import type { Frame, Layer, LayerGpu, Picked } from '../layers/layer.js';
import { attachInput } from './input.js';

/** What the map needs from a basemap (basemap/basemap.ts is the one smaltgl ships). */
export interface MapBasemap {
  readonly dark: boolean;
  /** Text for the attribution line (HTML). */
  readonly attribution: string;
  /** The colour behind everything. */
  readonly background: readonly [number, number, number, number];
  attach(gpu: LayerGpu, redraw: () => void): void;
  /** Fills and lines, before the data layers. */
  draw(pass: GPURenderPassEncoder, frame: Frame): void;
  /** Labels, after the data layers. */
  drawLabels(pass: GPURenderPassEncoder, frame: Frame): void;
  /** Tiles still loading. */
  readonly pending: number;
  /** Everything the view needs is drawn. */
  readonly idle: boolean;
  destroy(): void;
}

export interface MapOptions extends Partial<ViewState> {
  readonly basemap?: MapBasemap | null;
  readonly layers?: readonly Layer[];
  /** Device pixel ratio to draw at (default: the screen's, at most 2). */
  readonly pixelRatio?: number;
  /** Show the hovered object's values in a tooltip (default true). */
  readonly tooltip?: boolean | ((picked: Picked) => string | null);
  readonly minZoom?: number;
  readonly maxZoom?: number;
}

/** What each frame took, for the statistics panels. */
export interface FrameStats {
  /** Milliseconds of CPU time to record the frame. */
  cpuMs: number;
  /** Milliseconds the GPU spent on the frame, when the adapter can time it. */
  gpuMs?: number;
  /** Frames per second over the last second, while frames are being drawn. */
  fps: number;
  /** Objects drawn by the data layers. */
  objects: number;
  frames: number;
  tilesPending: number;
}

type Listener<T> = (value: T) => void;
interface Events {
  move: ViewState;
  hover: Picked | null;
  click: Picked | null;
  frame: FrameStats;
}

export class SmaltMap {
  readonly camera = new Camera();
  readonly canvas: HTMLCanvasElement;
  readonly container: HTMLElement;
  readonly stats: FrameStats = { cpuMs: 0, fps: 0, objects: 0, frames: 0, tilesPending: 0 };
  private gpu!: Gpu;
  private layerGpu!: LayerGpu;
  private viewBuffer!: GPUBuffer;
  private viewGroup!: GPUBindGroup;
  private arena!: UniformArena;
  private color?: GPUTexture;
  private stencil?: GPUTexture;
  private pickTex?: GPUTexture;
  private pickRead?: GPUBuffer;
  private pickBusy = false;
  private pickAt?: { x: number; y: number; click: boolean };
  private layers: Layer[] = [];
  private basemap: MapBasemap | null = null;
  private frameRequested = 0;
  private start = performance.now();
  private ratio: number;
  private detach: () => void = () => {};
  private resize?: ResizeObserver;
  private listeners = new Map<keyof Events, Set<Listener<never>>>();
  private fpsWindow: number[] = [];
  private timer?: { query: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; busy: boolean };
  private tooltipEl: HTMLDivElement;
  private attributionEl: HTMLDivElement;
  private hovered: Picked | null = null;
  private destroyed = false;
  private options: MapOptions;
  private lost = false;

  private constructor(container: HTMLElement, options: MapOptions) {
    this.container = container;
    this.options = options;
    this.ratio = options.pixelRatio ?? Math.min(2, globalThis.devicePixelRatio || 1);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'smaltgl-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Map. Drag to pan, scroll to zoom, right-drag to rotate.');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'none', outline: 'none' });
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(this.canvas);
    injectStyles(document);
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'smaltgl-tooltip';
    this.tooltipEl.hidden = true;
    this.attributionEl = document.createElement('div');
    this.attributionEl.className = 'smaltgl-attribution';
    container.append(this.tooltipEl, this.attributionEl);
    if (options.minZoom !== undefined) this.camera.minZoom = options.minZoom;
    if (options.maxZoom !== undefined) this.camera.maxZoom = options.maxZoom;
    this.camera.setView({ center: options.center ?? [0, 20], zoom: options.zoom ?? 1.5, bearing: options.bearing ?? 0 });
  }

  /** Creates a map in `container` (which should have a size). Throws `GpuUnavailableError` without WebGPU. */
  static async create(container: HTMLElement, options: MapOptions = {}): Promise<SmaltMap> {
    const map = new SmaltMap(container, options);
    try {
      await map.init();
    } catch (e) {
      map.canvas.remove();
      map.tooltipEl.remove();
      map.attributionEl.remove();
      throw e;
    }
    return map;
  }

  private async init(): Promise<void> {
    this.gpu = await initGpu(this.canvas);
    const { device } = this.gpu;
    device.lost.then((info) => {
      this.lost = true;
      if (!this.destroyed) console.error(`smaltgl: the GPU device was lost (${info.reason}): ${info.message}`);
    });
    this.arena = new UniformArena(device);
    this.viewBuffer = device.createBuffer({ label: 'smaltgl view', size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const viewLayout = device.createBindGroupLayout({
      label: 'smaltgl view',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }],
    });
    this.viewGroup = device.createBindGroup({ layout: viewLayout, entries: [{ binding: 0, resource: { buffer: this.viewBuffer } }] });
    const arena = this.arena;
    this.layerGpu = {
      device,
      format: this.gpu.format,
      samples: SAMPLES,
      viewLayout,
      get arena() {
        return arena;
      },
    };
    if (this.gpu.timestamps) {
      this.timer = {
        query: device.createQuerySet({ type: 'timestamp', count: 2 }),
        resolve: device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
        read: device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
        busy: false,
      };
    }
    this.fitCanvas();
    this.resize = new ResizeObserver(() => {
      this.fitCanvas();
      this.redraw();
    });
    this.resize.observe(this.container);
    this.detach = attachInput(this.canvas, this.camera, {
      changed: () => {
        this.redraw();
        this.emit('move', this.camera.view());
        this.hideTooltip();
      },
      hover: (x, y) => {
        this.pickAt = { x, y, click: false };
        this.redraw();
      },
      leave: () => {
        this.pickAt = undefined;
        this.setHovered(null);
      },
      click: (x, y) => {
        this.pickAt = { x, y, click: true };
        this.redraw();
      },
    });
    this.setBasemap(this.options.basemap ?? null);
    for (const l of this.options.layers ?? []) this.addLayer(l);
    this.redraw();
  }

  private fitCanvas(): void {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.camera.width = w;
    this.camera.height = h;
    const pw = Math.max(1, Math.round(w * this.ratio)), ph = Math.max(1, Math.round(h * this.ratio));
    if (this.canvas.width === pw && this.canvas.height === ph && this.color) return;
    this.canvas.width = pw;
    this.canvas.height = ph;
    this.color?.destroy();
    this.stencil?.destroy();
    this.pickTex?.destroy();
    const { device, format } = this.gpu;
    this.color = device.createTexture({ label: 'smaltgl colour', size: [pw, ph], format, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.stencil = device.createTexture({ label: 'smaltgl stencil', size: [pw, ph], format: STENCIL_FORMAT, sampleCount: SAMPLES, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.pickTex = device.createTexture({ label: 'smaltgl pick', size: [pw, ph], format: 'r32uint', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    this.pickRead ??= device.createBuffer({ label: 'smaltgl pick read', size: 256, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Layers and basemap

  /** Sets the basemap (or none). Passing the current one again picks up a theme change. */
  setBasemap(basemap: MapBasemap | null): void {
    if (basemap !== this.basemap) {
      this.basemap?.destroy();
      this.basemap = basemap;
      basemap?.attach(this.layerGpu, () => this.redraw());
    }
    this.attributionEl.innerHTML = basemap?.attribution ?? '';
    this.attributionEl.hidden = !basemap;
    this.container.classList.toggle('smaltgl-dark', !!basemap?.dark);
    this.redraw();
  }

  addLayer(layer: Layer): Layer {
    if (this.layers.some((l) => l.id === layer.id)) throw new Error(`A layer with id ${layer.id} is already on the map`);
    layer.attach(this.layerGpu, () => this.redraw());
    this.layers.push(layer);
    this.redraw();
    return layer;
  }

  removeLayer(layer: Layer | string): void {
    const i = this.layers.findIndex((l) => l === layer || l.id === layer);
    if (i < 0) return;
    const [l] = this.layers.splice(i, 1);
    l.destroy();
    if (this.hovered?.layer === l.id) this.setHovered(null);
    this.redraw();
  }

  /** Replaces every layer (destroying the old ones that are not in the new list). */
  setLayers(layers: readonly Layer[]): void {
    for (const l of this.layers) if (!layers.includes(l)) l.destroy();
    const keep = new Set(this.layers);
    this.layers = [];
    this.setHovered(null);
    for (const l of layers) {
      if (keep.has(l)) this.layers.push(l);
      else this.addLayer(l);
    }
    this.redraw();
  }

  getBasemap(): MapBasemap | null {
    return this.basemap;
  }

  getLayers(): readonly Layer[] {
    return this.layers;
  }

  // -------------------------------------------------------------------------------------------------------------------
  // View

  setView(view: Partial<ViewState>): void {
    this.camera.setView(view);
    this.redraw();
    this.emit('move', this.camera.view());
  }

  getView(): ViewState {
    return this.camera.view();
  }

  /** Fits world bounds (or every layer's data) into the view. */
  fitBounds(bounds?: Bounds, paddingPx = 40): void {
    const b = bounds ?? this.dataBounds();
    if (b) this.setView(this.camera.fit(b, paddingPx));
  }

  private dataBounds(): Bounds | undefined {
    let out: Bounds | undefined;
    for (const l of this.layers) {
      const b = l.bounds;
      if (!b) continue;
      out = out ? [Math.min(out[0], b[0]), Math.min(out[1], b[1]), Math.max(out[2], b[2]), Math.max(out[3], b[3])] : [...b];
    }
    return out;
  }

  /** Glides to a view over `ms` milliseconds. */
  flyTo(view: Partial<ViewState>, ms = 1200): Promise<void> {
    const from = this.camera.view();
    const fx = this.camera.x, fy = this.camera.y;
    const to = new Camera();
    to.setView({ ...from, ...view });
    const t0 = performance.now();
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        // Zoom out a little mid-flight when travelling far.
        const dist = Math.hypot(to.x - fx, to.y - fy) * 2 ** Math.min(from.zoom, to.zoom);
        const arc = Math.min(4, Math.log2(1 + dist)) * Math.sin(Math.PI * e);
        this.camera.x = fx + (to.x - fx) * e;
        this.camera.y = fy + (to.y - fy) * e;
        this.camera.zoom = from.zoom + (to.zoom - from.zoom) * e - arc;
        this.camera.bearing = (from.bearing ?? 0) + ((to.bearing - (from.bearing ?? 0)) * e);
        this.camera.clamp();
        this.redraw();
        this.emit('move', this.camera.view());
        if (t < 1 && !this.destroyed) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Events

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => set.delete(fn as Listener<never>);
  }

  private emit<K extends keyof Events>(event: K, value: Events[K]): void {
    for (const fn of this.listeners.get(event) ?? []) (fn as Listener<Events[K]>)(value);
  }

  // -------------------------------------------------------------------------------------------------------------------
  // Frames

  /** Asks for a frame (at most one per display refresh). */
  redraw(): void {
    if (this.frameRequested || this.destroyed) return;
    this.frameRequested = requestAnimationFrame((now) => {
      this.frameRequested = 0;
      this.frame(now);
    });
  }

  /**
   * Resolves when the basemap has drawn every tile the view needs and the GPU has finished the frame (or after
   * `timeoutMs`). For screenshots, tests and benchmarks.
   */
  async idle(timeoutMs = 30000): Promise<void> {
    const t0 = performance.now();
    for (;;) {
      await this.renderNow();
      if (!this.basemap || this.basemap.idle) break;
      if (performance.now() - t0 > timeoutMs) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    // Labels place against the finished tiles.
    await this.renderNow();
  }

  /** Draws a frame now and resolves when the GPU has finished it (for tests and benchmarks). */
  async renderNow(): Promise<void> {
    this.frame(performance.now());
    await this.gpu.device.queue.onSubmittedWorkDone();
  }

  private frame(now: number): void {
    if (this.destroyed || this.lost || !this.color) return;
    const t0 = performance.now();
    const { device, context } = this.gpu;
    this.arena.reset();
    const time = (now - this.start) / 1000;
    device.queue.writeBuffer(this.viewBuffer, 0, this.camera.shaderView(this.ratio, time));
    const encoder = device.createCommandEncoder({ label: 'smaltgl frame' });
    const frame: Frame = {
      camera: this.camera,
      pixelRatio: this.ratio,
      time,
      viewGroup: this.viewGroup,
      encoder,
      width: this.canvas.width,
      height: this.canvas.height,
      dark: !!this.basemap?.dark,
    };
    for (const l of this.layers) if (l.visible) l.prepare?.(frame);
    const bg = this.basemap?.background ?? [0, 0, 0, 0];
    const pass = encoder.beginRenderPass({
      label: 'smaltgl map',
      colorAttachments: [
        {
          view: this.color.createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          clearValue: { r: bg[0] * bg[3], g: bg[1] * bg[3], b: bg[2] * bg[3], a: bg[3] },
          loadOp: 'clear',
          storeOp: 'discard',
        },
      ],
      depthStencilAttachment: { view: this.stencil!.createView(), stencilClearValue: 0, stencilLoadOp: 'clear', stencilStoreOp: 'discard' },
      ...(this.timer && !this.timer.busy ? { timestampWrites: { querySet: this.timer.query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
    });
    pass.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    this.basemap?.draw(pass, frame);
    let objects = 0;
    for (const l of this.layers) {
      if (!l.visible) continue;
      l.draw(pass, frame);
      objects += l.count;
    }
    this.basemap?.drawLabels(pass, frame);
    pass.end();
    const timing = this.timer && !this.timer.busy;
    if (timing) {
      encoder.resolveQuerySet(this.timer!.query, 0, 2, this.timer!.resolve, 0);
      encoder.copyBufferToBuffer(this.timer!.resolve, 0, this.timer!.read, 0, 16);
    }
    const pick = this.pickAt && !this.pickBusy ? this.pickAt : undefined;
    if (pick) this.encodePick(encoder, frame, pick.x, pick.y);
    this.arena.flush();
    device.queue.submit([encoder.finish()]);
    if (pick) {
      this.pickAt = undefined;
      void this.readPick(pick.click, pick.x, pick.y);
    }
    if (timing) void this.readTimer();

    this.stats.cpuMs = performance.now() - t0;
    this.stats.objects = objects;
    this.stats.frames++;
    this.stats.tilesPending = this.basemap?.pending ?? 0;
    this.fpsWindow.push(now);
    while (this.fpsWindow.length && this.fpsWindow[0] < now - 1000) this.fpsWindow.shift();
    this.stats.fps = this.fpsWindow.length;
    this.emit('frame', this.stats);
    if (this.arena.overflowed || this.layers.some((l) => l.visible && l.animating)) this.redraw();
  }

  private encodePick(encoder: GPUCommandEncoder, frame: Frame, x: number, y: number): void {
    const px = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(x * this.ratio)));
    const py = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(y * this.ratio)));
    const pass = encoder.beginRenderPass({
      label: 'smaltgl pick',
      colorAttachments: [{ view: this.pickTex!.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setViewport(0, 0, this.canvas.width, this.canvas.height, 0, 1);
    // Only the pixel under the pointer is shaded.
    pass.setScissorRect(px, py, 1, 1);
    this.layers.forEach((l, i) => {
      if (l.visible && l.pick) l.pick(pass, frame, i + 1);
    });
    pass.end();
    encoder.copyTextureToBuffer({ texture: this.pickTex!, origin: [px, py] }, { buffer: this.pickRead!, bytesPerRow: 256 }, [1, 1]);
  }

  private async readPick(click: boolean, x: number, y: number): Promise<void> {
    this.pickBusy = true;
    try {
      await this.pickRead!.mapAsync(GPUMapMode.READ);
      const id = new Uint32Array(this.pickRead!.getMappedRange(0, 4))[0];
      this.pickRead!.unmap();
      let picked: Picked | null = null;
      if (id) {
        const layer = this.layers[(id >>> 24) - 1];
        const index = (id & 0xffffff) - 1;
        if (layer) picked = { layer: layer.id, index, properties: layer.describe?.(index) ?? {}, lngLat: this.camera.lngLatAt(x, y) };
      }
      if (click) this.emit('click', picked);
      else {
        this.setHovered(picked);
        if (picked) this.showTooltip(picked, x, y);
      }
    } catch {
      // The map was destroyed while reading.
    } finally {
      this.pickBusy = false;
    }
  }

  private async readTimer(): Promise<void> {
    const t = this.timer!;
    t.busy = true;
    try {
      await t.read.mapAsync(GPUMapMode.READ);
      const [a, b] = new BigUint64Array(t.read.getMappedRange(0, 16));
      t.read.unmap();
      if (b > a) this.stats.gpuMs = Number(b - a) / 1e6;
    } catch {
      // Destroyed.
    } finally {
      t.busy = false;
    }
  }

  private setHovered(p: Picked | null): void {
    const same = p?.layer === this.hovered?.layer && p?.index === this.hovered?.index;
    if (same) return;
    if (this.hovered) this.layers.find((l) => l.id === this.hovered!.layer)?.highlight?.(-1);
    this.hovered = p;
    if (p) this.layers.find((l) => l.id === p.layer)?.highlight?.(p.index);
    this.canvas.style.cursor = p ? 'pointer' : '';
    if (!p) this.hideTooltip();
    this.emit('hover', p);
    this.redraw();
  }

  private showTooltip(p: Picked, x: number, y: number): void {
    const opt = this.options.tooltip ?? true;
    if (opt === false) return;
    const html = typeof opt === 'function' ? opt(p) : defaultTooltip(p);
    if (!html) return this.hideTooltip();
    this.tooltipEl.innerHTML = html;
    this.tooltipEl.hidden = false;
    const w = this.tooltipEl.offsetWidth, h = this.tooltipEl.offsetHeight;
    const left = x + 14 + w > this.camera.width ? x - 14 - w : x + 14;
    const top = y + 14 + h > this.camera.height ? y - 14 - h : y + 14;
    this.tooltipEl.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
  }

  private hideTooltip(): void {
    this.tooltipEl.hidden = true;
  }

  get device(): GPUDevice {
    return this.gpu.device;
  }

  /** The GPU can time frames on this adapter. */
  get gpuTiming(): boolean {
    return !!this.gpu.timestamps;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.frameRequested) cancelAnimationFrame(this.frameRequested);
    this.detach();
    this.resize?.disconnect();
    for (const l of this.layers) l.destroy();
    this.basemap?.destroy();
    this.canvas.remove();
    this.tooltipEl.remove();
    this.attributionEl.remove();
    this.gpu.device.destroy();
  }
}

/** The tooltip's and attribution's look, added once per document; override with your own CSS. */
const STYLES = `
.smaltgl-tooltip { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; max-width: 320px; padding: 6px 8px;
  border-radius: 6px; background: rgba(255,255,255,.96); color: #151922; border: 1px solid #D6DBE4; font: 12px/1.45 Geist, system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(20,23,31,.12); }
.smaltgl-dark .smaltgl-tooltip { background: rgba(27,31,41,.96); color: #E9EBF0; border-color: #2C3240; }
.smaltgl-tooltip table { border-collapse: collapse; margin: 0; display: table; }
.smaltgl-tooltip th { text-align: left; font-weight: 500; color: #5C6375; padding: 1px 10px 1px 0; border: 0; background: none; }
.smaltgl-dark .smaltgl-tooltip th { color: #9096A3; }
.smaltgl-tooltip td { font-family: 'Geist Mono', ui-monospace, monospace; padding: 1px 0; border: 0; text-align: right; }
.smaltgl-tooltip tr { border: 0; background: none !important; }
.smaltgl-attribution { position: absolute; right: 0; bottom: 0; z-index: 1; padding: 1px 6px; font: 11px/1.6 Geist, system-ui, sans-serif;
  background: rgba(255,255,255,.75); color: #3F4656; border-top-left-radius: 4px; }
.smaltgl-dark .smaltgl-attribution { background: rgba(20,23,31,.75); color: #B9BEC9; }
.smaltgl-attribution a { color: inherit; text-decoration: none; }
.smaltgl-attribution a:hover { text-decoration: underline; }
`;

function injectStyles(doc: Document): void {
  if (doc.getElementById('smaltgl-styles')) return;
  const el = doc.createElement('style');
  el.id = 'smaltgl-styles';
  el.textContent = STYLES;
  doc.head.prepend(el);
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function formatValue(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return escapeHtml(String(v));
}

/** The tooltip: the hovered object's values as a small table. */
export function defaultTooltip(p: Picked): string | null {
  const rows = Object.entries(p.properties);
  if (!rows.length) return null;
  return `<table>${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${formatValue(v)}</td></tr>`).join('')}</table>`;
}

/** Creates a map. */
export const createMap = (container: HTMLElement, options?: MapOptions): Promise<SmaltMap> => SmaltMap.create(container, options);
