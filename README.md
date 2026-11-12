<h1><code>sm<b>alt</b>gl</code></h1>

<a href="https://smaltworks.dev/stability"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/public/work-in-progress-on-dark.svg"><img alt="Work in progress. Come build with us." src="docs/public/work-in-progress.svg" height="56"></picture></a>

**Small. Alternative. Maps.** Maps for smaltdb, in the browser: location data drawn on the GPU with WebGPU.

[Documentation](https://andrewbeers.me/smalt-Kepler-gl/) · [Tech demo](https://andrewbeers.me/smalt-Kepler-gl/demo) · [smaltworks.dev](https://smaltworks.dev)

**smaltgl** draws columns of numbers on a map: points, heatmaps, hexagon and grid bins, arcs, trips over time and
polygons. Data goes to the GPU once; binning, density, filters and playback run in shaders. The basemap is
OpenStreetMap data from OpenFreeMap, drawn by smaltgl's own renderer in the same GPU pass. Layers take smaltdb's
columnar query results and smaltcy's Cypher results as they are.

> **Status: 0.1.0, work in progress.** Seven layer kinds, GPU filters and playback, picking and tooltips, the vector
> basemap with labels in light and dark, adapters for smaltdb and smaltcy, generated sample datasets and a tech demo.
> WebGPU only ([ADR 0001](docs/adr/0001-smaltgl.md)).

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

| Entry point (`@smaltworks/smaltgl…`) | Source | Use it to |
| --- | --- | --- |
| `.` | `src/index.ts` | Everything but the datasets: `createMap`, layers, basemap, adapters |
| `/core` | `src/core/` | Projection, camera, colours and ramps, WebGPU setup |
| `/layers` | `src/layers/` | `scatter`, `heatmap`, `hexbin`, `grid`, `arcs`, `paths`, `trips`, `polygons` |
| `/basemap` | `src/basemap/` | The OpenStreetMap basemap, its themes, the vector tile decoder |
| `/data` | `src/data/` | `querySmaltdb`, `loadSmaltdb`, `graphLayers` (smaltcy) |
| `/datasets` | `src/datasets/` | `generate` and the sample data generators |

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
