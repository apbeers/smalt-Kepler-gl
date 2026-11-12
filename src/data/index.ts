/**
 * Data for the layers from the smalt family's databases:
 *
 * - **smaltdb** (SQL): `querySmaltdb` runs a query in columnar mode, so numeric columns arrive as Float64Arrays that
 *   go straight to the GPU; `loadSmaltdb` writes generated columns into a table.
 * - **smaltcy** (Cypher): `graphLayers` turns a result's nodes into points and its relationships and paths into arcs,
 *   placed by the nodes' longitude and latitude properties.
 *
 * Both take the database as a parameter and use only its public methods, so smaltgl itself depends on neither.
 */

/** Columns by name: numbers as typed arrays, anything else as plain arrays. */
export type ColumnData = Record<string, Float64Array | Float32Array | Uint32Array | unknown[]>;

export interface QueriedColumns {
  readonly count: number;
  readonly columns: ColumnData;
  /** Milliseconds the query took, measured here. */
  readonly ms: number;
}

/** What `querySmaltdb` needs from a smaltdb `Database` (smaltdb 0.8.3 and later). */
export interface SmaltdbLike {
  query(sql: string, params?: unknown, options?: { rowMode?: 'columnar' }): Promise<unknown>;
}

/**
 * Runs a SQL query on smaltdb and returns its columns: numeric columns without NULLs come back from the engine's
 * worker as Float64Arrays, handed over without copying.
 */
export async function querySmaltdb(db: SmaltdbLike, sql: string, params?: unknown): Promise<QueriedColumns> {
  const t0 = performance.now();
  const res = (await db.query(sql, params, { rowMode: 'columnar' })) as { columns: string[]; rowCount?: number; data: Record<string, Float64Array | unknown[]> };
  const ms = performance.now() - t0;
  const first = res.columns[0];
  const count = res.rowCount ?? (first ? res.data[first].length : 0);
  return { count, columns: res.data, ms };
}

/** A numeric column as a Float64Array (NULLs and non-numbers become NaN, which the layers skip). */
export function numeric(col: ArrayLike<unknown> | undefined): Float64Array {
  if (!col) return new Float64Array(0);
  if (col instanceof Float64Array) return col;
  const out = new Float64Array(col.length);
  for (let i = 0; i < col.length; i++) {
    const v = col[i];
    out[i] = typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : v === null || v === undefined ? NaN : Number(v);
  }
  return out;
}

/** What `loadSmaltdb` needs from a smaltdb `Database`. */
export interface SmaltdbWritable {
  exec(sql: string): Promise<unknown>;
  importCSV(table: string, source: string | Blob, options?: { create?: boolean; header?: boolean }): Promise<{ rows: number }>;
}

/**
 * Writes columns of numbers into a new smaltdb table (replacing one of that name), through smaltdb's CSV import:
 * one transaction, types inferred. Large tables are written in chunks of `chunkRows`.
 */
export async function loadSmaltdb(db: SmaltdbWritable, table: string, columns: Record<string, ArrayLike<number>>, chunkRows = 250_000): Promise<{ rows: number; ms: number }> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new Error(`Not a plain table name: ${table}`);
  const names = Object.keys(columns);
  for (const n of names) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) throw new Error(`Not a plain column name: ${n}`);
  const n = Math.min(...names.map((k) => columns[k].length));
  const t0 = performance.now();
  await db.exec(`DROP TABLE IF EXISTS ${table}`);
  // Integer-valued columns stay INTEGER; the rest REAL, with enough digits for coordinates.
  const ints = names.map((k) => {
    const c = columns[k];
    for (let i = 0; i < Math.min(c.length, 1000); i++) if (!Number.isInteger(c[i])) return false;
    return true;
  });
  await db.exec(`CREATE TABLE ${table} (${names.map((k, j) => `${k} ${ints[j] ? 'INTEGER' : 'REAL'}`).join(', ')})`);
  let rows = 0;
  for (let start = 0; start < n; start += chunkRows) {
    const end = Math.min(n, start + chunkRows);
    const lines: string[] = [names.join(',')];
    for (let i = start; i < end; i++) {
      let line = '';
      for (let j = 0; j < names.length; j++) {
        const v = columns[names[j]][i];
        if (j) line += ',';
        line += ints[j] ? String(v) : Number.isFinite(v) ? String(Math.round(v * 1e7) / 1e7) : '';
      }
      lines.push(line);
    }
    rows += (await db.importCSV(table, lines.join('\n'), { header: true })).rows;
  }
  return { rows, ms: performance.now() - t0 };
}

// ---------------------------------------------------------------------------------------------------------------------
// smaltcy

interface CyNode {
  readonly kind: 'node';
  readonly id: number;
  readonly labels: readonly string[];
  readonly properties: Readonly<Record<string, unknown>>;
}
interface CyRel {
  readonly kind: 'relationship';
  readonly id: number;
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly properties: Readonly<Record<string, unknown>>;
}
interface CyPath {
  readonly kind: 'path';
  readonly nodes: readonly CyNode[];
  readonly relationships: readonly CyRel[];
}

/** What `graphLayers` needs from a smaltcy `Graph`. */
export interface CypherLike {
  query(cypher: string, params?: Record<string, unknown>): Record<string, unknown>[];
}

/** A Cypher result as map data: nodes as points, relationships as arcs between their nodes. */
export interface GraphMapData {
  readonly nodes: {
    readonly count: number;
    readonly lng: Float64Array;
    readonly lat: Float64Array;
    /** The first label of each node, as a code into `labels`. */
    readonly label: Float32Array;
    readonly labels: readonly string[];
    readonly properties: Record<string, unknown[]>;
  };
  readonly edges: {
    readonly count: number;
    readonly sourceLng: Float64Array;
    readonly sourceLat: Float64Array;
    readonly targetLng: Float64Array;
    readonly targetLat: Float64Array;
    /** The relationship type, as a code into `types`. */
    readonly type: Float32Array;
    readonly types: readonly string[];
    readonly properties: Record<string, unknown[]>;
  };
  readonly ms: number;
}

/**
 * Runs Cypher on smaltcy and collects every node, relationship and path in the result. Nodes need longitude and
 * latitude properties (`lng` and `lat` by default); relationships are kept when both their nodes are in the result
 * (return paths, or both ends, to draw them).
 */
export function graphLayers(graph: CypherLike, cypher: string, params: Record<string, unknown> = {}, keys: { lng?: string; lat?: string } = {}): GraphMapData {
  const lngKey = keys.lng ?? 'lng', latKey = keys.lat ?? 'lat';
  const t0 = performance.now();
  const rows = graph.query(cypher, params);
  const ms = performance.now() - t0;
  const nodes = new Map<number, CyNode>();
  const rels = new Map<number, CyRel>();
  const visit = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const k = (v as { kind?: string }).kind;
    if (k === 'node') nodes.set((v as CyNode).id, v as CyNode);
    else if (k === 'relationship') rels.set((v as CyRel).id, v as CyRel);
    else if (k === 'path') {
      for (const n of (v as CyPath).nodes) nodes.set(n.id, n);
      for (const r of (v as CyPath).relationships) rels.set(r.id, r);
    }
  };
  for (const row of rows) for (const v of Object.values(row)) visit(v);

  const placed = [...nodes.values()].filter((n) => typeof n.properties[lngKey] === 'number' && typeof n.properties[latKey] === 'number');
  const at = new Map(placed.map((n) => [n.id, n]));
  const labels = [...new Set(placed.map((n) => n.labels[0] ?? ''))];
  const nodeProps: Record<string, unknown[]> = {};
  for (const n of placed) for (const key of Object.keys(n.properties)) nodeProps[key] ??= [];
  placed.forEach((n, i) => {
    for (const key of Object.keys(nodeProps)) nodeProps[key][i] = n.properties[key] ?? null;
  });
  const edges = [...rels.values()].filter((r) => at.has(r.start) && at.has(r.end));
  const types = [...new Set(edges.map((r) => r.type))];
  const relProps: Record<string, unknown[]> = { type: edges.map((r) => r.type) };
  for (const r of edges) for (const key of Object.keys(r.properties)) relProps[key] ??= [];
  edges.forEach((r, i) => {
    for (const key of Object.keys(relProps)) if (key !== 'type') relProps[key][i] = r.properties[key] ?? null;
  });
  return {
    nodes: {
      count: placed.length,
      lng: Float64Array.from(placed, (n) => n.properties[lngKey] as number),
      lat: Float64Array.from(placed, (n) => n.properties[latKey] as number),
      label: Float32Array.from(placed, (n) => labels.indexOf(n.labels[0] ?? '')),
      labels,
      properties: nodeProps,
    },
    edges: {
      count: edges.length,
      sourceLng: Float64Array.from(edges, (r) => at.get(r.start)!.properties[lngKey] as number),
      sourceLat: Float64Array.from(edges, (r) => at.get(r.start)!.properties[latKey] as number),
      targetLng: Float64Array.from(edges, (r) => at.get(r.end)!.properties[lngKey] as number),
      targetLat: Float64Array.from(edges, (r) => at.get(r.end)!.properties[latKey] as number),
      type: Float32Array.from(edges, (r) => types.indexOf(r.type)),
      types,
      properties: relProps,
    },
    ms,
  };
}

/** A generated supply chain (datasets `supplyChain`) as smaltcy's graph JSON, for `graph.load(...)`. */
export function supplyChainJSON(g: {
  readonly nodes: readonly { readonly id: number; readonly label: string; readonly name: string; readonly lng: number; readonly lat: number; readonly capacity: number }[];
  readonly edges: readonly { readonly from: number; readonly to: number; readonly type: string; readonly volume: number; readonly days: number }[];
}): { nodes: { id: number; labels: string[]; properties: Record<string, string | number> }[]; relationships: { start: number; end: number; type: string; properties: Record<string, number> }[] } {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, labels: [n.label], properties: { name: n.name, lng: n.lng, lat: n.lat, capacity: n.capacity } })),
    relationships: g.edges.map((e) => ({ start: e.from, end: e.to, type: e.type, properties: { volume: e.volume, days: e.days } })),
  };
}
