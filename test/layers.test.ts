import { describe, expect, it } from 'vitest';
import { triangulate } from '@smaltworks/smaltgl/layers';

const area = (r: number[], tris: number[]) => {
  let a = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [p, q, s] = [tris[i], tris[i + 1], tris[i + 2]];
    a += Math.abs((r[2 * q] - r[2 * p]) * (r[2 * s + 1] - r[2 * p + 1]) - (r[2 * q + 1] - r[2 * p + 1]) * (r[2 * s] - r[2 * p])) / 2;
  }
  return a;
};
const ringArea = (r: number[]) => {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (r[2 * j] - r[2 * i]) * (r[2 * j + 1] + r[2 * i + 1]);
  return Math.abs(a) / 2;
};

describe('triangulate', () => {
  const shapes: Record<string, number[]> = {
    square: [0, 0, 1, 0, 1, 1, 0, 1],
    'L (concave)': [0, 0, 2, 0, 2, 1, 1, 1, 1, 3, 0, 3],
    'L, other winding': [0, 3, 1, 3, 1, 1, 2, 1, 2, 0, 0, 0],
    star: Array.from({ length: 20 }, (_, i) => {
      const a = (Math.PI * (i >> 1)) / 5, r = (i >> 1) % 2 ? 0.4 : 1;
      return i % 2 ? Math.sin(a) * r : Math.cos(a) * r;
    }),
    'closed ring': [0, 0, 4, 0, 4, 4, 0, 4, 0, 0],
  };
  for (const [name, ring] of Object.entries(shapes)) {
    it(`covers a ${name} exactly`, () => {
      const t = triangulate(ring);
      const n = ring.length / 2 - (name === 'closed ring' ? 1 : 0);
      expect(t.length).toBe((n - 2) * 3);
      expect(area(ring, t)).toBeCloseTo(ringArea(ring.slice(0, n * 2)), 9);
    });
  }
});
