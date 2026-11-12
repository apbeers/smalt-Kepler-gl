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

## Your own data

`readGeoJSON(text or object)` reads a FeatureCollection, a Feature or a bare geometry into points, lines and polygons
(holes included), each with its features' properties as columns. Multi-geometries become one row per part.

```js run
const blocks = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Courtyard', area: 3 }, geometry: { type: 'Polygon', coordinates: [
      [[2.33, 48.855], [2.345, 48.855], [2.345, 48.865], [2.33, 48.865], [2.33, 48.855]],
      [[2.335, 48.858], [2.335, 48.862], [2.34, 48.862], [2.34, 48.858], [2.335, 48.858]],
    ] } },
    { type: 'Feature', properties: { name: 'Block', area: 1 }, geometry: { type: 'Polygon', coordinates: [
      [[2.35, 48.855], [2.36, 48.855], [2.355, 48.865], [2.35, 48.855]],
    ] } },
  ],
}
const g = readGeoJSON(blocks)
map.setLayers([polygons({ data: g.polygons, color: { values: g.polygons.columns.area, ramp: 'ember' }, properties: g.polygons.columns, stroke: { width: 2 } })])
map.setView({ center: [2.345, 48.86], zoom: 13.5 })
```

CSV files go through smaltdb: see [Data from smaltdb](./smaltdb#your-own-csv).

The generators are plain functions too (`rides(n)`, `flights(n)`, …, from `@smaltworks/smaltgl/datasets`), for tests
and for workers of your own.
