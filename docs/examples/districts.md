# Districts in Chicago

Chicago cut into census-tract-like districts, each with its population, density, median income and commute time.

## Median income

A choropleth: each district coloured by its median income. Hover for the numbers.

```js run
const { dataset } = await generate('districts', 1_500)
const c = dataset.columns
map.setLayers([polygons({ data: { starts: dataset.starts, ...dataset.points }, color: { values: c.income, ramp: 'verdant' }, properties: { income: c.income, population: c.population } })])
map.setView({ center: [-87.7, 41.84], zoom: 9.6 })
```

## Density in 3D

Raised by people per square kilometre: the Loop and the lakefront stand tallest.

```js run height=460
const { dataset } = await generate('districts', 1_500)
const c = dataset.columns
map.setLayers([polygons({ data: { starts: dataset.starts, ...dataset.points }, color: { values: c.density, ramp: 'ember' }, extrude: { values: c.density, scale: 0.4 }, properties: { density: c.density } })])
map.setView({ center: [-87.68, 41.86], zoom: 10.2, pitch: 50, bearing: 20 })
```

## Long commutes

Only districts whose average commute is over 40 minutes, filtered on the GPU.

```js run dark
const { dataset } = await generate('districts', 1_500)
const c = dataset.columns
map.setLayers([polygons({ data: { starts: dataset.starts, ...dataset.points }, color: { values: c.commute, ramp: 'smalt', reverse: true }, filters: [{ values: c.commute, range: [40, 120] }], properties: { minutes: c.commute } })])
map.setView({ center: [-87.7, 41.84], zoom: 9.6 })
```
