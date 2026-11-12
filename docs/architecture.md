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

| Folder | What it does | May import |
| --- | --- | --- |
| `src/core/` | The contracts between pieces (`contract.ts`), Web Mercator, the camera, colours and ramps (OKLab), WebGPU setup, the uniform arena | nothing else |
| `src/map/` | `renderer.ts` (device, frames, layers, basemap, picking, timing), `input.ts`, `overlays.ts` (tooltip, attribution), `map.ts` (them together) | core |
| `src/layers/` | One file per layer; `layer.ts`, `common.ts` and `triangulate.ts` shared; `kit.ts` for layers of your own | core |
| `src/basemap/` | `tile-source.ts` (workers, cache, plan; no GPU), `tile-renderer.ts`, `label-renderer.ts` and `labels.ts`, `mvt.ts` and `build.ts` (decoding), `style.ts`, `basemap.ts` (them together) | core |
| `src/data/` | `smaltdb.ts`, `smaltcy.ts`, `geojson.ts`, `columns.ts` | nothing |
| `src/datasets/` | One file per generator, `random.ts`, `types.ts`, the registry and its worker | nothing |

The rules are tested: see [Using the pieces](./guide/modules).

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
