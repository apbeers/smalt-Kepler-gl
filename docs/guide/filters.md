# Filters and time

A layer takes up to two filters: a column of values and a range. The column is uploaded with the layer; the range is
two numbers in a uniform. Rows outside it are not drawn, and aggregation layers re-bin without them, so moving a
range costs one frame, not a pass over the data in JavaScript.

```js run dark
const { dataset } = await generate('rides', 1_000_000)
const c = dataset.columns
const hour = { values: c.hour, range: [7, 9] }
const layer = hexbin({ data: c, cellSize: 200, filters: [hour] })
map.setLayers([layer])
map.setView({ center: [-73.95, 40.74], zoom: 11 })

// Sweep the hour across the day: two numbers change each frame.
let t = 0
const step = () => {
  t = (t + 0.05) % 22
  layer.setFilter(0, [t, t + 2])
  if (map.getLayers().includes(layer)) requestAnimationFrame(step)
}
requestAnimationFrame(step)
```

## Time

Trips are the other kind of time: `trips` and `paths` take a time per point, `setTime(t)` shows the moment `t`, and
`play(speed)` runs the clock (`speed` in time units per second). `onTime` reports the clock for a slider.

```js run dark
const { dataset } = await generate('fleet', 1000)
const t = trips({ data: { starts: dataset.starts, ...dataset.points }, color: '#E5622F', width: 1.5, trail: 2400, additive: true })
map.setLayers([t])
map.setView({ center: [-0.12, 51.5], zoom: 10.2 })
t.setTime(10 * 3600) // ten in the morning
```
