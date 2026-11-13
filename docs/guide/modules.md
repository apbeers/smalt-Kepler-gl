# Using the pieces

smaltgl is built from parts that work on their own. Each is an entry point: import one, and your bundle holds it and
what it is built on, nothing more.

The parts live in the family's shared kit, [smaltkit](https://github.com/stenhoor/smaltkit), as `smaltkit/geo/<part>`,
so that every smalt app (smaltbi's reports among them) draws maps with the same code
([ADR 0003](../adr/0003-visuals-in-smaltkit)). Each of smaltgl's entry points below is one line that re-exports the kit's part of the same name: import either. The
kit's `test/geo-modules.test.ts` checks which part imports which and what each loads; smaltgl's `test/modules.test.ts`
checks that its entry points are the kit's parts and bundles them alone.

```
core ── the contracts, projection, camera, colours, GPU setup
 ├── map        the renderer, input, tooltip, attribution     (core only)
 ├── layers     one file per layer, and the layer kit          (core only)
 └── basemap    tile source, tile renderer, labels, decoder    (core only)
data       smaltdb, smaltcy, GeoJSON adapters                  (nothing)
datasets   generators and their worker                         (nothing)
visual     map visuals for hosts: catalogue, MapVisual          (core, map, layers, basemap, data)
 └── hosts  adapters for one host each (smaltbi's plugin)        (visual only)
```

The map, the layers and the basemap never import each other: they meet in `core/contract.ts`, so a layer from
somewhere else plugs into the map, and the basemap's parts can serve another renderer.

| Entry point | The code | Use it to |
| --- | --- | --- |
| `@smaltworks/smaltgl` | `smaltkit/geo` | Everything but the datasets |
| `@smaltworks/smaltgl/core` | `smaltkit/geo/core` | Project coordinates, drive a camera, make colour ramps, set up WebGPU; the contracts |
| `@smaltworks/smaltgl/map` | `smaltkit/geo/map` | A map in a page (`createMap`), or just the renderer (`MapRenderer`), input, tooltip or attribution |
| `@smaltworks/smaltgl/layers` | `smaltkit/geo/layers` | Every built-in layer |
| `@smaltworks/smaltgl/scatter` | `smaltkit/geo/scatter` | Points only |
| `@smaltworks/smaltgl/heatmap` | `smaltkit/geo/heatmap` | Density only |
| `@smaltworks/smaltgl/aggregate` | `smaltkit/geo/aggregate` | Hexagon and grid bins only |
| `@smaltworks/smaltgl/arcs` | `smaltkit/geo/arcs` | Arcs only |
| `@smaltworks/smaltgl/paths` | `smaltkit/geo/paths` | Paths and trips only |
| `@smaltworks/smaltgl/polygons` | `smaltkit/geo/polygons` | Polygons only |
| `@smaltworks/smaltgl/layer-kit` | `smaltkit/geo/layer-kit` | Write a layer of your own ([guide](./custom-layers)) |
| `@smaltworks/smaltgl/basemap` | `smaltkit/geo/basemap` | The basemap, or one of its parts: `TileSource`, `TileRenderer`, `LabelRenderer` |
| `@smaltworks/smaltgl/vector-tiles` | `smaltkit/geo/vector-tiles` | Decode vector tiles and build their geometry, with no GPU (workers, servers, tests) |
| `@smaltworks/smaltgl/data` | `smaltkit/geo/data` | Every data adapter |
| `@smaltworks/smaltgl/smaltdb` | `smaltkit/geo/smaltdb` | SQL results as columns; load columns and CSV files |
| `@smaltworks/smaltgl/smaltcy` | `smaltkit/geo/smaltcy` | Cypher results as points and arcs |
| `@smaltworks/smaltgl/geojson` | `smaltkit/geo/geojson` | GeoJSON as columns |
| `@smaltworks/smaltgl/datasets` | `src/datasets/` (smaltgl's own) | Generate sample data, in a worker or not |
| `@smaltworks/smaltgl/visual` | `smaltkit/geo/visual` | Map visuals for hosts (BI tools, notebooks): a catalogue with roles and options, and `MapVisual` ([guide](./embedding)) |

The examples below are type-checked by `test/docs-ts.test.ts`.

## A map with only what you use

```ts
import { createMap } from '@smaltworks/smaltgl/map';
import { hexbin } from '@smaltworks/smaltgl/aggregate';

declare const el: HTMLElement, lng: Float64Array, lat: Float64Array;

// No basemap, no other layers in the bundle.
const map = await createMap(el, { center: [-73.98, 40.75], zoom: 11 });
map.addLayer(hexbin({ data: { lng, lat }, cellSize: 250 }));
```

## The renderer alone

`MapRenderer` draws a map on any canvas, with no input, tooltip or DOM around it: for a notebook cell, a report, a
thumbnail, or a page with its own controls. Give it your own camera to drive, and your own device to share.

```ts
import { MapRenderer } from '@smaltworks/smaltgl/map';
import { Camera } from '@smaltworks/smaltgl/core';
import { scatter } from '@smaltworks/smaltgl/scatter';

declare const canvas: HTMLCanvasElement, device: GPUDevice, lng: Float64Array, lat: Float64Array;

const camera = new Camera();
camera.setView({ center: [2.35, 48.86], zoom: 11 });
const renderer = await MapRenderer.create(canvas, { camera, device });
renderer.resize(600, 400);
renderer.addLayer(scatter({ data: { lng, lat }, radius: 2 }));
await renderer.renderNow();

// What is under a pixel, from the GPU's picking pass.
const hit = await renderer.pick(300, 200);
```

`createMap` takes `device` too, and `interactive: false` for a map that doesn't move under the pointer.

## The basemap's parts

The basemap is a `TileSource` (fetching in workers, the cache, which tiles to draw), a `TileRenderer` (fills and
lines) and a `LabelRenderer`. The source has no GPU code: drive another renderer with it, or count tiles in a test.

```ts
import { TileSource } from '@smaltworks/smaltgl/basemap';
import { Camera } from '@smaltworks/smaltgl/core';

const source = new TileSource({ tiles: 'https://tiles.openfreemap.org/planet' });
source.hooks = {
  onReady: (tile) => console.log('loaded', tile.id, tile.geometry?.labels.length, 'labels'),
  changed: () => console.log(source.pending, 'still loading'),
};
const camera = new Camera();
camera.width = 800;
camera.height = 600;
camera.setView({ center: [-0.12, 51.5], zoom: 12 });
const plan = source.plan(camera); // the tiles to draw now; requests the missing ones
```

## Vector tiles without a GPU

```ts
import { decodeTile, buildTile } from '@smaltworks/smaltgl/vector-tiles';

const bytes = new Uint8Array(await (await fetch('https://tiles.openfreemap.org/planet/20261101_080013_pt/12/1205/1539.pbf')).arrayBuffer());
const layers = decodeTile(bytes); // layer name → features, properties, geometry in tile units
const geometry = buildTile(bytes, 12); // fill fans, line segments and labels by style group
```

## Data adapters on their own

```ts
import { querySmaltdb } from '@smaltworks/smaltgl/smaltdb';
import { graphLayers } from '@smaltworks/smaltgl/smaltcy';
import { readGeoJSON } from '@smaltworks/smaltgl/geojson';

declare const db: Parameters<typeof querySmaltdb>[0], graph: Parameters<typeof graphLayers>[0], text: string;

const { columns } = await querySmaltdb(db, 'SELECT lng, lat FROM places');
const network = graphLayers(graph, 'MATCH p = ()-[]->() RETURN p');
const shapes = readGeoJSON(text);
```

## Sample data without the worker

```ts
import { rides, seaRoute } from '@smaltworks/smaltgl/datasets';

const sample = rides(1_000, 42); // the same thousand rides for seed 42, on this thread
const route = seaRoute('Shanghai', 'Rotterdam'); // waypoints through Malacca and Suez
```
