# Architecture

```
columns (typed arrays) ── projectColumns ──▶ GPU buffers, uploaded once per layer
                                                   │
camera ─▶ view uniforms ─┐                         ▼
                         ├─▶ frame: prepare (compute and offscreen passes: bins, heat)
filters, time ─▶ layer uniforms (one 256-byte slot each, one upload a frame)
                         │        map pass (MSAA ×4, stencil): basemap fills and lines
                         │                                     data layers, in order
                         │                                     basemap labels
                         └─▶ pick pass (one pixel, on hover or click) ─▶ id ─▶ tooltip
tile workers: fetch ─▶ decode MVT ─▶ style groups ─▶ fans, segments, labels ─▶ buffers
```

## Pieces

| Folder | What it does |
| --- | --- |
| `src/core/` | Web Mercator in world units, the camera, colours and ramps (OKLab), WebGPU setup, the uniform arena |
| `src/map/` | The map: canvas, render loop, input, picking, frame statistics, tooltips |
| `src/layers/` | One file per layer; `common.ts` has colour, filters and bind group helpers |
| `src/basemap/` | Protobuf and MVT decoding, style groups and themes, tile cover, the tile worker, labels, the renderer |
| `src/data/` | Adapters for smaltdb (SQL, columnar results) and smaltcy (Cypher results to points and arcs) |
| `src/datasets/` | Generators and their worker |

## Decisions that shape it

- **WebGPU only.** Compute shaders do the aggregation and the heatmap's normalisation; the family's graph renderer
  (smaltcy) made the same choice. Browsers without WebGPU get a clear message ([ADR 0001](./adr/0001-smaltgl)).
- **Our own basemap renderer.** One device and one pass for map and data; the stencil fill means no triangulation
  of map polygons ([ADR 0001](./adr/0001-smaltgl)).
- **Positions relative to an origin.** Each layer stores 32-bit offsets from the centre of its data and receives
  `origin − camera` each frame, computed in 64-bit on the CPU.
- **One uniform buffer a frame.** Every draw takes a 256-byte slot of an arena bound with a dynamic offset: hundreds
  of tile draws cost one upload.
- **No runtime dependencies.** smaltdb and smaltcy are used through their public methods, passed in by the app.
