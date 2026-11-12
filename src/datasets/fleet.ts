/** Generated data: delivery vans across London over a working day. */
import { LONDON } from './places.js';
import { gaussian, KM_PER_DEG, rng } from './random.js';
import type { PathsDataset } from './types.js';

const VEHICLES = ['Van', 'Cargo bike', 'Truck'];

/**
 * Delivery rounds across London: each vehicle leaves a depot between 7 and 9 in the morning, drives a street-like
 * route to its stops, waits a few minutes at each, and returns. Times are seconds since midnight. Per path:
 * vehicle (code), stops, distance (km).
 */
export function fleet(vehicles: number, seed = 3, stopsPerVehicle = 12) {
  const r = rng(seed), g = gaussian(r);
  // Growable typed arrays: millions of points without a JavaScript number array each.
  let cap = 1 << 16, len = 0;
  let lngs = new Float64Array(cap), lats = new Float64Array(cap), times = new Float64Array(cap);
  const grow = () => {
    cap *= 2;
    const a = new Float64Array(cap), b = new Float64Array(cap), c = new Float64Array(cap);
    a.set(lngs);
    b.set(lats);
    c.set(times);
    lngs = a;
    lats = b;
    times = c;
  };
  const starts = new Uint32Array(vehicles + 1);
  const vehicle = new Float32Array(vehicles), stops = new Float32Array(vehicles), distance = new Float32Array(vehicles);
  const kmLng = KM_PER_DEG * Math.cos((LONDON.centre[1] * Math.PI) / 180);
  const STEP = 0.18; // km between recorded points
  for (let v = 0; v < vehicles; v++) {
    starts[v] = len;
    const kind = r() < 0.7 ? 0 : r() < 0.6 ? 1 : 2;
    vehicle[v] = kind;
    const speed = kind === 1 ? 15 : kind === 2 ? 22 : 26; // km/h
    const depot = LONDON.depots[Math.floor(r() * LONDON.depots.length)];
    let x = (depot[0] - LONDON.centre[0]) * kmLng, y = (depot[1] - LONDON.centre[1]) * KM_PER_DEG;
    let t = (7 + r() * 2) * 3600;
    // Stops cluster in one area per vehicle (a delivery round).
    const area = [x * 0.4 + g() * 5, y * 0.4 + g() * 4];
    const k = Math.max(2, Math.round(stopsPerVehicle * (kind === 1 ? 1.5 : 1) * (0.6 + r() * 0.8)));
    stops[v] = k;
    let dist = 0;
    const push = () => {
      if (len === cap) grow();
      lngs[len] = LONDON.centre[0] + x / kmLng;
      lats[len] = LONDON.centre[1] + y / KM_PER_DEG;
      times[len++] = t;
    };
    push();
    // Streets here aren't a grid: each leg turns through a few random headings on its way to the stop.
    const heading0 = r() * Math.PI;
    for (let s = 0; s <= k; s++) {
      const [tx, ty] = s === k ? [(depot[0] - LONDON.centre[0]) * kmLng, (depot[1] - LONDON.centre[1]) * KM_PER_DEG] : [area[0] + g() * (kind === 1 ? 1.2 : 2.5), area[1] + g() * (kind === 1 ? 1 : 2)];
      let guard = 0;
      while (Math.hypot(tx - x, ty - y) > STEP && guard++ < 2000) {
        const want = Math.atan2(ty - y, tx - x);
        // Follow the street grid of this part of town (two headings, at right angles), switching now and then.
        const grid = heading0 + Math.round((want - heading0) / (Math.PI / 2)) * (Math.PI / 2);
        const h = r() < 0.75 ? grid : want + g() * 0.4;
        x += Math.cos(h) * STEP;
        y += Math.sin(h) * STEP;
        dist += STEP;
        t += (STEP / (speed * (0.6 + r() * 0.8))) * 3600;
        push();
      }
      // At the stop.
      t += 120 + r() * 300;
      push();
    }
    distance[v] = dist;
  }
  starts[vehicles] = len;
  return {
    kind: 'paths' as const,
    count: vehicles,
    starts,
    points: { lng: lngs.slice(0, len), lat: lats.slice(0, len), times: times.slice(0, len) },
    columns: { vehicle, stops, distance },
    categories: { vehicle: VEHICLES },
  } satisfies PathsDataset;
}
