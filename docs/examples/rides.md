# Rides in New York

Ride-hailing pickups across New York City: busy neighbourhoods, the street grid, rush hours and late nights. Each row
has a pickup and a drop-off, an hour, a fare and a distance.

## Every pickup, coloured by fare

Points blended additively: where many overlap, the colour glows. Hover one for its fare.

```js run dark
const { dataset } = await generate('rides', 50_000)
const c = dataset.columns
map.setLayers([scatter({ data: c, color: { values: c.fare, ramp: 'ember', domain: [5, 60] }, radius: 1.8, additive: true, properties: { fare: c.fare, hour: c.hour } })])
map.setView({ center: [-73.96, 40.74], zoom: 11.3 })
```

## Where pickups are densest

A heatmap: each point spreads into its neighbourhood, and the colour scales to the busiest spot on screen.

```js run dark
const { dataset } = await generate('rides', 50_000)
map.setLayers([heatmap({ data: dataset.columns, radius: 16 })])
map.setView({ center: [-73.96, 40.74], zoom: 11 })
```

## Evening rush against late night

The same rides drawn twice with GPU filters on the hour: orange for 5 to 7 in the evening, blue for after 10 at night.
Commuters fill Midtown; late nights belong to the Lower East Side and Williamsburg.

```js run dark
const { dataset } = await generate('rides', 50_000)
const c = dataset.columns
map.setLayers([
  scatter({ data: c, color: '#E5622F', radius: 1.8, additive: true, filters: [{ values: c.hour, range: [17, 19] }] }),
  scatter({ data: c, color: '#5CBDE8', radius: 1.8, additive: true, filters: [{ values: c.hour, range: [22, 24] }] }),
])
map.setView({ center: [-73.97, 40.73], zoom: 11.6 })
```

## Trips as arcs

Each ride from pickup to drop-off. Filtered to rides over 12 km, mostly to and from the airports.

```js run dark
const { dataset } = await generate('rides', 30_000)
const c = dataset.columns
map.setLayers([
  arcs({
    data: { sourceLng: c.lng, sourceLat: c.lat, targetLng: c.dropLng, targetLat: c.dropLat },
    color: '#5CBDE8', targetColor: '#E5622F', width: 1.2, height: 0.35, opacity: 0.6, additive: true, animate: true,
    filters: [{ values: c.distance, range: [12, 100] }],
  }),
])
map.setView({ center: [-73.88, 40.71], zoom: 10.3 })
```

## Mean fare in 3D

Hexagons 300 m across, raised by the mean fare of the rides in each. Tilted to see the heights.

```js run dark height=460
const { dataset } = await generate('rides', 50_000)
const c = dataset.columns
map.setLayers([hexbin({ data: c, cellSize: 300, weight: c.fare, measure: 'mean', ramp: 'ember', extrude: 1500 })])
map.setView({ center: [-73.96, 40.73], zoom: 11.4, pitch: 55, bearing: -20 })
```

## The day, hour by hour

A two-hour window slides across the day: only the filter's two numbers change each frame, and the GPU re-bins.

```js run dark
const { dataset } = await generate('rides', 50_000)
const c = dataset.columns
const layer = grid({ data: c, cellSize: 250, filters: [{ values: c.hour, range: [0, 2] }], ramp: 'glow', scale: 'log' })
map.setLayers([layer])
map.setView({ center: [-73.95, 40.74], zoom: 11 })
let t = 0
const step = () => {
  t = (t + 0.04) % 22
  layer.setFilter(0, [t, t + 2])
  if (map.getLayers().includes(layer)) requestAnimationFrame(step)
}
requestAnimationFrame(step)
```

## Asked with SQL

The rides in a smaltdb table, and a query for the most expensive trips; the result goes straight to a layer.

```js run dark
const db = await smaltdb.open('examples-rides', { storage: 'memory' })
const { dataset } = await generate('rides', 30_000)
const c = dataset.columns
await loadSmaltdb(db, 'rides', { lng: c.lng, lat: c.lat, fare: c.fare, hour: c.hour })
const { columns } = await querySmaltdb(db, 'SELECT lng, lat, fare FROM rides WHERE fare > 40')
map.setLayers([scatter({ data: { lng: columns.lng, lat: columns.lat }, color: { values: columns.fare, ramp: 'ember' }, radius: 3, properties: { fare: columns.fare } })])
map.setView({ center: [-73.88, 40.71], zoom: 10.4 })
```
