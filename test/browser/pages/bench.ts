// The benchmark page: window.bench(kind, rows) builds one layer on generated data, flies a 30-frame camera tour,
// waiting for the GPU after each frame, and returns the times.
import { createMap, scatter, heatmap, hexbin, arcs, trips, projectColumns, type Layer } from '../../../src/index.js';
import { rides, flights, fleet } from '../../../src/datasets/generators.js';

const map = await createMap(document.getElementById('map')!, { center: [-73.95, 40.74], zoom: 11 });
(window as any).bench = async (kind: string, rows: number) => {
  const t0 = performance.now();
  let layer: Layer;
  let center: [number, number] = [-73.95, 40.74], zoom = 11;
  if (kind === 'arcs') {
    const d = flights(rows);
    layer = arcs({ data: d.columns, greatCircle: true, width: 1, opacity: 0.4 });
    center = [10, 30];
    zoom = 1.5;
  } else if (kind === 'trips') {
    const d = fleet(rows);
    layer = trips({ data: { starts: d.starts, ...d.points }, time: 10 * 3600, trail: 1800 });
    center = [-0.12, 51.51];
    zoom = 10.5;
  } else {
    const d = rides(rows);
    const p = projectColumns(d.columns.lng, d.columns.lat);
    layer = kind === 'heatmap' ? heatmap({ data: p }) : kind === 'hexbin' ? hexbin({ data: p, cellSize: 200, filters: [{ values: d.columns.hour, range: [0, 24] }] }) : scatter({ data: p, radius: 1.5 });
  }
  const generated = performance.now() - t0;
  map.setLayers([layer]);
  map.setView({ center, zoom, bearing: 0 });
  const t1 = performance.now();
  await map.renderNow();
  const first = performance.now() - t1;
  const frames = Number(new URLSearchParams(location.search).get('frames') ?? 30);
  const t2 = performance.now();
  for (let i = 0; i < frames; i++) {
    const a = (i / frames) * Math.PI * 2;
    map.setView({ center, zoom: zoom + Math.sin(a), bearing: Math.sin(a) * 20 });
    // Hexagons re-bin every frame here, as they would while a filter moves.
    if (kind === 'hexbin') (layer as any).setFilter(0, [i % 12, (i % 12) + 12]);
    await map.renderNow();
  }
  const perFrame = (performance.now() - t2) / frames;
  map.setLayers([]);
  return { generated, first, perFrame, objects: layer.count };
};
(window as any).ready = true;
