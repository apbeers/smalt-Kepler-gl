/**
 * Ear clipping for simple polygons (one ring, either winding, no self-intersections). Data polygons need real
 * triangles, not the basemap's stencil fill, because each polygon has its own colour and neighbours must not cover
 * each other. Convex rings (most districts and cells) take a fast path.
 */

/** Triangulates ring vertices [x0, y0, x1, y1, …]; returns indices into the ring, three per triangle. */
export function triangulate(ring: ArrayLike<number>, offset = 0, n = ring.length / 2): number[] {
  if (n < 3) return [];
  // Drop a closing vertex that repeats the first.
  if (ring[2 * (offset + n - 1)] === ring[2 * offset] && ring[2 * (offset + n - 1) + 1] === ring[2 * offset + 1]) n--;
  if (n < 3) return [];
  const x = (i: number) => ring[2 * (offset + i)];
  const y = (i: number) => ring[2 * (offset + i) + 1];
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += (x(j) - x(i)) * (y(j) + y(i));
  const ccw = area > 0;
  const cross = (a: number, b: number, c: number) => (x(b) - x(a)) * (y(c) - y(a)) - (y(b) - y(a)) * (x(c) - x(a));
  const convexAt = (a: number, b: number, c: number) => (ccw ? cross(a, b, c) > 0 : cross(a, b, c) < 0);

  // Convex: a fan.
  let convex = true;
  for (let i = 0; i < n && convex; i++) if (cross((i + n - 1) % n, i, (i + 1) % n) !== 0 && !convexAt((i + n - 1) % n, i, (i + 1) % n)) convex = false;
  const out: number[] = [];
  if (convex) {
    for (let i = 1; i < n - 1; i++) out.push(0, i, i + 1);
    return out;
  }

  const next = new Int32Array(n), prev = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    next[i] = (i + 1) % n;
    prev[i] = (i + n - 1) % n;
  }
  const inside = (a: number, b: number, c: number, p: number) => {
    const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
    return ccw ? d1 >= 0 && d2 >= 0 && d3 >= 0 : d1 <= 0 && d2 <= 0 && d3 <= 0;
  };
  let remaining = n;
  let i = 0;
  let guard = 0;
  while (remaining > 3 && guard < n * n) {
    guard++;
    const a = prev[i], b = i, c = next[i];
    let ear = convexAt(a, b, c);
    if (ear)
      for (let p = next[c]; p !== a; p = next[p]) {
        if (inside(a, b, c, p)) {
          ear = false;
          break;
        }
      }
    if (ear) {
      out.push(a, b, c);
      next[a] = c;
      prev[c] = a;
      remaining--;
      i = c;
      guard = 0;
    } else i = next[i];
  }
  if (remaining === 3) out.push(prev[i], i, next[i]);
  return out;
}
