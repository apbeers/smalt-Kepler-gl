# API

Everything is exported from `@smaltworks/smaltgl`; the pieces are also entry points of their own.

| Entry point | What it holds |
| --- | --- |
| `@smaltworks/smaltgl` | All of the below except the datasets |
| `/core` | Projection (`projectColumns`, `toWorld`, …), `Camera`, colours and ramps, WebGPU setup |
| `/layers` | `scatter`, `heatmap`, `hexbin`, `grid`, `arcs`, `paths`, `trips`, `polygons` |
| `/basemap` | `basemap`, themes, the vector tile decoder |
| `/data` | `querySmaltdb`, `loadSmaltdb`, `graphLayers`, `supplyChainJSON`, `numeric` |
| `/datasets` | `generate` and the generators |

## The map

```ts
const map = await createMap(container, options)
```

| Option | Default | |
| --- | --- | --- |
| `center` | `[0, 20]` | `[longitude, latitude]` |
| `zoom` | `1.5` | 0 is the whole world in 512 pixels; each step doubles |
| `bearing` | `0` | Degrees clockwise |
| `basemap` | none | `basemap({ theme, tiles })`, or `null` |
| `layers` | `[]` | |
| `pixelRatio` | the screen's, at most 2 | |
| `tooltip` | `true` | `false`, or `(picked) => html` |
| `minZoom`, `maxZoom` | 0, 22 | |

| Method | |
| --- | --- |
| `addLayer(layer)`, `removeLayer(layerOrId)`, `setLayers(layers)`, `getLayers()` | Layers draw in order |
| `setView({ center, zoom, bearing })`, `getView()`, `flyTo(view, ms)`, `fitBounds(bounds?)` | |
| `setBasemap(basemap \| null)`, `getBasemap()` | Passing the current basemap again picks up a theme change |
| `on('move' \| 'hover' \| 'click' \| 'frame', fn)` | Returns a function that removes the listener |
| `redraw()` | Asks for a frame |
| `renderNow()`, `idle()` | Draw now and wait for the GPU; wait until every tile in view is drawn |
| `stats` | The last frame: `cpuMs`, `gpuMs`, `fps`, `objects`, `tilesPending` |
| `destroy()` | Frees the GPU device and removes the canvas |

`createMap` throws `GpuUnavailableError` where WebGPU isn't available; `isWebGpuAvailable()` checks first.

## Layers

All layers take `id`, `visible`, and `data`; most take `color`, `opacity`, `filters` and `properties` (columns shown
on hover). Points are `{ lng, lat }` columns, or the result of `projectColumns`.

| Layer | Options |
| --- | --- |
| `scatter` | `radius`, `radiusMax`, `size: { values, domain }`, `units: 'pixels' \| 'meters'`, `stroke: { color, width }`, `additive` |
| `heatmap` | `weight`, `radius`, `intensity`, `ramp`, `scale: 'log' \| 'linear'` |
| `hexbin`, `grid` | `cellSize` (metres), `weight`, `measure: 'count' \| 'sum' \| 'mean'`, `ramp`, `scale`, `coverage` |
| `arcs` | `data: { sourceLng, sourceLat, targetLng, targetLat }`, `targetColor`, `width`, `height`, `greatCircle`, `animate`, `additive` |
| `paths`, `trips` | `data: { starts, lng, lat, times? }`, `width`, `time`, `trail`, `additive` |
| `polygons` | `data: { starts, lng, lat }`, `stroke: { color, width }` |

Layer methods: `update(changes)` for looks (no upload), `setFilter(index, [min, max])`, and for paths `setTime(t)`,
`play(speed)`, `pause()`, `onTime`.

`color` is a CSS hex colour, or `{ values, ramp?, domain?, reverse?, categorical? }`. Ramps: `smalt`, `glow`, `ember`,
`verdant`, `diverging`, or an array of hex colours.

A filter is `{ values: Float32Array, range: [min, max] }`, at most two per layer (one for polygons).
