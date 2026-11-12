import { describe, expect, it } from 'vitest';
import { GENERATORS, rides, flights, fleet, earthquakes, ships, districts, supplyChain, seaRoute, type GeneratorName } from '@smaltworks/smaltgl/datasets';

const inBox = (lng: ArrayLike<number>, lat: ArrayLike<number>, [w, s, e, n]: number[]) => {
  for (let i = 0; i < lng.length; i++) if (!(lng[i] >= w && lng[i] <= e && lat[i] >= s && lat[i] <= n)) return false;
  return true;
};

describe('generated datasets', () => {
  it('are the same for the same seed and differ for another', () => {
    for (const name of Object.keys(GENERATORS) as GeneratorName[]) {
      const g = GENERATORS[name];
      const a = JSON.stringify(Object.values(g.make(g.sizes[0], 11).columns).map((c) => Array.from(c.slice(0, 20))));
      const b = JSON.stringify(Object.values(g.make(g.sizes[0], 11).columns).map((c) => Array.from(c.slice(0, 20))));
      const c = JSON.stringify(Object.values(g.make(g.sizes[0], 12).columns).map((c) => Array.from(c.slice(0, 20))));
      expect(a, name).toBe(b);
      expect(a, name).not.toBe(c);
    }
  });

  it('rides are in New York, with plausible hours and fares', () => {
    const d = rides(20000);
    expect(d.count).toBe(20000);
    expect(inBox(d.columns.lng, d.columns.lat, [-74.15, 40.55, -73.7, 40.95])).toBe(true);
    const h = d.columns.hour;
    let rush = 0;
    for (let i = 0; i < h.length; i++) if ((h[i] > 7 && h[i] < 10) || (h[i] > 16 && h[i] < 20)) rush++;
    // Rush hours (7 of 24) hold far more than their share.
    expect(rush / h.length).toBeGreaterThan(0.45);
    expect(Math.min(...d.columns.fare)).toBeGreaterThan(2);
  });

  it('flights join two different airports at least 250 km apart', () => {
    const d = flights(5000);
    for (let i = 0; i < d.count; i++) expect(d.columns.distance[i]).toBeGreaterThanOrEqual(250);
    expect(d.places!.names.length).toBe(d.places!.lng.length);
  });

  it('fleet trips move forward in time, inside Greater London', () => {
    const d = fleet(30);
    expect(d.starts.length).toBe(31);
    expect(d.starts[30]).toBe(d.points.lng.length);
    for (let k = 0; k < d.count; k++)
      for (let i = d.starts[k] + 1; i < d.starts[k + 1]; i++) expect(d.points.times[i]).toBeGreaterThanOrEqual(d.points.times[i - 1]);
    expect(inBox(d.points.lng, d.points.lat, [-0.75, 51.2, 0.5, 51.8])).toBe(true);
  });

  it('earthquakes follow Gutenberg–Richter: about ten times fewer per magnitude step', () => {
    const m = earthquakes(100000).columns.magnitude;
    let m3 = 0, m4 = 0;
    for (const v of m) {
      if (v >= 3) m3++;
      if (v >= 4) m4++;
    }
    expect(m3 / m4).toBeGreaterThan(6);
    expect(m3 / m4).toBeLessThan(14);
  });

  it('ships sail lanes through the canals', () => {
    const route = seaRoute('Shanghai', 'Rotterdam');
    expect(route.length).toBeGreaterThan(5);
    // Through Suez: some waypoint near 32.5° E, 30° N.
    expect(route.some(([x, y]) => Math.abs(x - 32.55) < 0.1 && Math.abs(y - 30) < 0.1)).toBe(true);
    const d = ships(5000);
    expect(inBox(d.columns.lng, d.columns.lat, [-180, -60, 180, 70])).toBe(true);
  });

  it('districts tile the city and stay out of the lake', () => {
    const d = districts(900);
    expect(d.count).toBeGreaterThan(400);
    expect(d.starts[d.count]).toBe(d.points.lng.length);
    expect(Math.max(...d.points.lng)).toBeLessThan(-87.4);
  });

  it('a supply chain connects suppliers to stores', () => {
    const g = supplyChain(100);
    expect(g.nodes.filter((n) => n.label === 'Store').length).toBe(100);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
    expect(g.edges.filter((e) => e.type === 'DELIVERS_TO').length).toBe(100);
  });
});
