/**
 * What every layer implements, and what the map hands it each frame. Layers own their GPU buffers and pipelines; the
 * map owns the device, the camera, the render targets and the order of passes:
 *
 *   1. `prepare`: compute passes and offscreen passes (aggregation, density), recorded on the frame's encoder;
 *   2. the map's main pass: the basemap, then every layer's `draw`, then the basemap's labels;
 *   3. on hover or click, a picking pass: every pickable layer's `pick`, into a 32-bit id target.
 */
import type { Camera } from '../core/camera.js';
import type { UniformArena } from '../core/gpu.js';
import type { Bounds } from '../core/mercator.js';

export interface LayerGpu {
  readonly device: GPUDevice;
  /** The canvas's colour format. */
  readonly format: GPUTextureFormat;
  /** Samples per pixel in the main pass. */
  readonly samples: number;
  /** Group 0 of every pipeline: the view uniforms. */
  readonly viewLayout: GPUBindGroupLayout;
  /** The frame's uniform arena; a draw's group-1 binding 0 is a 256-byte slot of it, at a dynamic offset. */
  readonly arena: UniformArena;
}

/** Whether the device can blend into 32-bit float targets (heatmaps then never saturate). */
export const canBlendFloat32 = (device: GPUDevice): boolean => device.features.has('float32-blendable' as GPUFeatureName);

export interface Frame {
  readonly camera: Camera;
  readonly pixelRatio: number;
  /** Seconds since the map started; animations read it. */
  readonly time: number;
  readonly viewGroup: GPUBindGroup;
  /** For compute and offscreen passes in `prepare`. */
  readonly encoder: GPUCommandEncoder;
  /** Size of the drawing buffer in device pixels. */
  readonly width: number;
  readonly height: number;
  /** Dark basemap: layers may pick lighter defaults. */
  readonly dark: boolean;
}

/** One picked object: the layer it is in, its index in the layer's data, and what the layer says about it. */
export interface Picked {
  readonly layer: string;
  readonly index: number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly lngLat?: readonly [number, number];
}

export interface Layer {
  readonly id: string;
  visible: boolean;
  /** Set while the layer animates (trips playing, arcs flowing): the map keeps drawing frames. */
  readonly animating?: boolean;
  /** World bounds of the layer's data, for fitting the view. */
  readonly bounds?: Bounds;
  /** How many objects the layer draws, for the frame statistics. */
  readonly count: number;
  /** Creates pipelines and buffers. Called once, when the layer is added to a map. */
  attach(gpu: LayerGpu, redraw: () => void): void;
  prepare?(frame: Frame): void;
  draw(pass: GPURenderPassEncoder, frame: Frame): void;
  /** Draws ids into the picking target: `(layerSlot << 24) | (index + 1)`, 0 for nothing. */
  pick?(pass: GPURenderPassEncoder, frame: Frame, slot: number): void;
  /** What a picked index means: the row's values, or a bin's count. */
  describe?(index: number): Picked['properties'];
  /** Highlights one object (or none, with -1). */
  highlight?(index: number): void;
  destroy(): void;
}

/** A filter the GPU applies every frame: rows whose value is outside [min, max] are not drawn (or counted). */
export interface GpuFilter {
  readonly values: Float32Array;
  range: [number, number];
}

/** A colour: a CSS hex colour for every object, or a column mapped through a ramp. */
export type ColorSpec =
  | string
  | {
      readonly values: Float32Array | Float64Array | ArrayLike<number>;
      /** Domain of the values; by default their minimum and maximum. */
      readonly domain?: readonly [number, number];
      readonly ramp?: import('../core/color.js').RampName | readonly string[];
      /** Values are category codes 0, 1, 2…: colour each from the categorical palette. */
      readonly categorical?: boolean;
      readonly reverse?: boolean;
    };

let next = 0;
export const autoId = (kind: string): string => `${kind}-${++next}`;

/** min and max of finite values. */
export function extent(values: ArrayLike<number>): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo > hi ? [0, 1] : [lo, hi];
}

export const asF32 = (v: ArrayLike<number>): Float32Array => (v instanceof Float32Array ? v : Float32Array.from(v));

/** The world-offset of a layer's origin from the camera centre: what every layer passes its shader first. */
export const originOffset = (origin: readonly [number, number], camera: Camera): [number, number] => [origin[0] - camera.x, origin[1] - camera.y];

/** WGSL that turns a value in 0–1 into a colour from the layer's ramp texture (group 1, bindings 1 and 2). */
export const RAMP_WGSL = /* wgsl */ `
@group(1) @binding(1) var rampTex: texture_2d<f32>;
@group(1) @binding(2) var rampSampler: sampler;
fn ramp(t: f32) -> vec4f {
  return textureSampleLevel(rampTex, rampSampler, vec2f(clamp(t, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5), 0.0);
}
`;
