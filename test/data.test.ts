import { describe, expect, it } from 'vitest';
import { open } from '@smaltworks/smaltcy';
import { graphLayers, loadSmaltdb, numeric, querySmaltdb, supplyChainJSON } from '@smaltworks/smaltgl/data';
import { supplyChain } from '@smaltworks/smaltgl/datasets';

describe('smaltcy', () => {
  const graph = open();
  graph.load(supplyChainJSON(supplyChain(60)));

  it('turns a path query into arcs between placed nodes', () => {
    const m = graphLayers(graph, "MATCH p = (:Supplier)-[:SUPPLIES]->(:Factory)-[:SHIPS_TO]->(w:Warehouse) WHERE w.name = 'Memphis hub' RETURN p");
    expect(m.edges.count).toBeGreaterThan(2);
    expect(m.nodes.labels).toEqual(expect.arrayContaining(['Supplier', 'Factory', 'Warehouse']));
    expect(m.edges.types).toEqual(expect.arrayContaining(['SUPPLIES', 'SHIPS_TO']));
    // Every arc starts and ends at a node of the result.
    const at = new Set(Array.from(m.nodes.lng, (x, i) => `${x},${m.nodes.lat[i]}`));
    for (let i = 0; i < m.edges.count; i++) expect(at.has(`${m.edges.sourceLng[i]},${m.edges.sourceLat[i]}`)).toBe(true);
    expect(m.edges.properties.volume.every((v) => typeof v === 'number')).toBe(true);
  });

  it('keeps nodes without relationships as points', () => {
    const m = graphLayers(graph, 'MATCH (s:Store) RETURN s');
    expect(m.nodes.count).toBe(60);
    expect(m.edges.count).toBe(0);
  });
});

describe('smaltdb', () => {
  it('writes columns as CSV into a new table', async () => {
    const calls: string[] = [];
    const csv: string[] = [];
    const db = {
      exec: async (sql: string) => calls.push(sql),
      importCSV: async (_t: string, text: string | Blob) => {
        csv.push(text as string);
        return { rows: (text as string).split('\n').length - 1 };
      },
    };
    const r = await loadSmaltdb(db, 'pts', { lng: [-73.9851234567, 1], hour: [3, 4] }, 1);
    expect(r.rows).toBe(2);
    expect(calls[1]).toBe('CREATE TABLE pts (lng REAL, hour INTEGER)');
    expect(csv[0]).toBe('lng,hour\n-73.9851235,3');
    await expect(loadSmaltdb(db, 'bad name', { a: [1] })).rejects.toThrow();
  });

  it('reads columnar results', async () => {
    const db = { query: async () => ({ columns: ['x', 's'], rowCount: 2, data: { x: new Float64Array([1, 2]), s: ['a', null] } }) };
    const r = await querySmaltdb(db, 'SELECT 1');
    expect(r.count).toBe(2);
    expect(numeric(r.columns.x)).toEqual(new Float64Array([1, 2]));
    expect(Number.isNaN(numeric(['1', null])[1])).toBe(true);
  });
});

import { readGeoJSON, findCoordinates } from '@smaltworks/smaltgl/data';

describe('GeoJSON', () => {
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'a', pop: 10 }, geometry: { type: 'Point', coordinates: [1, 2] } },
      { type: 'Feature', properties: { name: 'b', pop: null }, geometry: { type: 'MultiPoint', coordinates: [[3, 4], [5, 6]] } },
      { type: 'Feature', properties: { road: 'A1' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0]] } },
      {
        type: 'Feature',
        properties: { zone: 'z', v: 3 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [3, 7], [7, 7], [7, 3], [3, 3]]] },
      },
      { type: 'Feature', properties: { zone: 'y', v: 4 }, geometry: { type: 'MultiPolygon', coordinates: [[[[20, 0], [21, 0], [21, 1], [20, 0]]], [[[30, 0], [31, 0], [31, 1], [30, 0]]]] } },
      { type: 'Feature', properties: {}, geometry: null },
    ],
  };
  it('splits points, lines and polygons, one row per part', () => {
    const g = readGeoJSON(JSON.stringify(fc));
    expect(g.features).toBe(6);
    expect(g.points.count).toBe(3);
    expect(Array.from(g.points.feature)).toEqual([0, 1, 1]);
    expect(Array.from(g.points.columns.pop as Float64Array)).toEqual([10, NaN, NaN]);
    expect(g.points.categories.name.names).toEqual(['a', 'b']);
    expect(Array.from(g.lines.starts)).toEqual([0, 3]);
    expect(g.polygons.count).toBe(3);
    // The first polygon has two rings: the outline and its hole.
    expect(Array.from(g.polygons.rings)).toEqual([0, 5, 10, 14]);
    expect(Array.from(g.polygons.starts)).toEqual([0, 10, 14, 18]);
    expect(Array.from(g.polygons.columns.v as Float64Array)).toEqual([3, 4, 4]);
  });
  it('reads a bare geometry', () => {
    expect(readGeoJSON({ type: 'Point', coordinates: [1, 2] }).points.count).toBe(1);
  });
  it('finds coordinate columns by name', () => {
    expect(findCoordinates(['id', 'Longitude', 'LATITUDE'])).toEqual({ lng: 'Longitude', lat: 'LATITUDE' });
    expect(findCoordinates(['a', 'b'])).toEqual({ lng: undefined, lat: undefined });
  });
});
