/** Generated data: earthquakes along the plate boundaries. */
import { FAULTS } from './places.js';
import { gaussian, picker, rng } from './random.js';
import type { PointsDataset } from './types.js';

/**
 * Earthquakes along the world's plate boundaries: magnitudes follow the Gutenberg–Richter law (ten times fewer for
 * each step up), deeper inland from subduction trenches, and big ones bring aftershocks. Columns: lng, lat,
 * magnitude, depth (km), year (2000–2025, fractional).
 */
export function earthquakes(n: number, seed = 4) {
  const r = rng(seed), g = gaussian(r);
  // Pick a segment by fault weight times length.
  const segs: { a: readonly [number, number]; b: readonly [number, number]; w: number }[] = [];
  for (const f of FAULTS)
    for (let i = 0; i + 1 < f.line.length; i++) {
      let [ax, ay] = f.line[i], [bx, by] = f.line[i + 1];
      if (Math.abs(bx - ax) > 180) bx += bx < ax ? 360 : -360;
      segs.push({ a: [ax, ay], b: [bx, by], w: f.weight * Math.hypot(bx - ax, by - ay) });
    }
  const pick = picker(segs.map((s) => s.w), r);
  const lng = new Float64Array(n), lat = new Float64Array(n), magnitude = new Float32Array(n), depth = new Float32Array(n), year = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // About one in ten is an aftershock of a recent big one.
    if (i > 100 && r() < 0.1) {
      let j = i - 1 - Math.floor(r() * Math.min(i - 1, 2000));
      for (let tries = 0; tries < 20 && magnitude[j] < 5.5; tries++) j = i - 1 - Math.floor(r() * Math.min(i - 1, 2000));
      lng[i] = lng[j] + g() * 0.15;
      lat[i] = lat[j] + g() * 0.15;
      depth[i] = Math.max(1, depth[j] + g() * 8);
      year[i] = Math.min(2025.99, year[j] + Math.abs(g()) * 0.05);
      magnitude[i] = Math.min(magnitude[j] - 0.5, 2.5 - Math.log10(r() + 1e-9));
      continue;
    }
    const s = segs[pick()];
    const t = r();
    const x = s.a[0] + (s.b[0] - s.a[0]) * t, y = s.a[1] + (s.b[1] - s.a[1]) * t;
    // Across the boundary: one side shallow, the other deepening (the slab going down).
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
    const nx = -(s.b[1] - s.a[1]) / len, ny = (s.b[0] - s.a[0]) / len;
    const off = g() * 0.8;
    const deep = Math.max(0, off) * 90 + Math.abs(g()) * 15;
    lng[i] = ((x + nx * off + 540) % 360) - 180;
    lat[i] = y + ny * off;
    depth[i] = 5 + deep * (r() < 0.8 ? 1 : 3);
    magnitude[i] = Math.min(9.1, 2.5 - Math.log10(r() + 1e-9));
    year[i] = 2000 + r() * 26;
  }
  return { kind: 'points' as const, count: n, columns: { lng, lat, magnitude, depth, year } } satisfies PointsDataset;
}
