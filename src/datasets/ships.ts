/** Generated data: positions reported along the world's shipping lanes. */
import { PORTS, SEA_WAYPOINTS } from './places.js';
import { gaussian, haversineKm, picker, rng } from './random.js';
import type { PointsDataset } from './types.js';

const SHIP_TYPES = ['Container', 'Tanker', 'Bulk carrier', 'Passenger'];

/** Sea lanes: which ports and waypoints connect directly. */
const LANES: readonly (readonly [string, string])[] = [
  ['Shanghai', 'ecs'], ['Ningbo', 'ecs'], ['Qingdao', 'yellow'], ['Tianjin', 'yellow'], ['yellow', 'ecs'], ['Busan', 'ecs'], ['Busan', 'tsugaru'],
  ['Tokyo', 'tsugaru'], ['Tokyo', 'ecs'], ['ecs', 'luzon'], ['Kaohsiung', 'luzon'], ['Xiamen', 'luzon'], ['Hong Kong', 'scs'], ['Shenzhen', 'scs'],
  ['Guangzhou', 'scs'], ['luzon', 'scs'], ['Singapore', 'scs'], ['Tanjung Pelepas', 'Singapore'], ['Laem Chabang', 'scs'], ['Port Klang', 'malacca'],
  ['Singapore', 'malacca'], ['malacca', 'sriLanka'], ['Colombo', 'sriLanka'], ['sriLanka', 'arabian'], ['Mumbai (Nhava Sheva)', 'arabian'],
  ['Dubai (Jebel Ali)', 'arabian'], ['arabian', 'babElMandeb'], ['sriLanka', 'babElMandeb'], ['babElMandeb', 'Jeddah'], ['Jeddah', 'suez'],
  ['babElMandeb', 'suez'], ['suez', 'Piraeus'], ['suez', 'sicily'], ['Piraeus', 'sicily'], ['sicily', 'Valencia'], ['Valencia', 'gibraltar'],
  ['Algeciras', 'gibraltar'], ['gibraltar', 'finisterre'], ['finisterre', 'channel'], ['channel', 'Felixstowe'], ['channel', 'Rotterdam'],
  ['channel', 'Antwerp'], ['Rotterdam', 'Hamburg'], ['gibraltar', 'azores'], ['azores', 'hatteras'], ['channel', 'northAtlantic'],
  ['northAtlantic', 'New York'], ['hatteras', 'New York'], ['hatteras', 'Savannah'], ['hatteras', 'floridaStrait'], ['floridaStrait', 'caribbean'],
  ['caribbean', 'panama'], ['Panama (Balboa)', 'panama'], ['panama', 'eastPacific'], ['eastPacific', 'Manzanillo'], ['Manzanillo', 'Los Angeles'],
  ['Los Angeles', 'Long Beach'], ['Los Angeles', 'hawaii'], ['Long Beach', 'hawaii'], ['hawaii', 'ecs'], ['hawaii', 'luzon'], ['Los Angeles', 'aleutians'],
  ['Vancouver', 'aleutians'], ['aleutians', 'tsugaru'], ['Los Angeles', 'Vancouver'], ['Santos', 'equatorAtlantic'], ['equatorAtlantic', 'azores'],
  ['equatorAtlantic', 'capeGoodHope'], ['capeGoodHope', 'Durban'], ['Durban', 'indianOcean'], ['indianOcean', 'sriLanka'], ['indianOcean', 'sunda'],
  ['sunda', 'Singapore'], ['Melbourne', 'tasman'], ['tasman', 'coral'], ['coral', 'png'], ['png', 'luzon'], ['Melbourne', 'southIndian'],
  ['southIndian', 'sunda'], ['equatorAtlantic', 'caribbean'],
];
const EXTRA_WAYPOINTS: Record<string, readonly [number, number]> = {
  ecs: [124, 30], yellow: [122.5, 36.5], scs: [112, 12], arabian: [62, 18], northAtlantic: [-40, 45], caribbean: [-75, 15], eastPacific: [-95, 12],
  equatorAtlantic: [-20, 0], indianOcean: [60, -10], sunda: [105, -8], tasman: [152, -36], coral: [158, -20], png: [150, -5], southIndian: [110, -38],
};

/** The chain of points a ship sails from port `a` to port `b` (shortest path over the lanes). */
export function seaRoute(a: string, b: string): [number, number][] {
  const pos = new Map<string, readonly [number, number]>();
  for (const p of PORTS) pos.set(p[0], [p[1], p[2]]);
  for (const [k, v] of Object.entries(SEA_WAYPOINTS)) pos.set(k, v);
  for (const [k, v] of Object.entries(EXTRA_WAYPOINTS)) pos.set(k, v);
  const adj = new Map<string, [string, number][]>();
  for (const [x, y] of LANES) {
    const p = pos.get(x)!, q = pos.get(y)!;
    const d = haversineKm(p[0], p[1], q[0], q[1]);
    (adj.get(x) ?? adj.set(x, []).get(x)!).push([y, d]);
    (adj.get(y) ?? adj.set(y, []).get(y)!).push([x, d]);
  }
  const dist = new Map<string, number>([[a, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set(adj.keys());
  while (todo.size) {
    let u: string | undefined, best = Infinity;
    for (const k of todo) if ((dist.get(k) ?? Infinity) < best) best = dist.get((u = k))!;
    if (u === undefined || u === b) break;
    todo.delete(u);
    for (const [v, w] of adj.get(u) ?? []) if (best + w < (dist.get(v) ?? Infinity)) dist.set(v, best + w), prev.set(v, u);
  }
  const out: [number, number][] = [];
  for (let k: string | undefined = b; k; k = prev.get(k)) out.unshift([...pos.get(k)!] as [number, number]);
  return out[0] && pos.get(a) && out.length > 1 ? out : [];
}

/**
 * Ship positions as a tracking network reports them, along lanes between 36 container ports (through Malacca, Suez,
 * Panama and round the capes). Columns: lng, lat, speed (knots), heading (degrees), type (code).
 */
export function ships(n: number, seed = 5) {
  const r = rng(seed), g = gaussian(r);
  const pick = picker(PORTS.map((p) => p[3]), r);
  // A pool of routes between likely port pairs, each sampled along its length.
  const routes: { pts: [number, number][]; cum: number[]; total: number }[] = [];
  for (let k = 0; k < 120; k++) {
    const a = PORTS[pick()][0], b = PORTS[pick()][0];
    if (a === b) continue;
    const pts = seaRoute(a, b);
    if (pts.length < 2) continue;
    // Unwrap longitudes so a Pacific crossing goes the short way.
    for (let i = 1; i < pts.length; i++) while (pts[i][0] - pts[i - 1][0] > 180) pts[i][0] -= 360;
    for (let i = 1; i < pts.length; i++) while (pts[i][0] - pts[i - 1][0] < -180) pts[i][0] += 360;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    routes.push({ pts, cum, total: cum[cum.length - 1] });
  }
  const pickRoute = picker(routes.map((x) => x.total), r);
  const lng = new Float64Array(n), lat = new Float64Array(n), speed = new Float32Array(n), heading = new Float32Array(n), type = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const rt = routes[pickRoute()];
    const d = r() * rt.total;
    let j = 1;
    while (j < rt.cum.length - 1 && rt.cum[j] < d) j++;
    const [ax, ay] = rt.pts[j - 1], [bx, by] = rt.pts[j];
    const t = (d - rt.cum[j - 1]) / (rt.cum[j] - rt.cum[j - 1] || 1);
    // Ships keep to a lane about 30 km wide, wider in open ocean.
    const open = Math.min(1, Math.min(t, 1 - t) * 4);
    const w = 0.08 + open * 0.5;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const off = g() * w;
    lng[i] = ((ax + (bx - ax) * t - ((by - ay) / len) * off + 540) % 360) - 180;
    lat[i] = ay + (by - ay) * t + ((bx - ax) / len) * off;
    const kind = r() < 0.5 ? 0 : r() < 0.5 ? 1 : r() < 0.85 ? 2 : 3;
    type[i] = kind;
    // Slow near ports.
    const cruise = [19, 13, 12, 21][kind];
    speed[i] = Math.max(0, cruise * (0.35 + 0.65 * open) + g() * 1.5);
    heading[i] = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360 + (r() < 0.5 ? 0 : 180)) % 360;
  }
  return { kind: 'points' as const, count: n, columns: { lng, lat, speed, heading, type }, categories: { type: SHIP_TYPES } } satisfies PointsDataset;
}
