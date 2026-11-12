/** Generated data: ride-hailing pickups in New York. */
import { MANHATTAN, MANHATTAN_EAST, MANHATTAN_WEST, NYC_HOTSPOTS, NYC_NIGHTLIFE } from './places.js';
import { gaussian, KM_PER_DEG, picker, rng } from './random.js';
import type { PointsDataset } from './types.js';

/** Longitude of a shore line (points [lat, lng], going north) at a latitude. */
function shoreAt(line: readonly (readonly [number, number])[], lat: number): number {
  if (lat <= line[0][0]) return line[0][1];
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, x] = line[i], [b, y] = line[i + 1];
    if (lat <= b) return x + ((lat - a) / (b - a)) * (y - x);
  }
  return line[line.length - 1][1];
}

/**
 * Ride pickups across New York City: clustered in busy neighbourhoods, on a street grid tilted like Manhattan's,
 * with commuting peaks and late nights where the bars are. Columns: lng, lat, hour (0–24), fare (dollars),
 * distance (km), passengers, dropLng, dropLat.
 */
export function rides(n: number, seed = 1) {
  const r = rng(seed), g = gaussian(r);
  const pick = picker(NYC_HOTSPOTS.map((h) => h[3]), r);
  const lng = new Float64Array(n), lat = new Float64Array(n), dropLng = new Float64Array(n), dropLat = new Float64Array(n);
  const hour = new Float32Array(n), fare = new Float32Array(n), distance = new Float32Array(n), passengers = new Float32Array(n);
  // Manhattan's grid runs 29 degrees east of north.
  const ang = (29 * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const h = NYC_HOTSPOTS[pick()];
    const airport = h[0].includes('Airport');
    const manhattan = MANHATTAN.has(h[0]);
    const spread = airport ? 0.4 : manhattan ? 0.45 : 0.8; // km across the grid; twice that along it
    let la = 0, lo = 0;
    // Draw until the pickup is on the right side of the rivers (a few tries at most).
    for (let tries = 0; tries < 8; tries++) {
      // Along and across the grid, in km; snap one of them to streets (80 m apart) or avenues (270 m apart).
      let u = g() * spread, v = g() * spread * 2;
      const s = r();
      if (s < 0.45) u = Math.round(u / 0.27) * 0.27 + g() * 0.01;
      else if (s < 0.9) v = Math.round(v / 0.08) * 0.08 + g() * 0.008;
      const east = u * ca + v * sa, north = -u * sa + v * ca;
      la = h[2] + north / KM_PER_DEG;
      lo = h[1] + east / (KM_PER_DEG * Math.cos((la * Math.PI) / 180));
      if (airport) break;
      const west = shoreAt(MANHATTAN_WEST, la), eastShore = shoreAt(MANHATTAN_EAST, la);
      if (manhattan ? lo > west + 0.001 && lo < eastShore - 0.001 : lo > eastShore + 0.002) break;
    }
    lat[i] = la;
    lng[i] = lo;
    // When: commuting peaks, a daytime base, and late nights in nightlife areas.
    const k = r();
    let t: number;
    if (NYC_NIGHTLIFE.has(h[0]) && k < 0.35) t = 22 + g() * 2;
    else if (k < 0.35) t = 8.5 + g() * 1.2;
    else if (k < 0.75) t = 18 + g() * 1.8;
    else t = 6 + r() * 17;
    hour[i] = ((t % 24) + 24) % 24;
    // How far: log-normal around 3 km; airport rides are long.
    const d = airport ? 15 + Math.abs(g()) * 8 : Math.exp(1.0 + g() * 0.7);
    distance[i] = d;
    const dir = r() * 2 * Math.PI;
    const toward = airport ? Math.atan2(40.754 - h[2], -73.984 - h[1]) + g() * 0.3 : dir;
    dropLat[i] = la + (Math.sin(toward) * d) / KM_PER_DEG;
    dropLng[i] = lng[i] + (Math.cos(toward) * d) / (KM_PER_DEG * Math.cos((la * Math.PI) / 180));
    fare[i] = airport && r() < 0.6 ? 70 + r() * 5 : 3 + d * 2.6 * (1 + Math.max(0, g() * 0.15)) + (hour[i] > 16 && hour[i] < 20 ? 2.5 : 0);
    passengers[i] = 1 + Math.floor(-Math.log(r() + 1e-9) * 0.5) % 4;
  }
  return { kind: 'points' as const, count: n, columns: { lng, lat, hour, fare, distance, passengers, dropLng, dropLat } } satisfies PointsDataset;
}
