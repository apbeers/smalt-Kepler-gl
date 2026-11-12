/** Seedable randomness and distances, shared by the generators. */

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

export function gaussian(r: () => number): () => number {
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
export function picker(weights: readonly number[], r: () => number): () => number {
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

export const KM_PER_DEG = 111.32;
export const haversineKm = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * d) / 2) ** 2 + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(((lng2 - lng1) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};
