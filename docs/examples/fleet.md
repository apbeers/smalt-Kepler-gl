# Delivery fleet

Vans, cargo bikes and trucks on delivery rounds across London: out of a depot in the morning, along the streets to each
stop, and back. Every position has a time (seconds since midnight).

## The day played back

Only what has happened is drawn, fading over half an hour. Ten minutes pass every second.

```js run dark
const { dataset } = await generate('fleet', 200)
const t = trips({
  data: { starts: dataset.starts, ...dataset.points },
  color: { values: dataset.columns.vehicle, categorical: true },
  width: 2, trail: 1800, additive: true,
  properties: { stops: dataset.columns.stops },
})
map.setLayers([t])
map.setView({ center: [-0.12, 51.51], zoom: 10.6 })
t.play(600)
```

## Every route

Whole paths, one colour per kind of vehicle: vans (blue), cargo bikes (orange), trucks (teal).

```js run dark
const { dataset } = await generate('fleet', 150)
map.setLayers([paths({ data: { starts: dataset.starts, lng: dataset.points.lng, lat: dataset.points.lat }, color: { values: dataset.columns.vehicle, categorical: true }, width: 1.2, opacity: 0.7, properties: { stops: dataset.columns.stops, km: dataset.columns.distance } })])
map.setView({ center: [-0.12, 51.51], zoom: 10.4 })
```

## Where the fleet spends its time

Every GPS position as a heatmap: depots and delivery areas stand out, because vehicles wait there.

```js run dark
const { dataset } = await generate('fleet', 300)
map.setLayers([heatmap({ data: dataset.points, radius: 14 })])
map.setView({ center: [-0.12, 51.51], zoom: 10.2 })
```

## In 3D

The same positions binned into 400 m hexagons and raised by count.

```js run dark height=460
const { dataset } = await generate('fleet', 300)
map.setLayers([hexbin({ data: dataset.points, cellSize: 400, extrude: 2500, ramp: 'glow', scale: 'log' })])
map.setView({ center: [-0.12, 51.5], zoom: 10.6, pitch: 50, bearing: 15 })
```
