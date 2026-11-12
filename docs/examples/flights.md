# Flights

Scheduled flights between 96 of the world's busiest airports: busier airports have more of them, and nearer pairs are
likelier. Each row has both ends, the seats, the distance, the departure hour and an airline.

## Every route, on great circles

The shortest path over the globe, which curves on a flat map. Dashes flow from origin to destination.

```js run dark
const { dataset } = await generate('flights', 3_000)
map.setLayers([arcs({ data: dataset.columns, greatCircle: true, animate: true, color: '#5CBDE8', targetColor: '#E5622F', width: 1, opacity: 0.5, additive: true })])
map.setView({ center: [15, 30], zoom: 1.3 })
```

## Airports by traffic

Each airport sized by its flights. Hover for its code.

```js run dark
const { dataset } = await generate('flights', 5_000)
const p = dataset.places
map.setLayers([scatter({ data: { lng: p.lng, lat: p.lat }, color: { values: p.weight, ramp: 'glow' }, size: { values: p.weight }, radius: 2, radiusMax: 14, stroke: { width: 1 }, properties: { airport: p.names, flights: p.weight } })])
map.setView({ center: [15, 30], zoom: 1.3 })
```

## One hub

Only the flights out of London Heathrow, picked out in JavaScript before they go to the GPU.

```js run dark
const { dataset } = await generate('flights', 10_000)
const c = dataset.columns
const out = { sourceLng: [], sourceLat: [], targetLng: [], targetLat: [] }
for (let i = 0; i < dataset.count; i++)
  if (Math.abs(c.sourceLng[i] + 0.45) < 0.01 && Math.abs(c.sourceLat[i] - 51.47) < 0.01)
    for (const k of Object.keys(out)) out[k].push(c[k][i])
map.setLayers([arcs({ data: out, greatCircle: true, animate: true, color: '#E5622F', targetColor: '#FFF4C2', width: 2, opacity: 0.8 })])
map.setView({ center: [10, 40], zoom: 1.6 })
```

## Long haul only

Coloured by distance, filtered on the GPU to flights over 8,000 km.

```js run dark
const { dataset } = await generate('flights', 5_000)
const c = dataset.columns
map.setLayers([arcs({ data: c, greatCircle: true, color: { values: c.distance, ramp: 'glow' }, width: 1.2, opacity: 0.7, filters: [{ values: c.distance, range: [8000, 20000] }], properties: { km: c.distance, seats: c.seats } })])
map.setView({ center: [40, 20], zoom: 1.2 })
```

## By airline

Raised arcs instead of great circles, one colour per airline.

```js run dark
const { dataset } = await generate('flights', 2_000)
const c = dataset.columns
map.setLayers([arcs({ data: c, color: { values: c.airline, categorical: true }, height: 0.3, width: 1.2, opacity: 0.6 })])
map.setView({ center: [-30, 35], zoom: 2 })
```

## Departures through the day

A three-hour window of departure times moves across the day.

```js run dark
const { dataset } = await generate('flights', 5_000)
const c = dataset.columns
const layer = arcs({ data: c, greatCircle: true, color: '#5CBDE8', targetColor: '#E5622F', width: 1.2, opacity: 0.7, additive: true, filters: [{ values: c.hour, range: [0, 3] }] })
map.setLayers([layer])
map.setView({ center: [15, 30], zoom: 1.3 })
let t = 0
const step = () => {
  t = (t + 0.03) % 21
  layer.setFilter(0, [t, t + 3])
  if (map.getLayers().includes(layer)) requestAnimationFrame(step)
}
requestAnimationFrame(step)
```
