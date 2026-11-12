# Data from smaltcy

[smaltcy](https://andrewbeers.me/smalt-graph-db/) is the family's graph database: Cypher in, nodes, relationships and
paths out. When nodes have longitude and latitude properties, a result is a map: `graphLayers` runs a query and
returns its nodes as points and its relationships as arcs between them.

```js run dark
const graph = smaltcy.open()
graph.load(supplyChainJSON(supplyChain(400)))

const m = graphLayers(graph, `
  MATCH p = (:Supplier)-[:SUPPLIES]->(:Factory)-[:SHIPS_TO]->(:Warehouse)-[:DELIVERS_TO]->(s:Store)
  WHERE s.name STARTS WITH 'Tokyo'
  RETURN p`)

map.setLayers([
  arcs({ data: m.edges, color: { values: m.edges.type, categorical: true }, greatCircle: true, animate: true, width: 2, properties: m.edges.properties }),
  scatter({ data: m.nodes, color: { values: m.nodes.label, categorical: true }, radius: 4, stroke: { width: 1 }, properties: m.nodes.properties }),
])
map.setView({ center: [130, 25], zoom: 2 })
```

- Nodes need numeric `lng` and `lat` properties (or name others: `graphLayers(graph, q, params, { lng: 'x', lat: 'y' })`).
- A relationship is drawn when both its nodes are in the result. Return paths (`RETURN p`) or both ends.
- `m.nodes.label` and `m.edges.type` are codes into `m.nodes.labels` and `m.edges.types`, ready for categorical colours.

smaltgl uses only `graph.query(cypher, params)`, so it doesn't import smaltcy.
