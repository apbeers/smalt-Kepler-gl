# Ships

Positions reported by ships along the lanes between 36 container ports, through the Strait of Malacca, the Suez and
Panama canals, and round the capes. Slow near ports, fast in open water.

## Lanes by ship type

Containers, tankers, bulk carriers and passenger ships, one colour each.

```js run dark
const { dataset } = await generate('ships', 50_000)
const c = dataset.columns
map.setLayers([scatter({ data: c, color: { values: c.type, categorical: true }, radius: 1.2, additive: true, properties: { knots: c.speed } })])
map.setView({ center: [70, 15], zoom: 1.6 })
```

## Slowing down for port

Coloured by speed: ships crawl near Singapore, Rotterdam and Shanghai.

```js run dark
const { dataset } = await generate('ships', 50_000)
const c = dataset.columns
map.setLayers([scatter({ data: c, color: { values: c.speed, ramp: 'glow', reverse: true, domain: [0, 22] }, radius: 1.5, properties: { knots: c.speed } })])
map.setView({ center: [104, 2], zoom: 5 })
```

## The busiest waters

Counted in 120 km grid cells.

```js run dark
const { dataset } = await generate('ships', 50_000)
map.setLayers([grid({ data: dataset.columns, cellSize: 120_000, ramp: 'glow', scale: 'log' })])
map.setView({ center: [60, 20], zoom: 1.5 })
```

## Tankers only

Type 1 is a tanker: a filter of [1, 1] keeps only those.

```js run dark
const { dataset } = await generate('ships', 50_000)
const c = dataset.columns
map.setLayers([scatter({ data: c, color: '#E6C24A', radius: 1.8, filters: [{ values: c.type, range: [1, 1] }] })])
map.setView({ center: [60, 20], zoom: 1.6 })
```
