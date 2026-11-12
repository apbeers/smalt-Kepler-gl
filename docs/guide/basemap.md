# The basemap

The map underneath is [OpenStreetMap](https://www.openstreetmap.org/copyright) data, as vector tiles in the
[OpenMapTiles](https://openmaptiles.org) schema, served by [OpenFreeMap](https://openfreemap.org): free, with no key
and no account. smaltgl draws it with its own renderer, in the same GPU pass as your data.

```ts
import { createMap, basemap } from '@smaltworks/smaltgl';

const map = await createMap(el, { basemap: basemap({ theme: 'dark' }) });
```

```js run
map.setView({ center: [-122.42, 37.77], zoom: 12.5, bearing: -20 })
```

## Themes

`theme: 'light'` (the default) and `'dark'` are built from the brand's Kiln colours: quiet, so data on top carries
the colour. `basemap.setTheme('dark')` switches without reloading tiles. A theme is a plain object (`LIGHT` and `DARK`
are exported): copy one and change its colours and widths to make your own.

```js run dark
map.setView({ center: [139.75, 35.68], zoom: 11 })
```

## Other tiles

`tiles` takes a TileJSON URL or a tile URL template (`https://…/{z}/{x}/{y}.pbf`) of any source in the OpenMapTiles
schema: your own copy of OpenFreeMap, tiles built with Planetiler, or a commercial host. `maxTileZoom` is the
deepest zoom the source has (14 for OpenFreeMap); past it the map scales those tiles.

`createMap(el, { basemap: null })` draws no basemap: data on a plain background.

## Attribution

OpenStreetMap's licence asks for credit wherever its data is shown. smaltgl puts the line in the corner of the map:
"OpenFreeMap © OpenMapTiles Data from OpenStreetMap". Keep it visible; style it with `.smaltgl-attribution`.

## How it is drawn

- **Workers fetch and decode tiles.** A small protobuf reader decodes each tile; features are sorted into style groups
  (water, parks, motorways, borders, place names) and turned into GPU-ready arrays, then handed to the page without
  copying. The main thread only uploads buffers.
- **Polygons fill through the stencil buffer.** Each ring's triangle fan adds its winding to the stencil, then the same
  fan is drawn where the count isn't zero, and clears it. Concave shapes, holes and overlapping polygons come out right
  with no triangulation.
- **Lines are capsules.** Each segment is a quad the vertex shader sizes in pixels; the fragment shader cuts the rounded
  ends and anti-aliases the edge, so joins are round and widths stay true at any zoom or rotation.
- **Labels are laid out by the browser.** Canvas 2D draws each place name once (any script, any font the page has) into
  an atlas texture; each frame, labels are placed most important first, skipping any that would overlap.
- **A missing tile borrows its parent.** Every draw is clipped to its tile in the fragment shader, so while a tile
  loads, a coarser one stands in for exactly its square.
