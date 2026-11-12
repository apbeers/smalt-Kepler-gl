# ADR 0001: smaltgl

- **Status:** accepted (2026-11-12)
- **Owner's decisions:** the name smaltgl; OpenStreetMap data through OpenFreeMap's tiles; our own drawing library;
  fully GPU-accelerated; docs with runnable examples and a tech demo of generated real-world data; smaltdb and smaltcy
  as data sources.

## Context

The smalt family has a database (smaltdb), languages (smaltql, smaltdf), a graph database (smaltcy) and apps. It has
no way to show location data on a map. Maps of millions of points need the GPU for drawing and for the work that
changes every frame: filtering, binning, density, time.

## Decisions

1. **A product of its own, smaltgl.** Location data on a map, in the browser, built on the family's databases.
   Tagline proposed: "Small. Alternative. Maps." Its mark and product colour are open: they go through smalt-brand's
   usual rounds first. Until then the site shows the wordmark in Martian Mono, as smaltcy's does.
2. **WebGPU only.** Compute shaders bin points, normalise heatmaps and (later) lay out labels, with nothing read back.
   WebGPU runs in Chrome and Edge, Safari 26 and Firefox on Windows; other browsers get a message rather than a
   slower second renderer. Revisit if a WebGL2 fallback is asked for.
3. **Our own basemap renderer.** No map library: tiles are decoded by our own protobuf and MVT reader in workers,
   polygons fill through the stencil buffer (nonzero winding, no triangulation), lines are capsules, labels come from
   Canvas 2D into an atlas. One device and one render pass for the basemap and the data.
4. **OpenStreetMap through OpenFreeMap.** The OpenMapTiles schema's names live in one file (`style.ts`), so another
   source or schema (Shortbread, or our own tiles built with Planetiler) changes only that file. OpenFreeMap has no
   uptime guarantee; before a launch, host our own copy of the tiles.
5. **Data as columns.** Layers take typed arrays; smaltdb's columnar results and smaltcy's results plug in through
   adapters that use only those databases' public methods. smaltgl has no runtime dependencies.
6. **Docs that run.** Every ```` ```js run ```` block in `docs/` runs on a live map, and a browser test runs every one
   of them on the built site. The tech demo generates its data in the browser, from thousands of rows to millions.

## Open

- The mark, the product colour and the social card (smalt-brand).
- The repository's final name and home (this repository is a temporary home).
- Labels along lines (road and river names), a globe view, 3D extrusion.
- A chart palette in smalt-brand: the ramps here are provisional, built from the Kiln tokens.
- Hosting our own tiles before launch.
