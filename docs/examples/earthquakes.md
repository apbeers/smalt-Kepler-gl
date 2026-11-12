# Earthquakes

Earthquakes from 2000 to 2025 along the world's plate boundaries: ten times fewer for each step up in magnitude, deeper
on the landward side of the trenches, with aftershocks after the big ones.

## Magnitude and depth

Size is magnitude, colour is depth: shallow in pale orange, deep in violet.

```js run
const { dataset } = await generate('earthquakes', 30_000)
const c = dataset.columns
map.setLayers([scatter({ data: c, color: { values: c.depth, ramp: 'ember', domain: [0, 300], reverse: true }, size: { values: c.magnitude, domain: [2.5, 8] }, radius: 1, radiusMax: 10, opacity: 0.8, properties: { magnitude: c.magnitude, depth: c.depth, year: c.year } })])
map.setView({ center: [150, 10], zoom: 1.6 })
```

## The big ones

Only magnitude 6 and over, filtered on the GPU.

```js run dark
const { dataset } = await generate('earthquakes', 50_000)
const c = dataset.columns
map.setLayers([scatter({ data: c, color: '#E5622F', size: { values: c.magnitude, domain: [6, 9] }, radius: 3, radiusMax: 14, stroke: { width: 1 }, filters: [{ values: c.magnitude, range: [6, 10] }], properties: { magnitude: c.magnitude, year: c.year } })])
map.setView({ center: [150, 10], zoom: 1.4 })
```

## The Ring of Fire in 3D

Counted in 100 km hexagons and raised: Japan, Indonesia, Tonga and the Andes stand tallest.

```js run dark height=460
const { dataset } = await generate('earthquakes', 50_000)
map.setLayers([hexbin({ data: dataset.columns, cellSize: 100_000, extrude: 1_500_000, ramp: 'ember', scale: 'log' })])
map.setView({ center: [165, 5], zoom: 1.8, pitch: 50, bearing: -15 })
```

## Year by year

A three-year window moves through the 25 years.

```js run
const { dataset } = await generate('earthquakes', 30_000)
const c = dataset.columns
const layer = scatter({ data: c, color: { values: c.magnitude, ramp: 'glow' }, radius: 2, filters: [{ values: c.year, range: [2000, 2003] }] })
map.setLayers([layer])
map.setView({ center: [150, 10], zoom: 1.4 })
let y = 2000
const step = () => {
  y = y >= 2023 ? 2000 : y + 0.02
  layer.setFilter(0, [y, y + 3])
  if (map.getLayers().includes(layer)) requestAnimationFrame(step)
}
requestAnimationFrame(step)
```
