# Layers

Every layer takes columns, uploads them to the GPU once, and draws with one or two draw calls a frame. Colours are a
CSS hex colour for everything, or a column through a ramp: `{ values, ramp: 'smalt' | 'glow' | 'ember' | 'verdant' |
'diverging' }`, or `{ values, categorical: true }` for codes 0, 1, 2…

## Points: `scatter`

Circles, one per row, with an anti-aliased edge cut in the fragment shader. Size can follow a column (`size`, square
root scale, so area follows value), in pixels or, with `units: 'meters'`, on the ground.

```js run
const { dataset } = await generate('earthquakes', 50_000)
const { lng, lat, magnitude, depth } = dataset.columns
map.setLayers([
  scatter({
    data: { lng, lat },
    color: { values: depth, ramp: 'ember', domain: [0, 300] },
    size: { values: magnitude, domain: [2.5, 8] },
    radius: 1, radiusMax: 9,
    opacity: 0.8,
    properties: { magnitude, depth },
  }),
])
map.setView({ center: [150, 10], zoom: 1.6 })
```

`additive: true` blends points by adding light, so dense places glow.

## Density: `heatmap`

Each point is splatted as a Gaussian into a float texture; a compute pass finds the densest pixel, and the colours
are scaled to it, so zooming re-normalises at once. `radius` is the kernel in pixels; `scale: 'log'` (the default)
shows sparse and dense areas together.

```js run dark
const { dataset } = await generate('rides', 500_000)
map.setLayers([heatmap({ data: dataset.columns, radius: 14 })])
map.setView({ center: [-73.95, 40.74], zoom: 11 })
```

## Bins: `hexbin` and `grid`

Points binned into hexagons or squares by a compute shader: atomic adds per cell, then the largest cell, all on the
GPU. `cellSize` is in metres. Cells can show the count, or the `sum` or `mean` of a `weight` column.

```js run
const { dataset } = await generate('rides', 1_000_000)
const c = dataset.columns
map.setLayers([hexbin({ data: c, cellSize: 250, weight: c.fare, measure: 'mean', ramp: 'ember' })])
map.setView({ center: [-73.96, 40.74], zoom: 11.3 })
```

`layer.update({ cellSize })` re-bins without uploading anything.

## Origins and destinations: `arcs`

One instance per arc; the vertex shader builds the curve. `greatCircle: true` follows the shortest path over the
globe; `animate` sends dashes from source to target. `targetColor` makes a gradient along each arc.

```js run dark
const { dataset } = await generate('flights', 20_000)
map.setLayers([
  arcs({ data: dataset.columns, greatCircle: true, animate: true, color: '#5CBDE8', targetColor: '#E5622F', width: 1, opacity: 0.4, additive: true }),
])
map.setView({ center: [10, 35], zoom: 1.3 })
```

## Paths and trips: `paths`, `trips`

Paths are polylines given as point columns and `starts`, the offset of each path's first point. With a time per
point, `trips` draws only what has happened by `time`, fading over `trail`; `layer.play(speed)` animates it.

```js run dark
const { dataset } = await generate('fleet', 300)
const t = trips({
  data: { starts: dataset.starts, ...dataset.points },
  color: { values: dataset.columns.vehicle, categorical: true },
  width: 2, trail: 1800, additive: true,
})
map.setLayers([t])
map.setView({ center: [-0.12, 51.51], zoom: 10.5 })
t.play(600) // ten minutes a second
```

## Polygons: `polygons`

Areas coloured by value. Rings are triangulated once on the CPU (concave shapes included); outlines are drawn on the
GPU. Give the ring points as columns with `starts`, one ring per polygon.

```js run
const { dataset } = await generate('districts', 2_500)
const c = dataset.columns
map.setLayers([
  polygons({
    data: { starts: dataset.starts, ...dataset.points },
    color: { values: c.income, ramp: 'verdant' },
    properties: { income: c.income, population: c.population },
  }),
])
map.setView({ center: [-87.7, 41.84], zoom: 9.6 })
```

## Many layers

Layers draw in order, over the basemap and under its labels. Each picks for itself: hovering shows the top object's
`properties`, and `map.on('click', …)` gets it.

```js run dark
const { dataset } = await generate('flights', 5_000)
const p = dataset.places
map.setLayers([
  arcs({ data: dataset.columns, greatCircle: true, color: '#0E7FAE', opacity: 0.35, width: 1 }),
  scatter({ data: { lng: p.lng, lat: p.lat }, color: '#FFFFFF', size: { values: p.weight }, radius: 2, radiusMax: 10, stroke: { color: '#0E7FAE' }, properties: { airport: p.names, flights: p.weight } }),
])
map.setView({ center: [0, 30], zoom: 1.4 })
```
