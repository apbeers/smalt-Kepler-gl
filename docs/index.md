---
layout: home
hero:
  name: ' '
  text: Maps for smaltdb, drawn on the GPU.
  tagline: Small. Alternative. Maps.
  actions:
    - theme: brand
      text: Tech demo
      link: /demo
    - theme: alt
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/apbeers/smalt-Kepler-gl
features:
  - title: Everything on the GPU
    details: Points, heatmaps, hexagon and grid bins, arcs, trips and polygons, drawn with WebGPU. Binning, density, filters and playback run in shaders; moving a slider changes a few numbers on the GPU, not the data.
  - title: Our own basemap
    details: OpenStreetMap vector tiles, decoded in workers and drawn by smaltgl's own renderer in the same GPU pass as your data. Polygons fill through the stencil buffer; labels are laid out by the browser.
  - title: Columns in, pixels out
    details: Layers take typed arrays. A smaltdb query in columnar mode hands its numbers straight to the GPU; a smaltcy Cypher query becomes points and arcs.
  - title: Try it at any size
    details: The tech demo generates real-world-shaped data in your browser, from ten thousand rows to ten million, and shows what every step took on your machine.
---

<div class="gl-home-mark"><Wordmark /></div>

<ClientOnly>
  <HeroMap />
</ClientOnly>

```ts
import { createMap, basemap, hexbin } from '@smaltworks/smaltgl';

const map = await createMap(document.getElementById('map'), {
  center: [-73.98, 40.75], zoom: 11, basemap: basemap({ theme: 'dark' }),
});
map.addLayer(hexbin({ data: { lng, lat }, cellSize: 200 }));
```
