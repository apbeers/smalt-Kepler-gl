# Supply chain

A supply chain as a graph in [smaltcy](../guide/smaltcy): suppliers in Asia ship parts to factories, factories ship to
regional warehouses, and warehouses deliver to stores. Each Cypher query's nodes become points and its relationships
arcs.

## The whole network

Arcs coloured by relationship type, nodes by kind.

```js run dark
const graph = smaltcy.open()
graph.load(supplyChainJSON(supplyChain(300)))
const m = graphLayers(graph, 'MATCH p = (a)-[r]->(b) RETURN p')
map.setLayers([
  arcs({ data: m.edges, color: { values: m.edges.type, categorical: true }, greatCircle: true, width: 1.2, opacity: 0.7, properties: m.edges.properties }),
  scatter({ data: m.nodes, color: { values: m.nodes.label, categorical: true }, radius: 3, stroke: { width: 1 }, properties: m.nodes.properties }),
])
map.setView({ center: [20, 30], zoom: 1.3 })
```

## What reaches one city

Every path from a supplier to the stores in London.

```js run dark
const graph = smaltcy.open()
graph.load(supplyChainJSON(supplyChain(300)))
const m = graphLayers(graph, `
  MATCH p = (:Supplier)-[:SUPPLIES]->(:Factory)-[:SHIPS_TO]->(:Warehouse)-[:DELIVERS_TO]->(s:Store)
  WHERE s.name STARTS WITH 'London'
  RETURN p`)
map.setLayers([
  arcs({ data: m.edges, color: { values: m.edges.type, categorical: true }, greatCircle: true, animate: true, width: 2, properties: m.edges.properties }),
  scatter({ data: m.nodes, color: '#FFFFFF', radius: 3.5, stroke: { color: '#0E7FAE', width: 1 }, properties: m.nodes.properties }),
])
map.setView({ center: [60, 35], zoom: 1.6 })
```

## One tier at a time

Only suppliers to factories, sized by how much each relationship carries.

```js run dark
const graph = smaltcy.open()
graph.load(supplyChainJSON(supplyChain(100)))
const m = graphLayers(graph, 'MATCH p = (:Supplier)-[:SUPPLIES]->(:Factory) RETURN p')
map.setLayers([
  arcs({ data: m.edges, color: { values: m.edges.properties.volume, ramp: 'glow' }, greatCircle: true, width: 2.5, opacity: 0.85, properties: m.edges.properties }),
  scatter({ data: m.nodes, color: { values: m.nodes.label, categorical: true }, radius: 4, properties: m.nodes.properties }),
])
map.setView({ center: [60, 30], zoom: 1.6 })
```
