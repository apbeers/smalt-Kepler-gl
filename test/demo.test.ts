// The tech demo's logic, without a page or a GPU: layers for every dataset and layer kind, legends, GeoJSON files,
// and links. (Layers only touch the GPU in attach, so building them needs none.)
import { describe, expect, it } from 'vitest';
import * as gl from '@smaltworks/smaltgl';
import { GENERATORS } from '@smaltworks/smaltgl/datasets';
import { DEMO_DATASETS } from '../docs/.vitepress/theme/demo-datasets';
import { buildLayers, legendFor, projectDataset, type LayerSettings } from '../docs/.vitepress/theme/demo/build-layers';
import { datasetFromGeoJSON } from '../docs/.vitepress/theme/demo/files';
import { decodeLink, encodeLink } from '../docs/.vitepress/theme/demo/links';

const base: Omit<LayerSettings, 'layer' | 'colour'> = {
  radius: 2, heatRadius: 18, cellSize: 500, measure: 'count', width: 1.2, opacity: 0.85, additive: true, greatCircle: true, animate: false, extrude: false, height: 1,
};

describe('buildLayers', () => {
  for (const d of DEMO_DATASETS.filter((x) => x.source in GENERATORS)) {
    const data = GENERATORS[d.source as keyof typeof GENERATORS].make(d.sizes[0]) as Parameters<typeof buildLayers>[1];
    const points = projectDataset(gl, data);
    for (const layer of d.layers)
      for (const extrude of layer === 'hexbin' || layer === 'grid' || layer === 'polygons' ? [false, true] : [false]) {
        it(`${d.id} as ${layer}${extrude ? ' in 3D' : ''}`, () => {
          const f = d.filters[0];
          const built = buildLayers(gl, data, { ...base, layer, extrude, colour: d.colorBy[0], filter: f ? { column: f.column, range: [0, 1e9] } : undefined }, points, d.view.center[1]);
          const main = built.layers.find((l) => l.id === 'data');
          expect(main, `${d.id} ${layer}`).toBeDefined();
          expect(main!.count).toBeGreaterThan(0);
          if (layer === 'trips') expect(built.trips).toBe(main);
          expect(legendFor(gl, main)).not.toBe(undefined);
        });
      }
  }
});

describe('files and links', () => {
  it('reads a GeoJSON file as polygons with colour and filter columns', () => {
    const square = (x: number) => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]];
    const f = datasetFromGeoJSON(gl, JSON.stringify({ type: 'FeatureCollection', features: [0, 2].map((x, i) => ({ type: 'Feature', properties: { v: i, zone: `z${i}` }, geometry: { type: 'Polygon', coordinates: [square(x)] } })) }));
    expect(f.data.kind).toBe('polygons');
    expect(f.count).toBe(2);
    expect(f.meta.colorBy.map((c) => c.column)).toEqual(['v', 'zone']);
    expect(f.meta.filters.map((c) => c.column)).toEqual(['v']);
  });

  it('round-trips the state through a link', () => {
    const st = { dataset: 'rides', sizeIndex: 2, layer: 'hexbin', color: 'fare', filter: { column: 'hour', range: [17, 19] as const }, extrude: true, view: { center: [-73.95, 40.73] as const, zoom: 11.5, bearing: -20, pitch: 45 } };
    expect(decodeLink(new URLSearchParams(encodeLink(st)))).toEqual(st);
    expect(decodeLink(new URLSearchParams('dataset=ships'))).toEqual({ dataset: 'ships' });
  });
});
