// Generated vector tiles standing in for OpenFreeMap in the browser tests: water, land cover, roads, a border and a
// place name in every tile, placed by the tile's own coordinates so neighbours differ.
import { encodeTile, type Layer } from './mvt-encode.js';

export function fixtureTile(z: number, x: number, y: number): Uint8Array {
  const E = 4096;
  const k = (x * 7 + y * 13 + z) % 5;
  const sq = (x0: number, y0: number, s: number): [number, number][] => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
  const layers: Layer[] = [
    { name: 'water', features: [{ type: 3, properties: { class: 'ocean' }, geometry: [sq(200 + k * 300, 300, 1500)] }] },
    { name: 'landcover', features: [{ type: 3, properties: { class: 'wood' }, geometry: [sq(2400, 2200 - k * 200, 1200)] }] },
    {
      name: 'transportation',
      features: [
        { type: 2, properties: { class: 'motorway' }, geometry: [[[0, 1000 + k * 200], [E, 3000 - k * 100]]] },
        { type: 2, properties: { class: 'primary' }, geometry: [[[1500, 0], [1800, E]]] },
      ],
    },
    { name: 'boundary', features: [{ type: 2, properties: { admin_level: 2 }, geometry: [[[0, 3800], [E, 3600]]] }] },
    { name: 'place', features: [{ type: 1, properties: { class: z < 6 ? 'country' : 'city', name: `Place ${z}/${x}/${y}`, rank: 2 }, geometry: [[[2048, 2048]]] }] },
  ];
  return encodeTile(layers);
}

export const TILEJSON = JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], maxzoom: 14 });
