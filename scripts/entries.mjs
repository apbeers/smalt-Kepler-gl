// The package's entry points: name → source. One table for the build, the tests and the docs site; package.json's
// exports and tsconfig.json's paths are checked against it (test/modules.test.ts). Each is meant to be used alone:
// import one, and a bundle holds it and what's beneath it, nothing more.
export const ENTRIES = {
  smaltgl: 'src/index.ts',
  core: 'src/core/index.ts',
  map: 'src/map/index.ts',
  layers: 'src/layers/index.ts',
  'layer-kit': 'src/layers/kit.ts',
  scatter: 'src/layers/scatter.ts',
  heatmap: 'src/layers/heatmap.ts',
  aggregate: 'src/layers/aggregate.ts',
  arcs: 'src/layers/arcs.ts',
  paths: 'src/layers/paths.ts',
  polygons: 'src/layers/polygons.ts',
  basemap: 'src/basemap/index.ts',
  'vector-tiles': 'src/basemap/vector-tiles.ts',
  data: 'src/data/index.ts',
  geojson: 'src/data/geojson.ts',
  smaltdb: 'src/data/smaltdb.ts',
  smaltcy: 'src/data/smaltcy.ts',
  datasets: 'src/datasets/index.ts',
  visual: 'src/visual/index.ts',
};

/** Built on their own, into one file with nothing to import (scripts/build-plugin.mjs): plugins for hosts. */
export const HOST_PLUGINS = {
  'smaltbi-plugin': 'src/hosts/smaltbi.ts',
};

/** Workers, built next to the entries. */
export const WORKERS = {
  'smaltgl-tile-worker': 'src/basemap/tile-worker.ts',
  'smaltgl-data-worker': 'src/datasets/worker.ts',
};

/** The import specifier of an entry: '@smaltworks/smaltgl' or '@smaltworks/smaltgl/<name>'. */
export const specifier = (name) => (name === 'smaltgl' ? '@smaltworks/smaltgl' : `@smaltworks/smaltgl/${name}`);
