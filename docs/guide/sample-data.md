# Sample data

`generate(name, size, seed?)` makes a dataset in a worker and hands its typed arrays to the page without copying. The
data is synthetic, with the shape of the real thing, around real places; the same seed gives the same data.

| Name | What it is | Kind | Columns |
| --- | --- | --- | --- |
| `rides` | Ride-hailing pickups in New York: busy neighbourhoods, the street grid, rush hours and late nights | points | `lng`, `lat`, `hour`, `fare`, `distance`, `passengers`, `dropLng`, `dropLat` |
| `flights` | Flights between 96 large airports, by a gravity model | arcs | `sourceLng`, `sourceLat`, `targetLng`, `targetLat`, `seats`, `distance`, `hour`, `airline`; `places` |
| `fleet` | Delivery rounds across London, with a time per position | paths | points `lng`, `lat`, `times`; per path `vehicle`, `stops`, `distance` |
| `earthquakes` | Earthquakes along the plate boundaries, Gutenberg–Richter magnitudes, aftershocks | points | `lng`, `lat`, `magnitude`, `depth`, `year` |
| `ships` | Ship positions on the lanes between 36 container ports | points | `lng`, `lat`, `speed`, `heading`, `type` |
| `districts` | Chicago in census-tract-like districts | polygons | per polygon `population`, `density`, `income`, `commute` |

`supplyChain(stores)` makes a graph (suppliers, factories, warehouses, stores) for [smaltcy](./smaltcy).

```js run
const { dataset, ms } = await generate('ships', 300_000)
map.setLayers([scatter({ data: dataset.columns, color: { values: dataset.columns.type, categorical: true }, radius: 1 })])
map.setView({ center: [70, 15], zoom: 1.6 })
console.log(`generated in ${ms.toFixed(0)} ms`)
```

The generators are plain functions too (`rides(n)`, `flights(n)`, …, from `@smaltworks/smaltgl/datasets`), for tests
and for workers of your own.
