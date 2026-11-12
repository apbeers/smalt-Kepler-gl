# Data from smaltdb

[smaltdb](https://smaltdb.dev) runs SQL in a Web Worker and can return a result as columns: numeric columns arrive as
`Float64Array`s, handed from its worker without copying. `querySmaltdb` asks for that, and the columns go to a layer as
they are.

```ts
import { open } from 'smaltdb';
import { querySmaltdb, scatter } from '@smaltworks/smaltgl';

const db = await open('trips');
const { columns } = await querySmaltdb(db, 'SELECT lng, lat, fare FROM rides WHERE hour BETWEEN 17 AND 19');
map.addLayer(scatter({ data: { lng: columns.lng, lat: columns.lat }, color: { values: columns.fare, ramp: 'ember' } }));
```

`loadSmaltdb` writes columns into a new table (through smaltdb's CSV import, in one transaction), which is how this
example gets generated rides into a database in this tab:

```js run dark
const db = await smaltdb.open('docs-rides', { storage: 'memory' })
const { dataset } = await generate('rides', 100_000)
const c = dataset.columns
await loadSmaltdb(db, 'rides', { lng: c.lng, lat: c.lat, hour: c.hour, fare: c.fare })

const { columns, count, ms } = await querySmaltdb(db, `
  SELECT lng, lat, fare FROM rides
  WHERE hour >= 22 OR hour < 3`)
map.setLayers([scatter({ data: { lng: columns.lng, lat: columns.lat }, color: { values: columns.fare, ramp: 'ember' }, radius: 1.5, additive: true })])
map.setView({ center: [-73.96, 40.73], zoom: 11.5 })
console.log(`${count} late-night rides in ${ms.toFixed(0)} ms`)
```

Keep the work where it is fastest: let SQL choose the rows (joins, aggregates, anything with an index), and let the GPU
do what changes every frame (filters on ranges, binning at the current cell size, colour).

## Your own CSV

`importCsv(db, table, file)` loads a CSV file (a `File`, a `Blob` or text) into a new table, with column types
inferred by smaltdb, and reads it back as columns. It finds the longitude and latitude columns by their usual names
(`lng`, `lon`, `longitude`, `x`; `lat`, `latitude`, `y`). In the [tech demo](../demo), choose **Your own file** and drop
a CSV on the map, then query it with SQL.

## What smaltgl uses

`querySmaltdb(db, sql, params?)` calls `db.query(sql, params, { rowMode: 'columnar' })` and nothing else;
`loadSmaltdb(db, table, columns)` calls `db.exec` and `db.importCSV`. smaltgl doesn't import smaltdb: any object with
those methods works, and an app that doesn't use smaltdb doesn't load it.
