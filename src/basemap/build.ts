/**
 * Turns a decoded tile into GPU-ready arrays, grouped by style group: polygon rings as triangle fans (filled through
 * the stencil buffer, so no triangulation is needed, holes and concave shapes included), lines as segments (each drawn
 * as a rounded capsule) and labels as points. Runs in the tile worker.
 */
import { decodeTile, GeomType, type MvtLayer } from './mvt.js';
import { FILL_GROUPS, LINE_GROUPS, LABEL_KINDS, SOURCE_LAYERS, fillGroup, lineGroup, labelOf } from './style.js';

export interface Range {
  /** Index into FILL_GROUPS or LINE_GROUPS. */
  readonly group: number;
  /** First index (fills) or segment (lines). */
  readonly start: number;
  readonly count: number;
}

export interface TileLabel {
  /** Index into LABEL_KINDS. */
  readonly kind: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly rank: number;
}

export interface TileGeometry {
  readonly extent: number;
  /** x, y of every fill vertex, in tile units. */
  readonly fillVerts: Float32Array;
  /** Triangle fans as a triangle list. */
  readonly fillIndex: Uint32Array;
  readonly fills: readonly Range[];
  /** ax, ay, bx, by of every line segment. */
  readonly segments: Float32Array;
  readonly lines: readonly Range[];
  readonly labels: readonly TileLabel[];
}

/** Builds a tile's geometry from its bytes. `z` is the tile's zoom (some groups appear only from a zoom). */
export function buildTile(bytes: Uint8Array, z: number): TileGeometry {
  return buildFromLayers(decodeTile(bytes, SOURCE_LAYERS), z);
}

export function buildFromLayers(layers: Map<string, MvtLayer>, z: number): TileGeometry {
  let extent = 4096;
  const fillParts: number[][][] = FILL_GROUPS.map(() => []);
  const lineParts: number[][][] = LINE_GROUPS.map(() => []);
  const labels: TileLabel[] = [];
  for (const [name, layer] of layers) {
    extent = layer.extent;
    for (const f of layer.features) {
      if (f.type === GeomType.Polygon) {
        const g = fillGroup(name, f.properties, z);
        if (g) fillParts[FILL_GROUPS.indexOf(g)].push(...f.geometry);
      } else if (f.type === GeomType.LineString) {
        const g = lineGroup(name, f.properties);
        if (g) lineParts[LINE_GROUPS.indexOf(g)].push(...f.geometry);
      } else if (f.type === GeomType.Point) {
        const l = labelOf(name, f.properties);
        if (l) for (const part of f.geometry) labels.push({ kind: LABEL_KINDS.indexOf(l.kind), text: l.text, x: part[0], y: part[1], rank: l.rank });
      }
    }
  }

  // Fills: one vertex array, fans in index order, a range per group.
  let nv = 0, ni = 0;
  for (const rings of fillParts)
    for (const r of rings) {
      const n = r.length / 2;
      if (n < 3) continue;
      nv += n;
      ni += (n - 2) * 3;
    }
  const fillVerts = new Float32Array(nv * 2);
  const fillIndex = new Uint32Array(ni);
  const fills: Range[] = [];
  let v = 0, k = 0;
  fillParts.forEach((rings, group) => {
    const start = k;
    for (const r of rings) {
      const n = r.length / 2;
      if (n < 3) continue;
      fillVerts.set(r, v * 2);
      for (let i = 1; i < n - 1; i++) {
        fillIndex[k++] = v;
        fillIndex[k++] = v + i;
        fillIndex[k++] = v + i + 1;
      }
      v += n;
    }
    if (k > start) fills.push({ group, start, count: k - start });
  });

  // Lines: segments, a range per group.
  let ns = 0;
  for (const lines of lineParts) for (const l of lines) ns += Math.max(0, l.length / 2 - 1);
  const segments = new Float32Array(ns * 4);
  const ranges: Range[] = [];
  let s = 0;
  lineParts.forEach((lines, group) => {
    const start = s;
    for (const l of lines)
      for (let i = 0; i + 3 < l.length; i += 2) {
        segments[s * 4] = l[i];
        segments[s * 4 + 1] = l[i + 1];
        segments[s * 4 + 2] = l[i + 2];
        segments[s * 4 + 3] = l[i + 3];
        s++;
      }
    if (s > start) ranges.push({ group, start, count: s - start });
  });

  return { extent, fillVerts, fillIndex, fills, segments, lines: ranges, labels };
}

/** The transferable buffers of a tile's geometry. */
export const transferables = (g: TileGeometry): ArrayBuffer[] => [g.fillVerts.buffer, g.fillIndex.buffer, g.segments.buffer] as ArrayBuffer[];
