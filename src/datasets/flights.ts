/** Generated data: scheduled routes between the world's big airports. */
import { AIRPORTS } from './places.js';
import { haversineKm, picker, rng } from './random.js';
import type { ArcsDataset } from './types.js';

const AIRLINES = ['Smalt Air', 'Kiln Airways', 'Cobalt', 'Cerulean', 'Aureolin Air', 'Violet Wings', 'Graphite', 'Leaf Air'];

/**
 * Flights between 96 large airports: busier airports have more, and most flights are under 4,000 km. Columns:
 * sourceLng, sourceLat, targetLng, targetLat, seats, distance (km), hour (local departure), airline (code).
 */
export function flights(n: number, seed = 2) {
  const r = rng(seed);
  const w = AIRPORTS.map((a) => a[3]);
  const pick = picker(w, r);
  const A = AIRPORTS.length;
  // A destination table per origin: busier and nearer airports are likelier (a gravity model).
  const dest: (() => number)[] = AIRPORTS.map((a, i) =>
    picker(
      AIRPORTS.map((b, j) => {
        if (i === j) return 0;
        const d = haversineKm(a[1], a[2], b[1], b[2]);
        return d < 250 ? 0 : (b[3] * a[3]) / Math.pow(d + 800, 1.1);
      }),
      r,
    ),
  );
  const cols = {
    sourceLng: new Float64Array(n), sourceLat: new Float64Array(n), targetLng: new Float64Array(n), targetLat: new Float64Array(n),
    seats: new Float32Array(n), distance: new Float32Array(n), hour: new Float32Array(n), airline: new Float32Array(n),
  };
  const traffic = new Float32Array(A);
  for (let i = 0; i < n; i++) {
    const s = pick(), t = dest[s]();
    const a = AIRPORTS[s], b = AIRPORTS[t];
    cols.sourceLng[i] = a[1];
    cols.sourceLat[i] = a[2];
    cols.targetLng[i] = b[1];
    cols.targetLat[i] = b[2];
    const d = haversineKm(a[1], a[2], b[1], b[2]);
    cols.distance[i] = d;
    cols.seats[i] = d > 6000 ? 250 + Math.floor(r() * 200) : d > 2500 ? 160 + Math.floor(r() * 120) : 70 + Math.floor(r() * 120);
    cols.hour[i] = (6 + r() * 17 + (r() < 0.15 ? 8 : 0)) % 24;
    cols.airline[i] = Math.floor(r() * AIRLINES.length);
    traffic[s]++;
    traffic[t]++;
  }
  return {
    kind: 'arcs' as const,
    count: n,
    columns: cols,
    categories: { airline: AIRLINES },
    places: { lng: Float64Array.from(AIRPORTS, (a) => a[1]), lat: Float64Array.from(AIRPORTS, (a) => a[2]), weight: traffic, names: AIRPORTS.map((a) => a[0]) },
  } satisfies ArcsDataset;
}
