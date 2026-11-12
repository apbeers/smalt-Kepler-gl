/**
 * Synthetic datasets with the shape of real ones, generated in the browser at any size: from a few thousand rows to
 * ten million. Each generator is deterministic for a seed, writes straight into typed arrays (no object per row), and
 * runs in a worker (worker.ts) so the page stays responsive while it works.
 */
import { AIRPORTS, CHICAGO, FAULTS, LONDON, MANHATTAN, MANHATTAN_EAST, MANHATTAN_WEST, NYC_HOTSPOTS, NYC_NIGHTLIFE, PORTS, SEA_WAYPOINTS, STORE_CITIES, SUPPLY_SITES, type Place } from './places.js';

// ---------------------------------------------------------------------------------------------------------------------
// Randomness

/** A fast, seedable random number generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number): () => number {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const s = spare;
      spare = undefined;
      return s;
    }
    const u = r() || 1e-12, v = r();
    const m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
}

/** Picks an index with probability proportional to its weight (binary search over the running sum). */
function picker(weights: readonly number[], r: () => number): () => number {
  const cum = new Float64Array(weights.length);
  let s = 0;
  weights.forEach((w, i) => (cum[i] = s += w));
  return () => {
    const x = r() * s;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
}

const KM_PER_DEG = 111.32;
const haversineKm = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * d) / 2) ** 2 + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(((lng2 - lng1) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

// ---------------------------------------------------------------------------------------------------------------------
// The shapes datasets come in

/** Column data: every column has one entry per row (points, arcs) or per path or polygon. */
export type Columns = Record<string, Float64Array | Float32Array | Uint32Array>;

export interface PointsDataset {
  readonly kind: 'points';
  readonly count: number;
  /** lng and lat, plus value columns. */
  readonly columns: Columns;
  /** Names for coded columns: column → names by code. */
  readonly categories?: Readonly<Record<string, readonly string[]>>;
}

export interface ArcsDataset {
  readonly kind: 'arcs';
  readonly count: number;
  /** sourceLng, sourceLat, targetLng, targetLat, plus value columns. */
  readonly columns: Columns;
  readonly categories?: Readonly<Record<string, readonly string[]>>;
  /** The places the arcs join, as points. */
  readonly places?: { readonly lng: Float64Array; readonly lat: Float64Array; readonly weight: Float32Array; readonly names: readonly string[] };
}

export interface PathsDataset {
  readonly kind: 'paths';
  /** Paths. */
  readonly count: number;
  /** Offsets of each path's first point, plus the end. */
  readonly starts: Uint32Array;
  /** lng, lat and times, one entry per point. */
  readonly points: { readonly lng: Float64Array; readonly lat: Float64Array; readonly times: Float64Array };
  /** One entry per path. */
  readonly columns: Columns;
  readonly categories?: Readonly<Record<string, readonly string[]>>;
}

export interface PolygonsDataset {
  readonly kind: 'polygons';
  readonly count: number;
  readonly starts: Uint32Array;
  readonly points: { readonly lng: Float64Array; readonly lat: Float64Array };
  /** One entry per polygon. */
  readonly columns: Columns;
}

export type Dataset = PointsDataset | ArcsDataset | PathsDataset | PolygonsDataset;

// ---------------------------------------------------------------------------------------------------------------------
// Rides: ride-hailing pickups in New York

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

// ---------------------------------------------------------------------------------------------------------------------
// Flights: scheduled routes between the world's big airports

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

// ---------------------------------------------------------------------------------------------------------------------
// Fleet: delivery vans across London over a working day

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

// ---------------------------------------------------------------------------------------------------------------------
// Earthquakes along the plate boundaries

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

// ---------------------------------------------------------------------------------------------------------------------
// Ships: positions reported along the world's shipping lanes

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

// ---------------------------------------------------------------------------------------------------------------------
// Districts: a city cut into tracts, for choropleths

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

// ---------------------------------------------------------------------------------------------------------------------
// Supply chain: a graph with places, for smaltcy

export interface SupplyChainGraph {
  readonly nodes: readonly { readonly id: number; readonly label: string; readonly name: string; readonly lng: number; readonly lat: number; readonly capacity: number }[];
  readonly edges: readonly { readonly from: number; readonly to: number; readonly type: string; readonly volume: number; readonly days: number }[];
}

/**
 * A supply chain as a graph: suppliers in Asia ship parts to factories, factories ship to regional warehouses, and
 * warehouses deliver to `stores` stores in 26 cities. Labels: Supplier, Factory, Warehouse, Store. Relationships:
 * SUPPLIES, SHIPS_TO, DELIVERS_TO, each with a volume and the days in transit.
 */
export function supplyChain(stores: number, seed = 7): SupplyChainGraph {
  const r = rng(seed), g = gaussian(r);
  const nodes: { id: number; label: string; name: string; lng: number; lat: number; capacity: number }[] = [];
  const edges: { from: number; to: number; type: string; volume: number; days: number }[] = [];
  const label = { supplier: 'Supplier', factory: 'Factory', warehouse: 'Warehouse' } as const;
  for (const [name, lng, lat, kind] of SUPPLY_SITES) nodes.push({ id: nodes.length, label: label[kind], name, lng, lat, capacity: Math.round(500 + r() * 2000) });
  const of = (l: string) => nodes.filter((n) => n.label === l);
  const suppliers = of('Supplier'), factories = of('Factory'), warehouses = of('Warehouse');
  const days = (a: { lng: number; lat: number }, b: { lng: number; lat: number }, perDayKm: number) => Math.max(1, Math.round(haversineKm(a.lng, a.lat, b.lng, b.lat) / perDayKm + r() * 2));
  for (const f of factories) {
    const k = 2 + Math.floor(r() * 3);
    for (const s of [...suppliers].sort(() => r() - 0.5).slice(0, k)) edges.push({ from: s.id, to: f.id, type: 'SUPPLIES', volume: Math.round(100 + r() * 900), days: days(s, f, 600) });
  }
  for (const w of warehouses) {
    // Each warehouse buys from the nearer factories.
    const near = [...factories].sort((a, b) => haversineKm(a.lng, a.lat, w.lng, w.lat) - haversineKm(b.lng, b.lat, w.lng, w.lat)).slice(0, 2 + Math.floor(r() * 2));
    for (const f of near) edges.push({ from: f.id, to: w.id, type: 'SHIPS_TO', volume: Math.round(200 + r() * 1500), days: days(f, w, 500) });
  }
  const pickCity = picker(STORE_CITIES.map((c) => c[3]), r);
  for (let i = 0; i < stores; i++) {
    const c: Place = STORE_CITIES[pickCity()];
    const lat = c[2] + g() * 0.12, lng = c[1] + g() * 0.15;
    const store = { id: nodes.length, label: 'Store', name: `${c[0]} #${i + 1}`, lng, lat, capacity: Math.round(20 + r() * 80) };
    nodes.push(store);
    const w = [...warehouses].sort((a, b) => haversineKm(a.lng, a.lat, lng, lat) - haversineKm(b.lng, b.lat, lng, lat))[0];
    edges.push({ from: w.id, to: store.id, type: 'DELIVERS_TO', volume: Math.round(5 + r() * 60), days: days(w, store, 700) });
  }
  return { nodes, edges };
}

// ---------------------------------------------------------------------------------------------------------------------

/** Every generator by name, with the sizes the tech demo offers. */
export const GENERATORS = {
  rides: { make: (n: number, seed?: number) => rides(n, seed), sizes: [10_000, 100_000, 1_000_000, 5_000_000, 10_000_000] },
  flights: { make: (n: number, seed?: number) => flights(n, seed), sizes: [1_000, 10_000, 100_000, 500_000, 1_000_000] },
  fleet: { make: (n: number, seed?: number) => fleet(n, seed), sizes: [50, 500, 2_000, 10_000] },
  earthquakes: { make: (n: number, seed?: number) => earthquakes(n, seed), sizes: [10_000, 100_000, 1_000_000, 3_000_000] },
  ships: { make: (n: number, seed?: number) => ships(n, seed), sizes: [10_000, 100_000, 1_000_000, 5_000_000] },
  districts: { make: (n: number, seed?: number) => districts(n, seed), sizes: [400, 2_500, 10_000, 40_000] },
} as const;

export type GeneratorName = keyof typeof GENERATORS;
