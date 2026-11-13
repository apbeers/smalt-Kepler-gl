# Writing a layer

A layer is an object the map calls each frame. The built-in layers follow the same contract as yours, and
`@smaltworks/smaltgl/layer-kit` holds everything they share: the contract's types, the view's WGSL, blend and stencil
states, buffer helpers, colour ramps and filters.

## The contract

```ts
import type { Layer, LayerGpu, Frame } from '@smaltworks/smaltgl/layer-kit';

// What the map calls, in order: attach once, then each frame prepare (compute passes, optional), draw (in the
// map's pass), and pick (optional, for hover and click). destroy when the layer is removed.
const outline: Pick<Layer, 'attach' | 'draw' | 'destroy'> = {
  attach(gpu: LayerGpu, redraw: () => void) {},
  draw(pass: GPURenderPassEncoder, frame: Frame) {},
  destroy() {},
};
```

The rules the map relies on:

- **Upload once.** `attach` gets the device and creates pipelines and buffers. Anything that changes per frame (the
  view, a filter, time, a colour) is a uniform, never a new upload of the data.
- **Group 0 is the view.** Prefix your shader with `VIEW_WGSL`: it declares `view` and the functions `toPixels`
  (world offset to pixels), `project` and `pixelsToClip`.
- **Uniforms go in the arena.** `gpu.arena.push([...])` returns a dynamic offset into one buffer every draw shares;
  bind it with `minBindingSize: 256`. Rebuild your bind group when `gpu.arena.version` changes (the arena grew).
- **The map's pass has 4 samples and a depth-stencil buffer.** Declare `multisample: { count: gpu.samples }` and
  `depthStencil: NO_STENCIL` (or `DEPTH_TESTED` for 3D shapes that hide each other).
- **Positions are offsets from an origin.** `projectColumns` gives 32-bit offsets from the data's centre;
  `originOffset(origin, frame.camera)` is what to add in the shader.

## A layer from scratch

Rings that pulse out from each point, driven by the frame time alone. Run it, then change the shader.

```js run dark
class PulseLayer {
  constructor(lng, lat) {
    this.id = 'pulse'
    this.visible = true
    this.animating = true // keep frames coming
    this.data = projectColumns(lng, lat)
    this.count = this.data.count
    this.bounds = this.data.bounds
  }
  attach(gpu) {
    this.gpu = gpu
    const { device } = gpu
    const module = device.createShaderModule({ code: VIEW_WGSL + `
      struct U { offset: vec2f, pad: vec2f };
      @group(1) @binding(0) var<uniform> u: U;
      @group(1) @binding(1) var<storage, read> pos: array<vec2f>;
      struct V { @builtin(position) p: vec4f, @location(0) local: vec2f, @location(1) @interpolate(flat) phase: f32 };
      const C = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1), vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1));
      @vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> V {
        let c = C[vi];
        let phase = fract(view.time * 0.5 + f32(i % 17u) / 17.0);
        let r = 3.0 + phase * 22.0;
        return V(pixelsToClip(toPixels(pos[i] + u.offset) + c * r), c, phase);
      }
      @fragment fn fs(v: V) -> @location(0) vec4f {
        let d = length(v.local);
        let ring = smoothstep(0.72, 0.84, d) * (1.0 - smoothstep(0.9, 1.0, d));
        return vec4f(0.9, 0.38, 0.18, 1.0) * ring * (1.0 - v.phase);
      }` })
    this.layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ] })
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [gpu.viewLayout, this.layout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format, blend: BLEND_ADD }] },
      depthStencil: NO_STENCIL,
      multisample: { count: gpu.samples },
    })
    this.positions = bufferFrom(device, this.data.positions, GPUBufferUsage.STORAGE)
  }
  draw(pass, frame) {
    const offset = this.gpu.arena.push([...originOffset(this.data.origin, frame.camera), 0, 0])
    if (this.version !== this.gpu.arena.version) {
      this.group = this.gpu.device.createBindGroup({ layout: this.layout, entries: [
        { binding: 0, resource: { buffer: this.gpu.arena.buffer, size: 256 } },
        { binding: 1, resource: { buffer: this.positions } },
      ] })
      this.version = this.gpu.arena.version
    }
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, frame.viewGroup)
    pass.setBindGroup(1, this.group, [offset])
    pass.draw(6, this.count)
  }
  destroy() {
    this.positions.destroy()
  }
}

const { dataset } = await generate('earthquakes', 3_000)
map.setLayers([new PulseLayer(dataset.columns.lng, dataset.columns.lat)])
map.setView({ center: [150, 10], zoom: 1.6 })
```

## Borrowing from the built-in layers

The kit's helpers are what the built-in layers use:

```ts
import { resolveColor, makeRamp, RAMP_WGSL, FILTER_WGSL, filterUniforms, storageOf, emptyStorage } from '@smaltworks/smaltgl/layer-kit';

declare const device: GPUDevice, fare: Float32Array, hour: Float32Array;

// A column through a ramp: 0–1 per row on the GPU, and a 256-entry ramp texture to read it with (RAMP_WGSL).
const color = resolveColor({ values: fare, ramp: 'ember' }, '#2F5BB7');
const ramp = makeRamp(device, color.table);
const tBuffer = storageOf(device, color.t, emptyStorage(device), 'colour');
// A GPU filter: the column in a storage buffer, the range in six uniform floats; FILTER_WGSL's passes(i, …) tests it.
const filterValues = filterUniforms([{ values: hour, range: [7, 9] }]);
```

The source of each built-in layer (`src/geo/layers/` in [smaltkit](https://github.com/stenhoor/smaltkit)) is a worked
example: `scatter.ts` is the simplest, `aggregate.ts` adds compute passes, `heatmap.ts` an offscreen pass, `polygons.ts` vertex and index buffers.
