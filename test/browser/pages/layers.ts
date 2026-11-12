// Every layer kind on a blank map, for the render tests: window.show(kind) draws one and returns the frame stats.
import { createMap, scatter, heatmap, hexbin, grid, arcs, paths, trips, polygons, type Layer } from '../../../src/index.js';

const map = await createMap(document.getElementById('map')!, { center: [0, 0], zoom: 3 });
(window as any).map = map;

// A deterministic generator: points clustered around (0, 0).
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
function cloud(n: number) {
  const lng = new Float64Array(n), lat = new Float64Array(n), v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lng[i] = gauss() * 8;
    lat[i] = gauss() * 6;
    v[i] = i % 100;
  }
  return { lng, lat, v };
}

const make: Record<string, () => Layer> = {
  scatter: () => {
    const c = cloud(20000);
    return scatter({ id: 'l', data: c, color: { values: c.v, ramp: 'ember' }, radius: 3, properties: { value: c.v } });
  },
  heatmap: () => heatmap({ id: 'l', data: cloud(50000), radius: 25 }),
  hexbin: () => {
    const c = cloud(50000);
    return hexbin({ id: 'l', data: c, cellSize: 150000 });
  },
  grid: () => {
    const c = cloud(50000);
    return grid({ id: 'l', data: c, cellSize: 150000, weight: c.v, measure: 'mean' });
  },
  arcs: () => {
    const n = 300;
    const d = { sourceLng: new Float64Array(n), sourceLat: new Float64Array(n), targetLng: new Float64Array(n), targetLat: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
      d.sourceLng[i] = -20 + rand() * 10;
      d.sourceLat[i] = -10 + rand() * 20;
      d.targetLng[i] = 10 + rand() * 10;
      d.targetLat[i] = -10 + rand() * 20;
    }
    return arcs({ id: 'l', data: d, color: '#0E7FAE', targetColor: '#E5622F', width: 2 });
  },
  greatCircle: () => {
    const d = { sourceLng: [-74, -0.1, 139.7], sourceLat: [40.7, 51.5, 35.7], targetLng: [139.7, 151.2, -118.2], targetLat: [35.7, -33.9, 34.1] };
    return arcs({ id: 'l', data: d, greatCircle: true, width: 3, color: '#B0249F' });
  },
  paths: () => {
    const n = 50, len = 40;
    const lng = new Float64Array(n * len), lat = new Float64Array(n * len), times = new Float64Array(n * len), starts = new Uint32Array(n + 1);
    for (let k = 0; k < n; k++) {
      starts[k] = k * len;
      let x = gauss() * 5, y = gauss() * 5;
      for (let i = 0; i < len; i++) {
        x += gauss() * 0.6;
        y += gauss() * 0.6;
        lng[k * len + i] = x;
        lat[k * len + i] = y;
        times[k * len + i] = i;
      }
    }
    starts[n] = n * len;
    (window as any).pathData = { starts, lng, lat, times };
    return paths({ id: 'l', data: { starts, lng, lat }, width: 2, color: '#2F5BB7' });
  },
  trips: () => {
    const d = (window as any).pathData;
    return trips({ id: 'l', data: d, time: 20, trail: 10, width: 3, color: '#E5622F' });
  },
  polygons: () => {
    // A 6 x 6 grid of squares, and one concave L.
    const lng: number[] = [], lat: number[] = [], starts: number[] = [], v: number[] = [];
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        starts.push(lng.length);
        const x = -15 + i * 5, y = -15 + j * 5;
        lng.push(x, x + 4.5, x + 4.5, x);
        lat.push(y, y, y + 4.5, y + 4.5);
        v.push(i + j);
      }
    starts.push(lng.length);
    lng.push(20, 30, 30, 25, 25, 20);
    lat.push(-10, -10, -5, -5, 10, 10);
    v.push(12);
    starts.push(lng.length);
    return polygons({ id: 'l', data: { starts, lng, lat }, color: { values: v, ramp: 'smalt' }, properties: { value: v } });
  },
};

(window as any).show = async (kind: string) => {
  map.setLayers([make[kind]()]);
  map.setView({ center: [0, 0], zoom: kind === 'greatCircle' ? 1 : 3 });
  await map.renderNow();
  await map.renderNow();
  return { ...map.stats };
};
(window as any).ready = true;
