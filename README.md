<h1><code>sm<b>alt</b>gl</code></h1>

<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="docs/public/work-in-progress.svg" height="56"></picture></a>

**Small. Alternative. Maps.** Maps for smaltdb, in the browser: location data drawn on the GPU with WebGPU.

[Documentation](https://andrewbeers.me/smalt-Kepler-gl/) · [Tech demo](https://andrewbeers.me/smalt-Kepler-gl/demo) · [smaltworks.dev](https://smaltworks.dev)

**smaltgl** draws columns of numbers on a map: points, heatmaps, hexagon and grid bins, arcs, trips over time and
polygons. Data goes to the GPU once; binning, density, filters and playback run in shaders. The basemap is
OpenStreetMap data from OpenFreeMap, drawn by smaltgl's own renderer in the same GPU pass. Layers take smaltdb's
columnar query results and smaltcy's Cypher results as they are.

> **Status: 0.1.0, work in progress.** Seven layer kinds, 3D (a tilting camera, extruded columns and polygons), GPU
> filters and playback, picking and tooltips, the vector basemap with place, road and river labels in light and dark,
> GeoJSON and CSV import, adapters for smaltdb and smaltcy, generated sample datasets and a tech demo with shareable
> links. WebGPU only ([ADR 0001](docs/adr/0001-smaltgl.md)).

## Use it

smaltgl is not on npm yet. Depend on a commit of this repository:

```sh
npm install github:apbeers/smalt-Kepler-gl#<commit>
```

```ts
import { createMap, basemap, hexbin, querySmaltdb } from '@smaltworks/smaltgl';
import { open } from 'smaltdb';

const map = await createMap(document.getElementById('map')!, {
  center: [-73.98, 40.75],
  zoom: 11,
  basemap: basemap({ theme: 'dark' }),
});

const db = await open('trips');
const { columns } = await querySmaltdb(db, 'SELECT lng, lat, fare FROM rides WHERE hour BETWEEN 17 AND 19');
map.addLayer(hexbin({ data: { lng: columns.lng, lat: columns.lat }, cellSize: 200, weight: columns.fare, measure: 'mean' }));
```

## How it fits together

```
columns ─→ projectColumns ─→ GPU buffers (once)
camera, filters, time ─→ uniforms (every frame) ─→ compute passes (bins, density) ─→ one render pass:
                                                    basemap fills and lines → data layers → labels
tile workers: fetch → decode vector tiles → style groups → buffers
```

Each piece is an entry point of its own: import one, and your bundle holds it and what it is built on, nothing more.
The map, the layers and the basemap meet only in `core/contract.ts`, so each can be used, replaced or worked on
without the others. [Using the pieces](docs/guide/modules.md) has the full table and an example of each;
`test/modules.test.ts` keeps the boundaries.

| Entry point (`@smaltworks/smaltgl…`) | Use it to |
| --- | --- |
| `.` | Everything but the datasets |
| `/core` | Projection, camera, colours, WebGPU setup; the contracts between pieces |
| `/map` | `createMap`, or the `MapRenderer` alone (any canvas, your own device), input, tooltip, attribution |
| `/layers`, `/scatter`, `/heatmap`, `/aggregate`, `/arcs`, `/paths`, `/polygons` | Every layer, or one |
| `/layer-kit` | Write a layer of your own ([guide](docs/guide/custom-layers.md)) |
| `/basemap` | The basemap, or its parts: `TileSource` (no GPU), `TileRenderer`, `LabelRenderer` |
| `/vector-tiles` | Decode vector tiles and build their geometry, with no GPU |
| `/data`, `/smaltdb`, `/smaltcy`, `/geojson` | Data adapters, together or one at a time |
| `/datasets` | Sample data generators, in a worker or not |
| `/visual` | Map visuals for other apps: a catalogue with roles and options, and `MapVisual` ([guide](docs/guide/embedding.md)) |
| `/smaltbi-plugin` | The visuals as a [smaltbi](https://github.com/stenhoor/smaltbi) plugin: one file, nothing to import |

## Development

Requires Node 20+.

```sh
npm ci
npm run check            # typecheck and unit tests
npm run test:browser     # headless Chromium with WebGPU (SwiftShader): layers, basemap, every docs example, the demo
npm run docs:dev         # the site, with runnable examples and the tech demo
npm run build            # dist/ and type declarations
npm run bench            # frame times per layer and size (headless: for comparing changes)
```

The basemap's map data is © OpenStreetMap contributors, available under the Open Database Licence; tiles from
OpenFreeMap in the OpenMapTiles schema. The browser tests use generated tiles and need no network.

<a href="https://smaltworks.dev"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/a-smaltworks-project-on-dark.svg"><img alt="A smaltworks project" src="docs/public/a-smaltworks-project.svg" height="28"></picture></a>

MIT License
