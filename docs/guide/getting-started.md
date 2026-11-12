# Getting started

smaltgl draws location data on a map with WebGPU. You give it columns of numbers (typed arrays of longitudes,
latitudes and values) and it puts them on the GPU once. From then on, panning, zooming, filtering and playing time are
changes to a few numbers the shaders read: the data never comes back to JavaScript.

## Install

smaltgl is not on npm yet. Depend on a commit of its repository:

```sh
npm install github:apbeers/smalt-Kepler-gl#<commit>
```

It needs a browser with WebGPU: Chrome and Edge 113 and later, Safari 26, and Firefox 141 and later on Windows.

## A first map

```ts
import { createMap, basemap, scatter } from '@smaltworks/smaltgl';

const map = await createMap(document.getElementById('map')!, {
  center: [-73.98, 40.75],
  zoom: 11,
  basemap: basemap(), // OpenStreetMap, from OpenFreeMap
});

map.addLayer(scatter({ data: { lng, lat }, color: '#2F5BB7', radius: 2 }));
```

The container needs a size; the map fills it and follows it when it resizes. Drag to pan, scroll or pinch to zoom,
right-drag (or Ctrl-drag) sideways to rotate and up or down to tilt, double-click to zoom in. Arrow keys and `+` and
`−` work when the map has focus; Shift with the up and down arrows tilts.

## Try it

Every example in these docs runs where it stands: press **Run**. Press **Edit** to change it. Examples have the map
(`map`), every smaltgl function, and `generate`, which makes sample data in a worker, already in scope.

```js run
// 100,000 ride pickups in New York, made in a worker.
const { dataset } = await generate('rides', 100_000)
const { lng, lat, fare } = dataset.columns

map.setLayers([
  scatter({ data: { lng, lat }, color: { values: fare, ramp: 'ember' }, radius: 1.5, properties: { fare } }),
])
map.fitBounds()
```

Hover a point to see its fare. The numbers under the map are what the last frame took.

## Data is columns

Layers read columns, not rows: one array of longitudes, one of latitudes, and one per value. `Float64Array` is best
for coordinates; plain arrays work too. smaltgl projects them once to positions relative to a nearby origin, so
32-bit floats on the GPU keep centimetre precision when you zoom into a street.

```js run
const n = 50_000
const lng = new Float64Array(n), lat = new Float64Array(n), v = new Float32Array(n)
for (let i = 0; i < n; i++) {
  const a = i * 0.0013, r = Math.sqrt(i / n) * 4
  lng[i] = 2.35 + Math.cos(a * 97) * r
  lat[i] = 48.86 + Math.sin(a * 97) * r * 0.66
  v[i] = r
}
map.setLayers([scatter({ data: { lng, lat }, color: { values: v, ramp: 'glow' }, radius: 1.2 })])
map.setView({ center: [2.35, 48.86], zoom: 6 })
```

## Next

- [Layers](./layers): points, heatmaps, hexagons and grids, arcs, trips, polygons.
- [Filters and time](./filters): ranges and playback, on the GPU.
- [Data from smaltdb](./smaltdb) and [from smaltcy](./smaltcy).
- The [tech demo](../demo): every option, on data from ten thousand rows to ten million.
