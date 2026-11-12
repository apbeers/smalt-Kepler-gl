/** Generated data: a city cut into tracts, for choropleths. */
import { CHICAGO } from './places.js';
import { gaussian, rng } from './random.js';
import type { PolygonsDataset } from './types.js';

/** Lake Michigan's shore near Chicago, roughly: [lat, lng]. */
const SHORE: readonly (readonly [number, number])[] = [[42.1, -87.69], [42.0, -87.66], [41.92, -87.63], [41.88, -87.615], [41.84, -87.6], [41.77, -87.56], [41.7, -87.52], [41.6, -87.5]];
const shoreLng = (lat: number): number => {
  for (let i = 0; i + 1 < SHORE.length; i++) {
    const [a, x] = SHORE[i], [b, y] = SHORE[i + 1];
    if (lat <= a && lat >= b) return x + ((lat - a) / (b - a)) * (y - x);
  }
  return lat > SHORE[0][0] ? SHORE[0][1] : SHORE[SHORE.length - 1][1];
};

/**
 * Chicago cut into about `n` census-tract-like districts (a jittered grid, clipped at the lake). Per district:
 * population, density (people per km²), income (median, dollars), commute (minutes).
 */
export function districts(n: number, seed = 6) {
  const r = rng(seed), g = gaussian(r);
  const side = Math.max(2, Math.round(Math.sqrt(n)));
  const [cx, cy] = CHICAGO.centre;
  const spanLat = 0.42, spanLng = 0.5;
  const cell = { lat: spanLat / side, lng: spanLng / side };
  // Jittered lattice corners shared by neighbours, so districts tile without gaps.
  const corner = new Float64Array((side + 1) * (side + 1) * 2);
  for (let i = 0; i <= side; i++)
    for (let j = 0; j <= side; j++) {
      const edge = i === 0 || j === 0 || i === side || j === side;
      const k = (i * (side + 1) + j) * 2;
      corner[k] = cx - spanLng / 2 + j * cell.lng + (edge ? 0 : g() * cell.lng * 0.18);
      corner[k + 1] = cy - spanLat / 2 + i * cell.lat + (edge ? 0 : g() * cell.lat * 0.18);
    }
  const lng: number[] = [], lat: number[] = [], starts: number[] = [];
  const pop: number[] = [], density: number[] = [], income: number[] = [], commute: number[] = [];
  const loop = new Float64Array(16);
  for (let i = 0; i < side; i++)
    for (let j = 0; j < side; j++) {
      const ids = [i * (side + 1) + j, i * (side + 1) + j + 1, (i + 1) * (side + 1) + j + 1, (i + 1) * (side + 1) + j];
      let mx = 0, my = 0;
      ids.forEach((id, k) => {
        loop[2 * k] = corner[2 * id];
        loop[2 * k + 1] = corner[2 * id + 1];
        mx += loop[2 * k] / 4;
        my += loop[2 * k + 1] / 4;
      });
      if (mx > shoreLng(my) - 0.004) continue; // in the lake
      starts.push(lng.length);
      for (let k = 0; k < 4; k++) {
        lng.push(loop[2 * k]);
        lat.push(loop[2 * k + 1]);
      }
      // The Loop is dense; the north side richer; the outskirts drive longer.
      const dx = (mx - (-87.632)) * 83, dy = (my - 41.882) * 111;
      const dkm = Math.hypot(dx, dy);
      const areaKm2 = cell.lng * 83 * cell.lat * 111;
      const dens = Math.max(400, 16000 * Math.exp(-dkm / 6) + 3500 + g() * 1500);
      density.push(dens);
      pop.push(Math.round(dens * areaKm2));
      income.push(Math.max(18000, Math.round(62000 + dy * 2400 - Math.max(0, -dy - 4) * 900 + (dkm < 3 ? 30000 : 0) + g() * 9000)));
      commute.push(Math.max(10, 22 + dkm * 1.4 + g() * 5));
    }
  starts.push(lng.length);
  return {
    kind: 'polygons' as const,
    count: starts.length - 1,
    starts: Uint32Array.from(starts),
    points: { lng: Float64Array.from(lng), lat: Float64Array.from(lat) },
    columns: { population: Float32Array.from(pop), density: Float32Array.from(density), income: Float32Array.from(income), commute: Float32Array.from(commute) },
  } satisfies PolygonsDataset;
}
